export type EvolutionConfiguration = {
  baseUrl: string;
  apiKey: string;
  instance: string;
  delayMs: number;
  minIntervalMs: number;
};

const DEFAULT_DELAY_MS = 1500;
const DEFAULT_MIN_INTERVAL_MS = 4000;
const sendChainByInstance = new Map<string, Promise<void>>();
const lastSentAtByInstance = new Map<string, number>();

const firstString = (source: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
};

function readBoundedInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function evolutionSendPacing(source: Record<string, unknown> = {}): {
  delayMs: number;
  minIntervalMs: number;
} {
  return {
    delayMs: readBoundedInt(
      source.delayMs ?? source.delay ?? process.env.EVOLUTION_SEND_DELAY_MS,
      DEFAULT_DELAY_MS,
      0,
      15_000,
    ),
    minIntervalMs: readBoundedInt(
      source.minIntervalMs ?? source.minInterval ?? process.env.EVOLUTION_MIN_INTERVAL_MS,
      DEFAULT_MIN_INTERVAL_MS,
      0,
      60_000,
    ),
  };
}

export async function waitEvolutionSendSlot(instance: string, minIntervalMs: number) {
  if (minIntervalMs <= 0) return;
  const previous = sendChainByInstance.get(instance) ?? Promise.resolve();
  const turn = previous.catch(() => undefined).then(async () => {
    const elapsed = Date.now() - (lastSentAtByInstance.get(instance) ?? 0);
    const wait = minIntervalMs - elapsed;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastSentAtByInstance.set(instance, Date.now());
  });
  sendChainByInstance.set(instance, turn.then(() => undefined));
  await turn;
}

export function readEvolutionConfiguration(
  credentials: Record<string, string>,
  configuration: unknown,
): EvolutionConfiguration | null {
  const settings =
    configuration && typeof configuration === 'object' && !Array.isArray(configuration)
      ? (configuration as Record<string, unknown>)
      : {};
  const env: Record<string, unknown> = {
    EVOLUTION_BASE_URL: process.env.EVOLUTION_BASE_URL,
    BASE_URL: process.env.EVOLUTION_BASE_URL,
    baseUrl: process.env.EVOLUTION_BASE_URL,
    EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY,
    API_KEY: process.env.EVOLUTION_API_KEY,
    apiKey: process.env.EVOLUTION_API_KEY,
    EVOLUTION_INSTANCE: process.env.EVOLUTION_INSTANCE,
    INSTANCE_NAME: process.env.EVOLUTION_INSTANCE,
    instance: process.env.EVOLUTION_INSTANCE,
  };
  const baseUrl =
    firstString(credentials, ['EVOLUTION_BASE_URL', 'BASE_URL', 'baseUrl']) ??
    firstString(settings, ['baseUrl', 'BASE_URL', 'EVOLUTION_BASE_URL']) ??
    firstString(env, ['EVOLUTION_BASE_URL', 'BASE_URL', 'baseUrl']);
  const apiKey =
    firstString(credentials, ['EVOLUTION_API_KEY', 'API_KEY', 'apiKey', 'apikey']) ??
    firstString(settings, ['apiKey', 'API_KEY', 'EVOLUTION_API_KEY']) ??
    firstString(env, ['EVOLUTION_API_KEY', 'API_KEY', 'apiKey']);
  const instance =
    firstString(credentials, ['EVOLUTION_INSTANCE', 'INSTANCE_NAME', 'instance', 'instanceName']) ??
    firstString(settings, ['instance', 'instanceName', 'INSTANCE_NAME', 'EVOLUTION_INSTANCE']) ??
    firstString(env, ['EVOLUTION_INSTANCE', 'INSTANCE_NAME', 'instance']);

  if (!baseUrl || !apiKey || !instance) return null;
  const pacing = evolutionSendPacing({ ...settings, ...credentials });
  return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, instance, ...pacing };
}

export async function sendEvolutionText(
  config: EvolutionConfiguration,
  number: string,
  text: string,
): Promise<void> {
  await waitEvolutionSendSlot(config.instance, config.minIntervalMs);
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const response = await fetch(
    `${baseUrl}/message/sendText/${encodeURIComponent(config.instance)}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: config.apiKey,
      },
      body: JSON.stringify({
        number,
        text,
        delay: config.delayMs,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 300);
    throw new Error(
      `Evolution respondeu HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
    );
  }
}
