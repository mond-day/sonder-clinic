'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  CheckSquare,
  ChevronUp,
  CircleDollarSign,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { initials, list, formatPhone, text, type RecordValue } from '@/lib/format';
import { useAuth } from './auth-provider';
import { NotificationsDrawer } from './notifications-drawer';
import { useSelection } from './selection-provider';
import { useTheme } from './theme-provider';
import { useWorkspace } from './workspace-provider';
import { ClinicBrandMark, ClinicBrandText, useClinicBranding } from './clinic-brand';

type NavBadge = 'returns' | 'tasks' | 'lab';

const navGroups: Array<{
  label: string;
  items: Array<{ label: string; href: string; icon: typeof LayoutDashboard; badge?: NavBadge }>;
}> = [
  {
    label: 'Operação',
    items: [
      { label: 'Visão diária', href: '/', icon: LayoutDashboard },
      { label: 'Agenda', href: '/agenda', icon: CalendarDays },
      { label: 'Pacientes', href: '/pacientes', icon: Users },
      { label: 'Central de retornos', href: '/retornos', icon: RefreshCw, badge: 'returns' },
    ],
  },
  {
    label: 'Clínica',
    items: [
      { label: 'Tarefas', href: '/tarefas', icon: CheckSquare, badge: 'tasks' },
      { label: 'Laboratório & casos', href: '/laboratorio', icon: FlaskConical, badge: 'lab' },
      { label: 'Financeiro', href: '/financeiro', icon: CircleDollarSign },
      { label: 'Relatórios', href: '/relatorios', icon: ChartNoAxesCombined },
    ],
  },
  {
    label: 'Administração',
    items: [
      { label: 'Usuários', href: '/usuarios', icon: Users },
      { label: 'Configurações', href: '/configuracoes', icon: Settings },
    ],
  },
];

const mobileItems = [
  { label: 'Início', href: '/', icon: LayoutDashboard },
  { label: 'Agenda', href: '/agenda', icon: CalendarDays },
  { label: 'Pacientes', href: '/pacientes', icon: Users },
  { label: 'Retornos', href: '/retornos', icon: RefreshCw },
];

