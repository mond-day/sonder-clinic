import { ConflictException } from '@nestjs/common';
import { Prisma } from '@sonder/database';

/** Status que ocupam a agenda (iguais ao WHERE das exclusion constraints). */
export const OCCUPYING_APPOINTMENT_STATUSES = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] as const;

export const PROFESSIONAL_OVERLAP_MESSAGE = 'O horário selecionado está em conflito com outro agendamento.';
export const CHAIR_OVERLAP_MESSAGE = 'Essa cadeira já tem um atendimento nesse horário.';

export function appointmentOccupiesAgenda(status: string | undefined) {
  return status == null || (OCCUPYING_APPOINTMENT_STATUSES as readonly string[]).includes(status);
}

export function appointmentConflictBody(
  conflict: { id: string; professionalId: string },
  input: { professionalId: string },
) {
  const resourceType = conflict.professionalId === input.professionalId ? 'PROFESSIONAL' as const : 'CHAIR' as const;
  return {
    code: 'APPOINTMENT_RESOURCE_CONFLICT' as const,
    message: resourceType === 'CHAIR' ? CHAIR_OVERLAP_MESSAGE : PROFESSIONAL_OVERLAP_MESSAGE,
    details: {
      conflictingAppointmentId: conflict.id,
      resourceType,
    },
  };
}

function overlapMessageFromDatabase(raw: string): string | null {
  if (raw.includes('appointment_chair_no_overlap')) return CHAIR_OVERLAP_MESSAGE;
  if (
    raw.includes('appointment_professional_no_overlap')
    || raw.includes('23P01')
    || raw.includes('exclusion constraint')
    || raw.includes('conflicting key value')
  ) {
    return PROFESSIONAL_OVERLAP_MESSAGE;
  }
  return null;
}

/** Mapeia violação de EXCLUDE (23P01) para 409 legível. */
export function rethrowAppointmentConstraint(error: unknown): never {
  const raw = error instanceof Error ? error.message : '';
  const mapped = overlapMessageFromDatabase(raw);
  const known = error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === 'P2002' || error.code === '23P01' || mapped != null);
  const unknown = error instanceof Prisma.PrismaClientUnknownRequestError && mapped != null;
  if (known || unknown) {
    throw new ConflictException({
      code: 'APPOINTMENT_RESOURCE_CONFLICT',
      message: raw.includes('appointment_chair_no_overlap') ? CHAIR_OVERLAP_MESSAGE : PROFESSIONAL_OVERLAP_MESSAGE,
    });
  }
  throw error;
}
