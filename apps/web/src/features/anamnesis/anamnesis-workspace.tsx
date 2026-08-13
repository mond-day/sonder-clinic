'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, MoreHorizontal, Pencil, Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { list, presentationLabel, text, type RecordValue } from '@/lib/format';
import { isLocalhostAppUrl, publicAppUrl } from '@/lib/public-url';
import { EmptyState, ErrorState, Panel, Skeleton, StatusBadge } from '@/components/ui';
import { Modal } from '@/components/modal';
import { AnamnesisDetailModal } from './anamnesis-detail-modal';
import { isGroupVisible, type ConditionGroup } from './conditions';
import { type AnamnesisSchema } from './format-answer';
import { buildAnamnesisPrintHtml, printAnamnesisDocument } from './print-anamnesis';
import { QuestionRenderer } from './question-renderer';
import { SignaturePad } from './signature-pad';

function whatsappHref(phone: unknown, message: string) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

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
        details?: { enabled: boolean; label: string; requiredWhenVisible?: boolean };
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

function answerValue(raw: unknown) {
  if (typeof raw === 'object' && raw && 'value' in raw) {
    return (raw as { value: unknown }).value;
  }
  return raw;
}

function answerDetails(raw: unknown) {
  if (typeof raw === 'object' && raw && 'details' in raw) {
    return (raw as { details?: unknown }).details;
  }
  return undefined;
}

