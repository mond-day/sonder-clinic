'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Check,
  Copy,
  Pencil,
  Presentation,
  Printer,
  RotateCcw,
  Ban,
} from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  currency,
  dateInputToIso,
  dateOnly,
  dateTime,
  hasPermission,
  list,
  presentationLabel,
  statusTone,
  text,
  toDateInputValue,
  type RecordValue,
} from '@/lib/format';
import { useAuth } from '@/components/auth-provider';
import { useSelection, type Professional } from '@/components/selection-provider';
import { printTreatmentDocument, buildTreatmentPrintHtml } from './print-treatment';
import { completeItemSchema } from './treatment-schemas';
import { EmptyState, ErrorState, Panel, Skeleton, StatusBadge } from '@/components/ui';
import { Modal } from '@/components/modal';
import * as treatmentApi from './treatment-api';
import { TreatmentEvolutionComposer } from './treatment-evolution-composer';
import { TreatmentFilters } from './treatment-filters';
import { TreatmentHistory } from './treatment-history';
import { TreatmentItemEditor } from './treatment-item-editor';
import { TreatmentItemTable } from './treatment-item-table';
import { TreatmentPlanEditor } from './treatment-plan-editor';
import { TreatmentPlanList } from './treatment-plan-list';
import { TreatmentSessionDialog } from './treatment-session-dialog';
import { TreatmentSummary } from './treatment-summary';
import { TreatmentToolbar } from './treatment-toolbar';
import {
  EDITABLE_PLAN_STATUSES,
  MUTABLE_CONTENT_STATUSES,
  type Procedure,
  type TreatmentDetailTab,
  type TreatmentFiltersState,
  type TreatmentItem,
  type TreatmentPlan,
  type TreatmentPlanEvent,
  type TreatmentSession,
} from './treatment-types';

