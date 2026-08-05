import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { prisma } from '@sonder/database';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';

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
