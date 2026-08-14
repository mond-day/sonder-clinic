/** CID-10 comuns em odontologia — busca por código e descrição. */
export const DENTAL_CID_CATALOG = [
  { code: 'K00.6', description: 'Distúrbios da erupção dentária' },
  { code: 'K01.0', description: 'Dentes inclusos' },
  { code: 'K01.1', description: 'Dentes impactados' },
  { code: 'K02.0', description: 'Cárie limitada ao esmalte' },
  { code: 'K02.1', description: 'Cárie da dentina' },
  { code: 'K02.2', description: 'Cárie do cemento' },
  { code: 'K02.9', description: 'Cárie dentária não especificada' },
  { code: 'K03.0', description: 'Atrito dentário excessivo' },
  { code: 'K03.2', description: 'Erosão dentária' },
  { code: 'K04.0', description: 'Pulpite' },
  { code: 'K04.1', description: 'Necrose da polpa' },
  { code: 'K04.4', description: 'Periodontite apical aguda de origem pulpar' },
  { code: 'K04.5', description: 'Periodontite apical crônica' },
  { code: 'K04.6', description: 'Abscesso periapical com fístula' },
  { code: 'K04.7', description: 'Abscesso periapical sem fístula' },
  { code: 'K05.0', description: 'Gengivite aguda' },
  { code: 'K05.1', description: 'Gengivite crônica' },
  { code: 'K05.2', description: 'Periodontite aguda' },
  { code: 'K05.3', description: 'Periodontite crônica' },
  { code: 'K05.4', description: 'Periodontose' },
  { code: 'K06.0', description: 'Retração gengival' },
  { code: 'K07.3', description: 'Anomalias da posição dentária' },
  { code: 'K07.6', description: 'Transtornos da articulação temporomandibular' },
  { code: 'K08.1', description: 'Perda de dentes devida a acidente, extração ou doença periodontal local' },
  { code: 'K08.3', description: 'Raiz dentária retida' },
  { code: 'K10.2', description: 'Afecções inflamatórias dos maxilares' },
  { code: 'K12.0', description: 'Aftas orais recorrentes' },
  { code: 'K13.0', description: 'Doenças dos lábios' },
  { code: 'S02.5', description: 'Fratura de dente' },
  { code: 'S03.2', description: 'Luxação dentária' },
] as const;

export function dentalCidOptions() {
  return DENTAL_CID_CATALOG.map((row) => ({
    value: row.code,
    label: `${row.code} — ${row.description}`,
    description: row.description,
    badge: row.code,
  }));
}

export function resolveDentalCid(code: string) {
  const normalized = code.trim();
  if (!normalized) return null;
  return DENTAL_CID_CATALOG.find((row) => row.code.toLowerCase() === normalized.toLowerCase())
    ?? { code: normalized, description: '' };
}

export function formatDentalCidLine(code: string, description?: string | null) {
  const resolved = resolveDentalCid(code);
  if (!resolved) return '';
  const desc = (description ?? '').trim() || resolved.description;
  return desc ? `CID-10 ${resolved.code} — ${desc}.` : `CID-10 ${resolved.code}.`;
}
