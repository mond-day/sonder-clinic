import { ConflictException } from '@nestjs/common';
import { Prisma } from '@sonder/database';

/** Mapeia violação de EXCLUDE (23P01) para 409 legível. */
export function rethrowAppointmentConstraint(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === 'P2002' || error.code === '23P01' || String(error.message).includes('23P01')
      || String(error.message).includes('appointment_professional_no_overlap')
      || String(error.message).includes('appointment_chair_no_overlap')
      || String(error.message).includes('conflicting key value'))
  ) {
    throw new ConflictException({
      code: 'APPOINTMENT_RESOURCE_CONFLICT',
      message: 'O horário selecionado está em conflito com outro agendamento.',
    });
  }
  // Postgres exclusion via $execute / raw surfaces as PrismaClientUnknownRequestError
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    const msg = error.message;
    if (
      msg.includes('23P01')
      || msg.includes('appointment_professional_no_overlap')
      || msg.includes('appointment_chair_no_overlap')
      || msg.includes('exclusion constraint')
    ) {
      throw new ConflictException({
        code: 'APPOINTMENT_RESOURCE_CONFLICT',
        message: 'O horário selecionado está em conflito com outro agendamento.',
      });
    }
  }
  throw error;
}
