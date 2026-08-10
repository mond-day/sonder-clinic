export type AnamnesisPersistedStatus =
  | 'DRAFT'
  | 'AWAITING_SIGNATURE'
  | 'SIGNED'
  | 'EXPIRED'
  | 'SUPERSEDED'
  | 'CANCELLED';

export type AnamnesisEffectiveStatus = AnamnesisPersistedStatus;

/**
 * Status efetivo para UX/API.
 * Job no worker materializa EXPIRED no banco; este helper cobre leituras sem esperar o cron.
 */
export function effectiveAnamnesisStatus(
  response: { status: string; validUntil?: Date | string | null },
  now: Date = new Date(),
): AnamnesisEffectiveStatus {
  const status = response.status as AnamnesisPersistedStatus;
  if (status === 'SUPERSEDED' || status === 'CANCELLED' || status === 'DRAFT'
    || status === 'AWAITING_SIGNATURE' || status === 'EXPIRED') {
    return status;
  }
  if (status === 'SIGNED') {
    if (!response.validUntil) return 'SIGNED';
    const until = response.validUntil instanceof Date
      ? response.validUntil
      : new Date(response.validUntil);
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const validDay = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), until.getUTCDate()));
    if (validDay < day) return 'EXPIRED';
    return 'SIGNED';
  }
  return status;
}

export function withEffectiveStatus<T extends { status: string; validUntil?: Date | string | null }>(
  response: T,
  now?: Date,
): T & { effectiveStatus: AnamnesisEffectiveStatus } {
  return {
    ...response,
    effectiveStatus: effectiveAnamnesisStatus(response, now),
  };
}
