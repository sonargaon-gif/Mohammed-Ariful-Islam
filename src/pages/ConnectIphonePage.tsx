import { useState } from 'react';
import {
  ArrowRight,
  Bluetooth,
  BluetoothConnected,
  CheckCircle2,
  Info,
  KeyRound,
  Loader2,
  MessageSquare,
  Radio,
  Search,
  Smartphone,
  Unlink,
  WifiOff,
  XCircle,
} from 'lucide-react';
import {
  BrowserCapabilityReport,
  ContactLiveConnection,
  ContactRecord,
  IncomingConnectionRequest,
  LiveConnectionState,
  UserProfileRecord,
} from '../types/contacts';
import { NativeDiscoveredPeer } from '../utils/nativeOfflineBridge';
import { LocalPeerPresence } from '../utils/offlineP2pTransport';

interface ConnectIphonePageProps {
  profile: UserProfileRecord;
  capabilities: BrowserCapabilityReport;
  contacts: ContactRecord[];
  liveConnections: Record<string, ContactLiveConnection>;
  nativeNearbyPeers: NativeDiscoveredPeer[];
  localNearbyPeers: LocalPeerPresence[];
  incomingRequests: IncomingConnectionRequest[];
  scanState: LiveConnectionState;
  scanFeedback: string | null;
  onStartDiscovery: () => void;
  onStopDiscovery: () => void;
  onConnectNativePeer: (peer: NativeDiscoveredPeer) => Promise<ContactRecord>;
  onConnectLocalPeer: (peer: LocalPeerPresence) => Promise<ContactRecord>;
  onAcceptRequest: (req: IncomingConnectionRequest) => Promise<ContactRecord | null>;
  onRejectRequest: (req: IncomingConnectionRequest) => void;
  onDisconnectContact: (contactId: string) => void;
  onOpenChat: (contactId: string) => void;
  onOpenPairingPage: () => void;
}

