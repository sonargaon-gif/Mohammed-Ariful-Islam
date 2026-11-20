import { DevicePlatformKind, WireMessagePacket } from '../types/contacts';

/**
 * Offline Direct Peer-to-Peer Transport (Zero Internet, Zero Cloud Server, Zero APIs)
 *
 * 1. Serverless Offline WebRTC RTCDataChannel (`iceServers: []`):
 *    Allows ANY two browsers (Desktop, Android, iPhone/iPad Safari) on the same
 *    local Wi-Fi or personal hotspot to exchange real text, voice recordings, and
 *    files directly device-to-device by exchanging an Offer & Answer handshake
 *    code.
 *
 * 2. Local Browser Discovery Channel (`BroadcastChannel`):
 *    Automatically discovers other FreeConnect tabs/windows open on the same
 *    device and supports real nearby discovery + cryptographic 6-digit temporary
 *    connection code pairing with dual-user Accept/Reject approval.
 */

export function detectLocalDevicePlatform(): DevicePlatformKind {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/i.test(ua)) {
    return 'android';
  }
  if (/Macintosh|Windows|Linux/i.test(ua)) {
    return 'desktop';
  }
  return 'browser';
}

export interface OfflineHandshakeBundle {
  v: 1;
  kind: 'offer' | 'answer';
  deviceId: string;
  name: string;
  username: string;
  sdp: string;
}

export interface LocalPeerPresence {
  sessionId: string;
  deviceId: string;
  name: string;
  username: string;
  platform: DevicePlatformKind;
  lastSeenAt: number;
}

export interface LocalCodeHostBeacon {
  hostSessionId: string;
  hostDeviceId: string;
  hostName: string;
  hostUsername: string;
  hostPlatform: DevicePlatformKind;
  nonce: string;
  commitment: string;
  expiresAt: number;
}

export interface LocalCodeJoinIncoming {
  fromSessionId: string;
  fromDeviceId: string;
  fromName: string;
  fromUsername: string;
  fromPlatform: DevicePlatformKind;
  nonce: string;
  proof: string;
}

interface ActiveRtcSession {
  contactId: string;
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
  peerDeviceId: string;
  peerName: string;
}

const activeRtcSessions = new Map<string, ActiveRtcSession>();
const incomingDataChunks = new Map<string, { total: number; parts: string[] }>();

// Pending offer waiting for peer's Answer code
let pendingHostSession: {
  pc: RTCPeerConnection;
  channel: RTCDataChannel;
  contactId?: string;
} | null = null;

// Strip non-essential SDP comment/extmap noise while keeping ICE/DTLS/SCTP intact so QR codes stay compact and scannable on phone cameras
function compactSdpForQr(sdp: string): string {
  return sdp
    .split(/\r?\n/)
    .filter((line) => {
      const l = line.trim();
      if (!l) return false;
      if (l.startsWith('a=extmap:')) return false;
      if (l.startsWith('a=msid-semantic:')) return false;
      return true;
    })
    .join('\r\n') + '\r\n';
}

// --- Compact Handshake Codec (Supports both full and compact payloads) ---
export function encodeHandshakeCode(bundle: OfflineHandshakeBundle): string {
  const compact = {
    v: 1,
    k: bundle.kind === 'offer' ? 'o' : 'a',
    d: bundle.deviceId,
    n: bundle.name,
    u: bundle.username,
    s: compactSdpForQr(bundle.sdp),
  };
  const json = JSON.stringify(compact);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `FCP2P:${btoa(binary)}`;
}

