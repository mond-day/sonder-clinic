'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Camera, MessageCircle, Pencil } from 'lucide-react';
import { api, ApiError, getApiUrl } from '@/lib/api';
import {
  ageLabel,
  currency,
  dateOnly,
  dateTime,
  toDateInputValue,
  daysUntilBirthday,
  formatCpf,
  formatMoneyInputFromValue,
  formatPhone,
  hasPermission,
  initials,
  list,
  maskCpf,
  maskMoneyInput,
  moneyInputToApi,
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
  const { clinicId, clinics, professionals } = useSelection();
  const { enabled: presentationMode, toggle: togglePresentation } = usePresentation();
  const canFinance = hasPermission(user?.permissions, 'financial.view');

  const [patient, setPatient] = useState<RecordValue | null>(null);
  const [record, setRecord] = useState<RecordValue | null>(null);
  const [plans, setPlans] = useState<RecordValue[]>([]);
  const [odontograms, setOdontograms] = useState<RecordValue[]>([]);
  const [receivables, setReceivables] = useState<RecordValue[]>([]);
  const [odontogramConditions, setOdontogramConditions] = useState<RecordValue[]>([]);
  const [activeModal, setActiveModal] = useState<'evolution' | 'receive' | null>(null);
  const [financeDetail, setFinanceDetail] = useState<RecordValue | null>(null);
  const [financeEdit, setFinanceEdit] = useState(false);
  const [financeBusy, setFinanceBusy] = useState(false);
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null);
  const [receiveId, setReceiveId] = useState('');
  const [receiveMethod, setReceiveMethod] = useState('PIX');
  const [receiveAmount, setReceiveAmount] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [photoMediaId, setPhotoMediaId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState('');

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
      api.get<RecordValue[]>(`/patients/${patientId}/media`).catch(() => []),
    ])
      .then(([nextPatient, nextRecord, nextPlans, nextOdontograms, nextReceivables, nextConditions, nextMedia]) => {
        setPatient(nextPatient);
        setRecord(nextRecord);
        setPlans(list(nextPlans));
        setOdontograms(list(nextOdontograms));
        setReceivables(list(nextReceivables));
        setOdontogramConditions(list(nextConditions));
        const profilePhoto = list(nextMedia).find((item) => String(item.type) === 'PROFILE_PHOTO' && !item.archivedAt);
        setPhotoMediaId(profilePhoto ? String(profilePhoto.id) : null);
        window.localStorage.setItem('sonder.selectedPatientId', patientId);
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Não foi possível abrir o prontuário.'))
      .finally(() => setLoading(false));
  }, [canFinance, clinicId, patientId]);

  useEffect(load, [load]);

  const entries = list(record?.entries);
  const patientAlerts = list(patient?.alerts).filter((alert) => alert.active !== false);
  const alerts = patientAlerts;
  const allergyAlerts = patientAlerts.filter((alert) => {
    const haystack = `${alert.type ?? ''} ${alert.message ?? ''} ${alert.title ?? ''}`.toLowerCase();
    return haystack.includes('allerg') || haystack.includes('alerg');
  });
  const birthdayInDays = daysUntilBirthday(patient?.birthDate);
  const birthdaySoon = birthdayInDays != null && birthdayInDays >= 0 && birthdayInDays <= 14;
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
  const preferred = text(patient?.preferredName, '');
  const identityMeta = [
    age,
    preferred ? `“${preferred}”` : null,
    presentationLabel(patient?.status),
  ].filter(Boolean);

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
        const amount = Number(moneyInputToApi(receiveAmount));
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
        description={
          activeModal === 'evolution'
            ? 'A evolução ficará registrada no prontuário do paciente.'
            : activeModal === 'receive'
              ? 'O recebimento será registrado no financeiro do paciente.'
              : undefined
        }
        onClose={() => { setActiveModal(null); setFormError(''); }}
        size="medium"
        confirmOnClose
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
                  setReceiveAmount(row ? formatMoneyInputFromValue(row.outstandingAmount ?? row.netAmount ?? '') : '');
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
              <label>Valor<input inputMode="numeric" required value={receiveAmount} placeholder="0,00" onChange={(event) => setReceiveAmount(maskMoneyInput(event.target.value))} /></label>
            </>
          ) : null}
          <button className="button primary" disabled={saving}>
            {activeModal === 'receive' ? 'Confirmar recebimento' : 'Salvar'}
          </button>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
        </form>
      </Modal>

      <Modal
        open={Boolean(financeDetail)}
        title="Detalhe do título"
        description="Origem clínica e dados do recebível."
        onClose={() => { setFinanceDetail(null); setFinanceEdit(false); setFormError(''); }}
        size="medium"
        confirmOnClose={financeEdit}
      >
        {financeDetail ? (
          financeEdit ? (
            <form
              className="mutation-form"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                setFinanceBusy(true);
                setFormError('');
                void (async () => {
                  try {
                    await api.patch(`/receivables/${String(financeDetail.id)}`, {
                      description: String(data.get('description') ?? '').trim(),
                      dueDate: String(data.get('dueDate') ?? ''),
                      paymentMethod: String(data.get('paymentMethod') ?? '') || undefined,
                    });
                    setFinanceEdit(false);
                    setFinanceDetail(null);
                    load();
                  } catch (cause) {
                    setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar o título.');
                  } finally {
                    setFinanceBusy(false);
                  }
                })();
              }}
            >
              <label className="span-2">Descrição<input name="description" required minLength={3} defaultValue={text(financeDetail.description, '')} /></label>
              <label>Vencimento<input name="dueDate" type="date" required defaultValue={toDateInputValue(financeDetail.dueDate)} /></label>
              <label>Forma de pagamento
                <select name="paymentMethod" defaultValue={text(financeDetail.paymentMethod, '')}>
                  <option value="">Não informado</option>
                  <option value="PIX">PIX</option>
                  <option value="CASH">Dinheiro</option>
                  <option value="DEBIT_CARD">Cartão de débito</option>
                  <option value="TRANSFER">Transferência</option>
                  <option value="CREDIT_CARD">Cartão de crédito</option>
                  <option value="CLINIC_INSTALLMENT">Parcelado na clínica</option>
                  <option value="OTHER">Outro</option>
                </select>
              </label>
              {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
              <div className="form-actions span-2">
                <button type="button" className="button" onClick={() => setFinanceEdit(false)}>Voltar</button>
                <button type="submit" className="button primary" disabled={financeBusy}>{financeBusy ? 'Salvando…' : 'Salvar'}</button>
              </div>
            </form>
          ) : (
            <div>
              <div className="info-grid">
                <div className="info-item"><small>Descrição</small><strong>{text(financeDetail.description)}</strong></div>
                <div className="info-item"><small>Status</small><strong>{presentationLabel(financeDetail.effectiveStatus ?? financeDetail.status)}</strong></div>
                <div className="info-item"><small>Valor</small><strong>{currency(financeDetail.netAmount)}</strong></div>
                <div className="info-item"><small>Saldo</small><strong>{currency(financeDetail.outstandingAmount ?? financeDetail.netAmount)}</strong></div>
                <div className="info-item"><small>Vencimento</small><strong>{dateOnly(financeDetail.dueDate)}</strong></div>
                <div className="info-item"><small>Forma de pagamento</small><strong>{presentationLabel(financeDetail.paymentMethod)}</strong></div>
                <div className="info-item span-2">
                  <small>Origem</small>
                  <strong>
                    {nested(financeDetail, 'treatment').title
                      ? `Plano de tratamento: ${text(nested(financeDetail, 'treatment').title)}`
                      : 'Título avulso (sem plano vinculado)'}
                  </strong>
                </div>
                {nested(financeDetail, 'treatment').status ? (
                  <div className="info-item"><small>Situação do plano</small><strong>{presentationLabel(nested(financeDetail, 'treatment').status)}</strong></div>
                ) : null}
              </div>
              <div className="modal-footer">
                {nested(financeDetail, 'treatment').id ? (
                  <button type="button" className="button" onClick={() => { setFinanceDetail(null); setTab('tratamentos'); }}>
                    Abrir tratamento
                  </button>
                ) : null}
                {!['PAID', 'CANCELLED'].includes(String(financeDetail.status)) ? (
                  <button type="button" className="button primary" onClick={() => setFinanceEdit(true)}>Editar</button>
                ) : null}
              </div>
            </div>
          )
        ) : null}
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
          <PatientAvatar
            patientId={patientId}
            clinicId={clinicId}
            name={text(patient.fullName)}
            mediaId={photoMediaId}
            canUpload={hasPermission(user?.permissions, 'medical_record.create', 'document.create')}
            error={photoError}
            onError={setPhotoError}
            onUploaded={(id) => {
              setPhotoMediaId(id);
              setPhotoError('');
            }}
          />
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
              {identityMeta.join(' · ')}
            </p>
            {photoError ? <p className="form-error" role="alert">{photoError}</p> : null}
            {(birthdaySoon || allergyAlerts.length > 0 || patientAlerts.length > 0) ? (
              <div className="patient-cue-badges" aria-label="Indicadores clínicos">
                {birthdaySoon ? (
                  <span className="patient-cue birthday" title="Aniversário próximo">
                    {birthdayInDays === 0 ? 'Aniversário hoje' : `Aniversário em ${birthdayInDays} dia${birthdayInDays === 1 ? '' : 's'}`}
                  </span>
                ) : null}
                {allergyAlerts.slice(0, 2).map((alert, index) => {
                  const message = text(alert.message ?? alert.type, 'Alergia');
                  const label = /alerg/i.test(message) ? message : `Alergia: ${message}`;
                  return (
                    <span
                      key={String(alert.id ?? `allergy-${index}`)}
                      className="patient-cue allergy"
                      title={message}
                    >
                      {label.length > 40 ? `${label.slice(0, 40)}…` : label}
                    </span>
                  );
                })}
                {allergyAlerts.length === 0
                  ? patientAlerts.slice(0, 2).map((alert, index) => (
                    <span
                      key={String(alert.id ?? `alert-${index}`)}
                      className={`patient-cue ${String(alert.severity ?? '').toLowerCase().includes('crit') || String(alert.severity).toUpperCase() === 'HIGH' ? 'critical' : 'warn'}`}
                      title={text(alert.message ?? alert.type, 'Alerta')}
                    >
                      {text(alert.type ?? alert.title, 'Alerta')}
                    </span>
                  ))
                  : null}
              </div>
            ) : null}
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
                <div className="info-item">
                  <small>Contato</small>
                  <strong>
                    {presentationMode ? '•••' : formatPhone(patient.primaryPhone)}
                  </strong>
                </div>
                <div className="info-item">
                  <small>CPF</small>
                  <strong>
                    {presentationMode ? maskCpf(patient.cpf) : formatCpf(patient.cpf)}
                  </strong>
                </div>
                <div className="info-item"><small>Nascimento</small><strong>{dateOnly(patient.birthDate)}</strong></div>
                <div className="info-item"><small>Evoluções</small><strong>{entries.length}</strong></div>
              </div>
            </Panel>
            <Panel title="Odontograma resumido" description="Situação atual por dente e face" actions={<button className="button small" type="button" onClick={() => setTab('odontograma')}>Abrir</button>}>
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
            <Panel title="Responsáveis e comunicação" description="Responsáveis, alertas clínicos e autorizações de contato.">
              <PatientCarePanel patientId={patientId} patient={patient} onChanged={load} />
            </Panel>
            {canFinance && (
              <Panel title="Resumo financeiro" sensitive actions={<button className="button small" type="button" onClick={() => setTab('financeiro')}>Abrir</button>}>
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
        <Panel title="Odontograma" description="Registre condições e procedimentos por dente e face.">
          <div className="odontogram-wrap">
            <OdontogramBoard
              patientId={patientId}
              clinicId={clinicId}
              patientName={text(patient?.fullName, '') || undefined}
              clinicName={clinics.find((item) => item.id === clinicId)?.tradeName}
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
          patientName={text(patient.fullName)}
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
          actions={<button className="button primary small" type="button" onClick={() => { setReceiveId(openReceivables[0] ? String(openReceivables[0].id) : ''); setReceiveAmount(openReceivables[0] ? formatMoneyInputFromValue(openReceivables[0].outstandingAmount ?? openReceivables[0].netAmount) : ''); setActiveModal('receive'); }} disabled={!openReceivables.length}>＋ Receber</button>}
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
                  <tr><th>Descrição</th><th>Origem</th><th>Vencimento</th><th>Valor</th><th>Saldo</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {receivables.map((item) => {
                    const origin = nested(item, 'treatment');
                    return (
                      <tr
                        key={String(item.id)}
                        className="clickable-row"
                        onClick={() => { setFinanceDetail(item); setFinanceEdit(false); }}
                      >
                        <td>{text(item.description)}</td>
                        <td>{text(origin.title, 'Avulso')}</td>
                        <td>{dateOnly(item.dueDate)}</td>
                        <td>{currency(item.netAmount)}</td>
                        <td>{currency(item.outstandingAmount ?? item.netAmount)}</td>
                        <td><StatusBadge tone={statusTone(item.effectiveStatus ?? item.status)}>{presentationLabel(item.effectiveStatus ?? item.status)}</StatusBadge></td>
                      </tr>
                    );
                  })}
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

function PatientAvatar({
  patientId,
  clinicId,
  name,
  mediaId,
  canUpload,
  error,
  onError,
  onUploaded,
}: {
  patientId: string;
  clinicId: string;
  name: string;
  mediaId: string | null;
  canUpload: boolean;
  error: string;
  onError: (message: string) => void;
  onUploaded: (mediaId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!mediaId) {
      setPhotoUrl(null);
      return;
    }
    let revoked = false;
    let created: string | null = null;
    void fetch(`${getApiUrl()}/patients/${patientId}/media/${mediaId}/download`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Não foi possível carregar a foto.');
        const blob = await response.blob();
        created = URL.createObjectURL(blob);
        if (!revoked) setPhotoUrl(created);
      })
      .catch(() => {
        if (!revoked) setPhotoUrl(null);
      });
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [mediaId, patientId]);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !clinicId) return;
    if (!file.type.startsWith('image/')) {
      onError('Envie uma imagem (JPG, PNG ou WEBP).');
      return;
    }
    setUploading(true);
    onError('');
    try {
      const form = new FormData();
      form.set('clinicId', clinicId);
      form.set('type', 'PROFILE_PHOTO');
      form.set('displayName', 'Foto de perfil');
      form.set('file', file);
      const uploaded = await api.postForm<RecordValue>(`/patients/${patientId}/media`, form);
      onUploaded(String(uploaded.id));
    } catch (cause) {
      const message = cause instanceof ApiError ? cause.message : '';
      const status = cause instanceof ApiError ? cause.status : 0;
      if (/storage|STORAGE_|armazenamento/i.test(message)) {
        onError('O envio de fotos ainda não está disponível nesta instalação.');
      } else if (/internal server error/i.test(message) || status >= 500) {
        onError('Não foi possível enviar a foto. Verifique se o armazenamento está configurado e tente novamente.');
      } else {
        onError(message || 'Não foi possível enviar a foto.');
      }
    } finally {
      setUploading(false);
    }
  }

  const inner = photoUrl ? <img src={photoUrl} alt="" /> : initials(name);

  if (!canUpload) {
    return <div className="patient-avatar">{inner}</div>;
  }

  return (
    <>
      <button
        type="button"
        className="patient-avatar patient-avatar-upload"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || !clinicId}
        title={error || (photoUrl ? 'Alterar foto do paciente' : 'Adicionar foto do paciente')}
        aria-label={photoUrl ? 'Alterar foto do paciente' : 'Adicionar foto do paciente'}
      >
        {inner}
        <span className="patient-avatar-hint">
          <Camera size={16} />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => void onFile(event)}
      />
    </>
  );
}
