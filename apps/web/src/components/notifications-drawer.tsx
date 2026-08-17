'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCheck,
  CheckSquare,
  CircleDollarSign,
  FlaskConical,
  Info,
  Stethoscope,
  User,
  X,
} from 'lucide-react';
import { useWorkspace, type Notification, type NotificationCategory } from './workspace-provider';
import {
  desktopNotificationsSupported,
  getDesktopNotificationPermission,
  getDesktopNotificationPreference,
  requestDesktopNotificationPermission,
  setDesktopNotificationPreference,
  type DesktopNotificationPreference,
} from '@/lib/desktop-notifications';

const tabs: Array<{ label: string; key: 'ALL' | NotificationCategory }> = [
  { label: 'Todos', key: 'ALL' },
  { label: 'Clínicos', key: 'CLINICAL' },
  { label: 'Financeiros', key: 'FINANCE' },
  { label: 'Tarefas', key: 'TASK' },
  { label: 'Laboratório', key: 'LAB' },
];

const categoryIcon: Record<NotificationCategory, typeof Info> = {
  CLINICAL: Stethoscope,
  FINANCE: CircleDollarSign,
  TASK: CheckSquare,
  LAB: FlaskConical,
  PATIENT: User,
};

function severityTone(severity: Notification['severity']) {
  if (severity === 'CRITICAL') return 'red';
  if (severity === 'WARNING') return 'amber';
  return 'blue';
}

function relativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

export function NotificationsDrawer({ open, onClose }: { open: boolean; onClose(): void }) {
  const router = useRouter();
  const { notifications, refresh, markRead, markAllRead } = useWorkspace();
  const [tab, setTab] = useState<'ALL' | NotificationCategory>('ALL');
  const [desktopPref, setDesktopPref] = useState<DesktopNotificationPreference>('off');
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    refresh();
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      // Mantém o foco preso no painel enquanto ele estiver aberto.
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [open, onClose, refresh]);

  useEffect(() => {
    if (!open) return;
    setDesktopPref(getDesktopNotificationPreference());
    setDesktopPermission(getDesktopNotificationPermission());
  }, [open]);

  async function toggleDesktopAlerts(next: boolean) {
    if (!desktopNotificationsSupported()) return;
    if (!next) {
      setDesktopNotificationPreference('off');
      setDesktopPref('off');
      return;
    }
    let permission = getDesktopNotificationPermission();
    if (permission === 'denied') {
      setDesktopNotificationPreference('off');
      setDesktopPref('off');
      setDesktopPermission(permission);
      return;
    }
    if (permission === 'default') {
      permission = await requestDesktopNotificationPermission();
      setDesktopPermission(permission);
      if (permission !== 'granted') {
        setDesktopNotificationPreference('off');
        setDesktopPref('off');
        return;
      }
    }
    setDesktopNotificationPreference('on');
    setDesktopPref('on');
  }

  const desktopUnsupported = desktopPermission === 'unsupported';
  const desktopDenied = desktopPermission === 'denied';
  const desktopHint = desktopUnsupported
    ? 'Seu navegador não permite alertas na área de trabalho.'
    : desktopDenied
      ? 'Libere os alertas nas configurações do navegador para usar este recurso.'
      : 'Receba um aviso no computador quando o sistema estiver aberto em segundo plano.';

  const visible = tab === 'ALL'
    ? notifications.items
    : notifications.items.filter((item) => item.category === tab);

  async function activate(item: Notification) {
    await markRead(item.id);
    if (item.linkPath) {
      onClose();
      router.push(item.linkPath);
    }
  }

  return (
    <>
      <div
        className={`drawer-overlay ${open ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        className={`alerts-drawer ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Central de alertas"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="drawer-head">
          <div>
            <h2>Central de alertas</h2>
            <p>
              {notifications.unreadCount > 0
                ? `${notifications.unreadCount} ${notifications.unreadCount === 1 ? 'item precisa' : 'itens precisam'} de atenção`
                : 'Nenhum alerta não lido'}
            </p>
          </div>
          <div className="drawer-head-actions">
            {notifications.unreadCount > 0 && (
              <button
                className="button small"
                type="button"
                onClick={() => void markAllRead()}
                title="Marcar todos como lidos"
              >
                <CheckCheck size={14} />Marcar lidos
              </button>
            )}
            <button ref={closeRef} className="close-btn" type="button" onClick={onClose} aria-label="Fechar alertas">
              <X size={17} />
            </button>
          </div>
        </div>
        <div className="drawer-desktop-alerts">
          <label className="switch-row">
            <span>Alertas no computador</span>
            <span className="switch">
              <input
                type="checkbox"
                role="switch"
                checked={desktopPref === 'on'}
                disabled={desktopUnsupported}
                onChange={(event) => void toggleDesktopAlerts(event.target.checked)}
                aria-label="Alertas no computador"
              />
              <span className="switch-track" aria-hidden />
            </span>
          </label>
          <p>{desktopHint}</p>
        </div>
        <div className="drawer-tabs" role="tablist" aria-label="Categorias de alerta">
          {tabs.map(({ label, key }) => {
            const count = key === 'ALL' ? notifications.counts.ALL ?? 0 : notifications.counts[key] ?? 0;
            return (
              <button
                key={key}
                className={`drawer-tab ${tab === key ? 'active' : ''}`}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
              >
                {label}
                {count > 0 && <span className="drawer-tab-count">{count}</span>}
              </button>
            );
          })}
        </div>
        <div className="alert-list">
          {visible.length === 0 && (
            <div className="state-message">Nenhum alerta nesta categoria.</div>
          )}
          {visible.map((item) => {
            const Icon = categoryIcon[item.category] ?? Info;
            const unread = !item.readAt;
            return (
              <button
                key={item.id}
                className={`alert-item ${unread ? 'unread' : ''}`}
                type="button"
                onClick={() => void activate(item)}
              >
                <span className={`alert-icon ${severityTone(item.severity)}`}>
                  {item.severity === 'CRITICAL' ? <AlertTriangle size={16} /> : <Icon size={16} />}
                </span>
                <span className="alert-copy">
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                  <small>{relativeTime(item.createdAt)}</small>
                </span>
                {unread && <span className="alert-unread-dot" aria-label="Não lido" />}
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
