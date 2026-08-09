import { BadRequestException, ConflictException } from '@nestjs/common';

export const LAB_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ['IN_LAB', 'CANCELLED'],
  IN_LAB: ['RETURNED', 'CANCELLED'],
  RETURNED: ['INSTALLED', 'CANCELLED'],
  INSTALLED: [],
  CANCELLED: [],
};

export function assertLabStatusTransition(
  from: string,
  to: string,
  cancelReason?: string,
): void {
  if (from === to) return;
  const allowed = LAB_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ConflictException(`Transição de status inválida: ${from} → ${to}.`);
  }
  if (to === 'CANCELLED') {
    const reason = cancelReason?.trim() ?? '';
    if (reason.length < 3) {
      throw new BadRequestException('Cancelamento exige motivo (mín. 3 caracteres).');
    }
  }
}
