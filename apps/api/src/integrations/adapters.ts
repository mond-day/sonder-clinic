/**
 * Adapters reais gateados por env.
 * Nunca retornam sucesso simulado quando a integração está desabilitada ou a chamada falha.
 */

import { envFlag, fetchJson, type AdapterResult } from './http';
import { testAbacatePay } from './abacatepay';
import { testChatwoot } from './chatwoot';

export type { AdapterResult } from './http';

function asNamedList(body: unknown): Array<{ id: string; name: string }> {
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
    const id = String(item.id ?? item.scheduleCategoryId ?? item.categoryId ?? item.costCenterId ?? '');
    const name = String(item.name ?? item.description ?? item.title ?? '');
    if (!id || !name) return [];
    return [{ id, name }];
  });
}

export async function fetchNiboCatalog(apiKey: string): Promise<{
  categories: Array<{ id: string; name: string }>;
  costCenters: Array<{ id: string; name: string }>;
  source: 'live' | 'unavailable';
  message?: string;
}> {
  const mock = envFlag('NIBO_MOCK', 'true');
  if (mock) {
    return {
      categories: [],
      costCenters: [],
      source: 'unavailable',
      message: 'Nibo em modo MOCK. Informe os IDs manualmente ou desative NIBO_MOCK para buscar categorias.',
    };
  }
  const baseUrl = (process.env.NIBO_BASE_URL ?? 'https://api.nibo.com.br/empresas/v1').replace(/\/$/, '');
  const headersList: Array<Record<string, string>> = [
    { apitoken: apiKey, Accept: 'application/json' },
    { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  ];
  async function tryPaths(paths: string[]): Promise<Array<{ id: string; name: string }>> {
    for (const headers of headersList) {
      for (const path of paths) {
        try {
          const result = await fetchJson(`${baseUrl}${path}`, { headers });
          if (result.ok) {
            const list = asNamedList(result.body);
            if (list.length) return list;
          }
        } catch {
          /* tenta o próximo caminho */
        }
      }
    }
    return [];
  }
  const categories = await tryPaths(['/schedulescategories', '/categories', '/financialcategories']);
  const costCenters = await tryPaths(['/costcenters', '/costCenters']);
  return {
    categories,
    costCenters,
    source: categories.length || costCenters.length ? 'live' : 'unavailable',
    message: categories.length || costCenters.length
      ? undefined
      : 'Não foi possível listar categorias do Nibo. Informe os IDs manualmente.',
  };
}

export async function testEvolution(): Promise<AdapterResult> {
  const mock = envFlag('EVOLUTION_MOCK', 'true');
  const baseUrl = process.env.EVOLUTION_BASE_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (mock || !baseUrl || !apiKey) {
    return {
      success: false,
      provider: 'EVOLUTION',
      enabled: false,
      message: mock
        ? 'Evolution desabilitada (EVOLUTION_MOCK=true). Nenhum envio foi simulado.'
        : 'Evolution desabilitada: configure EVOLUTION_BASE_URL e EVOLUTION_API_KEY.',
    };
  }
  try {
    const result = await fetchJson(`${baseUrl.replace(/\/$/, '')}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
    });
    return {
      success: result.ok,
      provider: 'EVOLUTION',
      enabled: true,
      message: result.ok ? 'Conexão Evolution confirmada.' : `Falha Evolution HTTP ${result.status}.`,
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
  const mock = envFlag('NIBO_MOCK', 'true');
  const baseUrl = process.env.NIBO_BASE_URL ?? 'https://api.nibo.com.br/empresas/v1';
  const token = apiKey?.trim() || process.env.NIBO_API_TOKEN;
  if (mock || !token) {
    return {
      success: false,
      provider: 'NIBO',
      enabled: false,
      message: mock
        ? 'Nibo em modo MOCK (NIBO_MOCK=true). Nenhum sucesso foi simulado.'
        : 'Nibo desabilitado: configure a API Key da conexão ou NIBO_API_TOKEN.',
    };
  }
  try {
    const result = await fetchJson(`${baseUrl.replace(/\/$/, '')}/schedules`, {
      headers: { apitoken: token, Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    return {
      success: result.ok,
      provider: 'NIBO',
      enabled: true,
      message: result.ok ? 'Conexão Nibo confirmada.' : `Falha Nibo HTTP ${result.status}.`,
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
  const mock = envFlag('GOOGLE_CALENDAR_MOCK', 'true');
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (mock || !clientId || !clientSecret || !redirectUri) {
    return {
      success: false,
      provider: 'GOOGLE_CALENDAR',
      enabled: false,
      message: mock
        ? 'Google Calendar desabilitado (GOOGLE_CALENDAR_MOCK=true).'
        : 'Google Calendar desabilitado: configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI.',
    };
  }
  return {
    success: false,
    provider: 'GOOGLE_CALENDAR',
    enabled: true,
    message:
      'Client OAuth presente no env. Conclua POST /integrations/:id/oauth/start + callback para obter refresh_token; use test-connection na conexão persistida.',
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
