'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Pencil, Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { list, presentationLabel, text, type RecordValue } from '@/lib/format';
import { isLocalhostAppUrl, publicAppUrl } from '@/lib/public-url';
import { EmptyState, ErrorState, Panel, Skeleton, StatusBadge } from '@/components/ui';
import { Modal } from '@/components/modal';
import { AnamnesisDetailModal } from './anamnesis-detail-modal';
import { isGroupVisible, type ConditionGroup } from './conditions';
import { QuestionRenderer } from './question-renderer';
import { SignaturePad } from './signature-pad';

type Template = RecordValue & {
  id: string;
  name: string;
  audience: string;
  version: number;
  status: string;
  schemaJson: {
    sections: Array<{
      id: string;
      code: string;
      title: string;
      order: number;
      visibleWhen?: ConditionGroup;
      questions: Array<{
        id: string;
        code: string;
        label: string;
        helpText?: string;
        type: string;
        required: boolean;
        options?: Array<{ value: string; label: string }>;
        unit?: string;
        details?: { enabled: boolean; label: string };
        visibleWhen?: ConditionGroup;
      }>;
    }>;
  };
};

type ResponseRow = RecordValue & {
  id: string;
  status: string;
  effectiveStatus?: string;
  createdAt?: string;
  validUntil?: string | null;
  signedAt?: string | null;
  alerts?: unknown;
  riskAssessment?: { score?: number; level?: string };
  answers?: Record<string, unknown>;
  template?: { id?: string; name?: string; audience?: string; version?: number };
  signatures?: Array<{ id: string }>;
};

type Summary = {
  vigente: number;
  drafts: number;
  nextReview: string | null;
};

const audienceLabel: Record<string, string> = {
  ADULT: 'Adulto',
  CHILD: 'Infantil',
  ELDERLY: 'Idoso',
  PREGNANT: 'Gestante',
};

function formatShortDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
}

function statusTone(status: string) {
  if (status === 'SIGNED') return 'green' as const;
  if (status === 'DRAFT') return 'amber' as const;
  if (status === 'EXPIRED' || status === 'CANCELLED') return 'red' as const;
  if (status === 'SUPERSEDED') return 'gray' as const;
  return 'blue' as const;
}

