import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '../../common/password-policy';

const taxIdSchema = z.string().trim().max(32).optional().transform((value, ctx) => {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11 && digits.length !== 14) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'CNPJ/CPF deve ter 11 ou 14 dígitos.',
    });
    return z.NEVER;
  }
  return digits;
});

export const initializeSetupSchema = z.object({
  organization: z.object({
    legalName: z.string().trim().min(2).max(200),
    tradeName: z.string().trim().min(2).max(200),
    taxId: taxIdSchema,
  }),
  clinic: z.object({
    legalName: z.string().trim().min(2).max(200),
    tradeName: z.string().trim().min(2).max(200),
    taxId: taxIdSchema,
  }),
  unit: z.object({
    name: z.string().trim().min(2).max(80),
    city: z.string().trim().max(120).optional(),
    timezone: z.string().trim().min(3).max(64).optional(),
  }),
  admin: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  }),
});

export type InitializeSetupInput = z.infer<typeof initializeSetupSchema>;

export type SetupState = 'EMPTY' | 'READY' | 'INCONSISTENT';

export type SetupStatus = {
  required: boolean;
  state: SetupState;
};

export function classifySetupState(input: {
  installationExists: boolean;
  organizationCount: number;
  userCount: number;
}): SetupStatus {
  if (input.installationExists) {
    return { required: false, state: 'READY' };
  }
  if (input.organizationCount === 0 && input.userCount === 0) {
    return { required: true, state: 'EMPTY' };
  }
  return { required: false, state: 'INCONSISTENT' };
}
