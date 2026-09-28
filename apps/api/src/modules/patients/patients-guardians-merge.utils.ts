import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  extractMessageTemplateTokens,
  isMessageTemplateVariable,
  MAX_LEAD_MINUTES,
  MESSAGE_TEMPLATE_VARIABLES,
  MIN_LEAD_MINUTES,
  Prisma,
  prisma,
} from '@sonder/database';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parseWithZod } from '../../common/zod-validation';

const guardianSchema = z.object({
  name: z.string().trim().min(2),
  phone: z.string().trim().min(10),
  relationship: z.string().trim().min(2),
  cpf: z.string().regex(/^\d{11}$/).optional(),
  email: z.string().email().optional(),
  isLegalGuardian: z.boolean().optional(),
  canSign: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
});

const alertSchema = z.object({
  type: z.string().trim().min(2).max(60),
  message: z.string().trim().min(2).max(500),
  severity: z.enum(['INFO', 'WARNING', 'HIGH', 'CRITICAL']).optional(),
});

function extractTemplateVariables(content: string): string[] {
  const found = extractMessageTemplateTokens(content);
  const unknown = found.filter((key) => !isMessageTemplateVariable(key));
  if (unknown.length) {
    throw new BadRequestException(
      `Variáveis não permitidas: ${unknown.join(', ')}. Use: ${MESSAGE_TEMPLATE_VARIABLES.join(', ')}.`,
    );
  }
  return found;
}

const templateCategorySchema = z.enum(['REMINDER', 'CONFIRMATION', 'RETURN', 'MARKETING', 'OTHER']);
const templateScheduleSchema = z
  .object({
    leadMinutes: z.number().int().min(MIN_LEAD_MINUTES).max(MAX_LEAD_MINUTES).optional(),
    mondaySendDay: z.enum(['FRIDAY', 'SUNDAY']).optional(),
  })
  .strict();
type TemplateSchedule = z.infer<typeof templateScheduleSchema>;

/** Só Lembrete e Confirmação têm antecedência de agenda; o dia de segunda vale para o Lembrete. */
function scheduleForCategory(category: string, schedule: TemplateSchedule | undefined): Prisma.InputJsonValue {
  if (!schedule || (category !== 'REMINDER' && category !== 'CONFIRMATION')) return {};
  return {
    ...(schedule.leadMinutes ? { leadMinutes: schedule.leadMinutes } : {}),
    ...(category === 'REMINDER' && schedule.mondaySendDay ? { mondaySendDay: schedule.mondaySendDay } : {}),
  };
}

export async function addPatientGuardian(
  organizationId: string,
  patientId: string,
  actorId: string | undefined,
  input: z.input<typeof guardianSchema>,
) {
  const data = parseWithZod(guardianSchema, input);
  const patient = await prisma.patient.findFirst({ where: { id: patientId, organizationId } });
  if (!patient) throw new NotFoundException('Paciente não encontrado.');

  return prisma.$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.patientGuardian.updateMany({
        where: { patientId },
        data: { isPrimary: false },
      });
    }
    const guardian = await tx.guardian.create({
      data: {
        name: data.name,
        phone: data.phone,
        relationship: data.relationship,
        cpf: data.cpf,
        email: data.email,
      },
    });
    const link = await tx.patientGuardian.create({
      data: {
        patientId,
        guardianId: guardian.id,
        isLegalGuardian: data.isLegalGuardian ?? true,
        canSign: data.canSign ?? true,
        isPrimary: data.isPrimary ?? false,
      },
      include: { guardian: true },
    });
    await tx.auditEvent.create({
      data: {
        actorId,
        action: 'patient.guardian.added',
        entity: 'PatientGuardian',
        entityId: `${patientId}:${guardian.id}`,
        changes: { guardianId: guardian.id, name: guardian.name },
        correlationId: randomUUID(),
      },
    });
    return link;
  });
}

