export type EvolutionConfiguration = {
  baseUrl: string;
  apiKey: string;
  instance: string;
};

const firstString = (source: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
};

export function readEvolutionConfiguration(
  credentials: Record<string, string>,
  configuration: unknown,
): EvolutionConfiguration | null {
  const settings =
    configuration && typeof configuration === 'object' && !Array.isArray(configuration)
      ? (configuration as Record<string, unknown>)
      : {};
  const baseUrl =
    firstString(credentials, ['EVOLUTION_BASE_URL', 'BASE_URL', 'baseUrl']) ??
    firstString(settings, ['baseUrl', 'BASE_URL']);
  const apiKey = firstString(credentials, ['EVOLUTION_API_KEY', 'API_KEY', 'apiKey', 'apikey']);
  const instance =
    firstString(credentials, ['EVOLUTION_INSTANCE', 'INSTANCE_NAME', 'instance']) ??
    firstString(settings, ['instance', 'instanceName', 'INSTANCE_NAME']);

  if (!baseUrl || !apiKey || !instance) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, instance };
}

export async function sendEvolutionText(
  config: EvolutionConfiguration,
  number: string,
  text: string,
): Promise<void> {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const response = await fetch(
    `${baseUrl}/message/sendText/${encodeURIComponent(config.instance)}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: config.apiKey,
      },
      body: JSON.stringify({ number, text }),
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
