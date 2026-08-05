'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { list, type RecordValue } from '@/lib/format';
import { useAuth } from './auth-provider';
import { useSelection } from './selection-provider';

export type NotificationCategory = 'CLINICAL' | 'FINANCE' | 'TASK' | 'LAB' | 'PATIENT';

export type Notification = {
  id: string;
  category: NotificationCategory;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  body: string;
  linkPath?: string | null;
  readAt?: string | null;
  createdAt: string;
};

export type NotificationFeed = {
  items: Notification[];
  unreadCount: number;
  counts: Record<string, number>;
};

export type ReturnSummary = {
  overdue: number;
  today: number;
  next7Days: number;
  total: number;
  contacted: number;
  scheduled: number;
  conversionRate: number;
  funnel: { generated: number; contacted: number; responded: number; scheduled: number };
};

type WorkspaceContextValue = {
  notifications: NotificationFeed;
  returnSummary: ReturnSummary | null;
  openTasks: number;
  openLabCases: number;
  refresh(): void;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
};

const emptyFeed: NotificationFeed = { items: [], unreadCount: 0, counts: {} };
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * Consolida os contadores do workspace (retornos, tarefas, laboratório e
 * notificações) usados pela sidebar e pelo painel de alertas. Sem polling: os
 * dados são revalidados na troca de rota e ao abrir o painel, conforme
 * docs/api/pending-workspace-contracts.md.
 */
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { clinicId } = useSelection();
  const pathname = usePathname();
  const [notifications, setNotifications] = useState<NotificationFeed>(emptyFeed);
  const [returnSummary, setReturnSummary] = useState<ReturnSummary | null>(null);
  const [openTasks, setOpenTasks] = useState(0);
  const [openLabCases, setOpenLabCases] = useState(0);

  const refresh = useCallback(() => {
    if (!user || !clinicId) return;
    const scope = `clinicId=${clinicId}`;
    void api.get<NotificationFeed>(`/notifications?${scope}`)
      .then((feed) => setNotifications({
        items: (feed.items ?? []) as Notification[],
        unreadCount: feed.unreadCount ?? 0,
        counts: feed.counts ?? {},
      }))
      .catch(() => setNotifications(emptyFeed));
    void api.get<ReturnSummary>(`/return-alerts/summary?${scope}`)
      .then(setReturnSummary)
      .catch(() => setReturnSummary(null));
    void api.get<RecordValue[]>(`/tasks?${scope}`)
      .then((items) => setOpenTasks(list(items).filter((item) => item.status !== 'DONE').length))
      .catch(() => setOpenTasks(0));
    void api.get<RecordValue[]>(`/lab-cases?${scope}`)
      .then((items) => setOpenLabCases(
        list(items).filter((item) => !['INSTALLED', 'CANCELLED'].includes(String(item.status))).length,
      ))
      .catch(() => setOpenLabCases(0));
  }, [user, clinicId]);

  useEffect(refresh, [refresh, pathname]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((current) => {
      const target = current.items.find((item) => item.id === id);
      if (!target || target.readAt) return current;
      const nextCounts = { ...current.counts };
      nextCounts.ALL = Math.max(0, (nextCounts.ALL ?? 0) - 1);
      nextCounts[target.category] = Math.max(0, (nextCounts[target.category] ?? 0) - 1);
      return {
        items: current.items.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)),
        unreadCount: Math.max(0, current.unreadCount - 1),
        counts: nextCounts,
      };
    });
    await api.post(`/notifications/${id}/read`, {}).catch(() => undefined);
  }, []);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((current) => ({
      items: current.items.map((item) => ({ ...item, readAt: item.readAt ?? now })),
      unreadCount: 0,
      counts: {},
    }));
    await api.post('/notifications/read-all', { clinicId }).catch(() => undefined);
  }, [clinicId]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({ notifications, returnSummary, openTasks, openLabCases, refresh, markRead, markAllRead }),
    [notifications, returnSummary, openTasks, openLabCases, refresh, markRead, markAllRead],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace deve ser usado dentro de WorkspaceProvider.');
  return value;
}
