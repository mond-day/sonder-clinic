import { z } from 'zod';

const money = z
  .string()
  .regex(/^\d+([.,]\d{1,2})?$/, 'Informe um valor monetário válido.')
  .transform((value) => value.replace(',', '.'));

export const treatmentItemDraftSchema = z.object({
  procedureId: z.string().uuid('Selecione o procedimento.'),
  professionalId: z.string().uuid('Selecione o profissional.'),
  toothFdi: z.string().trim().optional(),
  face: z.string().trim().optional(),
  quantity: z.coerce.number().int().min(1, 'Quantidade inválida.'),
  unitPrice: money,
  discount: money.optional().default('0'),
  plannedSessions: z.coerce.number().int().min(1).default(1),
  urgent: z.boolean().optional().default(false),
});

export const createTreatmentSchema = z.object({
  title: z.string().trim().min(3, 'Informe o título do tratamento.'),
  professionalId: z.string().uuid('Selecione o profissional responsável.'),
  discount: money.optional().default('0'),
  notes: z.string().trim().optional(),
  validUntil: z.string().optional(),
  items: z.array(treatmentItemDraftSchema).min(1, 'Inclua ao menos um procedimento.'),
});

export const updateTreatmentSchema = z.object({
  title: z.string().trim().min(3).optional(),
  notes: z.string().trim().optional(),
  discount: money.optional(),
  validUntil: z.string().nullable().optional(),
  version: z.number().int().min(1).optional(),
});

export const sessionSchema = z.object({
  professionalId: z.string().uuid('Selecione o profissional.'),
  executionNotes: z.string().trim().min(2, 'Descreva a sessão.'),
  complications: z.string().trim().optional(),
  allowExtraSession: z.boolean().optional(),
});

export const cancelReasonSchema = z.object({
  reason: z.string().trim().min(3, 'Informe o motivo (mín. 3 caracteres).'),
});

export const evolutionSchema = z.object({
  professionalId: z.string().uuid('Selecione o profissional.'),
  renderedText: z.string().trim().min(2, 'Descreva a evolução.'),
  treatmentItemId: z.string().uuid().optional(),
});

export type CreateTreatmentInput = z.infer<typeof createTreatmentSchema>;
export type UpdateTreatmentInput = z.infer<typeof updateTreatmentSchema>;
export type SessionInput = z.infer<typeof sessionSchema>;
