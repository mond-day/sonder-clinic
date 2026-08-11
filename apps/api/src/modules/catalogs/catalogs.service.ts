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
  { name: 'Interproximal (bite-wing)', category: 'IMAGING', lateralityBehavior: 'OPTIONAL' },
  { name: 'Tomografia Cone Beam (CBCT)', category: 'IMAGING', lateralityBehavior: 'OPTIONAL' },
  { name: 'Telerradiografia lateral', category: 'IMAGING', lateralityBehavior: 'NOT_APPLICABLE' },
  { name: 'Telerradiografia frontal (PA)', category: 'IMAGING', lateralityBehavior: 'NOT_APPLICABLE' },
  { name: 'Radiografia oclusal', category: 'IMAGING', lateralityBehavior: 'OPTIONAL' },
  { name: 'Radiografia de ATM', category: 'IMAGING', lateralityBehavior: 'OPTIONAL' },
  { name: 'Cefalometria', category: 'IMAGING', lateralityBehavior: 'NOT_APPLICABLE' },
  { name: 'Fotografias clínicas', category: 'PHOTO', lateralityBehavior: 'OPTIONAL' },
  { name: 'Fotografia intraoral', category: 'PHOTO', lateralityBehavior: 'OPTIONAL' },
  { name: 'Fotografia extraoral', category: 'PHOTO', lateralityBehavior: 'NOT_APPLICABLE' },
  { name: 'Escaneamento intraoral', category: 'OTHER', lateralityBehavior: 'NOT_APPLICABLE' },
  { name: 'Hemograma completo', category: 'LAB', lateralityBehavior: 'NOT_APPLICABLE' },
  { name: 'Coagulograma', category: 'LAB', lateralityBehavior: 'NOT_APPLICABLE' },
  { name: 'Glicemia', category: 'LAB', lateralityBehavior: 'NOT_APPLICABLE' },
] as const;

