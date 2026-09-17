/**
 * Parse de flags de ambiente (MOCK, feature toggles).
 *
 * - true / 1 / yes / y / on → ligado
 * - false / 0 / no / n / off → desligado
 * - ausente / vazio → fallback (para *_MOCK o padrão seguro em dev é true)
 * - aspas envolventes são removidas (ex.: "false" no Swarm/YAML)
 */

export type EnvFlagInfo = {
  /** Valor interpretado (true = flag ligada). */
  value: boolean;
  /** Env var presente e não vazia após trim/unquote. */
  present: boolean;
  /** Token normalizado (lowercase) ou null se ausente. */
  raw: string | null;
};

const TRUTHY = new Set(['true', '1', 'yes', 'y', 'on']);
const FALSY = new Set(['false', '0', 'no', 'n', 'off']);

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
    || (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

export function parseEnvFlag(
  raw: string | undefined | null,
  fallbackWhenAbsent = true,
): EnvFlagInfo {
  if (raw == null) {
    return { value: fallbackWhenAbsent, present: false, raw: null };
  }
  const trimmed = stripWrappingQuotes(String(raw).trim());
  if (!trimmed) {
    return { value: fallbackWhenAbsent, present: false, raw: null };
  }
  const normalized = trimmed.toLowerCase();
  if (TRUTHY.has(normalized)) {
    return { value: true, present: true, raw: normalized };
  }
  if (FALSY.has(normalized)) {
    return { value: false, present: true, raw: normalized };
  }
  // Valor desconhecido: trata como ausente semântico e usa fallback (fail-closed p/ MOCK).
  return { value: fallbackWhenAbsent, present: true, raw: normalized };
}

export function readEnvFlag(
  name: string,
  fallbackWhenAbsent = true,
  env: NodeJS.ProcessEnv = process.env,
): EnvFlagInfo {
  return parseEnvFlag(env[name], fallbackWhenAbsent);
}

/** Atalho booleano — preferir readEnvFlag quando a UI/API precisa de diagnóstico. */
export function envFlagEnabled(
  name: string,
  fallbackWhenAbsent = true,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return readEnvFlag(name, fallbackWhenAbsent, env).value;
}
