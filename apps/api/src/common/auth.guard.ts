import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

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
      request.auth = {
        userId: payload.sub,
        organizationId: payload.organizationId,
        permissions: payload.permissions,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }
  }
}