export function decodeHandshakeCode(raw: string): OfflineHandshakeBundle | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('FCP2P:')) return null;
  try {
    const binary = atob(trimmed.slice(6));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (!parsed || parsed.v !== 1) return null;

    // Compact format
    if ((parsed.k === 'o' || parsed.k === 'a') && typeof parsed.d === 'string' && typeof parsed.s === 'string') {
      return {
        v: 1,
        kind: parsed.k === 'o' ? 'offer' : 'answer',
        deviceId: parsed.d,
        name: typeof parsed.n === 'string' ? parsed.n : 'FreeConnect Peer',
        username: typeof parsed.u === 'string' ? parsed.u : '@peer',
        sdp: parsed.s,
      };
    }

    // Legacy verbose format
    if (
      (parsed.kind === 'offer' || parsed.kind === 'answer') &&
      typeof parsed.deviceId === 'string' &&
      typeof parsed.sdp === 'string'
    ) {
      return {
        v: 1,
        kind: parsed.kind,
        deviceId: parsed.deviceId,
        name: typeof parsed.name === 'string' ? parsed.name : 'FreeConnect Peer',
        username: typeof parsed.username === 'string' ? parsed.username : '@peer',
        sdp: parsed.sdp,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function waitForIceGatheringComplete(pc: RTCPeerConnection, timeoutMs = 2500): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      pc.removeEventListener('icegatheringstatechange', onChange);
      window.clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}

function wireDataChannel(
  contactId: string,
  pc: RTCPeerConnection,
  channel: RTCDataChannel,
  peerMeta: { deviceId: string; name: string },
  callbacks: {
    onOpen: (contactId: string, peerMeta: { deviceId: string; name: string }) => void;
    onClose: (contactId: string, reason?: string) => void;
    onPacket: (contactId: string, packet: WireMessagePacket) => void;
  }
) {
  const session: ActiveRtcSession = {
    contactId,
    pc,
    channel,
    peerDeviceId: peerMeta.deviceId,
    peerName: peerMeta.name,
  };
  activeRtcSessions.set(contactId, session);

  // Guard against silent ICE hang when two devices are not on the same local Wi-Fi/hotspot
  const connectWatchdog = window.setTimeout(() => {
    if (channel.readyState !== 'open' && activeRtcSessions.get(contactId)?.channel === channel) {
      activeRtcSessions.delete(contactId);
      try {
        channel.close();
        pc.close();
      } catch {
        // Ignore
      }
      callbacks.onClose(
        contactId,
        'Could not reach peer locally. Ensure both devices are on the same local Wi-Fi or personal hotspot (no internet needed) and try pairing again.'
      );
    }
  }, 15_000);

  channel.onopen = () => {
    window.clearTimeout(connectWatchdog);
    callbacks.onOpen(contactId, peerMeta);
  };

  channel.onclose = () => {
    window.clearTimeout(connectWatchdog);
    if (activeRtcSessions.get(contactId)?.channel === channel) {
      activeRtcSessions.delete(contactId);
      callbacks.onClose(contactId, 'Direct offline P2P channel closed.');
    }
  };

  channel.onerror = () => {
    window.clearTimeout(connectWatchdog);
    if (activeRtcSessions.get(contactId)?.channel === channel) {
      activeRtcSessions.delete(contactId);
      callbacks.onClose(contactId, 'Direct offline P2P channel encountered a transport error.');
    }
  };

  channel.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return;
    const raw = ev.data;
    if (raw.startsWith('FCDC|')) {
      const p1 = raw.indexOf('|');
      const p2 = raw.indexOf('|', p1 + 1);
      const p3 = raw.indexOf('|', p2 + 1);
      if (p2 > 0 && p3 > 0) {
        const packetId = raw.slice(p1 + 1, p2);
        const [seqStr, totalStr] = raw.slice(p2 + 1, p3).split('/');
        const seq = Number(seqStr);
        const total = Number(totalStr);
        const slice = raw.slice(p3 + 1);

        const key = `${contactId}:${packetId}`;
        let buf = incomingDataChunks.get(key);
        if (!buf) {
          buf = { total, parts: new Array<string>(total) };
          incomingDataChunks.set(key, buf);
        }
        buf.parts[seq] = slice;

        if (buf.parts.filter((p) => p !== undefined).length === total) {
          const full = buf.parts.join('');
          incomingDataChunks.delete(key);
          try {
            const pkt = JSON.parse(full) as WireMessagePacket;
            if (pkt && pkt.v === 1) {
              callbacks.onPacket(contactId, pkt);
            }
          } catch {
            // Ignore malformed JSON
          }
        }
      }
      return;
    }

    try {
      const pkt = JSON.parse(raw) as WireMessagePacket;
      if (pkt && pkt.v === 1) {
        callbacks.onPacket(contactId, pkt);
      }
    } catch {
      // Ignore malformed payload
    }
  };

  pc.onconnectionstatechange = () => {
    if (
      pc.connectionState === 'disconnected' ||
      pc.connectionState === 'failed' ||
      pc.connectionState === 'closed'
    ) {
      window.clearTimeout(connectWatchdog);
      if (activeRtcSessions.get(contactId)?.pc === pc) {
        activeRtcSessions.delete(contactId);
        callbacks.onClose(
          contactId,
          pc.connectionState === 'failed'
            ? 'Direct local connection failed. Confirm both devices share the same Wi-Fi or hotspot.'
            : 'Direct offline P2P link disconnected.'
        );
      }
    }
  };
}

/**
 * Step 1 (Host Device): Create an offline WebRTC Offer code (zero internet / iceServers: []).
 */
export async function createOfflineP2pOffer(localIdentity: {
  deviceId: string;
  name: string;
  username: string;
}): Promise<string> {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('Offline WebRTC DataChannel is not supported in this browser.');
  }

  if (pendingHostSession) {
    try {
      pendingHostSession.pc.close();
    } catch {
      // Ignore
    }
    pendingHostSession = null;
  }

  // Strictly serverless local ICE — zero STUN/TURN, zero internet dependency
  const pc = new RTCPeerConnection({ iceServers: [] });
  const channel = pc.createDataChannel('freeconnect-offline', { ordered: true });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGatheringComplete(pc);

  pendingHostSession = { pc, channel };

  return encodeHandshakeCode({
    v: 1,
    kind: 'offer',
    deviceId: localIdentity.deviceId,
    name: localIdentity.name,
    username: localIdentity.username,
    sdp: pc.localDescription?.sdp ?? offer.sdp ?? '',
  });
}

