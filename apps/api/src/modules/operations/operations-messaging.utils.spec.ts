import { describe, expect, it } from 'vitest';
import { renderMessageTemplate } from './operations-messaging.utils';

describe('renderMessageTemplate', () => {
  it('substitutes known variables', () => {
    expect(renderMessageTemplate('Olá {{patientName}} em {{date}}', {
      patientName: 'Ana',
      date: '07/08/2026',
      clinicName: '',
      professionalName: '',
    })).toBe('Olá Ana em 07/08/2026');
  });

  it('keeps unknown placeholders as-is', () => {
    expect(renderMessageTemplate('Oi {{unknown}}', {
      patientName: '',
      date: '',
      clinicName: '',
      professionalName: '',
    })).toBe('Oi {{unknown}}');
  });
});
