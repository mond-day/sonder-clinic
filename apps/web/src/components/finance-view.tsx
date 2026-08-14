'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Banknote, Plus, RefreshCw, SlidersHorizontal, UserRound } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import {
  currency,
  dateOnly,
  formatMoneyInputFromValue,
  hasPermission,
  list,
  maskMoneyInput,
  moneyInputToApi,
  nested,
  presentationLabel,
  statusTone,
  text,
  type RecordValue,
} from '@/lib/format';
import { useAuth } from './auth-provider';
import { useSelection } from './selection-provider';
import { EmptyState, MetricCard, PageHeader, Panel, StatusBadge } from './ui';
import { Modal } from './modal';
import { UncontrolledMoneyInput } from '@/features/treatments/treatment-field-inputs';

type FinanceTab = 'overview' | 'receivable' | 'payable' | 'commissions' | 'recurring' | 'cashflow';

const tabs: Array<{ id: FinanceTab; label: string; available: boolean }> = [
  { id: 'overview', label: 'Visão geral', available: true },
  { id: 'receivable', label: 'Contas a receber', available: true },
  { id: 'payable', label: 'Contas a pagar', available: true },
  { id: 'commissions', label: 'Comissões', available: true },
  { id: 'recurring', label: 'Recorrências', available: true },
  { id: 'cashflow', label: 'Fluxo de caixa', available: true },
];

const financeTabIds = new Set<string>(tabs.map((item) => item.id));

