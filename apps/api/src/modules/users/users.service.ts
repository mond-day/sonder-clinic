import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { prisma } from '@sonder/database';
import { assertSmtpConfigured, sendMail } from '../../common/mail';
import {
  buildInviteEmail,
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
  inviteExpiresAt,
} from './users-invitations.utils';

@Injectable()
export class UsersService {
  list(organizationId: string) {
    return prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true, name: true, email: true, status: true, lastLoginAt: true, createdAt: true,
        roles: { include: { role: { select: { id: true, name: true, code: true } } } },
        professional: { select: { id: true, croNumber: true, croState: true, professionalType: true, status: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(organizationId: string, id: string) {
    const user = await prisma.user.findFirst({
      where: { id, organizationId },
      select: {
        id: true, name: true, email: true, status: true, lastLoginAt: true, createdAt: true,
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        professional: true,
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  async create(organizationId: string, input: {
    name: string; email: string; password: string; roleIds?: string[];
  }) {
    const existing = await prisma.user.findFirst({
      where: { organizationId, email: input.email.toLowerCase() },
    });
    if (existing) throw new ConflictException('E-mail já cadastrado nesta organização.');
    return prisma.user.create({
      data: {
        organizationId,
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }),
        status: 'ACTIVE',
        ...(input.roleIds?.length
          ? { roles: { create: input.roleIds.map((roleId) => ({ roleId })) } }
          : {}),
      },
      select: { id: true, name: true, email: true, status: true },
    });
  }

  async update(organizationId: string, id: string, input: { name?: string; email?: string; status?: 'ACTIVE' | 'BLOCKED' | 'INVITED' }) {
    await this.get(organizationId, id);
    return prisma.user.update({
      where: { id },
      data: {
        name: input.name,
        email: input.email?.toLowerCase(),
        status: input.status,
      },
      select: { id: true, name: true, email: true, status: true },
    });
  }

  listInvitations(organizationId: string) {
    return prisma.userInvitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        email: true,
        name: true,
        roleId: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
        invitedById: true,
      },
    });
  }

  async invite(organizationId: string, invitedById: string, input: {
    name: string; email: string; roleId: string; expiresInHours?: number;
  }) {
    assertSmtpConfigured();
    const email = input.email.toLowerCase().trim();
    const role = await prisma.role.findFirst({ where: { id: input.roleId, organizationId } });
    if (!role) throw new NotFoundException('Perfil não encontrado.');
    const existingUser = await prisma.user.findFirst({ where: { organizationId, email } });
    if (existingUser) throw new ConflictException('Já existe um usuário com este e-mail.');
    const pending = await prisma.userInvitation.findFirst({
      where: { organizationId, email, status: 'PENDING', expiresAt: { gt: new Date() } },
    });
    if (pending) throw new ConflictException('Já existe um convite pendente para este e-mail.');

    const token = generateInviteToken();
    const expiresAt = inviteExpiresAt(input.expiresInHours ?? 72);
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { tradeName: true },
    });
    const invitation = await prisma.userInvitation.create({
      data: {
        organizationId,
        email,
        name: input.name.trim(),
        roleId: input.roleId,
        tokenHash: hashInviteToken(token),
        invitedById,
        expiresAt,
      },
    });
    const inviteUrl = buildInviteUrl(process.env.WEB_URL ?? 'http://localhost:3000', token);
    const mail = buildInviteEmail({
      name: invitation.name,
      organizationName: organization.tradeName,
      inviteUrl,
      expiresAt,
    });
    await sendMail({ to: invitation.email, subject: mail.subject, text: mail.text });
    return {
      id: invitation.id,
      email: invitation.email,
      name: invitation.name,
      expiresAt: invitation.expiresAt,
      emailed: true as const,
    };
  }