/** Base odontológica comum — instalada na 1ª listagem do catálogo (como exames). */
const DEFAULT_MEDICATIONS = [
  { name: 'Amoxicilina', activeIngredient: 'Amoxicilina', concentration: '500 mg', pharmaceuticalForm: 'Cápsula', defaultRoute: 'Oral' },
  { name: 'Amoxicilina + Clavulanato', activeIngredient: 'Amoxicilina + ácido clavulânico', concentration: '875/125 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral' },
  { name: 'Azitromicina', activeIngredient: 'Azitromicina', concentration: '500 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral' },
  { name: 'Clindamicina', activeIngredient: 'Clindamicina', concentration: '300 mg', pharmaceuticalForm: 'Cápsula', defaultRoute: 'Oral' },
  { name: 'Cefalexina', activeIngredient: 'Cefalexina', concentration: '500 mg', pharmaceuticalForm: 'Cápsula', defaultRoute: 'Oral' },
  { name: 'Metronidazol', activeIngredient: 'Metronidazol', concentration: '250 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral' },
  { name: 'Dipirona', activeIngredient: 'Dipirona sódica', concentration: '500 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral' },
  { name: 'Paracetamol', activeIngredient: 'Paracetamol', concentration: '750 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral' },
  { name: 'Ibuprofeno', activeIngredient: 'Ibuprofeno', concentration: '600 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral' },
  { name: 'Nimesulida', activeIngredient: 'Nimesulida', concentration: '100 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral' },
  { name: 'Cetoprofeno', activeIngredient: 'Cetoprofeno', concentration: '100 mg', pharmaceuticalForm: 'Cápsula', defaultRoute: 'Oral' },
  { name: 'Diclofenaco potássico', activeIngredient: 'Diclofenaco potássico', concentration: '50 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral' },
  { name: 'Dexametasona', activeIngredient: 'Dexametasona', concentration: '4 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral' },
  { name: 'Prednisona', activeIngredient: 'Prednisona', concentration: '20 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral' },
  { name: 'Dexametasona injetável', activeIngredient: 'Dexametasona', concentration: '4 mg/mL', pharmaceuticalForm: 'Ampola', defaultRoute: 'IM' },
  { name: 'Lidocaína 2% com epinefrina 1:100.000', activeIngredient: 'Lidocaína + epinefrina', concentration: '2%', pharmaceuticalForm: 'Tubete', defaultRoute: 'Infiltrativa' },
  { name: 'Mepivacaína 2% com epinefrina 1:100.000', activeIngredient: 'Mepivacaína + epinefrina', concentration: '2%', pharmaceuticalForm: 'Tubete', defaultRoute: 'Infiltrativa' },
  { name: 'Articaína 4% com epinefrina 1:100.000', activeIngredient: 'Articaína + epinefrina', concentration: '4%', pharmaceuticalForm: 'Tubete', defaultRoute: 'Infiltrativa' },
  { name: 'Prilocaína 3% com felipressina', activeIngredient: 'Prilocaína + felipressina', concentration: '3%', pharmaceuticalForm: 'Tubete', defaultRoute: 'Infiltrativa' },
  { name: 'Clorexidina 0,12%', activeIngredient: 'Digluconato de clorexidina', concentration: '0,12%', pharmaceuticalForm: 'Solução', defaultRoute: 'Bucal' },
  { name: 'Nistatina suspensão', activeIngredient: 'Nistatina', concentration: '100.000 UI/mL', pharmaceuticalForm: 'Suspensão', defaultRoute: 'Bucal' },
  { name: 'Miconazol gel oral', activeIngredient: 'Miconazol', concentration: '2%', pharmaceuticalForm: 'Gel', defaultRoute: 'Bucal' },
  { name: 'Triancinolona acetonida pasta', activeIngredient: 'Triancinolona acetonida', concentration: '0,1%', pharmaceuticalForm: 'Pasta', defaultRoute: 'Tópica oral' },
  { name: 'Ácido acetilsalicílico', activeIngredient: 'AAS', concentration: '100 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral', notes: 'Uso sob orientação; avaliar risco hemorrágico.' },
  { name: 'Omeprazol', activeIngredient: 'Omeprazol', concentration: '20 mg', pharmaceuticalForm: 'Cápsula', defaultRoute: 'Oral' },
  { name: 'Ondansetrona', activeIngredient: 'Ondansetrona', concentration: '8 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral' },
  { name: 'Diazepam', activeIngredient: 'Diazepam', concentration: '5 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral', notes: 'Controlado — conforme legislação.' },
  { name: 'Midazolam', activeIngredient: 'Midazolam', concentration: '7,5 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral', notes: 'Sedação consciente — protocolo clínico.' },
  { name: 'Fluoreto de sódio gel', activeIngredient: 'Fluoreto de sódio', concentration: '2%', pharmaceuticalForm: 'Gel', defaultRoute: 'Tópica' },
  { name: 'Peróxido de carbamida', activeIngredient: 'Peróxido de carbamida', concentration: '10%', pharmaceuticalForm: 'Gel', defaultRoute: 'Tópica', notes: 'Clareamento supervisionado.' },
  { name: 'Hidróxido de cálcio pasta', activeIngredient: 'Hidróxido de cálcio', concentration: '—', pharmaceuticalForm: 'Pasta', defaultRoute: 'Endodôntica' },
  { name: 'Hipoclorito de sódio', activeIngredient: 'Hipoclorito de sódio', concentration: '2,5%', pharmaceuticalForm: 'Solução', defaultRoute: 'Endodôntica' },
  { name: 'EDTA 17%', activeIngredient: 'EDTA', concentration: '17%', pharmaceuticalForm: 'Solução', defaultRoute: 'Endodôntica' },
  { name: 'Cloreto de sódio 0,9%', activeIngredient: 'NaCl', concentration: '0,9%', pharmaceuticalForm: 'Solução', defaultRoute: 'Irrigação' },
  { name: 'Água oxigenada 10 volumes', activeIngredient: 'Peróxido de hidrogênio', concentration: '3%', pharmaceuticalForm: 'Solução', defaultRoute: 'Tópica' },
  { name: 'Tranexâmico', activeIngredient: 'Ácido tranexâmico', concentration: '250 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral' },
  { name: 'Codeína + Paracetamol', activeIngredient: 'Fosfato de codeína + paracetamol', concentration: '30/500 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral', notes: 'Controlado — conforme legislação.' },
  { name: 'Tramadol', activeIngredient: 'Tramadol', concentration: '50 mg', pharmaceuticalForm: 'Cápsula', defaultRoute: 'Oral', notes: 'Controlado — conforme legislação.' },
  { name: 'Loratadina', activeIngredient: 'Loratadina', concentration: '10 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral' },
  { name: 'Dexclorfeniramina', activeIngredient: 'Dexclorfeniramina', concentration: '2 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral' },
  { name: 'Vitamina C', activeIngredient: 'Ácido ascórbico', concentration: '500 mg', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral' },
  { name: 'Complexo B', activeIngredient: 'Vitaminas do complexo B', concentration: '—', pharmaceuticalForm: 'Comprimido', defaultRoute: 'Oral' },
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
    // Compat: nome antigo do interproximal
    if (names.has('Interproximal')) names.add('Interproximal (bite-wing)');
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

  async ensureDefaultMedications(organizationId: string) {
    const existing = await prisma.medicationCatalogItem.findMany({
      where: { organizationId },
      select: { name: true },
    });
    const names = new Set(existing.map((item) => item.name));
    const missing = DEFAULT_MEDICATIONS.filter((item) => !names.has(item.name));
    if (!missing.length) return;
    await prisma.medicationCatalogItem.createMany({
      data: missing.map((item) => ({
        organizationId,
        name: item.name,
        activeIngredient: item.activeIngredient,
        concentration: item.concentration,
        pharmaceuticalForm: item.pharmaceuticalForm,
        defaultRoute: item.defaultRoute,
        notes: 'notes' in item ? item.notes ?? null : null,
        active: true,
      })),
    });
  }

  async listMedications(organizationId: string, q?: string, includeInactive = false) {
    await this.ensureDefaultMedications(organizationId);
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
      take: 500,
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
