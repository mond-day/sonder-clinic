import { ForbiddenException, SetMetadata, type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './auth.guard';

const PERMISSIONS_KEY = 'requiredPermissions';

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // Qualquer permissão listada autoriza (aliases aditivos durante migração RBAC).
    if (!required.some((permission) => request.auth.permissions.includes(permission))) {
      throw new ForbiddenException('Você não possui permissão para esta operação.');
    }
    return true;
  }
}
