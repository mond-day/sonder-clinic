import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@sonder/database';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { parseWithZod } from '../../common/zod-validation';

const medicationSchema = z.object({
  name: z.string().trim().min(2).max(200),
  activeIngredient: z.string().trim().max(200).optional().nullable(),
  concentration: z.string().trim().max(80).optional().nullable(),
  pharmaceuticalForm: z.string().trim().max(80).optional().nullable(),
  defaultRoute: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  active: z.boolean().optional(),
});

const examSchema = z.object({
  name: z.string().trim().min(2).max(200),
  category: z.enum(['IMAGING', 'LAB', 'PHOTO', 'OTHER']).default('IMAGING'),
  lateralityBehavior: z.enum(['OPTIONAL', 'REQUIRED', 'NOT_APPLICABLE']).optional().nullable(),
  defaultInstructions: z.string().trim().max(2000).optional().nullable(),
  active: z.boolean().optional(),
});

const DEFAULT_EXAMS = [
  { name: 'Radiografia panorâmica', category: 'IMAGING', lateralityBehavior: 'NOT_APPLICABLE' },
  { name: 'Radiografia periapical', category: 'IMAGING', lateralityBehavior: 'REQUIRED' },
  { name: 'Interproximal', category: 'IMAGING', lateralityBehavior: 'OPTIONAL' },
  { name: 'Tomografia Cone Beam', category: 'IMAGING', lateralityBehavior: 'OPTIONAL' },
  { name: 'Telerradiografia', category: 'IMAGING', lateralityBehavior: 'NOT_APPLICABLE' },
  { name: 'Fotografias clínicas', category: 'PHOTO', lateralityBehavior: 'OPTIONAL' },
] as const;

@Injectable()
export class CatalogsService {
  private async audit(
    actorId: string | undefined,
    action: string,
    entity: string,
    entityId: string,
    changes: Record<string, unknown>,
  ) {
    await prisma.auditEvent.create({
      data: {
        actorId,
        action,
        entity,
        entityId,
        changes: changes as object,
        correlationId: randomUUID(),
      },
    });
  }

  async ensureDefaultExams(organizationId: string) {
    const existing = await prisma.examCatalogItem.findMany({
      where: { organizationId },
      select: { name: true },
    });
    const names = new Set(existing.map((item) => item.name));
    const missing = DEFAULT_EXAMS.filter((item) => !names.has(item.name));
    if (!missing.length) return;
    await prisma.examCatalogItem.createMany({
      data: missing.map((item) => ({
        organizationId,
        name: item.name,
        category: item.category,
        lateralityBehavior: item.lateralityBehavior,
        active: true,
      })),
    });
  }

  async listMedications(organizationId: string, q?: string, includeInactive = false) {
    return prisma.medicationCatalogItem.findMany({
      where: {
        organizationId,
        active: includeInactive ? undefined : true,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { activeIngredient: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      take: 200,
    });
  }

  async createMedication(organizationId: string, actorId: string, input: unknown) {
    const data = parseWithZod(medicationSchema, input);
    const created = await prisma.medicationCatalogItem.create({
      data: {
        organizationId,
        name: data.name,
        activeIngredient: data.activeIngredient || null,
        concentration: data.concentration || null,
        pharmaceuticalForm: data.pharmaceuticalForm || null,
        defaultRoute: data.defaultRoute || null,
        notes: data.notes || null,
        active: data.active ?? true,
      },
    });
    await this.audit(actorId, 'medication.created', 'MedicationCatalogItem', created.id, {
      name: created.name,
      active: created.active,
    });
    return created;
  }

  async updateMedication(organizationId: string, actorId: string, id: string, input: unknown) {
    const existing = await prisma.medicationCatalogItem.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Medicamento não encontrado.');
    const data = parseWithZod(medicationSchema.partial(), input);
    if (!Object.keys(data).length) throw new BadRequestException('Nenhum campo para atualizar.');
    const updated = await prisma.medicationCatalogItem.update({
      where: { id },
      data: {
        name: data.name,
        activeIngredient: data.activeIngredient === undefined ? undefined : data.activeIngredient || null,
        concentration: data.concentration === undefined ? undefined : data.concentration || null,
        pharmaceuticalForm: data.pharmaceuticalForm === undefined ? undefined : data.pharmaceuticalForm || null,
        defaultRoute: data.defaultRoute === undefined ? undefined : data.defaultRoute || null,
        notes: data.notes === undefined ? undefined : data.notes || null,
        active: data.active,
      },
    });
    await this.audit(
      actorId,
      data.active === false ? 'medication.deactivated' : 'medication.updated',
      'MedicationCatalogItem',
      id,
      { before: { name: existing.name, active: existing.active }, after: { name: updated.name, active: updated.active } },
    );
    return updated;
  }

  async listExams(organizationId: string, q?: string, includeInactive = false) {
    await this.ensureDefaultExams(organizationId);
    return prisma.examCatalogItem.findMany({
      where: {
        organizationId,
        active: includeInactive ? undefined : true,
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      take: 200,
    });
  }

  async createExam(organizationId: string, actorId: string, input: unknown) {
    const data = parseWithZod(examSchema, input);
    const created = await prisma.examCatalogItem.create({
      data: {
        organizationId,
        name: data.name,
        category: data.category,
        lateralityBehavior: data.lateralityBehavior || 'OPTIONAL',
        defaultInstructions: data.defaultInstructions || null,
        active: data.active ?? true,
      },
    });
    await this.audit(actorId, 'exam_catalog.created', 'ExamCatalogItem', created.id, {
      name: created.name,
      category: created.category,
      active: created.active,
    });
    return created;
  }

  async updateExam(organizationId: string, actorId: string, id: string, input: unknown) {
    const existing = await prisma.examCatalogItem.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Tipo de exame não encontrado.');
    const data = parseWithZod(examSchema.partial(), input);
    if (!Object.keys(data).length) throw new BadRequestException('Nenhum campo para atualizar.');
    const updated = await prisma.examCatalogItem.update({
      where: { id },
      data: {
        name: data.name,
        category: data.category,
        lateralityBehavior: data.lateralityBehavior === undefined ? undefined : data.lateralityBehavior || null,
        defaultInstructions: data.defaultInstructions === undefined ? undefined : data.defaultInstructions || null,
        active: data.active,
      },
    });
    await this.audit(
      actorId,
      data.active === false ? 'exam_catalog.deactivated' : 'exam_catalog.updated',
      'ExamCatalogItem',
      id,
      { before: { name: existing.name, active: existing.active }, after: { name: updated.name, active: updated.active } },
    );
    return updated;
  }
}