export function AnamnesisWorkspace({
  patientId,
  clinicId,
}: {
  patientId: string;
  clinicId: string;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [history, setHistory] = useState<ResponseRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [signature, setSignature] = useState<string | null>(null);
  const [remoteLink, setRemoteLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [risk, setRisk] = useState<{ score?: number; level?: string } | null>(null);
  const [alerts, setAlerts] = useState<Array<{ severity?: string; message?: string }>>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [templatesRaw, historyRaw, summaryRaw] = await Promise.all([
        api.get<Template[]>('/anamnesis/templates?status=PUBLISHED'),
        api.get<ResponseRow[]>(`/patients/${patientId}/anamnesis`),
        api.get<Summary>(`/patients/${patientId}/anamnesis/summary`),
      ]);
      setTemplates(list(templatesRaw) as Template[]);
      setHistory(list(historyRaw) as ResponseRow[]);
      setSummary(summaryRaw);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar anamnese.');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { void load(); }, [load]);

  const sections = useMemo(
    () => (activeTemplate?.schemaJson.sections ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .filter((section) => isGroupVisible(answers, section.visibleWhen)),
    [activeTemplate, answers],
  );
  const section = sections[sectionIndex];
  const visibleQuestions = useMemo(
    () => (section?.questions ?? []).filter((question) => isGroupVisible(answers, question.visibleWhen)),
    [section, answers],
  );
  const progress = sections.length
    ? Math.round(((sectionIndex + 1) / sections.length) * 100)
    : 0;

  useEffect(() => {
    if (sectionIndex >= sections.length && sections.length > 0) {
      setSectionIndex(sections.length - 1);
    }
  }, [sections.length, sectionIndex]);

  async function start(template: Template) {
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<ResponseRow>(`/patients/${patientId}/anamnesis`, {
        clinicId,
        templateId: template.id,
        answers: {},
      });
      setActiveTemplate(template);
      setResponseId(created.id);
      setAnswers({});
      setSectionIndex(0);
      setRemoteLink(null);
      setRisk(null);
      setAlerts([]);
      setPickerOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível iniciar a anamnese.');
    } finally {
      setBusy(false);
    }
  }

  async function continueDraft(id: string) {
    setBusy(true);
    setError(null);
    try {
      const detail = await api.get<ResponseRow & { template: Template }>(`/anamnesis/${id}`);
      const template = detail.template?.schemaJson
        ? detail.template as Template
        : templates.find((item) => item.id === detail.templateId || item.id === detail.template?.id);
      let resolved = template;
      if (!resolved && detail.templateId) {
        resolved = await api.get<Template>(`/anamnesis/templates/${String(detail.templateId)}`);
      }
      if (!resolved?.schemaJson) {
        throw new Error('Modelo da anamnese não encontrado.');
      }
      setActiveTemplate(resolved);
      setResponseId(detail.id);
      setAnswers((detail.answers ?? {}) as Record<string, unknown>);
      setRisk((detail.riskAssessment as { score?: number; level?: string }) ?? null);
      setAlerts(Array.isArray(detail.alerts) ? detail.alerts as Array<{ severity?: string; message?: string }> : []);
      setSectionIndex(0);
      setRemoteLink(null);
      setSignature(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Falha ao continuar rascunho.');
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(nextAnswers = answers) {
    if (!responseId) return;
    setBusy(true);
    try {
      const saved = await api.patch<ResponseRow>(`/anamnesis/${responseId}/draft`, { answers: nextAnswers });
      setRisk((saved.riskAssessment as { score?: number; level?: string }) ?? null);
      setAlerts(Array.isArray(saved.alerts) ? saved.alerts as Array<{ severity?: string; message?: string }> : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar rascunho.');
    } finally {
      setBusy(false);
    }
  }

  async function requestRemote() {
    if (!responseId) return;
    setBusy(true);
    try {
      await saveDraft();
      const result = await api.post<{ publicPath: string; token: string }>(`/anamnesis/${responseId}/request-signature`, {
        signerRole: 'PATIENT',
        signerName: 'Paciente',
      });
      const absolute = publicAppUrl(result.publicPath);
      setRemoteLink(absolute);
      await navigator.clipboard?.writeText(absolute).catch(() => undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao gerar link de assinatura.');
    } finally {
      setBusy(false);
    }
  }

  async function signProfessional() {
    if (!responseId || !signature) {
      setError('Assinatura profissional desenhada é obrigatória.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/anamnesis/${responseId}/sign`, {
        signerName: 'Profissional',
        signerRole: 'PROFESSIONAL',
        method: 'DRAWN',
        evidence: { dataUrl: signature },
      });
      setActiveTemplate(null);
      setResponseId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao assinar.');
    } finally {
      setBusy(false);
    }
  }

  function primaryAction(row: ResponseRow) {
    const status = row.effectiveStatus ?? row.status;
    if (status === 'DRAFT') {
      return (
        <div className="heading-actions compact">
          <button
            type="button"
            className="icon-button"
            disabled={busy}
            title="Continuar"
            aria-label="Continuar rascunho"
            onClick={() => void continueDraft(row.id)}
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Visualizar"
            aria-label="Visualizar anamnese"
            onClick={() => setDetailId(row.id)}
          >
            <Eye size={16} />
          </button>
        </div>
      );
    }
    if (status === 'SIGNED' || status === 'EXPIRED') {
      return (
        <button
          type="button"
          className="icon-button"
          title="Abrir"
          aria-label="Abrir anamnese"
          onClick={() => setDetailId(row.id)}
        >
          <Eye size={16} />
        </button>
      );
    }
    return (
      <button
        type="button"
        className="icon-button"
        title="Visualizar"
        aria-label="Visualizar anamnese"
        onClick={() => setDetailId(row.id)}
      >
        <Eye size={16} />
      </button>
    );
  }

  if (loading) return <Skeleton rows={6} />;
  if (error && !activeTemplate) return <ErrorState description={error} onRetry={() => void load()} />;

  if (!activeTemplate) {
    return (
      <div className="anamnesis-workspace">
        <Modal
          open={pickerOpen}
          title="Nova anamnese"
          description="Escolha o modelo clínico para iniciar o preenchimento."
          onClose={() => setPickerOpen(false)}
        >
          <div className="template-picker">
            {templates.map((template) => (
              <button key={template.id} type="button" className="template-picker-item" disabled={busy} onClick={() => void start(template)}>
                <strong>{template.name}</strong>
                <span>{audienceLabel[template.audience] ?? template.audience}{template.version ? ` · v${template.version}` : ''}</span>
              </button>
            ))}
            {!templates.length ? <EmptyState title="Nenhum modelo disponível" description="Publique modelos em Configurações → Anamnese." /> : null}
          </div>
        </Modal>
        <AnamnesisDetailModal
          open={Boolean(detailId)}
          responseId={detailId}
          clinicId={clinicId}
          onClose={() => setDetailId(null)}
          onContinueDraft={(id) => void continueDraft(id)}
          onChanged={() => void load()}
        />
        <div className="anamnesis-home-head">
          <div>
            <h2>Anamnese</h2>
            <p>Histórico clínico estruturado, assinaturas e atualização periódica.</p>
          </div>
          <button type="button" className="button primary" onClick={() => setPickerOpen(true)}>
            <Plus size={15} /> Nova anamnese
          </button>
        </div>
        <div className="summary-strip compact" data-testid="anamnesis-summary">
          <div><span>Vigente</span><strong>{summary?.vigente ?? 0}</strong></div>
          <div><span>Rascunhos</span><strong>{summary?.drafts ?? 0}</strong></div>
          <div><span>Próxima revisão</span><strong>{formatShortDate(summary?.nextReview)}</strong></div>
        </div>
        <Panel title="Histórico operacional">
          {history.length ? (
            <>
              <div className="data-table anamnesis-history-desktop">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Modelo</th>
                      <th>Versão</th>
                      <th>Risco</th>
                      <th>Validade</th>
                      <th>Status</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => {
                      const status = item.effectiveStatus ?? item.status;
                      const wasSigned = Boolean(item.signedAt) || (item.signatures?.length ?? 0) > 0;
                      return (
                        <tr key={item.id} data-testid={`anamnesis-row-${status}`}>
                          <td>{formatShortDate(item.createdAt)}</td>
                          <td>{text(item.template?.name) || 'Anamnese'}</td>
                          <td>v{text(item.template?.version) || '—'}</td>
                          <td>{presentationLabel(item.riskAssessment?.level ?? '—')}</td>
                          <td>{formatShortDate(item.validUntil)}</td>
                          <td>
                            <StatusBadge tone={statusTone(status)}>
                              {presentationLabel(status)}
                              {status === 'CANCELLED' && wasSigned ? ' · foi assinada' : ''}
                            </StatusBadge>
                          </td>
                          <td>{primaryAction(item)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="anamnesis-history-mobile">
                {history.map((item) => {
                  const status = item.effectiveStatus ?? item.status;
                  return (
                    <article key={item.id} className="anamnesis-history-card">
                      <div>
                        <strong>{text(item.template?.name) || 'Anamnese'}</strong>
                        <span>{formatShortDate(item.createdAt)} · {presentationLabel(item.riskAssessment?.level ?? '—')}</span>
                        <span>Validade {formatShortDate(item.validUntil)}</span>
                      </div>
                      <StatusBadge tone={statusTone(status)}>{presentationLabel(status)}</StatusBadge>
                      {primaryAction(item)}
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState title="Sem anamneses" description="Use Nova anamnese para iniciar um preenchimento." />
          )}
        </Panel>
      </div>
    );
  }

  return (
    <div className="anamnesis-workspace filling">
      <div className="anamnesis-fill-head">
        <div>
          <h2>{activeTemplate.name}</h2>
          <p>Progresso {progress}% · {audienceLabel[activeTemplate.audience] ?? activeTemplate.audience}</p>
        </div>
        <div className="heading-actions">
          <button type="button" className="button soft" disabled={busy} onClick={() => void saveDraft()}>Salvar rascunho</button>
          <button type="button" className="button" onClick={() => { setActiveTemplate(null); setResponseId(null); void load(); }}>Voltar</button>
        </div>
      </div>
      {error ? <ErrorState description={error} /> : null}
      <div className="anamnesis-grid">
        <aside className="section-rail">
          <label className="anamnesis-section-select">
            <span className="sr-only">Seção</span>
            <select
              value={sectionIndex}
              onChange={(event) => setSectionIndex(Number(event.target.value))}
            >
              {sections.map((item, index) => (
                <option key={item.id} value={index}>{item.title}</option>
              ))}
            </select>
          </label>
          {sections.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={index === sectionIndex ? 'active' : index < sectionIndex ? 'done' : ''}
              onClick={() => setSectionIndex(index)}
            >
              {index < sectionIndex ? '✓ ' : ''}{item.title}
            </button>
          ))}
        </aside>
        <div className="anamnesis-fill-card">
          <header>
            <h3>{section?.title ?? 'Seção'}</h3>
            <div className="progress"><span style={{ width: `${progress}%` }} /></div>
          </header>
          {visibleQuestions.map((question) => (
            <QuestionRenderer
              key={question.id}
              question={question}
              value={answers[question.code]}
              onChange={(next) => setAnswers((current) => ({ ...current, [question.code]: next }))}
            />
          ))}
          {!visibleQuestions.length ? (
            <p className="muted-note">Nenhuma pergunta visível nesta seção com as respostas atuais.</p>
          ) : null}
          <div className="heading-actions anamnesis-sticky-footer">
            <button type="button" className="button" disabled={sectionIndex === 0} onClick={() => setSectionIndex((i) => i - 1)}>← Anterior</button>
            <button
              type="button"
              className="button soft"
              disabled={busy}
              onClick={() => void saveDraft().then(() => {
                if (sectionIndex < sections.length - 1) setSectionIndex((i) => i + 1);
              })}
            >
              Salvar e continuar →
            </button>
          </div>
          {sectionIndex === sections.length - 1 ? (
            <div className="signature-block">
              <h3>Assinatura</h3>
              <SignaturePad onChange={setSignature} />
              <div className="heading-actions">
                <button type="button" className="button soft" disabled={busy} onClick={() => void requestRemote()}>
                  Solicitar assinatura remota
                </button>
                <button type="button" className="button primary" disabled={busy} onClick={() => void signProfessional()}>
                  Assinar profissionalmente
                </button>
              </div>
              {remoteLink ? (
                <>
                  <p className="muted-note">Link público copiado: {remoteLink}</p>
                  {isLocalhostAppUrl(remoteLink) ? (
                    <p className="secure-notice" role="status">
                      Este link funciona somente neste computador. Para testar em outro dispositivo, configure um endereço acessível na rede ou um túnel HTTPS.
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        <aside className="risk-panel">
          <Panel title="Risco e alertas">
            <div className="summary-strip compact">
              <div><span>Pontuação</span><strong>{risk?.score ?? '—'}</strong></div>
              <div><span>Nível</span><strong>{risk?.level ? presentationLabel(risk.level) : '—'}</strong></div>
            </div>
            <div className="clinical-timeline">
              {alerts.map((alert, index) => (
                <article key={`${alert.message}-${index}`} className="clinical-timeline-item">
                  <StatusBadge tone={alert.severity === 'CRITICAL' ? 'red' : alert.severity === 'WARNING' ? 'amber' : 'blue'}>
                    {presentationLabel(alert.severity ?? 'INFO')}
                  </StatusBadge>
                  <p>{alert.message}</p>
                </article>
              ))}
              {!alerts.length ? <p className="muted-note">Salve o rascunho para recalcular alertas.</p> : null}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
