import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { prisma } from '@sonder/database';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class UsersService {
  list(organizationId: string) {
    return prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true, name: true, email: true, status: true, lastLoginAt: true, createdAt: true,
        roles: { include: { role: { select: { id: true, name: true, code: true } } } },
        professional: { select: { id: true, croNumber: true, croState: true } },
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

  async invite(organizationId: string, invitedById: string, input: {
    name: string; email: string; roleId: string; expiresInHours?: number;
  }) {
    const role = await prisma.role.findFirst({ where: { id: input.roleId, organizationId } });
    if (!role) throw new NotFoundException('Perfil não encontrado.');
    const token = randomBytes(24).toString('hex');
    const invitation = await prisma.userInvitation.create({
      data: {
        organizationId,
        email: input.email.toLowerCase(),
        name: input.name,
        roleId: input.roleId,
        tokenHash: hashToken(token),
        invitedById,
        expiresAt: new Date(Date.now() + (input.expiresInHours ?? 72) * 3600_000),
      },
    });
    return {
      id: invitation.id,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      inviteToken: token,
    };
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
