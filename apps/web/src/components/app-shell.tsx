'use client';

import {
  Bell,
  CalendarDays,
  CircleDollarSign,
  FileText,
  LayoutDashboard,
  MessageSquareText,
  Search,
  ChartNoAxesCombined,
  Settings,
  Stethoscope,
  Users,
  WalletCards,
  LogOut,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './auth-provider';
import { useSelection } from './selection-provider';

const navigation = [
  { label: 'Visão geral', href: '/', icon: LayoutDashboard },
  { label: 'Agenda', href: '/agenda', icon: CalendarDays },
  { label: 'Pacientes', href: '/pacientes', icon: Users },
  { label: 'Tratamentos', href: '/tratamentos', icon: Stethoscope },
  { label: 'Documentos', href: '/documentos', icon: FileText },
  { label: 'Financeiro', href: '/financeiro', icon: CircleDollarSign },
  { label: 'Comissões', href: '/comissoes', icon: WalletCards },
  { label: 'Comunicação', href: '/comunicacao', icon: MessageSquareText },
  { label: 'Relatórios', href: '/relatorios', icon: ChartNoAxesCombined },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const { clinics, clinicId, setClinicId } = useSelection();
  const clinic = clinics.find((item) => item.id === clinicId);
  const brandName = process.env.BRAND_NAME ?? 'Sonder';
  const brandSubtitle = process.env.BRAND_SUBTITLE ?? 'Clinic';

  if (loading || !user) return <main className="loading-screen">Carregando sessão…</main>;

  const initials = user.name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <div><strong>{brandName}</strong><small>{brandSubtitle}</small></div>
        </div>
        <nav aria-label="Navegação principal">
          {navigation.map(({ label, href, icon: Icon }) => (
            <Link className={`nav-item ${pathname === href ? 'active' : ''}`} href={href} key={href}>
              <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link className={`nav-item ${pathname === '/integracoes' ? 'active' : ''}`} href="/integracoes"><Settings size={19} /><span>Configurações</span></Link>
          <div className="user-card">
            <span className="avatar">{initials}</span>
            <div><strong>{user.name}</strong><small>{user.permissions.includes('organization.manage') ? 'Administradora' : 'Usuário'}</small></div>
            <button className="row-menu" aria-label="Sair" title="Sair" onClick={() => void logout()}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <label className="clinic-selector"><span className="clinic-dot" /><select aria-label="Clínica atual" value={clinicId} onChange={(event) => setClinicId(event.target.value)}>{clinics.map((item) => <option key={item.id} value={item.id}>{item.tradeName}</option>)}</select><small>{clinic?.units[0]?.name ?? 'Sem unidade'}</small></label>
          <button className="global-search"><Search size={17} />Buscar paciente ou ação… <kbd>⌘ K</kbd></button>
          <button className="icon-button" aria-label="Notificações"><Bell size={19} /><span className="notification-dot" /></button>
        </header>
        <main className="content">{children}</main>
      </div>
      <nav className="mobile-nav" aria-label="Navegação móvel">
        {navigation.slice(0, 4).map(({ label, href, icon: Icon }) => (
          <Link href={href} key={href}><Icon size={20} /><span>{label}</span></Link>
        ))}
      </nav>
    </div>
  );
}
