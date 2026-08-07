import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, prisma } from '@sonder/database';
import { createAntivirusScanner, createStorageAdapter } from '@sonder/storage';
import { z } from 'zod';
import { parseWithZod } from '../../common/zod-validation';

const returnStatus = z.enum(['PENDING', 'CONTACTED', 'SCHEDULED', 'DONE', 'DISMISSED']);
const returnChannel = z.enum(['WHATSAPP', 'PHONE', 'EMAIL', 'IN_PERSON']);
const taskStatus = z.enum(['INBOX', 'TODAY', 'UPCOMING', 'DONE']);
const taskPriority = z.enum(['LOW', 'NORMAL', 'HIGH']);
const taskCategory = z.enum(['PATIENT', 'FINANCE', 'LAB', 'SCHEDULE', 'STOCK', 'ADMIN']);
const labStatus = z.enum(['REQUESTED', 'IN_LAB', 'RETURNED', 'INSTALLED', 'CANCELLED']);
const notificationCategory = z.enum(['CLINICAL', 'FINANCE', 'TASK', 'LAB', 'PATIENT']);

const createReturnAlertSchema = z.object({
  clinicId: z.string().uuid(),
  patientId: z.string().uuid(),
  professionalId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  reason: z.string().trim().min(3),
  specialty: z.string().trim().optional(),
  dueAt: z.string().datetime(),
  preferredChannel: returnChannel.optional(),
  notes: z.string().trim().optional(),
});
const updateReturnAlertSchema = z.object({
  status: returnStatus.optional(),
  dueAt: z.string().datetime().optional(),
  notes: z.string().trim().optional(),
  contactAttempts: z.number().int().min(0).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  preferredChannel: returnChannel.optional(),
  specialty: z.string().trim().nullable().optional(),
  reason: z.string().trim().min(3).optional(),
});
const createTaskSchema = z.object({
  clinicId: z.string().uuid(),
  title: z.string().trim().min(3),
  description: z.string().trim().optional(),
  category: taskCategory,
  priority: taskPriority.optional(),
  status: taskStatus.optional(),
  dueAt: z.string().datetime().optional(),
  assigneeId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
});
const updateTaskSchema = createTaskSchema.omit({ clinicId: true }).partial();
const createLabCaseSchema = z.object({
  clinicId: z.string().uuid(),
  patientId: z.string().uuid(),
  professionalId: z.string().uuid().optional(),
  laboratoryId: z.string().uuid().optional(),
  description: z.string().trim().min(3),
  toothFdi: z.string().trim().optional(),
  laboratoryName: z.string().trim().min(2).optional(),
  specialty: z.string().trim().optional(),
  dueAt: z.string().datetime().optional(),
  cost: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  notes: z.string().trim().optional(),
});
const automationActionSchema = z.object({
  type: z.literal('CREATE_RETURN_ALERT'),
  reason: z.string().trim().min(3).max(200),
  preferredChannel: returnChannel.optional(),
  daysAfter: z.number().int().min(0).max(365).optional(),
});
const createAutomationRuleSchema = z.object({
  clinicId: z.string().uuid().optional(),
  name: z.string().trim().min(3).max(120),
  trigger: z.literal('APPOINTMENT_COMPLETED'),
  conditions: z.record(z.string(), z.unknown()).default({}),
  action: automationActionSchema,
  allowedHours: z.record(z.string(), z.unknown()).default({}),
  frequency: z.string().trim().max(40).optional(),
  active: z.boolean().optional(),
});
const updateAutomationRuleSchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
  action: automationActionSchema.optional(),
  allowedHours: z.record(z.string(), z.unknown()).optional(),
  frequency: z.string().trim().max(40).nullable().optional(),
  active: z.boolean().optional(),
});

type CreateReturnAlert = z.infer<typeof createReturnAlertSchema>;
type UpdateReturnAlert = z.infer<typeof updateReturnAlertSchema>;
type CreateTask = z.infer<typeof createTaskSchema>;
type UpdateTask = z.infer<typeof updateTaskSchema>;
type CreateLabCase = z.infer<typeof createLabCaseSchema>;
const json = (value: unknown) => value as Prisma.InputJsonValue;