const PAYMENT_METHODS = [
  { value: 'PIX', label: 'PIX' },
  { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
  { value: 'DEBIT_CARD', label: 'Cartão de débito' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'TRANSFER', label: 'Transferência' },
  { value: 'BOLETO', label: 'Boleto' },
  { value: 'OTHER', label: 'Outro' },
] as const;

const CHARGE_METHODS = [
  { value: 'PIX', label: 'PIX' },
  { value: 'BOLETO', label: 'Boleto' },
] as const;

export function FinanceView({ initialTab }: { initialTab?: FinanceTab } = {}) {
  const searchParams = useSearchParams();
  const tabFromQuery = searchParams.get('tab') ?? '';
  const resolvedInitial: FinanceTab = initialTab
    ?? (financeTabIds.has(tabFromQuery) ? tabFromQuery as FinanceTab : 'overview');
  const { user } = useAuth();
  const { clinicId, clinics, professionals } = useSelection();
  const [tab, setTab] = useState<FinanceTab>(resolvedInitial);
  const [receivables, setReceivables] = useState<RecordValue[]>([]);
  const [payables, setPayables] = useState<RecordValue[]>([]);
  const [recurrences, setRecurrences] = useState<RecordValue[]>([]);
  const [cashflow, setCashflow] = useState<RecordValue | null>(null);
  const [rules, setRules] = useState<RecordValue[]>([]);
  const [commissionEvents, setCommissionEvents] = useState<RecordValue[]>([]);
  const [commissionPeriods, setCommissionPeriods] = useState<RecordValue[]>([]);
  const [patients, setPatients] = useState<RecordValue[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedReceivable, setSelectedReceivable] = useState<RecordValue | null>(null);
  const [selectedPayable, setSelectedPayable] = useState<RecordValue | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [patientQuery, setPatientQuery] = useState('');
  const [closingId, setClosingId] = useState<string | null>(null);
  const [recurrenceBusy, setRecurrenceBusy] = useState<string | null>(null);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [recurrenceFiltersOpen, setRecurrenceFiltersOpen] = useState(false);
  const [recurrenceQuery, setRecurrenceQuery] = useState('');
  const [recurrenceKindFilter, setRecurrenceKindFilter] = useState('');
  const [cashflowPeriod, setCashflowPeriod] = useState<'7d' | '30d' | '90d' | 'year'>('30d');
  const [createReceivableOpen, setCreateReceivableOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<RecordValue | null>(null);
  const [receivableBusy, setReceivableBusy] = useState(false);
  const [receivableForm, setReceivableForm] = useState({
    patientId: '',
    description: '',
    dueDate: new Date().toISOString().slice(0, 10),
    paymentMethod: '',
  });
  const [receiveForm, setReceiveForm] = useState({ amount: '', method: 'PIX' });
  const [receiveMode, setReceiveMode] = useState<'receive' | 'charge'>('receive');
  const [chargePayment, setChargePayment] = useState<RecordValue | null>(null);
  const [recurrenceForm, setRecurrenceForm] = useState({
    kind: 'PAYABLE',
    description: '',
    amount: '',
    frequency: 'MONTHLY',
    interval: '1',
    nextOccurrence: new Date().toISOString().slice(0, 10),
    endsAt: '',
    patientId: '',
    supplierName: '',
  });
  const canFinance = hasPermission(user?.permissions, 'financial.view');
  const canFinanceCreate = hasPermission(user?.permissions, 'financial.create', 'organization.manage');
  const canCommission = hasPermission(user?.permissions, 'commission.view_all', 'organization.manage');
  const canCloseCommission = hasPermission(user?.permissions, 'commission.close', 'organization.manage');
  const canConfigureCommission = hasPermission(user?.permissions, 'commission.configure', 'organization.manage');

  useEffect(() => {
    setTab(resolvedInitial);
  }, [resolvedInitial]);

  const load = useCallback(() => {
    if (!clinicId) return;
    setLoading(true);
    setError('');
    const month = new Date().toISOString().slice(0, 7);
    const from = `${month}-01`;
    const cashTo = new Date();
    const cashFrom = new Date();
    if (cashflowPeriod === '7d') cashFrom.setDate(cashFrom.getDate() - 7);
    else if (cashflowPeriod === '90d') cashFrom.setDate(cashFrom.getDate() - 90);
    else if (cashflowPeriod === 'year') cashFrom.setMonth(0, 1);
    else cashFrom.setDate(cashFrom.getDate() - 30);
    const cashQuery = new URLSearchParams({
      clinicId,
      from: cashFrom.toISOString(),
      to: cashTo.toISOString(),
    });
    Promise.all([
      canFinance ? api.get<RecordValue[]>(`/receivables?clinicId=${clinicId}`) : Promise.resolve([]),
      canFinance ? api.get<RecordValue[]>(`/payables?clinicId=${clinicId}`).catch(() => []) : Promise.resolve([]),
      canFinance ? api.get<RecordValue[]>(`/finance-recurrences?clinicId=${clinicId}`).catch(() => []) : Promise.resolve([]),
      canFinance ? api.get<RecordValue>(`/cashflow?${cashQuery}`).catch(() => null) : Promise.resolve(null),
      canCommission ? api.get<RecordValue[]>('/commission-rules').catch(() => []) : Promise.resolve([]),
      canCommission ? api.get<RecordValue[]>(`/commission-events?clinicId=${clinicId}&from=${from}`).catch(() => []) : Promise.resolve([]),
      canCommission ? api.get<RecordValue[]>(`/commission-periods?clinicId=${clinicId}`).catch(() => []) : Promise.resolve([]),
      api.get<RecordValue[]>(`/patients?clinicId=${clinicId}`).catch(() => []),
    ])
      .then(([nextReceivables, nextPayables, nextRecurrences, nextCashflow, nextRules, nextEvents, nextPeriods, nextPatients]) => {
        setReceivables(list(nextReceivables));
        setPayables(list(nextPayables));
        setRecurrences(list(nextRecurrences));
        setCashflow(nextCashflow);
        setRules(list(nextRules));
        setCommissionEvents(list(nextEvents));
        setCommissionPeriods(list(nextPeriods));
        setPatients(list(nextPatients));
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar o financeiro.'))
      .finally(() => setLoading(false));
  }, [canCommission, canFinance, cashflowPeriod, clinicId]);

  useEffect(load, [load]);

  const closePeriod = async (periodId: string) => {
    setClosingId(periodId);
    try {
      await api.post(`/commission-periods/${periodId}/close`, {});
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível fechar a competência.');
    } finally {
      setClosingId(null);
    }
  };

  const ensureOpenPeriod = async () => {
    if (!clinicId) return;
    try {
      const referenceMonth = `${new Date().toISOString().slice(0, 7)}-01`;
      await api.post('/commission-periods', { clinicId, referenceMonth });
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível abrir a competência.');
    }
  };

  const createRecurrence = async (event: FormEvent) => {
    event.preventDefault();
    if (!clinicId || !canFinanceCreate) return;
    setRecurrenceBusy('create');
    setError('');
    try {
      await api.post('/finance-recurrences', {
        clinicId,
        kind: recurrenceForm.kind,
        description: recurrenceForm.description,
        amount: moneyInputToApi(recurrenceForm.amount),
        frequency: recurrenceForm.frequency,
        interval: Number(recurrenceForm.interval) || 1,
        nextOccurrence: recurrenceForm.nextOccurrence,
        endsAt: recurrenceForm.endsAt || undefined,
        patientId: recurrenceForm.kind === 'RECEIVABLE' ? recurrenceForm.patientId || undefined : undefined,
        supplierName: recurrenceForm.kind === 'PAYABLE' ? recurrenceForm.supplierName || undefined : undefined,
      });
      setRecurrenceForm((prev) => ({
        ...prev,
        description: '',
        amount: '',
        supplierName: '',
        patientId: '',
      }));
      setRecurrenceOpen(false);
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível criar a recorrência.');
    } finally {
      setRecurrenceBusy(null);
    }
  };

  const createReceivable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clinicId || !canFinanceCreate) return;
    const data = new FormData(event.currentTarget);
    const description = String(data.get('description') || '').trim();
    const originalAmount = moneyInputToApi(data.get('originalAmount'));
    const patientId = String(data.get('patientId') || '');
    const dueDate = String(data.get('dueDate') || '');
    if (!patientId || description.length < 3 || !dueDate || Number(originalAmount) <= 0) {
      setError('Informe paciente, descrição, vencimento e um valor válido.');
      return;
    }
    setReceivableBusy(true);
    setError('');
    try {
      await api.post('/receivables', {
        clinicId,
        patientId,
        description,
        originalAmount,
        dueDate,
        paymentMethod: String(data.get('paymentMethod') || '') || undefined,
      });
      setCreateReceivableOpen(false);
      setReceivableForm({
        patientId: '',
        description: '',
        dueDate: new Date().toISOString().slice(0, 10),
        paymentMethod: '',
      });
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível criar o título.');
    } finally {
      setReceivableBusy(false);
    }
  };

  const registerReceivablePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!receiveTarget || !canFinanceCreate) return;
    const data = new FormData(event.currentTarget);
    const amount = moneyInputToApi(data.get('amount'));
    const method = String(data.get('method') || 'PIX');
    if (Number(amount) <= 0) {
      setError('Informe o valor recebido.');
      return;
    }
    setReceivableBusy(true);
    setError('');
    try {
      if (receiveMode === 'charge') {
        const payment = await api.post<RecordValue>(
          `/receivables/${String(receiveTarget.id)}/charges`,
          { amount, method: method === 'BOLETO' ? 'BOLETO' : 'PIX' },
          { 'Idempotency-Key': crypto.randomUUID() },
        );
        setChargePayment(payment);
        load();
        return;
      }
      await api.post(
        `/receivables/${String(receiveTarget.id)}/payments`,
        { amount, method },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setReceiveTarget(null);
      setChargePayment(null);
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : receiveMode === 'charge'
        ? 'Não foi possível gerar a cobrança.'
        : 'Não foi possível registrar o recebimento.');
    } finally {
      setReceivableBusy(false);
    }
  };

  const syncChargePayment = async (paymentId: string) => {
    setReceivableBusy(true);
    setError('');
    try {
      const updated = await api.post<RecordValue>(`/payments/${paymentId}/sync`, {});
      setChargePayment(updated);
      if (updated.status === 'CONFIRMED') {
        setReceiveTarget(null);
        setChargePayment(null);
      }
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível consultar o status da cobrança.');
    } finally {
      setReceivableBusy(false);
    }
  };

  const toggleRecurrence = async (id: string, active: boolean) => {
    setRecurrenceBusy(id);
    try {
      await api.patch(`/finance-recurrences/${id}`, { active: !active });
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível atualizar a recorrência.');
    } finally {
      setRecurrenceBusy(null);
    }
  };

  const generateRecurrence = async (id: string) => {
    setRecurrenceBusy(id);
    try {
      await api.post(`/finance-recurrences/${id}/generate`, {});
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível gerar a ocorrência.');
    } finally {
      setRecurrenceBusy(null);
    }
  };

  useEffect(() => {
    setFiltersOpen(window.localStorage.getItem('sonder.finance.filtersOpen') === 'true');
  }, []);

  const open = useMemo(
    () => receivables.filter((item) => !['PAID', 'CANCELLED'].includes(String(item.status))),
    [receivables],
  );
  const overdue = useMemo(
    () => receivables.filter((item) => {
      const status = String(item.effectiveStatus ?? item.status);
      return status === 'OVERDUE' || (
        !['PAID', 'CANCELLED'].includes(String(item.status))
        && Number(item.outstandingAmount ?? item.netAmount ?? 0) > 0
        && item.dueDate
        && new Date(String(item.dueDate)).getTime() < Date.now() - 86_400_000
      );
    }),
    [receivables],
  );
  const paid = useMemo(
    () => receivables.filter((item) => item.status === 'PAID'),
    [receivables],
  );
  const openTotal = open.reduce((sum, item) => sum + Number(item.outstandingAmount ?? item.netAmount ?? 0), 0);
  const overdueTotal = overdue.reduce((sum, item) => sum + Number(item.outstandingAmount ?? item.netAmount ?? 0), 0);
  const paidTotal = paid.reduce((sum, item) => sum + Number(item.paidAmount ?? item.netAmount ?? 0), 0);

  const filteredReceivables = useMemo(() => {
    const query = patientQuery.trim().toLocaleLowerCase('pt-BR');
    const fromMs = dueFrom ? new Date(`${dueFrom}T00:00:00`).getTime() : null;
    const toMs = dueTo ? new Date(`${dueTo}T23:59:59`).getTime() : null;
    return receivables.filter((item) => {
      const status = String(item.effectiveStatus ?? item.status);
      if (statusFilter && status !== statusFilter) return false;
      if (fromMs != null || toMs != null) {
        if (!item.dueDate) return false;
        const dueMs = new Date(String(item.dueDate)).getTime();
        if (Number.isNaN(dueMs)) return false;
        if (fromMs != null && dueMs < fromMs) return false;
        if (toMs != null && dueMs > toMs) return false;
      }
      if (!query) return true;
      const patientName = text(nested(item, 'patient').fullName, '').toLocaleLowerCase('pt-BR');
      const description = text(item.description).toLocaleLowerCase('pt-BR');
      return patientName.includes(query) || description.includes(query);
    });
  }, [dueFrom, dueTo, patientQuery, receivables, statusFilter]);

  const filteredRecurrences = useMemo(() => {
    const query = recurrenceQuery.trim().toLocaleLowerCase('pt-BR');
    return recurrences.filter((item) => {
      if (recurrenceKindFilter && item.kind !== recurrenceKindFilter) return false;
      if (!query) return true;
      return text(item.description).toLocaleLowerCase('pt-BR').includes(query);
    });
  }, [recurrenceKindFilter, recurrenceQuery, recurrences]);

  const paymentMethodLabel = (value: unknown) => {
    const key = String(value ?? '');
    const labels: Record<string, string> = {
      PIX: 'PIX',
      CREDIT_CARD: 'Cartão de crédito',
      DEBIT_CARD: 'Cartão de débito',
      CASH: 'Dinheiro',
      TRANSFER: 'Transferência',
      BOLETO: 'Boleto',
      OTHER: 'Outro',
    };
    return labels[key] ?? presentationLabel(value);
  };

  const activeRules = useMemo(
    () => rules.filter((item) => {
      if (item.active === false) return false;
      const validTo = item.validUntil ?? item.validTo;
      const until = validTo ? new Date(String(validTo)) : null;
      return !until || until.getTime() >= Date.now();
    }),
    [rules],
  );
  const averagePercent = useMemo(() => {
    const percentRules = rules.filter((item) => {
      const type = String(item.calculationType ?? '').toUpperCase();
      return type.includes('PERCENT') || type === 'PERCENTAGE';
    });
    if (!percentRules.length) return null;
    const sum = percentRules.reduce((total, item) => total + Number(item.value ?? 0), 0);
    return sum / percentRules.length;
  }, [rules]);

  if (!canFinance && tab !== 'commissions') {
    return (
      <>
        <PageHeader title="Gestão financeira" description="Acesso restrito. Peça permissão para visualizar o financeiro." />
        <div className="state-message error" role="alert">Você não possui permissão para visualizar o financeiro.</div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Gestão financeira"
        description="Acompanhe títulos a receber, pagamentos e regras de comissão com dados reais da clínica."
        actions={
          <>
            <button className="button secondary" type="button" onClick={load} disabled={loading}>
              <RefreshCw size={16} />Atualizar
            </button>
          </>
        }
      />
      {error && <div className="secure-notice form-error" role="alert">{error}</div>}
      <div className="finance-subnav" role="tablist" aria-label="Áreas financeiras">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`finance-tab ${tab === item.id ? 'active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}{!item.available ? ' · em breve' : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <section className="stats">
            <MetricCard label="Recebido (pagos)" value={currency(paidTotal)} meta={`${paid.length} títulos`} />
            <MetricCard label="A receber" value={currency(openTotal)} meta={`${open.length} lançamentos`} />
            <MetricCard label="Em atraso" value={currency(overdueTotal)} meta={`${overdue.length} títulos`} tone={overdue.length ? 'red' : 'green'} />
            <MetricCard label="Regras de comissão" value={rules.length} meta={canCommission ? 'Carregadas' : 'Sem permissão'} />
          </section>
          <div className="dashboard-grid">
            <Panel title="Atenção financeira" description="Títulos em aberto que pedem ação">
              <div className="billing-list">
                <div className="billing-row">
                  <div><strong>{overdue.length} títulos vencidos</strong><span>{currency(overdueTotal)}</span></div>
                  <StatusBadge tone="red">Cobrar</StatusBadge>
                </div>
                <div className="billing-row">
                  <div><strong>{open.length} em aberto</strong><span>{currency(openTotal)}</span></div>
                  <StatusBadge tone="amber">Acompanhar</StatusBadge>
                </div>
                <div className="billing-row">
                  <div><strong>Contas a pagar</strong><span>{payables.length} títulos</span></div>
                  <StatusBadge tone="blue">Ativo</StatusBadge>
                </div>
                <div className="billing-row">
                  <div><strong>Recorrências</strong><span>{recurrences.filter((item) => item.active).length} ativas</span></div>
                  <StatusBadge tone="blue">Ativo</StatusBadge>
                </div>
              </div>
            </Panel>
            <Panel title="Atalhos" description="Módulos disponíveis">
              <div className="billing-list">
                <button className="billing-row" type="button" style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'left' }} onClick={() => setTab('receivable')}>
                  <div><strong>Contas a receber</strong><span>Criar título e registrar pagamento</span></div>
                  <StatusBadge tone="blue">Abrir</StatusBadge>
                </button>
                <button className="billing-row" type="button" style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'left' }} onClick={() => setTab('recurring')}>
                  <div><strong>Recorrências</strong><span>Gerar títulos periódicos</span></div>
                  <StatusBadge tone="blue">Abrir</StatusBadge>
                </button>
                <button className="billing-row" type="button" style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'left' }} onClick={() => setTab('commissions')}>
                  <div><strong>Comissões</strong><span>Regras versionadas</span></div>
                  <StatusBadge tone="blue">Abrir</StatusBadge>
                </button>
              </div>
            </Panel>
          </div>
        </>
      )}

      {tab === 'receivable' && (
        <>
          <Modal open={Boolean(selectedReceivable)} title="Detalhes da conta a receber" description="Título, tratamento/orçamento e pagamentos vinculados." onClose={() => setSelectedReceivable(null)}>
            {selectedReceivable ? (
              <div>
                <div className="info-grid">
                  <div className="info-item"><small>Descrição</small><strong>{text(selectedReceivable.description)}</strong></div>
                  <div className="info-item"><small>Status</small><strong>{presentationLabel(selectedReceivable.effectiveStatus ?? selectedReceivable.status)}</strong></div>
                  <div className="info-item"><small>Valor líquido</small><strong>{currency(selectedReceivable.netAmount)}</strong></div>
                  <div className="info-item"><small>Recebido</small><strong>{currency(selectedReceivable.paidAmount)}</strong></div>
                  <div className="info-item"><small>Estornado</small><strong>{currency(selectedReceivable.refundedAmount)}</strong></div>
                  <div className="info-item"><small>Saldo em aberto</small><strong>{currency(selectedReceivable.outstandingAmount ?? selectedReceivable.netAmount)}</strong></div>
                  <div className="info-item"><small>Vencimento</small><strong>{dateOnly(selectedReceivable.dueDate)}</strong></div>
                  <div className="info-item"><small>Tratamento/orçamento</small><strong>{text(nested(selectedReceivable, 'treatment').title, 'Não vinculado')}</strong></div>
                  <div className="info-item"><small>Forma de Pagamento</small><strong>{paymentMethodLabel(selectedReceivable.paymentMethod)}</strong></div>
                  <div className="info-item"><small>Situação clínica</small><strong>{presentationLabel(nested(selectedReceivable, 'treatment').status)}</strong></div>
                </div>
                {Array.isArray(selectedReceivable.payments) && selectedReceivable.payments.length > 0 ? (
                  <div className="span-2" style={{ marginTop: 16 }}>
                    <small>Pagamentos e cobranças</small>
                    <div className="settings-list" style={{ marginTop: 8 }}>
                      {(selectedReceivable.payments as RecordValue[]).map((payment) => {
                        const data = nested(payment, 'providerData');
                        return (
                          <div className="settings-row" key={String(payment.id)}>
                            <div>
                              <strong>{paymentMethodLabel(payment.method)} · {currency(payment.amount)}</strong>
                              <span>{presentationLabel(payment.status)}{payment.provider ? ` · ${String(payment.provider)}` : ''}</span>
                              {text(data.brCodeBase64) ? (
                                <div style={{ marginTop: 8 }}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={text(data.brCodeBase64)} alt="QR Code PIX" style={{ width: 140, height: 140 }} />
                                </div>
                              ) : null}
                              {data.brCode ? <span className="field-hint">PIX: {text(data.brCode)}</span> : null}
                              {data.barCode ? <span className="field-hint">Boleto: {text(data.barCode)}</span> : null}
                              {data.url ? <a className="field-hint" href={text(data.url)} target="_blank" rel="noreferrer">Abrir boleto</a> : null}
                            </div>
                            {canFinanceCreate && payment.status === 'PENDING' && payment.provider === 'ABACATEPAY' ? (
                              <button
                                type="button"
                                className="button small"
                                disabled={receivableBusy}
                                onClick={() => void syncChargePayment(String(payment.id))}
                              >
                                Atualizar status
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <div className="modal-footer">
                  {canFinanceCreate && !['PAID', 'CANCELLED'].includes(String(selectedReceivable.status)) ? (
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => {
                        setReceiveTarget(selectedReceivable);
                        setReceiveMode('receive');
                        setChargePayment(null);
                        setReceiveForm({
                          amount: formatMoneyInputFromValue(selectedReceivable.outstandingAmount ?? selectedReceivable.netAmount),
                          method: 'PIX',
                        });
                        setSelectedReceivable(null);
                      }}
                    >
                      Registrar recebimento
                    </button>
                  ) : null}
                  {selectedReceivable.patientId ? <Link className="button" href={`/pacientes/${String(selectedReceivable.patientId)}?tab=financeiro`}>Abrir paciente</Link> : null}
                </div>
              </div>
            ) : null}
          </Modal>
          <Modal
            open={createReceivableOpen}
            title="Nova conta a receber"
            description="Cadastre um título vinculado ao paciente."
            onClose={() => setCreateReceivableOpen(false)}
            confirmOnClose
          >
            <form className="mutation-form" onSubmit={(event) => void createReceivable(event)}>
              <label className="span-2">Paciente
                <select name="patientId" required defaultValue={receivableForm.patientId}>
                  <option value="">Selecione</option>
                  {patients.map((item) => (
                    <option key={String(item.id)} value={String(item.id)}>{text(item.fullName)}</option>
                  ))}
                </select>
              </label>
              <label className="span-2">Descrição<input name="description" required minLength={3} defaultValue={receivableForm.description} /></label>
              <label>Valor<UncontrolledMoneyInput name="originalAmount" required /></label>
              <label>Vencimento<input name="dueDate" type="date" required defaultValue={receivableForm.dueDate} /></label>
              <label className="span-2">Forma de pagamento prevista
                <select name="paymentMethod" defaultValue={receivableForm.paymentMethod}>
                  <option value="">Não informado</option>
                  {PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                </select>
              </label>
              {error ? <p className="form-error span-2" role="alert">{error}</p> : null}
              <div className="modal-footer span-2">
                <button type="button" className="button" onClick={() => setCreateReceivableOpen(false)}>Cancelar</button>
                <button className="button primary" disabled={receivableBusy}>{receivableBusy ? 'Salvando…' : 'Criar título'}</button>
              </div>
            </form>
          </Modal>
          <Modal
            open={Boolean(receiveTarget)}
            title={receiveMode === 'charge' ? 'Gerar cobrança PIX/Boleto' : 'Registrar recebimento'}
            description={receiveTarget ? `${text(receiveTarget.description)} · saldo ${currency(receiveTarget.outstandingAmount ?? receiveTarget.netAmount)}` : undefined}
            onClose={() => { setReceiveTarget(null); setChargePayment(null); }}
            confirmOnClose
          >
            {receiveTarget ? (
              chargePayment ? (
                <ChargeDetails
                  payment={chargePayment}
                  busy={receivableBusy}
                  error={error}
                  onSync={() => void syncChargePayment(String(chargePayment.id))}
                  onClose={() => { setReceiveTarget(null); setChargePayment(null); }}
                />
              ) : (
              <form className="mutation-form" onSubmit={(event) => void registerReceivablePayment(event)} key={String(receiveTarget.id)}>
                <div className="info-grid span-2">
                  <div className="info-item"><small>Título</small><strong>{text(receiveTarget.description)}</strong></div>
                  <div className="info-item"><small>Status</small><strong>{presentationLabel(receiveTarget.effectiveStatus ?? receiveTarget.status)}</strong></div>
                  <div className="info-item"><small>Valor</small><strong>{currency(receiveTarget.netAmount)}</strong></div>
                  <div className="info-item"><small>Saldo</small><strong>{currency(receiveTarget.outstandingAmount ?? receiveTarget.netAmount)}</strong></div>
                </div>
                <label className="span-2">Operação
                  <select
                    value={receiveMode}
                    onChange={(event) => {
                      const next = event.target.value === 'charge' ? 'charge' : 'receive';
                      setReceiveMode(next);
                      if (next === 'charge' && !['PIX', 'BOLETO'].includes(receiveForm.method)) {
                        setReceiveForm((prev) => ({ ...prev, method: 'PIX' }));
                      }
                    }}
                  >
                    <option value="receive">Registrar recebimento (já pago)</option>
                    <option value="charge">Gerar cobrança PIX/Boleto (AbacatePay)</option>
                  </select>
                  <span className="field-hint">
                    {receiveMode === 'charge'
                      ? 'Cria PIX ou boleto no AbacatePay e mantém o título em aberto até o pagamento ser confirmado.'
                      : 'Baixa imediata para dinheiro, cartão ou PIX já recebido na clínica.'}
                  </span>
                </label>
                <label>Valor recebido
                  <UncontrolledMoneyInput
                    name="amount"
                    required
                    defaultValue={formatMoneyInputFromValue(receiveTarget.outstandingAmount ?? receiveTarget.netAmount)}
                  />
                </label>
                <label>Forma de pagamento
                  <select name="method" defaultValue={receiveForm.method} required>
                    {(receiveMode === 'charge' ? CHARGE_METHODS : PAYMENT_METHODS).map((method) => (
                      <option key={method.value} value={method.value}>{method.label}</option>
                    ))}
                  </select>
                </label>
                {error ? <p className="form-error span-2" role="alert">{error}</p> : null}
                <div className="modal-footer span-2">
                  <button type="button" className="button" onClick={() => { setReceiveTarget(null); setChargePayment(null); }}>Cancelar</button>
                  <button className="button primary" disabled={receivableBusy}>
                    {receivableBusy
                      ? (receiveMode === 'charge' ? 'Gerando…' : 'Registrando…')
                      : (receiveMode === 'charge' ? 'Gerar cobrança' : 'Registrar recebimento')}
                  </button>
                </div>
              </form>
              )
            ) : null}
          </Modal>
          <Panel
            title="Contas a receber"
            description="Títulos em aberto, pagos e vencidos"
            actions={
              <div className="heading-actions" style={{ marginLeft: 0 }}>
                {canFinanceCreate ? (
                  <button
                    className="button primary small"
                    type="button"
                    onClick={() => { setError(''); setCreateReceivableOpen(true); }}
                  >
                    <Plus size={14} /> Conta a receber
                  </button>
                ) : null}
                <button
                  className="button small"
                  type="button"
                  aria-expanded={filtersOpen}
                  onClick={() => {
                    setFiltersOpen((value) => {
                      window.localStorage.setItem('sonder.finance.filtersOpen', String(!value));
                      return !value;
                    });
                  }}
                >
                  <SlidersHorizontal size={14} />Filtros
                </button>
              </div>
            }
          >
            <div className="summary-strip">
              <div><small>Em aberto</small><strong>{currency(openTotal)}</strong></div>
              <div><small>Em atraso</small><strong style={{ color: 'var(--danger)' }}>{currency(overdueTotal)}</strong></div>
              <div><small>Pagos</small><strong>{currency(paidTotal)}</strong></div>
              <div><small>Total de títulos</small><strong>{receivables.length}</strong></div>
            </div>
            <div className="filters filter-primary">
              <select
                className="filter-select"
                aria-label="Filtrar contas por status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">Todos os status</option>
                <option value="OPEN">Em aberto</option>
                <option value="PARTIALLY_PAID">Parcialmente pago</option>
                <option value="PAID">Pago</option>
                <option value="OVERDUE">Vencido</option>
              </select>
              <input
                className="filter-input"
                placeholder="Buscar paciente ou descrição…"
                value={patientQuery}
                onChange={(event) => setPatientQuery(event.target.value)}
                aria-label="Buscar por paciente ou descrição"
              />
            </div>
            {filtersOpen ? (
              <div className="filters filter-advanced">
                <label>
                  Vencimento de
                  <input
                    type="date"
                    value={dueFrom}
                    onChange={(event) => setDueFrom(event.target.value)}
                    aria-label="Vencimento a partir de"
                  />
                </label>
                <label>
                  Vencimento até
                  <input
                    type="date"
                    value={dueTo}
                    onChange={(event) => setDueTo(event.target.value)}
                    aria-label="Vencimento até"
                  />
                </label>
                {(dueFrom || dueTo) ? (
                  <button
                    type="button"
                    className="button small"
                    onClick={() => { setDueFrom(''); setDueTo(''); }}
                  >
                    Limpar período
                  </button>
                ) : null}
              </div>
            ) : null}
            {loading ? <div className="state-message">Carregando…</div> : null}
            {!loading && filteredReceivables.length === 0 ? <EmptyState title="Nenhum título" description={receivables.length ? 'Nenhum resultado para os filtros.' : 'Crie o primeiro título com “Conta a receber”.'} /> : null}
            {filteredReceivables.length > 0 && (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Vencimento</th>
                      <th>Valor</th>
                      <th>Saldo</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReceivables.map((item) => (
                      <tr key={String(item.id)} onClick={() => setSelectedReceivable(item)} style={{ cursor: 'pointer' }}>
                        <td>
                          <div>{text(item.description)}</div>
                          {(() => {
                            const pix = list(item.payments as RecordValue[]).map((payment) => nested(payment, 'providerData')).find((data) => text(data.brCodeBase64) || text(data.brCode) || text(data.url));
                            if (!pix) return null;
                            return (
                              <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                                {text(pix.brCodeBase64) ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={text(pix.brCodeBase64)} alt="QR PIX" style={{ width: 56, height: 56 }} />
                                ) : null}
                                <span className="field-hint">{text(pix.brCode) ? 'PIX copia e cola disponível' : text(pix.url) ? 'Boleto disponível' : ''}</span>
                              </div>
                            );
                          })()}
                        </td>
                        <td>{dateOnly(item.dueDate)}</td>
                        <td>{currency(item.netAmount)}</td>
                        <td>{currency(item.outstandingAmount ?? item.netAmount)}</td>
                        <td><StatusBadge tone={statusTone(item.effectiveStatus ?? item.status)}>{presentationLabel(item.effectiveStatus ?? item.status)}</StatusBadge></td>
                        <td className="row-actions">
                          {canFinanceCreate && !['PAID', 'CANCELLED'].includes(String(item.status)) ? (
                            <button
                              type="button"
                              className="icon-button"
                              title="Registrar recebimento"
                              aria-label={`Registrar recebimento de ${text(item.description)}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setError('');
                                setReceiveTarget(item);
                                setReceiveMode('receive');
                                setChargePayment(null);
                                setReceiveForm({
                                  amount: formatMoneyInputFromValue(item.outstandingAmount ?? item.netAmount),
                                  method: 'PIX',
                                });
                              }}
                            >
                              <Banknote size={16} />
                            </button>
                          ) : null}
                          {item.patientId ? (
                            <Link
                              className="icon-button"
                              onClick={(event) => event.stopPropagation()}
                              href={`/pacientes/${String(item.patientId)}?tab=financeiro`}
                              title="Paciente"
                              aria-label="Abrir ficha do paciente"
                            >
                              <UserRound size={16} />
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      {tab === 'commissions' && (
        <>
          <Panel
            title="Comissões e repasses"
            description="Acompanhe competências e lançamentos. As regras são parametrizadas em Configurações."
            actions={canConfigureCommission ? (
              <Link className="button primary small" href="/configuracoes?section=finance">Parametrizar regras</Link>
            ) : undefined}
          >
            {!canCommission ? (
              <div className="state-message error" role="alert">Sem permissão para visualizar comissões.</div>
            ) : (
              <div className="commission-layout">
                <section className="stats">
                  <MetricCard label="Regras ativas" value={activeRules.length} meta={`${rules.length} no total`} />
                  <MetricCard
                    label="% média"
                    value={averagePercent == null ? '—' : `${averagePercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
                    meta="Regras percentuais"
                  />
                  <MetricCard label="Lançamentos no período" value={commissionEvents.length} meta="Competência atual" />
                </section>

                <div className="dashboard-grid">
                  <Panel title="Competências" description="Feche o mês para liberar os repasses">
                    {canCloseCommission ? (
                      <div className="heading-actions" style={{ margin: '0 0 10px' }}>
                        <button className="button small" type="button" onClick={() => void ensureOpenPeriod()}>
                          Abrir o mês atual
                        </button>
                      </div>
                    ) : null}
                    {commissionPeriods.length === 0 ? (
                      <EmptyState title="Nenhuma competência" description="Ao confirmar pagamentos com regra ativa, a competência do mês é aberta automaticamente." />
                    ) : (
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Mês</th>
                              <th>Status</th>
                              <th>Lançamentos</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {commissionPeriods.map((period) => (
                              <tr key={String(period.id)}>
                                <td>{dateOnly(period.referenceMonth)}</td>
                                <td><StatusBadge tone={period.status === 'CLOSED' ? 'green' : 'amber'}>{presentationLabel(period.status)}</StatusBadge></td>
                                <td>{text(nested(period, '_count').events, '0')}</td>
                                <td>
                                  {canCloseCommission && period.status === 'OPEN' ? (
                                    <button
                                      className="button small primary"
                                      type="button"
                                      disabled={closingId === String(period.id)}
                                      onClick={() => void closePeriod(String(period.id))}
                                    >
                                      {closingId === String(period.id) ? 'Fechando…' : 'Fechar'}
                                    </button>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Panel>

                  <Panel title="Regras vigentes" description="Parametrizadas em Configurações → Financeiro e comissões">
                    {rules.length === 0 ? (
                      <EmptyState title="Nenhuma regra" description="Cadastre regras em Configurações para começar a calcular repasses." />
                    ) : (
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Base</th>
                              <th>Cálculo</th>
                              <th>Valor</th>
                              <th>Vigência</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rules.map((item) => (
                              <tr key={String(item.id)}>
                                <td>{presentationLabel(item.basis)}</td>
                                <td>{presentationLabel(item.calculationType)}</td>
                                <td>{item.calculationType === 'PERCENTAGE' || String(item.calculationType).includes('PERCENT') ? `${text(item.value)}%` : currency(item.value)}</td>
                                <td>
                                  {dateOnly(item.validFrom)}
                                  {item.validTo || item.validUntil ? ` → ${dateOnly(item.validTo ?? item.validUntil)}` : ' · vigente'}
                                </td>
                                <td>
                                  <StatusBadge tone={item.active !== false ? 'green' : 'gray'}>
                                    {item.active !== false ? 'Ativa' : 'Inativa'}
                                  </StatusBadge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Panel>
                </div>

                <Panel title="Lançamentos de comissão" description="Gerados automaticamente quando um pagamento confirmado encontra regra ativa">
                  {commissionEvents.length === 0 ? (
                    <EmptyState
                      title="Nenhum lançamento"
                      description="Confirme pagamentos de títulos vinculados a tratamento com profissional e regra ativa."
                    />
                  ) : (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>Base de cálculo</th>
                            <th>Comissão</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {commissionEvents.map((item) => (
                            <tr key={String(item.id)}>
                              <td>{dateOnly(item.occurredAt)}</td>
                              <td>{currency(item.basisAmount)}</td>
                              <td>{currency(item.commissionAmount)}</td>
                              <td><StatusBadge tone={statusTone(String(item.status))}>{presentationLabel(item.status)}</StatusBadge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              </div>
            )}
          </Panel>
        </>
      )}

      {tab === 'payable' && (
        <>
          <Modal
            open={Boolean(selectedPayable)}
            title="Detalhes da conta a pagar"
            description="Valor, fornecedor, categoria e pagamentos vinculados."
            onClose={() => setSelectedPayable(null)}
          >
            {selectedPayable ? (
              <>
                <div className="info-grid">
                  <div className="info-item"><small>Descrição</small><strong>{text(selectedPayable.description)}</strong></div>
                  <div className="info-item"><small>Status</small><strong>{presentationLabel(selectedPayable.status)}</strong></div>
                  <div className="info-item"><small>Valor original</small><strong>{currency(selectedPayable.originalAmount ?? selectedPayable.netAmount)}</strong></div>
                  <div className="info-item"><small>Pago</small><strong>{currency(selectedPayable.paidAmount)}</strong></div>
                  <div className="info-item"><small>Saldo</small><strong>{currency(
                    Number(selectedPayable.originalAmount ?? selectedPayable.netAmount ?? 0)
                    - Number(selectedPayable.paidAmount ?? 0),
                  )}</strong></div>
                  <div className="info-item"><small>Vencimento</small><strong>{dateOnly(selectedPayable.dueDate)}</strong></div>
                  <div className="info-item"><small>Fornecedor</small><strong>{text(selectedPayable.supplierName, '—')}</strong></div>
                  <div className="info-item"><small>Categoria</small><strong>{text(selectedPayable.categoryId, '—')}</strong></div>
                  <div className="info-item"><small>Centro de custo</small><strong>{text(selectedPayable.costCenterId, '—')}</strong></div>
                  <div className="info-item"><small>Notas</small><strong>{text(selectedPayable.notes, '—')}</strong></div>
                </div>
                <Panel title="Pagamentos">
                  {list(selectedPayable.payments).length ? (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>Método</th>
                            <th>Valor</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list(selectedPayable.payments).map((payment) => (
                            <tr key={String(payment.id)}>
                              <td>{dateOnly(payment.paidAt)}</td>
                              <td>{paymentMethodLabel(payment.method)}</td>
                              <td>{currency(payment.amount)}</td>
                              <td>{presentationLabel(payment.status)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="muted-note">Nenhum pagamento registrado.</p>
                  )}
                </Panel>
              </>
            ) : null}
          </Modal>
          <Panel title="Contas a pagar" description="Títulos de saída da clínica.">
            {!canFinance ? (
              <div className="state-message error" role="alert">Sem permissão para ver o financeiro.</div>
            ) : payables.length === 0 ? (
              <EmptyState title="Nenhuma conta a pagar" description="Cadastre despesas pelo módulo financeiro quando necessário." />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Vencimento</th>
                      <th>Valor</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payables.map((item) => (
                      <tr
                        key={String(item.id)}
                        onClick={() => setSelectedPayable(item)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>{text(item.description)}</td>
                        <td>{dateOnly(item.dueDate)}</td>
                        <td>{currency(item.originalAmount ?? item.netAmount)}</td>
                        <td><StatusBadge tone={statusTone(String(item.status))}>{presentationLabel(item.status)}</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
      {tab === 'recurring' && (
        <>
          <Modal
            open={recurrenceOpen}
            title="Nova recorrência"
            description="Cria contas a pagar ou a receber automaticamente na data de vencimento, ou você pode gerar agora."
            onClose={() => setRecurrenceOpen(false)}
            size="medium"
            confirmOnClose
          >
            {!canFinanceCreate ? (
              <div className="state-message error" role="alert">Sem permissão para cadastrar títulos.</div>
            ) : (
              <form className="mutation-form compact" onSubmit={(event) => void createRecurrence(event)}>
                <label>
                  Tipo
                  <select
                    value={recurrenceForm.kind}
                    onChange={(event) => setRecurrenceForm((prev) => ({ ...prev, kind: event.target.value }))}
                  >
                    <option value="PAYABLE">Conta a pagar</option>
                    <option value="RECEIVABLE">Conta a receber</option>
                  </select>
                </label>
                <label className="span-2">
                  Descrição
                  <input
                    required
                    minLength={3}
                    value={recurrenceForm.description}
                    onChange={(event) => setRecurrenceForm((prev) => ({ ...prev, description: event.target.value }))}
                  />
                </label>
                <label>
                  Valor
                  <input
                    required
                    inputMode="numeric"
                    placeholder="0,00"
                    value={recurrenceForm.amount}
                    onChange={(event) => setRecurrenceForm((prev) => ({ ...prev, amount: maskMoneyInput(event.target.value) }))}
                  />
                </label>
                <label>
                  Frequência
                  <select
                    value={recurrenceForm.frequency}
                    onChange={(event) => setRecurrenceForm((prev) => ({ ...prev, frequency: event.target.value }))}
                  >
                    <option value="DAILY">Diária</option>
                    <option value="WEEKLY">Semanal</option>
                    <option value="MONTHLY">Mensal</option>
                    <option value="YEARLY">Anual</option>
                  </select>
                </label>
                <label>
                  Intervalo
                  <input
                    type="number"
                    min={1}
                    max={36}
                    value={recurrenceForm.interval}
                    onChange={(event) => setRecurrenceForm((prev) => ({ ...prev, interval: event.target.value }))}
                  />
                </label>
                <label>
                  Próxima ocorrência
                  <input
                    type="date"
                    required
                    value={recurrenceForm.nextOccurrence}
                    onChange={(event) => setRecurrenceForm((prev) => ({ ...prev, nextOccurrence: event.target.value }))}
                  />
                </label>
                <label>
                  Termina em (opcional)
                  <input
                    type="date"
                    value={recurrenceForm.endsAt}
                    onChange={(event) => setRecurrenceForm((prev) => ({ ...prev, endsAt: event.target.value }))}
                  />
                </label>
                {recurrenceForm.kind === 'RECEIVABLE' ? (
                  <label className="span-2">
                    Paciente
                    <select
                      required
                      value={recurrenceForm.patientId}
                      onChange={(event) => setRecurrenceForm((prev) => ({ ...prev, patientId: event.target.value }))}
                    >
                      <option value="">Selecione</option>
                      {patients.map((patient) => (
                        <option key={String(patient.id)} value={String(patient.id)}>
                          {text(patient.fullName)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="span-2">
                    Fornecedor (opcional)
                    <input
                      value={recurrenceForm.supplierName}
                      onChange={(event) => setRecurrenceForm((prev) => ({ ...prev, supplierName: event.target.value }))}
                    />
                  </label>
                )}
                <button className="button primary" type="submit" disabled={recurrenceBusy === 'create'}>
                  {recurrenceBusy === 'create' ? 'Salvando…' : 'Criar recorrência'}
                </button>
              </form>
            )}
          </Modal>
          <Panel
            title="Recorrências"
            description={`${recurrences.length} regras na clínica.`}
            actions={(
              <div className="heading-actions" style={{ marginLeft: 0 }}>
                <button
                  className="button small"
                  type="button"
                  aria-expanded={recurrenceFiltersOpen}
                  onClick={() => setRecurrenceFiltersOpen((value) => !value)}
                >
                  <SlidersHorizontal size={14} />Filtros
                </button>
                {canFinanceCreate ? (
                  <button className="button primary small" type="button" onClick={() => setRecurrenceOpen(true)}>
                    Nova recorrência
                  </button>
                ) : null}
              </div>
            )}
          >
            <div className="filters filter-primary">
              <select
                className="filter-select"
                aria-label="Filtrar por tipo"
                value={recurrenceKindFilter}
                onChange={(event) => setRecurrenceKindFilter(event.target.value)}
              >
                <option value="">Todos os tipos</option>
                <option value="PAYABLE">Conta a pagar</option>
                <option value="RECEIVABLE">Conta a receber</option>
              </select>
            </div>
            {recurrenceFiltersOpen ? (
              <div className="filters filter-advanced">
                <input
                  className="filter-input"
                  placeholder="Buscar descrição…"
                  value={recurrenceQuery}
                  onChange={(event) => setRecurrenceQuery(event.target.value)}
                  aria-label="Buscar recorrência"
                />
              </div>
            ) : null}
            {!canFinance ? (
              <div className="state-message error" role="alert">Sem permissão para ver o financeiro.</div>
            ) : filteredRecurrences.length === 0 ? (
              <EmptyState title="Nenhuma recorrência" description={recurrences.length ? 'Nenhum resultado para os filtros.' : 'Cadastre aluguel, assinaturas ou mensalidades periódicas.'} />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Tipo</th>
                      <th>Valor</th>
                      <th>Frequência</th>
                      <th>Próxima</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecurrences.map((item) => (
                      <tr key={String(item.id)}>
                        <td>{text(item.description)}</td>
                        <td>{presentationLabel(item.kind)}</td>
                        <td>{currency(item.amount)}</td>
                        <td>{presentationLabel(item.frequency)} × {text(item.interval, '1')}</td>
                        <td>{dateOnly(item.nextOccurrence)}</td>
                        <td>
                          <StatusBadge tone={item.active ? 'green' : 'gray'}>
                            {item.active ? 'Ativa' : 'Inativa'}
                          </StatusBadge>
                        </td>
                        <td className="table-actions">
                          <button
                            type="button"
                            className="button secondary"
                            disabled={recurrenceBusy === String(item.id) || !canFinanceCreate || !item.active}
                            onClick={() => void generateRecurrence(String(item.id))}
                          >
                            Gerar agora
                          </button>
                          <button
                            type="button"
                            className="button secondary"
                            disabled={recurrenceBusy === String(item.id) || !canFinanceCreate}
                            onClick={() => void toggleRecurrence(String(item.id), Boolean(item.active))}
                          >
                            {item.active ? 'Pausar' : 'Reativar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
      {tab === 'cashflow' && (
        <Panel title="Fluxo de caixa" description="Entradas, saídas e saldo do período selecionado.">
          {!canFinance ? (
            <div className="state-message error" role="alert">Sem permissão para visualizar o financeiro.</div>
          ) : (
            <>
              <div className="chip-row" role="group" aria-label="Período do fluxo">
                {([
                  ['7d', '7 dias'],
                  ['30d', '30 dias'],
                  ['90d', '90 dias'],
                  ['year', 'Ano'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`chip ${cashflowPeriod === id ? 'active' : ''}`}
                    onClick={() => setCashflowPeriod(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {loading ? <div className="state-message">Carregando…</div> : null}
              {!loading && !cashflow ? (
                <EmptyState title="Sem dados de fluxo" description="Não há lançamentos agregados para o período." />
              ) : null}
              {cashflow ? (
                <>
                  <section className="stats">
                    <MetricCard label="Entradas" value={currency(cashflow.inflow ?? 0)} meta={`${text(nested(cashflow, 'counts').inflows, '0')} lançamentos`} tone="green" />
                    <MetricCard label="Saídas" value={currency(cashflow.outflow ?? 0)} meta={`${text(nested(cashflow, 'counts').outflows, '0')} lançamentos`} tone="red" />
                    <MetricCard label="Saldo" value={currency(cashflow.net ?? 0)} meta={`${dateOnly(cashflow.from)} → ${dateOnly(cashflow.to)}`} />
                  </section>
                  <div className="dashboard-grid">
                    <Panel title="Entradas por forma" description="Pagamentos confirmados">
                      {list(cashflow.inflowByMethod).length === 0 ? (
                        <EmptyState title="Sem entradas" description="Nenhum recebimento no período." />
                      ) : (
                        <div className="billing-list">
                          {list(cashflow.inflowByMethod).map((row) => (
                            <div className="billing-row" key={String(row.method)}>
                              <div><strong>{paymentMethodLabel(row.method)}</strong><span>{currency(row.amount)}</span></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Panel>
                    <Panel title="Saídas por forma" description="Pagamentos de contas a pagar">
                      {list(cashflow.outflowByMethod).length === 0 ? (
                        <EmptyState title="Sem saídas" description="Nenhuma saída no período." />
                      ) : (
                        <div className="billing-list">
                          {list(cashflow.outflowByMethod).map((row) => (
                            <div className="billing-row" key={String(row.method)}>
                              <div><strong>{paymentMethodLabel(row.method)}</strong><span>{currency(row.amount)}</span></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Panel>
                  </div>
                  <Panel
                    title="Série diária"
                    description="Entradas, saídas e saldo acumulado por dia do período."
                  >
                    {list(cashflow.series).length === 0 ? (
                      <EmptyState title="Sem série" description="Nenhum dia no intervalo selecionado." />
                    ) : (
                      <div className="table-wrap cashflow-series-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Data</th>
                              <th>Entradas</th>
                              <th>Saídas</th>
                              <th>Saldo do dia</th>
                              <th>Saldo acumulado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {list(cashflow.series).map((row) => {
                              const dayNet = Number(row.net ?? 0);
                              const balance = Number(row.balance ?? 0);
                              const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(String(row.date ?? ''))
                                ? dateOnly(`${String(row.date)}T12:00:00`)
                                : dateOnly(row.date);
                              return (
                                <tr key={String(row.date)}>
                                  <td>{dateLabel}</td>
                                  <td>{currency(row.inflow ?? 0)}</td>
                                  <td>{currency(row.outflow ?? 0)}</td>
                                  <td style={{ color: dayNet < 0 ? 'var(--danger)' : dayNet > 0 ? 'var(--success)' : undefined }}>
                                    {currency(dayNet)}
                                  </td>
                                  <td style={{ color: balance < 0 ? 'var(--danger)' : undefined }}>
                                    {currency(balance)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Panel>
                </>
              ) : null}
            </>
          )}
        </Panel>
      )}
    </>
  );
}

function ChargeDetails({
  payment,
  busy,
  error,
  onSync,
  onClose,
}: {
  payment: RecordValue;
  busy: boolean;
  error: string;
  onSync: () => void;
  onClose: () => void;
}) {
  const data = nested(payment, 'providerData');
  const brCode = text(data.brCode);
  const qr = text(data.brCodeBase64);
  const barCode = text(data.barCode);
  const url = text(data.url);
  return (
    <div className="mutation-form">
      <div className="info-grid span-2">
        <div className="info-item"><small>Status</small><strong>{presentationLabel(payment.status)}</strong></div>
        <div className="info-item"><small>Método</small><strong>{presentationLabel(payment.method)}</strong></div>
        <div className="info-item"><small>Valor</small><strong>{currency(payment.amount)}</strong></div>
        <div className="info-item"><small>Cobrança</small><strong>{text(data.chargeId, text(payment.externalId, '—'))}</strong></div>
      </div>
      {qr ? (
        <div className="span-2" style={{ textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR Code PIX" style={{ width: 220, height: 220, margin: '0 auto' }} />
        </div>
      ) : null}
      {brCode ? (
        <label className="span-2">PIX copia e cola
          <textarea readOnly value={brCode} rows={3} />
          <button
            type="button"
            className="button small"
            onClick={() => void navigator.clipboard.writeText(brCode)}
          >
            Copiar código PIX
          </button>
        </label>
      ) : null}
      {barCode ? (
        <label className="span-2">Linha digitável
          <input readOnly value={barCode} />
        </label>
      ) : null}
      {url ? (
        <p className="span-2">
          <a href={url} target="_blank" rel="noreferrer">Abrir boleto para impressão</a>
        </p>
      ) : null}
      <p className="field-hint span-2">
        Pagamentos confirmados automaticamente pelo webhook transparent.completed. Use “Atualizar status” se o webhook atrasar.
      </p>
      {error ? <p className="form-error span-2" role="alert">{error}</p> : null}
      <div className="modal-footer span-2">
        <button type="button" className="button" onClick={onClose}>Fechar</button>
        {payment.status === 'PENDING' ? (
          <button type="button" className="button primary" disabled={busy} onClick={onSync}>
            {busy ? 'Consultando…' : 'Atualizar status'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
