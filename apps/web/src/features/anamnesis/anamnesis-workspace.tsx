'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { list, presentationLabel, text, type RecordValue } from '@/lib/format';
import { EmptyState, ErrorState, MetricCard, Panel, Skeleton, StatusBadge } from '@/components/ui';
import { Modal } from '@/components/modal';
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
  alerts?: unknown;
  riskAssessment?: { score?: number; level?: string };
  template?: { name?: string; audience?: string; version?: number };
};

const audienceLabel: Record<string, string> = {
  ADULT: 'Adulto',
  CHILD: 'Infantil',
  ELDERLY: 'Idoso',
  PREGNANT: 'Gestante',
};

const statusLabel = (status: unknown) => presentationLabel(status);

export function AnamnesisWorkspace({
  patientId,
  clinicId,
}: {
  patientId: string;
  clinicId: string;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [history, setHistory] = useState<ResponseRow[]>([]);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [templatesRaw, historyRaw] = await Promise.all([
        api.get<Template[]>('/anamnesis/templates?status=PUBLISHED'),
        api.get<ResponseRow[]>(`/patients/${patientId}/anamnesis?clinicId=${clinicId}`),
      ]);
      setTemplates(list(templatesRaw) as Template[]);
      setHistory(list(historyRaw) as ResponseRow[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar anamnese.');
    } finally {
      setLoading(false);
    }
  }, [patientId, clinicId]);

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
      setRemoteLink(result.publicPath);
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
                <strong>{audienceLabel[template.audience] ?? template.audience}</strong>
                <span>{template.name}</span>
                <StatusBadge tone="green">{statusLabel(template.status)}</StatusBadge>
              </button>
            ))}
            {!templates.length ? <EmptyState title="Nenhum modelo publicado" description="Publique modelos em Configurações → Anamnese." /> : null}
          </div>
        </Modal>
        <div className="anamnesis-home-head">
          <div>
            <h2>Anamnese clínica</h2>
            <p>Histórico do paciente com alertas, risco e assinatura.</p>
          </div>
          <button type="button" className="button primary" onClick={() => setPickerOpen(true)}>
            <Plus size={15} /> Adicionar
          </button>
        </div>
        <div className="metric-grid compact">
          <MetricCard label="Histórico" value={history.length} />
          <MetricCard label="Assinadas" value={history.filter((item) => item.status === 'SIGNED').length} tone="green" />
          <MetricCard label="Rascunhos" value={history.filter((item) => item.status === 'DRAFT').length} tone="amber" />
        </div>
        <Panel title="Histórico">
          {history.length ? (
            <div className="clinical-timeline">
              {history.map((item) => (
                <article key={item.id} className="clinical-timeline-item">
                  <div className="timeline-dot" />
                  <div className="timeline-copy">
                    <strong>{text(item.template?.name) || 'Anamnese'}</strong>
                    <span>{audienceLabel[text(item.template?.audience)] ?? text(item.template?.audience)}</span>
                  </div>
                  <StatusBadge tone={item.status === 'SIGNED' ? 'green' : item.status === 'DRAFT' ? 'amber' : 'blue'}>
                    {statusLabel(item.status)}
                  </StatusBadge>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Sem anamneses" description="Use Adicionar para iniciar um novo preenchimento." />
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
          <button type="button" className="button" onClick={() => { setActiveTemplate(null); setResponseId(null); }}>Voltar</button>
        </div>
      </div>
      {error ? <ErrorState description={error} /> : null}
      <div className="anamnesis-grid">
        <aside className="section-rail">
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
          <div className="heading-actions">
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
              {remoteLink ? <p className="muted-note">Link público: {remoteLink}</p> : null}
            </div>
          ) : null}
        </div>
        <aside className="risk-panel">
          <Panel title="Risco e alertas">
            <MetricCard label="Pontuação" value={risk?.score ?? '—'} meta={risk?.level ? presentationLabel(risk.level) : 'Não calculado'} />
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
