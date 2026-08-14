import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiKeysService } from './api-keys.service';
import {
  extractApiKeyHeader,
  SlidingWindowThrottle,
  type ApiKeyScope,
} from './api-key.utils';

const SCOPES_KEY = 'requiredApiKeyScopes';

export const RequireScopes = (...scopes: ApiKeyScope[]) => SetMetadata(SCOPES_KEY, scopes);

export type PublicApiAuth = {
  apiKeyId: string;
  name: string;
  organizationId: string;
  organizationName: string;
  clinicId: string | null;
  clinicName: string | null;
  scopes: string[];
};

export type PublicApiRequest = Request & { publicAuth: PublicApiAuth };

const throttle = new SlidingWindowThrottle();

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly keys: ApiKeysService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PublicApiRequest>();
    const plaintext = extractApiKeyHeader(request.headers);
    if (!plaintext) {
      throw new UnauthorizedException('Informe a chave no header X-API-Key.');
    }

    const auth = await this.keys.authenticate(plaintext);
    const limit = throttle.consume(auth.apiKeyId);
    if (!limit.allowed) {
      throw new HttpException('Limite de 120 requisições por minuto nesta chave.', HttpStatus.TOO_MANY_REQUESTS);
    }
    request.publicAuth = auth;

    const required = this.reflector.getAllAndOverride<ApiKeyScope[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    if (!required.some((scope) => auth.scopes.includes(scope))) {
      throw new ForbiddenException(`Esta chave não possui o escopo necessário (${required.join(' ou ')}).`);
    }
    return true;
  }
}
