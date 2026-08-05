'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
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
import { initials, list, text, type RecordValue } from '@/lib/format';
import { useAuth } from './auth-provider';
import { NotificationsDrawer } from './notifications-drawer';
import { useSelection } from './selection-provider';
import { useWorkspace } from './workspace-provider';

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
  const { clinics, clinicId, setClinicId } = useSelection();
  const { notifications, returnSummary, openTasks, openLabCases } = useWorkspace();
  const clinic = clinics.find((item) => item.id === clinicId);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RecordValue[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const badgeCounts = useMemo<Record<NavBadge, number>>(() => ({
    returns: returnSummary ? returnSummary.overdue + returnSummary.today : 0,
    tasks: openTasks,
    lab: openLabCases,
  }), [returnSummary, openTasks, openLabCases]);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  const toggleCollapsed = useCallback(() => {
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
      if (event.key === 'Escape') setSearchOpen(false);
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
    if (!clinicId || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setSearching(true);
      api.get<RecordValue[]>(`/patients?clinicId=${clinicId}&search=${encodeURIComponent(query.trim())}`)
        .then((items) => setResults(list(items).slice(0, 8)))
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
            <span className="brand-mark">S</span>
            <div className="brand-text">
              <strong>Sonder Clinic</strong>
              <small>Workspace clínico</small>
            </div>
          </div>
          <button
            className="sidebar-toggle"
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
            aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            title={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
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
        <div className="profile">
          <span className="avatar">{userInitials}</span>
          <div className="profile-text">
            <strong>{user.name}</strong>
            <small>{user.permissions.includes('organization.manage') ? 'Administrador' : 'Usuário'}</small>
          </div>
          <button className="row-menu" aria-label="Sair" title="Sair" onClick={() => void logout()}>
            <LogOut size={16} />
          </button>
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
              placeholder="Pesquisar paciente, CPF ou telefone"
              aria-label="Pesquisa global de pacientes"
            />
            <span className="search-key">⌘ K</span>
            {searchOpen && query.trim().length >= 2 && (
              <div className="search-results" role="listbox">
                {searching && <button type="button" disabled>Buscando…</button>}
                {!searching && results.length === 0 && (
                  <button type="button" disabled>Nenhum paciente encontrado</button>
                )}
                {results.map((patient) => (
                  <button
                    key={String(patient.id)}
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      setQuery('');
                      router.push(`/pacientes/${String(patient.id)}`);
                    }}
                  >
                    <span className="avatar">{initials(patient.fullName)}</span>
                    <div>
                      <strong>{text(patient.fullName)}</strong>
                      <span>{text(patient.primaryPhone)}</span>
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
