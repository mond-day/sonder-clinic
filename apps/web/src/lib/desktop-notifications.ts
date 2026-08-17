const STORAGE_KEY = 'sonder:desktop-notifications';

export type DesktopNotificationPreference = 'on' | 'off';

export type DesktopNotificationInput = {
  title: string;
  body: string;
  tag?: string;
  href?: string;
  onClick?: () => void;
};

export function desktopNotificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getDesktopNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!desktopNotificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export function getDesktopNotificationPreference(): DesktopNotificationPreference {
  if (typeof window === 'undefined') return 'off';
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on' ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

export function setDesktopNotificationPreference(value: DesktopNotificationPreference) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore quota / private mode */
  }
}

export async function requestDesktopNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!desktopNotificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function notifyDesktop(input: DesktopNotificationInput) {
  if (!desktopNotificationsSupported()) return false;
  if (getDesktopNotificationPreference() !== 'on') return false;
  if (Notification.permission !== 'granted') return false;
  try {
    const notification = new Notification(input.title, {
      body: input.body,
      tag: input.tag,
    });
    notification.onclick = () => {
      try { window.focus(); } catch { /* ignore */ }
      notification.close();
      input.onClick?.();
    };
    return true;
  } catch {
    return false;
  }
}

export function pickNewUnreadNotifications<T extends { id: string; readAt?: string | null }>(
  items: T[],
  knownIds: Set<string>,
) {
  return items.filter((item) => !item.readAt && !knownIds.has(item.id));
}

export function buildDesktopNotificationPlan<T extends {
  id: string;
  title: string;
  body: string;
  linkPath?: string | null;
}>(items: T[]): Array<{ title: string; body: string; tag: string; href?: string }> {
  if (items.length > 3) {
    return [{
      title: 'Central de alertas',
      body: `Você tem ${items.length} novos alertas`,
      tag: 'sonder-alerts-batch',
    }];
  }
  return items.map((item) => ({
    title: item.title,
    body: item.body,
    tag: item.id,
    href: item.linkPath ?? undefined,
  }));
}