const dayStart = (date = new Date()) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};
const addDays = (date: Date, days: number) => {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
};

@Injectable()
export class WorkspaceService {
  private readonly storage = createStorageAdapter();
  private readonly antivirus = createAntivirusScanner();

  private readonly returnAlertInclude = {
    patient: { select: { id: true, fullName: true, primaryPhone: true, cpf: true } },
    professional: { select: { id: true, name: true } },
  } satisfies Prisma.ReturnAlertInclude;

  private readonly taskInclude = {
    patient: { select: { id: true, fullName: true } },
    checklist: { orderBy: { sortOrder: 'asc' as const } },
    participants: true,
    comments: { orderBy: { createdAt: 'asc' as const } },
    attachments: { orderBy: { createdAt: 'desc' as const } },
  } satisfies Prisma.TaskInclude;

  private readonly labCaseInclude = {
    patient: { select: { id: true, fullName: true } },
    professional: { select: { id: true, name: true } },
  } satisfies Prisma.LabCaseInclude;

  async returnAlerts(organizationId: string, query: {
    clinicId?: string; status?: string; assigneeId?: string; specialty?: string; search?: string;
  }) {
    const status = query.status ? parseWithZod(returnStatus, query.status) : undefined;
    const items = await prisma.returnAlert.findMany({
      where: {
        organizationId,
        clinicId: query.clinicId,
        status,
        assigneeId: query.assigneeId,
        specialty: query.specialty,
        ...(query.search ? {
          OR: [
            { reason: { contains: query.search, mode: 'insensitive' } },
            { patient: { fullName: { contains: query.search, mode: 'insensitive' } } },
          ],
        } : {}),
      },
      include: this.returnAlertInclude,
      orderBy: { dueAt: 'asc' },
      take: 200,
    });
    return this.withAssignees(items);
  }

  async returnAlertSummary(organizationId: string, clinicId?: string) {
    const today = dayStart();
    const tomorrow = addDays(today, 1);
    const next7 = addDays(today, 7);
    const last30 = addDays(new Date(), -30);
    const base = { organizationId, clinicId };
    const activeStatuses = ['PENDING', 'CONTACTED'] as const;
    const [overdue, todayCount, next7Days, total, contacted, scheduled, recent] = await Promise.all([
      prisma.returnAlert.count({ where: { ...base, status: { in: [...activeStatuses] }, dueAt: { lt: today } } }),
      prisma.returnAlert.count({ where: { ...base, dueAt: { gte: today, lt: tomorrow } } }),
      prisma.returnAlert.count({ where: { ...base, dueAt: { gte: today, lt: next7 } } }),
      prisma.returnAlert.count({ where: { ...base, status: { not: 'DISMISSED' } } }),
      prisma.returnAlert.count({ where: { ...base, status: 'CONTACTED' } }),
      prisma.returnAlert.count({ where: { ...base, status: { in: ['SCHEDULED', 'DONE'] } } }),
      prisma.returnAlert.findMany({
        where: { ...base, createdAt: { gte: last30 } },
        select: { status: true, contactAttempts: true },
      }),
    ]);
    const funnel = {
      generated: recent.length,
      contacted: recent.filter((item) => item.contactAttempts > 0).length,
      responded: recent.filter((item) => ['CONTACTED', 'SCHEDULED', 'DONE'].includes(item.status)).length,
      scheduled: recent.filter((item) => ['SCHEDULED', 'DONE'].includes(item.status)).length,
    };
    return {
      overdue,
      today: todayCount,
      next7Days,
      total,
      contacted,
      scheduled,
      conversionRate: funnel.generated ? Math.round((funnel.scheduled / funnel.generated) * 100) : 0,
      funnel,
    };
  }

  async createReturnAlert(organizationId: string, input: CreateReturnAlert) {
    const data = parseWithZod(createReturnAlertSchema, input);
    await this.assertWorkspaceResources(organizationId, data);
    const item = await prisma.returnAlert.create({
      data: { ...data, organizationId, dueAt: new Date(data.dueAt) },
      include: this.returnAlertInclude,
    });
    return (await this.withAssignees([item]))[0];
  }

