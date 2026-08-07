'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { list, text, type RecordValue } from '@/lib/format';
import { useSelection } from './selection-provider';
import { EmptyState, PageHeader, Panel } from './ui';
import { PatientDocumentWorkspace } from '@/features/documents/patient-document-workspace';
import { DocumentTemplatesAdminPanel } from '@/features/documents/document-templates-admin';

export function DocumentsView() {
  const { clinicId, professionals } = useSelection();
  const [patients, setPatients] = useState<RecordValue[]>([]);
  const [patientId, setPatientId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPatients = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    setError('');
    try {
      const rows = await api.get<RecordValue[]>(`/patients?clinicId=${clinicId}`).catch(() => [] as RecordValue[]);
      const next = list(rows);
      setPatients(next);
      setPatientId((current) => {
        if (current && next.some((item) => String(item.id) === current)) return current;
        const stored = typeof window !== 'undefined'
          ? window.localStorage.getItem('sonder.selectedPatientId')
          : null;
        if (stored && next.some((item) => String(item.id) === stored)) return stored;
        return next[0] ? String(next[0].id) : '';
      });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar pacientes.');
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  const selectedPatient = patients.find((item) => String(item.id) === patientId) ?? null;

  return (
    <div className="documents-view">
      <PageHeader
        eyebrow="Clínico"
        title="Documentos"
        description="Biblioteca unificada de modelos, documentos gerados, prescrições, atestados e arquivos do paciente."
        actions={(
          <button type="button" className="button soft" disabled={loading} onClick={() => void loadPatients()}>
            Atualizar
          </button>
        )}
      />
      {error ? <div className="secure-notice form-error" role="alert">{error}</div> : null}

      <DocumentTemplatesAdminPanel />

      <Panel title="Paciente" description="Selecione o paciente para abrir o workspace de documentos.">
        <label className="field-block">
          Paciente
          <select
            value={patientId}
            onChange={(event) => {
              setPatientId(event.target.value);
              window.localStorage.setItem('sonder.selectedPatientId', event.target.value);
            }}
          >
            <option value="">Selecione</option>
            {patients.map((item) => (
              <option key={String(item.id)} value={String(item.id)}>{text(item.fullName)}</option>
            ))}
          </select>
        </label>
      </Panel>

      {!clinicId ? (
        <EmptyState title="Selecione uma clínica" description="A clínica ativa é necessária para operar documentos." />
      ) : !patientId || !selectedPatient ? (
        <EmptyState title="Selecione um paciente" description="O workspace reutiliza a mesma experiência da ficha clínica." />
      ) : (
        <PatientDocumentWorkspace
          clinicId={clinicId}
          patientId={patientId}
          patientName={text(selectedPatient.fullName)}
          patientCpf={typeof selectedPatient.cpf === 'string' ? selectedPatient.cpf : null}
          professionals={professionals}
        />
      )}
    </div>
  );
}
