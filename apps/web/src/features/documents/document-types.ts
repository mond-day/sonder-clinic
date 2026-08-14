export type LibrarySource = 'generated' | 'prescription' | 'upload';

export type LibrarySegment = 'all' | 'generated' | 'uploads';

export type DocumentsHomeTab = 'documents' | 'files';

export type FileKindFilter = 'all' | 'photos' | 'radiographs' | 'pdfs' | 'videos' | 'other';

export type DocumentFolder = {
  id: string;
  name: string;
  isSystem?: boolean;
  sortOrder?: number;
  archivedAt?: string | null;
};

export type LibraryItem = {
  source: LibrarySource;
  id: string;
  name: string;
  type: string;
  status: string;
  folderId?: string | null;
  folderName?: string | null;
  date: string;
  professionalId?: string | null;
  validationCode?: string | null;
  antivirusStatus?: string | null;
};

export type DocumentTemplate = {
  id: string;
  name: string;
  type: string;
  version: number;
  status?: string;
  active?: boolean;
  structuredContent?: Record<string, unknown>;
  allowedVariables?: string[];
  signatureRules?: Record<string, unknown>;
};

export type DocumentIdentity = {
  patientName?: string | null;
  patientCpfMasked?: string | null;
  patientCpf?: string | null;
  professionalName?: string | null;
  professionalCro?: string | null;
  clinicName?: string | null;
  clinicLegalName?: string | null;
  clinicTaxId?: string | null;
  clinicPhone?: string | null;
  clinicEmail?: string | null;
  clinicAddress?: string | null;
  issuedPlace?: string | null;
  generatedAt?: string | null;
};

export type GeneratedDocument = {
  id: string;
  clinicId: string;
  patientId: string;
  professionalId?: string | null;
  status: string;
  validationCode: string;
  templateVersion: number;
  generatedAt: string;
  archivedAt?: string | null;
  cancelReason?: string | null;
  frozenContent?: Record<string, unknown> & { identity?: DocumentIdentity };
  template?: DocumentTemplate;
  folder?: DocumentFolder | null;
  signatures?: Array<{
    id?: string;
    role: string;
    signerName?: string;
    method?: string;
    signedAt?: string;
    evidence?: { dataUrl?: string } | Record<string, unknown>;
  }>;
  signatureRequests?: Array<{
    id: string;
    signerRole: string;
    signerName: string;
    expiresAt: string;
    usedAt?: string | null;
    revokedAt?: string | null;
  }>;
  events?: DocumentEvent[];
};

export type PrescriptionItem = {
  medicationName: string;
  concentration?: string;
  pharmaceuticalForm?: string;
  route?: string;
  quantity: string;
  dosage: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
};

export type Prescription = {
  id: string;
  clinicId: string;
  patientId: string;
  professionalId: string;
  purpose: string;
  status: string;
  validationCode?: string | null;
  items: PrescriptionItem[] | unknown;
  clinicalWarnings?: unknown[];
  ignoredWarnings?: unknown[];
  frozenIdentity?: DocumentIdentity | Record<string, unknown> | null;
  folderId?: string | null;
  folder?: DocumentFolder | null;
  createdAt: string;
  signedAt?: string | null;
  reviewedAt?: string | null;
};

export type PrescriptionProtocol = {
  id: string;
  name: string;
  purpose: string;
  items: PrescriptionItem[] | unknown;
  professionalId?: string | null;
  archivedAt?: string | null;
};

export type PatientMedia = {
  id: string;
  type: string;
  displayName?: string | null;
  notes?: string | null;
  toothFdi?: string | null;
  examDate?: string | null;
  folderId?: string | null;
  folder?: DocumentFolder | null;
  archivedAt?: string | null;
  createdAt: string;
  file?: {
    id?: string;
    originalName?: string;
    mimeType?: string;
    sizeBytes?: number;
    status?: string;
    antivirusStatus?: string;
  };
};

export type DocumentEvent = {
  id: string;
  type: string;
  actorId?: string | null;
  payload?: unknown;
  createdAt: string;
};

export type DocumentFiltersState = {
  search: string;
  segment: LibrarySegment;
  folderId: string | 'all';
  includeArchived: boolean;
};

export type DocumentModal =
  | 'picker'
  | 'generate'
  | 'prescription'
  | 'certificate'
  | 'exam-request'
  | 'consent'
  | 'referral'
  | 'upload'
  | 'share'
  | null;

export type NewDocumentKind =
  | 'prescription'
  | 'certificate'
  | 'exam-request'
  | 'generate'
  | 'consent'
  | 'referral';

export type SelectedLibraryRef = {
  source: LibrarySource;
  id: string;
} | null;

export function typeIcon(type: string, source: LibrarySource): string {
  const value = type.toUpperCase();
  if (source === 'prescription' || value === 'PRESCRIPTION') return 'RX';
  if (value.includes('IMAGE') || value === 'PHOTO') return 'IMG';
  if (value.includes('VIDEO')) return 'VID';
  if (value.includes('PDF')) return 'PDF';
  if (value === 'ATTESTATION' || value === 'CERTIFICATE' || value === 'ATESTADO') return 'AT';
  if (value === 'EXAM_REQUEST') return 'EX';
  if (value === 'CONSENT' || value === 'CONSENTIMENTO') return 'TR';
  if (value === 'REFERRAL' || value === 'ENCAMINHAMENTO') return 'EN';
  if (value === 'CONTRACT') return 'CT';
  if (value === 'TREATMENT_PLAN') return 'PL';
  if (value === 'ODONTOGRAM') return 'OD';
  return 'DOC';
}

export function isSignableStatus(status: string): boolean {
  return !['SIGNED', 'CANCELLED', 'ARCHIVED'].includes(status.toUpperCase());
}
