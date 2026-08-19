import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, INSTALLATION_SINGLETON_ID, installCoreDefaults, prisma } from '@sonder/database';
import * as argon2 from 'argon2';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { parseWithZod } from '../../common/zod-validation';
import { assertPasswordPolicy } from '../../common/password-policy';
import {
  classifySetupState,
  initializeSetupSchema,
  type InitializeSetupInput,
  type SetupStatus,
} from './setup.dto';

const SETUP_LOCK_KEY = 87_214_602;
const SETUP_ATTEMPT_MAX = 5;
const SETUP_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const setupAttempts = new Map<string, { count: number; resetAt: number }>();

export function setupTokensEqual(expected: string, provided: string): boolean {
  const left = createHash('sha256').update(expected).digest();
  const right = createHash('sha256').update(provided).digest();
  return timingSafeEqual(left, right);
}

export function consumeSetupAttempt(key: string, now = Date.now()): boolean {
  const current = setupAttempts.get(key);
  if (!current || now >= current.resetAt) {
    setupAttempts.set(key, { count: 1, resetAt: now + SETUP_ATTEMPT_WINDOW_MS });
    return true;
  }
  if (current.count >= SETUP_ATTEMPT_MAX) return false;
  current.count += 1;
  return true;
}

@Injectable()
export class SetupService {
  async getStatus(): Promise<SetupStatus> {
    const [installation, organizationCount, userCount] = await Promise.all([
      prisma.systemInstallation.findUnique({
        where: { id: INSTALLATION_SINGLETON_ID },
        select: { id: true },
      }),
      prisma.organization.count(),
      prisma.user.count(),
    ]);
    return classifySetupState({
      installationExists: Boolean(installation),
      organizationCount,
      userCount,
    });
  }

  async initialize(
    input: unknown,
    headerToken: string | undefined,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    if (!consumeSetupAttempt(meta?.ipAddress?.trim() || 'unknown')) {
      throw new HttpException('Muitas tentativas de setup. Aguarde alguns minutos.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const status = await this.getStatus();
    if (status.state === 'READY') {
      throw new ConflictException('Setup already completed.');
    }
    if (status.state === 'INCONSISTENT') {
      throw new ConflictException(
        'Instalação inconsistente: já existem organização ou usuários sem setup concluído. Recuperação manual necessária.',
      );
    }

    this.assertSetupToken(headerToken);
    const data = parseWithZod(initializeSetupSchema, input);
    assertPasswordPolicy(data.admin.password);

    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${SETUP_LOCK_KEY})`);
        return this.initializeLocked(tx, data, meta);
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30_000,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Setup already completed.');
      }
      throw error;
    }
  }

  private assertSetupToken(provided: string | undefined): void {
    const expected = process.env.INITIAL_SETUP_TOKEN?.trim() ?? '';
    if (!expected) {
      throw new ForbiddenException(
        'INITIAL_SETUP_TOKEN não configurado. Defina o secret/env antes do primeiro setup.',
      );
    }
    if (!provided || !setupTokensEqual(expected, provided)) {
      throw new UnauthorizedException('Token de setup inválido.');
    }
  }

  private async initializeLocked(
    tx: Prisma.TransactionClient,
    data: InitializeSetupInput,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    const existing = await tx.systemInstallation.findUnique({
      where: { id: INSTALLATION_SINGLETON_ID },
    });
    if (existing) throw new ConflictException('Setup already completed.');

    const [organizationCount, userCount] = await Promise.all([
      tx.organization.count(),
      tx.user.count(),
    ]);
    if (organizationCount > 0 || userCount > 0) {
      throw new ConflictException(
        'Instalação inconsistente: já existem organização ou usuários sem setup concluído. Recuperação manual necessária.',
      );
    }

    const organization = await tx.organization.create({
      data: {
        legalName: data.organization.legalName,
        tradeName: data.organization.tradeName,
        taxId: data.organization.taxId,
        timezone: data.unit.timezone ?? 'America/Cuiaba',
      },
    });
    const clinic = await tx.clinic.create({
      data: {
        organizationId: organization.id,
        legalName: data.clinic.legalName,
        tradeName: data.clinic.tradeName,
        taxId: data.clinic.taxId,
      },
    });
    const unit = await tx.unit.create({
      data: {
        clinicId: clinic.id,
        name: data.unit.name,
        city: data.unit.city,
        timezone: data.unit.timezone ?? 'America/Cuiaba',
      },
    });
    await tx.chair.create({
      data: { unitId: unit.id, name: 'Cadeira 1' },
    });

    const { adminRoleId } = await installCoreDefaults(tx, organization.id);
    const passwordHash = await argon2.hash(data.admin.password, { type: argon2.argon2id });
    const admin = await tx.user.create({
      data: {
        organizationId: organization.id,
        name: data.admin.name,
        email: data.admin.email.toLowerCase(),
        passwordHash,
        status: 'ACTIVE',
        roles: { create: { roleId: adminRoleId } },
      },
    });

    await tx.systemInstallation.create({
      data: {
        id: INSTALLATION_SINGLETON_ID,
        completedAt: new Date(),
        organizationId: organization.id,
        adminUserId: admin.id,
      },
    });

    await tx.auditEvent.create({
      data: {
        actorId: admin.id,
        action: 'setup.initialized',
        entity: 'SystemInstallation',
        entityId: INSTALLATION_SINGLETON_ID,
        clinicId: clinic.id,
        changes: {
          organizationId: organization.id,
          clinicId: clinic.id,
          unitId: unit.id,
          adminUserId: admin.id,
          adminEmail: admin.email,
        },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        correlationId: randomUUID(),
      },
    });

    return {
      required: false,
      state: 'READY' as const,
      organization: { id: organization.id, tradeName: organization.tradeName },
      clinic: { id: clinic.id, tradeName: clinic.tradeName },
      unit: { id: unit.id, name: unit.name },
      admin: { id: admin.id, name: admin.name, email: admin.email },
    };
  }
}
