'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Pencil, ShieldCheck } from 'lucide-react';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { initials, list, presentationLabel, text, type RecordValue } from '@/lib/format';
import {
  INVITE_STATUS_LABELS,
  buildPermissionMatrix,
} from '@/lib/permission-presentation';
import { DirtyFormModal, Modal } from './modal';
import { EmptyState, ErrorState, MetricCard, PageHeader, Panel, Skeleton, StatusBadge } from './ui';

const inviteSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.'),
  email: z.string().email('E-mail inválido.'),
  roleId: z.string().uuid('Selecione um perfil.'),
});

const createUserSchema = inviteSchema.extend({
  password: z.string().min(10, 'A senha deve ter ao menos 10 caracteres, com maiúscula, minúscula e número.'),
});

const editUserSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.'),
  email: z.string().email('E-mail inválido.'),
  roleId: z.string().uuid('Selecione um perfil.').optional(),
  status: z.enum(['ACTIVE', 'BLOCKED']).optional(),
});

const createRoleSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do perfil.'),
  baseRoleId: z.string().uuid().optional().or(z.literal('')),
});

type TabKey = 'team' | 'roles' | 'invites';

function roleNames(user: RecordValue) {
  return list(user.roles as RecordValue[] | undefined)
    .map((item) => text((item.role as RecordValue | undefined)?.name))
    .filter(Boolean)
    .join(', ') || '—';
}

function inviteStatusLabel(status: unknown) {
  const key = String(status ?? '').toUpperCase();
  return INVITE_STATUS_LABELS[key] ?? presentationLabel(status);
}

