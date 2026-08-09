import { z } from 'zod';

export const prescriptionItemSchema = z.object({
  medicationName: z.string().trim().min(1, 'Informe o medicamento/item.'),
  concentration: z.string().trim().optional(),
  pharmaceuticalForm: z.string().trim().optional(),
  route: z.string().trim().optional(),
  quantity: z.string().trim().min(1, 'Informe a quantidade.'),
  dosage: z.string().trim().min(1, 'Informe a posologia.'),
  frequency: z.string().trim().optional(),
  duration: z.string().trim().optional(),
  instructions: z.string().trim().optional(),
});

export const generateDocumentSchema = z.object({
  templateId: z.string().uuid('Selecione o modelo.'),
  professionalId: z.string().uuid().optional().or(z.literal('')),
  treatmentId: z.string().uuid().optional().or(z.literal('')),
  folderId: z.string().uuid().optional().or(z.literal('')),
  corpo: z.string().trim().min(2, 'Informe o conteúdo clínico.'),
  observacoes: z.string().trim().optional(),
});

export const prescriptionSchema = z.object({
  professionalId: z.string().uuid('Selecione o profissional.'),
  purpose: z.string().trim().min(3, 'Informe a finalidade.'),
  folderId: z.string().uuid().optional().or(z.literal('')),
  items: z.array(prescriptionItemSchema).min(1, 'Inclua ao menos um item.'),
  notes: z.string().trim().optional(),
});

export const certificateSchema = z
  .object({
    templateId: z.string().uuid().optional().or(z.literal('')),
    professionalId: z.string().uuid('Selecione o profissional.'),
    mode: z.enum(['days', 'hours', 'attendance']),
    attendanceDate: z.string().min(1, 'Informe a data.'),
    days: z.coerce.number().int().min(1).optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    cid: z.string().trim().optional(),
    cidAuthorized: z.boolean().optional(),
    notes: z.string().trim().optional(),
    folderId: z.string().uuid().optional().or(z.literal('')),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'days' && (!value.days || value.days < 1)) {
      ctx.addIssue({ code: 'custom', message: 'Informe a quantidade de dias.', path: ['days'] });
    }
    if (value.mode === 'hours' && (!value.startTime || !value.endTime)) {
      ctx.addIssue({ code: 'custom', message: 'Informe o intervalo de horas.', path: ['startTime'] });
    }
    if (value.cid?.trim() && !value.cidAuthorized) {
      ctx.addIssue({
        code: 'custom',
        message: 'Para incluir CID, registre a autorização do paciente.',
        path: ['cidAuthorized'],
      });
    }
    if (value.cidAuthorized && !value.cid?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe o CID autorizado.',
        path: ['cid'],
      });
    }
  });

export const examRequestItemSchema = z.object({
  name: z.string().trim().min(2, 'Informe o exame.'),
  clinicalIndication: z.string().trim().optional(),
  laterality: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const examRequestSchema = z.object({
  templateId: z.string().uuid().optional().or(z.literal('')),
  professionalId: z.string().uuid('Selecione o profissional.'),
  clinicalQuestion: z.string().trim().optional(),
  urgency: z.enum(['ROUTINE', 'URGENT', 'STAT']).default('ROUTINE'),
  items: z.array(examRequestItemSchema).min(1, 'Inclua ao menos um exame.'),
  notes: z.string().trim().optional(),
  folderId: z.string().uuid().optional().or(z.literal('')),
});

export const consentSchema = z.object({
  templateId: z.string().uuid().optional().or(z.literal('')),
  professionalId: z.string().uuid('Selecione o profissional.'),
  treatmentId: z.string().uuid().optional().or(z.literal('')),
  procedureSummary: z.string().trim().min(3, 'Descreva o procedimento.'),
  risks: z.string().trim().min(3, 'Informe os riscos.'),
  alternatives: z.string().trim().optional(),
  patientAcknowledged: z.boolean().refine((value) => value === true, {
    message: 'Confirme que o paciente foi informado.',
  }),
  notes: z.string().trim().optional(),
  folderId: z.string().uuid().optional().or(z.literal('')),
});

export const referralSchema = z.object({
  templateId: z.string().uuid().optional().or(z.literal('')),
  professionalId: z.string().uuid('Selecione o profissional.'),
  specialty: z.string().trim().optional(),
  recipientName: z.string().trim().optional(),
  clinicalReason: z.string().trim().min(3, 'Informe o motivo clínico.'),
  urgency: z.enum(['ROUTINE', 'URGENT', 'STAT']).default('ROUTINE'),
  notes: z.string().trim().optional(),
  folderId: z.string().uuid().optional().or(z.literal('')),
});

export const uploadSchema = z.object({
  folderId: z.string().uuid().optional().or(z.literal('')),
  type: z.string().min(1),
  notes: z.string().trim().optional(),
});

export const shareSchema = z.object({
  signerRole: z.string().trim().min(2, 'Informe o papel do signatário.'),
  signerName: z.string().trim().min(2, 'Informe o nome do signatário.'),
  expiresInHours: z.coerce.number().int().min(1).max(168).default(72),
});

export const folderSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da pasta.'),
});

export type GenerateDocumentInput = z.infer<typeof generateDocumentSchema>;
export type PrescriptionInput = z.infer<typeof prescriptionSchema>;
export type CertificateInput = z.infer<typeof certificateSchema>;
export type ExamRequestInput = z.infer<typeof examRequestSchema>;
export type ConsentInput = z.infer<typeof consentSchema>;
export type ReferralInput = z.infer<typeof referralSchema>;
export type ShareInput = z.infer<typeof shareSchema>;
