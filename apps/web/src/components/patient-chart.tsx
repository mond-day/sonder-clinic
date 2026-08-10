'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageCircle, Pencil } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import {
  ageLabel,
  currency,
  dateOnly,
  dateTime,
  hasPermission,
  initials,
  list,
  maskCpf,
  nested,
  presentationLabel,
  statusTone,
  text,
  type RecordValue,
} from '@/lib/format';
import { useAuth } from './auth-provider';
import { usePresentation } from './presentation-provider';
import { useSelection } from './selection-provider';
import { AnamnesisWorkspace } from '@/features/anamnesis/anamnesis-workspace';
import { ClinicalEntryDetailModal } from '@/features/clinical/clinical-entry-detail-modal';
import { OdontogramBoard } from '@/features/odontogram/odontogram-board';
import { PatientDocumentWorkspace } from '@/features/documents/patient-document-workspace';
import { PatientCarePanel } from '@/features/patients/patient-care-panel';
import { TreatmentWorkspace } from '@/features/treatments/treatment-workspace';
import { EmptyState, Panel, StatusBadge } from './ui';
import { Modal } from './modal';
import { SearchableSelect } from './searchable-select';

const TABS = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'anamnese', label: 'Anamnese' },
  { id: 'odontograma', label: 'Odontograma' },
  { id: 'tratamentos', label: 'Tratamentos' },
  { id: 'evolucao', label: 'Evolução' },
  { id: 'financeiro', label: 'Financeiro', sensitive: true },
  { id: 'documentos', label: 'Documentos' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function PatientChart({ patientId }: { patientId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as TabId | null;
  const activeTab: TabId = TABS.some((tab) => tab.id === tabParam) ? (tabParam as TabId) : 'resumo';
  const { user } = useAuth();
  const { clinicId, professionals } = useSelection();
  const { enabled: presentationMode, toggle: togglePresentation } = usePresentation();
  const canFinance = hasPermission(user?.permissions, 'financial.view');

  const [patient, setPatient] = useState<RecordValue | null>(null);
  const [record, setRecord] = useState<RecordValue | null>(null);
  const [plans, setPlans] = useState<RecordValue[]>([]);
  const [odontograms, setOdontograms] = useState<RecordValue[]>([]);
  const [receivables, setReceivables] = useState<RecordValue[]>([]);
  const [odontogramConditions, setOdontogramConditions] = useState<RecordValue[]>([]);
  const [activeModal, setActiveModal] = useState<'evolution' | 'receive' | null>(null);
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null);
  const [receiveId, setReceiveId] = useState('');
  const [receiveMethod, setReceiveMethod] = useState('PIX');
  const [receiveAmount, setReceiveAmount] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const setTab = useCallback((tab: TabId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/pacientes/${patientId}?${params.toString()}`);
  }, [patientId, router, searchParams]);

  const load = useCallback(() => {
    if (!clinicId || !patientId) return;
    setLoading(true);
    setError('');
    Promise.all([
      api.get<RecordValue>(`/patients/${patientId}`),
      api.get<RecordValue>(`/patients/${patientId}/clinical-record?clinicId=${clinicId}`).catch(() => ({ entries: [], alerts: [] })),
      api.get<RecordValue[]>(`/treatment-plans?clinicId=${clinicId}&patientId=${patientId}`).catch(() => []),
      api.get<RecordValue[]>(`/patients/${patientId}/odontograms`).catch(() => []),
      canFinance
        ? api.get<RecordValue[]>(`/receivables?clinicId=${clinicId}&patientId=${patientId}`).catch(() => [])
        : Promise.resolve([] as RecordValue[]),
      api.get<RecordValue[]>('/odontogram-conditions').catch(() => []),
    ])
      .then(([nextPatient, nextRecord, nextPlans, nextOdontograms, nextReceivables, nextConditions]) => {
        setPatient(nextPatient);
        setRecord(nextRecord);
        setPlans(list(nextPlans));
        setOdontograms(list(nextOdontograms));
        setReceivables(list(nextReceivables));
        setOdontogramConditions(list(nextConditions));
        window.localStorage.setItem('sonder.selectedPatientId', patientId);
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Não foi possível abrir o prontuário.'))
      .finally(() => setLoading(false));
  }, [canFinance, clinicId, patientId]);

  useEffect(load, [load]);

  const entries = list(record?.entries);
  const alerts = list(record?.alerts ?? patient?.alerts);
  const latestFindings = list(odontograms[0]?.findings);
  const findingsByToothFace = useMemo(() => {
    const map = new Map<string, string>();
    for (const finding of latestFindings) {
      const face = String(finding.face ?? '').toUpperCase();
      const normalized = face === 'P' || face === 'L/P' ? 'L' : face === 'I' || face === 'O/I' ? 'O' : face || 'V';
      map.set(`${finding.toothFdi}:${normalized}`, String(finding.status ?? 'EXISTING'));
    }
    return map;
  }, [latestFindings]);
  const openReceivables = useMemo(
    () => receivables.filter((item) => !['PAID', 'CANCELLED'].includes(String(item.status))),
    [receivables],
  );

  const age = ageLabel(patient?.birthDate);
  const code = patient?.id ? `#${String(patient.id).slice(0, 8).toUpperCase()}` : '—';

  async function submitModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeModal) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setFormError('');
    try {
      if (activeModal === 'evolution') {
        const clinicalLink = String(data.get('clinicalLink') ?? '');
        let treatmentId: string | undefined;
        let treatmentItemId: string | undefined;
        if (clinicalLink.startsWith('plan:')) {
          treatmentId = clinicalLink.slice(5) || undefined;
        } else if (clinicalLink.startsWith('item:')) {
          const [, planId, itemId] = clinicalLink.split(':');
          treatmentId = planId || undefined;
          treatmentItemId = itemId || undefined;
        }
        await api.post(`/patients/${patientId}/clinical-entries`, {
          clinicId, professionalId: String(data.get('professionalId')), type: 'EVOLUTION',
          renderedText: String(data.get('renderedText')), structuredData: {},
          treatmentId,
          treatmentItemId,
          clinicalDate: new Date().toISOString(),
        });
      } else if (activeModal === 'receive') {
        const amount = Number(receiveAmount);
        if (!receiveId || !Number.isFinite(amount) || amount <= 0) {
          throw new Error('Selecione um título e informe um valor válido.');
        }
        await api.post(`/receivables/${receiveId}/payments`, {
          amount: amount.toFixed(2),
          method: receiveMethod,
        }, { 'Idempotency-Key': crypto.randomUUID() });
      }
      setActiveModal(null);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }


  if (loading) return <div className="state-message">Carregando prontuário…</div>;
  if (error) {
    return (
      <div className="state-message error" role="alert">
        {error}
        <button className="text-button" type="button" onClick={load}>Tentar novamente</button>
      </div>
    );
  }
  if (!patient) return <EmptyState title="Paciente não encontrado" action={<Link className="button primary" href="/pacientes">Voltar</Link>} />;

  const visibleTabs = TABS.filter((tab) => !(tab.id === 'financeiro' && (!canFinance || presentationMode)));

  return (
    <>
      <ClinicalEntryDetailModal
        open={Boolean(detailEntryId)}
        entryId={detailEntryId}
        professionals={professionals}
        onClose={() => setDetailEntryId(null)}
        onChanged={load}
      />

      <Modal
        open={Boolean(activeModal)}
        title={activeModal === 'evolution' ? 'Nova evolução' : 'Receber pagamento'}
        description="O registro será persistido no prontuário."
        onClose={() => { setActiveModal(null); setFormError(''); }}
        size="medium"
      >
        <form className="mutation-form" onSubmit={submitModal}>
          {activeModal === 'evolution' ? (
            <>
              <SearchableSelect name="professionalId" label="Profissional" required defaultValue={professionals[0]?.id ?? ''} options={professionals.map((item) => ({ value: item.id, label: item.name }))} />
              <SearchableSelect
                name="clinicalLink"
                label="Tratamento vinculado"
                placeholder="Sem vínculo específico"
                options={[
                  ...plans.map((item) => ({
                    value: `plan:${String(item.id)}`,
                    label: text(item.title),
                    description: `Plano · ${presentationLabel(item.status)}`,
                  })),
                  ...plans.flatMap((plan) => list(plan.items).map((item) => ({
                    value: `item:${String(plan.id)}:${String(item.id)}`,
                    label: text(nested(item, 'procedure').name, text(item.procedureName, 'Procedimento')),
                    description: `${text(plan.title)} · ${presentationLabel(item.status)}`,
                  }))),
                ]}
              />
              <label className="span-2">Evolução<textarea name="renderedText" required minLength={2} /></label>
            </>
          ) : null}
          {activeModal === 'receive' ? (
            <>
              <label className="span-2">Título em aberto
                <select required value={receiveId} onChange={(event) => {
                  const id = event.target.value;
                  setReceiveId(id);
                  const row = openReceivables.find((item) => String(item.id) === id);
                  setReceiveAmount(row ? String(row.outstandingAmount ?? row.netAmount ?? '') : '');
                }}>
                  <option value="">Selecione</option>
                  {openReceivables.map((item) => (
                    <option key={String(item.id)} value={String(item.id)}>
                      {text(item.description)} · saldo {currency(item.outstandingAmount ?? item.netAmount)} · {dateOnly(item.dueDate)}
                    </option>
                  ))}
                </select>
              </label>
              <label>Forma de pagamento
                <select value={receiveMethod} onChange={(event) => setReceiveMethod(event.target.value)}>
                  <option value="PIX">PIX</option>
                  <option value="CREDIT_CARD">Cartão de crédito</option>
                  <option value="DEBIT_CARD">Cartão de débito</option>
                  <option value="CASH">Dinheiro</option>
                  <option value="TRANSFER">Transferência</option>
                </select>
              </label>
              <label>Valor<input type="number" min="0.01" step="0.01" required value={receiveAmount} onChange={(event) => setReceiveAmount(event.target.value)} /></label>
            </>
          ) : null}
          <button className="button primary" disabled={saving}>
            {activeModal === 'receive' ? 'Confirmar recebimento' : 'Salvar'}
          </button>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
        </form>
      </Modal>

      <section className="page-heading">
        <div>
          <Link className="button small" href="/pacientes">← Voltar à pesquisa</Link>
        </div>
        <div className="heading-actions">
          <button
            className={`button ${presentationMode ? 'soft' : 'secondary'}`}
            type="button"
            onClick={togglePresentation}
          >
            {presentationMode ? '◉ Modo atendimento ativo' : '◉ Modo atendimento'}
          </button>
          <Link className="button primary" href={`/agenda?patientId=${patientId}&new=1`}>＋ Agendar</Link>
        </div>
      </section>

      <article className="patient-profile-head">
        <div className="patient-cover" />
        <div className="patient-identity">
          <div className="patient-avatar">{initials(patient.fullName)}</div>
          <div className="patient-name">
            <h2>
              {text(patient.fullName)}
              {alerts.length > 0 ? (
                <span className="patient-alert-flags" aria-label={`${alerts.length} alerta(s) clínico(s)`}>
                  {alerts.slice(0, 3).map((alert, index) => (
                    <span
                      key={String(alert.id ?? index)}
                      className={`alert-flag ${String(alert.severity ?? '').toLowerCase().includes('high') || String(alert.severity).toLowerCase() === 'critical' ? 'red' : 'amber'}`}
                      title={text(alert.title ?? alert.type ?? 'Alerta')}
                    >
                      !
                    </span>
                  ))}
                </span>
              ) : null}
            </h2>
            <p>
              {[age, code, presentationLabel(patient.status)].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="patient-head-actions">
            {!presentationMode && patient.primaryPhone ? (
              <a
                className="icon-button"
                href={`https://wa.me/55${String(patient.primaryPhone).replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Abrir WhatsApp"
                title="WhatsApp"
              >
                <MessageCircle size={16} />
              </a>
            ) : null}
            <Link
              className="icon-button"
              href={`/pacientes?edit=${patientId}`}
              aria-label="Editar cadastro"
              title="Editar cadastro"
            >
              <Pencil size={16} />
            </Link>
          </div>
        </div>
        <div className="patient-tabs" role="tablist" aria-label="Abas do prontuário">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`patient-tab ${activeTab === tab.id ? 'active' : ''} ${'sensitive' in tab && tab.sensitive ? 'sensitive' : ''}`}
              onClick={() => setTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </article>

      {activeTab === 'resumo' && (
        <div className="patient-grid">
          <div className="dashboard-stack">
            <Panel title="Resumo clínico" description="Informações úteis para o atendimento atual">
              <div className="info-grid">
                <div className="info-item"><small>Tratamento atual</small><strong>{text(plans[0]?.title, 'Sem plano ativo')}</strong></div>
                <div className="info-item"><small>Profissional</small><strong>{text(professionals.find((item) => item.id === plans[0]?.professionalId)?.name, '—')}</strong></div>
                <div className="info-item"><small>Contato</small><strong className="sensitive">{text(patient.primaryPhone)}</strong></div>
                <div className="info-item"><small>CPF</small><strong className="sensitive">{maskCpf(patient.cpf)}</strong></div>
                <div className="info-item"><small>Nascimento</small><strong>{dateOnly(patient.birthDate)}</strong></div>
                <div className="info-item"><small>Evoluções</small><strong>{entries.length}</strong></div>
              </div>
            </Panel>
            <Panel title="Odontograma resumido" description="Última versão · 5 faces (V, L/P, M, D, O/I)" actions={<button className="button small" type="button" onClick={() => setTab('odontograma')}>Abrir</button>}>
              <div className="odontogram-wrap compact-summary">
                <div className="arch" aria-label="Odontograma resumido">
                  {[18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28].map((tooth) => {
                    const faces = [
                      { key: 'V', short: 'V' },
                      { key: 'L', short: 'L/P' },
                      { key: 'M', short: 'M' },
                      { key: 'D', short: 'D' },
                      { key: 'O', short: 'O/I' },
                    ] as const;
                    const hasAny = faces.some((face) => findingsByToothFace.has(`${tooth}:${face.key}`));
                    return (
                      <div key={tooth} className={`tooth ${hasAny ? 'selected' : ''}`}>
                        <div className="tooth-number">{tooth}</div>
                        <div className="tooth-shape five-faces" aria-label={`Dente ${tooth}`}>
                          {faces.map((face) => {
                            const status = findingsByToothFace.get(`${tooth}:${face.key}`);
                            const tone = !status
                              ? ''
                              : ['COMPLETED', 'EXISTING'].includes(status.toUpperCase())
                                ? 'done'
                                : ['PLANNED', 'IN_PROGRESS'].includes(status.toUpperCase())
                                  ? 'planned'
                                  : 'active';
                            return (
                              <button
                                key={face.key}
                                type="button"
                                className={`face face-${face.key.toLowerCase()} ${tone}`}
                                aria-label={`Dente ${tooth} face ${face.short}`}
                                onClick={() => setTab('odontograma')}
                              >
                                <span className="face-label">{face.short}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Panel>
            <Panel title="Últimas evoluções" description="Histórico clínico recente" actions={<button className="button small" type="button" onClick={() => setTab('evolucao')}>Ver histórico</button>}>
              {entries.length === 0 ? <EmptyState title="Sem evoluções" /> : (
                <div className="clinical-timeline">
                  {entries.slice(0, 5).map((entry) => (
                    <button
                      type="button"
                      className="clinical-timeline-item clickable"
                      key={String(entry.id)}
                      onClick={() => setDetailEntryId(String(entry.id))}
                    >
                      <div className="timeline-dot" />
                      <div className="timeline-copy">
                        <strong>{presentationLabel(entry.type)}</strong>
                        <span>{text(entry.renderedText).slice(0, 120)}{text(entry.renderedText).length > 120 ? '…' : ''}</span>
                      </div>
                      <div className="timeline-date">{dateTime(entry.clinicalDate)}</div>
                    </button>
                  ))}
                </div>
              )}
            </Panel>
          </div>
          <div className="dashboard-stack">
            <Panel title="Alertas de saúde" description="Sinalizados no cabeçalho e detalhados aqui">
              {alerts.length === 0 ? <EmptyState title="Nenhum alerta clínico" /> : (
                <div className="health-alerts subtle">
                  {alerts.map((alert, index) => (
                    <div className={`health-alert ${String(alert.severity ?? 'amber').toLowerCase().includes('high') || String(alert.severity).toLowerCase() === 'critical' ? 'red' : 'amber'}`} key={String(alert.id ?? index)}>
                      <span>!</span>
                      <div>
                        <strong>{text(alert.title ?? alert.type ?? 'Alerta')}</strong>
                        <span>{text(alert.description ?? alert.message ?? alert.notes)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
            <Panel title="Responsáveis, alertas e opt-in" description="CRUD mínimo sem exclusão física de alertas">
              <PatientCarePanel patientId={patientId} patient={patient} onChanged={load} />
            </Panel>
            {canFinance && (
              <Panel title="Resumo financeiro" description="Ocultado no modo atendimento" sensitive actions={<button className="button small" type="button" onClick={() => setTab('financeiro')}>Abrir</button>}>
                <div className="summary-strip" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div><small>Títulos</small><strong>{receivables.length}</strong></div>
                  <div><small>Em aberto</small><strong>{currency(receivables.reduce((sum, item) => sum + Number(item.outstandingAmount ?? 0), 0))}</strong></div>
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}

      {activeTab === 'anamnese' && clinicId && (
        <div className="patient-grid anamnese-v2">
          <div className="span-2">
            <AnamnesisWorkspace patientId={patientId} clinicId={clinicId} />
          </div>
        </div>
      )}

      {activeTab === 'odontograma' && (
        <Panel title="Odontograma 2D" description="Adicione achados sob demanda; painel compacto por dente.">
          <div className="odontogram-wrap">
            <OdontogramBoard
              patientId={patientId}
              clinicId={clinicId}
              professionals={professionals}
              conditions={odontogramConditions}
              odontograms={odontograms}
              onSaved={load}
            />
          </div>
        </Panel>
      )}

      {activeTab === 'tratamentos' && clinicId && (
        <TreatmentWorkspace
          clinicId={clinicId}
          patientId={patientId}
          professionals={professionals}
          onChanged={load}
        />
      )}

      {activeTab === 'evolucao' && (
        <Panel title="Evolução clínica" description="Registros cronológicos" actions={<button className="button primary small" type="button" onClick={() => setActiveModal('evolution')}>＋ Nova evolução</button>}>
          {entries.length === 0 ? <EmptyState title="Sem evoluções" /> : (
            <div className="clinical-timeline">
              {entries.map((entry) => (
                <button
                  type="button"
                  className="clinical-timeline-item clickable"
                  key={String(entry.id)}
                  onClick={() => setDetailEntryId(String(entry.id))}
                >
                  <div className="timeline-dot" />
                  <div className="timeline-copy">
                    <strong>{presentationLabel(entry.type)} · {presentationLabel(entry.status)}</strong>
                    <span>{text(entry.renderedText).slice(0, 140)}{text(entry.renderedText).length > 140 ? '…' : ''}</span>
                  </div>
                  <div className="timeline-date">{dateTime(entry.clinicalDate)}</div>
                </button>
              ))}
            </div>
          )}
        </Panel>
      )}

      {activeTab === 'financeiro' && canFinance && (
        <Panel
          title="Financeiro do paciente"
          description="Cobranças vinculadas"
          sensitive
          actions={<button className="button primary small" type="button" onClick={() => { setReceiveId(openReceivables[0] ? String(openReceivables[0].id) : ''); setReceiveAmount(openReceivables[0] ? String(openReceivables[0].outstandingAmount ?? openReceivables[0].netAmount) : ''); setActiveModal('receive'); }} disabled={!openReceivables.length}>＋ Receber</button>}
        >
          <div className="summary-strip">
            <div><small>Títulos</small><strong>{receivables.length}</strong></div>
            <div><small>Em aberto</small><strong>{currency(receivables.reduce((sum, item) => sum + Number(item.outstandingAmount ?? 0), 0))}</strong></div>
            <div><small>Recebido</small><strong>{currency(receivables.reduce((sum, item) => sum + Number(item.paidAmount ?? 0), 0))}</strong></div>
            <div><small>Vencidos</small><strong>{receivables.filter((item) => String(item.effectiveStatus ?? item.status) === 'OVERDUE').length}</strong></div>
          </div>
          {receivables.length === 0 ? <EmptyState title="Sem títulos" /> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Saldo</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {receivables.map((item) => (
                    <tr key={String(item.id)}>
                      <td>{text(item.description)}</td>
                      <td>{dateOnly(item.dueDate)}</td>
                      <td>{currency(item.netAmount)}</td>
                      <td>{currency(item.outstandingAmount ?? item.netAmount)}</td>
                      <td><StatusBadge tone={statusTone(item.effectiveStatus ?? item.status)}>{presentationLabel(item.effectiveStatus ?? item.status)}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {activeTab === 'documentos' && clinicId && (
        <PatientDocumentWorkspace
          clinicId={clinicId}
          patientId={patientId}
          patientName={text(patient.fullName)}
          patientCpf={typeof patient.cpf === 'string' ? patient.cpf : null}
          professionals={professionals}
          onChanged={load}
        />
      )}
    </>
  );
}
