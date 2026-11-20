import { BrowserCapabilityReport, LiveConnectionState, WireMessagePacket } from '../types/contacts';
import { detectNativeBridge } from './nativeOfflineBridge';

/**
 * Standard & FreeConnect BLE GATT Messaging Services:
 * - FreeConnect Custom GATT Service (matches native Android BLE peripheral)
 * - Nordic UART Service (NUS) — widely used by BLE messaging apps, nRF, ESP32
 * - HM-10 / BLE Serial UART Service
 */
export const BLE_MESSAGING_SERVICES = [
  {
    label: 'FreeConnect BLE Service',
    serviceUuid: 'f000fc01-0451-4000-b000-000000000000',
    txUuid: 'f000fc02-0451-4000-b000-000000000000',
    rxUuid: 'f000fc03-0451-4000-b000-000000000000',
  },
  {
    label: 'Nordic UART Service (NUS)',
    serviceUuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    txUuid: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    rxUuid: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  },
  {
    label: 'BLE Serial UART (FFE0)',
    serviceUuid: '0000ffe0-0000-1000-8000-00805f9b34fb',
    txUuid: '0000ffe1-0000-1000-8000-00805f9b34fb',
    rxUuid: '0000ffe1-0000-1000-8000-00805f9b34fb',
  },
] as const;

