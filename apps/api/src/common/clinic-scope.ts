import { ForbiddenException } from '@nestjs/common';
import { prisma } from '@sonder/database';

const ORG_WIDE_PERMISSIONS = new Set([
  'users.manage',
  'organization.manage',
  'clinic.manage',
]);

export type ClinicScope = {
  /** null = acesso à organização inteira */
  clinicIds: string[] | null;
};

/**
 * Escopo de clínicas do usuário.
 * - Sem ProfessionalClinic (recepção/admin operacional) → org-wide.
 * - Com vínculo ProfessionalClinic ativo → só essas clínicas.
 * - Permissões users.manage / organization.manage / clinic.manage → org-wide.
 */
export async function resolveClinicScope(
  organizationId: string,
  userId: string,
  permissions: string[],
): Promise<ClinicScope> {
  if (permissions.some((code) => ORG_WIDE_PERMISSIONS.has(code))) {
    return { clinicIds: null };
  }

  const professional = await prisma.professional.findFirst({
    where: { userId, user: { organizationId } },
    select: {
      id: true,
      clinicLinks: {
        where: { active: true },
        select: { clinicId: true },
      },
    },
  });

  if (!professional || professional.clinicLinks.length === 0) {
    return { clinicIds: null };
  }

  return { clinicIds: professional.clinicLinks.map((row) => row.clinicId) };
}

export function assertClinicInScope(scope: ClinicScope, clinicId: string): void {
  if (scope.clinicIds && !scope.clinicIds.includes(clinicId)) {
    throw new ForbiddenException('Sem acesso a esta clínica.');
  }
}

export function clinicWhere(scope: ClinicScope): { clinicId?: { in: string[] } } {
  if (!scope.clinicIds) return {};
  return { clinicId: { in: scope.clinicIds } };
}

export function patientClinicFilter(scope: ClinicScope):
  | Record<string, never>
  | { clinics: { some: { clinicId: { in: string[] } } } } {
  if (!scope.clinicIds) return {};
  return { clinics: { some: { clinicId: { in: scope.clinicIds } } } };
}
