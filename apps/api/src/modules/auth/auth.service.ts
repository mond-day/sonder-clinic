import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { prisma } from '@sonder/database';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { assertSmtpConfigured, sendMail, smtpConfigured } from '../../common/mail';
import { hashInviteToken } from '../users/users-invitations.utils';

type LoginResult = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; email: string; organizationId: string; permissions: string[] };
};

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  async login(email: string, password: string, userAgent?: string, ipAddress?: string): Promise<LoginResult> {
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), status: 'ACTIVE' },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const permissions = [...new Set(user.roles.flatMap(({ role }) =>
      role.permissions.map(({ permission }) => permission.code),
    ))];
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      organizationId: user.organizationId,
      permissions,
    });
    const refreshToken = randomBytes(48).toString('base64url');
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: this.hash(refreshToken),
        userAgent,
        ipAddress,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, organizationId: user.organizationId, permissions },
    };
  }

  async refresh(refreshToken: string): Promise<LoginResult> {
    const session = await prisma.session.findFirst({
      where: {
        refreshTokenHash: this.hash(refreshToken),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: { include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } },
      },
    });
    if (!session) throw new UnauthorizedException('Sessão inválida ou expirada.');

    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return this.issueForUser(session.user.id, session.userAgent ?? undefined, session.ipAddress ?? undefined);
  }

  async logout(refreshToken: string): Promise<void> {
    await prisma.session.updateMany({
      where: { refreshTokenHash: this.hash(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Solicita reset. Sem SMTP → erro claro. Com SMTP → e-mail enviado (não revela se o e-mail existe). */
  async requestPasswordReset(email: string): Promise<{ sent: true; smtpConfigured: true }> {
    assertSmtpConfigured();
    const normalized = email.toLowerCase().trim();
    const user = await prisma.user.findFirst({
      where: { email: normalized, status: 'ACTIVE' },
      select: { id: true, name: true, email: true },
    });
    if (user) {
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hash(token),
          expiresAt,
        },
      });
      const webUrl = (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
      const resetUrl = `${webUrl}/login?resetToken=${encodeURIComponent(token)}`;
      await sendMail({
        to: user.email,
        subject: 'Redefinição de senha — Sonder Clinic',
        text: [
          `Olá, ${user.name}.`,
          '',
          'Recebemos um pedido para redefinir sua senha no Sonder Clinic.',
          `Abra o link abaixo em até 1 hora:`,
          resetUrl,
          '',
          'Se você não solicitou, ignore este e-mail.',
        ].join('\n'),
      });
    }
    return { sent: true, smtpConfigured: true };
  }

  async resetPassword(token: string, password: string): Promise<{ success: true }> {
    if (password.length < 8) throw new BadRequestException('A senha deve ter ao menos 8 caracteres.');
    const tokenHash = this.hash(token);
    const row = await prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      include: { user: { select: { id: true, status: true } } },
    });
    if (!row || row.user.status !== 'ACTIVE') {
      throw new BadRequestException('Link de redefinição inválido ou expirado.');
    }
    const passwordHash = await argon2.hash(password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      prisma.session.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { success: true };
  }

  async getInvitation(token: string) {
    const invitation = await this.findPendingInvitation(token);
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: invitation.organizationId },
      select: { tradeName: true },
    });
    return {
      email: invitation.email,
      name: invitation.name,
      organizationName: organization.tradeName,
      expiresAt: invitation.expiresAt,
    };
  }

  async acceptInvitation(token: string, password: string): Promise<{ success: true; email: string }> {
    if (password.length < 8) throw new BadRequestException('A senha deve ter ao menos 8 caracteres.');
    const invitation = await this.findPendingInvitation(token);
    const existing = await prisma.user.findFirst({
      where: { organizationId: invitation.organizationId, email: invitation.email },
    });
    if (existing) throw new ConflictException('Usuário já cadastrado para este e-mail.');

    const role = await prisma.role.findFirst({
      where: { id: invitation.roleId, organizationId: invitation.organizationId },
    });
    if (!role) throw new BadRequestException('Perfil do convite não é mais válido.');

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          organizationId: invitation.organizationId,
          name: invitation.name,
          email: invitation.email,
          passwordHash,
          status: 'ACTIVE',
          roles: { create: { roleId: invitation.roleId } },
        },
      });
      await tx.userInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
    });
    return { success: true, email: invitation.email };
  }

  smtpStatus() {
    return { smtpConfigured: smtpConfigured() };
  }

  private async findPendingInvitation(token: string) {
    if (!token || token.length < 20) {
      throw new BadRequestException('Token de convite inválido.');
    }
    const invitation = await prisma.userInvitation.findFirst({
      where: { tokenHash: hashInviteToken(token) },
    });
    if (!invitation) throw new BadRequestException('Convite inválido ou expirado.');
    if (invitation.status === 'REVOKED') throw new BadRequestException('Convite revogado.');
    if (invitation.status === 'ACCEPTED') throw new ConflictException('Convite já foi aceito.');
    if (invitation.expiresAt <= new Date() || invitation.status === 'EXPIRED') {
      if (invitation.status === 'PENDING') {
        await prisma.userInvitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
      }
      throw new BadRequestException('Convite expirado.');
    }
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException('Convite indisponível.');
    }
    return invitation;
  }

  private async issueForUser(
    userId: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<LoginResult> {
    const refreshed = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    const permissions = [...new Set(refreshed.roles.flatMap(({ role }) =>
      role.permissions.map(({ permission }) => permission.code),
    ))];
    const accessToken = await this.jwt.signAsync({
      sub: refreshed.id,
      organizationId: refreshed.organizationId,
      permissions,
    });
    const nextRefresh = randomBytes(48).toString('base64url');
    await prisma.session.create({
      data: {
        userId: refreshed.id,
        refreshTokenHash: this.hash(nextRefresh),
        userAgent,
        ipAddress,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    return {
      accessToken,
      refreshToken: nextRefresh,
      user: {
        id: refreshed.id,
        name: refreshed.name,
        email: refreshed.email,
        organizationId: refreshed.organizationId,
        permissions,
      },
    };
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
