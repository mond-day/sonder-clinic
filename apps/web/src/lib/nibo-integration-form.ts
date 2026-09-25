/**
 * Helpers do formulário de integração Nibo (MutationPanel / Configurações).
 * Mantém labels amigáveis (nome) mesmo quando o catálogo falha ao reabrir.
 */

export function niboIdList(
  config: Record<string, unknown> | undefined,
  arrayKey: string,
  singularKey: string,
): string[] {
  const raw = config?.[arrayKey];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  const one = config?.[singularKey];
  if (typeof one === 'string' && one.trim()) return [one.trim()];
  return [];
}

/**
 * Contas bancárias selecionadas na integração Nibo.
 * Preferência: accountIds → niboAccountIds → singular (accountId / niboAccountId / defaultAccountId).
 * Não deduplica por casing (o MultiSelect e o catálogo alinhados cuidam disso).
 */
export function readNiboSelectedAccountIds(
  config: Record<string, unknown> | undefined,
): string[] {
  if (!config) return [];
  const fromAccountIds = niboIdList(config, 'accountIds', 'accountId');
  if (fromAccountIds.length) return fromAccountIds;
  const fromNiboIds = niboIdList(config, 'niboAccountIds', 'niboAccountId');
  if (fromNiboIds.length) return fromNiboIds;
  const fallback = config.defaultAccountId;
  if (typeof fallback === 'string' && fallback.trim()) return [fallback.trim()];
  return [];
}

export function niboNameMap(config: Record<string, unknown> | undefined, key: string): Record<string, string> {
  const raw = config?.[key];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [id, name] of Object.entries(raw as Record<string, unknown>)) {
    if (id && typeof name === 'string' && name.trim() && name.trim() !== id) out[id] = name.trim();
  }
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Evita exibir GUID cru como label principal quando não há nome. */
export function niboFallbackLabel(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return 'Seleção salva';
  if (UUID_RE.test(trimmed)) {
    return 'Seleção salva (catálogo indisponível)';
  }
  return trimmed;
}

export function lookupNiboName(
  id: string,
  rows: Array<{ id: string; name: string }>,
  savedNames: Record<string, string>,
): string {
  const needle = id.trim().toLowerCase();
  if (!needle) return id;
  const fromCatalog = rows.find((row) => row.id.toLowerCase() === needle);
  if (fromCatalog?.name?.trim() && fromCatalog.name.trim() !== fromCatalog.id) {
    return fromCatalog.name.trim();
  }
  for (const [savedId, name] of Object.entries(savedNames)) {
    if (savedId.toLowerCase() === needle && name.trim() && name.trim() !== savedId) {
      return name.trim();
    }
  }
  return niboFallbackLabel(id);
}

export function niboOptions(
  rows: Array<{ id: string; name: string; type?: string }>,
  selectedIds: string[],
  savedNames: Record<string, string> = {},
) {
  const byNorm = new Map<string, { value: string; label: string; description?: string }>();
  for (const row of rows) {
    if (!row.id) continue;
    byNorm.set(row.id.toLowerCase(), {
      value: row.id,
      label: (row.name && row.name !== row.id)
        ? row.name
        : lookupNiboName(row.id, rows, savedNames),
      description: row.type || undefined,
    });
  }
  for (const id of selectedIds) {
    if (!id) continue;
    const key = id.toLowerCase();
    const existing = byNorm.get(key);
    if (existing) {
      // Mantém o id selecionado (casing salvo) para o MultiSelect casar selected.includes.
      const label = existing.label !== existing.value && !UUID_RE.test(existing.label)
        ? existing.label
        : lookupNiboName(id, rows, savedNames);
      byNorm.set(key, {
        ...existing,
        value: id,
        label,
      });
    } else {
      byNorm.set(key, {
        value: id,
        label: lookupNiboName(id, rows, savedNames),
      });
    }
  }
  return [...byNorm.values()];
}

export function buildNiboNameMap(
  ids: string[],
  catalogRows: Array<{ id: string; name: string }>,
  previous: Record<string, string>,
) {
  const next: Record<string, string> = {};
  for (const id of ids) {
    if (!id) continue;
    const name = lookupNiboName(id, catalogRows, previous);
    // Só persiste se for nome real (não o fallback de catálogo indisponível / UUID).
    if (name && name !== id && !name.includes('catálogo indisponível')) {
      next[id] = name;
    } else if (previous[id] && previous[id] !== id) {
      next[id] = previous[id];
    } else {
      const prevByCase = Object.entries(previous).find(([key]) => key.toLowerCase() === id.toLowerCase());
      if (prevByCase?.[1] && prevByCase[1] !== prevByCase[0]) next[id] = prevByCase[1];
    }
  }
  return next;
}

export function enrichNiboNamesFromCatalog(
  ids: string[],
  catalogRows: Array<{ id: string; name: string }>,
  previous: Record<string, string>,
): Record<string, string> {
  return buildNiboNameMap(ids, catalogRows, previous);
}

export function alignIdsToCatalog(ids: string[], catalogRows: Array<{ id: string; name: string }>): string[] {
  return ids.map((id) => {
    const match = catalogRows.find((row) => row.id.toLowerCase() === id.toLowerCase());
    return match?.id ?? id;
  });
}
