import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { createMessageTemplate } from './patients-guardians-merge.utils';

describe('createMessageTemplate validation', () => {
  it('rejeita variáveis não permitidas sem tocar no banco', async () => {
    await expect(
      createMessageTemplate('00000000-0000-4000-8000-000000000001', {
        name: 'Teste inválido',
        category: 'REMINDER',
        content: 'Olá {{hacked}}',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
