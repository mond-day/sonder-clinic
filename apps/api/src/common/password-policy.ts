import { BadRequestException } from '@nestjs/common';

export const MIN_PASSWORD_LENGTH = 10;

const PASSWORD_HINT =
  `A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres, com maiúscula, minúscula e número.`;

export function assertPasswordPolicy(password: string): void {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestException(PASSWORD_HINT);
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new BadRequestException(PASSWORD_HINT);
  }
}
