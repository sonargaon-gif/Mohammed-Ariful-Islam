import {
  LiveConnectionState,
  NativeBridgePlatform,
  WireMessagePacket,
} from '../types/contacts';

/**
 * Real Native Offline Transport Bridge (iOS CoreBluetooth + Multipeer, Android BLE + Wi-Fi Direct)
 *
 * When FreeConnect is hosted inside our native iOS WKWebView (ios-freeconnect/) or
 * Android WebView (android-freeconnect/), the native container injects either:
 *   - iOS:     window.webkit.messageHandlers.freeConnectNative
 *   - Android: window.FreeConnectNative
 *
 * In a standard mobile/desktop browser, this bridge honestly reports `none` and never
 * fakes native hardware discovery or connections.
 */

export interface NativeDiscoveredPeer {
  id: string; // Native peripheral UUID (CoreBluetooth) or MAC/peer address (Android)
  deviceCode?: string; // FreeConnect Device ID advertised in BLE/Multipeer metadata
  name: string;
  transport: 'native_ble' | 'native_wifi_direct';
  rssi?: number;
  platform?: 'ios' | 'android' | 'unknown';
  connected: boolean;
}

export type NativeBridgeIncomingEvent =
  | {
      type: 'peer_discovered';
      peer: NativeDiscoveredPeer;
    }
  | {
      type: 'peer_lost';
      peerId: string;
    }
  | {
      type: 'connection_request';
      peerId: string;
      peerName: string;
      deviceCode?: string;
      platform?: 'ios' | 'android' | 'unknown';
      transport: 'native_ble' | 'native_wifi_direct';
    }
  | {
      type: 'connection_state';
      peerId: string;
      peerName?: string;
      deviceCode?: string;
      transport: 'native_ble' | 'native_wifi_direct';
      state: LiveConnectionState;
      message?: string;
    }
  | {
      type: 'packet_received';
      peerId: string;
      transport: 'native_ble' | 'native_wifi_direct';
      packetJson: string;
    }
  | {
      type: 'scan_state';
      state: 'idle' | 'searching';
      message?: string;
    }
  | {
      type: 'code_host_discovered';
      peerId: string;
      hostDeviceId: string;
      hostName: string;
      hostUsername?: string;
      platform: 'ios' | 'android' | 'unknown';
      transport: 'native_ble' | 'native_wifi_direct';
      nonce: string;
      commitment: string;
      expiresAt: number;
    }
  | {
      type: 'code_join_request';
      peerId: string;
      peerName: string;
      peerUsername?: string;
      deviceCode?: string;
      platform?: 'ios' | 'android' | 'unknown';
      transport: 'native_ble' | 'native_wifi_direct';
      nonce: string;
      proof: string;
    }
  | {
      type: 'bluetooth_state';
      enabled: boolean;
      hardwarePoweredOn: boolean;
      permissionState: 'granted' | 'prompt' | 'denied';
      discoverable: boolean;
      message?: string;
    }
  | {
      type: 'error';
      message: string;
    };

interface AndroidJavascriptBridge {
  getPlatformInfo?: () => string; // JSON: { platform: 'android_native', transports: [...] }
  setLocalIdentity?: (json: string) => void;
  startDiscovery?: (transport: string) => void;
  stopDiscovery?: () => void;
  connectPeer?: (peerId: string, transport: string) => void;
  respondConnectionRequest?: (peerId: string, accept: boolean, transport: string) => void;
  startCodeHost?: (commitment: string, nonce: string, expiresAt: number) => void;
  cancelCodeHost?: () => void;
  sendCodeJoinRequest?: (peerId: string, nonce: string, proof: string, transport: string) => void;
  setBluetoothEnabled?: (enabled: boolean) => void;
  requestBluetoothPermission?: () => void;
  disconnectPeer?: (peerId: string) => void;
  sendPacket?: (peerId: string, packetJson: string) => boolean;
}

interface IosMessageHandler {
  postMessage: (payload: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    FreeConnectNative?: AndroidJavascriptBridge;
    __FREECONNECT_NATIVE_PLATFORM__?: {
      platform: NativeBridgePlatform;
      transports: Array<'native_ble' | 'native_wifi_direct'>;
    };
    webkit?: {
      messageHandlers?: {
        freeConnectNative?: IosMessageHandler;
      };
    };
    __freeConnectNativeEvent?: (event: NativeBridgeIncomingEvent) => void;
  }
}