export function UsersView() {
  const [tab, setTab] = useState<TabKey>('team');
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
  const [editUser, setEditUser] = useState<RecordValue | null>(null);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [pendingUserAction, setPendingUserAction] = useState<RecordValue | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Set<string>>(new Set());
  const [permissionArea, setPermissionArea] = useState('');
  const [savingRole, setSavingRole] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);
  const [teamSearch, setTeamSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

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
    if (roleModalOpen) return;
    setDraftPermissions(new Set(rolePermissionCodes));
  }, [rolePermissionCodes, selectedRole, roleModalOpen]);

  const allPermissionCodes = useMemo(
    () => permissions.map((item) => text(item.code)).filter(Boolean),
    [permissions],
  );

  const permissionMatrix = useMemo(
    () => buildPermissionMatrix(allPermissionCodes),
    [allPermissionCodes],
  );

  useEffect(() => {
    if (!permissionMatrix.length) return;
    if (!permissionMatrix.some((row) => row.area === permissionArea)) {
      setPermissionArea(permissionMatrix[0]!.area);
    }
  }, [permissionMatrix, permissionArea]);

  const isAdminRole = String(role?.code ?? '').toUpperCase() === 'ADMIN';

  const matrixDirty = useMemo(() => {
    if (draftPermissions.size !== rolePermissionCodes.size) return true;
    for (const code of draftPermissions) {
      if (!rolePermissionCodes.has(code)) return true;
    }
    return false;
  }, [draftPermissions, rolePermissionCodes]);

  const filteredUsers = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter) {
        const names = list(user.roles as RecordValue[] | undefined)
          .map((item) => String((item.role as RecordValue | undefined)?.id ?? ''));
        if (!names.includes(roleFilter)) return false;
      }
      if (!q) return true;
      const hay = `${text(user.name)} ${text(user.email)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, teamSearch, roleFilter]);

  async function toggleUserStatus(user: RecordValue) {
    const id = String(user.id);
    setBusy(true);
    setFormError('');
    try {
      if (user.status === 'BLOCKED') await api.post(`/users/${id}/activate`);
      else await api.post(`/users/${id}/block`);
      await load();
      setFormMessage(user.status === 'BLOCKED' ? 'Usuário ativado.' : 'Usuário bloqueado.');
      setEditUser(null);
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
        setTab('invites');
      } else {
        const parsed = createUserSchema.safeParse(data);
        if (!parsed.success) {
          setFormError(parsed.error.issues[0]?.message ?? 'Revise os campos.');
          return;
        }
        const { roleId, ...rest } = parsed.data;
        await api.post('/users', { ...rest, roleIds: [roleId] });
        setFormMessage('Usuário criado.');
        setTab('team');
      }
      await load();
      setInviteOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  async function submitEditUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editUser) return;
    setFormError('');
    setFormMessage('');
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const parsed = editUserSchema.safeParse(data);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Revise os campos.');
      return;
    }
    setBusy(true);
    try {
      const id = String(editUser.id);
      await api.patch(`/users/${id}`, {
        name: parsed.data.name,
        email: parsed.data.email,
      });
      if (parsed.data.roleId) {
        await api.post(`/users/${id}/roles`, { roleId: parsed.data.roleId }).catch(() => undefined);
      }
      if (parsed.data.status === 'BLOCKED' && editUser.status !== 'BLOCKED') {
        await api.post(`/users/${id}/block`);
      } else if (parsed.data.status === 'ACTIVE' && editUser.status === 'BLOCKED') {
        await api.post(`/users/${id}/activate`);
      }
      await load();
      setEditUser(null);
      setFormMessage('Usuário atualizado.');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível atualizar o usuário.');
    } finally {
      setBusy(false);
    }
  }

  async function submitCreateRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const parsed = createRoleSchema.safeParse(data);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Revise o nome do perfil.');
      return;
    }
    setBusy(true);
    try {
      const created = await api.post<RecordValue>('/roles', {
        name: parsed.data.name,
        permissionCodes: [...draftPermissions],
      });
      await load();
      if (created?.id) setSelectedRole(String(created.id));
      setRoleModalOpen(false);
      setTab('roles');
      setFormMessage('Perfil criado.');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível criar o perfil.');
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
      setRoleEditorOpen(false);
      setFormMessage('Permissões do perfil atualizadas.');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o perfil.');
    } finally {
      setSavingRole(false);
    }
  }

  function togglePermission(code: string) {
    if (roleEditorOpen && isAdminRole) return;
    setDraftPermissions((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleAreaAccess(row: ReturnType<typeof buildPermissionMatrix>[number], enable: boolean) {
    if (roleEditorOpen && isAdminRole) return;
    const codes = [
      row.view,
      row.create,
      row.edit,
      row.cancel,
      ...row.specials.map((item) => item.code),
    ].filter(Boolean) as string[];
    setDraftPermissions((current) => {
      const next = new Set(current);
      for (const code of codes) {
        if (enable) next.add(code);
        else next.delete(code);
      }
      return next;
    });
  }

  function permissionSwitch(code: string, label: string, locked: boolean, rowClassName?: string) {
    return (
      <label key={code} className={`switch-row${rowClassName ? ` ${rowClassName}` : ''}`} title={label}>
        <span>{label}</span>
        <span className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={draftPermissions.has(code) || locked}
            disabled={locked}
            onChange={() => togglePermission(code)}
            aria-label={label}
          />
          <span className="switch-track" aria-hidden />
        </span>
      </label>
    );
  }

  function permissionAreaEditor(locked: boolean) {
    const row = permissionMatrix.find((item) => item.area === permissionArea) ?? permissionMatrix[0];
    if (!row) return <p className="muted-note">Nenhuma permissão cadastrada.</p>;
    const areaCodes = [
      row.view,
      row.create,
      row.edit,
      row.cancel,
      ...row.specials.map((item) => item.code),
    ].filter(Boolean) as string[];
    const allOn = areaCodes.length > 0 && areaCodes.every((code) => draftPermissions.has(code));
    const actionLabels = {
      view: 'Visualizar',
      create: 'Criar',
      edit: 'Editar',
      cancel: 'Cancelar / excluir',
    } as const;
    return (
      <div className="permission-area-editor">
        <div className="permission-area-tabs" role="tablist" aria-label="Áreas de permissão">
          {permissionMatrix.map((item) => (
            <button
              key={item.area}
              type="button"
              role="tab"
              aria-selected={item.area === row.area}
              onClick={() => setPermissionArea(item.area)}
            >
              {item.area}
            </button>
          ))}
        </div>
        <div className="permission-area-panel" role="tabpanel" aria-label={row.area}>
          {areaCodes.length ? (
            <label className="switch-row all-access" title={`Liberar toda a área ${row.area}`}>
              <span>Acesso a tudo</span>
              <span className="switch">
                <input
                  type="checkbox"
                  role="switch"
                  checked={allOn || locked}
                  disabled={locked}
                  onChange={(event) => toggleAreaAccess(row, event.target.checked)}
                  aria-label={`Acesso a tudo em ${row.area}`}
                />
                <span className="switch-track" aria-hidden />
              </span>
            </label>
          ) : null}
          {(['view', 'create', 'edit', 'cancel'] as const).map((action) => {
            const code = row[action];
            if (!code) return null;
            return permissionSwitch(code, actionLabels[action], locked);
          })}
          {row.specials.length ? (
            <div className="permission-specials">
              <h4>Ações especiais</h4>
              {row.specials.map((special) => permissionSwitch(special.code, special.label, locked))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (loading) return <Skeleton rows={6} />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  const pendingInvites = invitations.filter((item) => item.status === 'PENDING').length;
  const currentEditRoleId = editUser
    ? String(list(editUser.roles as RecordValue[] | undefined)[0]
      ? ((list(editUser.roles as RecordValue[] | undefined)[0]?.role as RecordValue | undefined)?.id
        ?? list(editUser.roles as RecordValue[] | undefined)[0]?.roleId
        ?? '')
      : '')
    : '';

  return (
    <div className="users-view">
      <PageHeader
        eyebrow="Administração"
        title="Usuários e permissões"
        description="Pessoas, perfis de acesso e convites separados para reduzir ruído e facilitar a conferência."
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

      <div className="metric-grid compact">
        <MetricCard label="Usuários" value={users.length} meta={`${users.filter((item) => item.status === 'ACTIVE').length} ativos`} />
        <MetricCard label="Profissionais" value={users.filter((u) => roleNames(u).toLowerCase().includes('dentist') || roleNames(u).toLowerCase().includes('dentista')).length || '—'} meta="Com perfil clínico" />
        <MetricCard label="Perfis" value={roles.length} meta="Permissões por perfil" />
        <MetricCard label="Convites pendentes" value={pendingInvites} tone="amber" meta="Aguardando aceite" />
      </div>

      <div className="segmented" role="tablist" aria-label="Áreas de usuários" style={{ marginBottom: 14, width: 'fit-content' }}>
        <button type="button" role="tab" aria-selected={tab === 'team'} className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>Usuários</button>
        <button type="button" role="tab" aria-selected={tab === 'roles'} className={tab === 'roles' ? 'active' : ''} onClick={() => setTab('roles')}>Perfis e permissões</button>
        <button type="button" role="tab" aria-selected={tab === 'invites'} className={tab === 'invites' ? 'active' : ''} onClick={() => setTab('invites')}>Convites</button>
      </div>

      <DirtyFormModal
        open={inviteOpen}
        title={inviteMode === 'invite' ? 'Convidar usuário' : 'Criar usuário'}
        description={inviteMode === 'invite'
          ? 'O usuário receberá um e-mail para criar a própria senha.'
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
          <label>Perfil de acesso
            <select name="roleId" required defaultValue={selectedRole ?? ''}>
              <option value="">Selecione</option>
              {roles.map((item) => <option key={String(item.id)} value={String(item.id)}>{text(item.name)}</option>)}
            </select>
          </label>
          {inviteMode === 'create' ? (
            <label>Senha inicial<input name="password" type="password" minLength={10} required autoComplete="new-password" /></label>
          ) : null}
          {inviteMode === 'invite' && smtpConfigured === false ? (
            <p className="form-error span-2" role="alert">
              O envio de e-mails ainda não está configurado. Peça ao administrador técnico para concluir essa configuração.
            </p>
          ) : null}
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={busy || (inviteMode === 'invite' && smtpConfigured === false)} type="submit">
            {busy ? 'Salvando…' : inviteMode === 'invite' ? 'Enviar convite' : 'Criar usuário'}
          </button>
        </form>
      </DirtyFormModal>

      <DirtyFormModal
        open={Boolean(editUser)}
        title="Editar usuário"
        description={editUser ? `${text(editUser.name)} · ${text(editUser.email)}` : undefined}
        onClose={() => setEditUser(null)}
      >
        {editUser ? (
          <form className="mutation-form" key={String(editUser.id)} onSubmit={(event) => void submitEditUser(event)}>
            <label className="span-2">Nome<input name="name" required defaultValue={text(editUser.name)} /></label>
            <label className="span-2">E-mail<input name="email" type="email" required defaultValue={text(editUser.email)} /></label>
            <label>Perfil
              <select name="roleId" defaultValue={currentEditRoleId}>
                <option value="">Manter atual</option>
                {roles.map((item) => <option key={String(item.id)} value={String(item.id)}>{text(item.name)}</option>)}
              </select>
            </label>
            <label>Status
              <select name="status" defaultValue={editUser.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE'}>
                <option value="ACTIVE">Ativo</option>
                <option value="BLOCKED">Bloqueado</option>
              </select>
            </label>
            {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
            <div className="form-actions span-2" style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <button
                type="button"
                className="button danger"
                disabled={busy}
                onClick={() => void toggleUserStatus(editUser)}
              >
                {editUser.status === 'BLOCKED' ? 'Ativar acesso' : 'Bloquear acesso'}
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="button ghost" onClick={() => setEditUser(null)}>Cancelar</button>
                <button className="button primary" disabled={busy} type="submit">{busy ? 'Salvando…' : 'Salvar'}</button>
              </div>
            </div>
          </form>
        ) : null}
      </DirtyFormModal>

      <DirtyFormModal
        open={roleModalOpen}
        title="Novo perfil de acesso"
        description="Defina o nome, a base e as permissões antes de salvar."
        onClose={() => setRoleModalOpen(false)}
        size="xlarge"
        extraDirty={draftPermissions.size > 0}
      >
        <form className="mutation-form" onSubmit={(event) => void submitCreateRole(event)}>
          <label>Nome do perfil<input name="name" required minLength={2} placeholder="Ex.: Coordenador clínico" autoFocus /></label>
          <label>Basear em
            <select
              name="baseRoleId"
              defaultValue=""
              onChange={(event) => {
                const base = roles.find((item) => String(item.id) === event.target.value);
                const codes = list((base?.permissions as RecordValue[] | undefined) ?? []).map((item) => {
                  const permission = item.permission as RecordValue | undefined;
                  return text(permission?.code ?? item.code);
                }).filter(Boolean);
                setDraftPermissions(new Set(codes));
              }}
            >
              <option value="">Começar sem permissões</option>
              {roles.map((item) => <option key={String(item.id)} value={String(item.id)}>{text(item.name)}</option>)}
            </select>
          </label>
          <div className="span-2">{permissionAreaEditor(false)}</div>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <div className="modal-footer span-2">
            <button type="button" className="button" onClick={() => setRoleModalOpen(false)}>Cancelar</button>
            <button className="button primary" disabled={busy} type="submit">{busy ? 'Criando…' : 'Criar perfil'}</button>
          </div>
        </form>
      </DirtyFormModal>
      <Modal
        open={roleEditorOpen && Boolean(role)}
        title={text(role?.name, 'Editar perfil')}
        description={isAdminRole
          ? 'Perfil administrador — acesso completo (não editável).'
          : 'Ajuste as permissões e salve para aplicar a todos os usuários deste perfil.'}
        onClose={() => setRoleEditorOpen(false)}
        size="xlarge"
        confirmOnClose={!isAdminRole}
        extraDirty={matrixDirty}
        confirmCloseMessage="Há permissões não salvas. Descartar e fechar?"
      >
        {role ? (
          <>
            {permissionAreaEditor(isAdminRole)}
            {formError ? <p className="form-error" role="alert">{formError}</p> : null}
            <div className="modal-footer">
              <button type="button" className="button" onClick={() => setRoleEditorOpen(false)}>Fechar</button>
              <button
                type="button"
                className="button primary"
                disabled={!matrixDirty || savingRole || isAdminRole}
                onClick={() => void saveRolePermissions()}
              >
                {savingRole ? 'Salvando…' : 'Salvar perfil'}
              </button>
            </div>
          </>
        ) : null}
      </Modal>
      <Modal
        open={Boolean(pendingUserAction)}
        title="Bloquear acesso?"
        description={pendingUserAction ? `${text(pendingUserAction.name)} perderá o acesso ao sistema até ser desbloqueado.` : undefined}
        size="small"
        onClose={() => setPendingUserAction(null)}
      >
        <div className="modal-footer">
          <button type="button" className="button" onClick={() => setPendingUserAction(null)}>Cancelar</button>
          <button
            type="button"
            className="button danger"
            disabled={busy}
            onClick={() => {
              if (pendingUserAction) void toggleUserStatus(pendingUserAction);
              setPendingUserAction(null);
            }}
          >
            Bloquear
          </button>
        </div>
      </Modal>

      {tab === 'team' ? (
        <Panel
          title="Equipe"
          description="Usuários ativos e bloqueados"
          actions={(
            <div className="filters" style={{ margin: 0 }}>
              <input
                className="filter-input"
                style={{ width: 210 }}
                placeholder="Buscar nome ou e-mail"
                value={teamSearch}
                onChange={(event) => setTeamSearch(event.target.value)}
                aria-label="Buscar usuários"
              />
              <select className="filter-select" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filtrar por perfil">
                <option value="">Todos os perfis</option>
                {roles.map((item) => <option key={String(item.id)} value={String(item.id)}>{text(item.name)}</option>)}
              </select>
            </div>
          )}
        >
          {filteredUsers.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Perfil</th>
                    <th>Unidades</th>
                    <th>Último acesso</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={String(user.id)}>
                      <td>
                        <div className="person-cell">
                          <div className="avatar">{initials(user.name)}</div>
                          <div>
                            <strong>{text(user.name)}</strong>
                            <span>{text(user.email)}</span>
                          </div>
                        </div>
                      </td>
                      <td>{roleNames(user)}</td>
                      <td>{text(user.clinicNames ?? user.unitsLabel, '—')}</td>
                      <td>
                        {user.lastLoginAt
                          ? new Date(String(user.lastLoginAt)).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                          : '—'}
                      </td>
                      <td>
                        <StatusBadge tone={user.status === 'ACTIVE' ? 'green' : user.status === 'BLOCKED' ? 'red' : 'amber'}>
                          {presentationLabel(user.status)}
                        </StatusBadge>
                      </td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="icon-button"
                          title="Editar"
                          aria-label={`Editar ${text(user.name)}`}
                          onClick={() => { setFormError(''); setEditUser(user); }}
                        >
                          <Pencil size={15} />
                        </button>
                        {user.status === 'BLOCKED' ? (
                          <button
                            type="button"
                            className="icon-button"
                            title="Desbloquear"
                            aria-label={`Desbloquear ${text(user.name)}`}
                            disabled={busy}
                            onClick={() => void toggleUserStatus(user)}
                          >
                            <ShieldCheck size={15} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="icon-button danger"
                            title="Bloquear"
                            aria-label={`Bloquear ${text(user.name)}`}
                            disabled={busy}
                            onClick={() => setPendingUserAction(user)}
                          >
                            <Ban size={15} />
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
        </Panel>
      ) : null}

      {tab === 'invites' ? (
        <Panel title="Convites" description="Convites enviados e status de aceite">
          {invitations.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th>Perfil</th>
                    <th>Enviado em</th>
                    <th>Expira</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((invite) => (
                    <tr key={String(invite.id)}>
                      <td>
                        <strong>{text(invite.name)}</strong>
                        <div className="muted-note">{text(invite.email)}</div>
                      </td>
                      <td>{text((invite.role as RecordValue | undefined)?.name ?? invite.roleName, '—')}</td>
                      <td>{invite.createdAt ? new Date(String(invite.createdAt)).toLocaleString('pt-BR') : '—'}</td>
                      <td>{invite.expiresAt ? new Date(String(invite.expiresAt)).toLocaleString('pt-BR') : '—'}</td>
                      <td>
                        <StatusBadge tone={invite.status === 'PENDING' ? 'amber' : invite.status === 'ACCEPTED' ? 'green' : 'gray'}>
                          {inviteStatusLabel(invite.status)}
                        </StatusBadge>
                      </td>
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
          ) : (
            <EmptyState title="Nenhum convite" description="Envie um convite para adicionar colaboradores." />
          )}
        </Panel>
      ) : null}

      {tab === 'roles' ? (
        <Panel
          title="Perfis de acesso"
          description="Cada perfil concentra as permissões. Abra o cadastro para visualizar ou editar."
          actions={(
            <button
              type="button"
              className="button small primary"
              onClick={() => {
                setFormError('');
                setDraftPermissions(new Set());
                setRoleModalOpen(true);
              }}
            >
              + Novo perfil
            </button>
          )}
        >
          {roles.length === 0 ? (
            <EmptyState title="Nenhum perfil" description="Crie o primeiro perfil de acesso." />
          ) : (
            <div className="settings-list">
              {roles.map((item) => {
                const userCount = Number((item._count as RecordValue | undefined)?.users ?? 0);
                const permissionCount = list(item.permissions as RecordValue[] | undefined).length;
                const admin = String(item.code ?? '').toUpperCase() === 'ADMIN';
                return (
                  <div className="settings-row" key={String(item.id)}>
                    <div>
                      <strong>{text(item.name)}</strong>
                      <span>{userCount} usuário(s) · {permissionCount} permissão(ões){admin ? ' · administrador' : ''}</span>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-button"
                        title={admin ? 'Visualizar' : 'Editar'}
                        aria-label={`${admin ? 'Visualizar' : 'Editar'} ${text(item.name)}`}
                        onClick={() => {
                          setFormError('');
                          setSelectedRole(String(item.id));
                          setRoleEditorOpen(true);
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