  async updateReturnAlert(organizationId: string, id: string, input: UpdateReturnAlert) {
    const data = parseWithZod(updateReturnAlertSchema, input);
    const existing = await prisma.returnAlert.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Alerta de retorno não encontrado.');
    if (data.assigneeId) await this.assertUser(organizationId, data.assigneeId);
    const item = await prisma.returnAlert.update({
      where: { id },
      data: {
        ...data,
        dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
        ...(data.status === 'CONTACTED' ? {
          lastContactAt: new Date(),
          contactAttempts: data.contactAttempts ?? { increment: 1 },
        } : {}),
      },
      include: this.returnAlertInclude,
    });
    return (await this.withAssignees([item]))[0];
  }

  async scheduleReturnAlert(organizationId: string, id: string, appointmentId: string) {
    parseWithZod(z.string().uuid(), appointmentId);
    const [alert, appointment] = await Promise.all([
      prisma.returnAlert.findFirst({ where: { id, organizationId } }),
      prisma.appointment.findFirst({ where: { id: appointmentId, organizationId }, select: { id: true } }),
    ]);
    if (!alert) throw new NotFoundException('Alerta de retorno não encontrado.');
    if (!appointment) throw new NotFoundException('Agendamento não encontrado.');
    const item = await prisma.returnAlert.update({
      where: { id },
      data: { appointmentId, status: 'SCHEDULED' },
      include: this.returnAlertInclude,
    });
    return (await this.withAssignees([item]))[0];
  }

  async tasks(organizationId: string, query: {
    clinicId?: string; status?: string; assigneeId?: string; dueFrom?: string; dueTo?: string;
  }) {
    const status = query.status ? parseWithZod(taskStatus, query.status) : undefined;
    const items = await prisma.task.findMany({
      where: {
        organizationId,
        clinicId: query.clinicId,
        status,
        assigneeId: query.assigneeId,
        dueAt: {
          gte: query.dueFrom ? new Date(query.dueFrom) : undefined,
          lte: query.dueTo ? new Date(query.dueTo) : undefined,
        },
      },
      include: this.taskInclude,
      orderBy: { dueAt: 'asc' },
      take: 300,
    });
    const withAssignees = await this.withAssignees(items);
    return this.enrichTaskRelations(withAssignees);
  }

  async createTask(organizationId: string, createdById: string, input: CreateTask) {
    const data = parseWithZod(createTaskSchema, input);
    await this.assertWorkspaceResources(organizationId, data);
    const item = await prisma.task.create({
      data: { ...data, organizationId, createdById, dueAt: data.dueAt ? new Date(data.dueAt) : undefined },
      include: this.taskInclude,
    });
    const [withAssignee] = await this.withAssignees([item]);
    if (!withAssignee) throw new NotFoundException('Tarefa não encontrada.');
    const [enriched] = await this.enrichTaskRelations([withAssignee]);
    return enriched;
  }

  async updateTask(organizationId: string, id: string, input: UpdateTask) {
    const data = parseWithZod(updateTaskSchema, input);
    const existing = await prisma.task.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Tarefa não encontrada.');
    if (data.assigneeId) await this.assertUser(organizationId, data.assigneeId);
    if (data.patientId) await this.assertPatient(organizationId, data.patientId);
    const item = await prisma.task.update({
      where: { id },
      data: {
        ...data,
        dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
        completedAt: data.status === 'DONE' ? new Date() : data.status ? null : undefined,
      },
      include: this.taskInclude,
    });
    const [withAssignee] = await this.withAssignees([item]);
    if (!withAssignee) throw new NotFoundException('Tarefa não encontrada.');
    const [enriched] = await this.enrichTaskRelations([withAssignee]);
    return enriched;
  }

