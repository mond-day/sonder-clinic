'use client';

import { FormEvent, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { list, presentationLabel, text, type RecordValue } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/ui';
import { Modal } from '@/components/modal';

export function PatientCarePanel({
  patientId,
  patient,
  onChanged,
}: {
  patientId: string;
  patient: RecordValue;
  onChanged: () => void;
}) {
  const guardians = useMemo(() => list(patient.guardians), [patient.guardians]);
  const alerts = useMemo(() => list(patient.alerts), [patient.alerts]);
  const preferences = useMemo(() => list(patient.communicationPreferences), [patient.communicationPreferences]);
  const [prefs, setPrefs] = useState<RecordValue[]>([]);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [modal, setModal] = useState<'guardian' | 'alert' | 'pref' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function ensurePrefs() {
    if (prefsLoaded) return;
    try {
      const rows = await api.get<RecordValue[]>(`/patients/${patientId}/communication-preferences`);
      setPrefs(list(rows));
      setPrefsLoaded(true);
    } catch {
      setPrefs([]);
      setPrefsLoaded(true);
    }
  }

  async function createGuardian(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api.post(`/patients/${patientId}/guardians`, {
        name: String(data.get('name') || '').trim(),
        phone: String(data.get('phone') || '').trim(),
        relationship: String(data.get('relationship') || '').trim(),
        email: String(data.get('email') || '').trim() || undefined,
        isPrimary: data.get('isPrimary') === 'on',
        canSign: data.get('canSign') === 'on',
      });
      setModal(null);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao salvar responsável.');
    } finally {
      setBusy(false);
    }
  }

  async function unlinkGuardian(guardianId: string) {
    if (!window.confirm('Desvincular este responsável?')) return;
    try {
      await api.delete(`/patients/${patientId}/guardians/${guardianId}`);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao desvincular.');
    }
  }

  async function createAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api.post(`/patients/${patientId}/alerts`, {
        type: String(data.get('type') || '').trim(),
        message: String(data.get('message') || '').trim(),
        severity: String(data.get('severity') || 'WARNING'),
      });
      setModal(null);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao criar alerta.');
    } finally {
      setBusy(false);
    }
  }

  async function deactivateAlert(alertId: string) {
    try {
      await api.patch(`/patients/${patientId}/alerts/${alertId}`, { active: false });
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao inativar alerta.');
    }
  }

  async function savePref(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api.put(`/patients/${patientId}/communication-preferences`, {
        channel: String(data.get('channel') || 'WHATSAPP'),
        category: String(data.get('category') || 'REMINDER'),
        optedIn: data.get('optedIn') === 'on',
        source: 'MANUAL',
      });
      setModal(null);
      setPrefsLoaded(false);
      await ensurePrefs();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao salvar preferência.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard-stack">
      {error ? <p className="state-message error" role="alert">{error}</p> : null}
      <div className="settings-list">
        <div className="settings-row">
          <div>
            <strong>Responsáveis / guardiões</strong>
            <span>{guardians.length ? `${guardians.length} vinculado(s)` : 'Nenhum responsável cadastrado'}</span>
          </div>
          <button className="button small primary" type="button" onClick={() => setModal('guardian')}>Adicionar</button>
        </div>
        {guardians.map((row) => {
          const guardian = (row.guardian && typeof row.guardian === 'object' ? row.guardian : row) as RecordValue;
          return (
            <div className="settings-row" key={`${String(row.guardianId ?? guardian.id)}`}>
              <div>
                <strong>{text(guardian.name)}{row.isPrimary ? ' · principal' : ''}</strong>
                <span>
                  {text(guardian.relationship)} · {text(guardian.phone)}
                  {row.canSign ? ' · pode assinar' : ''}
                </span>
              </div>
              <button className="button small" type="button" onClick={() => void unlinkGuardian(String(row.guardianId ?? guardian.id))}>
                Desvincular
              </button>
            </div>
          );
        })}
        <div className="settings-row">
          <div>
            <strong>Alertas clínicos</strong>
            <span>CRUD com inativação (sem exclusão física)</span>
          </div>
          <button className="button small primary" type="button" onClick={() => setModal('alert')}>Novo alerta</button>
        </div>
        {alerts.length === 0 ? <EmptyState title="Sem alertas cadastrados" /> : null}
        {alerts.map((alert) => (
          <div className="settings-row" key={String(alert.id)}>
            <div>
              <strong>{text(alert.type)}</strong>
              <span>{text(alert.message)}</span>
            </div>
            <div className="row-actions">
              <StatusBadge tone={alert.active ? (String(alert.severity).includes('CRIT') || String(alert.severity) === 'HIGH' ? 'red' : 'amber') : 'gray'}>
                {alert.active ? presentationLabel(alert.severity) : 'Inativo'}
              </StatusBadge>
              {alert.active ? (
                <button className="button small" type="button" onClick={() => void deactivateAlert(String(alert.id))}>Inativar</button>
              ) : null}
            </div>
          </div>
        ))}
        <div className="settings-row">
          <div>
            <strong>Opt-in de comunicação</strong>
            <span>Preferências por canal/categoria</span>
          </div>
          <button
            className="button small"
            type="button"
            onClick={() => { void ensurePrefs(); setModal('pref'); }}
          >
            Gerenciar
          </button>
        </div>
        {(prefsLoaded ? prefs : preferences).map((pref) => (
          <div className="settings-row" key={String(pref.id ?? `${pref.channel}-${pref.category}`)}>
            <div>
              <strong>{presentationLabel(pref.channel)} · {presentationLabel(pref.category)}</strong>
              <span>origem {text(pref.source, '—')}</span>
            </div>
            <StatusBadge tone={pref.optedIn ? 'green' : 'red'}>{pref.optedIn ? 'Opt-in' : 'Opt-out'}</StatusBadge>
          </div>
        ))}
      </div>

      <Modal open={modal === 'guardian'} title="Novo responsável" onClose={() => setModal(null)} size="small">
        <form className="mutation-form" onSubmit={createGuardian}>
          <label className="span-2">Nome<input name="name" minLength={2} required autoFocus /></label>
          <label>Telefone<input name="phone" minLength={10} required /></label>
          <label>Parentesco<input name="relationship" minLength={2} required placeholder="Mãe" /></label>
          <label className="span-2">E-mail<input name="email" type="email" /></label>
          <label><input name="isPrimary" type="checkbox" /> Principal</label>
          <label><input name="canSign" type="checkbox" defaultChecked /> Pode assinar</label>
          <button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </form>
      </Modal>
      <Modal open={modal === 'alert'} title="Novo alerta clínico" onClose={() => setModal(null)} size="small">
        <form className="mutation-form" onSubmit={createAlert}>
          <label>Tipo<input name="type" minLength={2} required placeholder="Alergia" autoFocus /></label>
          <label>Severidade
            <select name="severity" defaultValue="WARNING">
              <option value="INFO">Info</option>
              <option value="WARNING">Atenção</option>
              <option value="HIGH">Alta</option>
              <option value="CRITICAL">Crítica</option>
            </select>
          </label>
          <label className="span-2">Mensagem<textarea name="message" rows={3} required minLength={2} /></label>
          <button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </form>
      </Modal>
      <Modal open={modal === 'pref'} title="Preferência de comunicação" onClose={() => setModal(null)} size="small">
        <form className="mutation-form" onSubmit={savePref}>
          <label>Canal
            <select name="channel" defaultValue="WHATSAPP">
              <option value="WHATSAPP">WhatsApp</option>
              <option value="SMS">SMS</option>
              <option value="EMAIL">E-mail</option>
              <option value="PHONE">Telefone</option>
            </select>
          </label>
          <label>Categoria
            <select name="category" defaultValue="REMINDER">
              <option value="REMINDER">Lembrete</option>
              <option value="CONFIRMATION">Confirmação</option>
              <option value="RETURN">Retorno</option>
              <option value="MARKETING">Marketing</option>
            </select>
          </label>
          <label className="span-2"><input name="optedIn" type="checkbox" defaultChecked /> Paciente autoriza envios nesta categoria</label>
          <button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar preferência'}</button>
        </form>
      </Modal>
    </div>
  );
}
