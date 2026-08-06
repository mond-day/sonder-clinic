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
import { OdontogramBoard } from '@/features/odontogram/odontogram-board';
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
  const [documents, setDocuments] = useState<RecordValue[]>([]);
  const [receivables, setReceivables] = useState<RecordValue[]>([]);
  const [documentTemplates, setDocumentTemplates] = useState<RecordValue[]>([]);
  const [odontogramConditions, setOdontogramConditions] = useState<RecordValue[]>([]);
  const [prescriptions, setPrescriptions] = useState<RecordValue[]>([]);
  const [media, setMedia] = useState<RecordValue[]>([]);
  const [activeModal, setActiveModal] = useState<'evolution' | 'document' | 'prescription' | 'receive' | 'plan' | 'media' | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [approveIds, setApproveIds] = useState<string[]>([]);
  const [planDiscount, setPlanDiscount] = useState('');
  const [receiveId, setReceiveId] = useState('');
  const [receiveMethod, setReceiveMethod] = useState('PIX');
  const [receiveAmount, setReceiveAmount] = useState('');
  const [receiveDiscount, setReceiveDiscount] = useState('0');
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
      api.get<RecordValue[]>(`/documents?clinicId=${clinicId}&patientId=${patientId}`).catch(() => []),
      canFinance
        ? api.get<RecordValue[]>(`/receivables?clinicId=${clinicId}`).catch(() => [])
        : Promise.resolve([] as RecordValue[]),
      api.get<RecordValue[]>('/document-templates').catch(() => []),
      api.get<RecordValue[]>('/odontogram-conditions').catch(() => []),
      api.get<RecordValue[]>(`/prescriptions?patientId=${patientId}`).catch(() => []),
      api.get<RecordValue[]>(`/patients/${patientId}/media`).catch(() => []),
    ])
      .then(([nextPatient, nextRecord, nextPlans, nextOdontograms, nextDocuments, nextReceivables, nextDocumentTemplates, nextConditions, nextPrescriptions, nextMedia]) => {
        setPatient(nextPatient);
        setRecord(nextRecord);
        setPlans(list(nextPlans));
        setOdontograms(list(nextOdontograms));
        const docs = list(nextDocuments).filter((item) => item.patientId === patientId);
        setDocuments(docs);
        if (!selectedDocId && docs[0]) setSelectedDocId(String(docs[0].id));
        setReceivables(list(nextReceivables).filter((item) => item.patientId === patientId));
        setDocumentTemplates(list(nextDocumentTemplates));
        setOdontogramConditions(list(nextConditions));
        setPrescriptions(list(nextPrescriptions));
        setMedia(list(nextMedia));
        window.localStorage.setItem('sonder.selectedPatientId', patientId);
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Não foi possível abrir o prontuário.'))
      .finally(() => setLoading(false));
  }, [canFinance, clinicId, patientId, selectedDocId]);

  useEffect(load, [load]);

  const entries = list(record?.entries);
  const alerts = list(record?.alerts ?? patient?.alerts);
  const latestFindings = list(odontograms[0]?.findings);
  const markedTeeth = new Set(latestFindings.map((item) => String(item.toothFdi)));
  const selectedPlan = plans.find((item) => String(item.id) === selectedPlanId) ?? null;
  const selectedDoc = documents.find((item) => String(item.id) === selectedDocId) ?? documents[0] ?? null;
  const openReceivables = useMemo(
    () => receivables.filter((item) => !['PAID', 'CANCELLED'].includes(String(item.status))),
    [receivables],
  );

  const age = ageLabel(patient?.birthDate);
  const code = patient?.id ? `#${String(patient.id).slice(0, 8).toUpperCase()}` : '—';
  const professional = professionals.find((item) => item.id === String(selectedDoc ? nested(selectedDoc, 'template').professionalId : '')) 
    ?? professionals[0];

  async function submitModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeModal) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setFormError('');
    try {
      if (activeModal === 'evolution') {
        await api.post(`/patients/${patientId}/clinical-entries`, {
          clinicId, professionalId: String(data.get('professionalId')), type: 'EVOLUTION',
          renderedText: String(data.get('renderedText')), structuredData: {},
          treatmentId: String(data.get('treatmentId') ?? '') || undefined,
          clinicalDate: new Date().toISOString(),
        });
      } else if (activeModal === 'document') {
        const template = documentTemplates.find((item) => String(item.id) === String(data.get('templateId')));
        const cro = String(data.get('cro') ?? professionals.find((p) => p.id === String(data.get('professionalId')))?.croNumber ?? '');
        await api.post('/documents/generate', {
          clinicId, patientId, templateId: String(data.get('templateId')),
          treatmentId: String(data.get('treatmentId') ?? '') || undefined,
          frozenContent: {
            titulo: text(template?.name, 'Documento clínico'),
            tipo: text(template?.type),
            paciente: text(patient?.fullName),
            pacienteCpf: maskCpf(patient?.cpf),
            profissional: text(professionals.find((p) => p.id === String(data.get('professionalId')))?.name),
            cro,
            data: new Date().toISOString(),
            corpo: String(data.get('content') ?? ''),
            observacoes: String(data.get('content') ?? ''),
          },
        });
      } else if (activeModal === 'prescription') {
        await api.post('/prescriptions', {
          clinicId, patientId, professionalId: String(data.get('professionalId')),
          purpose: String(data.get('purpose')), items: [{ instructions: String(data.get('items')) }],
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
      } else if (activeModal === 'plan' && selectedPlan) {
        if (approveIds.length) {
          await api.post(`/treatment-plans/${selectedPlan.id}/approve`, { itemIds: approveIds });
        }
        await api.patch(`/treatment-plans/${selectedPlan.id}`, {
          discount: planDiscount || String(selectedPlan.discount ?? '0'),
          notes: String(data.get('notes') ?? selectedPlan.notes ?? ''),
        });
      } else if (activeModal === 'media') {
        const form = new FormData();
        form.set('clinicId', clinicId);
        form.set('type', String(data.get('type') || 'DOCUMENT'));
        const file = data.get('file');
        if (file instanceof File) form.set('file', file);
        await api.postForm(`/patients/${patientId}/media`, form);
      }
      setActiveModal(null);
      setApproveIds([]);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function signSelectedDocument(method: 'DRAWN' | 'A1') {
    if (!selectedDoc) return;
    setSaving(true);
    setFormError('');
    try {
      await api.post(`/documents/${String(selectedDoc.id)}/sign`, {
        signerName: text(professional?.name, 'Profissional'),
        role: 'PROFESSIONAL',
        method,
        clinicId,
        evidence: { source: 'patient-chart-documents' },
      });
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Falha ao assinar documento.');
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
  const frozen = nested(selectedDoc ?? {}, 'frozenContent');

  return (
    <>
      <Modal
        open={Boolean(activeModal)}
        title={
          activeModal === 'evolution' ? 'Nova evolução'
            : activeModal === 'document' ? 'Gerar documento'
              : activeModal === 'prescription' ? 'Nova receita'
                : activeModal === 'receive' ? 'Receber pagamento'
                  : activeModal === 'plan' ? 'Gerenciar plano'
                    : 'Enviar mídia'
        }
        description="O registro será persistido no prontuário."
        onClose={() => { setActiveModal(null); setFormError(''); }}
        size={activeModal === 'plan' || activeModal === 'document' ? 'large' : 'medium'}
      >
        <form className="mutation-form" onSubmit={submitModal}>
          {activeModal === 'evolution' ? (
            <>
              <SearchableSelect name="professionalId" label="Profissional" required options={professionals.map((item) => ({ value: item.id, label: item.name }))} />
              <SearchableSelect name="treatmentId" label="Tratamento vinculado" placeholder="Sem tratamento específico" options={plans.map((item) => ({ value: String(item.id), label: text(item.title), description: presentationLabel(item.status) }))} />
              <label className="span-2">Evolução<textarea name="renderedText" required minLength={2} /></label>
            </>
          ) : null}
          {activeModal === 'document' ? (
            <>
              <SearchableSelect name="templateId" label="Modelo" required options={documentTemplates.map((item) => ({ value: String(item.id), label: text(item.name), description: presentationLabel(item.type) }))} />
              <SearchableSelect name="professionalId" label="Profissional / CRO" required options={professionals.map((item) => ({ value: item.id, label: item.name, description: item.croNumber ? `CRO ${item.croNumber}` : undefined }))} />
              <label>CRO<input name="cro" placeholder="Número do CRO" defaultValue={professionals[0]?.croNumber ?? ''} /></label>
              <SearchableSelect name="treatmentId" label="Tratamento vinculado" placeholder="Sem tratamento" options={plans.map((item) => ({ value: String(item.id), label: text(item.title) }))} />
              <label className="span-2">Corpo clínico<textarea name="content" required rows={5} placeholder="Texto clínico conforme normas CRM/CRO" /></label>
            </>
          ) : null}
          {activeModal === 'prescription' ? (
            <>
              <SearchableSelect name="professionalId" label="Profissional" required options={professionals.map((item) => ({ value: item.id, label: item.name }))} />
              <label>Finalidade<input name="purpose" required minLength={3} /></label>
              <label className="span-2">Medicamento, posologia e orientações<textarea name="items" required /></label>
            </>
          ) : null}
          {activeModal === 'receive' ? (
            <>
              <label className="span-2">Título em aberto
                <select required value={receiveId} onChange={(event) => {
                  const id = event.target.value;
                  setReceiveId(id);
                  const row = openReceivables.find((item) => String(item.id) === id);
                  setReceiveAmount(row ? String(row.netAmount ?? '') : '');
                }}>
                  <option value="">Selecione</option>
                  {openReceivables.map((item) => (
                    <option key={String(item.id)} value={String(item.id)}>
                      {text(item.description)} · {currency(item.netAmount)} · {dateOnly(item.dueDate)}
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
              <label>Desconto<input type="number" min="0" step="0.01" value={receiveDiscount} onChange={(event) => setReceiveDiscount(event.target.value)} /></label>
            </>
          ) : null}
          {activeModal === 'plan' && selectedPlan ? (
            <>
              <label className="span-2">Desconto do orçamento
                <input value={planDiscount} onChange={(event) => setPlanDiscount(event.target.value)} placeholder={String(selectedPlan.discount ?? '0')} />
              </label>
              <label className="span-2">Observações<textarea name="notes" defaultValue={text(selectedPlan.notes, '')} /></label>
              <div className="span-2">
                <strong>Itens — aprovação parcial</strong>
                <div className="plan-items-list">
                  {list(selectedPlan.items).map((item) => {
                    const id = String(item.id);
                    const checked = approveIds.includes(id) || ['APPROVED', 'COMPLETED'].includes(String(item.status));
                    return (
                      <label key={id} className="check-field">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={['APPROVED', 'COMPLETED'].includes(String(item.status))}
                          onChange={(event) => {
                            setApproveIds((current) => (
                              event.target.checked ? [...current, id] : current.filter((value) => value !== id)
                            ));
                          }}
                        />
                        <span>
                          {text(nested(item, 'procedure').name, text(item.procedureId))} · {currency(Number(item.unitPrice) * Number(item.quantity))}
                          <small> {presentationLabel(item.status)}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
          {activeModal === 'media' ? (
            <>
              <label>Tipo
                <select name="type" defaultValue="RADIOGRAPHY">
                  <option value="RADIOGRAPHY">Radiografia</option>
                  <option value="PHOTO">Foto</option>
                  <option value="DOCUMENT">Documento</option>
                  <option value="OTHER">Outro</option>
                </select>
              </label>
              <label className="span-2">Arquivo<input name="file" type="file" required /></label>
            </>
          ) : null}
          <button className="button primary" disabled={saving}>
            {activeModal === 'receive' ? 'Confirmar recebimento' : activeModal === 'plan' ? 'Salvar plano' : 'Salvar'}
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
          <Link className="button primary" href="/agenda">＋ Agendar</Link>
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
            <Panel title="Odontograma resumido" description="Última versão registrada" actions={<button className="button small" type="button" onClick={() => setTab('odontograma')}>Abrir</button>}>
              <div className="odontogram-wrap">
                <div className="arch" aria-label="Odontograma resumido">
                  {[18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28].map((tooth) => (
                    <div key={tooth} className={`tooth ${markedTeeth.has(String(tooth)) ? 'selected' : ''}`}>
                      <div className="tooth-number">{tooth}</div>
                      <div className="tooth-shape">
                        <button type="button" className={`face ${markedTeeth.has(String(tooth)) ? 'active' : ''}`} aria-hidden />
                        <button type="button" className="face" aria-hidden />
                        <button type="button" className="face" aria-hidden />
                        <button type="button" className="face" aria-hidden />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
            <Panel title="Últimas evoluções" description="Histórico clínico recente" actions={<button className="button small" type="button" onClick={() => setTab('evolucao')}>Ver histórico</button>}>
              {entries.length === 0 ? <EmptyState title="Sem evoluções" /> : (
                <div className="clinical-timeline">
                  {entries.slice(0, 5).map((entry) => (
                    <div className="clinical-timeline-item" key={String(entry.id)}>
                      <div className="timeline-dot" />
                      <div className="timeline-copy">
                        <strong>{presentationLabel(entry.type)}</strong>
                        <span>{text(entry.renderedText)}</span>
                      </div>
                      <div className="timeline-date">{dateTime(entry.clinicalDate)}</div>
                    </div>
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
            {canFinance && (
              <Panel title="Resumo financeiro" description="Ocultado no modo atendimento" sensitive actions={<button className="button small" type="button" onClick={() => setTab('financeiro')}>Abrir</button>}>
                <div className="summary-strip" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div><small>Títulos</small><strong>{receivables.length}</strong></div>
                  <div><small>Saldo líquido</small><strong>{currency(receivables.reduce((sum, item) => sum + Number(item.netAmount ?? 0), 0))}</strong></div>
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

      {activeTab === 'tratamentos' && (
        <Panel
          title="Planos e tratamentos"
          description="Itens, aprovação parcial e orçamento no prontuário"
          actions={<button className="button primary small" type="button" onClick={() => { setSelectedPlanId(plans[0] ? String(plans[0].id) : null); setActiveModal('plan'); setPlanDiscount(String(plans[0]?.discount ?? '0')); }}>Gerenciar</button>}
        >
          {plans.length === 0 ? <EmptyState title="Nenhum plano" description="Crie um plano pelo módulo de tratamentos ou pela agenda." /> : (
            <div className="treatment-cards">
              {plans.map((plan) => {
                const items = list(plan.items);
                const done = items.filter((item) => ['COMPLETED', 'APPROVED'].includes(String(item.status))).length;
                const pct = items.length ? Math.round((done / items.length) * 100) : 0;
                return (
                  <div className="treatment-card" key={String(plan.id)}>
                    <div>
                      <h3>{text(plan.title)}</h3>
                      <p>{items.length} item(ns) · {dateOnly(plan.createdAt)}</p>
                      <StatusBadge tone={statusTone(plan.status)}>{presentationLabel(plan.status)}</StatusBadge>
                      <div className="progress"><span style={{ width: `${pct}%` }} /></div>
                      <ul className="plan-item-preview">
                        {items.slice(0, 4).map((item) => (
                          <li key={String(item.id)}>
                            {text(nested(item, 'procedure').name, 'Procedimento')} · {presentationLabel(item.status)} · {currency(Number(item.unitPrice) * Number(item.quantity))}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="treatment-side">
                      <strong>{done} de {items.length}</strong>
                      <small>{currency(plan.total)}</small>
                      <button
                        type="button"
                        className="button small"
                        onClick={() => {
                          setSelectedPlanId(String(plan.id));
                          setPlanDiscount(String(plan.discount ?? '0'));
                          setApproveIds(items.filter((item) => item.status === 'APPROVED').map((item) => String(item.id)));
                          setActiveModal('plan');
                        }}
                      >
                        Editar / aprovar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {activeTab === 'evolucao' && (
        <Panel title="Evolução clínica" description="Registros cronológicos" actions={<button className="button primary small" type="button" onClick={() => setActiveModal('evolution')}>＋ Nova evolução</button>}>
          {entries.length === 0 ? <EmptyState title="Sem evoluções" /> : (
            <div className="clinical-timeline">
              {entries.map((entry) => (
                <div className="clinical-timeline-item" key={String(entry.id)}>
                  <div className="timeline-dot" />
                  <div className="timeline-copy">
                    <strong>{presentationLabel(entry.type)}</strong>
                    <span>{text(entry.renderedText)}</span>
                  </div>
                  <div className="timeline-date">{dateTime(entry.clinicalDate)}</div>
                </div>
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
          actions={<button className="button primary small" type="button" onClick={() => { setReceiveId(openReceivables[0] ? String(openReceivables[0].id) : ''); setReceiveAmount(openReceivables[0] ? String(openReceivables[0].netAmount) : ''); setActiveModal('receive'); }} disabled={!openReceivables.length}>＋ Receber</button>}
        >
          <div className="summary-strip">
            <div><small>Títulos</small><strong>{receivables.length}</strong></div>
            <div><small>Líquido</small><strong>{currency(receivables.reduce((sum, item) => sum + Number(item.netAmount ?? 0), 0))}</strong></div>
            <div><small>Pagos</small><strong>{receivables.filter((item) => item.status === 'PAID').length}</strong></div>
            <div><small>Vencidos</small><strong>{receivables.filter((item) => item.status === 'OVERDUE').length}</strong></div>
          </div>
          {receivables.length === 0 ? <EmptyState title="Sem títulos" /> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {receivables.map((item) => (
                    <tr key={String(item.id)}>
                      <td>{text(item.description)}</td>
                      <td>{dateOnly(item.dueDate)}</td>
                      <td>{currency(item.netAmount)}</td>
                      <td><StatusBadge tone={statusTone(item.status)}>{presentationLabel(item.status)}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {activeTab === 'documentos' && (
        <>
          <Panel
            title="Documentos clínicos"
            description="Atestados e receituários alinhados a identificação profissional, paciente, data, corpo e assinatura."
            actions={(
              <>
                <button className="button soft small" type="button" onClick={() => setActiveModal('media')}>Enviar mídia</button>
                <button className="button small" type="button" onClick={() => setActiveModal('prescription')}>Nova receita</button>
                <button className="button primary small" type="button" onClick={() => setActiveModal('document')}>Gerar documento</button>
              </>
            )}
          >
            {documents.length === 0 ? <EmptyState title="Nenhum documento" /> : (
              <div className="document-paper-grid compact">
                <aside className="doc-list">
                  {documents.map((doc) => (
                    <button
                      type="button"
                      className={`doc-template ${String(doc.id) === String(selectedDoc?.id) ? 'active' : ''}`}
                      key={String(doc.id)}
                      onClick={() => setSelectedDocId(String(doc.id))}
                    >
                      <strong>{text(nested(doc, 'template').name, text(doc.validationCode))}</strong>
                      <br />
                      <small>{presentationLabel(doc.status)} · {dateOnly(doc.generatedAt)}</small>
                    </button>
                  ))}
                </aside>
                {selectedDoc ? (
                  <article className="paper clinical-paper">
                    <header className="paper-letterhead">
                      <div>
                        <strong>SONDER CLINIC</strong>
                        <span>Documento odontológico</span>
                      </div>
                      <div className="paper-meta">
                        <span>{presentationLabel(nested(selectedDoc, 'template').type)}</span>
                        <span>Cód. {text(selectedDoc.validationCode)}</span>
                      </div>
                    </header>
                    <h2>{text(frozen.titulo, text(nested(selectedDoc, 'template').name)).toUpperCase()}</h2>
                    <section className="paper-identity">
                      <p><strong>Paciente:</strong> {text(frozen.paciente, text(patient.fullName))}</p>
                      <p><strong>CPF:</strong> {text(frozen.pacienteCpf, maskCpf(patient.cpf))}</p>
                      <p><strong>Profissional:</strong> {text(frozen.profissional, text(professional?.name))}</p>
                      <p><strong>CRO:</strong> {text(frozen.cro, professional?.croNumber ? `CRO ${professional.croNumber}` : '—')}</p>
                      <p><strong>Data:</strong> {dateOnly(frozen.data ?? selectedDoc.generatedAt)}</p>
                    </section>
                    <section className="paper-body">
                      <p>{text(frozen.corpo, text(frozen.observacoes, text(frozen.prescricao, 'Conteúdo clínico congelado na geração.')))}</p>
                    </section>
                    <div className="paper-signatures">
                      <div>
                        <span>Assinatura do profissional</span>
                        <small>{text(frozen.profissional, text(professional?.name))}</small>
                      </div>
                      <div>
                        <span>Assinatura do paciente</span>
                        <small>{text(patient.fullName)}</small>
                      </div>
                    </div>
                    {selectedDoc.status !== 'SIGNED' ? (
                      <div className="heading-actions" style={{ marginTop: 16 }}>
                        <button type="button" className="button soft" disabled={saving} onClick={() => void signSelectedDocument('DRAWN')}>Assinar (desenhada)</button>
                        <button type="button" className="button primary" disabled={saving} onClick={() => void signSelectedDocument('A1')}>Assinar com A1</button>
                      </div>
                    ) : (
                      <p className="muted-note">Documento assinado e imutável.</p>
                    )}
                    {formError ? <p className="form-error" role="alert">{formError}</p> : null}
                  </article>
                ) : null}
              </div>
            )}
          </Panel>
          <Panel title="Receitas" description="Rascunhos persistidos; assinatura A1 exige certificado válido">
            {prescriptions.length ? (
              <div className="document-grid">
                {prescriptions.map((item) => (
                  <div className="doc-card" key={String(item.id)}>
                    <div className="doc-icon">RX</div>
                    <h3>{text(item.purpose)}</h3>
                    <p>{presentationLabel(item.status)}</p>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="Nenhuma receita" />}
          </Panel>
          {media.length ? (
            <Panel title="Mídias do paciente" description="Uploads multipart (PatientMedia)">
              <ul className="plan-item-preview">
                {media.map((item) => (
                  <li key={String(item.id)}>
                    {text(nested(item, 'file').originalName)} · {text(item.type)} · AV {text(nested(item, 'file').antivirusStatus)}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </>
      )}
    </>
  );
}
