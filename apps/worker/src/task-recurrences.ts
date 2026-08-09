import { Prisma, prisma } from '@sonder/database';

function advanceTaskOccurrence(from: Date, frequency: string, interval = 1): Date {
  const next = new Date(from);
  const step = Math.max(1, interval);
  switch (frequency.toUpperCase()) {
    case 'DAILY':
      next.setUTCDate(next.getUTCDate() + step);
      break;
    case 'WEEKLY':
      next.setUTCDate(next.getUTCDate() + 7 * step);
      break;
    case 'MONTHLY':
    default:
      next.setUTCMonth(next.getUTCMonth() + step);
      break;
  }
  return next;
}

function taskOccurrenceKey(sourceTaskId: string, occurrence: Date): string {
  return `${sourceTaskId}:${occurrence.toISOString().slice(0, 10)}`;
}

/**
 * Gera ocorrências de tarefas recorrentes de forma idempotente.
 * Usa Task.occurrenceKey = `${sourceTaskId}:${YYYY-MM-DD}` para evitar duplicatas.
 */
export async function processDueTaskRecurrences(now = new Date()): Promise<number> {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const due = await prisma.taskRecurrence.findMany({
    where: {
      active: true,
      nextOccurrence: { lte: today },
    },
    include: { task: true },
    take: 50,
    orderBy: { nextOccurrence: 'asc' },
  });

  let generated = 0;
  for (const recurrence of due) {
    try {
      const ok = await materializeTaskOccurrence(recurrence);
      if (ok) generated += 1;
    } catch (error) {
      console.error(JSON.stringify({
        service: 'sonder-worker',
        event: 'task-recurrence.failed',
        recurrenceId: recurrence.id,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }
  return generated;
}

async function materializeTaskOccurrence(recurrence: {
  id: string;
  taskId: string;
  frequency: string;
  interval: number;
  endsAt: Date | null;
  nextOccurrence: Date | null;
  task: {
    id: string;
    organizationId: string;
    clinicId: string;
    title: string;
    description: string | null;
    category: string;
    priority: string;
    assigneeId: string | null;
    patientId: string | null;
    createdById: string | null;
  };
}): Promise<boolean> {
  if (!recurrence.nextOccurrence) return false;
  const occurrence = new Date(recurrence.nextOccurrence);
  if (recurrence.endsAt && occurrence > recurrence.endsAt) {
    await prisma.taskRecurrence.update({
      where: { id: recurrence.id },
      data: { active: false },
    });
    return false;
  }

  const key = taskOccurrenceKey(recurrence.taskId, occurrence);
  const existing = await prisma.task.findUnique({ where: { occurrenceKey: key } });
  if (existing) {
    const next = advanceTaskOccurrence(occurrence, recurrence.frequency, recurrence.interval);
    await prisma.taskRecurrence.update({
      where: { id: recurrence.id },
      data: {
        nextOccurrence: recurrence.endsAt && next > recurrence.endsAt ? null : next,
        active: !(recurrence.endsAt && next > recurrence.endsAt),
      },
    });
    return false;
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.create({
      data: {
        organizationId: recurrence.task.organizationId,
        clinicId: recurrence.task.clinicId,
        title: recurrence.task.title,
        description: recurrence.task.description,
        category: recurrence.task.category as never,
        priority: recurrence.task.priority as never,
        status: 'INBOX',
        dueAt: occurrence,
        assigneeId: recurrence.task.assigneeId,
        patientId: recurrence.task.patientId,
        createdById: recurrence.task.createdById,
        sourceTaskId: recurrence.taskId,
        occurrenceKey: key,
      },
    });
    await tx.taskActivity.create({
      data: {
        taskId: recurrence.taskId,
        type: 'RECURRENCE_GENERATED',
        payload: { occurrenceKey: key, occurrence: occurrence.toISOString() } as Prisma.InputJsonValue,
      },
    });
    const next = advanceTaskOccurrence(occurrence, recurrence.frequency, recurrence.interval);
    const ended = Boolean(recurrence.endsAt && next > recurrence.endsAt);
    await tx.taskRecurrence.update({
      where: { id: recurrence.id },
      data: {
        nextOccurrence: ended ? null : next,
        active: !ended,
      },
    });
  });
  return true;
}
