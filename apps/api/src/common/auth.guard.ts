import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { getCachedUserStatus } from './user-status-cache';

export interface AuthenticatedRequest extends Request {
  auth: {
    userId: string;
    organizationId: string;
    permissions: string[];
  };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    const token = bearer ?? request.cookies?.access_token;
    if (!token) throw new UnauthorizedException('Autenticação necessária.');

    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        organizationId: string;
        permissions: string[];
      }>(token);

      const status = await getCachedUserStatus(payload.sub);
      if (status !== 'ACTIVE') {
        throw new UnauthorizedException('Sessão inválida ou expirada.');
      }

      request.auth = {
        userId: payload.sub,
        organizationId: payload.organizationId,
        permissions: payload.permissions,
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }
  }
}
