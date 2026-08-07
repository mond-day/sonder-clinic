import { api } from '@/lib/api';
import { list } from '@/lib/format';
import type {
  DocumentEvent,
  DocumentFolder,
  DocumentTemplate,
  GeneratedDocument,
  LibraryItem,
  PatientMedia,
  Prescription,
  PrescriptionProtocol,
} from './document-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export async function listDocumentLibrary(
  patientId: string,
  params?: { folderId?: string; q?: string; includeArchived?: boolean },
) {
  const query = new URLSearchParams();
  if (params?.folderId) query.set('folderId', params.folderId);
  if (params?.q) query.set('q', params.q);
  if (params?.includeArchived) query.set('includeArchived', 'true');
  const suffix = query.toString() ? `?${query}` : '';
  const rows = await api.get<LibraryItem[]>(`/patients/${patientId}/document-library${suffix}`);
  return list(rows) as LibraryItem[];
}

export async function listDocumentFolders(patientId: string) {
  const rows = await api.get<DocumentFolder[]>(`/patients/${patientId}/document-folders`);
  return list(rows) as DocumentFolder[];
}

export async function createDocumentFolder(patientId: string, name: string) {
  return api.post<DocumentFolder>(`/patients/${patientId}/document-folders`, { name });
}

export async function listDocumentTemplates(includeArchived = false) {
  const query = includeArchived ? '?includeArchived=true' : '';
  const rows = await api.get<DocumentTemplate[]>(`/document-templates${query}`);
  return list(rows) as DocumentTemplate[];
}

export async function getDocument(id: string) {
  return api.get<GeneratedDocument>(`/documents/${id}`);
}

export async function getDocumentHistory(id: string) {
  const rows = await api.get<DocumentEvent[]>(`/documents/${id}/history`);
  return list(rows) as DocumentEvent[];
}

export async function generateDocument(body: Record<string, unknown>) {
  return api.post<GeneratedDocument>('/documents/generate', body);
}

export async function signDocument(id: string, body: Record<string, unknown>) {
  return api.post<GeneratedDocument>(`/documents/${id}/sign`, body);
}

export async function createSignatureRequest(id: string, body: {
  signerRole: string;
  signerName: string;
  expiresInHours?: number;
}) {
  return api.post<{
    requestId: string;
    token: string;
    expiresAt: string;
    publicPath: string;
  }>(`/documents/${id}/signature-requests`, body);
}

export async function revokeSignatureRequest(id: string, requestId: string) {
  return api.post(`/documents/${id}/signature-requests/${requestId}/revoke`);
}

export async function cancelDocument(id: string, reason: string) {
  return api.post(`/documents/${id}/cancel`, { reason });
}

export async function archiveDocument(id: string) {
  return api.post(`/documents/${id}/archive`);
}

export async function downloadDocumentPdf(id: string, filename: string) {
  const response = await fetch(`${API_URL}/documents/${id}/pdf`, { credentials: 'include' });
  if (!response.ok) throw new Error('Falha ao gerar PDF.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function getPrescription(id: string) {
  return api.get<Prescription>(`/prescriptions/${id}`);
}

export async function createPrescription(body: Record<string, unknown>) {
  return api.post<Prescription>('/prescriptions', body);
}

export async function signPrescription(id: string) {
  return api.post<Prescription>(`/prescriptions/${id}/sign`);
}

export async function cancelPrescription(id: string, reason: string) {
  return api.post(`/prescriptions/${id}/cancel`, { reason });
}

export async function downloadPrescriptionPdf(id: string, filename: string) {
  const response = await fetch(`${API_URL}/prescriptions/${id}/pdf`, { credentials: 'include' });
  if (!response.ok) throw new Error('Falha ao gerar PDF da receita.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function listPrescriptionProtocols(professionalId?: string) {
  const query = professionalId ? `?professionalId=${professionalId}` : '';
  const rows = await api.get<PrescriptionProtocol[]>(`/prescription-protocols${query}`);
  return list(rows) as PrescriptionProtocol[];
}

export async function createPrescriptionProtocol(body: Record<string, unknown>) {
  return api.post<PrescriptionProtocol>('/prescription-protocols', body);
}

export async function getMedia(patientId: string, mediaId: string) {
  return api.get<PatientMedia>(`/patients/${patientId}/media/${mediaId}`);
}

export async function uploadMedia(patientId: string, form: FormData) {
  return api.postForm<PatientMedia>(`/patients/${patientId}/media`, form);
}

export async function patchMedia(patientId: string, mediaId: string, body: Record<string, unknown>) {
  return api.patch<PatientMedia>(`/patients/${patientId}/media/${mediaId}`, body);
}

export async function archiveMedia(patientId: string, mediaId: string) {
  return api.post(`/patients/${patientId}/media/${mediaId}/archive`);
}

export async function downloadMedia(patientId: string, mediaId: string, filename: string) {
  const response = await fetch(`${API_URL}/patients/${patientId}/media/${mediaId}/download`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Falha ao baixar arquivo.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function listTreatmentPlansLite(clinicId: string, patientId: string) {
  const rows = await api.get<Array<{ id: string; title: string; status: string }>>(
    `/treatment-plans?clinicId=${clinicId}&patientId=${patientId}`,
  );
  return list(rows) as Array<{ id: string; title: string; status: string }>;
}
