'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const [anamnesisTemplates, setAnamnesisTemplates] = useState<RecordValue[]>([]);
  const [documentTemplates, setDocumentTemplates] = useState<RecordValue[]>([]);
  const [odontogramConditions, setOdontogramConditions] = useState<RecordValue[]>([]);
  const [prescriptions, setPrescriptions] = useState<RecordValue[]>([]);
  const [activeModal, setActiveModal] = useState<'anamnesis' | 'odontogram' | 'evolution' | 'document' | 'prescription' | null>(null);
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
      api.get<RecordValue[]>('/anamnesis/templates').catch(() => []),
      api.get<RecordValue[]>('/document-templates').catch(() => []),
      api.get<RecordValue[]>('/odontogram-conditions').catch(() => []),
      api.get<RecordValue[]>(`/prescriptions?patientId=${patientId}`).catch(() => []),
    ])
      .then(([nextPatient, nextRecord, nextPlans, nextOdontograms, nextDocuments, nextReceivables, templates, nextDocumentTemplates, nextConditions, nextPrescriptions]) => {
        setPatient(nextPatient);
        setRecord(nextRecord);
        setPlans(list(nextPlans));
        setOdontograms(list(nextOdontograms));
        setDocuments(list(nextDocuments).filter((item) => item.patientId === patientId));
        setReceivables(list(nextReceivables).filter((item) => item.patientId === patientId));
        setAnamnesisTemplates(list(templates));
        setDocumentTemplates(list(nextDocumentTemplates));
        setOdontogramConditions(list(nextConditions));
        setPrescriptions(list(nextPrescriptions));
        window.localStorage.setItem('sonder.selectedPatientId', patientId);
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Não foi possível abrir o prontuário.'))
      .finally(() => setLoading(false));
  }, [canFinance, clinicId, patientId]);

  useEffect(load, [load]);

  const entries = list(record?.entries);
  const alerts = list(record?.alerts ?? patient?.alerts);
  const latestFindings = list(odontograms[0]?.findings);
  const markedTeeth = new Set(latestFindings.map((item) => String(item.toothFdi)));

  const age = ageLabel(patient?.birthDate);
  const code = patient?.id ? `#${String(patient.id).slice(0, 8).toUpperCase()}` : '—';

  async function submitModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeModal) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setFormError('');
    try {
      if (activeModal === 'anamnesis') {
        await api.post(`/patients/${patientId}/anamnesis`, {
          clinicId, templateId: String(data.get('templateId')),
          answers: { observacoes: String(data.get('answers') ?? '') },
        });
      } else if (activeModal === 'odontogram') {
        await api.post(`/patients/${patientId}/odontograms`, {
          clinicId,
          professionalId: String(data.get('professionalId')),
          dentitionType: 'PERMANENT',
          findings: [{
            conditionId: String(data.get('conditionId')),
            toothFdi: String(data.get('toothFdi')),
            status: String(data.get('status')),
            notes: String(data.get('notes') ?? '') || undefined,
          }],
        });
      } else if (activeModal === 'evolution') {
        await api.post(`/patients/${patientId}/clinical-entries`, {
          clinicId, professionalId: String(data.get('professionalId')), type: 'EVOLUTION',
          renderedText: String(data.get('renderedText')), structuredData: {},
          treatmentId: String(data.get('treatmentId') ?? '') || undefined,
          clinicalDate: new Date().toISOString(),
        });
      } else if (activeModal === 'document') {
        await api.post('/documents/generate', {
          clinicId, patientId, templateId: String(data.get('templateId')),
          treatmentId: String(data.get('treatmentId') ?? '') || undefined,
          frozenContent: { observacoes: String(data.get('content') ?? ''), generatedAt: new Date().toISOString() },
        });
      } else {
        await api.post('/prescriptions', {
          clinicId, patientId, professionalId: String(data.get('professionalId')),
          purpose: String(data.get('purpose')), items: [{ instructions: String(data.get('items')) }],
        });
      }
      setActiveModal(null);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar.');
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
      <Modal open={Boolean(activeModal)} title={activeModal === 'anamnesis' ? 'Preencher anamnese' : activeModal === 'odontogram' ? 'Registrar no odontograma' : activeModal === 'evolution' ? 'Nova evolução' : activeModal === 'document' ? 'Gerar documento' : 'Nova receita'} description="O registro será persistido no prontuário real." onClose={() => { setActiveModal(null); setFormError(''); }}>
        <form className="mutation-form" onSubmit={submitModal}>
          {activeModal === 'anamnesis' ? <><SearchableSelect name="templateId" label="Modelo" required options={anamnesisTemplates.map((item) => ({ value: String(item.id), label: text(item.name) }))} /><label className="span-2">Respostas e observações<textarea name="answers" required /></label></> : null}
          {activeModal === 'odontogram' ? <><SearchableSelect name="professionalId" label="Profissional" required options={professionals.map((item) => ({ value: item.id, label: item.name }))} /><SearchableSelect name="conditionId" label="Condição" required options={odontogramConditions.map((item) => ({ value: String(item.id), label: text(item.name) }))} /><label>Dente FDI<input name="toothFdi" pattern="[1-8][1-8]" maxLength={2} required /></label><SearchableSelect name="status" label="Status" defaultValue="EXISTING" options={['EXISTING', 'PLANNED', 'IN_PROGRESS', 'COMPLETED'].map((value) => ({ value, label: presentationLabel(value) }))} /><label className="span-2">Observações<textarea name="notes" /></label></> : null}
          {activeModal === 'evolution' ? <><SearchableSelect name="professionalId" label="Profissional" required options={professionals.map((item) => ({ value: item.id, label: item.name }))} /><SearchableSelect name="treatmentId" label="Tratamento vinculado" placeholder="Sem tratamento específico" options={plans.map((item) => ({ value: String(item.id), label: text(item.title), description: presentationLabel(item.status) }))} /><label className="span-2">Evolução<textarea name="renderedText" required minLength={2} /></label></> : null}
          {activeModal === 'document' ? <><SearchableSelect name="templateId" label="Documento padrão" required options={documentTemplates.map((item) => ({ value: String(item.id), label: text(item.name), description: presentationLabel(item.type) }))} /><SearchableSelect name="treatmentId" label="Tratamento vinculado" placeholder="Sem tratamento específico" options={plans.map((item) => ({ value: String(item.id), label: text(item.title) }))} /><label className="span-2">Conteúdo complementar<textarea name="content" /></label></> : null}
          {activeModal === 'prescription' ? <><SearchableSelect name="professionalId" label="Profissional" required options={professionals.map((item) => ({ value: item.id, label: item.name }))} /><label>Finalidade<input name="purpose" required minLength={3} /></label><label className="span-2">Medicamento, posologia e orientações<textarea name="items" required /></label><p className="muted-note span-2">A receita ficará em rascunho. Assinatura digital só será disponibilizada com provedor e certificado válidos.</p></> : null}
          <button className="button primary" disabled={saving}>Salvar no prontuário</button>
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
            <h2>{text(patient.fullName)}</h2>
            <p>
              {[age, code, `Status ${presentationLabel(patient.status)}`].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="patient-head-actions">
            {!presentationMode && patient.primaryPhone ? (
              <a className="button small sensitive" href={`https://wa.me/55${String(patient.primaryPhone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            ) : null}
            <Link className="button small" href={`/pacientes?edit=${patientId}`}>Editar cadastro</Link>
          </div>
        </div>
        <div className="privacy-banner">
          <span>◉</span>
          <span>
            Prontuário isolado: nenhum outro paciente aparece nesta tela.
            {presentationMode
              ? ' Modo atendimento ocultando dados administrativos e financeiros.'
              : ' Use o modo atendimento para ocultar informações administrativas e financeiras.'}
          </span>
          <button className="button small" type="button" onClick={togglePresentation}>
            {presentationMode ? 'Desativar' : 'Ativar modo atendimento'}
          </button>
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
                <div className="legend-row">
                  <span><i style={{ background: '#f4c4c2' }} />Com achado</span>
                  <span><i style={{ background: '#b9c9cc' }} />Sem registro</span>
                </div>
              </div>
            </Panel>
            <Panel title="Últimas evoluções" description="Histórico clínico recente" actions={<button className="button small" type="button" onClick={() => setTab('evolucao')}>Ver histórico</button>}>
              {entries.length === 0 ? <EmptyState title="Sem evoluções" description="Registre a primeira evolução na aba Evolução ou em Tratamentos." /> : (
                <div className="timeline">
                  {entries.slice(0, 5).map((entry) => (
                    <div className="timeline-item" key={String(entry.id)}>
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
            <Panel title="Alertas de saúde" description="Exibidos antes de procedimentos">
              {alerts.length === 0 ? <EmptyState title="Nenhum alerta clínico" /> : (
                <div className="health-alerts">
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
            <Panel title="Próximas ações" description="Clínicas e administrativas">
              <div className="billing-list">
                <div className="billing-row"><div><strong>Revisar prontuário</strong><span>Abas clínicas disponíveis</span></div><StatusBadge tone="blue">Aberto</StatusBadge></div>
                <div className="billing-row"><div><strong>Planos de tratamento</strong><span>{plans.length} registro(s)</span></div><StatusBadge tone="green">Ver aba</StatusBadge></div>
                <div className="billing-row"><div><strong>Documentos</strong><span>{documents.length} gerado(s)</span></div><StatusBadge tone="gray">Ver aba</StatusBadge></div>
              </div>
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
          <Panel title="Alertas do prontuário" description="Derivados da anamnese e demais registros">
            {alerts.length === 0 ? <EmptyState title="Sem alertas" /> : (
              <div className="health-alerts">
                {alerts.map((alert, index) => (
                  <div className="health-alert amber" key={String(alert.id ?? index)}>
                    <span>!</span>
                    <div>
                      <strong>{text(alert.title ?? alert.type ?? 'Alerta')}</strong>
                      <span>{text(alert.description ?? alert.message)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {activeTab === 'odontograma' && (
        <Panel title="Odontograma 2D" description="Seleção por dente e por face, com painel compacto e histórico.">
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
        <Panel title="Planos e tratamentos" description="Planos vinculados a este paciente" actions={<Link className="button primary small" href="/tratamentos">Gerenciar</Link>}>
          {plans.length === 0 ? <EmptyState title="Nenhum plano" description="Crie planos no módulo de tratamentos." /> : (
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
                    </div>
                    <div className="treatment-side">
                      <strong>{done} de {items.length}</strong>
                      <small>{currency(plan.total)}</small>
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
            <div className="timeline">
              {entries.map((entry) => (
                <div className="timeline-item" key={String(entry.id)}>
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
        <Panel title="Financeiro do paciente" description="Cobranças vinculadas" sensitive actions={<Link className="button primary small" href="/financeiro">＋ Receber</Link>}>
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
          title="Documentos"
          description="Prévia paper, geração e assinatura. Biblioteca completa em /documentos."
          actions={(
            <>
              <Link className="button soft small" href="/documentos">Abrir biblioteca</Link>
              <button className="button primary small" type="button" onClick={() => setActiveModal('document')}>Gerar documento</button>
              <button className="button small" type="button" onClick={() => setActiveModal('prescription')}>Nova receita</button>
            </>
          )}
        >
          {documents.length === 0 ? <EmptyState title="Nenhum documento" /> : (
            <div className="document-paper-grid compact">
              <aside className="doc-list">
                {documents.map((doc) => (
                  <div className="doc-template" key={String(doc.id)}>
                    <strong>{text(nested(doc, 'template').name, text(doc.validationCode))}</strong>
                    <br />
                    <small>{presentationLabel(doc.status)} · v{text(doc.templateVersion)}</small>
                  </div>
                ))}
              </aside>
              <article className="paper">
                <p><strong>SONDER CLINIC</strong><br />Documento do prontuário</p>
                <h2>{text(nested(documents[0]!, 'template').name, 'DOCUMENTO').toUpperCase()}</h2>
                <p>Paciente: <strong>{text(patient.fullName)}</strong></p>
                <p>{text(nested(documents[0]!, 'frozenContent').observacoes, 'Conteúdo congelado na geração.')}</p>
                <div className="paper-signatures">
                  <div>Assinatura do profissional</div>
                  <div>Assinatura do paciente</div>
                </div>
              </article>
            </div>
          )}
        </Panel>
        <Panel title="Receitas" description="Rascunhos persistidos; assinatura depende de certificado e provedor">
          {prescriptions.length ? <div className="document-grid">{prescriptions.map((item) => <div className="doc-card" key={String(item.id)}><div className="doc-icon">RX</div><h3>{text(item.purpose)}</h3><p>{presentationLabel(item.status)}</p></div>)}</div> : <EmptyState title="Nenhuma receita" /> }
        </Panel>
        </>
      )}
    </>
  );
}
