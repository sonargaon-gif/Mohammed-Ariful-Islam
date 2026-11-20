import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  Check,
  Clock,
  ExternalLink,
  KeyRound,
  Laptop,
  Loader2,
  Lock,
  MessageSquare,
  Pencil,
  Radio,
  RefreshCw,
  Settings,
  ShieldCheck,
  Smartphone,
  Square,
  Unplug,
  UserCheck,
  X,
} from 'lucide-react';
import {
  BluetoothRuntimeStatus,
  BrowserCapabilityReport,
  ContactLiveConnection,
  ContactRecord,
  DevicePlatformKind,
  DiscoveredBtDevice,
  DiscoveredCodeHost,
  IncomingConnectionRequest,
  LiveConnectionState,
  PendingCodeApproval,
  TemporaryCodeSession,
  UserProfileRecord,
} from '../types/contacts';
import { NativeDiscoveredPeer } from '../utils/nativeOfflineBridge';
import { LocalPeerPresence } from '../utils/offlineP2pTransport';
import { formatSixDigitCode, normalizeSixDigitCode } from '../crypto/codePairing';
import { getInitials } from '../utils/contactQrCodec';

const NAVY_CONNECTIVITY_BG = '/src/assets/images/freeconnect_futuristic_bg_1795073450644.jpg';

interface NearbyDevicesHubPageProps {
  profile: UserProfileRecord;
  capabilities: BrowserCapabilityReport;
  bluetoothRuntime: BluetoothRuntimeStatus;
  contacts: ContactRecord[];
  liveConnections: Record<string, ContactLiveConnection>;
  discoveredBtDevices: DiscoveredBtDevice[];
  nativeNearbyPeers: NativeDiscoveredPeer[];
  localNearbyPeers: LocalPeerPresence[];
  incomingRequests: IncomingConnectionRequest[];
  btScanState: LiveConnectionState;
  btScanFeedback: string | null;
  overallStatus: LiveConnectionState;
  activeCodeSession: TemporaryCodeSession | null;
  discoveredCodeHosts: DiscoveredCodeHost[];
  pendingCodeApproval: PendingCodeApproval | null;
  codePairingState:
    | 'idle'
    | 'hosting'
    | 'validating'
    | 'awaiting_local_approval'
    | 'awaiting_host_approval'
    | 'connected'
    | 'rejected'
    | 'expired'
    | 'failed';
  codePairingMessage: string | null;
  onToggleBluetooth: (enabled: boolean) => Promise<{ ok: boolean; message: string }>;
  onOpenBluetoothSettings: () => void;
  onStartAutoDiscovery: () => void;
  onStopAutoDiscovery: () => void;
  onScanWebBluetooth: () => Promise<void>;
  onConnectNativePeer: (peer: NativeDiscoveredPeer) => Promise<ContactRecord>;
  onConnectLocalPeer: (peer: LocalPeerPresence) => Promise<ContactRecord>;
  onAcceptRequest: (req: IncomingConnectionRequest) => Promise<ContactRecord | null>;
  onRejectRequest: (req: IncomingConnectionRequest) => void;
  onDisconnectContact: (contactId: string) => void;
  onDisconnectAll: () => void;
  onOpenChat: (contactId: string) => void;
  onEditProfile: () => void;
  onGenerateCode: () => Promise<TemporaryCodeSession>;
  onCancelCode: () => void;
  onValidateEnteredCode: (code: string) => Promise<{ ok: boolean; error?: string }>;
  onConfirmCodeRequest: () => Promise<void>;
  onCancelPendingCodeApproval: () => void;
}

function platformLabel(platform: DevicePlatformKind | string | undefined): string {
  switch (platform) {
    case 'ios':
      return 'iPhone / iOS';
    case 'android':
      return 'Android';
    case 'desktop':
      return 'Desktop';
    case 'browser':
      return 'Browser';
    default:
      return 'Compatible Device';
  }
}