export function detectNativeBridge(): {
  platform: NativeBridgePlatform;
  transports: Array<'native_ble' | 'native_wifi_direct'>;
} {
  if (typeof window === 'undefined') {
    return { platform: 'none', transports: [] };
  }

  if (window.__FREECONNECT_NATIVE_PLATFORM__) {
    return window.__FREECONNECT_NATIVE_PLATFORM__;
  }

  if (window.webkit?.messageHandlers?.freeConnectNative) {
    return {
      platform: 'ios_native',
      transports: ['native_ble', 'native_wifi_direct'],
    };
  }

  if (window.FreeConnectNative) {
    try {
      const infoRaw = window.FreeConnectNative.getPlatformInfo?.();
      if (infoRaw) {
        const parsed = JSON.parse(infoRaw) as {
          platform?: NativeBridgePlatform;
          transports?: Array<'native_ble' | 'native_wifi_direct'>;
        };
        return {
          platform: parsed.platform ?? 'android_native',
          transports: parsed.transports ?? ['native_ble', 'native_wifi_direct'],
        };
      }
    } catch {
      // Fallback to default Android native capabilities
    }
    return {
      platform: 'android_native',
      transports: ['native_ble', 'native_wifi_direct'],
    };
  }

  return { platform: 'none', transports: [] };
}

type EventListenerFn = (ev: NativeBridgeIncomingEvent) => void;
const listeners = new Set<EventListenerFn>();
const connectedNativePeers = new Map<
  string,
  { transport: 'native_ble' | 'native_wifi_direct'; peerName?: string }
>();

function ensureGlobalDispatcher() {
  if (typeof window === 'undefined') return;
  if (!window.__freeConnectNativeEvent) {
    window.__freeConnectNativeEvent = (event: NativeBridgeIncomingEvent) => {
      if (event.type === 'connection_state') {
        if (event.state === 'connected') {
          connectedNativePeers.set(event.peerId, {
            transport: event.transport,
            peerName: event.peerName,
          });
        } else if (event.state === 'disconnected') {
          connectedNativePeers.delete(event.peerId);
        }
      }
      listeners.forEach((fn) => {
        try {
          fn(event);
        } catch {
          // Isolate listener errors
        }
      });
    };
  }
}

export function subscribeNativeBridgeEvents(listener: EventListenerFn): () => void {
  ensureGlobalDispatcher();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function syncNativeLocalIdentity(identity: {
  deviceId: string;
  name: string;
  username: string;
}): void {
  if (typeof window === 'undefined') return;
  const json = JSON.stringify(identity);
  if (window.FreeConnectNative?.setLocalIdentity) {
    window.FreeConnectNative.setLocalIdentity(json);
    return;
  }
  window.webkit?.messageHandlers?.freeConnectNative?.postMessage({
    action: 'setLocalIdentity',
    identity,
  });
}

export function startNativeDiscovery(
  transport: 'all' | 'native_ble' | 'native_wifi_direct' = 'all'
): boolean {
  if (typeof window === 'undefined') return false;
  if (window.FreeConnectNative?.startDiscovery) {
    window.FreeConnectNative.startDiscovery(transport);
    return true;
  }
  if (window.webkit?.messageHandlers?.freeConnectNative) {
    window.webkit.messageHandlers.freeConnectNative.postMessage({
      action: 'startDiscovery',
      transport,
    });
    return true;
  }
  return false;
}

export function stopNativeDiscovery(): void {
  if (typeof window === 'undefined') return;
  if (window.FreeConnectNative?.stopDiscovery) {
    window.FreeConnectNative.stopDiscovery();
    return;
  }
  window.webkit?.messageHandlers?.freeConnectNative?.postMessage({
    action: 'stopDiscovery',
  });
}

export function setNativeBluetoothEnabled(enabled: boolean): boolean {
  if (typeof window === 'undefined') return false;
  if (window.FreeConnectNative?.setBluetoothEnabled) {
    window.FreeConnectNative.setBluetoothEnabled(enabled);
    return true;
  }
  if (window.webkit?.messageHandlers?.freeConnectNative) {
    window.webkit.messageHandlers.freeConnectNative.postMessage({
      action: 'setBluetoothEnabled',
      enabled,
    });
    return true;
  }
  return false;
}

export function requestNativeBluetoothPermission(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.FreeConnectNative?.requestBluetoothPermission) {
    window.FreeConnectNative.requestBluetoothPermission();
    return true;
  }
  if (window.webkit?.messageHandlers?.freeConnectNative) {
    window.webkit.messageHandlers.freeConnectNative.postMessage({
      action: 'requestBluetoothPermission',
    });
    return true;
  }
  return false;
}

