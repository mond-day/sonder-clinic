import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { prisma } from '@sonder/database';
import { parseWithZod } from '../../common/zod-validation';
import { z } from 'zod';
import {
  API_KEY_MAX_PER_ORGANIZATION,
  API_KEY_SCOPES,
  decryptApiKeySecret,
  encryptApiKeySecret,
  generateApiKey,
  hashApiKey,
  maskApiKey,
  normalizeApiKeyScopes,
  type ApiKeyScope,
} from './api-key.utils';

const createKeySchema = z.object({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(z.string()).min(1).max(API_KEY_SCOPES.length),
  clinicId: z.string().uuid().optional(),
  expiresAt: z.string().datetime().optional(),
});

export type CreateApiKeyInput = {
  name: string;
  scopes: string[];
  clinicId?: string;
  expiresAt?: string;
};

@Injectable()
export class ApiKeysService {
  async list(organizationId: string) {
    const keys = await prisma.apiKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        keyLastFour: true,
        encryptedSecret: true,
        scopes: true,
        clinicId: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        clinic: { select: { id: true, tradeName: true } },
      },
    });
    return keys.map((key) => this.toPublic(key));
  }

  async create(organizationId: string, actorId: string, input: CreateApiKeyInput) {
    const data = parseWithZod(createKeySchema, input);
    let scopes: ApiKeyScope[];
    try {
      scopes = normalizeApiKeyScopes(data.scopes);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Escopos inválidos.');
    }

    if (data.clinicId) {
      const clinic = await prisma.clinic.findFirst({
        where: { id: data.clinicId, organizationId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!clinic) throw new NotFoundException('Clínica inválida ou inativa.');
    }

    const activeCount = await prisma.apiKey.count({
      where: { organizationId, revokedAt: null },
    });
    if (activeCount >= API_KEY_MAX_PER_ORGANIZATION) {
      throw new BadRequestException(`Limite de ${API_KEY_MAX_PER_ORGANIZATION} chaves ativas por organização.`);
    }

    const generated = generateApiKey();
    let encryptedSecret: string;
    try {
      encryptedSecret = encryptApiKeySecret(generated.plaintext);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'ENCRYPTION_MASTER_KEY inválida.');
    }
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('A data de expiração deve ser futura.');
    }

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.apiKey.create({
        data: {
          organizationId,
          clinicId: data.clinicId,
          name: data.name,
          keyPrefix: generated.keyPrefix,
          keyLastFour: generated.keyLastFour,
          keyHash: generated.keyHash,
          encryptedSecret,
          scopes,
          createdById: actorId,
          expiresAt,
        },
        include: { clinic: { select: { id: true, tradeName: true } } },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'api_key.created',
          entity: 'ApiKey',
          entityId: row.id,
          clinicId: data.clinicId,
          changes: { name: row.name, scopes, clinicId: data.clinicId ?? null },
          correlationId: randomUUID(),
        },
      });
      return row;
    });

    return {
      ...this.toPublic(created),
      plaintext: generated.plaintext,
    };
  }

  async revoke(organizationId: string, actorId: string, id: string) {
    const existing = await prisma.apiKey.findFirst({
      where: { id, organizationId },
      select: { id: true, revokedAt: true, clinicId: true, name: true },
    });
    if (!existing) throw new NotFoundException('Chave de API não encontrada.');
    if (existing.revokedAt) {
      return this.findMasked(organizationId, id);
    }

    await prisma.$transaction(async (tx) => {
      await tx.apiKey.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'api_key.revoked',
          entity: 'ApiKey',
          entityId: id,
          clinicId: existing.clinicId,
          changes: { name: existing.name },
          correlationId: randomUUID(),
        },
      });
    });
    return this.findMasked(organizationId, id);
  }

  async reveal(organizationId: string, actorId: string, id: string) {
    const existing = await prisma.apiKey.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        name: true,
        clinicId: true,
        revokedAt: true,
        expiresAt: true,
        encryptedSecret: true,
        keyPrefix: true,
        keyLastFour: true,
      },
    });
    if (!existing) throw new NotFoundException('Chave de API não encontrada.');
    if (existing.revokedAt) {
      throw new BadRequestException('Esta chave foi revogada e não pode ser reexibida.');
    }
    if (existing.expiresAt && existing.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Esta chave expirou e não pode ser reexibida.');
    }
    if (!existing.encryptedSecret) {
      throw new BadRequestException('Não é possível reexibir esta chave. Ela foi criada só com hash; gere outra.');
    }

    let plaintext: string;
    try {
      plaintext = decryptApiKeySecret(existing.encryptedSecret);
    } catch {
      throw new BadRequestException('Não foi possível descriptografar a chave. Gere outra.');
    }

    await prisma.auditEvent.create({
      data: {
        actorId,
        action: 'api_key.revealed',
        entity: 'ApiKey',
        entityId: existing.id,
        clinicId: existing.clinicId,
        changes: { name: existing.name },
        correlationId: randomUUID(),
      },
    });

    return {
      id: existing.id,
      name: existing.name,
      maskedKey: maskApiKey(existing.keyPrefix, existing.keyLastFour),
      plaintext,
    };
  }

  async authenticate(plaintext: string) {
    const keyHash = hashApiKey(plaintext);
    const key = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        organization: { select: { id: true, status: true, tradeName: true } },
        clinic: { select: { id: true, status: true, tradeName: true, organizationId: true } },
      },
    });
    if (!key || key.revokedAt) {
      throw new UnauthorizedException('Chave de API inválida ou revogada.');
    }
    if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Chave de API expirada.');
    }
    if (key.organization.status !== 'ACTIVE') {
      throw new ForbiddenException('Organização inativa.');
    }
    if (key.clinicId && key.clinic?.status !== 'ACTIVE') {
      throw new ForbiddenException('Clínica vinculada à chave está inativa.');
    }

    void prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => undefined);

    return {
      apiKeyId: key.id,
      name: key.name,
      organizationId: key.organizationId,
      organizationName: key.organization.tradeName,
      clinicId: key.clinicId,
      clinicName: key.clinic?.tradeName ?? null,
      scopes: key.scopes,
    };
  }

  private async findMasked(organizationId: string, id: string) {
    const key = await prisma.apiKey.findFirst({
      where: { id, organizationId },
      include: { clinic: { select: { id: true, tradeName: true } } },
    });
    if (!key) throw new NotFoundException('Chave de API não encontrada.');
    return this.toPublic(key);
  }

  private toPublic(key: {
    id: string;
    name: string;
    keyPrefix: string;
    keyLastFour: string;
    encryptedSecret?: string | null;
    scopes: string[];
    clinicId: string | null;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    clinic?: { id: string; tradeName: string } | null;
  }) {
    return {
      id: key.id,
      name: key.name,
      maskedKey: maskApiKey(key.keyPrefix, key.keyLastFour),
      scopes: key.scopes,
      clinicId: key.clinicId,
      clinicName: key.clinic?.tradeName ?? null,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      revokedAt: key.revokedAt,
      createdAt: key.createdAt,
      revealable: Boolean(key.encryptedSecret) && !key.revokedAt,
      status: key.revokedAt ? 'REVOKED' : key.expiresAt && key.expiresAt.getTime() <= Date.now() ? 'EXPIRED' : 'ACTIVE',
    };
  }
}
