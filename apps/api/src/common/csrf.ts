import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const AUTH_PUBLIC_MUTATIONS = [
  '/auth/login',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/accept-invitation',
];

function allowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN?.trim()
    || process.env.WEB_URL?.trim()
    || 'http://localhost:3000';
  return raw.split(',').map((value) => value.trim().replace(/\/$/, '')).filter(Boolean);
}

function requestOrigin(request: Request): string | null {
  const origin = request.headers.origin?.trim();
  if (origin) return origin.replace(/\/$/, '');
  const referer = request.headers.referer?.trim();
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function isAllowedOrigin(request: Request): boolean {
  const origin = requestOrigin(request);
  if (!origin) return false;
  return allowedOrigins().some((entry) => entry === origin);
}

function tokensEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function cookieBase(): Pick<CookieOptions, 'secure' | 'sameSite'> {
  return {
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
  };
}

export function issueCsrfCookie(response: Response): string {
  const token = randomBytes(24).toString('base64url');
  response.cookie('csrf_token', token, {
    ...cookieBase(),
    httpOnly: false,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  return token;
}

function isAuthPublicMutation(path: string): boolean {
  return AUTH_PUBLIC_MUTATIONS.some((suffix) => path.endsWith(suffix));
}

/**
 * CSRF para mutações autenticadas por cookie:
 * - Origin/Referer ∈ CORS_ORIGIN / WEB_URL
 * - cookie csrf_token == header X-CSRF-Token
 *
 * Login/refresh públicos: Origin (obrigatório em produção).
 * Bearer / X-API-Key / sem cookie de sessão: liberados.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const method = request.method.toUpperCase();
    const isProd = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';

    if (SAFE_METHODS.has(method)) {
      if (!request.cookies?.csrf_token) issueCsrfCookie(response);
      return true;
    }

    const path = (request.originalUrl || request.url || '').split('?')[0] ?? '';
    const hasSessionCookie = Boolean(request.cookies?.access_token || request.cookies?.refresh_token);
    const hasBearer = Boolean(request.headers.authorization?.match(/^Bearer\s+/i));
    const hasApiKey = Boolean(request.headers['x-api-key']);

    if (isAuthPublicMutation(path)) {
      if (isProd && !isAllowedOrigin(request)) {
        throw new ForbiddenException('Origem da requisição não permitida.');
      }
      if (!request.cookies?.csrf_token) issueCsrfCookie(response);
      return true;
    }

    if (!hasSessionCookie || hasBearer || hasApiKey) {
      return true;
    }

    if (!isAllowedOrigin(request)) {
      throw new ForbiddenException('Origem da requisição não permitida.');
    }

    const cookieToken = String(request.cookies?.csrf_token ?? '');
    const headerToken = String(request.headers['x-csrf-token'] ?? '');
    if (!cookieToken || !headerToken || !tokensEqual(cookieToken, headerToken)) {
      throw new ForbiddenException('Token CSRF inválido ou ausente.');
    }
    return true;
  }
}
