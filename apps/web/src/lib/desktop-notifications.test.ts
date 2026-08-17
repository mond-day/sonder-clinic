import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDesktopNotificationPlan,
  getDesktopNotificationPreference,
  notifyDesktop,
  pickNewUnreadNotifications,
  requestDesktopNotificationPermission,
  setDesktopNotificationPreference,
} from './desktop-notifications';

class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
  static instances: FakeNotification[] = [];
  onclick: (() => void) | null = null;
  constructor(
    readonly title: string,
    readonly options?: NotificationOptions,
  ) {
    FakeNotification.instances.push(this);
  }
  close() { /* noop */ }
}

const memory = new Map<string, string>();

describe('desktop-notifications', () => {
  beforeEach(() => {
    memory.clear();
    FakeNotification.instances = [];
    FakeNotification.permission = 'granted';
    FakeNotification.requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('Notification', FakeNotification);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preferência padrão é off e só dispara com on + permissão', () => {
    expect(getDesktopNotificationPreference()).toBe('off');
    expect(notifyDesktop({ title: 'A', body: 'B' })).toBe(false);
    setDesktopNotificationPreference('on');
    expect(notifyDesktop({ title: 'A', body: 'B', tag: 't1' })).toBe(true);
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0]?.title).toBe('A');
  });

  it('não dispara se a permissão não foi concedida', () => {
    setDesktopNotificationPreference('on');
    FakeNotification.permission = 'denied';
    expect(notifyDesktop({ title: 'A', body: 'B' })).toBe(false);
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it('pede permissão no gesto do usuário', async () => {
    await expect(requestDesktopNotificationPermission()).resolves.toBe('granted');
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('primeiro lote vira baseline: só ids novos e não lidos entram', () => {
    const known = new Set(['old', 'read-later']);
    expect(pickNewUnreadNotifications([
      { id: 'old', title: 'Já visto', body: '', readAt: null },
      { id: 'read-later', title: 'Lido', body: '', readAt: '2026-01-01' },
      { id: 'new', title: 'Novo', body: 'Chegou', readAt: null },
    ], known).map((item) => item.id)).toEqual(['new']);
  });

  it('agrupa quando há mais de 3 novos', () => {
    const items = [1, 2, 3, 4].map((n) => ({
      id: `n${n}`,
      title: `Alerta ${n}`,
      body: `Corpo ${n}`,
    }));
    expect(buildDesktopNotificationPlan(items)).toEqual([{
      title: 'Central de alertas',
      body: 'Você tem 4 novos alertas',
      tag: 'sonder-alerts-batch',
    }]);
    expect(buildDesktopNotificationPlan(items.slice(0, 2))).toEqual([
      { title: 'Alerta 1', body: 'Corpo 1', tag: 'n1', href: undefined },
      { title: 'Alerta 2', body: 'Corpo 2', tag: 'n2', href: undefined },
    ]);
  });
});