  async addTaskChecklistItem(organizationId: string, taskId: string, title: string) {
    const task = await prisma.task.findFirst({ where: { id: taskId, organizationId } });
    if (!task) throw new NotFoundException('Tarefa não encontrada.');
    const trimmed = title.trim();
    if (trimmed.length < 1) throw new BadRequestException('Informe o item do checklist.');
    const maxOrder = await prisma.taskChecklistItem.aggregate({
      where: { taskId },
      _max: { sortOrder: true },
    });
    return prisma.taskChecklistItem.create({
      data: {
        taskId,
        title: trimmed,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });
  }

  async updateTaskChecklistItem(
    organizationId: string,
    taskId: string,
    itemId: string,
    input: { title?: string; completed?: boolean },
    actorId?: string,
  ) {
    const item = await prisma.taskChecklistItem.findFirst({
      where: { id: itemId, taskId, task: { organizationId } },
    });
    if (!item) throw new NotFoundException('Item do checklist não encontrado.');
    return prisma.taskChecklistItem.update({
      where: { id: itemId },
      data: {
        title: input.title?.trim(),
        completed: input.completed,
        completedAt: input.completed === true ? new Date() : input.completed === false ? null : undefined,
        completedById: input.completed === true ? actorId : input.completed === false ? null : undefined,
      },
    });
  }

  async deleteTaskChecklistItem(organizationId: string, taskId: string, itemId: string) {
    const item = await prisma.taskChecklistItem.findFirst({
      where: { id: itemId, taskId, task: { organizationId } },
    });
    if (!item) throw new NotFoundException('Item do checklist não encontrado.');
    await prisma.taskChecklistItem.delete({ where: { id: itemId } });
    return { success: true as const };
  }

  async addTaskParticipant(organizationId: string, taskId: string, userId: string) {
    parseWithZod(z.string().uuid(), userId);
    const task = await prisma.task.findFirst({ where: { id: taskId, organizationId } });
    if (!task) throw new NotFoundException('Tarefa não encontrada.');
    await this.assertUser(organizationId, userId);
    try {
      await prisma.taskParticipant.create({ data: { taskId, userId } });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('Usuário já é participante.');
      }
      throw error;
    }
    return this.getTask(organizationId, taskId);
  }

  async removeTaskParticipant(organizationId: string, taskId: string, userId: string) {
    const task = await prisma.task.findFirst({ where: { id: taskId, organizationId } });
    if (!task) throw new NotFoundException('Tarefa não encontrada.');
    await prisma.taskParticipant.deleteMany({ where: { taskId, userId } });
    return this.getTask(organizationId, taskId);
  }

  async addTaskComment(organizationId: string, taskId: string, authorId: string, content: string) {
    const task = await prisma.task.findFirst({ where: { id: taskId, organizationId } });
    if (!task) throw new NotFoundException('Tarefa não encontrada.');
    const trimmed = content.trim();
    if (trimmed.length < 1) throw new BadRequestException('Informe o comentário.');
    await prisma.taskComment.create({
      data: { taskId, authorId, content: trimmed },
    });
    return this.getTask(organizationId, taskId);
  }