function formatCountdown(msRemaining: number): string {
  const sec = Math.max(0, Math.ceil(msRemaining / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function statusDescriptor(status: LiveConnectionState): { label: string; tone: string } {
  switch (status) {
    case 'connected':
      return { label: 'Connected', tone: 'text-emerald-300' };
    case 'request_received':
      return { label: 'Request Received', tone: 'text-[#38D9FF]' };
    case 'request_sent':
      return { label: 'Request Sent · Waiting for Acceptance', tone: 'text-amber-300' };
    case 'connecting':
      return { label: 'Connecting', tone: 'text-amber-300' };
    case 'searching':
      return { label: 'Scanning Nearby', tone: 'text-[#38D9FF]' };
    case 'failed':
      return { label: 'Connection Rejected', tone: 'text-rose-300' };
    default:
      return { label: 'Available', tone: 'text-slate-300' };
  }
}

export function NearbyDevicesHubPage({
  profile,
  capabilities,
  bluetoothRuntime,
  contacts,
  liveConnections,
  discoveredBtDevices,
  nativeNearbyPeers,
  localNearbyPeers,
  incomingRequests,
  btScanState,
  btScanFeedback,
  overallStatus,
  activeCodeSession,
  discoveredCodeHosts,
  pendingCodeApproval,
  codePairingState,
  codePairingMessage,
  onToggleBluetooth,
  onOpenBluetoothSettings,
  onStartAutoDiscovery,
  onStopAutoDiscovery,
  onScanWebBluetooth,
  onConnectNativePeer,
  onConnectLocalPeer,
  onAcceptRequest,
  onRejectRequest,
  onDisconnectContact,
  onDisconnectAll,
  onOpenChat,
  onEditProfile,
  onGenerateCode,
  onCancelCode,
  onValidateEnteredCode,
  onConfirmCodeRequest,
  onCancelPendingCodeApproval,
}: NearbyDevicesHubPageProps) {
  const [activeTab, setActiveTab] = useState<'nearby' | 'code'>('nearby');
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [bgFailed, setBgFailed] = useState(false);
  const [busyPeerId, setBusyPeerId] = useState<string | null>(null);
  const [btActionNotice, setBtActionNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [btToggleBusy, setBtToggleBusy] = useState(false);
  const currentPageHref = typeof window !== 'undefined' ? window.location.href : '/';

  // Stop native scan cleanly if user leaves page
  useEffect(() => {
    return () => {
      onStopAutoDiscovery();
    };
  }, [onStopAutoDiscovery]);

  // Live 1-second tick for temporary 6-digit code expiration timers
  useEffect(() => {
    if (!activeCodeSession && !pendingCodeApproval && discoveredCodeHosts.length === 0) {
      return;
    }
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeCodeSession, pendingCodeApproval, discoveredCodeHosts.length]);

  const activeConnectedContacts = useMemo(
    () => contacts.filter((c) => !c.isBlocked && liveConnections[c.id]?.status === 'connected'),
    [contacts, liveConnections]
  );

  // Unified progressive list of REAL nearby devices (never includes user's own device, zero fake devices)
  const nearbyList = useMemo(() => {
    const myIdUpper = profile.deviceId.toUpperCase();
    const items: Array<{
      key: string;
      name: string;
      username?: string;
      deviceCode: string;
      platform: DevicePlatformKind;
      transportLabel: string;
      rssi?: number;
      status: LiveConnectionState;
      detailMessage?: string;
      contactId?: string;
      nativePeer?: NativeDiscoveredPeer;
      localPeer?: LocalPeerPresence;
    }> = [];

    for (const peer of nativeNearbyPeers) {
      const code = peer.deviceCode || `FC-${peer.id.slice(0, 6).toUpperCase()}`;
      if (code.toUpperCase() === myIdUpper) continue;
      const matchedContact = contacts.find(
        (c) => c.bluetoothDeviceId === peer.id || c.deviceId.toUpperCase() === code.toUpperCase()
      );
      const live = matchedContact ? liveConnections[matchedContact.id] : undefined;
      items.push({
        key: `native:${peer.id}`,
        name: peer.name,
        deviceCode: code,
        platform: peer.platform ?? 'unknown',
        transportLabel:
          peer.transport === 'native_wifi_direct'
            ? capabilities.nativeBridgePlatform === 'ios_native'
              ? 'Apple Multipeer'
              : 'Wi-Fi Direct P2P'
            : 'Native Bluetooth LE',
        rssi: peer.rssi,
        status: live?.status ?? (peer.connected ? 'connected' : 'disconnected'),
        detailMessage: live?.detailMessage,
        contactId: matchedContact?.id,
        nativePeer: peer,
      });
    }

    for (const peer of localNearbyPeers) {
      if (peer.deviceId.toUpperCase() === myIdUpper) continue;
      const matchedContact = contacts.find(
        (c) => c.deviceId.toUpperCase() === peer.deviceId.toUpperCase()
      );
      const live = matchedContact ? liveConnections[matchedContact.id] : undefined;
      items.push({
        key: `local:${peer.deviceId}`,
        name: peer.name,
        username: peer.username,
        deviceCode: peer.deviceId,
        platform: peer.platform ?? 'browser',
        transportLabel: 'Local Offline Channel',
        status: live?.status ?? 'disconnected',
        detailMessage: live?.detailMessage,
        contactId: matchedContact?.id,
        localPeer: peer,
      });
    }

    return items;
  }, [
    profile.deviceId,
    nativeNearbyPeers,
    localNearbyPeers,
    contacts,
    liveConnections,
    capabilities.nativeBridgePlatform,
  ]);

  const isScanning = btScanState === 'searching' || btScanState === 'connecting';
  const overallInfo = statusDescriptor(overallStatus);
  const codeRemainingMs = activeCodeSession ? Math.max(0, activeCodeSession.expiresAt - nowMs) : 0;

  const handleScanForDevices = async () => {
    setBtActionNotice(null);

    if (isScanning) {
      onStopAutoDiscovery();
      return;
    }

    // Native iOS / Android requires Bluetooth turned ON in Settings first
    if (capabilities.nativeBridgePlatform !== 'none') {
      if (!bluetoothRuntime.enabled) {
        setBtActionNotice({
          ok: false,
          text: 'Bluetooth is currently OFF. Tap Turn Bluetooth ON above (or in Bluetooth Settings) before scanning for nearby devices.',
        });
        return;
      }
      onStartAutoDiscovery();
      return;
    }

    // Standard browser with Web Bluetooth enabled: open real browser Bluetooth picker AND scan local peers
    if (
      bluetoothRuntime.enabled &&
      capabilities.webBluetoothSupported &&
      bluetoothRuntime.permissionState !== 'iframe_blocked'
    ) {
      onStartAutoDiscovery();
      await onScanWebBluetooth();
      return;
    }

    // Otherwise run honest local peer discovery & explain Bluetooth requirement transparently
    onStartAutoDiscovery();
    if (!bluetoothRuntime.enabled) {
      setBtActionNotice({
        ok: false,
        text: capabilities.isIos
          ? 'iOS Safari does not expose Web Bluetooth or MultipeerConnectivity to websites. Local same-device sessions are scanned; for real Bluetooth/Multipeer discovery between iPhones and Androids, use the native iOS app (ios-freeconnect/).'
          : capabilities.webBluetoothSupported
            ? 'Bluetooth is currently OFF. Scanning local same-device channels only — tap Turn Bluetooth ON above to check your adapter and enable real Web Bluetooth scanning.'
            : 'Web Bluetooth is not supported in this browser. Scanning local offline channels only.',
      });
    }
  };

  const handleQuickBluetoothToggle = async () => {
    setBtToggleBusy(true);
    setBtActionNotice(null);
    try {
      const res = await onToggleBluetooth(!bluetoothRuntime.enabled);
      setBtActionNotice({ ok: res.ok, text: res.message });
    } catch (err) {
      setBtActionNotice({
        ok: false,
        text: err instanceof Error ? err.message : 'Unable to toggle Bluetooth right now.',
      });
    } finally {
      setBtToggleBusy(false);
    }
  };

  const handleSubmitCode = async (e: FormEvent) => {
    e.preventDefault();
    setCodeError(null);
    const res = await onValidateEnteredCode(codeInput);
    if (!res.ok) {
      setCodeError(res.error ?? 'Could not validate 6-digit code.');
    }
  };

  return (
    <div className="relative rounded-3xl overflow-hidden border border-[#168BFF]/35 shadow-[0_24px_80px_rgba(6,21,46,0.7)] bg-[#06152E]">
      {/* Premium Navy Blue Connectivity Background (#06152E -> #0A1F40 -> #123B68) */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {!bgFailed ? (
          <img
            src={NAVY_CONNECTIVITY_BG}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            onError={() => setBgFailed(true)}
            className="w-full h-full object-cover opacity-40"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-[#06152E]/92 via-[#0A1F40]/88 to-[#06152E]/96" />
      </div>

      {/* Foreground Content */}
      <div className="relative z-10 p-5 sm:p-7 lg:p-8 space-y-6 text-white">
        {/* Top Header + User Visible Identity */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#123B68]">
          <div className="space-y-1.5">
            <p className="text-xs font-mono text-[#38D9FF]">
              FreeConnect Connectivity · Offline Bluetooth &amp; Direct P2P
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Nearby Devices Connectivity
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
              <span className={`font-semibold ${overallInfo.tone}`}>
                {overallStatus === 'disconnected' ? 'Idle' : overallInfo.label}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Bluetooth: {bluetoothRuntime.enabled ? 'ON' : 'OFF'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {nearbyList.length} discovered
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {activeConnectedContacts.length} connected
              </span>
            </div>
          </div>

          {/* Visible Local Identity Summary */}
          <div className="flex items-center justify-between sm:justify-end gap-3 px-4 py-3 rounded-2xl bg-[#0A1F40]/90 backdrop-blur-xl border border-[#123B68]">
            <div className="flex items-center gap-3 min-w-0">
              {profile.avatarDataUrl ? (
                <img
                  src={profile.avatarDataUrl}
                  alt={profile.name}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-xl object-cover border border-[#38D9FF]/45 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#168BFF] to-[#38D9FF] flex items-center justify-center text-xs font-bold text-[#06152E] shrink-0">
                  {getInitials(profile.name)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{profile.name}</p>
                <p className="text-xs text-[#38D9FF]/90 truncate font-mono">
                  {profile.username} · {profile.deviceId}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onEditProfile}
              className="px-3 h-9 rounded-xl bg-[#123B68] hover:bg-[#194c84] border border-[#38D9FF]/30 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          </div>
        </div>

        {/* BLUETOOTH ON/OFF STATUS BAR + SCAN RADAR HERO */}
        <div className="rounded-2xl bg-[#0A1F40]/92 border border-[#168BFF]/35 p-5 sm:p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-center gap-5 min-w-0">
              {/* Scanning Radar Animation (Strictly animates ONLY while genuinely scanning) */}
              <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
                {isScanning && (
                  <>
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full border-2 border-[#38D9FF]/70 animate-ping"
                    />
                    <span
                      aria-hidden="true"
                      className="absolute -inset-2 rounded-full border border-[#168BFF]/50 animate-pulse"
                    />
                  </>
                )}
                <div
                  className={`relative z-10 w-14 h-14 rounded-2xl flex items-center justify-center border transition-colors ${
                    activeConnectedContacts.length > 0
                      ? 'bg-gradient-to-br from-emerald-500 to-[#38D9FF] border-emerald-300/60 shadow-[0_0_24px_rgba(56,217,255,0.4)]'
                      : bluetoothRuntime.enabled || isScanning
                        ? 'bg-gradient-to-br from-[#168BFF] to-[#38D9FF] border-[#38D9FF]/60 shadow-[0_0_24px_rgba(22,139,255,0.5)]'
                        : 'bg-[#123B68] border-white/15'
                  }`}
                >
                  {activeConnectedContacts.length > 0 ? (
                    <BluetoothConnected className="w-6 h-6 text-[#06152E]" />
                  ) : bluetoothRuntime.enabled || isScanning ? (
                    <Bluetooth className="w-6 h-6 text-[#06152E]" />
                  ) : (
                    <BluetoothOff className="w-6 h-6 text-slate-300" />
                  )}
                </div>
              </div>

              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                  <h2 className="text-base font-extrabold text-white">
                    Bluetooth Status:{' '}
                    <span className={bluetoothRuntime.enabled ? 'text-[#38D9FF]' : 'text-slate-300'}>
                      {bluetoothRuntime.enabled ? 'ON' : 'OFF'}
                    </span>
                  </h2>
                  <span className="text-xs text-slate-400" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-xs font-mono text-slate-300">
                    {bluetoothRuntime.visibilityState === 'discoverable'
                      ? 'Discoverable'
                      : bluetoothRuntime.visibilityState === 'central_only'
                        ? 'Central Mode Only'
                        : 'Hidden'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
                  {bluetoothRuntime.statusMessage}
                </p>
              </div>
            </div>

            {/* Primary Controls: Real Bluetooth Switch + Settings Link + Scan for Devices */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                disabled={btToggleBusy}
                onClick={() => void handleQuickBluetoothToggle()}
                className={`px-3.5 h-10 rounded-xl border text-xs font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-60 ${
                  bluetoothRuntime.enabled
                    ? 'bg-[#123B68] border-[#38D9FF]/45 text-[#38D9FF] hover:bg-[#194c84]'
                    : 'bg-[#06152E] border-[#38D9FF]/40 text-white hover:bg-[#123B68]'
                }`}
              >
                {btToggleBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : bluetoothRuntime.enabled ? (
                  <Bluetooth className="w-3.5 h-3.5" />
                ) : (
                  <BluetoothOff className="w-3.5 h-3.5" />
                )}
                {btToggleBusy
                  ? 'Checking Bluetooth...'
                  : bluetoothRuntime.enabled
                    ? 'Turn Bluetooth OFF'
                    : 'Turn Bluetooth ON'}
              </button>

              <button
                type="button"
                onClick={onOpenBluetoothSettings}
                className="px-3.5 h-10 rounded-xl bg-[#06152E] hover:bg-[#123B68] border border-[#123B68] text-xs font-semibold text-slate-200 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-[#38D9FF]" />
                Bluetooth Settings
              </button>

              <button
                type="button"
                onClick={() => void handleScanForDevices()}
                className={`px-4 h-10 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap cursor-pointer transition-all ${
                  isScanning
                    ? 'bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/50 text-rose-100'
                    : 'bg-gradient-to-r from-[#168BFF] to-[#38D9FF] hover:brightness-110 text-[#06152E] shadow-[0_0_24px_rgba(22,139,255,0.45)]'
                }`}
              >
                {isScanning ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current" />
                    Stop Scan
                  </>
                ) : (
                  <>
                    <Radio className="w-4 h-4" />
                    Scan for Devices
                  </>
                )}
              </button>
            </div>
          </div>

          {btActionNotice && (
            <div
              role="status"
              className={`rounded-xl px-4 py-3 border text-xs flex items-start gap-2.5 ${
                btActionNotice.ok
                  ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-100'
                  : 'bg-amber-500/15 border-amber-400/45 text-amber-100'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <p className="leading-relaxed">{btActionNotice.text}</p>
                {!btActionNotice.ok &&
                  (bluetoothRuntime.permissionState === 'iframe_blocked' ||
                    capabilities.isEmbeddedIframe) && (
                    <a
                      href={currentPageHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#168BFF] hover:brightness-110 text-white font-bold text-xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open in Full Browser Tab for Real Bluetooth
                    </a>
                  )}
              </div>
            </div>
          )}
        </div>

        {/* Inline Incoming Requests Bar (Secondary mirror of global Connection Request Popup) */}
        {incomingRequests.length > 0 && (
          <div className="rounded-2xl bg-[#123B68]/85 border border-[#38D9FF]/60 p-5 space-y-3 shadow-[0_0_32px_rgba(56,217,255,0.2)]">
            <div className="flex items-center gap-2 text-[#38D9FF]">
              <UserCheck className="w-5 h-5 shrink-0" />
              <h2 className="text-sm font-extrabold text-white">
                Connection Request ({incomingRequests.length})
              </h2>
            </div>

            <div className="divide-y divide-[#38D9FF]/20">
              {incomingRequests.map((req) => (
                <div
                  key={req.id}
                  className="py-3 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      Someone wants to connect with you — {req.peerName}
                    </p>
                    <p className="text-xs text-slate-200 mt-0.5">
                      {platformLabel(req.platform)}
                      {req.codeVerified ? ' · 6-Digit Code Verified' : ' · Direct Connection Request'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onRejectRequest(req)}
                      className="px-4 h-10 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/45 text-rose-100 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const contact = await onAcceptRequest(req);
                        if (contact) {
                          onOpenChat(contact.id);
                        }
                      }}
                      className="px-4 h-10 rounded-xl bg-gradient-to-r from-[#168BFF] to-[#38D9FF] hover:brightness-110 text-[#06152E] text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mode Switcher: Nearby Devices vs Connect with Code */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex p-1 rounded-2xl bg-[#0A1F40] border border-[#123B68]">
            <button
              type="button"
              onClick={() => setActiveTab('nearby')}
              className={`px-4 h-10 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'nearby'
                  ? 'bg-gradient-to-r from-[#168BFF] to-[#38D9FF] text-[#06152E] shadow-[0_0_18px_rgba(22,139,255,0.4)]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Radio className="w-4 h-4" />
              Nearby Devices
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className={`px-4 h-10 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'code'
                  ? 'bg-gradient-to-r from-[#168BFF] to-[#38D9FF] text-[#06152E] shadow-[0_0_18px_rgba(22,139,255,0.4)]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              Connect with Code
            </button>
          </div>

          {activeTab === 'nearby' &&
            capabilities.webBluetoothSupported &&
            bluetoothRuntime.permissionState !== 'iframe_blocked' && (
              <button
                type="button"
                onClick={() => void onScanWebBluetooth()}
                className="px-4 h-10 rounded-xl bg-[#123B68] hover:bg-[#194c84] border border-[#38D9FF]/35 text-xs font-bold text-white flex items-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <Bluetooth className="w-4 h-4 text-[#38D9FF]" />
                Browser Bluetooth Device Picker
              </button>
            )}
        </div>

        {/* TAB 1: NEARBY DEVICES */}
        {activeTab === 'nearby' && (
          <div className="space-y-6">
            {/* Available Nearby Devices List */}
            <div className="rounded-2xl bg-[#0A1F40]/90 border border-[#123B68] p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-white">Nearby Discoverable Devices</h2>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Real FreeConnect-compatible devices appear progressively as they are discovered.
                    Your own phone is automatically excluded.
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums text-[#38D9FF]">
                  {nearbyList.length} found
                </span>
              </div>

              {btScanFeedback && (
                <div className="text-xs text-slate-100 bg-[#06152E]/90 border border-[#168BFF]/35 rounded-xl px-4 py-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-[#38D9FF] shrink-0 mt-0.5" />
                  <span>{btScanFeedback}</span>
                </div>
              )}

              {nearbyList.length === 0 ? (
                <div className="py-10 px-4 text-center space-y-3 border border-dashed border-[#168BFF]/35 rounded-2xl bg-[#06152E]/70">
                  <Bluetooth className="w-8 h-8 text-[#38D9FF] mx-auto" />
                  <p className="text-sm font-bold text-white">
                    {isScanning
                      ? 'Scanning for nearby FreeConnect devices...'
                      : 'No nearby FreeConnect devices discovered yet'}
                  </p>
                  <p className="text-xs text-slate-300 max-w-xl mx-auto leading-relaxed">
                    {capabilities.nativeBridgePlatform !== 'none'
                      ? bluetoothRuntime.enabled
                        ? 'Keep FreeConnect open on both phones with Bluetooth enabled. Discovered devices appear here automatically and disappear when out of range.'
                        : 'Turn Bluetooth ON in Settings, then tap Scan for Devices to start real device discovery.'
                      : capabilities.isIos
                        ? 'iOS Safari does not support Web Bluetooth or Apple MultipeerConnectivity. Build the native iOS project (ios-freeconnect/) for real iPhone-to-iPhone and iPhone-to-Android Bluetooth discovery.'
                        : 'In a standard browser, Chrome/Edge can pair with a BLE GATT peripheral via Scan for Devices (Central mode), and separate browser tabs on this device appear automatically via Local Offline Channel. Full background phone-to-phone Bluetooth discovery requires the native Android (android-freeconnect/) or iOS (ios-freeconnect/) build.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#123B68]">
                  {nearbyList.map((device) => {
                    const st = statusDescriptor(device.status);
                    const isConnected = device.status === 'connected';
                    const isPending =
                      device.status === 'request_sent' || device.status === 'connecting';

                    return (
                      <div
                        key={device.key}
                        className="py-4 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-11 h-11 rounded-2xl bg-[#123B68] border border-[#38D9FF]/30 flex items-center justify-center text-[#38D9FF] shrink-0">
                            {device.platform === 'ios' || device.platform === 'android' ? (
                              <Smartphone className="w-5 h-5" />
                            ) : (
                              <Laptop className="w-5 h-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">{device.name}</p>
                            <p className="text-xs text-slate-300 truncate mt-0.5">
                              {platformLabel(device.platform)} · {device.transportLabel}
                              {device.rssi !== undefined ? ` · ${device.rssi} dBm` : ''}
                            </p>
                            <p className={`text-xs font-mono mt-0.5 ${st.tone}`}>
                              {st.label} · {device.deviceCode}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isConnected && device.contactId ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onOpenChat(device.contactId!)}
                                className="px-4 h-10 rounded-xl bg-gradient-to-r from-[#168BFF] to-[#38D9FF] text-[#06152E] text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                              >
                                <MessageSquare className="w-4 h-4" />
                                Open Chat
                              </button>
                              <button
                                type="button"
                                onClick={() => onDisconnectContact(device.contactId!)}
                                className="px-3.5 h-10 rounded-xl bg-[#123B68] hover:bg-rose-500/25 border border-white/15 text-xs font-semibold text-slate-100 whitespace-nowrap cursor-pointer"
                              >
                                Disconnect
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={isPending || busyPeerId === device.key}
                              onClick={async () => {
                                setBusyPeerId(device.key);
                                try {
                                  if (device.nativePeer) {
                                    await onConnectNativePeer(device.nativePeer);
                                  } else if (device.localPeer) {
                                    await onConnectLocalPeer(device.localPeer);
                                  }
                                } finally {
                                  setBusyPeerId(null);
                                }
                              }}
                              className="px-4 h-10 rounded-xl bg-gradient-to-r from-[#168BFF] to-[#38D9FF] hover:brightness-110 disabled:opacity-60 text-[#06152E] text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                            >
                              {isPending || busyPeerId === device.key ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Request Sent
                                </>
                              ) : (
                                <>
                                  <Bluetooth className="w-4 h-4" />
                                  {device.status === 'failed' ? 'Retry Connect' : 'Connect'}
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Web Bluetooth GATT devices paired via browser picker */}
              {discoveredBtDevices.filter((d) => d.source === 'bluetooth').length > 0 && (
                <div className="pt-4 border-t border-[#123B68] space-y-2">
                  <p className="text-xs font-semibold text-[#38D9FF]">
                    Paired via Web Bluetooth GATT Picker
                  </p>
                  {discoveredBtDevices
                    .filter((d) => d.source === 'bluetooth')
                    .map((dev) => (
                      <div
                        key={dev.id}
                        className="py-2.5 px-3.5 rounded-xl bg-[#06152E]/85 border border-[#123B68] flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{dev.name}</p>
                          <p className="text-xs text-slate-300 truncate">{dev.note}</p>
                        </div>
                        <span className="text-xs font-mono text-[#38D9FF] shrink-0">
                          {dev.connected ? 'Connected' : 'Paired'}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Active Connected Devices Section */}
            <div className="rounded-2xl bg-[#0A1F40]/90 border border-[#123B68] p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <BluetoothConnected className="w-4 h-4 text-emerald-400" />
                  Connected Devices
                </h2>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono tabular-nums text-emerald-300">
                    {activeConnectedContacts.length} active
                  </span>
                  {activeConnectedContacts.length > 1 && (
                    <button
                      type="button"
                      onClick={onDisconnectAll}
                      className="px-3 h-8 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/40 text-rose-200 text-xs font-bold cursor-pointer"
                    >
                      Disconnect All
                    </button>
                  )}
                </div>
              </div>

              {activeConnectedContacts.length === 0 ? (
                <p className="text-xs text-slate-300">
                  No devices are connected yet. Connected devices only appear here after a real
                  transport link is established and approved by the receiving user.
                </p>
              ) : (
                <div className="divide-y divide-[#123B68]">
                  {activeConnectedContacts.map((contact) => {
                    const live = liveConnections[contact.id];
                    return (
                      <div
                        key={contact.id}
                        className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm font-bold text-white truncate">{contact.name}</p>
                          <p className="text-xs text-emerald-300 truncate">
                            {live?.availabilityText ?? 'Connected offline'}
                          </p>
                          {live?.authenticated && live.safetyNumber && (
                            <p className="text-[11px] font-mono text-[#38D9FF] flex items-center gap-1.5">
                              <Lock className="w-3 h-3 shrink-0" />
                              AES-256-GCM Verified · Safety #{live.safetyNumber}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onOpenChat(contact.id)}
                            className="px-4 h-9 rounded-xl bg-gradient-to-r from-[#168BFF] to-[#38D9FF] text-[#06152E] text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Open Chat
                          </button>
                          <button
                            type="button"
                            onClick={() => onDisconnectContact(contact.id)}
                            className="px-3.5 h-9 rounded-xl bg-[#123B68] hover:bg-rose-500/25 border border-white/15 text-xs font-semibold text-slate-100 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                          >
                            <Unplug className="w-3.5 h-3.5" />
                            Disconnect
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Honest Platform & Cross-Platform Compatibility Architecture Reference */}
            <div className="rounded-2xl bg-[#06152E]/85 border border-[#123B68] p-5 space-y-3 text-xs text-slate-300">
              <p className="font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#38D9FF]" />
                Platform Compatibility &amp; Cross-Platform Reality
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                <div className="space-y-1">
                  <p className="font-bold text-[#38D9FF]">Android Native (android-freeconnect/)</p>
                  <p className="leading-relaxed">
                    Uses native Android BLE GATT Central + Peripheral (`FreeConnectBleManager.kt`)
                    and Wi-Fi Direct P2P (`FreeConnectWifiDirectManager.kt`) with explicit
                    Accept/Reject approval.
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-[#38D9FF]">iOS Native (ios-freeconnect/)</p>
                  <p className="leading-relaxed">
                    Uses native Apple CoreBluetooth (`FreeConnectBLEManager.swift`) and
                    MultipeerConnectivity (`FreeConnectMultipeerManager.swift`). Required on iPhone
                    because iOS Safari does not support Web Bluetooth.
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-[#38D9FF]">Android ↔ iPhone Cross-Platform</p>
                  <p className="leading-relaxed">
                    Apple Multipeer is iOS-only and Wi-Fi Direct is Android-only. Cross-platform
                    Android ↔ iPhone works via shared BLE GATT UUID (`F000FC01-...`) when both
                    devices run the native builds (or Chrome Web Bluetooth Central ↔ native BLE
                    Peripheral).
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CONNECT WITH 6-DIGIT CODE (Preserved Intact) */}
        {activeTab === 'code' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            <div className="rounded-2xl bg-[#0A1F40]/90 border border-[#123B68] p-6 flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Generate 6-Digit Connection Code
                  </h2>
                  <p className="text-xs text-slate-300 mt-1">
                    Creates a temporary cryptographic single-use code that expires automatically
                    after 3 minutes. Both users must approve before the local link opens.
                  </p>
                </div>

                {activeCodeSession ? (
                  <div className="rounded-2xl bg-[#06152E] border border-[#38D9FF]/45 p-6 text-center space-y-4">
                    <p className="text-xs text-[#38D9FF]">Temporary Connection Code</p>
                    <p className="text-4xl sm:text-5xl font-extrabold font-mono tabular-nums tracking-[0.22em] text-white">
                      {formatSixDigitCode(activeCodeSession.code)}
                    </p>
                    <div className="flex items-center justify-center gap-3 text-xs text-slate-300 font-mono tabular-nums">
                      <span className="inline-flex items-center gap-1.5 text-[#38D9FF]">
                        <Clock className="w-3.5 h-3.5" />
                        Expires in {formatCountdown(codeRemainingMs)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {activeCodeSession.maxAttempts - activeCodeSession.failedAttempts} tries left
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Only a salted SHA-256 commitment is announced locally — never the raw code.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-[#06152E]/75 border border-dashed border-[#168BFF]/35 p-8 text-center space-y-3">
                    <KeyRound className="w-8 h-8 text-[#38D9FF] mx-auto" />
                    <p className="text-sm font-semibold text-white">No active code right now</p>
                    <p className="text-xs text-slate-300">
                      Generate a temporary 6-digit code so another nearby user can authenticate and
                      request a direct offline connection.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => void onGenerateCode()}
                  className="flex-1 h-11 px-4 rounded-xl bg-gradient-to-r from-[#168BFF] to-[#38D9FF] hover:brightness-110 text-[#06152E] text-xs font-extrabold flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  {activeCodeSession ? 'Regenerate New Code' : 'Generate 6-Digit Code'}
                </button>
                {activeCodeSession && (
                  <button
                    type="button"
                    onClick={onCancelCode}
                    className="h-11 px-4 rounded-xl bg-[#123B68] hover:bg-rose-500/25 border border-white/20 text-xs font-semibold text-slate-100 whitespace-nowrap cursor-pointer"
                  >
                    Expire Now
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-[#0A1F40]/90 border border-[#123B68] p-6 flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-bold text-white">Enter 6-Digit Code</h2>
                  <p className="text-xs text-slate-300 mt-1">
                    Enter the 6-digit temporary code shown on the nearby device. The code is
                    verified locally with SHA-256 before requesting mutual approval.
                  </p>
                </div>

                {!pendingCodeApproval ? (
                  <form onSubmit={handleSubmitCode} className="space-y-4">
                    <div>
                      <label
                        htmlFor="fc-six-digit-code"
                        className="block text-xs font-semibold text-[#38D9FF] mb-2"
                      >
                        6-Digit Connection Code
                      </label>
                      <input
                        id="fc-six-digit-code"
                        type="text"
                        inputMode="numeric"
                        maxLength={7}
                        autoComplete="one-time-code"
                        value={formatSixDigitCode(codeInput)}
                        onChange={(e) => {
                          setCodeInput(normalizeSixDigitCode(e.target.value));
                          setCodeError(null);
                        }}
                        placeholder="000 000"
                        className="w-full h-14 px-4 rounded-xl bg-[#06152E] border border-[#168BFF]/45 focus:border-[#38D9FF] focus:outline-none text-center text-2xl font-mono tabular-nums tracking-[0.25em] text-white placeholder:text-slate-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={
                        normalizeSixDigitCode(codeInput).length !== 6 ||
                        codePairingState === 'validating'
                      }
                      className="w-full h-11 rounded-xl bg-gradient-to-r from-[#168BFF] to-[#38D9FF] hover:brightness-110 disabled:opacity-50 text-[#06152E] text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {codePairingState === 'validating' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Validating Code...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          Validate 6-Digit Code
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  <div className="rounded-2xl bg-[#06152E] border border-emerald-400/45 p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">
                          Code Verified · Approve Connection
                        </p>
                        <p className="text-xs text-slate-300 mt-1">
                          Matched nearby device{' '}
                          <span className="font-bold text-white">
                            {pendingCodeApproval.hostName}
                          </span>{' '}
                          ({platformLabel(pendingCodeApproval.hostPlatform)}). Confirm below to send
                          your approval; the other user must also tap Accept.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={onCancelPendingCodeApproval}
                        className="flex-1 h-10 rounded-xl bg-[#123B68] hover:bg-white/15 border border-white/20 text-xs font-semibold text-slate-100 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={codePairingState === 'awaiting_host_approval'}
                        onClick={() => void onConfirmCodeRequest()}
                        className="flex-1 h-10 rounded-xl bg-gradient-to-r from-[#168BFF] to-[#38D9FF] hover:brightness-110 disabled:opacity-60 text-[#06152E] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {codePairingState === 'awaiting_host_approval' ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Waiting for Host...
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            Approve &amp; Connect
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {(codeError || codePairingMessage) && (
                  <div
                    className={`rounded-xl px-3.5 py-3 border text-xs flex items-start gap-2 ${
                      codeError ||
                      codePairingState === 'failed' ||
                      codePairingState === 'rejected' ||
                      codePairingState === 'expired'
                        ? 'bg-rose-500/15 border-rose-400/40 text-rose-200'
                        : codePairingState === 'connected'
                          ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                          : 'bg-[#168BFF]/15 border-[#38D9FF]/35 text-slate-100'
                    }`}
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{codeError ?? codePairingMessage}</span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-[#123B68] flex items-center justify-between text-xs text-slate-400">
                <span>Nearby code hosts listening</span>
                <span className="font-mono tabular-nums text-[#38D9FF]">
                  {discoveredCodeHosts.length} active
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
