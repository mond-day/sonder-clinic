/**
 * Regras puras do lifecycle de atualização de anamnese (RC estabilização).
 * A origem permanece vigente até a nova versão ser finalizada.
 */

export type LifecycleOrigin = {
  id: string;
  status: string;
  supersededById?: string | null;
  organizationId: string;
};

export type LifecycleDraft = {
  id: string;
  status: string;
  sourceResponseId?: string | null;
  organizationId: string;
};

export function canCreateUpdateFrom(status: string, effectiveStatus?: string): boolean {
  return status === 'SIGNED' || status === 'EXPIRED' || effectiveStatus === 'EXPIRED';
}

export function assertOriginStillReplaceable(origin: LifecycleOrigin, draftId: string): void {
  if (origin.supersededById && origin.supersededById !== draftId) {
    throw Object.assign(new Error('CONFLICT_ALREADY_SUPERSEDED'), { code: 409 });
  }
  if (origin.status === 'SUPERSEDED') {
    throw Object.assign(new Error('CONFLICT_ALREADY_SUPERSEDED'), { code: 409 });
  }
}

export function nextStatusesOnFinalizeUpdate(input: {
  origin: LifecycleOrigin;
  draft: LifecycleDraft;
}): { originStatus: 'SUPERSEDED'; draftStatus: 'SIGNED'; supersededById: string } {
  if (!input.draft.sourceResponseId || input.draft.sourceResponseId !== input.origin.id) {
    throw Object.assign(new Error('INVALID_SOURCE'), { code: 400 });
  }
  if (input.origin.organizationId !== input.draft.organizationId) {
    throw Object.assign(new Error('TENANT_MISMATCH'), { code: 409 });
  }
  assertOriginStillReplaceable(input.origin, input.draft.id);
  return {
    originStatus: 'SUPERSEDED',
    draftStatus: 'SIGNED',
    supersededById: input.draft.id,
  };
}

export function originAfterCreateUpdate(originStatus: string): string {
  // Origem permanece inalterada ao criar DRAFT de atualização.
  return originStatus;
}
