import { Prisma, prisma } from '@sonder/database';

function advanceOccurrence(from: Date, frequency: string, interval: number): Date {
  const next = new Date(from);
  const step = Math.max(1, interval);
  switch (frequency) {
    case 'DAILY':
      next.setUTCDate(next.getUTCDate() + step);
      break;
    case 'WEEKLY':
      next.setUTCDate(next.getUTCDate() + 7 * step);
      break;
    case 'YEARLY':
      next.setUTCFullYear(next.getUTCFullYear() + step);
      break;
    case 'MONTHLY':
    default:
      next.setUTCMonth(next.getUTCMonth() + step);
      break;
  }
  return next;
}

export async function processDueFinanceRecurrences(now = new Date()): Promise<number> {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const due = await prisma.financeRecurrence.findMany({
    where: {
      active: true,
      nextOccurrence: { lte: today },
    },
    take: 50,
    orderBy: { nextOccurrence: 'asc' },
  });

  let generated = 0;
  for (const recurrence of due) {
    try {
      const ok = await materialize(recurrence);
      if (ok) generated += 1;
    } catch (error) {
      console.error(JSON.stringify({
        service: 'sonder-worker',
        event: 'finance-recurrence.failed',
        recurrenceId: recurrence.id,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }
  return generated;
}

async function materialize(recurrence: {
  id: string;
  organizationId: string;
  clinicId: string;
  kind: string;
  description: string;
  amount: Prisma.Decimal;
  frequency: string;
  interval: number;
  nextOccurrence: Date;
  endsAt: Date | null;
  metadata: unknown;
}): Promise<boolean> {
  const occurrence = new Date(recurrence.nextOccurrence);
  if (recurrence.endsAt && occurrence > recurrence.endsAt) {
    await prisma.financeRecurrence.update({
      where: { id: recurrence.id },
      data: { active: false },
    });
    return false;
  }

  const metadata = (recurrence.metadata ?? {}) as Record<string, unknown>;
  const dueDate = occurrence;
  const description = `${recurrence.description} (${dueDate.toISOString().slice(0, 10)})`;

  await prisma.$transaction(async (tx) => {
    if (recurrence.kind === 'PAYABLE') {
      await tx.payable.create({
        data: {
          organizationId: recurrence.organizationId,
          clinicId: recurrence.clinicId,
          description,
          originalAmount: recurrence.amount,
          dueDate,
          supplierName: typeof metadata.supplierName === 'string' ? metadata.supplierName : undefined,
          notes: typeof metadata.notes === 'string' ? metadata.notes : `Gerado pela recorrência ${recurrence.id}`,
        },
      });
    } else if (recurrence.kind === 'RECEIVABLE') {
      const patientId = typeof metadata.patientId === 'string' ? metadata.patientId : null;
      if (!patientId) throw new Error('Recorrência RECEIVABLE sem patientId.');
      await tx.receivable.create({
        data: {
          organizationId: recurrence.organizationId,
          clinicId: recurrence.clinicId,
          patientId,
          description,
          originalAmount: recurrence.amount,
          discount: new Prisma.Decimal(0),
          surcharge: new Prisma.Decimal(0),
          netAmount: recurrence.amount,
          dueDate,
        },
      });
    } else {
      throw new Error(`kind inválido: ${recurrence.kind}`);
    }

    const nextOccurrence = advanceOccurrence(occurrence, recurrence.frequency, recurrence.interval);
    const exhausted = Boolean(recurrence.endsAt && nextOccurrence > recurrence.endsAt);
    await tx.financeRecurrence.update({
      where: { id: recurrence.id },
      data: {
        nextOccurrence,
        active: exhausted ? false : true,
      },
    });
  });

  return true;
}