export async function updatePatientGuardian(
  organizationId: string,
  patientId: string,
  guardianId: string,
  actorId: string | undefined,
  input: Partial<z.input<typeof guardianSchema>>,
) {
  const patient = await prisma.patient.findFirst({ where: { id: patientId, organizationId } });
  if (!patient) throw new NotFoundException('Paciente não encontrado.');
  const link = await prisma.patientGuardian.findFirst({
    where: { patientId, guardianId },
    include: { guardian: true },
  });
  if (!link) throw new NotFoundException('Responsável não encontrado.');

  const patch = parseWithZod(guardianSchema.partial(), input);
  return prisma.$transaction(async (tx) => {
    if (patch.isPrimary) {
      await tx.patientGuardian.updateMany({
        where: { patientId, guardianId: { not: guardianId } },
        data: { isPrimary: false },
      });
    }
    await tx.guardian.update({
      where: { id: guardianId },
      data: {
        name: patch.name,
        phone: patch.phone,
        relationship: patch.relationship,
        cpf: patch.cpf === undefined ? undefined : patch.cpf,
        email: patch.email === undefined ? undefined : patch.email,
      },
    });
    const updated = await tx.patientGuardian.update({
      where: { patientId_guardianId: { patientId, guardianId } },
      data: {
        isLegalGuardian: patch.isLegalGuardian,
        canSign: patch.canSign,
        isPrimary: patch.isPrimary,
      },
      include: { guardian: true },
    });
    await tx.auditEvent.create({
      data: {
        actorId,
        action: 'patient.guardian.updated',
        entity: 'PatientGuardian',
        entityId: `${patientId}:${guardianId}`,
        changes: { fields: Object.keys(patch) },
        correlationId: randomUUID(),
      },
    });
    return updated;
  });
}

export async function unlinkPatientGuardian(
  organizationId: string,
  patientId: string,
  guardianId: string,
  actorId: string | undefined,
) {
  const patient = await prisma.patient.findFirst({ where: { id: patientId, organizationId } });
  if (!patient) throw new NotFoundException('Paciente não encontrado.');
  const link = await prisma.patientGuardian.findFirst({ where: { patientId, guardianId } });
  if (!link) throw new NotFoundException('Responsável não encontrado.');
  if (patient.isMinor) {
    const remaining = await prisma.patientGuardian.count({
      where: { patientId, guardianId: { not: guardianId } },
    });
    if (remaining === 0) {
      throw new BadRequestException('Paciente menor de idade exige ao menos um responsável vinculado.');
    }
  }
  await prisma.$transaction([
    prisma.patientGuardian.delete({ where: { patientId_guardianId: { patientId, guardianId } } }),
    prisma.auditEvent.create({
      data: {
        actorId,
        action: 'patient.guardian.unlinked',
        entity: 'PatientGuardian',
        entityId: `${patientId}:${guardianId}`,
        changes: { guardianId },
        correlationId: randomUUID(),
      },
    }),
  ]);
  return { success: true as const };
}

export async function createPatientAlert(
  organizationId: string,
  patientId: string,
  actorId: string | undefined,
  input: z.input<typeof alertSchema>,
) {
  const data = parseWithZod(alertSchema, input);
  const patient = await prisma.patient.findFirst({ where: { id: patientId, organizationId } });
  if (!patient) throw new NotFoundException('Paciente não encontrado.');
  const alert = await prisma.patientAlert.create({
    data: {
      patientId,
      type: data.type,
      message: data.message,
      severity: data.severity ?? 'WARNING',
      active: true,
    },
  });
  await prisma.auditEvent.create({
    data: {
      actorId,
      action: 'patient.alert.created',
      entity: 'PatientAlert',
      entityId: alert.id,
      changes: { type: alert.type, severity: alert.severity },
      correlationId: randomUUID(),
    },
  });
  return alert;
}

