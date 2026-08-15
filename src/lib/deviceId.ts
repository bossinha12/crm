/**
 * Device fingerprint & lock manager for sellers
 */

export function getOrCreateDeviceId(): string {
  const STORAGE_KEY = 'atendepro_device_fingerprint_id';
  let deviceId = localStorage.getItem(STORAGE_KEY);
  
  if (!deviceId) {
    // Generate unique device signature with random crypto entropy
    const randomPart = Math.random().toString(36).substring(2, 12);
    const timePart = Date.now().toString(36);
    deviceId = `dev_${timePart}_${randomPart}`;
    try {
      localStorage.setItem(STORAGE_KEY, deviceId);
    } catch (e) {
      console.warn("Could not persist deviceId in localStorage:", e);
    }
  }
  
  return deviceId;
}

export function getDeviceDescription(): string {
  if (typeof navigator === 'undefined') return 'Dispositivo Web';
  
  const ua = navigator.userAgent || '';
  let os = 'Dispositivo Web';
  
  if (/Android/i.test(ua)) {
    os = 'Celular Android';
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    os = 'iPhone / iPad (iOS)';
  } else if (/Windows/i.test(ua)) {
    os = 'Computador Windows';
  } else if (/Macintosh|Mac OS/i.test(ua)) {
    os = 'Computador Mac';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
  }
  
  return os;
}