function isEmptyAnswer(raw: unknown) {
  const value = answerValue(raw);
  return value == null || value === '' || value === false
    || (Array.isArray(value) && value.length === 0);
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
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [patientPhone, setPatientPhone] = useState<string | null>(null);
  const [patientName, setPatientName] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [templatesRaw, historyRaw, summaryRaw, patientRaw] = await Promise.all([
        api.get<Template[]>('/anamnesis/templates?status=PUBLISHED'),
        api.get<ResponseRow[]>(`/patients/${patientId}/anamnesis`),
        api.get<Summary>(`/patients/${patientId}/anamnesis/summary`),
        api.get<RecordValue>(`/patients/${patientId}`).catch(() => null),
      ]);
      setTemplates(list(templatesRaw) as Template[]);
      setHistory(list(historyRaw) as ResponseRow[]);
      setSummary(summaryRaw);
      if (patientRaw) {
        setPatientPhone(text(patientRaw.primaryPhone, '') || null);
        setPatientName(text(patientRaw.fullName, ''));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar anamnese.');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!menuOpenId) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest(`[data-anamnesis-menu="${menuOpenId}"]`)) return;
      setMenuOpenId(null);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpenId]);

  useEffect(() => {
    if (!pickerOpen) return;
    setSelectedTemplateId((current) => current || templates[0]?.id || '');
  }, [pickerOpen, templates]);

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

  function validateQuestions(
    questions: Array<Template['schemaJson']['sections'][number]['questions'][number]>,
  ) {
    for (const question of questions) {
      const raw = answers[question.code];
      if (question.required && isEmptyAnswer(raw)) {
        return `Preencha a pergunta obrigatória: ${question.label}`;
      }
      if (question.type === 'ACKNOWLEDGEMENT' && question.required) {
        const value = answerValue(raw);
        if (value !== true && value !== 'yes') {
          return `Confirme o aceite obrigatório: ${question.label}`;
        }
      }
      if (question.details?.enabled && question.details.requiredWhenVisible) {
        const value = answerValue(raw);
        const showDetails = value === 'yes' || value === true
          || (Array.isArray(value) && value.length > 0);
        const details = answerDetails(raw);
        if (showDetails && (details == null || details === '')) {
          return `Informe o detalhe: ${question.details.label}`;
        }
      }
    }
    return null;
  }

  function validateCurrentSection() {
    return validateQuestions(visibleQuestions);
  }

  function validateAllVisible() {
    const questions = sections.flatMap((item) =>
      item.questions.filter((question) => isGroupVisible(answers, question.visibleWhen)),
    );
    return validateQuestions(questions);
  }

  async function start(template: Template) {
    setError(null);
    setActiveTemplate(template);
    setResponseId(null);
    setAnswers({});
    setSectionIndex(0);
    setRemoteLink(null);
    setRisk(null);
    setAlerts([]);
    setSignature(null);
    setValidationError(null);
    setPickerOpen(false);
  }

  async function startSelected(event: FormEvent) {
    event.preventDefault();
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template) {
      setError('Selecione um modelo de anamnese.');
      return;
    }
    await start(template);
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
      setValidationError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Falha ao continuar rascunho.');
    } finally {
      setBusy(false);
    }
  }

  async function ensureDraft(nextAnswers = answers) {
    if (responseId) return responseId;
    if (!activeTemplate) throw new Error('Modelo de anamnese não selecionado.');
    const created = await api.post<ResponseRow>(`/patients/${patientId}/anamnesis`, {
      clinicId,
      templateId: activeTemplate.id,
      answers: nextAnswers,
    });
    setResponseId(created.id);
    setRisk((created.riskAssessment as { score?: number; level?: string }) ?? null);
    setAlerts(Array.isArray(created.alerts) ? created.alerts as Array<{ severity?: string; message?: string }> : []);
    return created.id;
  }

  async function saveDraft(nextAnswers = answers) {
    if (!activeTemplate) return;
    setBusy(true);
    setError(null);
    try {
      if (!responseId) {
        await ensureDraft(nextAnswers);
      } else {
        const saved = await api.patch<ResponseRow>(`/anamnesis/${responseId}/draft`, { answers: nextAnswers });
        setRisk((saved.riskAssessment as { score?: number; level?: string }) ?? null);
        setAlerts(Array.isArray(saved.alerts) ? saved.alerts as Array<{ severity?: string; message?: string }> : []);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar rascunho.');
    } finally {
      setBusy(false);
    }
  }

  async function continueWithoutSaving() {
    const sectionError = validateCurrentSection();
    if (sectionError) {
      setValidationError(sectionError);
      return;
    }
    setValidationError(null);
    if (sectionIndex < sections.length - 1) setSectionIndex((i) => i + 1);
  }

  async function abandonFill() {
    setActiveTemplate(null);
    setResponseId(null);
    setAnswers({});
    setSignature(null);
    setRemoteLink(null);
    setRisk(null);
    setAlerts([]);
    setValidationError(null);
    await load();
  }

  async function deleteDraft(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/anamnesis/${id}/draft`);
      setConfirmDeleteId(null);
      setMenuOpenId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao excluir rascunho.');
    } finally {
      setBusy(false);
    }
  }

  async function requestRemote() {
    const allError = validateAllVisible();
    if (allError) {
      setValidationError(allError);
      return;
    }
    if (!activeTemplate) return;
    setValidationError(null);
    setBusy(true);
    try {
      const id = await ensureDraft();
      await api.patch(`/anamnesis/${id}/draft`, { answers });
      const result = await api.post<{ publicPath: string; token: string }>(`/anamnesis/${id}/request-signature`, {
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
    const allError = validateAllVisible();
    if (allError) {
      setValidationError(allError);
      return;
    }
    if (!activeTemplate || !signature) {
      setError('Assinatura profissional desenhada é obrigatória.');
      return;
    }
    setValidationError(null);
    setBusy(true);
    try {
      const id = await ensureDraft();
      await api.patch(`/anamnesis/${id}/draft`, { answers });
      await api.post(`/anamnesis/${id}/sign`, {
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

  async function printResponse(row: ResponseRow) {
    setBusy(true);
    setMenuOpenId(null);
    try {
      const detail = await api.get<ResponseRow & {
        template?: Template & { schemaJson?: AnamnesisSchema };
        clinic?: { tradeName?: string; legalName?: string };
        patient?: { fullName?: string };
      }>(`/anamnesis/${row.id}`);
      const html = buildAnamnesisPrintHtml({
        title: text(detail.template?.name, text(row.template?.name, 'Anamnese')),
        patientName: text(detail.patient?.fullName, patientName) || undefined,
        clinicName: text(detail.clinic?.tradeName, text(detail.clinic?.legalName, '')) || undefined,
        statusLabel: presentationLabel(detail.effectiveStatus ?? detail.status),
        riskLabel: detail.riskAssessment?.level
          ? presentationLabel(detail.riskAssessment.level)
          : undefined,
        schema: (detail.template?.schemaJson ?? null) as AnamnesisSchema | null,
        answers: (detail.answers ?? {}) as Record<string, unknown>,
      });
      if (!printAnamnesisDocument(html)) {
        setError('Permita pop-ups para imprimir a anamnese.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao preparar impressão.');
    } finally {
      setBusy(false);
    }
  }

  async function sendWhatsApp(row: ResponseRow) {
    setBusy(true);
    setMenuOpenId(null);
    try {
      let phone = patientPhone;
      let name = patientName;
      if (!phone) {
        const patient = await api.get<RecordValue>(`/patients/${patientId}`);
        phone = text(patient.primaryPhone, '') || null;
        name = text(patient.fullName, name);
        setPatientPhone(phone);
        setPatientName(name);
      }
      const templateName = text(row.template?.name, 'anamnese');
      const status = row.effectiveStatus ?? row.status;
      let message = `Olá${name ? `, ${name.split(' ')[0]}` : ''}! Referente à ${templateName}.`;
      if (status === 'AWAITING_SIGNATURE') {
        try {
          const result = await api.post<{ publicPath: string }>(`/anamnesis/${row.id}/request-signature`, {
            signerRole: 'PATIENT',
            signerName: name || 'Paciente',
          });
          const absolute = publicAppUrl(result.publicPath);
          message = `Olá${name ? `, ${name.split(' ')[0]}` : ''}! Segue o link para assinar sua ${templateName}: ${absolute}`;
        } catch {
          message = `Olá${name ? `, ${name.split(' ')[0]}` : ''}! Precisamos da sua assinatura na ${templateName}. A clínica entrará em contato com o link.`;
        }
      } else if (status === 'DRAFT') {
        message = `Olá${name ? `, ${name.split(' ')[0]}` : ''}! Estamos finalizando sua ${templateName} e em breve enviaremos o link para assinatura.`;
      } else if (status === 'SIGNED') {
        message = `Olá${name ? `, ${name.split(' ')[0]}` : ''}! Sua ${templateName} já está assinada e registrada na clínica.`;
      }
      const href = whatsappHref(phone, message);
      if (!href) {
        setError('Paciente sem telefone válido para WhatsApp.');
        return;
      }
      window.open(href, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao abrir WhatsApp.');
    } finally {
      setBusy(false);
    }
  }

  function canSign(row: ResponseRow) {
    const status = row.effectiveStatus ?? row.status;
    return status === 'DRAFT' || status === 'AWAITING_SIGNATURE';
  }

  function primaryAction(row: ResponseRow) {
    const status = row.effectiveStatus ?? row.status;
    const menuOpen = menuOpenId === row.id;

    return (
      <div className="heading-actions compact anamnesis-row-actions">
        {status === 'DRAFT' ? (
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
        ) : null}
        <button
          type="button"
          className="icon-button"
          title="Visualizar"
          aria-label="Visualizar anamnese"
          onClick={() => setDetailId(row.id)}
        >
          <Eye size={16} />
        </button>
        <div className="row-menu" data-anamnesis-menu={row.id}>
          <button
            type="button"
            className="icon-button"
            aria-label="Mais ações"
            aria-expanded={menuOpen}
            title="Mais ações"
            disabled={busy}
            onClick={() => setMenuOpenId((current) => (current === row.id ? null : row.id))}
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen ? (
            <div className="row-menu-popover" role="menu">
              {canSign(row) ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpenId(null);
                    if (status === 'DRAFT') void continueDraft(row.id);
                    else setDetailId(row.id);
                  }}
                >
                  Assinar
                </button>
              ) : null}
              <button type="button" role="menuitem" onClick={() => void printResponse(row)}>
                Imprimir
              </button>
              <button type="button" role="menuitem" onClick={() => void sendWhatsApp(row)}>
                Enviar no WhatsApp
              </button>
              {status === 'DRAFT' ? (
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    setMenuOpenId(null);
                    setConfirmDeleteId(row.id);
                  }}
                >
                  Excluir
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
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
          description="Escolha o modelo clínico e confirme para iniciar o preenchimento."
          onClose={() => setPickerOpen(false)}
        >
          <form className="mutation-form care-form" onSubmit={(event) => void startSelected(event)}>
            <label className="span-2">
              Modelo
              <select
                required
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                disabled={!templates.length || busy}
              >
                {!templates.length ? <option value="">Nenhum modelo disponível</option> : null}
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                    {audienceLabel[template.audience] ? ` · ${audienceLabel[template.audience]}` : ''}
                    {template.version ? ` · v${template.version}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {!templates.length ? (
              <p className="muted-note span-2">Publique modelos em Configurações → Anamnese.</p>
            ) : null}
            <button className="button primary span-2" type="submit" disabled={busy || !templates.length}>
              {busy ? 'Iniciando…' : 'Iniciar anamnese'}
            </button>
          </form>
        </Modal>
        <AnamnesisDetailModal
          open={Boolean(detailId)}
          responseId={detailId}
          clinicId={clinicId}
          onClose={() => setDetailId(null)}
          onContinueDraft={(id) => void continueDraft(id)}
          onChanged={() => void load()}
        />
        <Modal
          open={Boolean(confirmDeleteId)}
          size="small"
          title="Excluir rascunho?"
          description="Este rascunho ainda não foi assinado e será removido permanentemente."
          onClose={() => setConfirmDeleteId(null)}
        >
          <div className="heading-actions">
            <button type="button" className="button" disabled={busy} onClick={() => setConfirmDeleteId(null)}>
              Voltar
            </button>
            <button
              type="button"
              className="button danger"
              disabled={busy || !confirmDeleteId}
              onClick={() => { if (confirmDeleteId) void deleteDraft(confirmDeleteId); }}
            >
              Excluir
            </button>
          </div>
        </Modal>
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

  const riskTone = risk?.level === 'HIGH' ? 'critical' : risk?.level === 'MODERATE' ? 'warning' : 'info';

  return (
    <div className="anamnesis-workspace filling">
      <div className="anamnesis-fill-head">
        <div>
          <h2>{activeTemplate.name}</h2>
          <p>Progresso {progress}% · {audienceLabel[activeTemplate.audience] ?? activeTemplate.audience}</p>
        </div>
        <div className="heading-actions">
          <button type="button" className="button soft" disabled={busy} onClick={() => void saveDraft()}>Salvar rascunho</button>
          <button type="button" className="button" onClick={() => void abandonFill()}>Voltar</button>
        </div>
      </div>
      {error ? <ErrorState description={error} /> : null}
      {validationError ? <p className="form-error anamnesis-validation" role="alert">{validationError}</p> : null}
      <div className="anamnesis-grid">
        <aside className="section-rail">
          <small>Seções</small>
          <label className="anamnesis-section-select">
            <span className="sr-only">Seção</span>
            <select
              value={sectionIndex}
              onChange={(event) => {
                setValidationError(null);
                setSectionIndex(Number(event.target.value));
              }}
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
              onClick={() => {
                setValidationError(null);
                setSectionIndex(index);
              }}
            >
              <span className="section-rail-index">{index < sectionIndex ? '✓' : index + 1}</span>
              <span>{item.title}</span>
            </button>
          ))}
        </aside>
        <div className="anamnesis-fill-card">
          <header>
            <div>
              <p className="anamnesis-step-label">Etapa {sectionIndex + 1} de {sections.length || 1}</p>
              <h3>{section?.title ?? 'Seção'}</h3>
            </div>
            <div className="progress" aria-hidden><span style={{ width: `${progress}%` }} /></div>
          </header>
          {visibleQuestions.map((question) => (
            <QuestionRenderer
              key={question.id}
              question={question}
              value={answers[question.code]}
              onChange={(next) => {
                setValidationError(null);
                setAnswers((current) => ({ ...current, [question.code]: next }));
              }}
            />
          ))}
          {!visibleQuestions.length ? (
            <p className="muted-note">Nenhuma pergunta visível nesta seção com as respostas atuais.</p>
          ) : null}
          <div className="heading-actions anamnesis-sticky-footer">
            <button
              type="button"
              className="button"
              disabled={sectionIndex === 0}
              onClick={() => {
                setValidationError(null);
                setSectionIndex((i) => i - 1);
              }}
            >
              ← Anterior
            </button>
            <button
              type="button"
              className="button soft"
              disabled={busy || sectionIndex >= sections.length - 1}
              onClick={() => void continueWithoutSaving()}
            >
              Continuar →
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
        <aside className={`risk-panel tone-${riskTone}`}>
          <Panel title="Risco e alertas" description="Calculados a partir das respostas e regras do modelo.">
            <div className="summary-strip compact risk-metrics">
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
