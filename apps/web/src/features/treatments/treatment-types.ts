export type TreatmentPlanStatus =
  | 'DRAFT'
  | 'PRESENTED'
  | 'PARTIALLY_APPROVED'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type TreatmentItemStatus =
  | 'PLANNED'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type Procedure = {
  id: string;
  name: string;
  internalCode?: string;
  defaultSessions?: number;
  requiresTooth?: boolean;
  requiresFace?: boolean;
  active?: boolean;
};

export type TreatmentSession = {
  id: string;
  treatmentItemId: string;
  professionalId: string;
  executionNotes: string;
  complications?: string | null;
  completedAt: string;
  correctionOfId?: string | null;
  materials?: unknown;
  corrections?: TreatmentSession[];
};

export type TreatmentItem = {
  id: string;
  treatmentPlanId?: string;
  procedureId: string;
  professionalId: string;
  toothFdi?: string | null;
  face?: string | null;
  quantity: number;
  unitPrice: string | number;
  discount: string | number;
  total: string | number;
  plannedSessions: number;
  urgent?: boolean;
  priority?: number;
  sortOrder?: number;
  status: TreatmentItemStatus | string;
  approvedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  procedure?: { id?: string; name?: string; requiresTooth?: boolean; requiresFace?: boolean };
  sessions?: TreatmentSession[];
};

export type TreatmentPlanEvent = {
  id: string;
  type: string;
  actorId?: string | null;
  payload?: unknown;
  createdAt: string;
};

export type TreatmentPlan = {
  id: string;
  clinicId: string;
  patientId: string;
  professionalId: string;
  status: TreatmentPlanStatus | string;
  title: string;
  presentedAt?: string | null;
  presentedVersion?: number | null;
  validUntil?: string | null;
  subtotal: string | number;
  discount: string | number;
  total: string | number;
  notes?: string | null;
  version: number;
  archivedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  createdAt: string;
  updatedAt?: string;
  items: TreatmentItem[];
  events?: TreatmentPlanEvent[];
  revisions?: Array<{ id: string; version: number; createdAt: string }>;
};

export type TreatmentDetailTab = 'procedures' | 'sessions' | 'evolutions' | 'history' | 'notes';

export type TreatmentFiltersState = {
  search: string;
  status: string;
  includeArchived: boolean;
};

export type DraftItemInput = {
  key: string;
  procedureId: string;
  professionalId: string;
  toothFdi: string;
  face: string;
  quantity: number;
  unitPrice: string;
  discount: string;
  plannedSessions: number;
  urgent: boolean;
};

export const ACTIVE_PLAN_STATUSES = new Set([
  'DRAFT',
  'PRESENTED',
  'PARTIALLY_APPROVED',
  'APPROVED',
  'IN_PROGRESS',
]);

export const PENDING_PLAN_STATUSES = new Set([
  'DRAFT',
  'PRESENTED',
  'PARTIALLY_APPROVED',
]);

export const EDITABLE_PLAN_STATUSES = new Set([
  'DRAFT',
  'PRESENTED',
  'PARTIALLY_APPROVED',
  'APPROVED',
  'IN_PROGRESS',
]);

export const MUTABLE_CONTENT_STATUSES = new Set(['DRAFT']);
