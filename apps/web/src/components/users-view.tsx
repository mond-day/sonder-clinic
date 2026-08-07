'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { list, text, type RecordValue } from '@/lib/format';
import { Modal } from './modal';
import { EmptyState, ErrorState, MetricCard, PageHeader, Panel, Skeleton, StatusBadge } from './ui';

const inviteSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.'),
  email: z.string().email('E-mail inválido.'),
  roleId: z.string().uuid('Selecione um perfil.'),
});

const createUserSchema = inviteSchema.extend({
  password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.'),
});

const DOMAIN_LABELS: Record<string, string> = {
  patient: 'Pacientes',
  patients: 'Pacientes',
  clinical: 'Clínico',
  appointment: 'Agenda',
  financial: 'Financeiro',
  commission: 'Comissões',
  user: 'Usuários',
  role: 'Perfis',
  clinic: 'Clínica',
  organization: 'Organização',
  report: 'Relatórios',
  document: 'Documentos',
  communication: 'Comunicação',
  integration: 'Integrações',
  settings: 'Configurações',
};

function domainFromCode(code: string) {
  const prefix = code.split('.')[0] ?? 'outros';
  return DOMAIN_LABELS[prefix] ?? prefix;
}

export function UsersView() {
  const [users, setUsers] = useState<RecordValue[]>([]);
  const [invitations, setInvitations] = useState<RecordValue[]>([]);
  const [roles, setRoles] = useState<RecordValue[]>([]);
  const [permissions, setPermissions] = useState<RecordValue[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState<'invite' | 'create'>('invite');
  const [draftPermissions, setDraftPermissions] = useState<Set<string>>(new Set());
  const [savingRole, setSavingRole] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRaw, rolesRaw, permissionsRaw, invitationsRaw, smtp] = await Promise.all([
        api.get('/users'),
        api.get('/roles'),
        api.get('/permissions'),
        api.get('/users/invitations').catch(() => []),
        api.get<{ smtpConfigured: boolean }>('/auth/smtp-status').catch(() => ({ smtpConfigured: false })),
      ]);
      const roleList = list(rolesRaw);
      setUsers(list(usersRaw));
      setInvitations(list(invitationsRaw));
      setRoles(roleList);
      setPermissions(list(permissionsRaw));
      setSmtpConfigured(smtp.smtpConfigured);
      setSelectedRole((current) => current ?? (roleList[0]?.id ? String(roleList[0].id) : null));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const role = roles.find((item) => item.id === selectedRole);
  const rolePermissionCodes = useMemo(() => new Set(
    list((role?.permissions as RecordValue[] | undefined) ?? []).map((item) => {
      const permission = item.permission as RecordValue | undefined;
      return text(permission?.code ?? item.code);
    }),
  ), [role]);

  useEffect(() => {
    setDraftPermissions(new Set(rolePermissionCodes));
  }, [rolePermissionCodes, selectedRole]);

  const permissionsByDomain = useMemo(() => {
    const groups = new Map<string, RecordValue[]>();
    for (const permission of permissions) {
      const code = text(permission.code);
      const domain = domainFromCode(code);
      const bucket = groups.get(domain) ?? [];
      bucket.push(permission);
      groups.set(domain, bucket);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [permissions]);

  const matrixDirty = useMemo(() => {
    if (draftPermissions.size !== rolePermissionCodes.size) return true;
    for (const code of draftPermissions) {
      if (!rolePermissionCodes.has(code)) return true;
    }
    return false;
  }, [draftPermissions, rolePermissionCodes]);

  async function toggleUserStatus(user: RecordValue) {
    const id = String(user.id);
    setBusy(true);
    setFormError('');
    try {
      if (user.status === 'BLOCKED') await api.post(`/users/${id}/activate`);
      else await api.post(`/users/${id}/block`);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível atualizar o usuário.');
    } finally {
      setBusy(false);
    }
  }

  async function submitUserForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    setFormMessage('');
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    setBusy(true);
    try {
      if (inviteMode === 'invite') {
        const parsed = inviteSchema.safeParse(data);
        if (!parsed.success) {
          setFormError(parsed.error.issues[0]?.message ?? 'Revise os campos.');
          return;
        }
        await api.post('/users/invitations', parsed.data);
        setFormMessage('Convite enviado por e-mail.');
      } else {
        const parsed = createUserSchema.safeParse(data);
        if (!parsed.success) {
          setFormError(parsed.error.issues[0]?.message ?? 'Revise os campos.');
          return;
        }
        const { roleId, ...rest } = parsed.data;
        await api.post('/users', { ...rest, roleIds: [roleId] });
        setFormMessage('Usuário criado.');
      }
      await load();
      setInviteOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  async function saveRolePermissions() {
    if (!selectedRole) return;
    setSavingRole(true);
    setFormError('');
    try {
      await api.patch(`/roles/${selectedRole}`, { permissionCodes: [...draftPermissions] });
      await load();
      setFormMessage('Permissões do perfil atualizadas.');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o perfil.');
    } finally {
      setSavingRole(false);
    }
  }

  function togglePermission(code: string) {
    setDraftPermissions((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  if (loading) return <Skeleton rows={6} />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  return (
    <div className="users-view">
      <PageHeader
        eyebrow="Administração"
        title="Usuários e permissões"
        description="Convites, perfis e matriz RBAC por domínio."
        actions={(
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setInviteMode('invite');
              setFormError('');
              setFormMessage('');
              setInviteOpen(true);
            }}
          >
            Convidar usuário
          </button>
        )}
      />
      {formError ? <div className="secure-notice form-error" role="alert">{formError}</div> : null}
      {formMessage ? <div className="secure-notice" role="status">{formMessage}</div> : null}

      <Modal
        open={inviteOpen}
        title={inviteMode === 'invite' ? 'Convidar usuário' : 'Criar usuário'}
        description={inviteMode === 'invite'
          ? 'Envia convite por SMTP com link para definir senha.'
          : 'Cria o usuário ativo com senha inicial.'}
        onClose={() => setInviteOpen(false)}
      >
        <div className="choice-pills">
          <button type="button" className={inviteMode === 'invite' ? 'active' : ''} onClick={() => setInviteMode('invite')}>Convite</button>
          <button type="button" className={inviteMode === 'create' ? 'active' : ''} onClick={() => setInviteMode('create')}>Criar agora</button>
        </div>
        <form className="mutation-form compact" style={{ padding: 0, border: 0 }} onSubmit={(event) => void submitUserForm(event)}>
          <label>Nome<input name="name" required minLength={2} /></label>
          <label>E-mail<input name="email" type="email" required /></label>
          <label>Perfil
            <select name="roleId" required defaultValue={selectedRole ?? ''}>
              <option value="">Selecione</option>
              {roles.map((item) => <option key={String(item.id)} value={String(item.id)}>{text(item.name)}</option>)}
            </select>
          </label>
          {inviteMode === 'create' ? (
            <label>Senha inicial<input name="password" type="password" minLength={8} required autoComplete="new-password" /></label>
          ) : null}
          {inviteMode === 'invite' && smtpConfigured === false ? (
            <p className="form-error span-2" role="alert">SMTP não configurado. Defina SMTP_HOST no servidor para enviar convites.</p>
          ) : null}
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={busy || (inviteMode === 'invite' && smtpConfigured === false)} type="submit">
            {busy ? 'Salvando…' : inviteMode === 'invite' ? 'Enviar convite' : 'Criar usuário'}
          </button>
        </form>
      </Modal>

      <div className="metric-grid">
        <MetricCard label="Usuários" value={users.length} />
        <MetricCard label="Ativos" value={users.filter((item) => item.status === 'ACTIVE').length} tone="green" />
        <MetricCard label="Convites pendentes" value={invitations.filter((item) => item.status === 'PENDING').length} tone="amber" />
        <MetricCard label="Perfis" value={roles.length} />
      </div>
      <div className="users-layout">
        <Panel title="Usuários e convites" description="Bloqueie, reative e gerencie convites SMTP">
          {users.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Status</th>
                    <th>Perfis</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={String(user.id)}>
                      <td>{text(user.name)}</td>
                      <td>{text(user.email)}</td>
                      <td>
                        <StatusBadge tone={user.status === 'ACTIVE' ? 'green' : user.status === 'BLOCKED' ? 'red' : 'amber'}>
                          {text(user.status)}
                        </StatusBadge>
                      </td>
                      <td>
                        {list(user.roles as RecordValue[] | undefined)
                          .map((item) => text((item.role as RecordValue | undefined)?.name))
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </td>
                      <td className="row-actions">
                        {user.status === 'BLOCKED' ? (
                          <button type="button" className="button small" disabled={busy} onClick={() => void toggleUserStatus(user)}>
                            Ativar
                          </button>
                        ) : (
                          <button type="button" className="button small danger" disabled={busy} onClick={() => void toggleUserStatus(user)}>
                            Bloquear
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Nenhum usuário" description="Convide o primeiro colaborador." />
          )}
          {invitations.length ? (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Convite</th>
                    <th>E-mail</th>
                    <th>Status</th>
                    <th>Expira</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((invite) => (
                    <tr key={String(invite.id)}>
                      <td>{text(invite.name)}</td>
                      <td>{text(invite.email)}</td>
                      <td>
                        <StatusBadge tone={invite.status === 'PENDING' ? 'amber' : invite.status === 'ACCEPTED' ? 'green' : 'gray'}>
                          {text(invite.status)}
                        </StatusBadge>
                      </td>
                      <td>{invite.expiresAt ? new Date(String(invite.expiresAt)).toLocaleString('pt-BR') : '—'}</td>
                      <td className="row-actions">
                        {invite.status === 'PENDING' ? (
                          <>
                            <button
                              type="button"
                              className="button small"
                              disabled={busy || smtpConfigured === false}
                              onClick={() => void (async () => {
                                setBusy(true);
                                setFormError('');
                                try {
                                  await api.post(`/users/invitations/${String(invite.id)}/resend`);
                                  setFormMessage('Convite reenviado.');
                                  await load();
                                } catch (err) {
                                  setFormError(err instanceof ApiError ? err.message : 'Falha ao reenviar.');
                                } finally {
                                  setBusy(false);
                                }
                              })()}
                            >
                              Reenviar
                            </button>
                            <button
                              type="button"
                              className="button small danger"
                              disabled={busy}
                              onClick={() => void (async () => {
                                setBusy(true);
                                setFormError('');
                                try {
                                  await api.post(`/users/invitations/${String(invite.id)}/revoke`);
                                  setFormMessage('Convite revogado.');
                                  await load();
                                } catch (err) {
                                  setFormError(err instanceof ApiError ? err.message : 'Falha ao revogar.');
                                } finally {
                                  setBusy(false);
                                }
                              })()}
                            >
                              Revogar
                            </button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Panel>
        <Panel title="Perfis" description="Selecione um perfil para editar a matriz">
          <div className="role-cards">
            {roles.map((item) => {
              const userCount = Number((item._count as RecordValue | undefined)?.users ?? 0);
              const permissionCount = list(item.permissions as RecordValue[] | undefined).length;
              return (
                <button
                  key={String(item.id)}
                  type="button"
                  className={`role-card ${selectedRole === item.id ? 'active' : ''}`}
                  onClick={() => setSelectedRole(String(item.id))}
                >
                  <strong>{text(item.name)}</strong>
                  <span>{text(item.code)}</span>
                  <small>{userCount} usuário(s) · {permissionCount} permissão(ões)</small>
                </button>
              );
            })}
          </div>
        </Panel>
      </div>
      <Panel
        title={`Matriz de permissões · ${text(role?.name) || 'perfil'}`}
        description="Agrupadas por domínio (prefixo do código)"
        actions={(
          <button
            type="button"
            className="button primary"
            disabled={!selectedRole || !matrixDirty || savingRole}
            onClick={() => void saveRolePermissions()}
          >
            {savingRole ? 'Salvando…' : 'Salvar perfil'}
          </button>
        )}
      >
        {!role ? (
          <EmptyState title="Selecione um perfil" />
        ) : (
          <div className="permission-matrix-groups">
            {permissionsByDomain.map(([domain, items]) => (
              <section key={domain} className="permission-domain">
                <h3>{domain}</h3>
                <div className="permission-matrix">
                  {items.map((permission) => {
                    const code = text(permission.code);
                    return (
                      <label key={String(permission.id)} className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={draftPermissions.has(code)}
                          onChange={() => togglePermission(code)}
                        />
                        <span>
                          <strong>{code}</strong>
                          {permission.description ? <small>{text(permission.description)}</small> : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