export function ConnectIphonePage({
  profile,
  capabilities,
  contacts,
  liveConnections,
  nativeNearbyPeers,
  localNearbyPeers,
  incomingRequests,
  scanState,
  scanFeedback,
  onStartDiscovery,
  onStopDiscovery,
  onConnectNativePeer,
  onConnectLocalPeer,
  onAcceptRequest,
  onRejectRequest,
  onDisconnectContact,
  onOpenChat,
  onOpenPairingPage,
}: ConnectIphonePageProps) {
  const [pairingNotice, setPairingNotice] = useState<string | null>(null);

  const isNativeIos = capabilities.nativeBridgePlatform === 'ios_native';
  const isNativeAny = capabilities.nativeBridgePlatform !== 'none';
  const isSearching = scanState === 'searching';

  // Connected contacts list
  const connectedContacts = contacts.filter(
    (c) => !c.isBlocked && liveConnections[c.id]?.status === 'connected'
  );
  const connectingContacts = contacts.filter(
    (c) => !c.isBlocked && liveConnections[c.id]?.status === 'connecting'
  );

  // Determine exact 5-state iPhone connection status
  const iphoneStatus: LiveConnectionState =
    incomingRequests.length > 0
      ? 'request_received'
      : connectingContacts.length > 0
        ? 'connecting'
        : isSearching
          ? 'searching'
          : connectedContacts.length > 0
            ? 'connected'
            : 'disconnected';

  const statusMeta = {
    searching: {
      label: 'Searching',
      badgeClass: 'bg-blue-500/15 border-blue-400/40 text-blue-700 dark:text-cyan-300',
    },
    request_received: {
      label: 'Request Received',
      badgeClass: 'bg-purple-500/15 border-purple-400/45 text-purple-700 dark:text-purple-200',
    },
    connecting: {
      label: 'Connecting',
      badgeClass: 'bg-amber-500/15 border-amber-400/45 text-amber-700 dark:text-amber-300',
    },
    connected: {
      label: 'Connected',
      badgeClass: 'bg-emerald-500/15 border-emerald-400/45 text-emerald-700 dark:text-emerald-300',
    },
    disconnected: {
      label: 'Disconnected',
      badgeClass:
        'bg-slate-100 dark:bg-[#0B1E3D] border-slate-300 dark:border-cyan-400/25 text-slate-600 dark:text-slate-300',
    },
  }[iphoneStatus];

  // Prioritize iPhone / Apple Multipeer peers first
  const sortedNativePeers = [...nativeNearbyPeers].sort((a, b) => {
    const aScore = a.platform === 'ios' || a.transport === 'native_wifi_direct' ? 0 : 1;
    const bScore = b.platform === 'ios' || b.transport === 'native_wifi_direct' ? 0 : 1;
    return aScore - bScore;
  });

  return (
    <div className="space-y-6">
      {/* HEADER & PRIMARY FIND NEARBY IPHONES ACTION */}
      <div className="rounded-3xl bg-white dark:bg-[#07152C]/85 border border-slate-200 dark:border-cyan-400/25 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5">
              <Smartphone className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
              Connect iPhone
            </h1>
            <span
              className={`px-3 py-1 rounded-xl border text-xs font-mono font-bold inline-flex items-center gap-1.5 ${statusMeta.badgeClass}`}
            >
              {(iphoneStatus === 'searching' || iphoneStatus === 'connecting') && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              {iphoneStatus === 'connected' && <BluetoothConnected className="w-3.5 h-3.5" />}
              {iphoneStatus === 'request_received' && <Radio className="w-3.5 h-3.5 animate-pulse" />}
              {statusMeta.label}
            </span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Discover nearby iPhones via native Apple Multipeer / CoreBluetooth, or pair instantly in
            iOS Safari using a verified 6-digit Pairing Code.
          </p>
          <p className="text-xs font-mono text-slate-500 dark:text-cyan-300/80">
            This Device: {profile.name} · ID {profile.deviceId}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {isSearching ? (
            <button
              type="button"
              onClick={onStopDiscovery}
              className="px-5 h-11 rounded-xl border border-slate-300 dark:border-cyan-400/35 text-slate-800 dark:text-cyan-200 text-xs font-bold flex items-center gap-2 cursor-pointer"
            >
              <Loader2 className="w-4 h-4 animate-spin" /> Stop Searching
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartDiscovery}
              className="px-5 h-11 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] hover:brightness-110 text-white text-xs font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(37,99,235,0.4)] cursor-pointer"
            >
              <Search className="w-4 h-4" /> Find Nearby iPhones
            </button>
          )}
        </div>
      </div>

      {/* HONEST PLATFORM STATUS BANNER (NEVER FAKES WEB BLUETOOTH ON IOS SAFARI) */}
      <div
        className={`rounded-2xl p-4 border text-xs flex items-start gap-3 ${
          isNativeIos
            ? 'bg-emerald-500/10 border-emerald-400/35 text-emerald-900 dark:text-emerald-200'
            : 'bg-blue-500/10 border-blue-400/30 text-slate-700 dark:text-cyan-100'
        }`}
      >
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-cyan-300" />
        <div className="space-y-1">
          {isNativeIos ? (
            <>
              <p className="font-bold">Native iOS Offline Radio Active (MultipeerConnectivity + CoreBluetooth BLE)</p>
              <p>
                Two nearby iPhones can discover each other completely offline over Apple Multipeer
                (Bluetooth + AWDL) and CoreBluetooth without Wi-Fi routers or mobile data.
              </p>
            </>
          ) : (
            <>
              <p className="font-bold">
                {capabilities.isIos
                  ? 'Running in iOS Safari Browser (Web Bluetooth & Native Multipeer Restricted by Apple WebKit)'
                  : 'Running in Standard Web Browser'}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                iOS Safari does not expose Apple CoreBluetooth or MultipeerConnectivity to websites.
                For <strong>two real iPhones (or iPhone ↔ Android) right now in Safari</strong>, use the{' '}
                <strong>6-Digit Pairing Code System</strong> below with WhatsApp sharing and explicit
                Accept / Reject approval. For{' '}
                <strong>pure zero-Wi-Fi Bluetooth / Multipeer iPhone discovery</strong>, build the
                included native iOS container (<code>ios-freeconnect/</code>) in Xcode.
              </p>
            </>
          )}
        </div>
      </div>

      {scanFeedback && (
        <div className="rounded-2xl p-3.5 bg-slate-100 dark:bg-[#0B1E3D]/90 border border-slate-200 dark:border-cyan-400/25 text-xs text-slate-700 dark:text-cyan-100 flex items-center gap-2">
          <Bluetooth className="w-4 h-4 text-blue-600 dark:text-cyan-300 shrink-0" />
          <span>{scanFeedback}</span>
        </div>
      )}

      {pairingNotice && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-400/35 text-xs text-emerald-700 dark:text-emerald-200">
          {pairingNotice}
        </div>
      )}

      {/* INCOMING CONNECTION REQUESTS (REQUEST RECEIVED -> ACCEPT / REJECT) */}
      {incomingRequests.length > 0 && (
        <div className="rounded-3xl bg-purple-500/10 border border-purple-400/45 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-purple-600 dark:text-purple-300 animate-pulse" />
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Connection Request Received
            </h2>
          </div>

          {incomingRequests.map((req) => (
            <div
              key={req.id}
              className="rounded-2xl bg-white dark:bg-[#07152C] border border-purple-400/35 p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{req.peerName}</p>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {req.deviceCode ? `${req.deviceCode} · ` : ''}
                  {req.transport === 'native_wifi_direct'
                    ? 'iOS Multipeer P2P'
                    : req.transport === 'native_ble'
                      ? 'CoreBluetooth BLE'
                      : 'Local Offline Link'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onRejectRequest(req)}
                  className="px-4 h-9 rounded-xl border border-red-400/45 text-red-600 dark:text-red-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const contact = await onAcceptRequest(req);
                    if (contact && req.transport === 'local_window_channel') {
                      setPairingNotice(`Connected to ${contact.name}. Ready to chat offline!`);
                    }
                  }}
                  className="px-4 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" /> Accept
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ACTIVE CONNECTED IPHONES / DEVICES */}
      {connectedContacts.length > 0 && (
        <div className="rounded-3xl bg-white dark:bg-[#07152C]/85 border border-emerald-400/40 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <BluetoothConnected className="w-4 h-4 text-emerald-500" />
              Connected Devices ({connectedContacts.length})
            </h2>
            <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
              Live Offline Link Active
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {connectedContacts.map((c) => {
              const live = liveConnections[c.id];
              return (
                <div
                  key={c.id}
                  className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-400/30 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {c.name}
                    </p>
                    <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400 truncate">
                      {live?.availabilityText ?? 'Connected'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenChat(c.id)}
                      className="px-3.5 h-9 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => onDisconnectContact(c.id)}
                      className="px-3 h-9 rounded-xl border border-red-400/40 text-red-600 dark:text-red-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Unlink className="w-3.5 h-3.5" /> Disconnect
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DISCOVERED NEARBY IPHONES (NATIVE MULTIPEER / COREBLUETOOTH + LOCAL PEERS) */}
      <div className="rounded-3xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/25 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
              Discovered Nearby iPhones
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isNativeAny
                ? 'Select a nearby iPhone below to send a connection request (requires recipient approval).'
                : 'Real nearby FreeConnect peers detected on this device or native container appear here. No fake devices are ever simulated.'}
            </p>
          </div>
        </div>

        {sortedNativePeers.length === 0 && localNearbyPeers.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 dark:bg-[#040C1C] border border-dashed border-slate-300 dark:border-cyan-400/20 p-6 text-center space-y-2">
            <WifiOff className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {isSearching
                ? 'Searching for nearby iPhones...'
                : 'No nearby iPhones discovered yet.'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {isNativeAny
                ? 'Open FreeConnect → Connect iPhone on the second iPhone and tap "Find Nearby iPhones".'
                : 'In iOS Safari, use the 6-Digit Pairing Code system below to pair two separate iPhones or an iPhone and Android device instantly.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {sortedNativePeers.map((peer) => (
              <div
                key={peer.id}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-[#040C1C] border border-slate-200 dark:border-cyan-400/20 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="truncate">{peer.name}</span>
                  </p>
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    {peer.transport === 'native_wifi_direct'
                      ? 'Apple MultipeerConnectivity (iPhone P2P)'
                      : 'CoreBluetooth BLE'}
                    {peer.deviceCode ? ` · ${peer.deviceCode}` : ''}
                    {peer.rssi !== undefined ? ` · ${peer.rssi} dBm` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onConnectNativePeer(peer)}
                  className="px-4 h-9 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold shrink-0 cursor-pointer"
                >
                  {peer.connected ? 'Connected' : 'Request Connect'}
                </button>
              </div>
            ))}

            {localNearbyPeers.map((peer) => {
              const existingContact = contacts.find((c) => c.deviceId === peer.deviceId);
              const status = existingContact ? liveConnections[existingContact.id]?.status : undefined;
              return (
                <div
                  key={peer.sessionId}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-[#040C1C] border border-slate-200 dark:border-cyan-400/20 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {peer.name}
                    </p>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {peer.deviceId} · Local Browser Peer
                    </p>
                  </div>
                  {status === 'connected' && existingContact ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenChat(existingContact.id)}
                        className="px-3.5 h-9 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                      >
                        Open Chat
                      </button>
                      <button
                        type="button"
                        onClick={() => onDisconnectContact(existingContact.id)}
                        className="px-3 h-9 rounded-xl border border-red-400/40 text-red-500 text-xs font-semibold cursor-pointer"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={status === 'connecting'}
                      onClick={() => void onConnectLocalPeer(peer)}
                      className="px-4 h-9 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                    >
                      {status === 'connecting' ? 'Waiting for Approval...' : 'Send Request'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CROSS-PLATFORM 6-DIGIT PAIRING CODE CTA (WORKS IN iOS SAFARI, ANDROID CHROME & DESKTOP) */}
      <div className="rounded-3xl bg-white dark:bg-[#07152C]/85 border border-cyan-400/35 p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1.5 max-w-2xl">
          <p className="text-xs font-mono text-blue-600 dark:text-cyan-300 font-semibold">
            WORKS IN iPHONE SAFARI · ANDROID CHROME · DESKTOP
          </p>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
            Connect iPhone with a 6-Digit Pairing Code
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Pick an available 6-digit code from the backend database, share it via WhatsApp or copy
            it, and approve the incoming connection request to open an isolated 2-party private
            room across iPhone ↔ iPhone or iPhone ↔ Android.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenPairingPage}
          className="px-5 h-11 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] hover:brightness-110 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(37,99,235,0.4)] whitespace-nowrap shrink-0 cursor-pointer"
        >
          Open Pairing Codes
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
