import type { DocumentFolder, LibraryItem } from './document-types';

const ATTESTATION_TYPES = new Set(['ATTESTATION', 'CERTIFICATE', 'ATESTADO']);
const PRESCRIPTION_TYPES = new Set(['PRESCRIPTION', 'RECEITUARIO']);
const EXAM_TYPES = new Set(['EXAM_REQUEST', 'EXAM']);
const CONSENT_TYPES = new Set(['CONSENT', 'CONSENTIMENTO']);
const REFERRAL_TYPES = new Set(['REFERRAL', 'ENCAMINHAMENTO']);

export function isProfilePhoto(item: Pick<LibraryItem, 'type'>): boolean {
  return String(item.type ?? '').toUpperCase() === 'PROFILE_PHOTO';
}

export function folderNameForDocumentType(type: string, source?: LibraryItem['source']): string | null {
  const value = type.toUpperCase();
  if (source === 'prescription' || PRESCRIPTION_TYPES.has(value)) return 'Receitas';
  if (ATTESTATION_TYPES.has(value)) return 'Atestados';
  if (EXAM_TYPES.has(value)) return 'Exames';
  if (CONSENT_TYPES.has(value)) return 'Termos e consentimentos';
  if (REFERRAL_TYPES.has(value)) return 'Encaminhamentos';
  if (value === 'CONTRACT') return 'Contratos';
  if (value === 'TREATMENT_PLAN') return 'Planos de tratamento';
  if (value === 'ODONTOGRAM') return 'Odontogramas';
  if (source === 'upload') {
    if (/RADIO|RX|XRAY|PANORAM|PERIAP|TOMO/.test(value)) return 'Radiografias';
    if (/PHOTO|IMAGE|IMG|JPG|JPEG|PNG|WEBP/.test(value)) return 'Fotografias';
    return 'Outros';
  }
  return null;
}

function looksLikeAttestation(item: LibraryItem): boolean {
  if (item.source === 'upload') return false;
  if (ATTESTATION_TYPES.has(item.type.toUpperCase())) return true;
  return /atestado/i.test(item.name);
}

function looksLikePrescription(item: LibraryItem): boolean {
  return item.source === 'prescription' || PRESCRIPTION_TYPES.has(item.type.toUpperCase());
}

/** Pasta canônica do item (tipo/origem), usada no filtro de categoria. */
export function canonicalFolderName(item: LibraryItem): string | null {
  if (looksLikeAttestation(item)) return 'Atestados';
  if (looksLikePrescription(item)) return 'Receitas';
  return folderNameForDocumentType(item.type, item.source);
}

export function itemMatchesFolder(item: LibraryItem, folder: DocumentFolder): boolean {
  const canonical = canonicalFolderName(item);
  if (canonical) return folder.name === canonical;
  return item.folderId === folder.id;
}

export function countItemsInFolder(items: LibraryItem[], folder: DocumentFolder): number {
  return items.filter((item) => itemMatchesFolder(item, folder)).length;
}
