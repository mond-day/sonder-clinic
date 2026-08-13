export type DentitionType = 'PERMANENT' | 'DECIDUOUS' | 'MIXED';

export const PERMANENT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const PERMANENT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
export const DECIDUOUS_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
export const DECIDUOUS_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

export const ARCH_BY_TYPE: Record<DentitionType, { upper: number[]; lower: number[] }> = {
  PERMANENT: { upper: PERMANENT_UPPER, lower: PERMANENT_LOWER },
  DECIDUOUS: { upper: DECIDUOUS_UPPER, lower: DECIDUOUS_LOWER },
  MIXED: {
    upper: [...PERMANENT_UPPER.slice(0, 3), ...DECIDUOUS_UPPER, ...PERMANENT_UPPER.slice(-3)],
    lower: [...PERMANENT_LOWER.slice(0, 3), ...DECIDUOUS_LOWER, ...PERMANENT_LOWER.slice(-3)],
  },
};

/** 5 faces clínicas: V, L/P, M, D, O/I */
export const FACES = [
  { key: 'V', label: 'Vestibular', short: 'V' },
  { key: 'L', label: 'Lingual/Palatina', short: 'L/P' },
  { key: 'M', label: 'Mesial', short: 'M' },
  { key: 'D', label: 'Distal', short: 'D' },
  { key: 'O', label: 'Oclusal/Incisal', short: 'O/I' },
] as const;

export type FaceKey = (typeof FACES)[number]['key'];

export const DENTITION_OPTIONS: Array<{ value: DentitionType; label: string }> = [
  { value: 'PERMANENT', label: 'Permanente' },
  { value: 'DECIDUOUS', label: 'Decídua' },
  { value: 'MIXED', label: 'Mista' },
];

export function parseDentitionType(value: unknown): DentitionType {
  const normalized = String(value ?? 'PERMANENT').toUpperCase();
  if (normalized === 'DECIDUOUS' || normalized === 'MIXED') return normalized;
  return 'PERMANENT';
}

export function dentitionLabel(type: DentitionType) {
  return DENTITION_OPTIONS.find((item) => item.value === type)?.label ?? 'Permanente';
}

export function normalizeFaceKey(face: unknown): FaceKey | '' {
  const value = String(face ?? '').toUpperCase();
  if (value === 'P' || value === 'L/P') return 'L';
  if (value === 'I' || value === 'O/I') return 'O';
  if (value === 'V' || value === 'L' || value === 'M' || value === 'D' || value === 'O') return value;
  return '';
}

export function faceShortLabel(face: unknown) {
  const key = normalizeFaceKey(face);
  return FACES.find((item) => item.key === key)?.short ?? (face ? String(face) : '—');
}

export function isUpperArch(tooth: number) {
  const decade = Math.floor(tooth / 10);
  return decade === 1 || decade === 2 || decade === 5 || decade === 6;
}

export const ARCH_TOOTH_VALUES = {
  UPPER: 'AS',
  LOWER: 'AI',
} as const;

export function toothSelectOptions(): Array<{ value: string; label: string }> {
  return [
    { value: ARCH_TOOTH_VALUES.UPPER, label: 'Arcada superior' },
    { value: ARCH_TOOTH_VALUES.LOWER, label: 'Arcada inferior' },
    ...PERMANENT_UPPER.map((tooth) => ({ value: String(tooth), label: `Dente ${tooth}` })),
    ...PERMANENT_LOWER.map((tooth) => ({ value: String(tooth), label: `Dente ${tooth}` })),
    ...DECIDUOUS_UPPER.map((tooth) => ({ value: String(tooth), label: `Dente ${tooth} (decíduo)` })),
    ...DECIDUOUS_LOWER.map((tooth) => ({ value: String(tooth), label: `Dente ${tooth} (decíduo)` })),
  ];
}

export function toothDisplayLabel(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  if (raw === ARCH_TOOTH_VALUES.UPPER || /^arcada\s*superior$/i.test(raw)) return 'Arcada superior';
  if (raw === ARCH_TOOTH_VALUES.LOWER || /^arcada\s*inferior$/i.test(raw)) return 'Arcada inferior';
  return raw;
}

export function parseFaceKeys(value: unknown): FaceKey[] {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return [];
  const parts = raw.split(/[+,\s/]+/).filter(Boolean);
  const keys = parts.length > 1 ? parts : raw.split('');
  const unique: FaceKey[] = [];
  for (const part of keys) {
    const key = normalizeFaceKey(part);
    if (key && !unique.includes(key)) unique.push(key);
  }
  return unique;
}

export function joinFaceKeys(keys: FaceKey[]) {
  return keys.join('+');
}
