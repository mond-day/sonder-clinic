/** Parse Distinguished Name attributes (CN, O, OU, …) into a readable map. */
export function parseDistinguishedName(dn: unknown): Record<string, string> {
  const raw = String(dn ?? '').trim();
  if (!raw) return {};
  const parts = raw.split(/(?<!\\),\s*/);
  const result: Record<string, string> = {};
  for (const part of parts) {
    const match = part.match(/^([A-Za-z0-9.]+)\s*=\s*(.*)$/);
    if (!match?.[1] || match[2] === undefined) continue;
    const key = match[1].toUpperCase();
    const value = match[2].replace(/\\,/g, ',').trim();
    if (!value) continue;
    result[key] = result[key] ? `${result[key]}; ${value}` : value;
  }
  return result;
}

export function formatDnSummary(dn: unknown): { title: string; detail: string } {
  const attrs = parseDistinguishedName(dn);
  const title = attrs.CN || attrs.O || String(dn ?? '—');
  const bits = [
    attrs.O && attrs.CN ? `Org: ${attrs.O}` : null,
    attrs.OU ? `Unidade: ${attrs.OU}` : null,
    attrs.L ? `Local: ${attrs.L}` : null,
    attrs.ST ? `UF: ${attrs.ST}` : null,
    attrs.C ? `País: ${attrs.C}` : null,
  ].filter(Boolean);
  return { title, detail: bits.length ? bits.join(' · ') : String(dn ?? '') };
}