export function connectNativePeer(
  peerId: string,
  transport: 'native_ble' | 'native_wifi_direct'
): boolean {
  if (typeof window === 'undefined') return false;
  if (window.FreeConnectNative?.connectPeer) {
    window.FreeConnectNative.connectPeer(peerId, transport);
    return true;
  }
  if (window.webkit?.messageHandlers?.freeConnectNative) {
    window.webkit.messageHandlers.freeConnectNative.postMessage({
      action: 'connectPeer',
      peerId,
      transport,
    });
    return true;
  }
  return false;
}

export function respondNativeConnectionRequest(
  peerId: string,
  accept: boolean,
  transport: 'native_ble' | 'native_wifi_direct'
): boolean {
  if (typeof window === 'undefined') return false;
  if (window.FreeConnectNative?.respondConnectionRequest) {
    window.FreeConnectNative.respondConnectionRequest(peerId, accept, transport);
    return true;
  }
  if (window.webkit?.messageHandlers?.freeConnectNative) {
    window.webkit.messageHandlers.freeConnectNative.postMessage({
      action: 'respondConnectionRequest',
      peerId,
      accept,
      transport,
    });
    return true;
  }
  return false;
}

export function startNativeCodeHost(
  commitment: string,
  nonce: string,
  expiresAt: number
): boolean {
  if (typeof window === 'undefined') return false;
  if (window.FreeConnectNative?.startCodeHost) {
    window.FreeConnectNative.startCodeHost(commitment, nonce, expiresAt);
    return true;
  }
  if (window.webkit?.messageHandlers?.freeConnectNative) {
    window.webkit.messageHandlers.freeConnectNative.postMessage({
      action: 'startCodeHost',
      commitment,
      nonce,
      expiresAt,
    });
    return true;
  }
  return false;
}

export function cancelNativeCodeHost(): void {
  if (typeof window === 'undefined') return;
  if (window.FreeConnectNative?.cancelCodeHost) {
    window.FreeConnectNative.cancelCodeHost();
    return;
  }
  window.webkit?.messageHandlers?.freeConnectNative?.postMessage({
    action: 'cancelCodeHost',
  });
}

export function sendNativeCodeJoinRequest(
  peerId: string,
  nonce: string,
  proof: string,
  transport: 'native_ble' | 'native_wifi_direct'
): boolean {
  if (typeof window === 'undefined') return false;
  if (window.FreeConnectNative?.sendCodeJoinRequest) {
    window.FreeConnectNative.sendCodeJoinRequest(peerId, nonce, proof, transport);
    return true;
  }
  if (window.webkit?.messageHandlers?.freeConnectNative) {
    window.webkit.messageHandlers.freeConnectNative.postMessage({
      action: 'sendCodeJoinRequest',
      peerId,
      nonce,
      proof,
      transport,
    });
    return true;
  }
  return false;
}

export function disconnectNativePeer(peerId: string): boolean {
  if (typeof window === 'undefined') return false;
  connectedNativePeers.delete(peerId);
  if (window.FreeConnectNative?.disconnectPeer) {
    window.FreeConnectNative.disconnectPeer(peerId);
    return true;
  }
  if (window.webkit?.messageHandlers?.freeConnectNative) {
    window.webkit.messageHandlers.freeConnectNative.postMessage({
      action: 'disconnectPeer',
      peerId,
    });
    return true;
  }
  return false;
}

export function sendNativePacket(
  peerId: string,
  packet: WireMessagePacket
): { sent: boolean; transport?: 'native_ble' | 'native_wifi_direct'; error?: string } {
  if (typeof window === 'undefined') {
    return { sent: false, error: 'Native runtime unavailable.' };
  }
  const active = connectedNativePeers.get(peerId);
  if (!active) {
    return { sent: false, error: 'Native peer is not connected.' };
  }
  const packetJson = JSON.stringify(packet);
  try {
    if (window.FreeConnectNative?.sendPacket) {
      const ok = window.FreeConnectNative.sendPacket(peerId, packetJson);
      return ok
        ? { sent: true, transport: active.transport }
        : { sent: false, error: 'Native radio refused packet transmission.' };
    }
    if (window.webkit?.messageHandlers?.freeConnectNative) {
      window.webkit.messageHandlers.freeConnectNative.postMessage({
        action: 'sendPacket',
        peerId,
        packetJson,
      });
      return { sent: true, transport: active.transport };
    }
    return { sent: false, error: 'Native bridge is unavailable.' };
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : 'Native packet transmission failed.',
    };
  }
}

export function isNativePeerConnected(peerId: string): boolean {
  return connectedNativePeers.has(peerId);
}
