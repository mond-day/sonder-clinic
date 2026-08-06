import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { adultAnamnesisV1 } from './adult-v1';
import { childAnamnesisV1 } from './child-v1';
import { elderlyAnamnesisV1 } from './elderly-v1';
import { pregnantAnamnesisV1 } from './pregnant-v1';
import { countQuestions } from './builder';

const catalogs = [
  { name: 'Anamnese adulto', audience: 'ADULT', schema: adultAnamnesisV1, expected: 42 },
  { name: 'Anamnese infantil', audience: 'CHILD', schema: childAnamnesisV1, expected: 48 },
  { name: 'Anamnese idoso', audience: 'ELDERLY', schema: elderlyAnamnesisV1, expected: 45 },
  { name: 'Anamnese gestante', audience: 'PREGNANT', schema: pregnantAnamnesisV1, expected: 38 },
] as const;

export async function seedAnamnesisCatalogs(prisma: PrismaClient, organizationId: string) {
  for (const catalog of catalogs) {
    const questionCount = countQuestions(catalog.schema);
    if (questionCount !== catalog.expected) {
      throw new Error(`Catálogo ${catalog.name}: esperado ${catalog.expected} perguntas, obtido ${questionCount}.`);
    }
    const schemaHash = createHash('sha256').update(JSON.stringify(catalog.schema)).digest('hex').slice(0, 12);
    const existing = await prisma.anamnesisTemplate.findUnique({
      where: {
        organizationId_name_version: {
          organizationId,
          name: catalog.name,
          version: 1,
        },
      },
    });
    if (existing?.isSystemDefault === false && existing.status === 'PUBLISHED') {
      console.info(`[anamnesis] preservando personalização de ${catalog.name} v1`);
      continue;
    }
    await prisma.anamnesisTemplate.upsert({
      where: {
        organizationId_name_version: {
          organizationId,
          name: catalog.name,
          version: 1,
        },
      },
      update: {
        schemaJson: catalog.schema,
        audience: catalog.audience,
        status: 'PUBLISHED',
        isSystemDefault: true,
        active: true,
        publishedAt: existing?.publishedAt ?? new Date(),
        description: `Modelo padrão ${catalog.audience.toLowerCase()} (${questionCount} perguntas)`,
      },
      create: {
        organizationId,
        name: catalog.name,
        description: `Modelo padrão ${catalog.audience.toLowerCase()} (${questionCount} perguntas)`,
        audience: catalog.audience,
        version: 1,
        status: 'PUBLISHED',
        schemaJson: catalog.schema,
        validityMonths: 6,
        isSystemDefault: true,
        publishedAt: new Date(),
        active: true,
      },
    });
    console.info(`[anamnesis] ${catalog.name} v1 — ${questionCount} perguntas — hash ${schemaHash}`);
  }
}