  async addTaskAttachment(
    organizationId: string,
    taskId: string,
    actorId: string,
    file: { originalname: string; size: number; buffer: Buffer; mimetype: string },
  ) {
    const task = await prisma.task.findFirst({ where: { id: taskId, organizationId } });
    if (!task) throw new NotFoundException('Tarefa não encontrada.');
    if (!this.storage.enabled) {
      throw new BadRequestException(
        this.storage.disabledReason
          ?? 'Storage desabilitado — configure STORAGE_DRIVER=local ou MinIO/S3 com credenciais.',
      );
    }
    if (!file?.buffer?.length) throw new BadRequestException('Envie um arquivo.');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('Anexo deve ter no máximo 10 MB.');
    const extension = file.originalname.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
    const scan = await this.antivirus.scan(file.buffer);
    if (scan.infected) {
      throw new BadRequestException(
        `Arquivo rejeitado pelo antivírus${scan.detail ? `: ${scan.detail}` : '.'}`,
      );
    }
    const antivirusStatus = scan.clean ? 'CLEAN' : 'PENDING';
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    let stored;
    try {
      stored = await this.storage.putObject({
        organizationId,
        clinicId: task.clinicId,
        filename: file.originalname,
        contentType: file.mimetype || 'application/octet-stream',
        body: file.buffer,
        keyPrefix: 'task-attachments',
        metadata: { kind: 'task-attachment', taskId },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Falha ao gravar no storage.';
      throw new BadRequestException(detail);
    }
    try {
      await prisma.$transaction(async (tx) => {
        const fileObject = await tx.fileObject.create({
          data: {
            organizationId,
            bucket: stored.bucket,
            objectKey: stored.objectKey,
            originalName: file.originalname,
            mimeType: file.mimetype || 'application/octet-stream',
            extension: extension || null,
            sizeBytes: BigInt(file.size),
            checksum,
            status: 'AVAILABLE',
            antivirusStatus,
            createdById: actorId,
            metadata: json({ kind: 'task-attachment', taskId }),
          },
        });
        await tx.taskAttachment.create({
          data: {
            taskId,
            fileId: fileObject.id,
            createdById: actorId,
          },
        });
      });
    } catch (error) {
      await this.storage.deleteObject(stored.objectKey).catch(() => undefined);
      throw error;
    }
    return this.getTask(organizationId, taskId);
  }

  async removeTaskAttachment(organizationId: string, taskId: string, attachmentId: string) {
    const attachment = await prisma.taskAttachment.findFirst({
      where: { id: attachmentId, taskId, task: { organizationId } },
    });
    if (!attachment) throw new NotFoundException('Anexo não encontrado.');
    await prisma.taskAttachment.delete({ where: { id: attachmentId } });
    return this.getTask(organizationId, taskId);
  }

  private async getTask(organizationId: string, id: string) {
    const item = await prisma.task.findFirst({
      where: { id, organizationId },
      include: this.taskInclude,
    });
    if (!item) throw new NotFoundException('Tarefa não encontrada.');
    const [withAssignee] = await this.withAssignees([item]);
    if (!withAssignee) throw new NotFoundException('Tarefa não encontrada.');
    const enriched = await this.enrichTaskRelations([withAssignee]);
    return enriched[0];
  }

  private async enrichTaskRelations<T extends {
    participants?: Array<{ userId: string }>;
    comments?: Array<{ authorId: string }>;
    attachments?: Array<{ fileId: string; createdById: string }>;
  }>(items: T[]) {
    const userIds = new Set<string>();
    const fileIds = new Set<string>();
    for (const item of items) {
      for (const p of item.participants ?? []) userIds.add(p.userId);
      for (const c of item.comments ?? []) userIds.add(c.authorId);
      for (const a of item.attachments ?? []) {
        userIds.add(a.createdById);
        fileIds.add(a.fileId);
      }
    }
    const [users, files] = await Promise.all([
      userIds.size
        ? prisma.user.findMany({
            where: { id: { in: [...userIds] } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      fileIds.size
        ? prisma.fileObject.findMany({
            where: { id: { in: [...fileIds] } },
            select: { id: true, originalName: true, mimeType: true, sizeBytes: true, antivirusStatus: true },
          })
        : Promise.resolve([]),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const fileById = new Map(files.map((f) => [f.id, f]));
    return items.map((item) => ({
      ...item,
      participants: (item.participants ?? []).map((p) => ({
        ...p,
        user: userById.get(p.userId) ?? null,
      })),
      comments: (item.comments ?? []).map((c) => ({
        ...c,
        author: userById.get(c.authorId) ?? null,
      })),
      attachments: (item.attachments ?? []).map((a) => ({
        ...a,
        file: fileById.get(a.fileId)
          ? {
              ...fileById.get(a.fileId)!,
              sizeBytes: Number(fileById.get(a.fileId)!.sizeBytes),
            }
          : null,
        createdBy: userById.get(a.createdById) ?? null,
      })),
    }));
  }

  labCases(organizationId: string, query: { clinicId?: string; status?: string; specialty?: string }) {
    const status = query.status ? parseWithZod(labStatus, query.status) : undefined;
    return prisma.labCase.findMany({
      where: { organizationId, clinicId: query.clinicId, status, specialty: query.specialty },
      include: this.labCaseInclude,
      orderBy: { dueAt: 'asc' },
    });
  }

  async createLabCase(organizationId: string, userId: string, input: CreateLabCase) {
    const data = parseWithZod(createLabCaseSchema, input);
    await this.assertWorkspaceResources(organizationId, data);
    let laboratoryName = data.laboratoryName?.trim();
    let laboratoryId = data.laboratoryId;
    if (laboratoryId) {
      const laboratory = await prisma.laboratory.findFirst({
        where: { id: laboratoryId, organizationId, status: 'ACTIVE' },
      });
      if (!laboratory) throw new NotFoundException('Laboratório não encontrado.');
      laboratoryName = laboratory.name;
    }
    if (!laboratoryName) throw new BadRequestException('Informe laboratoryId ou laboratoryName.');
    return prisma.$transaction(async (tx) => {
      const sequence = await tx.labCase.count({ where: { organizationId } }) + 1;
      const code = `LAB-${String(sequence).padStart(3, '0')}`;
      return tx.labCase.create({
        data: {
          organizationId,
          clinicId: data.clinicId,
          patientId: data.patientId,
          professionalId: data.professionalId,
          laboratoryId,
          description: data.description,
          toothFdi: data.toothFdi,
          laboratoryName,
          specialty: data.specialty,
          code,
          dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
          cost: data.cost ? new Prisma.Decimal(data.cost) : undefined,
          notes: data.notes,
          events: { create: { status: 'REQUESTED', createdById: userId, notes: 'Caso criado.' } },
        },
        include: this.labCaseInclude,
      });
    }, { isolationLevel: 'Serializable' }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Não foi possível gerar o código do caso. Tente novamente.');
      }
      throw error;
    });
  }

  listLaboratories(organizationId: string, clinicId?: string) {
    return prisma.laboratory.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        ...(clinicId ? { OR: [{ clinicId }, { clinicId: null }] } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async createLaboratory(organizationId: string, input: {
    name: string;
    clinicId?: string;
    taxId?: string;
    phone?: string;
    email?: string;
    defaultLeadDays?: number;
    notes?: string;
  }) {
    if (input.clinicId) await this.assertClinic(organizationId, input.clinicId);
    return prisma.laboratory.create({
      data: {
        organizationId,
        clinicId: input.clinicId,
        name: input.name.trim(),
        taxId: input.taxId,
        phone: input.phone,
        email: input.email,
        defaultLeadDays: input.defaultLeadDays,
        notes: input.notes,
      },
    });
  }

  async updateLaboratory(organizationId: string, id: string, input: {
    name?: string;
    taxId?: string | null;
    phone?: string | null;
    email?: string | null;
    defaultLeadDays?: number | null;
    notes?: string | null;
    status?: 'ACTIVE' | 'INACTIVE';
  }) {
    const existing = await prisma.laboratory.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Laboratório não encontrado.');
    return prisma.laboratory.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        taxId: input.taxId === undefined ? undefined : input.taxId,
        phone: input.phone === undefined ? undefined : input.phone,
        email: input.email === undefined ? undefined : input.email,
        defaultLeadDays: input.defaultLeadDays === undefined ? undefined : input.defaultLeadDays,
        notes: input.notes === undefined ? undefined : input.notes,
        status: input.status,
      },
    });
  }

  async updateLabCaseStatus(organizationId: string, userId: string, id: string, statusValue: string, notes?: string) {
    const status = parseWithZod(labStatus, statusValue);
    const existing = await prisma.labCase.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Caso laboratorial não encontrado.');
    const now = new Date();
    return prisma.labCase.update({
      where: { id },
      data: {
        status,
        sentAt: status === 'IN_LAB' ? now : undefined,
        returnedAt: status === 'RETURNED' ? now : undefined,
        installedAt: status === 'INSTALLED' ? now : undefined,
        events: { create: { status, notes, createdById: userId } },
      },
      include: this.labCaseInclude,
    });
  }

  async labCaseHistory(organizationId: string, id: string) {
    const existing = await prisma.labCase.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Caso laboratorial não encontrado.');
    return prisma.labCaseEvent.findMany({ where: { labCaseId: id }, orderBy: { createdAt: 'asc' } });
  }

  async notifications(organizationId: string, userId: string, query: {
    clinicId?: string; unreadOnly?: string; category?: string;
  }) {
    const category = query.category ? parseWithZod(notificationCategory, query.category) : undefined;
    const scope = {
      organizationId,
      clinicId: query.clinicId,
      OR: [{ userId }, { userId: null }],
    } satisfies Prisma.NotificationWhereInput;
    const [items, grouped] = await Promise.all([
      prisma.notification.findMany({
        where: { ...scope, category, readAt: query.unreadOnly === 'true' ? null : undefined },
        select: {
          id: true, category: true, severity: true, title: true, body: true,
          linkPath: true, readAt: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.notification.groupBy({
        by: ['category'],
        where: { ...scope, readAt: null },
        _count: true,
      }),
    ]);
    const counts = { ALL: 0, CLINICAL: 0, FINANCE: 0, TASK: 0, LAB: 0, PATIENT: 0 };
    for (const item of grouped) {
      counts[item.category] = item._count;
      counts.ALL += item._count;
    }
    return { items, unreadCount: counts.ALL, counts };
  }

  async readNotification(organizationId: string, userId: string, id: string) {
    const notification = await prisma.notification.findFirst({
      where: { id, organizationId, OR: [{ userId }, { userId: null }] },
    });
    if (!notification) throw new NotFoundException('Notificação não encontrada.');
    const updated = notification.readAt
      ? notification
      : await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    return { id: updated.id, readAt: updated.readAt };
  }

  async readAllNotifications(organizationId: string, userId: string, clinicId?: string) {
    if (clinicId) await this.assertClinic(organizationId, clinicId);
    const result = await prisma.notification.updateMany({
      where: { organizationId, clinicId, readAt: null, OR: [{ userId }, { userId: null }] },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  automationRules(organizationId: string, clinicId?: string) {
    return prisma.automationRule.findMany({
      where: {
        organizationId,
        OR: clinicId ? [{ clinicId }, { clinicId: null }] : undefined,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAutomationRule(organizationId: string, input: unknown) {
    const data = parseWithZod(createAutomationRuleSchema, input);
    if (data.clinicId) await this.assertClinic(organizationId, data.clinicId);
    return prisma.automationRule.create({
      data: {
        organizationId,
        clinicId: data.clinicId,
        name: data.name,
        trigger: data.trigger,
        conditions: json(data.conditions),
        action: json(data.action),
        allowedHours: json(data.allowedHours),
        frequency: data.frequency,
        active: data.active ?? true,
      },
    });
  }

  async updateAutomationRule(organizationId: string, id: string, input: unknown) {
    const data = parseWithZod(updateAutomationRuleSchema, input);
    const existing = await prisma.automationRule.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Regra de automação não encontrada.');
    return prisma.automationRule.update({
      where: { id },
      data: {
        name: data.name,
        conditions: data.conditions === undefined ? undefined : json(data.conditions),
        action: data.action === undefined ? undefined : json(data.action),
        allowedHours: data.allowedHours === undefined ? undefined : json(data.allowedHours),
        frequency: data.frequency === undefined ? undefined : data.frequency,
        active: data.active,
      },
    });
  }

  private async withAssignees<T extends { assigneeId: string | null }>(items: T[]) {
    const ids = [...new Set(items.flatMap((item) => item.assigneeId ? [item.assigneeId] : []))];
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    return items.map((item) => ({ ...item, assignee: item.assigneeId ? byId.get(item.assigneeId) ?? null : null }));
  }

  private async assertWorkspaceResources(organizationId: string, input: {
    clinicId: string; patientId?: string; professionalId?: string; assigneeId?: string;
  }) {
    const resources = await Promise.all([
      this.assertClinic(organizationId, input.clinicId),
      input.patientId ? this.assertPatient(organizationId, input.patientId) : Promise.resolve(),
      input.professionalId ? prisma.professional.findFirst({
        where: { id: input.professionalId, user: { organizationId } }, select: { id: true },
      }) : Promise.resolve({ id: 'opcional' }),
      input.assigneeId ? this.assertUser(organizationId, input.assigneeId) : Promise.resolve(),
    ]);
    if (!resources[2]) throw new NotFoundException('Profissional não encontrado.');
  }

  private async assertClinic(organizationId: string, id: string) {
    const clinic = await prisma.clinic.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
  }

  private async assertPatient(organizationId: string, id: string) {
    const patient = await prisma.patient.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!patient) throw new NotFoundException('Paciente não encontrado.');
  }

  private async assertUser(organizationId: string, id: string) {
    const user = await prisma.user.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
  }
}
