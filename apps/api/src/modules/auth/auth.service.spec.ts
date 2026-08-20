import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const {
  sessionUpdateMany,
  sessionFindFirst,
  sessionCreate,
  passwordResetUpdateMany,
  passwordResetFindFirst,
  userUpdate,
} = vi.hoisted(() => ({
  sessionUpdateMany: vi.fn(),
  sessionFindFirst: vi.fn(),
  sessionCreate: vi.fn(),
  passwordResetUpdateMany: vi.fn(),
  passwordResetFindFirst: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock('@sonder/database', () => ({
  Prisma: {},
  prisma: {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        session: {
          updateMany: sessionUpdateMany,
          findFirst: sessionFindFirst,
          create: sessionCreate,
        },
        passwordResetToken: {
          updateMany: passwordResetUpdateMany,
          findFirst: passwordResetFindFirst,
        },
        user: { update: userUpdate },
      };
      return fn(tx);
    }),
  },
}));

vi.mock('argon2', () => ({
  hash: vi.fn(async () => 'hashed-password'),
  verify: vi.fn(),
  argon2id: 2,
}));

vi.mock('../../common/password-policy', () => ({
  assertPasswordPolicy: vi.fn(),
}));

import { AuthService } from './auth.service';

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('AuthService claims atômicos', () => {
  const jwt = { signAsync: vi.fn(async () => 'access-token') };
  let service: AuthService;

  const activeUser = {
    id: 'user-1',
    name: 'Ana',
    email: 'ana@example.com',
    organizationId: 'org-1',
    status: 'ACTIVE',
    roles: [{ role: { permissions: [{ permission: { code: 'patients.view' } }] } }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService(jwt as never);
    sessionCreate.mockResolvedValue({});
    userUpdate.mockResolvedValue({});
  });

  it('refresh: Promise.all do mesmo token — um ok, outro 401', async () => {
    let claimed = false;
    sessionUpdateMany.mockImplementation(async () => {
      if (!claimed) {
        claimed = true;
        return { count: 1 };
      }
      return { count: 0 };
    });
    sessionFindFirst.mockResolvedValue({
      refreshTokenHash: hash('refresh-token'),
      revokedAt: new Date(),
      userAgent: null,
      ipAddress: null,
      user: activeUser,
    });

    const results = await Promise.allSettled([
      service.refresh('refresh-token'),
      service.refresh('refresh-token'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((fulfilled[0] as PromiseFulfilledResult<{ refreshToken: string }>).value.refreshToken).toBeTruthy();
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(UnauthorizedException);
    expect(sessionCreate).toHaveBeenCalledTimes(1);
  });

  it('resetPassword: dois resets simultâneos — só um vence', async () => {
    let claimed = false;
    passwordResetUpdateMany.mockImplementation(async () => {
      if (!claimed) {
        claimed = true;
        return { count: 1 };
      }
      return { count: 0 };
    });
    passwordResetFindFirst.mockResolvedValue({
      userId: 'user-1',
      user: { id: 'user-1', status: 'ACTIVE' },
    });

    const results = await Promise.allSettled([
      service.resetPassword('reset-token-abcdefghijklmnop', 'SenhaForte1!'),
      service.resetPassword('reset-token-abcdefghijklmnop', 'SenhaForte1!'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BadRequestException);
    expect(userUpdate).toHaveBeenCalledTimes(1);
  });
});
