import { api } from '@/lib/api';
import { list } from '@/lib/format';
import type { Procedure, TreatmentPlan, TreatmentPlanEvent, TreatmentSession } from './treatment-types';

export async function listTreatmentPlans(params: {
  clinicId: string;
  patientId: string;
  includeArchived?: boolean;
}) {
  const query = new URLSearchParams({
    clinicId: params.clinicId,
    patientId: params.patientId,
  });
  if (params.includeArchived) query.set('includeArchived', 'true');
  const rows = await api.get<TreatmentPlan[]>(`/treatment-plans?${query}`);
  return list(rows) as TreatmentPlan[];
}

export async function getTreatmentPlan(id: string) {
  return api.get<TreatmentPlan>(`/treatment-plans/${id}`);
}

export async function listProcedures() {
  const rows = await api.get<Procedure[]>('/procedures');
  return list(rows) as Procedure[];
}

export async function createTreatmentPlan(body: Record<string, unknown>) {
  return api.post<TreatmentPlan>('/treatment-plans', body);
}

export async function updateTreatmentPlan(id: string, body: Record<string, unknown>) {
  return api.patch<TreatmentPlan>(`/treatment-plans/${id}`, body);
}

export async function presentTreatmentPlan(id: string, version?: number) {
  return api.post<TreatmentPlan>(`/treatment-plans/${id}/present`, { version });
}

export async function duplicateTreatmentPlan(id: string) {
  return api.post<TreatmentPlan>(`/treatment-plans/${id}/duplicate`);
}

export async function approveTreatmentPlan(id: string, itemIds: string[], version?: number) {
  return api.post<TreatmentPlan>(`/treatment-plans/${id}/approve`, { itemIds, version });
}

export async function cancelTreatmentPlan(id: string, reason: string, version?: number) {
  return api.post<TreatmentPlan>(`/treatment-plans/${id}/cancel`, { reason, version });
}

export async function archiveTreatmentPlan(id: string) {
  return api.post<TreatmentPlan>(`/treatment-plans/${id}/archive`);
}

export async function restoreTreatmentPlan(id: string) {
  return api.post<TreatmentPlan>(`/treatment-plans/${id}/restore`);
}

export async function deleteDraftTreatmentPlan(id: string) {
  return api.delete<{ success: boolean }>(`/treatment-plans/${id}`);
}

export async function getTreatmentHistory(id: string) {
  const rows = await api.get<TreatmentPlanEvent[]>(`/treatment-plans/${id}/history`);
  return list(rows) as TreatmentPlanEvent[];
}

export async function addTreatmentItem(planId: string, body: Record<string, unknown>) {
  return api.post(`/treatment-plans/${planId}/items`, body);
}

export async function updateTreatmentItem(planId: string, itemId: string, body: Record<string, unknown>) {
  return api.patch(`/treatment-plans/${planId}/items/${itemId}`, body);
}

export async function cancelTreatmentItem(planId: string, itemId: string, reason: string) {
  return api.post(`/treatment-plans/${planId}/items/${itemId}/cancel`, { reason });
}

export async function reorderTreatmentItems(planId: string, itemIds: string[]) {
  return api.post(`/treatment-plans/${planId}/items/reorder`, { itemIds });
}

export async function listItemSessions(itemId: string) {
  const rows = await api.get<TreatmentSession[]>(`/treatment-items/${itemId}/sessions`);
  return list(rows) as TreatmentSession[];
}

export async function addItemSession(itemId: string, body: Record<string, unknown>) {
  return api.post(`/treatment-items/${itemId}/sessions`, {
    ...body,
    idempotencyKey: body.idempotencyKey ?? crypto.randomUUID(),
  });
}

export async function completeTreatmentItem(itemId: string, notes?: string) {
  return api.post(`/treatment-items/${itemId}/complete`, { notes });
}

export async function createClinicalEvolution(patientId: string, body: Record<string, unknown>) {
  return api.post(`/patients/${patientId}/clinical-entries`, body);
}
