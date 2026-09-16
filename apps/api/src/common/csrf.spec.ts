import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { exposeCsrfHeader, isAllowedOrigin, issueCsrfCookie } from './csrf';

describe('csrf helpers', () => {
  it('issueCsrfCookie grava cookie e header X-CSRF-Token', () => {
    const headers: Record<string, string> = {};
    const cookies: Array<{ name: string; value: string }> = [];
    const response = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      cookie(name: string, value: string) {
        cookies.push({ name, value });
      },
    } as unknown as Response;

    const token = issueCsrfCookie(response);

    expect(token.length).toBeGreaterThan(10);
    expect(cookies).toEqual([{ name: 'csrf_token', value: token }]);
    expect(headers['X-CSRF-Token']).toBe(token);
  });

  it('exposeCsrfHeader define o header sem alterar cookie', () => {
    const headers: Record<string, string> = {};
    const response = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    } as unknown as Response;

    exposeCsrfHeader(response, 'abc123');
    expect(headers['X-CSRF-Token']).toBe('abc123');
  });

  it('isAllowedOrigin compara Origin com CORS_ORIGIN', () => {
    const previous = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = 'https://app.example.com';
    try {
      expect(isAllowedOrigin({
        headers: { origin: 'https://evil.example.com' },
      } as unknown as Request)).toBe(false);
      expect(isAllowedOrigin({
        headers: { origin: 'https://app.example.com' },
      } as unknown as Request)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.CORS_ORIGIN;
      else process.env.CORS_ORIGIN = previous;
    }
  });
});
