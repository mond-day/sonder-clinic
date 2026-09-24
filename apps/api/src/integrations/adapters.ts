/**
 * Adapters reais gateados por env.
 * Nunca retornam sucesso simulado quando a integração está desabilitada ou a chamada falha.
 */

import { asRecord, fetchJson, integrationMockFlag, pickString, type AdapterResult } from './http';
import { testAbacatePay } from './abacatepay';
import { testChatwoot } from './chatwoot';

export type { AdapterResult } from './http';

/** Nibo recusa Authorization; o token vai no header ApiToken e no query apitoken. */
export function niboAuthHeaders(apiKey: string): Record<string, string> {
  return { ApiToken: apiKey, Accept: 'application/json' };
}

export function niboUrl(baseUrl: string, path: string, apiKey: string): string {
  const root = baseUrl.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const url = `${root}${suffix}`;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}apitoken=${encodeURIComponent(apiKey)}`;
}

export type NiboCatalogEntry = { id: string; name: string; type?: string };

function asNamedList(body: unknown): NiboCatalogEntry[] {
  const rows = Array.isArray(body)
    ? body
    : body && typeof body === 'object'
      ? ((body as { items?: unknown; data?: unknown; value?: unknown }).items
        ?? (body as { data?: unknown }).data
        ?? (body as { value?: unknown }).value
        ?? [])
      : [];
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const item = row as Record<string, unknown>;
    const id = String(
      item.id
      ?? item.accountId
      ?? item.scheduleCategoryId
      ?? item.categoryId
      ?? item.costCenterId
      ?? '',
    );
    const name = String(item.name ?? item.description ?? item.title ?? '');
    if (!id || !name) return [];
    const type = String(item.type ?? item.categoryType ?? '').trim();
    return type ? [{ id, name, type }] : [{ id, name }];
  });
}

export async function fetchNiboCatalog(apiKey: string): Promise<{
  categories: NiboCatalogEntry[];
  costCenters: NiboCatalogEntry[];
  accounts: NiboCatalogEntry[];
  source: 'live' | 'unavailable';
  message?: string;
}> {
  const key = apiKey.trim();
  const mock = integrationMockFlag('NIBO_MOCK');
  if (!key) {
    return {
      categories: [],
      costCenters: [],
      accounts: [],
      source: 'unavailable',
      message: mock
        ? 'Nibo em modo MOCK. Informe os IDs manualmente ou desative NIBO_MOCK para buscar categorias.'
        : 'Informe a API Key do Nibo para buscar categorias.',
    };
  }
  const baseUrl = (process.env.NIBO_BASE_URL ?? 'https://api.nibo.com.br/empresas/v1').replace(/\/$/, '');
  const headers = niboAuthHeaders(key);
  async function tryPaths(paths: string[]): Promise<NiboCatalogEntry[]> {
    for (const path of paths) {
      try {
        const result = await fetchJson(niboUrl(baseUrl, path, key), { headers });
        if (result.ok) {
          const list = asNamedList(result.body);
          if (list.length) return list;
        }
      } catch {
        /* tenta o próximo caminho */
      }
    }
    return [];
  }
  const [categories, costCenters, accounts] = await Promise.all([
    tryPaths(['/categories', '/schedulescategories', '/financialcategories']),
    tryPaths(['/costcenters', '/costCenters']),
    tryPaths(['/accounts', '/Accounts']),
  ]);
  const hasAny = categories.length || costCenters.length || accounts.length;
  return {
    categories,
    costCenters,
    accounts,
    source: hasAny ? 'live' : 'unavailable',
    message: hasAny
      ? undefined
      : 'Não foi possível listar categorias, centros de custo ou contas do Nibo. Teste a conexão e tente novamente.',
  };
}

export async function testEvolution(
  credentials?: Record<string, string>,
  configuration?: unknown,
): Promise<AdapterResult> {
  const mock = integrationMockFlag('EVOLUTION_MOCK');
  const settings = asRecord(configuration) ?? {};
  const baseUrl = pickString(
    credentials?.baseUrl,
    settings.baseUrl,
    process.env.EVOLUTION_BASE_URL,
  );
  const apiKey = pickString(
    credentials?.apiKey,
    process.env.EVOLUTION_API_KEY,
  );
  const instance = pickString(
    credentials?.instanceName,
    credentials?.instance,
    settings.instanceName,
    settings.instance,
    process.env.EVOLUTION_INSTANCE,
  );
  if (mock) {
    return {
      success: false,
      provider: 'EVOLUTION',
      enabled: false,
      message: 'Evolution desabilitada (EVOLUTION_MOCK=true). Nenhum envio foi simulado. Em produção omita a variável ou defina false.',
    };
  }
  if (!baseUrl || !apiKey) {
    return {
      success: false,
      provider: 'EVOLUTION',
      enabled: false,
      message: instance
        ? 'Evolution: informe o endereço do serviço (baseUrl) e a chave de acesso na integração (ou EVOLUTION_BASE_URL / EVOLUTION_API_KEY).'
        : 'Evolution: salve baseUrl, apiKey e nome da instância nesta integração (ou configure EVOLUTION_* no servidor).',
    };
  }
  try {
    const result = await fetchJson(`${baseUrl.replace(/\/$/, '')}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
    });
    const ok = result.ok;
    return {
      success: ok,
      provider: 'EVOLUTION',
      enabled: true,
      message: ok
        ? (instance
          ? `Conexão Evolution confirmada (instância ${instance}).`
          : 'Conexão Evolution confirmada.')
        : `Falha Evolution HTTP ${result.status}. Confira baseUrl e apiKey.`,
      detail: result.body,
    };
  } catch (error) {
    return {
      success: false,
      provider: 'EVOLUTION',
      enabled: true,
      message: `Erro ao contatar Evolution: ${error instanceof Error ? error.message : 'desconhecido'}`,
    };
  }
}

