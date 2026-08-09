'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { dateOnly, text, type RecordValue } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/ui';
import { Modal } from '@/components/modal';

type DuplicatePatient = {
  id: string;
  fullName: string;
  cpfMasked: string | null;
  primaryPhone: string | null;
  email?: string | null;
  birthDate: string | null;
  internalCode: string | null;
  appointmentsCount: number;
  treatmentsCount: number;
  documentsCount: number;
  receivablesCount: number;
};

type DuplicateGroup = {
  score: number;
  reasons: string[];
  patients: DuplicatePatient[];
};

type MergePreview = {
  target: RecordValue;
  source: RecordValue;
  transferCounts: Record<string, number>;
  fieldConflicts: Array<{ field: string; targetValue: string | null; sourceValue: string | null }>;
  consequences: string[];
};

const REASON_LABEL: Record<string, string> = {
  SAME_CPF: 'Mesmo CPF',
  SAME_PASSPORT: 'Mesmo passaporte',
  SAME_PHONE: 'Mesmo telefone',
  SAME_EMAIL: 'Mesmo e-mail',
  SAME_NAME_BIRTHDATE: 'Nome e nascimento iguais',
  SIMILAR_NAME_BIRTHDATE: 'Nome semelhante + nascimento',
  SIMILAR_NAME_PHONE: 'Nome semelhante + telefone',
};

