'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { list, text, type RecordValue } from '@/lib/format';
import { EmptyState, ErrorState, MetricCard, PageHeader, Panel, Skeleton, StatusBadge } from './ui';

export function UsersView() {
  const [users, setUsers] = useState<RecordValue[]>([]);
  const [roles, setRoles] = useState<RecordValue[]>([]);
  const [permissions, setPermissions] = useState<RecordValue[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRaw, rolesRaw, permissionsRaw] = await Promise.all([
        api.get('/users'),
        api.get('/roles'),
        api.get('/permissions'),
      ]);
      const roleList = list(rolesRaw);
      setUsers(list(usersRaw));
      setRoles(roleList);
      setPermissions(list(permissionsRaw));
      setSelectedRole((current) => current ?? (roleList[0]?.id ? String(roleList[0].id) : null));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const role = roles.find((item) => item.id === selectedRole);
  const rolePermissionCodes = new Set(
    list((role?.permissions as RecordValue[] | undefined) ?? []).map((item) => {
      const permission = item.permission as RecordValue | undefined;
      return text(permission?.code ?? item.code);
    }),
  );

  if (loading) return <Skeleton rows={6} />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  return (
    <div className="users-view">
      <PageHeader
        eyebrow="Administração"
        title="Usuários e permissões"
        description="Convites, perfis e matriz RBAC por domínio."
      />
      <div className="metric-grid">
        <MetricCard label="Usuários" value={users.length} />
        <MetricCard label="Ativos" value={users.filter((item) => item.status === 'ACTIVE').length} tone="green" />
        <MetricCard label="Perfis" value={roles.length} />
        <MetricCard label="Permissões" value={permissions.length} tone="amber" />
      </div>
      <div className="users-layout">
        <Panel title="Usuários e convites">
          {users.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Status</th>
                    <th>Perfis</th>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Nenhum usuário" />
          )}
        </Panel>
        <Panel title="Perfis">
          <div className="role-cards">
            {roles.map((item) => (
              <button
                key={String(item.id)}
                type="button"
                className={`role-card ${selectedRole === item.id ? 'active' : ''}`}
                onClick={() => setSelectedRole(String(item.id))}
              >
                <strong>{text(item.name)}</strong>
                <span>{text(item.code)}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>
      <Panel title={`Matriz de permissões · ${text(role?.name) || 'perfil'}`}>
        <div className="permission-matrix">
          {permissions.map((permission) => (
            <label key={String(permission.id)} className="checkbox-row">
              <input type="checkbox" checked={rolePermissionCodes.has(text(permission.code))} readOnly />
              <span>{text(permission.code)}</span>
            </label>
          ))}
        </div>
      </Panel>
    </div>
  );
}