export async function testNibo(apiKey?: string): Promise<AdapterResult> {
  const mock = integrationMockFlag('NIBO_MOCK');
  const baseUrl = process.env.NIBO_BASE_URL ?? 'https://api.nibo.com.br/empresas/v1';
  const apiKeyFromCaller = apiKey?.trim() || '';
  const token = apiKeyFromCaller || process.env.NIBO_API_TOKEN;
  if (!token) {
    return {
      success: false,
      provider: 'NIBO',
      enabled: false,
      message: 'Nibo desabilitado: configure a API Key da conexão ou NIBO_API_TOKEN.',
    };
  }
  if (mock && !apiKeyFromCaller) {
    return {
      success: false,
      provider: 'NIBO',
      enabled: false,
      message: 'Nibo em modo MOCK (NIBO_MOCK=true). Nenhum sucesso foi simulado.',
    };
  }
  try {
    const result = await fetchJson(
      niboUrl(baseUrl.replace(/\/$/, ''), '/categories?$top=1&$orderby=name', token),
      { headers: niboAuthHeaders(token) },
    );
    const unauthorized = result.status === 401;
    return {
      success: result.ok,
      provider: 'NIBO',
      enabled: true,
      message: result.ok
        ? 'Conexão Nibo confirmada.'
        : unauthorized
          ? 'Nibo recusou a chave de acesso (401). Confira a API Key em Empresa → Mais opções → Configurações → API.'
          : `Falha Nibo HTTP ${result.status}.`,
      detail: result.body,
    };
  } catch (error) {
    return {
      success: false,
      provider: 'NIBO',
      enabled: true,
      message: `Erro ao contatar Nibo: ${error instanceof Error ? error.message : 'desconhecido'}`,
    };
  }
}

export async function testGoogleCalendar(): Promise<AdapterResult> {
  const mock = integrationMockFlag('GOOGLE_CALENDAR_MOCK');
  if (mock) {
    return {
      success: false,
      provider: 'GOOGLE_CALENDAR',
      enabled: false,
      message: 'Google Calendar desabilitado (GOOGLE_CALENDAR_MOCK=true).',
    };
  }
  return {
    success: false,
    provider: 'GOOGLE_CALENDAR',
    enabled: true,
    message:
      'Use test-connection na conexão persistida (Client ID/Secret salvos na UI) após OAuth. Env GOOGLE_CLIENT_* é opcional (fallback).',
  };
}

export async function testProvider(provider: string): Promise<AdapterResult> {
  switch (provider) {
    case 'EVOLUTION': return testEvolution();
    case 'NIBO': return testNibo();
    case 'GOOGLE_CALENDAR': return testGoogleCalendar();
    case 'CHATWOOT': return testChatwoot();
    case 'ABACATEPAY': return testAbacatePay();
    default:
      return {
        success: false,
        provider,
        enabled: false,
        message: `Provedor ${provider} sem adapter de teste.`,
      };
  }
}
