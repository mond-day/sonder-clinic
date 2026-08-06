/**
 * Adapters reais gateados por env.
 * Nunca retornam sucesso simulado quando a integração está desabilitada ou a chamada falha.
 */

export type AdapterResult = {
  success: boolean;
  provider: string;
  enabled: boolean;
  message: string;
  detail?: unknown;
};

function envFlag(name: string, fallback = 'true') {
  return (process.env[name] ?? fallback).toLowerCase() === 'true';
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { ok: response.ok, status: response.status, body };
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

export async function testNibo(): Promise<AdapterResult> {
  const mock = envFlag('NIBO_MOCK', 'true');
  const baseUrl = process.env.NIBO_BASE_URL ?? 'https://api.nibo.com.br/empresas/v1';
  const token = process.env.NIBO_API_TOKEN;
  if (mock || !token) {
    return {
      success: false,
      provider: 'NIBO',
      enabled: false,
      message: mock
        ? 'Nibo desabilitado (NIBO_MOCK=true). Nenhum sucesso foi simulado.'
        : 'Nibo desabilitado: configure NIBO_API_TOKEN.',
    };
  }
  try {
    const result = await fetchJson(`${baseUrl.replace(/\/$/, '')}/schedules`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
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
  if (mock || !clientId || !clientSecret) {
    return {
      success: false,
      provider: 'GOOGLE_CALENDAR',
      enabled: false,
      message: mock
        ? 'Google Calendar desabilitado (GOOGLE_CALENDAR_MOCK=true).'
        : 'Google Calendar desabilitado: configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.',
    };
  }
  return {
    success: false,
    provider: 'GOOGLE_CALENDAR',
    enabled: true,
    message: 'OAuth Google configurado, mas ainda não há refresh token autorizado para testar a API.',
  };
}

export async function testChatwoot(): Promise<AdapterResult> {
  const mock = envFlag('CHATWOOT_MOCK', 'true');
  const baseUrl = process.env.CHATWOOT_BASE_URL;
  const token = process.env.CHATWOOT_API_ACCESS_TOKEN;
  const accountId = process.env.CHATWOOT_ACCOUNT_ID;
  if (mock || !baseUrl || !token || !accountId) {
    return {
      success: false,
      provider: 'CHATWOOT',
      enabled: false,
      message: mock
        ? 'Chatwoot desabilitado (CHATWOOT_MOCK=true).'
        : 'Chatwoot desabilitado: configure BASE_URL, TOKEN e ACCOUNT_ID.',
    };
  }
  try {
    const result = await fetchJson(`${baseUrl.replace(/\/$/, '')}/api/v1/accounts/${accountId}`, {
      headers: { api_access_token: token },
    });
    return {
      success: result.ok,
      provider: 'CHATWOOT',
      enabled: true,
      message: result.ok ? 'Conexão Chatwoot confirmada.' : `Falha Chatwoot HTTP ${result.status}.`,
      detail: result.body,
    };
  } catch (error) {
    return {
      success: false,
      provider: 'CHATWOOT',
      enabled: true,
      message: `Erro ao contatar Chatwoot: ${error instanceof Error ? error.message : 'desconhecido'}`,
    };
  }
}

export async function testProvider(provider: string): Promise<AdapterResult> {
  switch (provider) {
    case 'EVOLUTION': return testEvolution();
    case 'NIBO': return testNibo();
    case 'GOOGLE_CALENDAR': return testGoogleCalendar();
    case 'CHATWOOT': return testChatwoot();
    case 'ABACATEPAY': {
      const mock = envFlag('ABACATEPAY_MOCK', 'true');
      const key = process.env.ABACATEPAY_API_KEY;
      if (mock || !key) {
        return {
          success: false,
          provider: 'ABACATEPAY',
          enabled: false,
          message: mock
            ? 'AbacatePay desabilitado (ABACATEPAY_MOCK=true).'
            : 'AbacatePay desabilitado: configure ABACATEPAY_API_KEY.',
        };
      }
      return {
        success: false,
        provider: 'ABACATEPAY',
        enabled: true,
        message: 'Credencial presente; teste live de cobrança não executado sem endpoint de health dedicado.',
      };
    }
    default:
      return {
        success: false,
        provider,
        enabled: false,
        message: `Provedor ${provider} sem adapter de teste.`,
      };
  }
}