export function PatientDuplicatesPanel({ clinicId }: { clinicId: string }) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [keepId, setKeepId] = useState<Record<number, string>>({});
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [preview, setPreview] = useState<MergePreview | null>(null);

  const load = useCallback(() => {
    if (!clinicId) return;
    setLoading(true);
    setError('');
    api
      .get<{ groups: DuplicateGroup[] }>(`/patients/duplicates?clinicId=${clinicId}`)
      .then((data) => {
        setGroups(data.groups ?? []);
        setKeepId({});
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar duplicados.'))
      .finally(() => setLoading(false));
  }, [clinicId]);

  useEffect(load, [load]);

  async function openReview(index: number) {
    const group = groups[index];
    if (!group) return;
    const targetId = keepId[index] ?? group.patients[0]?.id;
    const source = group.patients.find((p) => p.id !== targetId);
    if (!targetId || !source) {
      setError('Escolha o cadastro principal antes de revisar.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next = await api.get<MergePreview>(
        `/patients/${targetId}/merge-preview?sourcePatientId=${source.id}`,
      );
      setPreview(next);
      setReviewIndex(index);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao gerar preview do merge.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmMerge() {
    if (reviewIndex == null || !preview) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/patients/${String(preview.target.id)}/merge`, {
        sourcePatientId: String(preview.source.id),
      });
      setReviewIndex(null);
      setPreview(null);
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao confirmar merge.');
    } finally {
      setBusy(false);
    }
  }

  async function dismiss(index: number) {
    const group = groups[index];
    if (!group || group.patients.length < 2) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/patients/duplicates/dismiss', {
        patientIdA: group.patients[0]!.id,
        patientIdB: group.patients[1]!.id,
      });
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao descartar suspeita.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="state-message">Carregando suspeitas…</div>;

  return (
    <div className="duplicates-panel">
      <div className="settings-panel-head">
        <div>
          <h3 style={{ margin: 0 }}>Pacientes possivelmente duplicados</h3>
          <p className="muted-note" style={{ margin: '4px 0 0' }}>
            Nenhum merge é automático. Escolha o principal, revise conflitos e confirme.
          </p>
        </div>
        <StatusBadge tone={groups.length ? 'amber' : 'green'}>
          {groups.length} suspeita{groups.length === 1 ? '' : 's'}
        </StatusBadge>
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {groups.length === 0 ? (
        <EmptyState title="Nenhuma suspeita" description="Não há pares candidatos com os critérios atuais." />
      ) : (
        <div className="duplicates-list">
          {groups.map((group, index) => {
            const selected = keepId[index] ?? group.patients[0]?.id;
            return (
              <article className="duplicate-card" key={`${group.patients[0]?.id}-${group.patients[1]?.id}`}>
                <div className="duplicate-reasons">
                  {group.reasons.map((reason) => (
                    <StatusBadge key={reason} tone={reason.startsWith('SAME_') ? 'amber' : 'blue'}>
                      {REASON_LABEL[reason] ?? reason}
                    </StatusBadge>
                  ))}
                  <span className="muted-note">score {group.score}</span>
                </div>
                <div className="duplicate-grid">
                  {group.patients.map((patient, slot) => (
                    <button
                      key={patient.id}
                      type="button"
                      className={`duplicate-person ${selected === patient.id ? 'selected' : ''}`}
                      onClick={() => setKeepId((current) => ({ ...current, [index]: patient.id }))}
                    >
                      <small className="muted-note">Cadastro {slot === 0 ? 'A' : 'B'} · manter como principal</small>
                      <strong>{patient.fullName}</strong>
                      <div className="duplicate-meta">
                        <span>CPF {text(patient.cpfMasked, '—')}</span>
                        <span>Tel. {text(patient.primaryPhone, '—')}</span>
                        <span>Nasc. {patient.birthDate ? dateOnly(patient.birthDate) : '—'}</span>
                        <span>{patient.appointmentsCount} consultas</span>
                        <span>{patient.treatmentsCount} tratamentos</span>
                        <span>{patient.documentsCount} docs</span>
                        <span>{patient.receivablesCount} títulos</span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="heading-actions">
                  <button type="button" className="button primary small" disabled={busy} onClick={() => void openReview(index)}>
                    Revisar merge
                  </button>
                  <button type="button" className="button soft small" disabled={busy} onClick={() => void dismiss(index)}>
                    Não são duplicados
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={reviewIndex != null && preview != null}
        title="Revisar merge de pacientes"
        description="Confirme o principal, vínculos transferidos e conflitos de campos."
        onClose={() => { setReviewIndex(null); setPreview(null); }}
        size="large"
        closeOnBackdrop={false}
      >
        {preview ? (
          <div className="merge-review">
            <div className="duplicate-grid">
              <div className="duplicate-person selected">
                <small className="muted-note">Principal (mantém)</small>
                <strong>{text(preview.target.fullName)}</strong>
                <div className="duplicate-meta">
                  <span>CPF {text(preview.target.cpfMasked, '—')}</span>
                  <span>Tel. {text(preview.target.primaryPhone, '—')}</span>
                </div>
              </div>
              <div className="duplicate-person">
                <small className="muted-note">Secundário (arquiva)</small>
                <strong>{text(preview.source.fullName)}</strong>
                <div className="duplicate-meta">
                  <span>CPF {text(preview.source.cpfMasked, '—')}</span>
                  <span>Tel. {text(preview.source.primaryPhone, '—')}</span>
                </div>
              </div>
            </div>

            <div className="summary-strip compact">
              {Object.entries(preview.transferCounts).map(([key, value]) => (
                <div key={key}><small>{key}</small><strong>{value}</strong></div>
              ))}
            </div>

            {preview.fieldConflicts.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Campo</th><th>Principal</th><th>Secundário</th></tr>
                  </thead>
                  <tbody>
                    {preview.fieldConflicts.map((row) => (
                      <tr key={row.field}>
                        <td>{row.field}</td>
                        <td>{text(row.targetValue, '—')}</td>
                        <td>{text(row.sourceValue, '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted-note">Sem conflitos de campos preenchidos na origem.</p>
            )}

            <ul className="muted-note">
              {preview.consequences.map((item) => <li key={item}>{item}</li>)}
            </ul>

            <div className="heading-actions">
              <button type="button" className="button soft" onClick={() => { setReviewIndex(null); setPreview(null); }}>
                Cancelar
              </button>
              <button type="button" className="button primary" disabled={busy} onClick={() => void confirmMerge()}>
                Confirmar merge
              </button>
            </div>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
