import { BadRequestException } from '@nestjs/common';

export const MIN_PASSWORD_LENGTH = 8;

export function assertPasswordPolicy(password: string): void {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestException(`A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
}