export async function updatePatientAlert(
  organizationId: string,
  patientId: string,
  alertId: string,
  actorId: string | undefined,
  input: Partial<z.input<typeof alertSchema>> & { active?: boolean },
) {
  const patient = await prisma.patient.findFirst({ where: { id: patientId, organizationId } });
  if (!patient) throw new NotFoundException('Paciente não encontrado.');
  const existing = await prisma.patientAlert.findFirst({ where: { id: alertId, patientId } });
  if (!existing) throw new NotFoundException('Alerta não encontrado.');
  const patch = parseWithZod(alertSchema.partial().extend({ active: z.boolean().optional() }), input);
  const alert = await prisma.patientAlert.update({
    where: { id: alertId },
    data: {
      type: patch.type,
      message: patch.message,
      severity: patch.severity,
      active: patch.active,
    },
  });
  await prisma.auditEvent.create({
    data: {
      actorId,
      action: 'patient.alert.updated',
      entity: 'PatientAlert',
      entityId: alertId,
      changes: { fields: Object.keys(patch) },
      correlationId: randomUUID(),
    },
  });
  return alert;
}

/** Merge source → target: move vínculos clínicos/financeiros e arquiva a origem. */
export async function mergePatients(
  organizationId: string,
  actorId: string,
  targetPatientId: string,
  sourcePatientId: string,
) {
  if (targetPatientId === sourcePatientId) {
    throw new BadRequestException('Paciente de origem e destino devem ser diferentes.');
  }
  const [target, source] = await Promise.all([
    prisma.patient.findFirst({ where: { id: targetPatientId, organizationId } }),
    prisma.patient.findFirst({ where: { id: sourcePatientId, organizationId } }),
  ]);
  if (!target || !source) throw new NotFoundException('Paciente não encontrado.');
  if (source.status === 'ARCHIVED') throw new ConflictException('Paciente de origem já está arquivado.');

  const moved = await prisma.$transaction(async (tx) => {
    const counts: Record<string, number> = {};

    const sourceClinics = await tx.patientClinic.findMany({ where: { patientId: sourcePatientId } });
    for (const row of sourceClinics) {
      await tx.patientClinic.upsert({
        where: { patientId_clinicId: { patientId: targetPatientId, clinicId: row.clinicId } },
        create: {
          patientId: targetPatientId,
          clinicId: row.clinicId,
          internalCode: row.internalCode,
          status: row.status,
        },
        update: { status: 'ACTIVE', internalCode: row.internalCode ?? undefined },
      });
    }
    await tx.patientClinic.deleteMany({ where: { patientId: sourcePatientId } });
    counts.clinics = sourceClinics.length;

    const sourceGuardians = await tx.patientGuardian.findMany({ where: { patientId: sourcePatientId } });
    for (const row of sourceGuardians) {
      const exists = await tx.patientGuardian.findFirst({
        where: { patientId: targetPatientId, guardianId: row.guardianId },
      });
      if (!exists) {
        await tx.patientGuardian.create({
          data: {
            patientId: targetPatientId,
            guardianId: row.guardianId,
            isLegalGuardian: row.isLegalGuardian,
            canSign: row.canSign,
            isPrimary: false,
          },
        });
      }
    }
    await tx.patientGuardian.deleteMany({ where: { patientId: sourcePatientId } });
    counts.guardians = sourceGuardians.length;

    counts.alerts = (await tx.patientAlert.updateMany({
      where: { patientId: sourcePatientId },
      data: { patientId: targetPatientId },
    })).count;

    counts.appointments = (await tx.appointment.updateMany({
      where: { patientId: sourcePatientId },
      data: { patientId: targetPatientId },
    })).count;

    counts.returnAlerts = (await tx.returnAlert.updateMany({
      where: { patientId: sourcePatientId },
      data: { patientId: targetPatientId },
    })).count;

    counts.tasks = (await tx.task.updateMany({
      where: { patientId: sourcePatientId },
      data: { patientId: targetPatientId },
    })).count;

    counts.labCases = (await tx.labCase.updateMany({
      where: { patientId: sourcePatientId },
      data: { patientId: targetPatientId },
    })).count;

    counts.treatments = (await tx.treatmentPlan.updateMany({
      where: { patientId: sourcePatientId },
      data: { patientId: targetPatientId },
    })).count;

    counts.odontograms = (await tx.odontogram.updateMany({
      where: { patientId: sourcePatientId },
      data: { patientId: targetPatientId },
    })).count;

    counts.anamnesis = (await tx.anamnesisResponse.updateMany({
      where: { patientId: sourcePatientId },
      data: { patientId: targetPatientId },
    })).count;

    counts.documents = (await tx.generatedDocument.updateMany({
      where: { patientId: sourcePatientId },
      data: { patientId: targetPatientId },
    })).count;

    counts.prescriptions = (await tx.prescription.updateMany({
      where: { patientId: sourcePatientId },
      data: { patientId: targetPatientId },
    })).count;

    counts.media = (await tx.patientMedia.updateMany({
      where: { patientId: sourcePatientId },
      data: { patientId: targetPatientId },
    })).count;

    counts.deliveries = (await tx.messageDelivery.updateMany({
      where: { patientId: sourcePatientId },
      data: { patientId: targetPatientId },
    })).count;

    counts.receivables = (await tx.receivable.updateMany({
      where: { patientId: sourcePatientId },
      data: { patientId: targetPatientId },
    })).count;

    const sourceFolders = await tx.patientDocumentFolder.findMany({ where: { patientId: sourcePatientId } });
    for (const folder of sourceFolders) {
      const clash = await tx.patientDocumentFolder.findFirst({
        where: { patientId: targetPatientId, name: folder.name },
      });
      if (clash) {
        await tx.generatedDocument.updateMany({ where: { folderId: folder.id }, data: { folderId: clash.id } });
        await tx.prescription.updateMany({ where: { folderId: folder.id }, data: { folderId: clash.id } });
        await tx.patientMedia.updateMany({ where: { folderId: folder.id }, data: { folderId: clash.id } });
        await tx.patientDocumentFolder.delete({ where: { id: folder.id } });
      } else {
        await tx.patientDocumentFolder.update({
          where: { id: folder.id },
          data: { patientId: targetPatientId },
        });
      }
    }
    counts.folders = sourceFolders.length;

    const sourcePrefs = await tx.communicationPreference.findMany({ where: { patientId: sourcePatientId } });
    for (const pref of sourcePrefs) {
      await tx.communicationPreference.upsert({
        where: {
          organizationId_patientId_channel_category: {
            organizationId,
            patientId: targetPatientId,
            channel: pref.channel,
            category: pref.category,
          },
        },
        create: {
          organizationId,
          patientId: targetPatientId,
          channel: pref.channel,
          category: pref.category,
          optedIn: pref.optedIn,
          source: pref.source,
        },
        update: {
          optedIn: pref.optedIn ? true : undefined,
          changedAt: new Date(),
          source: 'MERGE',
        },
      });
    }
    await tx.communicationPreference.deleteMany({ where: { patientId: sourcePatientId } });
    counts.preferences = sourcePrefs.length;

    const sourceRecords = await tx.clinicalRecord.findMany({
      where: { patientId: sourcePatientId },
      include: { entries: true, privateNotes: true },
    });
    for (const record of sourceRecords) {
      const targetRecord = await tx.clinicalRecord.findFirst({
        where: { clinicId: record.clinicId, patientId: targetPatientId },
      });
      if (targetRecord) {
        await tx.clinicalEntry.updateMany({
          where: { clinicalRecordId: record.id },
          data: { clinicalRecordId: targetRecord.id },
        });
        await tx.privateClinicalNote.updateMany({
          where: { clinicalRecordId: record.id },
          data: { clinicalRecordId: targetRecord.id },
        });
        await tx.clinicalRecord.delete({ where: { id: record.id } });
      } else {
        await tx.clinicalRecord.update({
          where: { id: record.id },
          data: { patientId: targetPatientId },
        });
      }
    }
    counts.clinicalRecords = sourceRecords.length;

    await tx.patient.update({
      where: { id: sourcePatientId },
      data: { status: 'ARCHIVED' },
    });

    await tx.auditEvent.create({
      data: {
        actorId,
        action: 'patient.merged',
        entity: 'Patient',
        entityId: targetPatientId,
        changes: {
          sourcePatientId,
          sourceName: source.fullName,
          targetName: target.fullName,
          moved: counts,
        },
        correlationId: randomUUID(),
      },
    });

    return counts;
  });

  return {
    success: true as const,
    targetPatientId,
    sourcePatientId,
    sourceArchived: true,
    moved,
  };
}

