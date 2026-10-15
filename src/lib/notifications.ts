// Helper for cross-platform PWA / Mobile native notifications
export interface ExtendedNotificationOptions extends NotificationOptions {
  vibrate?: number[];
  renotify?: boolean;
  requireInteraction?: boolean;
  url?: string;
  companyLogo?: string;
}

export async function sendPwaPushNotification(
  title: string,
  options: ExtendedNotificationOptions = {}
) {
  if (typeof window === 'undefined') return;

  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const resolvedIcon = options.companyLogo || options.icon || '/vite.svg';

  const notifOptions: any = {
    icon: resolvedIcon,
    badge: resolvedIcon,
    vibrate: [500, 200, 500, 200, 500, 200, 800],
    requireInteraction: true,
    tag: options.tag || 'atendepro-alert',
    renotify: true,
    ...options,
    data: {
      url: options.url || window.location.href,
      ...(options.data || {})
    }
  };

  // Try Service Worker registration first (Required on Android PWA to ring phone and show heads-up banner)
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, notifOptions);
        return;
      }
    }
  } catch (e) {
    console.warn('Service Worker showNotification error, trying Window Notification fallback:', e);
  }

  // Fallback to standard Window Notification
  try {
    new Notification(title, notifOptions);
  } catch (e) {
    console.warn('Window Notification failed:', e);
  }
}
