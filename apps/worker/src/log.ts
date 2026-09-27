const SERVICE = 'sonder-worker';

export function isDebugLogEnabled(raw = process.env.LOG_LEVEL): boolean {
  const level = (raw ?? 'info').trim().toLowerCase();
  return level === 'debug' || level === 'verbose' || level === 'trace';
}

export function logDebug(event: string, fields: Record<string, unknown> = {}): void {
  if (!isDebugLogEnabled()) return;
  console.debug(JSON.stringify({ service: SERVICE, event, ...fields }));
}

/**
 * Libera log em info só quando a assinatura do resultado muda, ou como resumo
 * a cada `summaryEveryMs` — evita a mesma linha de sucesso a cada ciclo.
 */
export function createRepeatGate(summaryEveryMs: number) {
  const last = new Map<string, { signature: string; at: number }>();
  return (key: string, signature: string, now = Date.now()): boolean => {
    const previous = last.get(key);
    if (previous && previous.signature === signature && now - previous.at < summaryEveryMs) {
      return false;
    }
    last.set(key, { signature, at: now });
    return true;
  };
}

export const LOG_REPEAT_SUMMARY_MS = Number(process.env.LOG_REPEAT_SUMMARY_MS ?? 60 * 60_000);
