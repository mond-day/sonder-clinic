'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { currency, dateOnly, list, presentationLabel, text, type RecordValue } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/ui';
import { Modal } from '@/components/modal';

type Props = {
  clinicId: string;
  clinics: Array<{ id: string; tradeName: string; status?: string }>;
  onClinicsChanged?: () => void;
};

export function ClinicsAdminPanel({ clinics, onClinicsChanged }: Pick<Props, 'clinics' | 'onClinicsChanged'>) {
  const [rows, setRows] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get<RecordValue[]>('/settings/clinics?includeInactive=true')
      .then((data) => setRows(list(data)))
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao listar clínicas.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function createClinic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFormError('');
    try {
      await api.post('/settings/clinics', {
        legalName: String(data.get('legalName') || '').trim(),
        tradeName: String(data.get('tradeName') || '').trim(),
        taxId: String(data.get('taxId') || '').trim() || undefined,
        email: String(data.get('email') || '').trim() || undefined,
        phone: String(data.get('phone') || '').trim() || undefined,
      });
      setOpen(false);
      load();
      onClinicsChanged?.();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível criar a clínica.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(row: RecordValue) {
    try {
      await api.patch(`/settings/clinics/${String(row.id)}`, {
        status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      });
      load();
      onClinicsChanged?.();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao atualizar clínica.');
    }
  }

  return (
    <div className="form-section" style={{ padding: '0 14px 14px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h3 style={{ margin: 0 }}>Clínicas da organização</h3>
        <button className="button small primary" type="button" onClick={() => setOpen(true)}>Nova clínica</button>
      </header>
      {error ? <p className="state-message error" role="alert">{error}</p> : null}
      {loading ? <div className="state-message">Carregando clínicas…</div> : null}
      {!loading && rows.length === 0 ? (
        <EmptyState title="Nenhuma clínica" description="Crie a primeira unidade administrativa." />
      ) : (
        <div className="settings-list">
          {rows.map((row) => (
            <div className="settings-row" key={String(row.id)}>
              <div>
                <strong>{text(row.tradeName)}</strong>
                <span>
                  {text(row.legalName)}
                  {row._count && typeof row._count === 'object' && 'units' in (row._count as object)
                    ? ` · ${text((row._count as RecordValue).units)} unidades`
                    : ''}
                </span>
              </div>
              <div className="row-actions">
                <StatusBadge tone={row.status === 'ACTIVE' ? 'green' : 'gray'}>
                  {presentationLabel(row.status)}
                </StatusBadge>
                <button className="button small" type="button" onClick={() => void toggleStatus(row)}>
                  {row.status === 'ACTIVE' ? 'Inativar' : 'Reativar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="muted-note">Contexto ativo: {clinics.length} clínica(s) no seletor. A última clínica ativa não pode ser inativada.</p>
      <Modal open={open} title="Nova clínica" description="Cadastro administrativo da unidade." onClose={() => setOpen(false)} size="small" confirmOnClose>
        <form className="mutation-form" onSubmit={createClinic}>
          <label className="span-2">Nome fantasia<input name="tradeName" minLength={2} required autoFocus /></label>
          <label className="span-2">Razão social<input name="legalName" minLength={2} required /></label>
          <label>CNPJ<input name="taxId" /></label>
          <label>Telefone<input name="phone" /></label>
          <label className="span-2">E-mail<input name="email" type="email" /></label>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Criar clínica'}</button>
        </form>
      </Modal>
    </div>
  );
}

export function PriceTablesAdminPanel({ clinicId, procedures }: { clinicId: string; procedures: RecordValue[] }) {
  const [tables, setTables] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [itemTableId, setItemTableId] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(() => {
    if (!clinicId) return;
    setLoading(true);
    setError('');
    api.get<RecordValue[]>(`/price-tables?clinicId=${clinicId}`)
      .then((data) => setTables(list(data)))
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao listar tabelas.'))
      .finally(() => setLoading(false));
  }, [clinicId]);

  useEffect(load, [load]);

  async function createTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFormError('');
    try {
      await api.post('/price-tables', {
        name: String(data.get('name') || '').trim(),
        type: String(data.get('type') || 'PRIVATE').trim(),
        clinicId,
        validFrom: String(data.get('validFrom') || ''),
        validUntil: String(data.get('validUntil') || '') || undefined,
      });
      setOpen(false);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível criar a tabela.');
    } finally {
      setBusy(false);
    }
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!itemTableId) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFormError('');
    try {
      await api.post(`/price-tables/${itemTableId}/items`, {
        procedureId: String(data.get('procedureId')),
        price: String(data.get('price')).replace(',', '.'),
        cost: String(data.get('cost') || '0').replace(',', '.'),
      });
      setItemTableId('');
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível adicionar o item.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: RecordValue) {
    try {
      await api.patch(`/price-tables/${String(row.id)}`, { active: !row.active });
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao atualizar tabela.');
    }
  }

  return (
    <div className="form-section" style={{ padding: '0 14px 14px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h3 style={{ margin: 0 }}>Tabelas de preço</h3>
        <button className="button small primary" type="button" onClick={() => setOpen(true)}>Nova tabela</button>
      </header>
      {error ? <p className="state-message error" role="alert">{error}</p> : null}
      {loading ? <div className="state-message">Carregando tabelas…</div> : null}
      {!loading && tables.length === 0 ? (
        <EmptyState title="Nenhuma tabela" description="Crie uma tabela para vincular preços aos procedimentos." />
      ) : (
        <div className="settings-list">
          {tables.map((row) => {
            const items = list(row.items);
            return (
              <div className="settings-row" key={String(row.id)}>
                <div>
                  <strong>{text(row.name)}</strong>
                  <span>
                    {presentationLabel(row.type)} · vigência {dateOnly(row.validFrom)}
                    {row.validUntil ? ` → ${dateOnly(row.validUntil)}` : ''} · {items.length} item(ns)
                    {items.slice(0, 2).map((item) => {
                      const procedure = item.procedure && typeof item.procedure === 'object' ? item.procedure as RecordValue : null;
                      return ` · ${text(procedure?.name ?? item.procedureId)} ${currency(item.price)}`;
                    }).join('')}
                  </span>
                </div>
                <div className="row-actions">
                  <StatusBadge tone={row.active ? 'green' : 'gray'}>{row.active ? 'Ativa' : 'Inativa'}</StatusBadge>
                  <button className="button small" type="button" onClick={() => setItemTableId(String(row.id))}>+ Preço</button>
                  <button className="button small" type="button" onClick={() => void toggleActive(row)}>
                    {row.active ? 'Inativar' : 'Ativar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Modal open={open} title="Nova tabela de preço" description="Vigência e escopo por clínica." onClose={() => setOpen(false)} size="small" confirmOnClose>
        <form className="mutation-form" onSubmit={createTable}>
          <label className="span-2">Nome<input name="name" minLength={2} required autoFocus /></label>
          <label>Tipo
            <select name="type" defaultValue="PRIVATE">
              <option value="PRIVATE">Particular</option>
              <option value="INSURANCE">Convênio</option>
              <option value="PROMOTIONAL">Promocional</option>
            </select>
          </label>
          <label>Válida de<input name="validFrom" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
          <label className="span-2">Válida até<input name="validUntil" type="date" /></label>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Criar tabela'}</button>
        </form>
      </Modal>
      <Modal open={Boolean(itemTableId)} title="Adicionar preço" description="Vincula procedimento à tabela." onClose={() => { setItemTableId(''); setFormError(''); }} size="small" confirmOnClose>
        <form className="mutation-form" onSubmit={addItem}>
          <label className="span-2">Procedimento
            <select name="procedureId" required>
              <option value="">Selecione</option>
              {procedures.map((item) => (
                <option key={String(item.id)} value={String(item.id)}>{text(item.name)} ({text(item.internalCode)})</option>
              ))}
            </select>
          </label>
          <label>Preço<input name="price" type="number" min="0" step="0.01" required /></label>
          <label>Custo<input name="cost" type="number" min="0" step="0.01" defaultValue="0" /></label>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar item'}</button>
        </form>
      </Modal>
    </div>
  );
}

export function FinanceCatalogAdminPanel() {
  const [categories, setCategories] = useState<RecordValue[]>([]);
  const [centers, setCenters] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<'category' | 'center' | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get<RecordValue[]>('/finance-categories').catch(() => [] as RecordValue[]),
      api.get<RecordValue[]>('/cost-centers').catch(() => [] as RecordValue[]),
    ])
      .then(([nextCategories, nextCenters]) => {
        setCategories(list(nextCategories));
        setCenters(list(nextCenters));
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar catálogo financeiro.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFormError('');
    try {
      await api.post('/finance-categories', {
        name: String(data.get('name') || '').trim(),
        kind: String(data.get('kind') || 'EXPENSE'),
      });
      setOpen(null);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível criar a categoria.');
    } finally {
      setBusy(false);
    }
  }

  async function createCenter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFormError('');
    try {
      await api.post('/cost-centers', {
        name: String(data.get('name') || '').trim(),
        code: String(data.get('code') || '').trim() || undefined,
      });
      setOpen(null);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível criar o centro de custo.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleCategory(row: RecordValue) {
    try {
      await api.patch(`/finance-categories/${String(row.id)}`, { active: !row.active });
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao atualizar categoria.');
    }
  }

  async function toggleCenter(row: RecordValue) {
    try {
      await api.patch(`/cost-centers/${String(row.id)}`, { active: !row.active });
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao atualizar centro de custo.');
    }
  }

  return (
    <div className="form-section" style={{ padding: '0 14px 14px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Categorias e centros de custo</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="button small" type="button" onClick={() => setOpen('category')}>Nova categoria</button>
          <button className="button small primary" type="button" onClick={() => setOpen('center')}>Novo centro</button>
        </div>
      </header>
      {error ? <p className="state-message error" role="alert">{error}</p> : null}
      {loading ? <div className="state-message">Carregando…</div> : null}
      <div className="settings-list">
        {categories.map((row) => (
          <div className="settings-row" key={String(row.id)}>
            <div>
              <strong>{text(row.name)}</strong>
              <span>Categoria · {presentationLabel(row.kind)}</span>
            </div>
            <div className="row-actions">
              <StatusBadge tone={row.active ? 'green' : 'gray'}>{row.active ? 'Ativa' : 'Inativa'}</StatusBadge>
              <button className="button small" type="button" onClick={() => void toggleCategory(row)}>
                {row.active ? 'Inativar' : 'Ativar'}
              </button>
            </div>
          </div>
        ))}
        {centers.map((row) => (
          <div className="settings-row" key={String(row.id)}>
            <div>
              <strong>{text(row.name)}</strong>
              <span>Centro de custo{row.code ? ` · ${text(row.code)}` : ''}</span>
            </div>
            <div className="row-actions">
              <StatusBadge tone={row.active ? 'green' : 'gray'}>{row.active ? 'Ativo' : 'Inativo'}</StatusBadge>
              <button className="button small" type="button" onClick={() => void toggleCenter(row)}>
                {row.active ? 'Inativar' : 'Ativar'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {!loading && categories.length === 0 && centers.length === 0 ? (
        <EmptyState title="Catálogo vazio" description="Categorias alimentam Payables (A32). Expense legado permanece só em seed/relatório." />
      ) : null}
      <Modal open={open === 'category'} title="Nova categoria financeira" onClose={() => setOpen(null)} size="small" confirmOnClose>
        <form className="mutation-form" onSubmit={createCategory}>
          <label className="span-2">Nome<input name="name" minLength={2} required autoFocus /></label>
          <label className="span-2">Tipo
            <select name="kind" defaultValue="EXPENSE">
              <option value="EXPENSE">Despesa</option>
              <option value="INCOME">Receita</option>
            </select>
          </label>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Criar'}</button>
        </form>
      </Modal>
      <Modal open={open === 'center'} title="Novo centro de custo" onClose={() => setOpen(null)} size="small" confirmOnClose>
        <form className="mutation-form" onSubmit={createCenter}>
          <label className="span-2">Nome<input name="name" minLength={2} required autoFocus /></label>
          <label className="span-2">Código<input name="code" /></label>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Criar'}</button>
        </form>
      </Modal>
    </div>
  );
}

export function LaboratoriesAdminPanel({ clinicId }: { clinicId: string }) {
  const [rows, setRows] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(() => {
    if (!clinicId) return;
    setLoading(true);
    setError('');
    api.get<RecordValue[]>(`/laboratories?clinicId=${clinicId}`)
      .then((data) => setRows(list(data)))
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao listar laboratórios.'))
      .finally(() => setLoading(false));
  }, [clinicId]);

  useEffect(load, [load]);

  async function createLab(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFormError('');
    try {
      await api.post('/laboratories', {
        clinicId,
        name: String(data.get('name') || '').trim(),
        phone: String(data.get('phone') || '').trim() || undefined,
        email: String(data.get('email') || '').trim() || undefined,
        defaultLeadDays: data.get('defaultLeadDays') ? Number(data.get('defaultLeadDays')) : undefined,
        notes: String(data.get('notes') || '').trim() || undefined,
      });
      setOpen(false);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível criar o laboratório.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(row: RecordValue) {
    try {
      await api.patch(`/laboratories/${String(row.id)}`, {
        status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      });
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao atualizar laboratório.');
    }
  }

  return (
    <div className="form-section" style={{ padding: '0 14px 14px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h3 style={{ margin: 0 }}>Laboratórios parceiros</h3>
        <button className="button small primary" type="button" onClick={() => setOpen(true)}>Novo laboratório</button>
      </header>
      {error ? <p className="state-message error" role="alert">{error}</p> : null}
      {loading ? <div className="state-message">Carregando…</div> : null}
      {!loading && rows.length === 0 ? (
        <EmptyState title="Nenhum laboratório" description="Cadastre parceiros para seleção por ID nos casos." />
      ) : (
        <div className="settings-list">
          {rows.map((row) => (
            <div className="settings-row" key={String(row.id)}>
              <div>
                <strong>{text(row.name)}</strong>
                <span>
                  {text(row.phone, 'sem telefone')}
                  {row.email ? ` · ${text(row.email)}` : ''}
                  {row.defaultLeadDays ? ` · lead ${text(row.defaultLeadDays)}d` : ''}
                </span>
              </div>
              <div className="row-actions">
                <StatusBadge tone={row.status === 'ACTIVE' ? 'green' : 'gray'}>{presentationLabel(row.status)}</StatusBadge>
                <button className="button small" type="button" onClick={() => void toggleStatus(row)}>
                  {row.status === 'ACTIVE' ? 'Inativar' : 'Reativar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={open} title="Novo laboratório" onClose={() => setOpen(false)} size="small" confirmOnClose>
        <form className="mutation-form" onSubmit={createLab}>
          <label className="span-2">Nome<input name="name" minLength={2} required autoFocus /></label>
          <label>Telefone<input name="phone" /></label>
          <label>Lead (dias)<input name="defaultLeadDays" type="number" min={0} /></label>
          <label className="span-2">E-mail<input name="email" type="email" /></label>
          <label className="span-2">Notas<textarea name="notes" rows={2} /></label>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Criar'}</button>
        </form>
      </Modal>
    </div>
  );
}

export function OutboxDeadLetterPanel() {
  const [rows, setRows] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get<RecordValue[]>('/settings/outbox/dead-letter?limit=50')
      .then((data) => setRows(list(data)))
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao listar dead-letters (requer organization.manage ou audit.view).'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function retry(id: string) {
    setBusyId(id);
    try {
      await api.post(`/settings/outbox/dead-letter/${id}/retry`);
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao reprocessar.');
    } finally {
      setBusyId('');
    }
  }

  async function discard(id: string) {
    if (!window.confirm('Descartar permanentemente este evento da fila de falhas?')) return;
    setBusyId(id);
    try {
      await api.post(`/settings/outbox/dead-letter/${id}/discard`);
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao descartar.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="form-section" style={{ padding: '0 14px 14px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Fila de falhas assíncronas</h3>
          <p className="muted-note" style={{ margin: '6px 0 0' }}>
            Eventos do outbox que esgotaram tentativas de processamento (integrações, mensagens, jobs em background).
            Não se trata de retornos clínicos vencidos — é a fila técnica de reprocessamento.
          </p>
        </div>
        <button className="button small" type="button" onClick={load} disabled={loading}>Atualizar</button>
      </header>
      {error ? <p className="state-message error" role="alert">{error}</p> : null}
      {loading ? <div className="state-message">Carregando…</div> : null}
      {!loading && rows.length === 0 ? (
        <EmptyState
          title="Nenhuma falha pendente"
          description="Quando um job assíncrono falhar após várias tentativas, ele aparece aqui para reprocessar ou descartar."
        />
      ) : (
        <div className="settings-list">
          {rows.map((row) => (
            <div className="settings-row" key={String(row.id)}>
              <div>
                <strong>{text(row.eventType)}</strong>
                <span>
                  {text(row.attempts)} tentativa(s) · falhou em {dateOnly(row.deadLetterAt)}
                  {row.lastError ? ` · ${text(row.lastError).slice(0, 120)}` : ''}
                </span>
              </div>
              <div className="row-actions">
                <button className="button small primary" type="button" disabled={busyId === String(row.id)} onClick={() => void retry(String(row.id))}>
                  Reprocessar
                </button>
                <button className="button small" type="button" disabled={busyId === String(row.id)} onClick={() => void discard(String(row.id))}>
                  Descartar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CommunicationTemplatesPanel() {
  const [templates, setTemplates] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get<RecordValue[]>('/communication/templates')
      .then((data) => setTemplates(list(data)))
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao listar templates.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFormError('');
    try {
      await api.post('/communication/templates', {
        name: String(data.get('name') || '').trim(),
        category: String(data.get('category') || 'REMINDER'),
        content: String(data.get('content') || '').trim(),
        requiresConsent: data.get('requiresConsent') === 'on',
      });
      setOpen(false);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível criar o template.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: RecordValue) {
    try {
      await api.patch(`/communication/templates/${String(row.id)}`, { active: !row.active });
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao atualizar template.');
    }
  }

  return (
    <div className="form-section" style={{ padding: '0 14px 14px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h3 style={{ margin: 0 }}>Templates de mensagem</h3>
        <button className="button small primary" type="button" onClick={() => setOpen(true)}>Novo template</button>
      </header>
      {error ? <p className="state-message error" role="alert">{error}</p> : null}
      {loading ? <div className="state-message">Carregando…</div> : null}
      {!loading && templates.length === 0 ? (
        <EmptyState title="Nenhum template" description="Cadastre textos com variáveis {{patientName}}, {{date}}, {{clinicName}}." />
      ) : (
        <div className="settings-list">
          {templates.map((row) => (
            <div className="settings-row" key={String(row.id)}>
              <div>
                <strong>{text(row.name)}</strong>
                <span>{presentationLabel(row.category)} · {text(row.content).slice(0, 80)}{text(row.content).length > 80 ? '…' : ''}</span>
              </div>
              <div className="row-actions">
                <StatusBadge tone={row.active ? 'green' : 'gray'}>{row.active ? 'Ativo' : 'Inativo'}</StatusBadge>
                <StatusBadge tone={row.requiresConsent ? 'amber' : 'blue'}>
                  {row.requiresConsent ? 'Exige autorização' : 'Sem autorização'}
                </StatusBadge>
                <button className="button small" type="button" onClick={() => void toggleActive(row)}>
                  {row.active ? 'Inativar' : 'Ativar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="muted-note">E-mail e WhatsApp usam os canais configurados abaixo. Sem canal ativo, os envios ficam pendentes.</p>
      <Modal open={open} title="Novo template" description="Variáveis: {{patientName}}, {{date}}, {{clinicName}}, {{professionalName}}." onClose={() => setOpen(false)} confirmOnClose>
        <form className="mutation-form" onSubmit={createTemplate}>
          <label className="span-2">Nome<input name="name" minLength={2} required autoFocus /></label>
          <label>Categoria
            <select name="category" defaultValue="REMINDER">
              <option value="REMINDER">Lembrete</option>
              <option value="CONFIRMATION">Confirmação</option>
              <option value="RETURN">Retorno</option>
              <option value="MARKETING">Marketing</option>
              <option value="OTHER">Outro</option>
            </select>
          </label>
          <label>
            Exige consentimento
            <input name="requiresConsent" type="checkbox" defaultChecked />
          </label>
          <label className="span-2">Conteúdo<textarea name="content" rows={4} required minLength={5} placeholder="Olá {{patientName}}, lembrete da consulta em {{date}}." /></label>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Criar template'}</button>
        </form>
      </Modal>
    </div>
  );
}

export function MessagingChannelsPanel({ clinicId }: { clinicId?: string }) {
  const [channels, setChannels] = useState<RecordValue[]>([]);
  const [templates, setTemplates] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [sendResult, setSendResult] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get<RecordValue[]>('/communication/channels?includeInactive=true'),
      api.get<RecordValue[]>('/communication/templates').catch(() => [] as RecordValue[]),
    ])
      .then(([nextChannels, nextTemplates]) => {
        setChannels(list(nextChannels));
        setTemplates(list(nextTemplates));
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao listar canais.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function createChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFormError('');
    try {
      await api.post('/communication/channels', {
        clinicId: clinicId || undefined,
        type: String(data.get('type') || 'EMAIL'),
        displayName: String(data.get('displayName') || '').trim(),
      });
      setOpen(false);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível criar o canal.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleChannel(row: RecordValue) {
    try {
      await api.patch(`/communication/channels/${String(row.id)}`, {
        status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      });
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao atualizar canal.');
    }
  }

  async function sendManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFormError('');
    setSendResult('');
    try {
      const result = await api.post<RecordValue>('/communication/send', {
        channelId: String(data.get('channelId') || ''),
        templateId: String(data.get('templateId') || '') || undefined,
        recipient: String(data.get('recipient') || '').trim() || undefined,
        content: String(data.get('content') || '').trim() || undefined,
        category: String(data.get('category') || 'OTHER'),
      });
      setSendResult(
        result.status === 'SENT'
          ? 'Mensagem enviada por e-mail.'
          : `Envio ${presentationLabel(result.status)}${result.error ? `: ${text(result.error)}` : ''}`,
      );
      if (result.status === 'SENT') setSendOpen(false);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Falha no envio manual.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-section" style={{ padding: '0 14px 14px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Canais de mensagem</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="button small" type="button" onClick={() => { setSendOpen(true); setSendResult(''); setFormError(''); }}>
            Envio manual
          </button>
          <button className="button small primary" type="button" onClick={() => setOpen(true)}>Novo canal</button>
        </div>
      </header>
      {error ? <p className="state-message error" role="alert">{error}</p> : null}
      {loading ? <div className="state-message">Carregando…</div> : null}
      {!loading && channels.length === 0 ? (
        <EmptyState title="Nenhum canal" description="Crie um canal de e-mail ou WhatsApp para começar a enviar mensagens." />
      ) : (
        <div className="settings-list">
          {channels.map((row) => (
            <div className="settings-row" key={String(row.id)}>
              <div>
                <strong>{text(row.displayName)}</strong>
                <span>{presentationLabel(row.type)}</span>
              </div>
              <div className="row-actions">
                <StatusBadge tone={row.status === 'ACTIVE' ? 'green' : 'gray'}>
                  {presentationLabel(row.status)}
                </StatusBadge>
                <button className="button small" type="button" onClick={() => void toggleChannel(row)}>
                  {row.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="muted-note">
        E-mail e WhatsApp precisam estar configurados pelo administrador. SMS ainda não está disponível nesta versão.
      </p>
      <Modal open={open} title="Novo canal" description="Canal operacional para envio manual e futuras automações." onClose={() => setOpen(false)} confirmOnClose>
        <form className="mutation-form" onSubmit={createChannel}>
          <label className="span-2">Nome de exibição<input name="displayName" minLength={2} required autoFocus /></label>
          <label className="span-2">Tipo
            <select name="type" defaultValue="EMAIL">
              <option value="EMAIL">E-mail</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="SMS">SMS (em breve)</option>
            </select>
          </label>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Criar canal'}</button>
        </form>
      </Modal>
      <Modal open={sendOpen} title="Envio manual" description="Se houver paciente vinculado e o modelo exigir autorização, a preferência de comunicação será respeitada. Neste envio o destino pode ser informado livremente." onClose={() => setSendOpen(false)} confirmOnClose>
        <form className="mutation-form" onSubmit={sendManual}>
          <label className="span-2">Canal
            <select name="channelId" required defaultValue="">
              <option value="">Selecione</option>
              {channels.filter((c) => c.status === 'ACTIVE').map((c) => (
                <option key={String(c.id)} value={String(c.id)}>{text(c.displayName)} · {presentationLabel(c.type)}</option>
              ))}
            </select>
          </label>
          <label className="span-2">Template (opcional)
            <select name="templateId" defaultValue="">
              <option value="">Texto livre</option>
              {templates.map((t) => (
                <option key={String(t.id)} value={String(t.id)}>{text(t.name)}</option>
              ))}
            </select>
          </label>
          <label className="span-2">Destinatário<input name="recipient" placeholder="email@ou.telefone" required /></label>
          <label className="span-2">Conteúdo (se sem template)<textarea name="content" rows={3} placeholder="Mensagem…" /></label>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          {sendResult ? <p className="form-success span-2" role="status">{sendResult}</p> : null}
          <button className="button primary" disabled={busy}>{busy ? 'Enviando…' : 'Enviar'}</button>
        </form>
      </Modal>
    </div>
  );
}

export function OdontogramConditionsAdminPanel() {
  const [rows, setRows] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get<RecordValue[]>('/odontogram-conditions?includeInactive=true')
      .then((data) => setRows(list(data)))
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao listar condições.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function createCondition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFormError('');
    try {
      await api.post('/odontogram-conditions', {
        code: String(data.get('code') || '').trim().toUpperCase(),
        name: String(data.get('name') || '').trim(),
        color: String(data.get('color') || '#159a96'),
      });
      setOpen(false);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível criar a condição.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: RecordValue) {
    try {
      await api.patch(`/odontogram-conditions/${String(row.id)}`, { active: !row.active });
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao atualizar condição.');
    }
  }

  return (
    <div className="form-section" style={{ padding: '0 14px 14px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h3 style={{ margin: 0 }}>Condições do odontograma</h3>
        <button className="button small primary" type="button" onClick={() => setOpen(true)}>Nova condição</button>
      </header>
      {error ? <p className="state-message error" role="alert">{error}</p> : null}
      {loading ? <div className="state-message">Carregando…</div> : null}
      {!loading && rows.length === 0 ? (
        <EmptyState title="Nenhuma condição" description="Cadastre códigos usados no odontograma 2D." />
      ) : (
        <div className="settings-list">
          {rows.map((row) => (
            <div className="settings-row" key={String(row.id)}>
              <div>
                <strong>
                  <span style={{ color: text(row.color), marginRight: 6 }} aria-hidden>●</span>
                  {text(row.code)} — {text(row.name)}
                </strong>
                <span>{text(row.color)}</span>
              </div>
              <div className="row-actions">
                <StatusBadge tone={row.active ? 'green' : 'gray'}>{row.active ? 'Ativa' : 'Inativa'}</StatusBadge>
                <button className="button small" type="button" onClick={() => void toggleActive(row)}>
                  {row.active ? 'Inativar' : 'Ativar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={open} title="Nova condição odontológica" onClose={() => setOpen(false)} size="small" confirmOnClose>
        <form className="mutation-form" onSubmit={createCondition}>
          <label>Código<input name="code" minLength={1} maxLength={20} required autoFocus placeholder="CARIE" /></label>
          <label>Cor<input name="color" type="color" defaultValue="#c45c26" required /></label>
          <label className="span-2">Nome<input name="name" minLength={2} required /></label>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Criar'}</button>
        </form>
      </Modal>
    </div>
  );
}

type CatalogRow = RecordValue;

function CatalogList({
  title,
  description,
  createLabel,
  rows,
  loading,
  error,
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
  onCreate,
  onEdit,
  renderSecondary,
}: {
  title: string;
  description: string;
  createLabel: string;
  rows: CatalogRow[];
  loading: boolean;
  error: string;
  search: string;
  onSearch: (value: string) => void;
  statusFilter: 'all' | 'active' | 'inactive';
  onStatusFilter: (value: 'all' | 'active' | 'inactive') => void;
  onCreate: () => void;
  onEdit: (row: CatalogRow) => void;
  renderSecondary: (row: CatalogRow) => string;
}) {
  const filtered = rows.filter((row) => {
    if (statusFilter === 'active' && !row.active) return false;
    if (statusFilter === 'inactive' && row.active) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return String(row.name ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="form-section" style={{ padding: '0 14px 14px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <p className="muted-note" style={{ margin: '4px 0 0' }}>{description}</p>
        </div>
        <button className="button small primary" type="button" onClick={onCreate}>{createLabel}</button>
      </header>
      <div className="catalog-search" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input placeholder="Buscar…" value={search} onChange={(e) => onSearch(e.target.value)} style={{ flex: 1 }} />
        <select value={statusFilter} onChange={(e) => onStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}>
          <option value="all">Todos os status</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
      </div>
      {error ? <p className="state-message error" role="alert">{error}</p> : null}
      {loading ? <div className="state-message">Carregando…</div> : null}
      {!loading && filtered.length === 0 ? (
        <EmptyState title="Nenhum item" description="Cadastre o primeiro item desta área." />
      ) : (
        <div className="settings-list">
          {filtered.map((row) => (
            <div className="settings-row" key={String(row.id)}>
              <div>
                <strong>{text(row.name)}</strong>
                <span>{renderSecondary(row)}</span>
              </div>
              <div className="row-actions">
                <StatusBadge tone={row.active ? 'green' : 'gray'}>{row.active ? 'Ativo' : 'Inativo'}</StatusBadge>
                <button className="button small" type="button" onClick={() => onEdit(row)}>Editar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MedicationCatalogPanel() {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get<CatalogRow[]>(`/medication-catalog?includeInactive=true&q=${encodeURIComponent(search)}`)
      .then((data) => setRows(list(data)))
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar medicamentos.'))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { const t = window.setTimeout(load, 250); return () => window.clearTimeout(t); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFormError('');
    const body = {
      name: String(data.get('name') || '').trim(),
      activeIngredient: String(data.get('activeIngredient') || '').trim() || undefined,
      concentration: String(data.get('concentration') || '').trim() || undefined,
      pharmaceuticalForm: String(data.get('pharmaceuticalForm') || '').trim() || undefined,
      defaultRoute: String(data.get('defaultRoute') || '').trim() || undefined,
      notes: String(data.get('notes') || '').trim() || undefined,
      active: data.get('active') === 'true',
    };
    try {
      if (editing) await api.patch(`/medication-catalog/${String(editing.id)}`, body);
      else await api.post('/medication-catalog', body);
      setOpen(false);
      setEditing(null);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <CatalogList
        title="Medicamentos"
        description="Catálogo para agilizar prescrições. A posologia deve ser confirmada pelo profissional."
        createLabel="+ Novo medicamento"
        rows={rows}
        loading={loading}
        error={error}
        search={search}
        onSearch={setSearch}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        onCreate={() => { setEditing(null); setOpen(true); }}
        onEdit={(row) => { setEditing(row); setOpen(true); }}
        renderSecondary={(row) => [row.concentration, row.pharmaceuticalForm, row.defaultRoute ? `via ${row.defaultRoute}` : ''].filter(Boolean).join(' · ') || '—'}
      />
      <Modal
        open={open}
        title={editing ? 'Editar medicamento' : 'Novo medicamento'}
        description="Cadastre identificação. Dose e posologia são confirmadas na prescrição."
        onClose={() => { setOpen(false); setEditing(null); }}
        confirmOnClose
      >
        <form className="mutation-form" onSubmit={(e) => void submit(e)}>
          <label className="span-2">Nome / princípio ativo<input name="name" required defaultValue={String(editing?.name ?? '')} /></label>
          <label>Concentração<input name="concentration" defaultValue={String(editing?.concentration ?? '')} placeholder="500 mg" /></label>
          <label>Forma farmacêutica<input name="pharmaceuticalForm" defaultValue={String(editing?.pharmaceuticalForm ?? '')} placeholder="Cápsula" /></label>
          <label>Via usual<input name="defaultRoute" defaultValue={String(editing?.defaultRoute ?? '')} placeholder="Oral" /></label>
          <label>Status
            <select name="active" defaultValue={editing?.active === false ? 'false' : 'true'}>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </label>
          <label className="span-2">Observação interna<textarea name="notes" defaultValue={String(editing?.notes ?? '')} rows={2} /></label>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </form>
      </Modal>
    </>
  );
}

export function ExamCatalogPanel() {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get<CatalogRow[]>(`/exam-catalog?includeInactive=true&q=${encodeURIComponent(search)}`)
      .then((data) => setRows(list(data)))
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar exames.'))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { const t = window.setTimeout(load, 250); return () => window.clearTimeout(t); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFormError('');
    const body = {
      name: String(data.get('name') || '').trim(),
      category: String(data.get('category') || 'IMAGING'),
      lateralityBehavior: String(data.get('lateralityBehavior') || 'OPTIONAL'),
      defaultInstructions: String(data.get('defaultInstructions') || '').trim() || undefined,
      active: data.get('active') === 'true',
    };
    try {
      if (editing) await api.patch(`/exam-catalog/${String(editing.id)}`, body);
      else await api.post('/exam-catalog', body);
      setOpen(false);
      setEditing(null);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  const categoryLabel = (value: unknown) => {
    const map: Record<string, string> = { IMAGING: 'Imagem', LAB: 'Laboratorial', PHOTO: 'Fotografia', OTHER: 'Outro' };
    return map[String(value)] ?? text(value);
  };

  return (
    <>
      <CatalogList
        title="Tipos de exame"
        description="Catálogo editável usado nas solicitações de exame."
        createLabel="+ Novo tipo de exame"
        rows={rows}
        loading={loading}
        error={error}
        search={search}
        onSearch={setSearch}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        onCreate={() => { setEditing(null); setOpen(true); }}
        onEdit={(row) => { setEditing(row); setOpen(true); }}
        renderSecondary={(row) => `${categoryLabel(row.category)} · ${presentationLabel(row.lateralityBehavior ?? 'OPTIONAL')}`}
      />
      <Modal
        open={open}
        title={editing ? 'Editar tipo de exame' : 'Novo tipo de exame'}
        description="O catálogo aparece na busca ao criar uma solicitação."
        onClose={() => { setOpen(false); setEditing(null); }}
        confirmOnClose
      >
        <form className="mutation-form" onSubmit={(e) => void submit(e)}>
          <label className="span-2">Nome<input name="name" required defaultValue={String(editing?.name ?? '')} /></label>
          <label>Categoria
            <select name="category" defaultValue={String(editing?.category ?? 'IMAGING')}>
              <option value="IMAGING">Imagem</option>
              <option value="LAB">Laboratorial</option>
              <option value="PHOTO">Fotografia</option>
              <option value="OTHER">Outro</option>
            </select>
          </label>
          <label>Região / lateralidade
            <select name="lateralityBehavior" defaultValue={String(editing?.lateralityBehavior ?? 'OPTIONAL')}>
              <option value="OPTIONAL">Opcional</option>
              <option value="REQUIRED">Obrigatória</option>
              <option value="NOT_APPLICABLE">Não se aplica</option>
            </select>
          </label>
          <label className="span-2">Orientação padrão<textarea name="defaultInstructions" defaultValue={String(editing?.defaultInstructions ?? '')} rows={2} /></label>
          <label>Status
            <select name="active" defaultValue={editing?.active === false ? 'false' : 'true'}>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </label>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </form>
      </Modal>
    </>
  );
}
