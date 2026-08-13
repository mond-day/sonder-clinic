'use client';

import { FormEvent, useMemo, useState } from 'react';
import { BellPlus, Link2Off, Plus, Settings2, UserMinus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatCpf, formatPhone, list, presentationLabel, text, type RecordValue } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/ui';
import { Modal } from '@/components/modal';

function preferenceSourceLabel(source: unknown) {
  const key = String(source ?? '').toUpperCase();
  if (!key || key === '—') return null;
  if (key === 'MANUAL') return 'Cadastrado manualmente';
  if (key === 'IMPORT') return 'Importado';
  if (key === 'SYSTEM') return 'Sistema';
  return presentationLabel(source);
}

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

  const activeAlerts = alerts.filter((alert) => alert.active !== false);

  async function ensurePrefs(force = false) {
    if (prefsLoaded && !force) return;
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
      const cpf = String(data.get('cpf') || '').trim();
      await api.post(`/patients/${patientId}/guardians`, {
        name: String(data.get('name') || '').trim(),
        phone: String(data.get('phone') || '').trim(),
        relationship: String(data.get('relationship') || '').trim(),
        cpf: cpf || undefined,
        email: String(data.get('email') || '').trim() || undefined,
        isLegalGuardian: data.get('isLegalGuardian') === 'on',
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
    if (!window.confirm('Inativar este alerta clínico?')) return;
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
      await ensurePrefs(true);
      onChanged();
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
            <strong>Responsáveis</strong>
            <span>{guardians.length ? `${guardians.length} vinculado(s)` : 'Nenhum responsável cadastrado'}</span>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Adicionar responsável"
            aria-label="Adicionar responsável"
            onClick={() => setModal('guardian')}
          >
            <Plus size={16} />
          </button>
        </div>
        {guardians.map((row) => {
          const guardian = (row.guardian && typeof row.guardian === 'object' ? row.guardian : row) as RecordValue;
          return (
            <div className="settings-row" key={`${String(row.guardianId ?? guardian.id)}`}>
              <div>
                <strong>
                  {text(guardian.name)}
                  {row.isPrimary ? ' · principal' : ''}
                  {row.isLegalGuardian ? ' · responsável legal' : ''}
                </strong>
                <span>
                  {text(guardian.relationship)} · {formatPhone(guardian.phone)}
                  {guardian.cpf ? ` · CPF ${formatCpf(guardian.cpf)}` : ''}
                  {row.canSign ? ' · pode assinar' : ''}
                </span>
              </div>
              <button
                className="icon-button"
                type="button"
                title="Desvincular responsável"
                aria-label={`Desvincular ${text(guardian.name)}`}
                onClick={() => void unlinkGuardian(String(row.guardianId ?? guardian.id))}
              >
                <Link2Off size={16} />
              </button>
            </div>
          );
        })}
        <div className="settings-row">
          <div>
            <strong>Alertas clínicos</strong>
            <span>
              {activeAlerts.length
                ? `${activeAlerts.length} alerta${activeAlerts.length === 1 ? '' : 's'} ativo${activeAlerts.length === 1 ? '' : 's'}`
                : 'Nenhum alerta ativo'}
            </span>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Novo alerta"
            aria-label="Novo alerta clínico"
            onClick={() => setModal('alert')}
          >
            <BellPlus size={16} />
          </button>
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
                <button
                  className="icon-button"
                  type="button"
                  title="Inativar alerta"
                  aria-label={`Inativar alerta ${text(alert.type)}`}
                  onClick={() => void deactivateAlert(String(alert.id))}
                >
                  <UserMinus size={16} />
                </button>
              ) : null}
            </div>
          </div>
        ))}
        <div className="settings-row">
          <div>
            <strong>Preferências de comunicação</strong>
            <span>Defina quais comunicações o paciente autoriza receber.</span>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Gerenciar preferências"
            aria-label="Gerenciar preferências de comunicação"
            onClick={() => { void ensurePrefs(); setModal('pref'); }}
          >
            <Settings2 size={16} />
          </button>
        </div>
        {(prefsLoaded ? prefs : preferences).map((pref) => {
          const sourceLabel = preferenceSourceLabel(pref.source);
          return (
            <div className="settings-row" key={String(pref.id ?? `${pref.channel}-${pref.category}`)}>
              <div>
                <strong>{presentationLabel(pref.channel)} · {presentationLabel(pref.category)}</strong>
                {sourceLabel ? <span>{sourceLabel}</span> : null}
              </div>
              <StatusBadge tone={pref.optedIn ? 'green' : 'red'}>
                {pref.optedIn ? 'Autorizado' : 'Não autorizado'}
              </StatusBadge>
            </div>
          );
        })}
      </div>

      <Modal open={modal === 'guardian'} title="Novo responsável" onClose={() => setModal(null)} size="small" confirmOnClose>
        <form className="mutation-form care-form" onSubmit={createGuardian}>
          <label className="span-2">Nome<input name="name" minLength={2} required autoFocus /></label>
          <label>Telefone<input name="phone" minLength={10} required placeholder="(66) 99999-9999" /></label>
          <label>Parentesco<input name="relationship" minLength={2} required placeholder="Mãe" /></label>
          <label>CPF<input name="cpf" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" /></label>
          <label>E-mail<input name="email" type="email" /></label>
          <fieldset className="span-2 care-form-flags">
            <legend>Permissões</legend>
            <label className="check-field"><input name="isLegalGuardian" type="checkbox" defaultChecked /> Responsável legal</label>
            <label className="check-field"><input name="isPrimary" type="checkbox" /> Principal</label>
            <label className="check-field"><input name="canSign" type="checkbox" defaultChecked /> Pode assinar</label>
          </fieldset>
          <button className="button primary span-2" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </form>
      </Modal>
      <Modal open={modal === 'alert'} title="Novo alerta clínico" onClose={() => setModal(null)} size="small" confirmOnClose>
        <form className="mutation-form care-form" onSubmit={createAlert}>
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
          <button className="button primary span-2" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </form>
      </Modal>
      <Modal open={modal === 'pref'} title="Preferência de comunicação" description="Defina o canal, a categoria e se o paciente autoriza o envio." onClose={() => setModal(null)} size="small" confirmOnClose>
        <form className="mutation-form care-form" onSubmit={savePref}>
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
          <label className="span-2 check-field care-form-consent">
            <input name="optedIn" type="checkbox" defaultChecked />
            Paciente autoriza envios nesta categoria
          </label>
          <button className="button primary span-2" disabled={busy}>{busy ? 'Salvando…' : 'Salvar preferência'}</button>
        </form>
      </Modal>
    </div>
  );
}