interface WebBluetoothCharacteristicLike {
  uuid: string;
  value?: DataView;
  properties?: {
    write?: boolean;
    writeWithoutResponse?: boolean;
    notify?: boolean;
    indicate?: boolean;
  };
  writeValueWithResponse?: (value: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
  writeValue?: (value: BufferSource) => Promise<void>;
  startNotifications?: () => Promise<WebBluetoothCharacteristicLike>;
  stopNotifications?: () => Promise<WebBluetoothCharacteristicLike>;
  addEventListener?: (type: string, listener: (ev: Event) => void) => void;
  removeEventListener?: (type: string, listener: (ev: Event) => void) => void;
}

interface WebBluetoothServiceLike {
  uuid: string;
  getCharacteristic: (uuid: string) => Promise<WebBluetoothCharacteristicLike>;
  getCharacteristics?: () => Promise<WebBluetoothCharacteristicLike[]>;
}

interface WebBluetoothGattServer {
  connected: boolean;
  connect: () => Promise<WebBluetoothGattServer>;
  disconnect: () => void;
  getPrimaryService: (uuid: string) => Promise<WebBluetoothServiceLike>;
  getPrimaryServices?: () => Promise<WebBluetoothServiceLike[]>;
}

interface WebBluetoothDeviceLike {
  id: string;
  name?: string;
  gatt?: WebBluetoothGattServer;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

interface WebBluetoothNavigator extends Navigator {
  bluetooth?: {
    getAvailability?: () => Promise<boolean>;
    addEventListener?: (type: 'availabilitychanged', listener: (ev: Event & { value?: boolean }) => void) => void;
    removeEventListener?: (type: 'availabilitychanged', listener: (ev: Event & { value?: boolean }) => void) => void;
    requestDevice: (options: {
      acceptAllDevices?: boolean;
      filters?: Array<{ services?: string[]; namePrefix?: string }>;
      optionalServices?: string[];
    }) => Promise<WebBluetoothDeviceLike>;
    getDevices?: () => Promise<WebBluetoothDeviceLike[]>;
  };
}

interface ActiveBleSession {
  contactId: string;
  device: WebBluetoothDeviceLike;
  txChar: WebBluetoothCharacteristicLike | null;
  rxChar: WebBluetoothCharacteristicLike | null;
  serviceLabel: string | null;
  rxHandler?: (ev: Event) => void;
  disconnectHandler?: () => void;
}

const activeBleSessions = new Map<string, ActiveBleSession>();
// Retain device handles for genuine automatic reconnection when a BLE link drops unexpectedly
const reconnectableBleDevices = new Map<string, WebBluetoothDeviceLike>();

// Reassembly buffers for chunked BLE frames: FC1|<packetId>|<seq>/<total>|<payload>
const incomingFrameBuffers = new Map<
  string,
  { total: number; parts: Map<number, string>; receivedAt: number }
>();

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function detectBrowserCapabilities(): BrowserCapabilityReport {
  const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';
  const nav = isBrowser ? (navigator as WebBluetoothNavigator) : undefined;
  let isEmbeddedIframe = false;
  try {
    isEmbeddedIframe = isBrowser && window.self !== window.top;
  } catch {
    isEmbeddedIframe = true;
  }

  const ua = isBrowser ? navigator.userAgent : '';
  const isIos =
    /iPad|iPhone|iPod/i.test(ua) ||
    (isBrowser && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const nativeBridge = detectNativeBridge();

  return {
    indexedDbSupported: isBrowser && 'indexedDB' in window,
    webBluetoothSupported: Boolean(
      !isIos && nav?.bluetooth && typeof nav.bluetooth.requestDevice === 'function'
    ),
    webRtcSupported: isBrowser && typeof window.RTCPeerConnection !== 'undefined',
    cameraSupported: Boolean(
      nav?.mediaDevices && typeof nav.mediaDevices.getUserMedia === 'function'
    ),
    microphoneSupported: Boolean(
      nav?.mediaDevices &&
        typeof nav.mediaDevices.getUserMedia === 'function' &&
        typeof MediaRecorder !== 'undefined'
    ),
    isSecureContext: isBrowser ? Boolean(window.isSecureContext) : false,
    isEmbeddedIframe,
    isIos,
    isAndroid,
    nativeBridgePlatform: nativeBridge.platform,
    nativeTransports: nativeBridge.transports,
  };
}

/**
 * Queries real Bluetooth adapter availability from Chrome/Edge/Opera Web Bluetooth API.
 * Never invokes Web Bluetooth on iOS Safari.
 */
export async function queryWebBluetoothAvailability(): Promise<{
  supported: boolean;
  available: boolean | null;
  permissionBlocked: boolean;
  reason: string;
}> {
  const caps = detectBrowserCapabilities();
  if (caps.isIos) {
    return {
      supported: false,
      available: false,
      permissionBlocked: false,
      reason:
        'iOS Safari does not support the Web Bluetooth API. Native Apple CoreBluetooth / MultipeerConnectivity (included in ios-freeconnect/) is required on iPhone.',
    };
  }
  if (!caps.webBluetoothSupported) {
    return {
      supported: false,
      available: false,
      permissionBlocked: false,
      reason:
        'This browser does not implement the Web Bluetooth API. Use Chrome, Edge, or Opera over HTTPS, or build the native Android/iOS FreeConnect app.',
    };
  }
  if (!caps.isSecureContext) {
    return {
      supported: false,
      available: false,
      permissionBlocked: true,
      reason: 'Web Bluetooth requires a secure HTTPS context (or localhost).',
    };
  }

  const nav = navigator as WebBluetoothNavigator;
  if (typeof nav.bluetooth?.getAvailability === 'function') {
    try {
      const available = await nav.bluetooth.getAvailability();
      return {
        supported: true,
        available,
        permissionBlocked: false,
        reason: available
          ? 'Bluetooth adapter detected and ready via Web Bluetooth (Central mode).'
          : 'No powered-on Bluetooth adapter was detected by this browser. Turn Bluetooth ON in your device system settings, then tap Turn Bluetooth ON again.',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();
      const blocked =
        (err instanceof Error && err.name === 'SecurityError') ||
        lower.includes('policy') ||
        lower.includes('permission') ||
        lower.includes('disallowed');
      return {
        supported: true,
        available: null,
        permissionBlocked: blocked,
        reason: blocked
          ? caps.isEmbeddedIframe
            ? 'This embedded preview frame blocks Web Bluetooth via Permissions-Policy. Open FreeConnect in a full browser tab over HTTPS to turn Bluetooth ON and scan real devices.'
            : 'Bluetooth access is blocked by browser Permissions-Policy on this page.'
          : `Unable to query Bluetooth adapter availability: ${msg}`,
      };
    }
  }

  return {
    supported: true,
    available: null,
    permissionBlocked: false,
    reason: 'Web Bluetooth API detected. Tap Turn Bluetooth ON or Request Bluetooth Permission to pair with a nearby BLE device.',
  };
}

export function subscribeWebBluetoothAvailability(
  onChanged: (available: boolean) => void
): () => void {
  const caps = detectBrowserCapabilities();
  if (caps.isIos || !caps.webBluetoothSupported) return () => {};
  const nav = navigator as WebBluetoothNavigator;
  if (typeof nav.bluetooth?.addEventListener !== 'function') return () => {};

  const handler = (ev: Event & { value?: boolean }) => {
    if (typeof ev.value === 'boolean') {
      onChanged(ev.value);
    }
  };
  try {
    nav.bluetooth.addEventListener('availabilitychanged', handler);
    return () => {
      nav.bluetooth?.removeEventListener?.('availabilitychanged', handler);
    };
  } catch {
    return () => {};
  }
}

export interface BluetoothConnectResult {
  ok: boolean;
  connected: boolean;
  writable: boolean;
  transport: 'none' | 'web_bluetooth_gatt' | 'web_bluetooth_readonly';
  deviceId?: string;
  deviceName?: string;
  serviceLabel?: string;
  message: string;
  permissionBlocked?: boolean;
}

async function discoverMessagingCharacteristics(server: WebBluetoothGattServer): Promise<{
  txChar: WebBluetoothCharacteristicLike | null;
  rxChar: WebBluetoothCharacteristicLike | null;
  serviceLabel: string | null;
}> {
  // 1. Try known FreeConnect & standard BLE UART messaging services first
  for (const spec of BLE_MESSAGING_SERVICES) {
    try {
      const service = await server.getPrimaryService(spec.serviceUuid);
      let txChar: WebBluetoothCharacteristicLike | null = null;
      let rxChar: WebBluetoothCharacteristicLike | null = null;

      try {
        txChar = await service.getCharacteristic(spec.txUuid);
      } catch {
        // Optional
      }
      try {
        rxChar = await service.getCharacteristic(spec.rxUuid);
      } catch {
        // Optional
      }

      if (txChar || rxChar) {
        return { txChar, rxChar, serviceLabel: spec.label };
      }
    } catch {
      // Service not present on this peripheral
    }
  }

  // 2. Fallback: inspect all exposed primary services for writable + notifiable characteristics
  if (typeof server.getPrimaryServices === 'function') {
    try {
      const services = await server.getPrimaryServices();
      for (const svc of services) {
        if (typeof svc.getCharacteristics !== 'function') continue;
        const chars = await svc.getCharacteristics();
        const tx =
          chars.find((c) => c.properties?.writeWithoutResponse || c.properties?.write) ?? null;
        const rx = chars.find((c) => c.properties?.notify || c.properties?.indicate) ?? null;
        if (tx) {
          return { txChar: tx, rxChar: rx, serviceLabel: `BLE GATT (${svc.uuid.slice(0, 8)})` };
        }
      }
    } catch {
      // Peripheral denied primary service enumeration
    }
  }

  return { txChar: null, rxChar: null, serviceLabel: null };
}

function handleIncomingBleChunk(
  contactId: string,
  rawChunkText: string,
  onPacket: (contactId: string, packet: WireMessagePacket) => void
) {
  const trimmed = rawChunkText.trim();
  if (!trimmed) return;

  // Check if framed packet: FC1|<packetId>|<seq>/<total>|<slice>
  if (trimmed.startsWith('FC1|')) {
    const firstSep = trimmed.indexOf('|');
    const secondSep = trimmed.indexOf('|', firstSep + 1);
    const thirdSep = trimmed.indexOf('|', secondSep + 1);
    if (secondSep > 0 && thirdSep > 0) {
      const packetId = trimmed.slice(firstSep + 1, secondSep);
      const seqPart = trimmed.slice(secondSep + 1, thirdSep);
      const payloadSlice = trimmed.slice(thirdSep + 1);
      const [seqStr, totalStr] = seqPart.split('/');
      const seq = Number(seqStr);
      const total = Number(totalStr);

      if (Number.isInteger(seq) && Number.isInteger(total) && total > 0) {
        const key = `${contactId}:${packetId}`;
        let entry = incomingFrameBuffers.get(key);
        if (!entry) {
          entry = { total, parts: new Map(), receivedAt: Date.now() };
          incomingFrameBuffers.set(key, entry);
        }
        entry.parts.set(seq, payloadSlice);

        if (entry.parts.size === entry.total) {
          // Support both 1-based (iOS Swift / Android Kotlin / v2 Web) and 0-based (legacy Web) FC1 indices
          const isOneBased = entry.parts.has(1) && !entry.parts.has(0);
          let fullJson = '';
          const start = isOneBased ? 1 : 0;
          const end = isOneBased ? entry.total : entry.total - 1;
          for (let i = start; i <= end; i++) {
            fullJson += entry.parts.get(i) ?? '';
          }
          incomingFrameBuffers.delete(key);
          try {
            const parsed = JSON.parse(fullJson) as WireMessagePacket;
            if (parsed && parsed.v === 1) {
              onPacket(contactId, parsed);
              return;
            }
          } catch {
            // Malformed JSON frame
          }
        }
        return;
      }
    }
  }

  // Fallback: plain UTF-8 text received from a raw BLE UART device (e.g. serial chat peripheral)
  try {
    const parsed = JSON.parse(trimmed) as WireMessagePacket;
    if (parsed && parsed.v === 1) {
      onPacket(contactId, parsed);
      return;
    }
  } catch {
    // Deliver as plain text message from the connected BLE UART device
    onPacket(contactId, {
      v: 1,
      type: 'message',
      packetId: `ble-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      senderDeviceId: contactId,
      senderName: 'Bluetooth Peer',
      timestamp: Date.now(),
      kind: 'text',
      text: trimmed,
    });
  }
}

export async function requestRealBluetoothConnection(
  contactId: string,
  options: {
    onStateChange?: (state: LiveConnectionState, message: string) => void;
    onIncomingPacket?: (contactId: string, packet: WireMessagePacket) => void;
    onHardwareDisconnected: () => void;
  }
): Promise<BluetoothConnectResult> {
  const nav = navigator as WebBluetoothNavigator;
  const caps = detectBrowserCapabilities();

  if (caps.isIos) {
    return {
      ok: false,
      connected: false,
      writable: false,
      transport: 'none',
      message:
        'iOS Safari does not support the Web Bluetooth API. Install the native iOS FreeConnect wrapper (ios-freeconnect/) for direct CoreBluetooth & MultipeerConnectivity Bluetooth pairing between iPhones and Android phones.',
    };
  }

  if (!nav.bluetooth || typeof nav.bluetooth.requestDevice !== 'function') {
    return {
      ok: false,
      connected: false,
      writable: false,
      transport: 'none',
      message:
        'Web Bluetooth API is not supported in this browser (requires Chrome, Edge, or Opera over HTTPS, or the native Android/iOS FreeConnect app).',
    };
  }

  try {
    options.onStateChange?.('searching', 'Searching for nearby Bluetooth devices...');

    const device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        ...BLE_MESSAGING_SERVICES.map((s) => s.serviceUuid),
        'generic_access',
        'device_information',
      ],
    });

    const hardwareName = device.name || `Bluetooth Device (${device.id.slice(0, 8)})`;

    if (!device.gatt) {
      return {
        ok: true,
        connected: false,
        writable: false,
        transport: 'none',
        deviceId: device.id,
        deviceName: hardwareName,
        message: `Selected "${hardwareName}", but this device does not expose a BLE GATT server.`,
      };
    }

    options.onStateChange?.('connecting', `Connecting to ${hardwareName}...`);

    try {
      // Close any existing session bound to this contactId before reconnecting
      disconnectRealBluetoothDevice(contactId);

      const server = await device.gatt.connect();
      if (!server.connected) {
        return {
          ok: false,
          connected: false,
          writable: false,
          transport: 'none',
          deviceId: device.id,
          deviceName: hardwareName,
          message: `Connection to "${hardwareName}" did not stay active.`,
        };
      }

      const { txChar, rxChar, serviceLabel } = await discoverMessagingCharacteristics(server);

      let rxHandler: ((ev: Event) => void) | undefined;
      if (rxChar && typeof rxChar.startNotifications === 'function') {
        try {
          await rxChar.startNotifications();
          rxHandler = (ev: Event) => {
            const target = ev.target as unknown as WebBluetoothCharacteristicLike | null;
            const dv = target?.value;
            if (!dv || !options.onIncomingPacket) return;
            const chunk = textDecoder.decode(
              new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)
            );
            handleIncomingBleChunk(contactId, chunk, options.onIncomingPacket);
          };
          rxChar.addEventListener?.('characteristicvaluechanged', rxHandler);
        } catch {
          // Notifications unavailable on this characteristic
        }
      }

      const disconnectHandler = () => {
        activeBleSessions.delete(contactId);
        options.onHardwareDisconnected();
      };
      device.addEventListener?.('gattserverdisconnected', disconnectHandler);

      reconnectableBleDevices.set(contactId, device);
      activeBleSessions.set(contactId, {
        contactId,
        device,
        txChar,
        rxChar,
        serviceLabel,
        rxHandler,
        disconnectHandler,
      });

      const writable = Boolean(txChar);
      return {
        ok: true,
        connected: true,
        writable,
        transport: writable ? 'web_bluetooth_gatt' : 'web_bluetooth_readonly',
        deviceId: device.id,
        deviceName: hardwareName,
        serviceLabel: serviceLabel ?? undefined,
        message: writable
          ? `Connected to ${hardwareName} via ${serviceLabel}. Ready to send and receive messages.`
          : `Connected to ${hardwareName} via BLE GATT, but no compatible messaging service (FreeConnect / Nordic UART) was found. Messages will queue locally unless paired with a compatible peripheral or Direct Offline P2P Link.`,
      };
    } catch (connectErr) {
      const reason = connectErr instanceof Error ? connectErr.message : 'GATT connection declined';
      return {
        ok: false,
        connected: false,
        writable: false,
        transport: 'none',
        deviceId: device.id,
        deviceName: hardwareName,
        message: `Found "${hardwareName}", but Bluetooth GATT connection failed (${reason}). Ensure the device is nearby, powered on, and advertising a BLE GATT service.`,
      };
    }
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const errName = err instanceof Error ? err.name : '';

    if (errName === 'NotFoundError' || rawMsg.toLowerCase().includes('cancel')) {
      return {
        ok: false,
        connected: false,
        writable: false,
        transport: 'none',
        message: 'Bluetooth search canceled. Status: Disconnected.',
      };
    }

    if (
      errName === 'SecurityError' ||
      rawMsg.toLowerCase().includes('policy') ||
      rawMsg.toLowerCase().includes('permissions')
    ) {
      return {
        ok: false,
        connected: false,
        writable: false,
        transport: 'none',
        permissionBlocked: true,
        message:
          'This embedded preview iframe restricts Web Bluetooth via Permissions-Policy. Open the app directly in a top-level Chrome/Edge tab over HTTPS for Web Bluetooth, or use Direct Offline P2P Pair right here.',
      };
    }

    return {
      ok: false,
      connected: false,
      writable: false,
      transport: 'none',
      message: `Bluetooth error: ${rawMsg}.`,
    };
  }
}

export async function sendBluetoothPacket(
  contactId: string,
  packet: WireMessagePacket
): Promise<{ sent: boolean; error?: string }> {
  const session = activeBleSessions.get(contactId);
  if (!session || !session.device.gatt?.connected) {
    activeBleSessions.delete(contactId);
    return { sent: false, error: 'Bluetooth device is not connected.' };
  }

  if (!session.txChar) {
    return {
      sent: false,
      error: 'Connected Bluetooth device does not expose a writable BLE messaging characteristic.',
    };
  }

  try {
    const serialized = JSON.stringify(packet);
    // Keep each BLE GATT write under 180 bytes to respect default BLE MTU safely
    const maxPayloadSlice = 140;
    const totalChunks = Math.max(1, Math.ceil(serialized.length / maxPayloadSlice));

    for (let seq = 0; seq < totalChunks; seq++) {
      const slice = serialized.slice(seq * maxPayloadSlice, (seq + 1) * maxPayloadSlice);
      // 1-based sequence index matches iOS CoreBluetooth (FreeConnectBLEManager.swift) and Android BLE (FreeConnectBleManager.kt)
      const frame = `FC1|${packet.packetId}|${seq + 1}/${totalChunks}|${slice}`;
      const bytes = textEncoder.encode(frame);

      if (
        session.txChar.properties?.writeWithoutResponse &&
        typeof session.txChar.writeValueWithoutResponse === 'function'
      ) {
        await session.txChar.writeValueWithoutResponse(bytes);
      } else if (typeof session.txChar.writeValueWithResponse === 'function') {
        await session.txChar.writeValueWithResponse(bytes);
      } else if (typeof session.txChar.writeValue === 'function') {
        await session.txChar.writeValue(bytes);
      } else {
        return { sent: false, error: 'BLE TX characteristic does not support writing.' };
      }
    }

    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : 'Bluetooth GATT write failed.',
    };
  }
}

export function disconnectRealBluetoothDevice(contactId: string, clearReconnect = true): boolean {
  if (clearReconnect) {
    reconnectableBleDevices.delete(contactId);
  }
  const session = activeBleSessions.get(contactId);
  if (!session) return false;

  if (session.rxChar && session.rxHandler) {
    session.rxChar.removeEventListener?.('characteristicvaluechanged', session.rxHandler);
    try {
      void session.rxChar.stopNotifications?.();
    } catch {
      // Ignore
    }
  }
  if (session.disconnectHandler) {
    session.device.removeEventListener?.('gattserverdisconnected', session.disconnectHandler);
  }

  let wasConnected = false;
  if (session.device.gatt?.connected) {
    session.device.gatt.disconnect();
    wasConnected = true;
  }

  activeBleSessions.delete(contactId);
  return wasConnected;
}

/**
 * Attempts genuine automatic reconnection to a previously paired Web Bluetooth GATT
 * peripheral using its retained BluetoothDevice handle (no user picker required).
 */
export async function attemptBluetoothReconnect(
  contactId: string,
  options: {
    onIncomingPacket?: (contactId: string, packet: WireMessagePacket) => void;
    onHardwareDisconnected: () => void;
  }
): Promise<BluetoothConnectResult | null> {
  const device = reconnectableBleDevices.get(contactId);
  if (!device || !device.gatt) return null;

  const hardwareName = device.name || `Bluetooth Device (${device.id.slice(0, 8)})`;
  try {
    const server = await device.gatt.connect();
    if (!server.connected) return null;

    const { txChar, rxChar, serviceLabel } = await discoverMessagingCharacteristics(server);

    let rxHandler: ((ev: Event) => void) | undefined;
    if (rxChar && typeof rxChar.startNotifications === 'function') {
      try {
        await rxChar.startNotifications();
        rxHandler = (ev: Event) => {
          const target = ev.target as unknown as WebBluetoothCharacteristicLike | null;
          const dv = target?.value;
          if (!dv || !options.onIncomingPacket) return;
          const chunk = textDecoder.decode(
            new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)
          );
          handleIncomingBleChunk(contactId, chunk, options.onIncomingPacket);
        };
        rxChar.addEventListener?.('characteristicvaluechanged', rxHandler);
      } catch {
        // Notifications optional
      }
    }

    const disconnectHandler = () => {
      activeBleSessions.delete(contactId);
      options.onHardwareDisconnected();
    };
    device.addEventListener?.('gattserverdisconnected', disconnectHandler);

    activeBleSessions.set(contactId, {
      contactId,
      device,
      txChar,
      rxChar,
      serviceLabel,
      rxHandler,
      disconnectHandler,
    });

    const writable = Boolean(txChar);
    return {
      ok: true,
      connected: true,
      writable,
      transport: writable ? 'web_bluetooth_gatt' : 'web_bluetooth_readonly',
      deviceId: device.id,
      deviceName: hardwareName,
      serviceLabel: serviceLabel ?? undefined,
      message: writable
        ? `Reconnected to ${hardwareName} via ${serviceLabel}.`
        : `Reconnected to ${hardwareName} (Read-Only BLE GATT).`,
    };
  } catch {
    return null;
  }
}

export function canReconnectBluetooth(contactId: string): boolean {
  return reconnectableBleDevices.has(contactId);
}

export function isBluetoothWritable(contactId: string): boolean {
  const session = activeBleSessions.get(contactId);
  return Boolean(session && session.device.gatt?.connected && session.txChar);
}