export function listMessageTemplates(organizationId: string, includeInactive = false) {
  return prisma.messageTemplate.findMany({
    where: { organizationId, ...(includeInactive ? {} : { active: true }) },
    orderBy: { name: 'asc' },
  });
}

const createTemplateSchema = z.object({
  name: z.string().trim().min(2, 'Nome do template inválido.').max(120),
  category: z.string().trim().toUpperCase().pipe(templateCategorySchema),
  content: z.string().trim().min(5, 'Conteúdo do template inválido.').max(4000),
  requiresConsent: z.boolean().optional(),
  schedule: templateScheduleSchema.optional(),
});
const updateTemplateSchema = createTemplateSchema.partial().extend({ active: z.boolean().optional() });

export async function createMessageTemplate(
  organizationId: string,
  input: z.input<typeof createTemplateSchema>,
) {
  const data = parseWithZod(createTemplateSchema, input);
  const variables = extractTemplateVariables(data.content);
  try {
    return await prisma.messageTemplate.create({
      data: {
        organizationId,
        name: data.name,
        category: data.category,
        content: data.content,
        variables,
        schedule: scheduleForCategory(data.category, data.schedule),
        requiresConsent: data.category === 'MARKETING' ? true : (data.requiresConsent ?? true),
        active: true,
      },
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      throw new ConflictException('Já existe um template com este nome.');
    }
    throw error;
  }
}

export async function updateMessageTemplate(
  organizationId: string,
  id: string,
  input: z.input<typeof updateTemplateSchema>,
) {
  const data = parseWithZod(updateTemplateSchema, input);
  const existing = await prisma.messageTemplate.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundException('Template não encontrado.');
  const variables = data.content ? extractTemplateVariables(data.content) : undefined;
  const category = data.category ?? existing.category;
  const categoryChanged = data.category !== undefined && data.category !== existing.category;
  return prisma.messageTemplate.update({
    where: { id },
    data: {
      name: data.name,
      category: data.category,
      content: data.content,
      variables,
      schedule: data.schedule !== undefined || categoryChanged
        ? scheduleForCategory(category, data.schedule)
        : undefined,
      requiresConsent: category === 'MARKETING' ? true : data.requiresConsent,
      active: data.active,
    },
  });
}

export function listCommunicationPreferences(organizationId: string, patientId: string) {
  return prisma.communicationPreference.findMany({
    where: { organizationId, patientId },
    orderBy: [{ channel: 'asc' }, { category: 'asc' }],
  });
}

export async function upsertCommunicationPreference(
  organizationId: string,
  patientId: string,
  input: { channel: string; category: string; optedIn: boolean; source?: string },
) {
  const patient = await prisma.patient.findFirst({ where: { id: patientId, organizationId } });
  if (!patient) throw new NotFoundException('Paciente não encontrado.');
  const channel = input.channel.trim().toUpperCase();
  const category = input.category.trim().toUpperCase();
  if (!channel || !category) throw new BadRequestException('Canal e categoria são obrigatórios.');
  return prisma.communicationPreference.upsert({
    where: {
      organizationId_patientId_channel_category: {
        organizationId,
        patientId,
        channel,
        category,
      },
    },
    create: {
      organizationId,
      patientId,
      channel,
      category,
      optedIn: input.optedIn,
      source: input.source ?? 'MANUAL',
    },
    update: {
      optedIn: input.optedIn,
      changedAt: new Date(),
      source: input.source ?? 'MANUAL',
    },
  });
}
