'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { initials, list, presentationLabel, text, type RecordValue } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/ui';
import { Modal } from '@/components/modal';
import { useSelection } from '@/components/selection-provider';

type ProfessionalRow = RecordValue & {
  id: string;
  name: string;
  croNumber?: string | null;
  croState?: string | null;
  professionalType?: string | null;
  status?: string;
  user?: { id?: string; email?: string; name?: string };
  clinicLinks?: Array<{ clinicId?: string; clinic?: { id?: string; tradeName?: string } }>;
};

const PROFESSIONAL_TYPES = [
  { value: 'DENTIST', label: 'Cirurgião-dentista' },
  { value: 'ASSISTANT', label: 'Auxiliar / ASB' },
  { value: 'HYGIENIST', label: 'Higienista / TSB' },
  { value: 'OTHER', label: 'Outro' },
];

export function ProfessionalsPanel() {
  const { clinicId, clinics, refresh: refreshSelection } = useSelection();
  const [rows, setRows] = useState<ProfessionalRow[]>([]);
  const [users, setUsers] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<ProfessionalRow | null>(null);
  const [scopeClinicIds, setScopeClinicIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [professionalsRaw, usersRaw] = await Promise.all([
        api.get<ProfessionalRow[]>('/professionals'),
        api.get<RecordValue[]>('/users').catch(() => []),
      ]);
      setRows(list(professionalsRaw) as ProfessionalRow[]);
      setUsers(list(usersRaw));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar profissionais.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const usersWithoutProfessional = useMemo(() => {
    const linked = new Set(rows.map((row) => String(row.user?.id ?? row.userId ?? '')));
    return users.filter((user) => !linked.has(String(user.id)));
  }, [rows, users]);

  function openCreate() {
    setEditing(null);
    setScopeClinicIds(clinicId ? [clinicId] : []);
    setModal('create');
  }

  function openEdit(row: ProfessionalRow) {
    setEditing(row);
    setScopeClinicIds(
      list(row.clinicLinks).map((link) => {
        const clinic = link.clinic && typeof link.clinic === 'object' ? link.clinic as RecordValue : null;
        return String(link.clinicId ?? clinic?.id ?? '');
      }).filter(Boolean),
    );
    setModal('edit');
  }

  async function submitUpsert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const payload = {
        userId: String(data.get('userId') || editing?.user?.id || ''),
        name: String(data.get('name') || '').trim() || undefined,
        croNumber: String(data.get('croNumber') || '').trim() || undefined,
        croState: String(data.get('croState') || '').trim().toUpperCase() || undefined,
        professionalType: String(data.get('professionalType') || 'DENTIST'),
        status: String(data.get('status') || 'ACTIVE') as 'ACTIVE' | 'INACTIVE',
      };
      let professionalId = editing?.id;
      if (editing) {
        await api.patch(`/professionals/${editing.id}`, {
          name: payload.name,
          croNumber: payload.croNumber ?? null,
          croState: payload.croState ?? null,
          professionalType: payload.professionalType,
          status: payload.status,
        });
      } else {
        if (!payload.userId) throw new ApiError('Selecione um usuário.', 400);
        const created = await api.post<ProfessionalRow>('/professionals', payload);
        professionalId = String(created.id);
      }
      if (professionalId && scopeClinicIds.length) {
        await api.put(`/professionals/${professionalId}/scope`, { clinicIds: scopeClinicIds });
      }
      setModal(null);
      await load();
      await refreshSelection();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao salvar profissional.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-section" style={{ padding: '0 14px 14px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Profissionais</h3>
          <p className="muted-note" style={{ margin: '6px 0 0' }}>
            Vincule usuário, CRO, tipo e escopo de clínicas. A agenda usa este cadastro.
          </p>
        </div>
        <button className="button small primary" type="button" onClick={openCreate}>
          <Plus size={14} /> Novo profissional
        </button>
      </header>
      {error ? <p className="state-message error" role="alert">{error}</p> : null}
      {loading ? <div className="state-message">Carregando…</div> : null}
      {!loading && rows.length === 0 ? (
        <EmptyState title="Nenhum profissional" description="Crie um vínculo a partir de um usuário da organização." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Profissional</th>
                <th>Usuário</th>
                <th>CRO</th>
                <th>Tipo</th>
                <th>Clínicas</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)}>
                  <td>
                    <div className="person-cell">
                      <div className="avatar">{initials(text(row.name))}</div>
                      <div><strong>{text(row.name)}</strong></div>
                    </div>
                  </td>
                  <td>{text(row.user?.email, '—')}</td>
                  <td>{row.croNumber ? `${text(row.croNumber)}/${text(row.croState, '—')}` : '—'}</td>
                  <td>{PROFESSIONAL_TYPES.find((item) => item.value === row.professionalType)?.label ?? presentationLabel(row.professionalType)}</td>
                  <td>
                    {list(row.clinicLinks).map((link) => {
                      const clinic = link.clinic && typeof link.clinic === 'object' ? link.clinic as RecordValue : null;
                      return text(clinic?.tradeName);
                    }).filter(Boolean).join(', ') || '—'}
                  </td>
                  <td>
                    <StatusBadge tone={row.status === 'ACTIVE' ? 'green' : 'gray'}>
                      {presentationLabel(row.status)}
                    </StatusBadge>
                  </td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="icon-button"
                      title="Editar profissional"
                      aria-label={`Editar ${text(row.name)}`}
                      onClick={() => openEdit(row)}
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modal !== null}
        title={editing ? 'Editar profissional' : 'Novo profissional'}
        description="Profissional vinculado a um usuário da organização."
        onClose={() => setModal(null)}
        size="medium"
      >
        <form className="mutation-form" onSubmit={(event) => void submitUpsert(event)}>
          {!editing ? (
            <label className="span-2">Usuário
              <select name="userId" required defaultValue="">
                <option value="" disabled>Selecione…</option>
                {usersWithoutProfessional.map((user) => (
                  <option key={String(user.id)} value={String(user.id)}>
                    {text(user.name)} · {text(user.email)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="muted-note span-2">Usuário: {text(editing.user?.email, text(editing.user?.name))}</p>
          )}
          <label>Nome profissional<input name="name" defaultValue={text(editing?.name, '')} placeholder="Como aparece na agenda" /></label>
          <label>Tipo
            <select name="professionalType" defaultValue={String(editing?.professionalType ?? 'DENTIST')}>
              {PROFESSIONAL_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label>CRO<input name="croNumber" defaultValue={text(editing?.croNumber, '')} /></label>
          <label>UF CRO<input name="croState" maxLength={2} defaultValue={text(editing?.croState, '')} placeholder="SP" /></label>
          <label>Status
            <select name="status" defaultValue={String(editing?.status ?? 'ACTIVE')}>
              <option value="ACTIVE">Ativo</option>
              <option value="INACTIVE">Inativo</option>
            </select>
          </label>
          <fieldset className="span-2">
            <legend>Escopo de clínicas</legend>
            <div className="checkbox-grid">
              {clinics.map((clinic) => (
                <label key={clinic.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={scopeClinicIds.includes(clinic.id)}
                    onChange={(event) => {
                      setScopeClinicIds((current) => (
                        event.target.checked
                          ? [...current, clinic.id]
                          : current.filter((id) => id !== clinic.id)
                      ));
                    }}
                  />
                  <span>{clinic.tradeName}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {error ? <p className="form-error span-2" role="alert">{error}</p> : null}
          <button className="button primary" disabled={busy} type="submit">
            {busy ? 'Salvando…' : 'Salvar profissional'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