  async resendInvitation(organizationId: string, id: string) {
    assertSmtpConfigured();
    const invitation = await prisma.userInvitation.findFirst({ where: { id, organizationId } });
    if (!invitation) throw new NotFoundException('Convite não encontrado.');
    if (invitation.status !== 'PENDING') {
      throw new ConflictException('Somente convites pendentes podem ser reenviados.');
    }
    if (invitation.expiresAt <= new Date()) {
      await prisma.userInvitation.update({ where: { id }, data: { status: 'EXPIRED' } });
      throw new ConflictException('Convite expirado. Crie um novo convite.');
    }
    const token = generateInviteToken();
    const expiresAt = inviteExpiresAt(72);
    await prisma.userInvitation.update({
      where: { id },
      data: { tokenHash: hashInviteToken(token), expiresAt, status: 'PENDING' },
    });
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { tradeName: true },
    });
    const inviteUrl = buildInviteUrl(process.env.WEB_URL ?? 'http://localhost:3000', token);
    const mail = buildInviteEmail({
      name: invitation.name,
      organizationName: organization.tradeName,
      inviteUrl,
      expiresAt,
    });
    await sendMail({ to: invitation.email, subject: mail.subject, text: mail.text });
    return { id, email: invitation.email, expiresAt, emailed: true as const };
  }

  async revokeInvitation(organizationId: string, id: string) {
    const invitation = await prisma.userInvitation.findFirst({ where: { id, organizationId } });
    if (!invitation) throw new NotFoundException('Convite não encontrado.');
    if (invitation.status !== 'PENDING') {
      throw new ConflictException('Somente convites pendentes podem ser revogados.');
    }
    return prisma.userInvitation.update({
      where: { id },
      data: { status: 'REVOKED' },
      select: { id: true, email: true, status: true },
    });
  }

  listProfessionals(organizationId: string, clinicId?: string) {
    return prisma.professional.findMany({
      where: {
        user: { organizationId },
        ...(clinicId
          ? {
              clinicLinks: { some: { clinicId, active: true } },
            }
          : {}),
      },
      include: {
        user: { select: { id: true, email: true, name: true, status: true } },
        clinicLinks: { include: { clinic: { select: { id: true, tradeName: true } } } },
        unitLinks: { include: { unit: { select: { id: true, name: true, clinicId: true } } } },
        specialties: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async setProfessionalScope(
    organizationId: string,
    professionalId: string,
    input: {
      clinicIds?: string[];
      unitIds?: string[];
      specialties?: string[];
    },
  ) {
    const professional = await prisma.professional.findFirst({
      where: { id: professionalId, user: { organizationId } },
    });
    if (!professional) throw new NotFoundException('Profissional não encontrado.');

    if (input.clinicIds) {
      const clinics = await prisma.clinic.findMany({
        where: { organizationId, id: { in: input.clinicIds } },
        select: { id: true },
      });
      if (clinics.length !== input.clinicIds.length) {
        throw new BadRequestException('Uma ou mais clínicas são inválidas.');
      }
      await prisma.$transaction([
        prisma.professionalClinic.deleteMany({ where: { professionalId } }),
        ...input.clinicIds.map((clinicId) =>
          prisma.professionalClinic.create({
            data: { professionalId, clinicId, active: true },
          }),
        ),
      ]);
    }

    if (input.unitIds) {
      const units = await prisma.unit.findMany({
        where: { id: { in: input.unitIds }, clinic: { organizationId } },
        select: { id: true },
      });
      if (units.length !== input.unitIds.length) {
        throw new BadRequestException('Uma ou mais unidades são inválidas.');
      }
      await prisma.$transaction([
        prisma.professionalUnit.deleteMany({ where: { professionalId } }),
        ...input.unitIds.map((unitId) =>
          prisma.professionalUnit.create({
            data: { professionalId, unitId, active: true },
          }),
        ),
      ]);
    }

    if (input.specialties) {
      const specialties = [...new Set(input.specialties.map((item) => item.trim()).filter(Boolean))];
      await prisma.$transaction([
        prisma.professionalSpecialty.deleteMany({ where: { professionalId } }),
        ...specialties.map((specialty) =>
          prisma.professionalSpecialty.create({
            data: { professionalId, specialty },
          }),
        ),
      ]);
    }

    return this.listProfessionals(organizationId).then((rows) =>
      rows.find((row) => row.id === professionalId),
    );
  }

  async upsertProfessional(organizationId: string, input: {
    userId: string;
    name?: string;
    cpf?: string;
    croNumber?: string;
    croState?: string;
    professionalType?: string;
    status?: 'ACTIVE' | 'INACTIVE';
  }) {
    const user = await prisma.user.findFirst({
      where: { id: input.userId, organizationId },
      include: { professional: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    const data = {
      name: input.name?.trim() || user.name,
      cpf: input.cpf?.trim() || null,
      croNumber: input.croNumber?.trim() || null,
      croState: input.croState?.trim()?.toUpperCase() || null,
      professionalType: input.professionalType?.trim() || 'DENTIST',
      status: input.status ?? 'ACTIVE',
    } as const;
    if (user.professional) {
      return prisma.professional.update({
        where: { id: user.professional.id },
        data,
        include: { user: { select: { id: true, email: true, name: true, status: true } } },
      });
    }
    return prisma.professional.create({
      data: { userId: user.id, ...data },
      include: { user: { select: { id: true, email: true, name: true, status: true } } },
    });
  }

  async updateProfessional(organizationId: string, id: string, input: {
    name?: string;
    cpf?: string | null;
    croNumber?: string | null;
    croState?: string | null;
    professionalType?: string;
    status?: 'ACTIVE' | 'INACTIVE';
  }) {
    const professional = await prisma.professional.findFirst({
      where: { id, user: { organizationId } },
    });
    if (!professional) throw new NotFoundException('Profissional não encontrado.');
    return prisma.professional.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        cpf: input.cpf === undefined ? undefined : (input.cpf?.trim() || null),
        croNumber: input.croNumber === undefined ? undefined : (input.croNumber?.trim() || null),
        croState: input.croState === undefined ? undefined : (input.croState?.trim()?.toUpperCase() || null),
        professionalType: input.professionalType?.trim(),
        status: input.status,
      },
      include: { user: { select: { id: true, email: true, name: true, status: true } } },
    });
  }

  async block(organizationId: string, id: string) {
    return this.update(organizationId, id, { status: 'BLOCKED' });
  }

  async activate(organizationId: string, id: string) {
    return this.update(organizationId, id, { status: 'ACTIVE' });
  }

  listRoles(organizationId: string) {
    return prisma.role.findMany({
      where: { organizationId },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createRole(organizationId: string, input: { name: string; code: string; permissionCodes?: string[] }) {
    const role = await prisma.role.create({
      data: { organizationId, name: input.name, code: input.code.toUpperCase() },
    });
    if (input.permissionCodes?.length) {
      await this.setRolePermissions(organizationId, role.id, input.permissionCodes);
    }
    return this.getRole(organizationId, role.id);
  }

  async getRole(organizationId: string, id: string) {
    const role = await prisma.role.findFirst({
      where: { id, organizationId },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Perfil não encontrado.');
    return role;
  }

  async updateRole(organizationId: string, id: string, input: { name?: string; permissionCodes?: string[] }) {
    await this.getRole(organizationId, id);
    if (input.name) {
      await prisma.role.update({ where: { id }, data: { name: input.name } });
    }
    if (input.permissionCodes) {
      await this.setRolePermissions(organizationId, id, input.permissionCodes);
    }
    return this.getRole(organizationId, id);
  }

  async setRolePermissions(organizationId: string, roleId: string, permissionCodes: string[]) {
    await this.getRole(organizationId, roleId);
    const permissions = await prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
    if (permissions.length !== permissionCodes.length) {
      throw new BadRequestException('Uma ou mais permissões são inválidas.');
    }
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId } }),
      prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
        skipDuplicates: true,
      }),
    ]);
  }

  async assignRole(organizationId: string, userId: string, roleId: string) {
    await this.get(organizationId, userId);
    await this.getRole(organizationId, roleId);
    await prisma.userRole.create({ data: { userId, roleId } }).catch(() => {
      throw new ConflictException('Usuário já possui este perfil.');
    });
    return this.get(organizationId, userId);
  }

  async removeRole(organizationId: string, userId: string, roleId: string) {
    await this.get(organizationId, userId);
    await prisma.userRole.delete({ where: { userId_roleId: { userId, roleId } } });
    return this.get(organizationId, userId);
  }

  listPermissions() {
    return prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }
}
