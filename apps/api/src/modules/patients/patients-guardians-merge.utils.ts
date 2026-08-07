import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { prisma } from '@sonder/database';
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

const TEMPLATE_VARS = ['patientName', 'date', 'clinicName', 'professionalName'] as const;

function extractTemplateVariables(content: string): string[] {
  const found = new Set<string>();
  for (const match of content.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g)) {
    const key = match[1];
    if (key) found.add(key);
  }
  const unknown = [...found].filter((key) => !(TEMPLATE_VARS as readonly string[]).includes(key));
  if (unknown.length) {
    throw new BadRequestException(`Variáveis não permitidas: ${unknown.join(', ')}. Use: ${TEMPLATE_VARS.join(', ')}.`);
  }
  return [...found];
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

export async function createMessageTemplate(
  organizationId: string,
  input: { name: string; category: string; content: string; requiresConsent?: boolean },
) {
  const name = input.name.trim();
  const content = input.content.trim();
  if (name.length < 2) throw new BadRequestException('Nome do template inválido.');
  if (content.length < 5) throw new BadRequestException('Conteúdo do template inválido.');
  const variables = extractTemplateVariables(content);
  try {
    return await prisma.messageTemplate.create({
      data: {
        organizationId,
        name,
        category: input.category.trim().toUpperCase(),
        content,
        variables,
        requiresConsent: input.requiresConsent ?? true,
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
  input: { name?: string; category?: string; content?: string; requiresConsent?: boolean; active?: boolean },
) {
  const existing = await prisma.messageTemplate.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundException('Template não encontrado.');
  const content = input.content?.trim();
  const variables = content ? extractTemplateVariables(content) : undefined;
  return prisma.messageTemplate.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      category: input.category?.trim().toUpperCase(),
      content,
      variables,
      requiresConsent: input.requiresConsent,
      active: input.active,
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
