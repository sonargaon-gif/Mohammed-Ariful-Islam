import { QrContactPayload } from '../types/contacts';

export function generateFreeConnectDeviceId(): string {
  const bytes = new Uint8Array(3);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 3; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
  return `FC-${hex}`;
}

export function encodeContactQrUri(payload: QrContactPayload): string {
  const params = new URLSearchParams();
  params.set('v', '1');
  params.set('name', payload.name.trim());
  params.set('username', payload.username.trim());
  params.set('deviceId', payload.deviceId.trim().toUpperCase());
  if (payload.phoneNumber?.trim()) {
    params.set('phone', payload.phoneNumber.trim());
  }
  if (payload.description?.trim()) {
    params.set('desc', payload.description.trim());
  }
  return `freeconnect://contact?${params.toString()}`;
}

export function decodeContactQrString(rawInput: string): QrContactPayload | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // Support freeconnect://contact?... and freeconnect://pair?...
  if (trimmed.toLowerCase().startsWith('freeconnect://')) {
    try {
      const normalized = trimmed.replace(/^freeconnect:\/\//i, 'https://freeconnect.local/');
      const url = new URL(normalized);
      const deviceId =
        url.searchParams.get('deviceId') ||
        url.searchParams.get('node') ||
        url.searchParams.get('id') ||
        '';
      const name = url.searchParams.get('name') || '';
      const username = url.searchParams.get('username') || '';
      const phoneNumber = url.searchParams.get('phone') || '';
      const description = url.searchParams.get('desc') || url.searchParams.get('description') || '';

      if (!deviceId && !name) return null;
      return {
        v: 1,
        name: name || `Peer ${deviceId}`,
        username: username || (name ? `@${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : ''),
        deviceId: (deviceId || generateFreeConnectDeviceId()).toUpperCase(),
        phoneNumber,
        description,
      };
    } catch {
      return null;
    }
  }

  // Support JSON QR payloads
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<QrContactPayload> & { nodeId?: string };
      const deviceId = parsed.deviceId || parsed.nodeId || '';
      if (!deviceId && !parsed.name) return null;
      return {
        v: 1,
        name: parsed.name || `Peer ${deviceId}`,
        username: parsed.username || '',
        deviceId: (deviceId || generateFreeConnectDeviceId()).toUpperCase(),
        phoneNumber: parsed.phoneNumber || '',
        description: parsed.description || '',
      };
    } catch {
      return null;
    }
  }

  // Support plain FreeConnect Device ID (e.g. FC-A814F2)
  if (/^FC-[A-F0-9]{4,12}$/i.test(trimmed)) {
    return {
      v: 1,
      name: '',
      username: '',
      deviceId: trimmed.toUpperCase(),
      phoneNumber: '',
      description: '',
    };
  }

  return null;
}

export function resizeAvatarFileToDataUrl(file: File, maxSize = 192): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'FC';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