export function TreatmentWorkspace({
  clinicId,
  patientId,
  patientName,
  professionals,
  onChanged,
}: {
  clinicId: string;
  patientId: string;
  patientName?: string;
  professionals: Professional[];
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const { clinics } = useSelection();
  const permissions = user?.permissions;

  const canView = hasPermission(permissions, 'treatment.view');
  const canCreate = hasPermission(permissions, 'treatment.create');
  const canUpdate = hasPermission(permissions, 'treatment.update') || canCreate;
  const canPresent = hasPermission(permissions, 'treatment.present') || canUpdate;
  const canApprove = hasPermission(permissions, 'treatment.approve');
  const canExecute = hasPermission(permissions, 'treatment.execute');
  const canCancel = hasPermission(permissions, 'treatment.cancel');
  const canArchive = hasPermission(permissions, 'treatment.archive');
  const canRestore = canArchive || hasPermission(permissions, 'treatment.reopen');

  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [detail, setDetail] = useState<TreatmentPlan | null>(null);
  const [history, setHistory] = useState<TreatmentPlanEvent[]>([]);
  const [evolutions, setEvolutions] = useState<RecordValue[]>([]);
  const [filters, setFilters] = useState<TreatmentFiltersState>({
    search: '',
    status: 'all',
    includeArchived: false,
  });
  const [detailTab, setDetailTab] = useState<TreatmentDetailTab>('procedures');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [itemEditor, setItemEditor] = useState<{ mode: 'create' | 'edit'; item?: TreatmentItem | null } | null>(null);
  const [sessionItem, setSessionItem] = useState<TreatmentItem | null>(null);
  const [approveIds, setApproveIds] = useState<string[]>([]);
  const [approvePaymentMethod, setApprovePaymentMethod] = useState('PIX');
  const [reasonModal, setReasonModal] = useState<null | {
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: (reason: string) => void;
  }>(null);
  const [reasonText, setReasonText] = useState('');
  const [confirmModal, setConfirmModal] = useState<null | {
    title: string;
    description: string;
    onConfirm: () => void;
  }>(null);
  const [completeItem, setCompleteItem] = useState<TreatmentItem | null>(null);
  const [completeDate, setCompleteDate] = useState(toDateInputValue());
  const [completeNotes, setCompleteNotes] = useState('');
  const [completeError, setCompleteError] = useState('');

  const professionalName = useCallback(
    (id: string) => professionals.find((row) => row.id === id)?.name ?? 'Profissional',
    [professionals],
  );

  const notify = useCallback(() => {
    onChanged?.();
  }, [onChanged]);

  const loadPlans = useCallback(async () => {
    if (!clinicId || !patientId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [nextPlans, nextProcedures] = await Promise.all([
        treatmentApi.listTreatmentPlans({
          clinicId,
          patientId,
          includeArchived: filters.includeArchived,
        }),
        treatmentApi.listProcedures().catch(() => [] as Procedure[]),
      ]);
      setPlans(nextPlans);
      setProcedures(nextProcedures.filter((row) => row.active !== false));
      setSelectedId((current) => {
        if (current && nextPlans.some((plan) => plan.id === current)) return current;
        return null;
      });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível carregar os tratamentos.');
    } finally {
      setLoading(false);
    }
  }, [canView, clinicId, filters.includeArchived, patientId]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setActionError('');
    try {
      const [plan, events, entries] = await Promise.all([
        treatmentApi.getTreatmentPlan(id),
        treatmentApi.getTreatmentHistory(id).catch(() => [] as TreatmentPlanEvent[]),
        treatmentApi.listPlanEvolutions(patientId, clinicId, id).catch(() => [] as RecordValue[]),
      ]);
      setDetail(plan);
      setHistory(events);
      setEvolutions(list(entries));
      setApproveIds([]);
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : 'Falha ao carregar o plano.');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [clinicId, patientId]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    if (!selectedId || !planModalOpen) {
      if (!planModalOpen) {
        setDetail(null);
        setHistory([]);
        setEvolutions([]);
      }
      return;
    }
    void loadDetail(selectedId);
  }, [loadDetail, planModalOpen, selectedId]);

  const filteredPlans = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return plans.filter((plan) => {
      if (filters.status !== 'all' && String(plan.status) !== filters.status) return false;
      if (!term) return true;
      const haystack = [
        plan.title,
        ...((plan.items ?? []).map((item) => item.procedure?.name ?? '')),
        ...((plan.items ?? []).map((item) => item.toothFdi ?? '')),
      ].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [filters.search, filters.status, plans]);

  async function runAction(action: () => Promise<unknown>, successSelectId?: string) {
    setBusy(true);
    setActionError('');
    try {
      await action();
      await loadPlans();
      if (successSelectId) {
        setSelectedId(successSelectId);
        setPlanModalOpen(true);
      } else if (selectedId && planModalOpen) {
        await loadDetail(selectedId);
      }
      notify();
    } catch (cause) {
      setActionError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Não foi possível concluir a ação.');
    } finally {
      setBusy(false);
    }
  }

  function openPlan(id: string) {
    setSelectedId(id);
    setPlanModalOpen(true);
    setDetailTab('procedures');
    setItemEditor(null);
    setActionError('');
  }

  function closePlanModal() {
    setPlanModalOpen(false);
    setItemEditor(null);
    setSessionItem(null);
    setReasonModal(null);
    setConfirmModal(null);
    setCompleteItem(null);
  }

  if (!canView) {
    return (
      <Panel title="Tratamentos" description="Acesso restrito">
        <EmptyState title="Sem permissão" description="É necessário treatment.view para visualizar planos." />
      </Panel>
    );
  }

  if (loading) {
    return (
      <div className="treatments-workspace">
        <Skeleton rows={4} />
      </div>
    );
  }

  if (error) {
    return <ErrorState description={error} onRetry={() => void loadPlans()} />;
  }

  const selected = detail;
  const readonly = Boolean(selected?.archivedAt) || ['COMPLETED', 'CANCELLED'].includes(String(selected?.status));
  const canEditPlan = Boolean(selected && canUpdate && EDITABLE_PLAN_STATUSES.has(String(selected.status)) && !selected.archivedAt);
  const canMutateItems = Boolean(selected && canUpdate && MUTABLE_CONTENT_STATUSES.has(String(selected.status)) && !selected.archivedAt);
  const allSessions = collectSessions(selected);

  return (
    <div className="treatments-workspace">
      <TreatmentSummary plans={plans} />

      <Panel className="treatments-list-panel treatments-list-only">
        <TreatmentToolbar
          canCreate={canCreate}
          busy={busy}
          onCreate={() => { setEditorMode('create'); setActionError(''); }}
        />
        <TreatmentFilters value={filters} onChange={setFilters} />
        <TreatmentPlanList
          plans={filteredPlans}
          selectedId={planModalOpen ? selectedId : null}
          professionalName={professionalName}
          onSelect={openPlan}
        />
      </Panel>

      <Modal
        open={planModalOpen}
        title={selected ? text(selected.title) : 'Plano de tratamento'}
        description={selected
          ? `${professionalName(selected.professionalId)} · criado em ${dateOnly(selected.createdAt)}`
          : 'Carregando detalhes do plano'}
        onClose={closePlanModal}
        closeOnBackdrop={false}
        size="xlarge"
        confirmOnClose
      >
        <div className={`treatment-plan-modal ${itemEditor || sessionItem ? 'with-drawer' : ''}`}>
          <div className="treatment-plan-modal-main">
            {(reasonModal || confirmModal || completeItem) ? (
              <div className="treatment-inline-confirm" role="dialog" aria-modal="true">
                <div className="treatment-inline-confirm-card">
                  <h3>
                    {completeItem
                      ? 'Concluir procedimento'
                      : (reasonModal?.title ?? confirmModal?.title)}
                  </h3>
                  <p>
                    {completeItem
                      ? `Informe quando ${text(completeItem.procedure?.name, 'o procedimento')} foi realizado.`
                      : (reasonModal?.description ?? confirmModal?.description)}
                  </p>
                  {completeItem ? (
                    <form
                      className="mutation-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        setCompleteError('');
                        const parsed = completeItemSchema.safeParse({
                          clinicalDate: completeDate,
                          notes: completeNotes.trim() || undefined,
                        });
                        if (!parsed.success) {
                          setCompleteError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
                          return;
                        }
                        const itemId = completeItem.id;
                        setCompleteItem(null);
                        void runAction(() => treatmentApi.completeTreatmentItem(itemId, {
                          notes: parsed.data.notes,
                          clinicalDate: dateInputToIso(parsed.data.clinicalDate),
                        }));
                      }}
                    >
                      <label>Data da conclusão
                        <input type="date" required value={completeDate} onChange={(event) => setCompleteDate(event.target.value)} />
                      </label>
                      <label>Notas clínicas (opcional)
                        <textarea rows={3} value={completeNotes} onChange={(event) => setCompleteNotes(event.target.value)} placeholder="O que foi realizado, materiais, oclusão…" />
                      </label>
                      {completeError ? <p className="form-error" role="alert">{completeError}</p> : null}
                      <div className="modal-footer">
                        <button type="button" className="button ghost" onClick={() => setCompleteItem(null)}>Voltar</button>
                        <button type="submit" className="button primary" disabled={busy}>Concluir procedimento</button>
                      </div>
                    </form>
                  ) : reasonModal ? (
                    <form
                      className="mutation-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (reasonText.trim().length < 3) return;
                        const confirm = reasonModal.onConfirm;
                        setReasonModal(null);
                        confirm(reasonText.trim());
                      }}
                    >
                      <label className="span-2">Motivo
                        <textarea required minLength={3} value={reasonText} onChange={(event) => setReasonText(event.target.value)} rows={3} />
                      </label>
                      <div className="modal-footer">
                        <button type="button" className="button ghost" onClick={() => setReasonModal(null)}>Voltar</button>
                        <button type="submit" className="button danger" disabled={busy || reasonText.trim().length < 3}>
                          {reasonModal.confirmLabel}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="modal-footer">
                      <button type="button" className="button ghost" onClick={() => setConfirmModal(null)}>Voltar</button>
                      <button
                        type="button"
                        className="button primary"
                        disabled={busy}
                        onClick={() => {
                          const confirm = confirmModal?.onConfirm;
                          setConfirmModal(null);
                          confirm?.();
                        }}
                      >
                        Confirmar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
            {detailLoading && !selected ? <Skeleton rows={6} /> : null}
            {!selected && !detailLoading ? (
              <EmptyState title="Plano indisponível" description="Não foi possível carregar o detalhe." />
            ) : null}
            {selected ? (
              <>
                <div className="detail-hero">
                  <div>
                    <StatusBadge tone={statusTone(selected.status)}>{presentationLabel(selected.status)}</StatusBadge>
                    {selected.archivedAt ? <StatusBadge tone="red">Arquivado</StatusBadge> : null}
                    <p>
                      {selected.validUntil ? `Válido até ${dateOnly(selected.validUntil)}` : 'Sem validade definida'}
                      {selected.presentedVersion ? ` · apresentação v${selected.presentedVersion}` : ''}
                    </p>
                  </div>
                  <div className="detail-actions">
                    <button
                      type="button"
                      className="button small"
                      onClick={() => {
                        const clinic = clinics.find((item) => item.id === clinicId);
                        const html = buildTreatmentPrintHtml({
                          title: text(selected.title),
                          patientName,
                          clinicName: clinic?.tradeName,
                          professionalName: professionalName(selected.professionalId),
                          statusLabel: presentationLabel(selected.status),
                          notes: selected.notes,
                          items: (selected.items ?? []).map((item) => ({
                            name: text(item.procedure?.name, 'Procedimento'),
                            tooth: item.toothFdi,
                            face: item.face,
                            quantity: item.quantity,
                            sessions: `${(item.sessions ?? []).filter((session) => !session.correctionOfId).length}/${item.plannedSessions}`,
                            unitPrice: currency(item.unitPrice),
                            total: currency(item.total),
                            status: presentationLabel(item.status),
                          })),
                          subtotal: currency(selected.subtotal),
                          discount: currency(selected.discount),
                          total: currency(selected.total),
                        });
                        if (!printTreatmentDocument(html)) {
                          setActionError('Permita a impressão para gerar o orçamento.');
                        }
                      }}
                    >
                      <Printer size={14} /> Imprimir orçamento
                    </button>
                    {canEditPlan ? (
                      <button type="button" className="button small" disabled={busy} onClick={() => setEditorMode('edit')}>
                        <Pencil size={14} /> Editar
                      </button>
                    ) : null}
                    {canCreate ? (
                      <button
                        type="button"
                        className="button small"
                        disabled={busy}
                        onClick={() => {
                          void (async () => {
                            setBusy(true);
                            setActionError('');
                            try {
                              const duplicated = await treatmentApi.duplicateTreatmentPlan(selected.id);
                              await loadPlans();
                              openPlan(duplicated.id);
                              notify();
                            } catch (cause) {
                              setActionError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Falha ao duplicar.');
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      >
                        <Copy size={14} /> Duplicar
                      </button>
                    ) : null}
                    {canPresent && String(selected.status) === 'DRAFT' ? (
                      <button
                        type="button"
                        className="button soft small"
                        disabled={busy || !(selected.items ?? []).length}
                        onClick={() => void runAction(() => treatmentApi.presentTreatmentPlan(selected.id, selected.version))}
                      >
                        <Presentation size={14} /> Apresentar
                      </button>
                    ) : null}
                    {canApprove && ['PRESENTED', 'PARTIALLY_APPROVED'].includes(String(selected.status)) ? (
                      <div className="approve-action-group">
                        <label className="approve-payment-field">
                          Forma de Pagamento
                          <select
                            value={approvePaymentMethod}
                            onChange={(event) => setApprovePaymentMethod(event.target.value)}
                            aria-label="Forma de Pagamento na aprovação"
                          >
                            <option value="PIX">PIX</option>
                            <option value="CREDIT_CARD">Cartão de crédito</option>
                            <option value="DEBIT_CARD">Cartão de débito</option>
                            <option value="CASH">Dinheiro</option>
                            <option value="TRANSFER">Transferência</option>
                            <option value="OTHER">Outro</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          className="button primary small"
                          disabled={busy || !approveIds.length || !approvePaymentMethod}
                          onClick={() => void runAction(() => treatmentApi.approveTreatmentPlan(
                            selected.id,
                            approveIds,
                            selected.version,
                            { paymentMethod: approvePaymentMethod },
                          ))}
                        >
                          <Check size={14} /> Aprovar selecionados
                        </button>
                      </div>
                    ) : null}
                    {canCancel && !readonly && String(selected.status) !== 'CANCELLED' ? (
                      <button
                        type="button"
                        className="button danger small"
                        disabled={busy}
                        onClick={() => {
                          setReasonText('');
                          setReasonModal({
                            title: 'Cancelar plano',
                            description: 'Informe o motivo do cancelamento (mín. 3 caracteres).',
                            confirmLabel: 'Cancelar plano',
                            onConfirm: (reason) => {
                              void runAction(() => treatmentApi.cancelTreatmentPlan(selected.id, reason, selected.version));
                            },
                          });
                        }}
                      >
                        <Ban size={14} /> Cancelar
                      </button>
                    ) : null}
                    {canArchive && ['COMPLETED', 'CANCELLED'].includes(String(selected.status)) && !selected.archivedAt ? (
                      <button
                        type="button"
                        className="button small"
                        disabled={busy}
                        onClick={() => void runAction(() => treatmentApi.archiveTreatmentPlan(selected.id))}
                      >
                        <Archive size={14} /> Arquivar
                      </button>
                    ) : null}
                    {canRestore && selected.archivedAt ? (
                      <button
                        type="button"
                        className="button soft small"
                        disabled={busy}
                        onClick={() => void runAction(() => treatmentApi.restoreTreatmentPlan(selected.id))}
                      >
                        <RotateCcw size={14} /> Restaurar
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="summary-strip">
                  <div><small>Subtotal</small><strong>{currency(selected.subtotal)}</strong></div>
                  <div><small>Desconto</small><strong>{currency(selected.discount)}</strong></div>
                  <div><small>Total</small><strong>{currency(selected.total)}</strong></div>
                  <div><small>Itens</small><strong>{(selected.items ?? []).length}</strong></div>
                </div>

                {actionError ? <p className="form-error detail-error" role="alert">{actionError}</p> : null}

                <div className="detail-tabs" role="tablist">
                  {([
                    ['procedures', 'Procedimentos'],
                    ['sessions', 'Sessões'],
                    ['evolutions', 'Evoluções'],
                    ['history', 'Histórico'],
                    ['notes', 'Resumo'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={detailTab === id}
                      className={`detail-tab ${detailTab === id ? 'active' : ''}`}
                      onClick={() => setDetailTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="tab-body">
                  {detailTab === 'procedures' ? (
                    <>
                      {canMutateItems ? (
                        <div className="tab-actions">
                          <button type="button" className="button soft small" disabled={busy} onClick={() => {
                            setSessionItem(null);
                            setItemEditor({ mode: 'create' });
                          }}>
                            ＋ Procedimento
                          </button>
                        </div>
                      ) : null}
                      <TreatmentItemTable
                        plan={selected}
                        professionalName={professionalName}
                        canApprove={canApprove}
                        canExecute={canExecute}
                        canUpdate={canUpdate}
                        selectedIds={approveIds}
                        onToggleSelect={(id) => setApproveIds((current) => (
                          current.includes(id) ? current.filter((row) => row !== id) : [...current, id]
                        ))}
                        onEdit={(item) => {
                          setSessionItem(null);
                          setItemEditor({ mode: 'edit', item });
                        }}
                        onCancel={(item) => {
                          setReasonText('');
                          setReasonModal({
                            title: 'Cancelar procedimento',
                            description: 'Informe o motivo do cancelamento (mín. 3 caracteres).',
                            confirmLabel: 'Cancelar procedimento',
                            onConfirm: (reason) => {
                              void runAction(() => treatmentApi.cancelTreatmentItem(selected.id, item.id, reason));
                            },
                          });
                        }}
                        onSession={(item) => {
                          setItemEditor(null);
                          setSessionItem(item);
                        }}
                        onComplete={(item) => {
                          setCompleteItem(item);
                          setCompleteDate(toDateInputValue());
                          setCompleteNotes('');
                          setCompleteError('');
                        }}
                      />
                    </>
                  ) : null}

                  {detailTab === 'sessions' ? (
                    <div className="session-stack">
                      {!allSessions.length ? (
                        <EmptyState title="Nenhuma sessão" description="Registre sessões a partir da aba Procedimentos." />
                      ) : (
                        allSessions.map((session) => (
                          <article className="session-card" key={session.id}>
                            <div className="date">
                              <strong>{new Date(session.completedAt).getDate()}</strong>
                              <span>{new Date(session.completedAt).toLocaleDateString('pt-BR', { month: 'short' })}</span>
                            </div>
                            <div>
                              <h4>{session.procedureName}</h4>
                              <p>{session.executionNotes}</p>
                              {session.complications ? <p>Intercorrência: {session.complications}</p> : null}
                            </div>
                            <time>{dateTime(session.completedAt)}</time>
                          </article>
                        ))
                      )}
                    </div>
                  ) : null}

                  {detailTab === 'evolutions' ? (
                    <div className="session-stack">
                      {!evolutions.length ? (
                        <EmptyState
                          title="Evoluções do plano"
                          description="Concluir um procedimento ou registrar uma sessão gera evolução automaticamente."
                        />
                      ) : (
                        evolutions.map((entry) => (
                          <article className="session-card" key={String(entry.id)}>
                            <div className="date">
                              <strong>{new Date(String(entry.clinicalDate)).getDate()}</strong>
                              <span>{new Date(String(entry.clinicalDate)).toLocaleDateString('pt-BR', { month: 'short' })}</span>
                            </div>
                            <div>
                              <h4>{presentationLabel(entry.type)}</h4>
                              <p>{text(entry.renderedText)}</p>
                            </div>
                            <time>{dateTime(entry.clinicalDate)}</time>
                          </article>
                        ))
                      )}
                      {canExecute && !readonly ? (
                        <div className="form-section">
                          <header><h3>Nova evolução</h3></header>
                          <TreatmentEvolutionComposer
                            professionals={professionals}
                            items={selected.items ?? []}
                            busy={busy}
                            error={actionError}
                            onSubmit={async (input) => {
                              await runAction(() => treatmentApi.createClinicalEvolution(patientId, {
                                clinicId,
                                professionalId: input.professionalId,
                                type: 'EVOLUTION',
                                renderedText: input.renderedText,
                                structuredData: {},
                                treatmentId: selected.id,
                                treatmentItemId: input.treatmentItemId,
                                clinicalDate: new Date().toISOString(),
                              }));
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {detailTab === 'history' ? <TreatmentHistory events={history} /> : null}

                  {detailTab === 'notes' ? (
                    <div className="notes-panel">
                      {canEditPlan ? (
                        <form
                          className="mutation-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const data = new FormData(event.currentTarget);
                            void runAction(() => treatmentApi.updateTreatmentPlan(selected.id, {
                              notes: String(data.get('notes') ?? ''),
                              version: selected.version,
                            }));
                          }}
                        >
                          <label className="span-2">
                            Observações do plano
                            <textarea name="notes" rows={6} defaultValue={selected.notes ?? ''} key={`${selected.id}-${selected.version}`} />
                          </label>
                          <div className="form-actions span-2">
                            <button type="submit" className="button primary" disabled={busy}>Salvar observações</button>
                          </div>
                        </form>
                      ) : (
                        <p className="notes-readonly">{text(selected.notes, 'Sem observações registradas.')}</p>
                      )}
                      {selected.cancelReason ? (
                        <p className="muted-note">Cancelamento: {selected.cancelReason}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          <TreatmentItemEditor
            open={Boolean(itemEditor)}
            mode={itemEditor?.mode ?? 'create'}
            item={itemEditor?.item}
            procedures={procedures}
            professionals={professionals}
            defaultProfessionalId={selected?.professionalId}
            busy={busy}
            error={actionError}
            variant="drawer"
            onClose={() => setItemEditor(null)}
            onSubmit={async (input) => {
              if (!selected) return;
              await runAction(async () => {
                if (itemEditor?.mode === 'edit' && itemEditor.item) {
                  await treatmentApi.updateTreatmentItem(selected.id, itemEditor.item.id, {
                    ...input,
                    toothFdi: input.toothFdi || null,
                    face: input.face || null,
                    version: selected.version,
                  });
                } else {
                  await treatmentApi.addTreatmentItem(selected.id, {
                    ...input,
                    toothFdi: input.toothFdi || undefined,
                    face: input.face || undefined,
                    version: selected.version,
                  });
                }
                setItemEditor(null);
              });
            }}
          />

          <TreatmentSessionDialog
            open={Boolean(sessionItem)}
            item={sessionItem}
            professionals={professionals}
            busy={busy}
            error={actionError}
            variant="drawer"
            onClose={() => setSessionItem(null)}
            onSubmit={async (input) => {
              if (!sessionItem) return;
              await runAction(async () => {
                await treatmentApi.addItemSession(sessionItem.id, input);
                setSessionItem(null);
              });
            }}
          />
        </div>
      </Modal>

      <TreatmentPlanEditor
        open={editorMode !== null}
        mode={editorMode ?? 'create'}
        plan={editorMode === 'edit' ? selected : null}
        procedures={procedures}
        professionals={professionals}
        busy={busy}
        error={actionError}
        onClose={() => setEditorMode(null)}
        key={`editor-${editorMode ?? 'closed'}-${selected?.id ?? 'new'}`}
        onCreate={async (input) => {
          setBusy(true);
          setActionError('');
          try {
            const created = await treatmentApi.createTreatmentPlan({
              clinicId,
              patientId,
              ...input,
            });
            setEditorMode(null);
            await loadPlans();
            openPlan(created.id);
            notify();
          } catch (cause) {
            setActionError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Não foi possível criar o plano.');
          } finally {
            setBusy(false);
          }
        }}
        onUpdate={async (input) => {
          if (!selected) return;
          await runAction(async () => {
            await treatmentApi.updateTreatmentPlan(selected.id, input);
            setEditorMode(null);
          });
        }}
      />
    </div>
  );
}

function collectSessions(plan: TreatmentPlan | null) {
  if (!plan) return [] as Array<TreatmentSession & { procedureName: string }>;
  const rows: Array<TreatmentSession & { procedureName: string }> = [];
  for (const item of plan.items ?? []) {
    for (const session of item.sessions ?? []) {
      if (session.correctionOfId) continue;
      rows.push({
        ...session,
        procedureName: text(item.procedure?.name, 'Procedimento'),
      });
    }
  }
  return rows.sort((a, b) => +new Date(b.completedAt) - +new Date(a.completedAt));
}