const COLLAPSE_KEY = 'sonder.sidebarCollapsed';

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { clinics, clinicId, setClinicId } = useSelection();
  const { notifications, returnSummary, openTasks, openLabCases } = useWorkspace();
  const branding = useClinicBranding(clinicId, Boolean(user));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RecordValue[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const badgeCounts = useMemo<Record<NavBadge, number>>(() => ({
    returns: returnSummary ? returnSummary.overdue + returnSummary.today : 0,
    tasks: openTasks,
    lab: openLabCases,
  }), [returnSummary, openTasks, openLabCases]);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  const toggleCollapsed = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches) {
      return;
    }
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setProfileOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!searchWrapRef.current?.contains(event.target as Node)) setSearchOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [searchOpen]);

  useEffect(() => {
    if (!profileOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [profileOpen]);

  useEffect(() => {
    if (!clinicId || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setSearching(true);
      api.get<{
        patients: RecordValue[];
        appointments: RecordValue[];
        treatments: RecordValue[];
        labCases: RecordValue[];
        tasks: RecordValue[];
        documents?: RecordValue[];
        prescriptions?: RecordValue[];
      }>(`/search?clinicId=${clinicId}&q=${encodeURIComponent(query.trim())}`)
        .then((payload) => {
          const patients = list(payload.patients).map((item) => ({ ...item, _kind: 'patient' }));
          const appointments = list(payload.appointments).map((item) => ({
            ...item,
            _kind: 'appointment',
            fullName: text((item.patient as RecordValue | undefined)?.fullName) || 'Consulta',
            primaryPhone: item.startAt ? new Date(String(item.startAt)).toLocaleString('pt-BR') : 'Consulta',
          }));
          const treatments = list(payload.treatments).map((item) => ({
            ...item,
            _kind: 'treatment',
            fullName: text(item.title),
            primaryPhone: text(item.status),
          }));
          const labCases = list(payload.labCases).map((item) => ({
            ...item,
            _kind: 'lab',
            fullName: `${text(item.code)} · ${text(item.description)}`,
            primaryPhone: text(item.status),
          }));
          const tasks = list(payload.tasks).map((item) => ({
            ...item,
            _kind: 'task',
            fullName: text(item.title),
            primaryPhone: text(item.status),
          }));
          const documents = list(payload.documents).map((item) => ({
            ...item,
            _kind: 'document',
            fullName: text(item.name, 'Documento'),
            primaryPhone: text(item.validationCode, text(item.status)),
            href: item.patientId ? `/pacientes/${String(item.patientId)}?tab=documentos` : undefined,
          }));
          const prescriptions = list(payload.prescriptions).map((item) => ({
            ...item,
            _kind: 'prescription',
            fullName: text(item.purpose, 'Prescrição'),
            primaryPhone: text(item.validationCode, text(item.status)),
            href: item.patientId ? `/pacientes/${String(item.patientId)}?tab=documentos` : undefined,
          }));
          setResults([...patients, ...appointments, ...treatments, ...labCases, ...tasks, ...documents, ...prescriptions].slice(0, 12));
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query, clinicId]);

  const userInitials = useMemo(
    () => (user ? initials(user.name) : 'SC'),
    [user],
  );

  if (loading || !user) return <main className="loading-screen">Carregando sessão…</main>;

  const pendingTotal = badgeCounts.returns + badgeCounts.tasks + badgeCounts.lab;

  return (
    <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} id="app-sidebar">
        <div className="sidebar-top">
          <div className="brand">
            <button
              type="button"
              className="brand-mark"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              aria-controls="app-sidebar"
              aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
              title={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            >
              <ClinicBrandMark branding={branding} className="brand-mark-inner" />
            </button>
            <ClinicBrandText branding={branding} />
          </div>
        </div>
        <div className="clinic-switch">
          <small>Unidade ativa</small>
          <select
            aria-label="Clínica atual"
            value={clinicId}
            onChange={(event) => setClinicId(event.target.value)}
          >
            {clinics.map((item) => (
              <option key={item.id} value={item.id}>{item.tradeName}</option>
            ))}
          </select>
        </div>
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="nav-label">{group.label}</div>
            <nav aria-label={group.label}>
              {group.items.map(({ label, href, icon: Icon, badge }) => {
                const count = badge ? badgeCounts[badge] : 0;
                return (
                  <Link
                    key={href}
                    className={`nav-item ${isActive(pathname, href) ? 'active' : ''}`}
                    href={href}
                    title={collapsed ? label : undefined}
                    aria-current={isActive(pathname, href) ? 'page' : undefined}
                  >
                    <Icon size={18} strokeWidth={1.8} />
                    <span className="nav-item-label">{label}</span>
                    {count > 0 && (
                      <span
                        className={`nav-badge ${badge === 'returns' ? 'red' : badge === 'lab' ? 'teal' : ''}`.trim()}
                        aria-label={`${count} pendências`}
                      >
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
        <div className="side-spacer" />
        {pendingTotal > 0 && (
          <div className="side-shortcut">
            <strong>{pendingTotal} pendências prioritárias</strong>
            <span>Retornos, laboratório e tarefas.</span>
            <button type="button" onClick={() => setAlertsOpen(true)}>Abrir central de alertas</button>
          </div>
        )}
        <div className={`profile ${profileOpen ? 'open' : ''}`} ref={profileRef}>
          <button
            type="button"
            className="profile-trigger"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            aria-label="Menu do usuário"
            onClick={() => setProfileOpen((current) => !current)}
          >
            <span className="avatar">{userInitials}</span>
            <div className="profile-text">
              <strong>{user.name}</strong>
              <small>{user.permissions.includes('organization.manage') ? 'Administrador' : 'Usuário'}</small>
            </div>
            <ChevronUp size={14} className={`profile-chevron ${profileOpen ? 'open' : ''}`} aria-hidden />
          </button>
          {profileOpen ? (
            <div className="profile-menu" role="menu">
              <div className="profile-menu-identity">
                <strong>{user.name}</strong>
                <small>{user.email || (user.permissions.includes('organization.manage') ? 'Administrador' : 'Usuário')}</small>
              </div>
              <label className="switch-row profile-menu-theme" role="menuitemcheckbox" aria-checked={theme === 'dark'}>
                <span className="switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={theme === 'dark'}
                    onChange={(event) => setTheme(event.target.checked ? 'dark' : 'light')}
                    aria-label="Tema escuro"
                  />
                  <span className="switch-track" aria-hidden />
                </span>
                Tema escuro
              </label>
              <button
                type="button"
                role="menuitem"
                className="profile-menu-item danger"
                onClick={() => {
                  setProfileOpen(false);
                  void logout();
                }}
              >
                <LogOut size={15} />
                Sair
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button
            className="mobile-menu-btn"
            aria-label={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            onClick={() => setSidebarOpen((value) => !value)}
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="global-search-wrap" ref={searchWrapRef}>
            <Search className="search-icon" size={18} aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Pesquisar pacientes, agenda, tratamentos…"
              aria-label="Pesquisa global"
            />
            <span className="search-key">⌘ K</span>
            {searchOpen && query.trim().length >= 2 && (
              <div className="search-results" role="listbox">
                {searching && <button type="button" disabled>Buscando…</button>}
                {!searching && results.length === 0 && (
                  <button type="button" disabled>Nenhum resultado</button>
                )}
                {results.map((item) => (
                  <button
                    key={`${String(item._kind)}-${String(item.id)}`}
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      setQuery('');
                      const kind = String(item._kind ?? 'patient');
                      if (kind === 'appointment') router.push('/agenda');
                      else if (kind === 'treatment') router.push(`/pacientes/${String(item.patientId ?? '')}?tab=tratamentos`);
                      else if (kind === 'lab') router.push('/laboratorio');
                      else if (kind === 'task') router.push('/tarefas');
                      else if (kind === 'document' || kind === 'prescription') {
                        router.push(String(item.href ?? `/pacientes/${String(item.patientId ?? '')}?tab=documentos`));
                      }
                      else router.push(`/pacientes/${String(item.id)}`);
                    }}
                  >
                    <span className="avatar">{initials(item.fullName)}</span>
                    <div>
                      <strong>{text(item.fullName)}</strong>
                      <span>
                        {String(item._kind) === 'patient'
                          ? formatPhone(item.primaryPhone)
                          : text(item.primaryPhone)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="top-actions">
            <Link className="icon-button" href="/tarefas" aria-label="Tarefas" title="Tarefas">
              <CheckSquare size={18} />
              {badgeCounts.tasks > 0 && <span className="notification-dot" />}
            </Link>
            <button
              className="icon-button"
              type="button"
              aria-label={`Notificações${notifications.unreadCount ? ` (${notifications.unreadCount} não lidas)` : ''}`}
              title="Notificações"
              aria-expanded={alertsOpen}
              aria-haspopup="dialog"
              onClick={() => setAlertsOpen(true)}
            >
              <Bell size={18} />
              {notifications.unreadCount > 0 && <span className="notification-dot" />}
            </button>
            <Link className="quick-btn" href="/agenda">
              <Plus size={16} />
              <span>Novo</span>
            </Link>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>

      <nav className="mobile-nav" aria-label="Navegação móvel">
        {mobileItems.map(({ label, href, icon: Icon }) => (
          <Link className={isActive(pathname, href) ? 'active' : ''} href={href} key={href}>
            <Icon size={19} />
            <span>{label}</span>
          </Link>
        ))}
        <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Mais módulos">
          <Menu size={19} />
          <span>Mais</span>
        </button>
      </nav>

      <NotificationsDrawer open={alertsOpen} onClose={() => setAlertsOpen(false)} />
    </div>
  );
}
