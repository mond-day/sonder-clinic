'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Copy, ExternalLink, Eye, KeyRound } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { publicApiDocsUrl } from '@/lib/branding';
import { dateOnly, hasPermission, list, text, type RecordValue } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/ui';
import { Modal } from '@/components/modal';
import { useAuth } from '@/components/auth-provider';
import { useSelection } from '@/components/selection-provider';

const DOCS_URL = publicApiDocsUrl();

export function ApiKeysPanel() {
  const { user } = useAuth();
  const { clinics, clinicId } = useSelection();
  const canManage = hasPermission(user?.permissions, 'organization.manage', 'integration.manage');
  const canReveal = hasPermission(user?.permissions, 'organization.manage');
  const [rows, setRows] = useState<RecordValue[]>([]);
  const [scopes, setScopes] = useState<ScopeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['appointments:read', 'appointments:write']);
  const [createdKey, setCreatedKey] = useState('');
  const [revealedKey, setRevealedKey] = useState('');
  const [revealNotice, setRevealNotice] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    Promise.all([
      api.get<RecordValue[]>('/settings/api-keys'),
      api.get<ScopeOption[]>('/settings/api-keys/scopes'),
    ])
      .then(([keys, available]) => {
        setRows(list(keys));
        setScopes(available);
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao listar chaves.'))
      .finally(() => setLoading(false));
  }, [canManage]);

  useEffect(load, [load]);

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFormError('');
    try {
      const created = await api.post<RecordValue>('/settings/api-keys', {
        name: String(data.get('name') || '').trim(),
        scopes: selectedScopes,
        clinicId: String(data.get('clinicId') || '').trim() || undefined,
      });
      const plaintext = text(created.plaintext, '');
      setOpen(false);
      setCreatedKey(plaintext === '—' ? '' : plaintext);
      setSelectedScopes(['appointments:read', 'appointments:write']);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível criar a chave.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm('Revogar esta chave? Integrações que a usam deixam de autenticar imediatamente.')) return;
    try {
      await api.post(`/settings/api-keys/${id}/revoke`);
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao revogar a chave.');
    }
  }

  async function reveal(row: RecordValue) {
    if (!canReveal) return;
    if (!row.revealable) {
      setRevealNotice('Não é possível reexibir esta chave (foi criada só com hash). Gere outra.');
      return;
    }
    if (!window.confirm(`Mostrar a chave “${text(row.name)}”? O valor secreto ficará visível nesta tela.`)) return;
    try {
      const result = await api.post<{ plaintext?: string }>(`/settings/api-keys/${String(row.id)}/reveal`);
      const plaintext = text(result.plaintext, '');
      setRevealedKey(plaintext === '—' ? '' : plaintext);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível reexibir a chave.');
    }
  }

  async function copyKey(value: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  if (!canManage) {
    return (
      <p className="muted-note" style={{ padding: '0 14px 14px' }}>
        Somente administradores da organização podem gerenciar chaves de API.
      </p>
    );
  }

  return (
    <div className="form-section" style={{ padding: '0 14px 14px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>Chaves de API</h3>
          <p className="muted-note" style={{ margin: '4px 0 0' }}>
            Integrações externas autenticam com o header <code>X-API-Key</code>.
          </p>
        </div>
        <div className="row-actions">
          <a className="button small" href={DOCS_URL} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Documentação Scalar
          </a>
          <button className="button small primary" type="button" onClick={() => setOpen(true)}>Nova chave</button>
        </div>
      </header>
      {error ? <p className="state-message error" role="alert">{error}</p> : null}
      {revealNotice ? <p className="muted-note" role="status">{revealNotice}</p> : null}
      {loading ? <div className="state-message">Carregando chaves…</div> : null}
      {!loading && rows.length === 0 ? (
        <EmptyState title="Nenhuma chave" description="Crie uma chave para conectar a agenda ou o cadastro de pacientes a outro sistema." />
      ) : (
        <div className="settings-list">
          {rows.map((row) => (
            <div className="settings-row" key={String(row.id)}>
              <div>
                <strong>{text(row.name)}</strong>
                <span>
                  {text(row.maskedKey)}
                  {row.clinicName ? ` · ${text(row.clinicName)}` : ' · toda a organização'}
                  {row.lastUsedAt ? ` · último uso ${dateOnly(row.lastUsedAt)}` : ' · nunca usada'}
                </span>
                <span className="muted-note">
                  {Array.isArray(row.scopes) ? row.scopes.map(String).join(', ') : ''}
                </span>
                {row.status === 'ACTIVE' && !row.revealable ? (
                  <span className="muted-note">Não é possível reexibir. Gere outra chave para poder visualizá-la depois.</span>
                ) : null}
              </div>
              <div className="row-actions">
                <StatusBadge tone={row.status === 'ACTIVE' ? 'green' : 'red'}>
                  {text(row.status) === 'REVOKED' ? 'Revogada' : text(row.status) === 'EXPIRED' ? 'Expirada' : 'Ativa'}
                </StatusBadge>
                {row.status === 'ACTIVE' && canReveal ? (
                  <button className="button small" type="button" onClick={() => void reveal(row)}>
                    <Eye size={14} /> Mostrar chave
                  </button>
                ) : null}
                {row.status === 'ACTIVE' ? (
                  <button className="button small" type="button" onClick={() => void revoke(String(row.id))}>
                    Revogar
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        title="Nova chave de API"
        description="O valor secreto aparece agora e também pode ser reexibido depois por um administrador."
        onClose={() => setOpen(false)}
      >
        <form className="mutation-form" onSubmit={(event) => void createKey(event)}>
          <label className="span-2">Nome
            <input name="name" minLength={2} required autoFocus placeholder="Ex.: Site de agendamento" />
          </label>
          <label className="span-2">Clínica
            <select name="clinicId" defaultValue={clinicId}>
              <option value="">Toda a organização</option>
              {clinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>{clinic.tradeName}</option>
              ))}
            </select>
          </label>
          <fieldset className="span-2" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 13, marginBottom: 8 }}>Escopos</legend>
            <div className="check-stack">
              {scopes.map((scope) => (
                <label className="switch-row" key={scope.code}>
                  <span className="switch">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={selectedScopes.includes(scope.code)}
                      onChange={(event) => {
                        setSelectedScopes((current) => (
                          event.target.checked
                            ? [...current, scope.code]
                            : current.filter((item) => item !== scope.code)
                        ));
                      }}
                    />
                    <span className="switch-track" aria-hidden />
                  </span>
                  {scope.label}
                </label>
              ))}
            </div>
          </fieldset>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <div className="modal-footer span-2">
            <button type="button" className="button" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="button primary" disabled={busy || selectedScopes.length === 0}>
              {busy ? 'Criando…' : 'Criar chave'}
            </button>
          </div>
        </form>
      </Modal>

      <SecretKeyModal
        open={Boolean(createdKey)}
        title="Copie a chave agora"
        description="Guarde no sistema integrador. Um administrador pode reexibi-la depois em Mostrar chave."
        value={createdKey}
        copied={copied}
        onCopy={() => void copyKey(createdKey)}
        onClose={() => setCreatedKey('')}
      />
      <SecretKeyModal
        open={Boolean(revealedKey)}
        title="Chave de API"
        description="Valor reexibido para o administrador. Copie se precisar atualizar a integração."
        value={revealedKey}
        copied={copied}
        onCopy={() => void copyKey(revealedKey)}
        onClose={() => setRevealedKey('')}
      />
    </div>
  );
}

type ScopeOption = { code: string; label: string };

function SecretKeyModal({
  open,
  title,
  description,
  value,
  copied,
  onCopy,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title={title} description={description} onClose={onClose} size="small">
      <div className="mutation-form">
        <label className="span-2">Chave
          <input readOnly value={value} />
        </label>
        <p className="muted-note span-2">Use o header <code>X-API-Key</code> nas chamadas a <code>/api/v1/public/…</code>.</p>
        <div className="modal-footer span-2">
          <button type="button" className="button" onClick={onClose}>Fechar</button>
          <button type="button" className="button primary" onClick={onCopy}>
            <Copy size={14} /> {copied ? 'Copiada' : 'Copiar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ApiKeysSectionHint() {
  return (
    <p className="muted-note" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 14px' }}>
      <KeyRound size={14} />
      Autenticação usa o hash da chave. Uma cópia criptografada fica em repouso para o administrador reexibir. Revogue imediatamente se houver vazamento.
    </p>
  );
}