/**
 * Step 2 (Guest Device): Accept Host Offer code and return Answer code.
 */
export async function acceptOfflineP2pOffer(
  offerCode: string,
  localIdentity: { deviceId: string; name: string; username: string },
  resolveContactId: (peer: { deviceId: string; name: string; username: string }) => Promise<string>,
  callbacks: {
    onOpen: (contactId: string, peerMeta: { deviceId: string; name: string }) => void;
    onClose: (contactId: string, reason?: string) => void;
    onPacket: (contactId: string, packet: WireMessagePacket) => void;
  }
): Promise<{ answerCode: string; contactId: string; peerName: string; peerDeviceId: string }> {
  const bundle = decodeHandshakeCode(offerCode);
  if (!bundle || bundle.kind !== 'offer') {
    throw new Error('Invalid Offer Code. Paste the full FCP2P:... code generated by the other device.');
  }

  const contactId = await resolveContactId({
    deviceId: bundle.deviceId,
    name: bundle.name,
    username: bundle.username,
  });

  disconnectOfflineP2p(contactId);

  const pc = new RTCPeerConnection({ iceServers: [] });
  pc.ondatachannel = (ev) => {
    wireDataChannel(
      contactId,
      pc,
      ev.channel,
      { deviceId: bundle.deviceId, name: bundle.name },
      callbacks
    );
  };

  await pc.setRemoteDescription({ type: 'offer', sdp: bundle.sdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIceGatheringComplete(pc);

  const answerCode = encodeHandshakeCode({
    v: 1,
    kind: 'answer',
    deviceId: localIdentity.deviceId,
    name: localIdentity.name,
    username: localIdentity.username,
    sdp: pc.localDescription?.sdp ?? answer.sdp ?? '',
  });

  return {
    answerCode,
    contactId,
    peerName: bundle.name,
    peerDeviceId: bundle.deviceId,
  };
}

/**
 * Step 3 (Host Device): Apply Guest Answer code to complete the direct P2P DataChannel.
 */
export async function completeOfflineP2pAnswer(
  answerCode: string,
  resolveContactId: (peer: { deviceId: string; name: string; username: string }) => Promise<string>,
  callbacks: {
    onOpen: (contactId: string, peerMeta: { deviceId: string; name: string }) => void;
    onClose: (contactId: string, reason?: string) => void;
    onPacket: (contactId: string, packet: WireMessagePacket) => void;
  }
): Promise<{ contactId: string; peerName: string; peerDeviceId: string }> {
  if (!pendingHostSession) {
    throw new Error('No active pairing Offer found. Click "Create Pairing Offer" first.');
  }

  const bundle = decodeHandshakeCode(answerCode);
  if (!bundle || bundle.kind !== 'answer') {
    throw new Error('Invalid Answer Code. Paste the full FCP2P:... answer from the other device.');
  }

  const contactId = await resolveContactId({
    deviceId: bundle.deviceId,
    name: bundle.name,
    username: bundle.username,
  });

  const { pc, channel } = pendingHostSession;
  pendingHostSession = null;

  disconnectOfflineP2p(contactId);

  wireDataChannel(
    contactId,
    pc,
    channel,
    { deviceId: bundle.deviceId, name: bundle.name },
    callbacks
  );

  await pc.setRemoteDescription({ type: 'answer', sdp: bundle.sdp });

  return {
    contactId,
    peerName: bundle.name,
    peerDeviceId: bundle.deviceId,
  };
}

export function sendOfflineP2pPacket(
  contactId: string,
  packet: WireMessagePacket
): { sent: boolean; error?: string } {
  const session = activeRtcSessions.get(contactId);
  if (!session || !session.channel || session.channel.readyState !== 'open') {
    return { sent: false, error: 'Direct offline P2P channel is not open.' };
  }

  try {
    const serialized = JSON.stringify(packet);
    const maxChunkSize = 14_000; // Safe below 16 KB WebRTC DataChannel limit across all browsers
    if (serialized.length <= maxChunkSize) {
      session.channel.send(serialized);
    } else {
      const total = Math.ceil(serialized.length / maxChunkSize);
      for (let seq = 0; seq < total; seq++) {
        const slice = serialized.slice(seq * maxChunkSize, (seq + 1) * maxChunkSize);
        session.channel.send(`FCDC|${packet.packetId}|${seq}/${total}|${slice}`);
      }
    }
    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : 'Failed to send over P2P DataChannel.',
    };
  }
}

export function disconnectOfflineP2p(contactId: string): boolean {
  const session = activeRtcSessions.get(contactId);
  if (!session) return false;
  try {
    session.channel?.close();
    session.pc.close();
  } catch {
    // Ignore
  }
  activeRtcSessions.delete(contactId);
  return true;
}

export function isOfflineP2pOpen(contactId: string): boolean {
  const session = activeRtcSessions.get(contactId);
  return Boolean(session && session.channel && session.channel.readyState === 'open');
}

// --- Local Device Browser-Window Discovery & Messaging (BroadcastChannel) ---
// Enables real two-window/two-tab discovery, 6-digit code authentication, and messaging with zero server!
type LocalBusEvent =
  | {
      kind: 'presence';
      sessionId: string;
      deviceId: string;
      name: string;
      username: string;
      platform: DevicePlatformKind;
    }
  | {
      kind: 'presence_leave';
      sessionId: string;
      deviceId: string;
    }
  | {
      kind: 'connect_request';
      fromSessionId: string;
      fromDeviceId: string;
      fromName: string;
      fromUsername: string;
      fromPlatform: DevicePlatformKind;
      targetDeviceId: string;
    }
  | {
      kind: 'connect_accept';
      fromSessionId: string;
      fromDeviceId: string;
      fromName: string;
      fromUsername: string;
      fromPlatform: DevicePlatformKind;
      targetDeviceId: string;
    }
  | {
      kind: 'connect_reject';
      fromDeviceId: string;
      fromName: string;
      targetDeviceId: string;
      reason?: string;
    }
  | {
      kind: 'code_host_announce';
      hostSessionId: string;
      hostDeviceId: string;
      hostName: string;
      hostUsername: string;
      hostPlatform: DevicePlatformKind;
      nonce: string;
      commitment: string;
      expiresAt: number;
    }
  | {
      kind: 'code_host_cancel';
      hostSessionId: string;
      hostDeviceId: string;
    }
  | {
      kind: 'code_join_request';
      fromSessionId: string;
      fromDeviceId: string;
      fromName: string;
      fromUsername: string;
      fromPlatform: DevicePlatformKind;
      targetHostDeviceId: string;
      nonce: string;
      proof: string;
    }
  | {
      kind: 'code_join_reject';
      fromDeviceId: string;
      fromName: string;
      targetDeviceId: string;
      reason: string;
    }
  | {
      kind: 'disconnect_notice';
      fromDeviceId: string;
      targetDeviceId: string;
    }
  | {
      kind: 'packet';
      fromDeviceId: string;
      targetDeviceId: string;
      packet: WireMessagePacket;
    };

export class LocalBrowserPeerBus {
  private bc: BroadcastChannel | null = null;
  private sessionId: string;
  private platform: DevicePlatformKind;
  private getIdentity: () => { deviceId: string; name: string; username: string };
  private heartbeatTimer: number | null = null;
  private activeCodeBeacon: { nonce: string; commitment: string; expiresAt: number } | null = null;

  constructor(
    getIdentity: () => { deviceId: string; name: string; username: string },
    handlers: {
      onPeerSeen: (peer: LocalPeerPresence) => void;
      onPeerLeft: (deviceId: string) => void;
      onConnectRequest: (peer: LocalPeerPresence) => void;
      onConnectAccepted: (peer: LocalPeerPresence) => void;
      onConnectRejected?: (deviceId: string, peerName: string, reason?: string) => void;
      onCodeHostSeen?: (beacon: LocalCodeHostBeacon) => void;
      onCodeHostCancelled?: (hostDeviceId: string) => void;
      onCodeJoinRequest?: (req: LocalCodeJoinIncoming) => void;
      onCodeJoinRejected?: (hostDeviceId: string, hostName: string, reason: string) => void;
      onPeerDisconnected: (deviceId: string) => void;
      onPacket: (fromDeviceId: string, packet: WireMessagePacket) => void;
    }
  ) {
    this.sessionId = `tab-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    this.platform = detectLocalDevicePlatform();
    this.getIdentity = getIdentity;

    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
      return;
    }

    this.bc = new BroadcastChannel('freeconnect_offline_local_bus_v1');
    this.bc.onmessage = (ev: MessageEvent<LocalBusEvent>) => {
      const msg = ev.data;
      if (!msg) return;
      const my = this.getIdentity();

      if (msg.kind === 'presence') {
        if (msg.sessionId === this.sessionId || msg.deviceId === my.deviceId) return;
        handlers.onPeerSeen({
          sessionId: msg.sessionId,
          deviceId: msg.deviceId,
          name: msg.name,
          username: msg.username,
          platform: msg.platform ?? 'browser',
          lastSeenAt: Date.now(),
        });
      } else if (msg.kind === 'presence_leave') {
        if (msg.sessionId === this.sessionId) return;
        handlers.onPeerLeft(msg.deviceId);
        handlers.onCodeHostCancelled?.(msg.deviceId);
      } else if (msg.kind === 'connect_request') {
        if (msg.targetDeviceId !== my.deviceId) return;
        handlers.onConnectRequest({
          sessionId: msg.fromSessionId,
          deviceId: msg.fromDeviceId,
          name: msg.fromName,
          username: msg.fromUsername,
          platform: msg.fromPlatform ?? 'browser',
          lastSeenAt: Date.now(),
        });
      } else if (msg.kind === 'connect_accept') {
        if (msg.targetDeviceId !== my.deviceId) return;
        handlers.onConnectAccepted({
          sessionId: msg.fromSessionId,
          deviceId: msg.fromDeviceId,
          name: msg.fromName,
          username: msg.fromUsername,
          platform: msg.fromPlatform ?? 'browser',
          lastSeenAt: Date.now(),
        });
      } else if (msg.kind === 'connect_reject') {
        if (msg.targetDeviceId !== my.deviceId) return;
        handlers.onConnectRejected?.(msg.fromDeviceId, msg.fromName, msg.reason);
      } else if (msg.kind === 'code_host_announce') {
        if (msg.hostSessionId === this.sessionId || msg.hostDeviceId === my.deviceId) return;
        if (msg.expiresAt <= Date.now()) return;
        handlers.onCodeHostSeen?.({
          hostSessionId: msg.hostSessionId,
          hostDeviceId: msg.hostDeviceId,
          hostName: msg.hostName,
          hostUsername: msg.hostUsername,
          hostPlatform: msg.hostPlatform ?? 'browser',
          nonce: msg.nonce,
          commitment: msg.commitment,
          expiresAt: msg.expiresAt,
        });
      } else if (msg.kind === 'code_host_cancel') {
        if (msg.hostSessionId === this.sessionId) return;
        handlers.onCodeHostCancelled?.(msg.hostDeviceId);
      } else if (msg.kind === 'code_join_request') {
        if (msg.targetHostDeviceId !== my.deviceId) return;
        handlers.onCodeJoinRequest?.({
          fromSessionId: msg.fromSessionId,
          fromDeviceId: msg.fromDeviceId,
          fromName: msg.fromName,
          fromUsername: msg.fromUsername,
          fromPlatform: msg.fromPlatform ?? 'browser',
          nonce: msg.nonce,
          proof: msg.proof,
        });
      } else if (msg.kind === 'code_join_reject') {
        if (msg.targetDeviceId !== my.deviceId) return;
        handlers.onCodeJoinRejected?.(msg.fromDeviceId, msg.fromName, msg.reason);
      } else if (msg.kind === 'disconnect_notice') {
        if (msg.targetDeviceId !== my.deviceId) return;
        handlers.onPeerDisconnected(msg.fromDeviceId);
      } else if (msg.kind === 'packet') {
        if (msg.targetDeviceId !== my.deviceId) return;
        handlers.onPacket(msg.fromDeviceId, msg.packet);
      }
    };

    this.announce();
    this.heartbeatTimer = window.setInterval(() => {
      this.announce();
      if (this.activeCodeBeacon) {
        if (this.activeCodeBeacon.expiresAt <= Date.now()) {
          this.cancelCodeHost();
        } else {
          this.broadcastCodeBeacon();
        }
      }
    }, 3000);
  }

  private post(event: LocalBusEvent) {
    try {
      this.bc?.postMessage(event);
    } catch {
      // Ignore closed channel
    }
  }

  private broadcastCodeBeacon() {
    if (!this.activeCodeBeacon) return;
    const my = this.getIdentity();
    this.post({
      kind: 'code_host_announce',
      hostSessionId: this.sessionId,
      hostDeviceId: my.deviceId,
      hostName: my.name,
      hostUsername: my.username,
      hostPlatform: this.platform,
      nonce: this.activeCodeBeacon.nonce,
      commitment: this.activeCodeBeacon.commitment,
      expiresAt: this.activeCodeBeacon.expiresAt,
    });
  }

  public announce() {
    const my = this.getIdentity();
    this.post({
      kind: 'presence',
      sessionId: this.sessionId,
      deviceId: my.deviceId,
      name: my.name,
      username: my.username,
      platform: this.platform,
    });
  }

  public setActiveCodeHost(beacon: { nonce: string; commitment: string; expiresAt: number } | null) {
    this.activeCodeBeacon = beacon;
    if (beacon) {
      this.broadcastCodeBeacon();
    } else {
      this.cancelCodeHost();
    }
  }

  public cancelCodeHost() {
    this.activeCodeBeacon = null;
    const my = this.getIdentity();
    this.post({
      kind: 'code_host_cancel',
      hostSessionId: this.sessionId,
      hostDeviceId: my.deviceId,
    });
  }

  public sendCodeJoinRequest(targetHostDeviceId: string, nonce: string, proof: string) {
    const my = this.getIdentity();
    this.post({
      kind: 'code_join_request',
      fromSessionId: this.sessionId,
      fromDeviceId: my.deviceId,
      fromName: my.name,
      fromUsername: my.username,
      fromPlatform: this.platform,
      targetHostDeviceId,
      nonce,
      proof,
    });
  }

  public rejectCodeJoin(targetDeviceId: string, reason: string) {
    const my = this.getIdentity();
    this.post({
      kind: 'code_join_reject',
      fromDeviceId: my.deviceId,
      fromName: my.name,
      targetDeviceId,
      reason,
    });
  }

  public requestConnect(targetDeviceId: string) {
    const my = this.getIdentity();
    this.post({
      kind: 'connect_request',
      fromSessionId: this.sessionId,
      fromDeviceId: my.deviceId,
      fromName: my.name,
      fromUsername: my.username,
      fromPlatform: this.platform,
      targetDeviceId,
    });
  }

  public acceptConnect(targetDeviceId: string) {
    const my = this.getIdentity();
    this.post({
      kind: 'connect_accept',
      fromSessionId: this.sessionId,
      fromDeviceId: my.deviceId,
      fromName: my.name,
      fromUsername: my.username,
      fromPlatform: this.platform,
      targetDeviceId,
    });
  }

  public rejectConnect(targetDeviceId: string, reason?: string) {
    const my = this.getIdentity();
    this.post({
      kind: 'connect_reject',
      fromDeviceId: my.deviceId,
      fromName: my.name,
      targetDeviceId,
      reason,
    });
  }

  public notifyDisconnect(targetDeviceId: string) {
    const my = this.getIdentity();
    this.post({
      kind: 'disconnect_notice',
      fromDeviceId: my.deviceId,
      targetDeviceId,
    });
  }

  public sendPacket(targetDeviceId: string, packet: WireMessagePacket): boolean {
    if (!this.bc) return false;
    const my = this.getIdentity();
    this.post({
      kind: 'packet',
      fromDeviceId: my.deviceId,
      targetDeviceId,
      packet,
    });
    return true;
  }

  public close() {
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.activeCodeBeacon) {
      this.cancelCodeHost();
    }
    const my = this.getIdentity();
    this.post({
      kind: 'presence_leave',
      sessionId: this.sessionId,
      deviceId: my.deviceId,
    });
    try {
      this.bc?.close();
    } catch {
      // Ignore
    }
    this.bc = null;
  }
}
