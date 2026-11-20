import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BluetoothRuntimeStatus,
  ContactDirectMessage,
  ContactLiveConnection,
  ContactRecord,
  DiscoveredBtDevice,
  DiscoveredCodeHost,
  IncomingConnectionRequest,
  LiveConnectionState,
  LocalVoiceClip,
  PendingCodeApproval,
  PinSecuritySummary,
  PrivateChatAssignment,
  PrivateChatFolder,
  StagedOfflineFile,
  TemporaryCodeSession,
  UserProfileRecord,
  WebGroupMessage,
  WebGroupRoom,
  WebSosRecord,
  WireMessagePacket,
} from '../types/contacts';
import { ChatWallpaper, TextSizeOption, ThemeMode } from '../types/freeconnect';
import { LanguageCode } from '../i18n/translations';
import {
  clearAllDirectMessages,
  clearMessagesForContact,
  getActiveStorageEngine,
  loadAllContacts,
  loadAllDirectMessages,
  removeContact,
  saveDirectMessage,
  upsertContact,
} from '../storage/contactsDb';
import {
  clearPinSecurityRecord,
  loadPinSecurityRecord,
  loadPrivateAssignments,
  loadPrivateFolders,
  savePinSecurityRecord,
  savePrivateAssignments,
  savePrivateFolders,
  scrubLegacyPlaintextPinsFromLocalStorage,
} from '../storage/privateChatsDb';
import {
  createPinSecurityRecord,
  StoredPinSecurityRecord,
  updatePinInRecord,
  verifyPinAgainstRecord,
  verifyRecoveryKeyAgainstRecord,
  verifySecurityAnswerAgainstRecord,
} from '../crypto/pinSecurity';
import {
  computeCodeJoinProof,
  createTemporaryCodeSession,
  isValidSixDigitCode,
  normalizeSixDigitCode,
  verifyCodeAgainstCommitment,
  verifyCodeJoinProof,
} from '../crypto/codePairing';
import {
  attemptBluetoothReconnect,
  canReconnectBluetooth,
  detectBrowserCapabilities,
  disconnectRealBluetoothDevice,
  isBluetoothWritable,
  queryWebBluetoothAvailability,
  requestRealBluetoothConnection,
  sendBluetoothPacket,
  subscribeWebBluetoothAvailability,
} from '../utils/webBluetoothContact';
import {
  cancelNativeCodeHost,
  connectNativePeer,
  disconnectNativePeer,
  isNativePeerConnected,
  NativeDiscoveredPeer,
  requestNativeBluetoothPermission,
  respondNativeConnectionRequest,
  sendNativeCodeJoinRequest,
  sendNativePacket,
  setNativeBluetoothEnabled,
  startNativeCodeHost,
  startNativeDiscovery,
  stopNativeDiscovery,
  subscribeNativeBridgeEvents,
  syncNativeLocalIdentity,
} from '../utils/nativeOfflineBridge';
import {
  acceptOfflineP2pOffer,
  completeOfflineP2pAnswer,
  createOfflineP2pOffer,
  disconnectOfflineP2p,
  isOfflineP2pOpen,
  LocalBrowserPeerBus,
  LocalPeerPresence,
  sendOfflineP2pPacket,
} from '../utils/offlineP2pTransport';
import { generateFreeConnectDeviceId } from '../utils/contactQrCodec';
import {
  computeSafetyNumber,
  decryptMessageFromPeer,
  encryptMessageForPeer,
  generateNodeIdentity,
  importPeerPublicKey,
  NodeCryptoIdentity,
} from '../crypto/webCryptoEngine';
import { ContactFormSubmission } from '../components/AddEditContactModal';

const LS_PROFILE_KEY = 'fc_web_profile_v2';
const LS_PREFS_KEY = 'fc_web_prefs_v2';
const LS_GROUPS_KEY = 'fc_web_groups_v2';
const LS_GROUP_MSGS_KEY = 'fc_web_group_msgs_v2';
const LS_FILES_KEY = 'fc_web_files_v2';
const LS_VOICE_KEY = 'fc_web_voice_v2';
const LS_SOS_KEY = 'fc_web_sos_v2';

export interface WebsitePreferences {
  themeMode: ThemeMode;
  language: LanguageCode;
  wallpaper: ChatWallpaper;
  textSize: TextSizeOption;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
}

const DEFAULT_PREFS: WebsitePreferences = {
  themeMode: 'dark',
  language: 'en',
  wallpaper: 'futuristic',
  textSize: 'md',
  soundEnabled: true,
  notificationsEnabled: true,
};

function makeUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `fc-${Date.now()}-${Math.random().toString(16).slice(2, 9)}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function playSubtleIncomingTone() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.17);
  } catch {
    // Ignore autoplay policy
  }
}

export function useFreeConnectWebsite() {
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [messages, setMessages] = useState<ContactDirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageEngine, setStorageEngine] = useState<'IndexedDB' | 'localStorage'>('IndexedDB');

  // Ephemeral real connection state (never faked across reloads)
  const [liveConnections, setLiveConnections] = useState<Record<string, ContactLiveConnection>>({});
  const [discoveredBtDevices, setDiscoveredBtDevices] = useState<DiscoveredBtDevice[]>([]);
  const [nativeNearbyPeers, setNativeNearbyPeers] = useState<NativeDiscoveredPeer[]>([]);
  const [localNearbyPeers, setLocalNearbyPeers] = useState<LocalPeerPresence[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<IncomingConnectionRequest[]>([]);
  const [btScanState, setBtScanState] = useState<LiveConnectionState>('disconnected');
  const [btScanFeedback, setBtScanFeedback] = useState<string | null>(null);
  const [incomingToast, setIncomingToast] = useState<{
    id: string;
    title: string;
    preview: string;
    isPrivate: boolean;
    contactId: string;
  } | null>(null);

  // Fires whenever a real Nearby Devices / Connect with Code link opens so UI can auto-open private chat
  const [lastConnectedEvent, setLastConnectedEvent] = useState<{
    contactId: string;
    peerName: string;
    timestamp: number;
  } | null>(null);

  // Connect with Code (Temporary 6-Digit Cryptographic Pairing State)
  const [activeCodeSession, setActiveCodeSession] = useState<TemporaryCodeSession | null>(null);
  const [discoveredCodeHosts, setDiscoveredCodeHosts] = useState<DiscoveredCodeHost[]>([]);
  const [pendingCodeApproval, setPendingCodeApproval] = useState<PendingCodeApproval | null>(null);
  const [codePairingState, setCodePairingState] = useState<
    | 'idle'
    | 'hosting'
    | 'validating'
    | 'awaiting_local_approval'
    | 'awaiting_host_approval'
    | 'connected'
    | 'rejected'
    | 'expired'
    | 'failed'
  >('idle');
  const [codePairingMessage, setCodePairingMessage] = useState<string | null>(null);

  // Private Chat Folders & PBKDF2-SHA256 PIN Security (stored strictly in IndexedDB, never localStorage)
  const [pinRecord, setPinRecord] = useState<StoredPinSecurityRecord | null>(null);
  const [privateFolders, setPrivateFolders] = useState<PrivateChatFolder[]>([]);
  const [privateAssignments, setPrivateAssignments] = useState<
    Record<string, PrivateChatAssignment>
  >({});

  // Persistent local profile
  const [profile, setProfile] = useState<UserProfileRecord>(() => {
    const stored = readJson<Partial<UserProfileRecord>>(LS_PROFILE_KEY, {});
    const base: UserProfileRecord = {
      name: stored.name || 'My Device',
      username: stored.username || '@my_device',
      deviceId: stored.deviceId || generateFreeConnectDeviceId(),
      avatarDataUrl: stored.avatarDataUrl || '',
      bio: stored.bio ?? '',
      statusNote:
        stored.statusNote ?? 'Available for human-to-human offline Bluetooth & P2P pairing',
      fingerprint: stored.fingerprint || 'Initializing ECDH P-256...',
    };
    if (base.name === 'Alex Morgan' && base.username === '@alex_offline') {
      return {
        ...base,
        name: 'My Device',
        username: '@my_device',
      };
    }
    return base;
  });

  // Persistent website preferences (scrub any legacy plain-text PIN fields from localStorage immediately)
  const [prefs, setPrefs] = useState<WebsitePreferences>(() => {
    scrubLegacyPlaintextPinsFromLocalStorage(LS_PREFS_KEY);
    const loaded = readJson<Partial<WebsitePreferences>>(LS_PREFS_KEY, DEFAULT_PREFS);
    return {
      themeMode: loaded.themeMode ?? DEFAULT_PREFS.themeMode,
      language: loaded.language ?? DEFAULT_PREFS.language,
      wallpaper: loaded.wallpaper ?? DEFAULT_PREFS.wallpaper,
      textSize: loaded.textSize ?? DEFAULT_PREFS.textSize,
      soundEnabled: loaded.soundEnabled ?? DEFAULT_PREFS.soundEnabled,
      notificationsEnabled: loaded.notificationsEnabled ?? DEFAULT_PREFS.notificationsEnabled,
    };
  });

  // Persistent offline group rooms & messages (human-created only)
  const [groupRooms, setGroupRooms] = useState<WebGroupRoom[]>(() =>
    readJson<WebGroupRoom[]>(LS_GROUPS_KEY, []).filter((r) => r.id !== 'room-field-ops')
  );

  const [groupMessages, setGroupMessages] = useState<WebGroupMessage[]>(() =>
    readJson<WebGroupMessage[]>(LS_GROUP_MSGS_KEY, []).filter(
      (m) => m.id !== 'gmsg-welcome' && m.roomId !== 'room-field-ops'
    )
  );

  // Voice clips & staged offline files (user-added only)
  const [voiceClips, setVoiceClips] = useState<LocalVoiceClip[]>(() =>
    readJson<LocalVoiceClip[]>(LS_VOICE_KEY, [])
  );
  const [stagedFiles, setStagedFiles] = useState<StagedOfflineFile[]>(() =>
    readJson<StagedOfflineFile[]>(LS_FILES_KEY, []).filter(
      (f) => f.id !== 'file-guide-pdf' && f.id !== 'file-map-png'
    )
  );

  const [sosRecords, setSosRecords] = useState<WebSosRecord[]>(() =>
    readJson<WebSosRecord[]>(LS_SOS_KEY, [])
  );

  const capabilities = useMemo(() => detectBrowserCapabilities(), []);

  // Real Bluetooth radio & permission status (never faked — derived strictly from native bridge or Web Bluetooth API)
  const [bluetoothRuntime, setBluetoothRuntime] = useState<BluetoothRuntimeStatus>(() => {
    const caps = detectBrowserCapabilities();
    if (caps.nativeBridgePlatform === 'ios_native') {
      return {
        enabled: false,
        hardwareAvailable: null,
        permissionState: 'prompt',
        visibilityState: 'hidden',
        platformSupportLevel: 'native_ios',
        statusMessage: 'Bluetooth is OFF. Turn ON to activate native CoreBluetooth & Multipeer.',
        permissionExplanation:
          'iOS requires Bluetooth permission (NSBluetoothAlwaysUsageDescription) and Local Network permission for CoreBluetooth and Apple MultipeerConnectivity.',
        lastCheckedAt: Date.now(),
      };
    }
    if (caps.nativeBridgePlatform === 'android_native') {
      return {
        enabled: false,
        hardwareAvailable: null,
        permissionState: 'prompt',
        visibilityState: 'hidden',
        platformSupportLevel: 'native_android',
        statusMessage: 'Bluetooth is OFF. Turn ON to activate native Android BLE GATT.',
        permissionExplanation:
          'Android 12+ requires BLUETOOTH_SCAN, BLUETOOTH_CONNECT, and BLUETOOTH_ADVERTISE permissions for direct device-to-device discovery and pairing.',
        lastCheckedAt: Date.now(),
      };
    }
    if (caps.isIos) {
      return {
        enabled: false,
        hardwareAvailable: false,
        permissionState: 'unsupported',
        visibilityState: 'unsupported',
        platformSupportLevel: 'unsupported',
        statusMessage: 'Unavailable in iOS Safari — native iOS app (ios-freeconnect/) required.',
        permissionExplanation:
          'Apple iOS Safari does not implement the Web Bluetooth API. Native CoreBluetooth & MultipeerConnectivity in ios-freeconnect/ are required on iPhone.',
        lastCheckedAt: Date.now(),
      };
    }
    if (!caps.webBluetoothSupported) {
      return {
        enabled: false,
        hardwareAvailable: false,
        permissionState: 'unsupported',
        visibilityState: 'unsupported',
        platformSupportLevel: 'unsupported',
        statusMessage: 'Web Bluetooth API is not supported in this browser.',
        permissionExplanation:
          'Use Chrome, Edge, or Opera over HTTPS for Web Bluetooth Central access, or install the native Android/iOS FreeConnect build.',
        lastCheckedAt: Date.now(),
      };
    }
    return {
      enabled: false,
      hardwareAvailable: null,
      permissionState: 'prompt',
      visibilityState: 'hidden',
      platformSupportLevel: 'web_bluetooth',
      statusMessage: 'Bluetooth is OFF. Tap Turn Bluetooth ON to check adapter availability and enable scanning.',
      permissionExplanation:
        'Web Bluetooth requires an HTTPS context and explicit user permission for each Bluetooth GATT device selected in the browser picker. Browsers operate in Central mode only (cannot advertise as a BLE peripheral).',
      lastCheckedAt: Date.now(),
    };
  });

  // Refs for fresh state inside transport event listeners
  const contactsRef = useRef<ContactRecord[]>(contacts);
  const messagesRef = useRef<ContactDirectMessage[]>(messages);
  const liveConnectionsRef = useRef<Record<string, ContactLiveConnection>>(liveConnections);
  const profileRef = useRef<UserProfileRecord>(profile);
  const prefsRef = useRef<WebsitePreferences>(prefs);
  const localBusRef = useRef<LocalBrowserPeerBus | null>(null);
  const manualDisconnectIdsRef = useRef<Set<string>>(new Set());
  const reconnectTimersRef = useRef<Map<string, number>>(new Map());
  const nativePeerIdByContactRef = useRef<Map<string, string>>(new Map());
  const contactIdByNativePeerRef = useRef<Map<string, string>>(new Map());
  const localCryptoIdentityRef = useRef<NodeCryptoIdentity | null>(null);
  const peerCryptoKeysRef = useRef<
    Map<string, { publicKey: CryptoKey; publicKeyBase64: string; safetyNumber: string }>
  >(new Map());
  const sentHelloContactIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    liveConnectionsRef.current = liveConnections;
  }, [liveConnections]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  const privateFoldersRef = useRef<PrivateChatFolder[]>(privateFolders);
  const privateAssignmentsRef = useRef<Record<string, PrivateChatAssignment>>(privateAssignments);
  const activeCodeSessionRef = useRef<TemporaryCodeSession | null>(activeCodeSession);
  const discoveredCodeHostsRef = useRef<DiscoveredCodeHost[]>(discoveredCodeHosts);

  useEffect(() => {
    privateFoldersRef.current = privateFolders;
  }, [privateFolders]);

  useEffect(() => {
    privateAssignmentsRef.current = privateAssignments;
  }, [privateAssignments]);

  useEffect(() => {
    activeCodeSessionRef.current = activeCodeSession;
  }, [activeCodeSession]);

  useEffect(() => {
    discoveredCodeHostsRef.current = discoveredCodeHosts;
  }, [discoveredCodeHosts]);

  // Load IndexedDB contacts, direct messages, PBKDF2 PIN record, and private folders on mount
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadAllContacts(),
      loadAllDirectMessages(),
      loadPinSecurityRecord(),
      loadPrivateFolders(),
      loadPrivateAssignments(),
    ])
      .then(([loadedContacts, loadedMessages, loadedPin, loadedFolders, loadedAssignments]) => {
        if (cancelled) return;
        setContacts(loadedContacts);
        setMessages(loadedMessages);
        setPinRecord(loadedPin);
        setPrivateFolders(loadedFolders);
        setPrivateAssignments(loadedAssignments);
        setStorageEngine(getActiveStorageEngine());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize real Web Crypto ECDH P-256 identity keypair (used for live device authentication & AES-256-GCM encryption)
  useEffect(() => {
    let cancelled = false;
    generateNodeIdentity()
      .then((ident) => {
        if (cancelled) return;
        localCryptoIdentityRef.current = ident;
        setProfile((prev) => ({
          ...prev,
          fingerprint: ident.fingerprint,
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setProfile((prev) => ({
          ...prev,
          fingerprint: prev.fingerprint.startsWith('Initializing')
            ? 'ECDH P-256 (Browser Crypto)'
            : prev.fingerprint,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Probe real Web Bluetooth hardware adapter availability on mount (never runs on iOS Safari)
  useEffect(() => {
    if (capabilities.nativeBridgePlatform !== 'none') {
      requestNativeBluetoothPermission();
      return;
    }
    let cancelled = false;
    void queryWebBluetoothAvailability().then((probe) => {
      if (cancelled) return;
      setBluetoothRuntime((prev) => ({
        ...prev,
        hardwareAvailable: probe.available,
        permissionState: !probe.supported
          ? 'unsupported'
          : probe.permissionBlocked
            ? capabilities.isEmbeddedIframe
              ? 'iframe_blocked'
              : 'denied'
            : prev.permissionState === 'granted'
              ? 'granted'
              : 'prompt',
        statusMessage: prev.enabled ? probe.reason : prev.statusMessage,
        lastCheckedAt: Date.now(),
      }));
    });
    const unsub = subscribeWebBluetoothAvailability((available) => {
      setBluetoothRuntime((prev) => ({
        ...prev,
        hardwareAvailable: available,
        enabled: available ? prev.enabled : false,
        visibilityState: available ? prev.visibilityState : 'hidden',
        statusMessage: available
          ? prev.enabled
            ? 'Bluetooth adapter available (Web Bluetooth Central ready).'
            : 'Bluetooth adapter detected. Turn ON in Bluetooth Settings to scan.'
          : 'Bluetooth adapter turned off or unavailable on this device.',
        lastCheckedAt: Date.now(),
      }));
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [capabilities.isEmbeddedIframe, capabilities.nativeBridgePlatform]);

  // Persist localStorage slices automatically
  useEffect(() => {
    try {
      window.localStorage.setItem(LS_PROFILE_KEY, JSON.stringify(profile));
    } catch {
      // Ignore quota
    }
  }, [profile]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore
    }
  }, [prefs]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_GROUPS_KEY, JSON.stringify(groupRooms));
    } catch {
      // Ignore
    }
  }, [groupRooms]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_GROUP_MSGS_KEY, JSON.stringify(groupMessages));
    } catch {
      // Ignore
    }
  }, [groupMessages]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_VOICE_KEY, JSON.stringify(voiceClips.slice(0, 15)));
    } catch {
      // Ignore quota if audio blobs are large
    }
  }, [voiceClips]);

  useEffect(() => {
    try {
      const serializable = stagedFiles.map(({ objectUrl: _u, ...rest }) => rest);
      window.localStorage.setItem(LS_FILES_KEY, JSON.stringify(serializable));
    } catch {
      // Ignore quota
    }
  }, [stagedFiles]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_SOS_KEY, JSON.stringify(sosRecords));
    } catch {
      // Ignore
    }
  }, [sosRecords]);

  const updatePrefs = useCallback((patch: Partial<WebsitePreferences>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateProfile = useCallback((patch: Partial<UserProfileRecord>) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch };
      profileRef.current = next;
      // Immediately broadcast updated profile identity to nearby local peers
      setTimeout(() => {
        localBusRef.current?.announce();
      }, 30);
      return next;
    });
  }, []);

  const rotateProfileKeys = useCallback(async () => {
    const ident = await generateNodeIdentity();
    localCryptoIdentityRef.current = ident;
    peerCryptoKeysRef.current.clear();
    sentHelloContactIdsRef.current.clear();
    setProfile((prev) => ({
      ...prev,
      deviceId: ident.nodeId,
      fingerprint: ident.fingerprint,
    }));
  }, []);

  // Contact CRUD (IndexedDB)
  const saveContactRecord = useCallback(
    async (data: ContactFormSubmission, existingId?: string): Promise<ContactRecord> => {
      const now = Date.now();
      const existing = existingId
        ? contactsRef.current.find((c) => c.id === existingId)
        : null;
      const record: ContactRecord = existing
        ? { ...existing, ...data, updatedAt: now }
        : {
            id: makeUuid(),
            ...data,
            isBlocked: false,
            isEmergencyContact: false,
            createdAt: now,
            updatedAt: now,
            lastConnectedAt: null,
            bluetoothDeviceId: null,
            bluetoothDeviceName: null,
          };

      await upsertContact(record);
      setStorageEngine(getActiveStorageEngine());
      setContacts((prev) => {
        const next = existing
          ? prev.map((c) => (c.id === record.id ? record : c))
          : [record, ...prev];
        return next.sort((a, b) => b.updatedAt - a.updatedAt);
      });
      return record;
    },
    []
  );

  // Ensure a real paired remote user has a contact record in IndexedDB
  const ensureContactForPeer = useCallback(
    async (peer: { deviceId: string; name: string; username?: string }): Promise<ContactRecord> => {
      const cleanId = peer.deviceId.trim().toUpperCase();
      const existing = contactsRef.current.find(
        (c) => c.deviceId.toUpperCase() === cleanId
      );
      if (existing) return existing;

      const cleanName = peer.name.trim() || `Peer ${cleanId}`;
      const cleanUsername = peer.username?.trim()
        ? peer.username.startsWith('@')
          ? peer.username
          : `@${peer.username}`
        : `@${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'peer'}`;

      return saveContactRecord({
        name: cleanName,
        username: cleanUsername,
        phoneNumber: '',
        deviceId: cleanId,
        avatarDataUrl: '',
        description: 'Added via direct offline pairing',
        isFavorite: false,
      });
    },
    [saveContactRecord]
  );

  const patchContact = useCallback(async (contactId: string, patch: Partial<ContactRecord>) => {
    const target = contactsRef.current.find((c) => c.id === contactId);
    if (!target) return;
    if (patch.isBlocked) {
      disconnectRealBluetoothDevice(contactId);
      disconnectOfflineP2p(contactId);
      localBusRef.current?.notifyDisconnect(target.deviceId);
      setLiveConnections((prev) => ({
        ...prev,
        [contactId]: {
          status: 'disconnected',
          transport: 'none',
          writable: false,
          availabilityText: 'Blocked locally',
        },
      }));
    }
    const updated: ContactRecord = {
      ...target,
      ...patch,
      updatedAt: Date.now(),
    };
    await upsertContact(updated);
    setContacts((prev) => prev.map((c) => (c.id === contactId ? updated : c)));
  }, []);

  // Low-level packet transmission helper over whichever real transport is open
  const transmitPacketToContact = useCallback(
    async (
      contactId: string,
      packet: WireMessagePacket
    ): Promise<{ sent: boolean; transport: 'bluetooth' | 'p2p' | 'none'; error?: string }> => {
      const live = liveConnectionsRef.current[contactId];
      if (!live || live.status !== 'connected') {
        return { sent: false, transport: 'none', error: 'Contact is currently disconnected.' };
      }

      if (live.transport === 'native_ble' || live.transport === 'native_wifi_direct') {
        const nativePeerId = live.hardwareId ?? nativePeerIdByContactRef.current.get(contactId);
        if (nativePeerId && isNativePeerConnected(nativePeerId)) {
          const res = sendNativePacket(nativePeerId, packet);
          return {
            sent: res.sent,
            transport: live.transport === 'native_ble' ? 'bluetooth' : 'p2p',
            error: res.error,
          };
        }
        return {
          sent: false,
          transport: 'none',
          error: 'Native offline peer connection is no longer active.',
        };
      }

      if (live.transport === 'web_bluetooth_gatt' && isBluetoothWritable(contactId)) {
        const res = await sendBluetoothPacket(contactId, packet);
        return { sent: res.sent, transport: 'bluetooth', error: res.error };
      }

      if (live.transport === 'offline_webrtc_p2p' && isOfflineP2pOpen(contactId)) {
        const res = sendOfflineP2pPacket(contactId, packet);
        return { sent: res.sent, transport: 'p2p', error: res.error };
      }

      if (live.transport === 'local_window_channel' && localBusRef.current) {
        const contact = contactsRef.current.find((c) => c.id === contactId);
        if (contact) {
          const ok = localBusRef.current.sendPacket(contact.deviceId, packet);
          return {
            sent: ok,
            transport: 'p2p',
            error: ok ? undefined : 'Local channel closed.',
          };
        }
      }

      return {
        sent: false,
        transport: 'none',
        error:
          live.transport === 'web_bluetooth_readonly'
            ? 'Connected Bluetooth device does not expose a writable messaging service.'
            : 'No writable offline transport is open for this contact.',
      };
    },
    []
  );

  // Send ECDH P-256 public key hello packet immediately once a real link opens to authenticate & enable AES-256-GCM
  const sendAuthHelloToContact = useCallback(
    async (contactId: string) => {
      const ident = localCryptoIdentityRef.current;
      if (!ident) return;
      sentHelloContactIdsRef.current.add(contactId);
      await transmitPacketToContact(contactId, {
        v: 1,
        type: 'hello',
        packetId: `hello-${makeUuid().slice(0, 8)}`,
        senderDeviceId: profileRef.current.deviceId,
        senderName: profileRef.current.name,
        senderUsername: profileRef.current.username,
        senderPublicKeyBase64: ident.publicKeyBase64,
        timestamp: Date.now(),
      });
    },
    [transmitPacketToContact]
  );

  // Build wire packet with AES-256-GCM encryption automatically when ECDH peer key is authenticated
  const buildOutgoingMessagePacket = useCallback(
    async (
      contactId: string,
      msg: {
        id: string;
        text: string;
        timestamp: number;
        kind?: 'text' | 'voice' | 'file' | 'sos';
        voiceDurationSec?: number;
        voiceDataUrl?: string;
        voiceMimeType?: string;
        fileName?: string;
        fileSizeKb?: number;
        fileCategory?: 'Image' | 'Document' | 'Audio' | 'Other';
        fileDataUrl?: string;
        fileMimeType?: string;
      }
    ): Promise<WireMessagePacket> => {
      const basePacket: WireMessagePacket = {
        v: 1,
        type: 'message',
        packetId: msg.id,
        senderDeviceId: profileRef.current.deviceId,
        senderName: profileRef.current.name,
        senderUsername: profileRef.current.username,
        timestamp: msg.timestamp,
        kind: msg.kind ?? 'text',
        voiceDurationSec: msg.voiceDurationSec,
        voiceDataUrl: msg.voiceDataUrl,
        voiceMimeType: msg.voiceMimeType,
        fileName: msg.fileName,
        fileSizeKb: msg.fileSizeKb,
        fileCategory: msg.fileCategory,
        fileDataUrl: msg.fileDataUrl,
        fileMimeType: msg.fileMimeType,
      };

      const peerCrypto = peerCryptoKeysRef.current.get(contactId);
      const localIdent = localCryptoIdentityRef.current;
      if (peerCrypto && localIdent) {
        try {
          const aad = `${msg.id}:${profileRef.current.deviceId}`;
          const { ciphertextBase64, ivBase64 } = await encryptMessageForPeer(
            msg.text,
            localIdent.keyPair.privateKey,
            peerCrypto.publicKey,
            aad
          );
          return {
            ...basePacket,
            encrypted: true,
            ciphertextBase64,
            ivBase64,
          };
        } catch {
          // Fall through if Web Crypto rejects key usage
        }
      }

      return {
        ...basePacket,
        text: msg.text,
      };
    },
    []
  );

  // Automatically flush QUEUED_OFFLINE & FAILED messages once a writable link opens
  const flushQueuedMessagesForContact = useCallback(
    async (contactId: string) => {
      const pending = messagesRef.current
        .filter(
          (m) =>
            m.contactId === contactId &&
            m.isOutgoing &&
            (m.deliveryState === 'QUEUED_OFFLINE' || m.deliveryState === 'FAILED')
        )
        .sort((a, b) => a.timestamp - b.timestamp);

      for (const msg of pending) {
        const pkt = await buildOutgoingMessagePacket(contactId, msg);
        const tx = await transmitPacketToContact(contactId, pkt);
        if (tx.sent) {
          const updated: ContactDirectMessage = {
            ...msg,
            deliveryState: tx.transport === 'bluetooth' ? 'SENT_OVER_BLUETOOTH' : 'SENT_OVER_P2P',
            errorText: undefined,
          };
          await saveDirectMessage(updated);
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        }
      }
    },
    [buildOutgoingMessagePacket, transmitPacketToContact]
  );

  // Unified real incoming wire packet handler (works for Native BLE/Multipeer/Wi-Fi Direct, BLE GATT, Offline WebRTC, and Local Bus)
  const handleIncomingWirePacket = useCallback(
    async (contactId: string, packet: WireMessagePacket) => {
      // ECDH P-256 device authentication handshake
      if (packet.type === 'hello') {
        if (packet.senderPublicKeyBase64 && localCryptoIdentityRef.current) {
          try {
            const peerPublicKey = await importPeerPublicKey(packet.senderPublicKeyBase64);
            const safetyNumber = await computeSafetyNumber(
              localCryptoIdentityRef.current.publicKeyBase64,
              packet.senderPublicKeyBase64
            );
            peerCryptoKeysRef.current.set(contactId, {
              publicKey: peerPublicKey,
              publicKeyBase64: packet.senderPublicKeyBase64,
              safetyNumber,
            });
            setLiveConnections((prev) => {
              const cur = prev[contactId];
              if (!cur) return prev;
              return {
                ...prev,
                [contactId]: {
                  ...cur,
                  authenticated: true,
                  encrypted: true,
                  safetyNumber,
                },
              };
            });
            if (!sentHelloContactIdsRef.current.has(contactId)) {
              void sendAuthHelloToContact(contactId);
            }
          } catch {
            // Invalid peer key payload ignored safely
          }
        }
        return;
      }

      if (packet.type === 'ack' && packet.ackMessageId) {
        const existingMsg = messagesRef.current.find((m) => m.id === packet.ackMessageId);
        if (existingMsg && existingMsg.deliveryState !== 'DELIVERED') {
          const acked: ContactDirectMessage = {
            ...existingMsg,
            deliveryState: 'DELIVERED',
            errorText: undefined,
          };
          await saveDirectMessage(acked);
          setMessages((prev) => prev.map((m) => (m.id === acked.id ? acked : m)));
        }
        return;
      }

      if (packet.type !== 'message') return;

      // Security: only accept messages from actively connected & authorized peers
      const activeLink = liveConnectionsRef.current[contactId];
      if (!activeLink || activeLink.status !== 'connected') {
        return;
      }

      // Deduplicate by packetId
      if (messagesRef.current.some((m) => m.id === packet.packetId)) {
        return;
      }

      let resolvedText =
        packet.text ?? (packet.kind === 'voice' ? 'Voice message' : packet.fileName ?? '');

      if (packet.encrypted && packet.ciphertextBase64 && packet.ivBase64) {
        const peerCrypto = peerCryptoKeysRef.current.get(contactId);
        const localIdent = localCryptoIdentityRef.current;
        if (peerCrypto && localIdent) {
          try {
            const aad = `${packet.packetId}:${packet.senderDeviceId}`;
            resolvedText = await decryptMessageFromPeer(
              packet.ciphertextBase64,
              packet.ivBase64,
              localIdent.keyPair.privateKey,
              peerCrypto.publicKey,
              aad
            );
          } catch {
            resolvedText = '[Encrypted message could not be verified with current session key]';
          }
        } else {
          resolvedText = '[Encrypted message — awaiting device authentication key exchange]';
        }
      }

      const incomingMsg: ContactDirectMessage = {
        id: packet.packetId || makeUuid(),
        contactId,
        text: resolvedText,
        timestamp: packet.timestamp || Date.now(),
        isOutgoing: false,
        senderName: packet.senderName,
        deliveryState: 'DELIVERED',
        kind: packet.kind ?? 'text',
        reactions: [],
        voiceDurationSec: packet.voiceDurationSec,
        voiceDataUrl: packet.voiceDataUrl,
        voiceMimeType: packet.voiceMimeType,
        fileName: packet.fileName,
        fileSizeKb: packet.fileSizeKb,
        fileCategory: packet.fileCategory,
        fileDataUrl: packet.fileDataUrl,
        fileMimeType: packet.fileMimeType,
      };

      await saveDirectMessage(incomingMsg);
      setMessages((prev) => [...prev, incomingMsg]);

      // Respect notification privacy: NEVER expose private/locked chat message previews
      if (prefsRef.current.notificationsEnabled) {
        const assignment = privateAssignmentsRef.current[contactId];
        const folderLocked = assignment?.folderId
          ? Boolean(
              privateFoldersRef.current.find((f) => f.id === assignment.folderId)?.isLocked
            )
          : false;
        const isPrivate = Boolean(assignment?.isLocked || folderLocked);
        const sender = contactsRef.current.find((c) => c.id === contactId);
        setIncomingToast({
          id: incomingMsg.id,
          title: isPrivate ? 'Private Chat' : sender?.name ?? incomingMsg.senderName ?? 'New Message',
          preview: isPrivate
            ? 'New private message (content hidden)'
            : incomingMsg.text.slice(0, 80),
          isPrivate,
          contactId,
        });
      }

      if (prefsRef.current.soundEnabled) {
        playSubtleIncomingTone();
      }

      // Send real delivery ACK back to sender
      void transmitPacketToContact(contactId, {
        v: 1,
        type: 'ack',
        packetId: `ack-${incomingMsg.id}`,
        ackMessageId: incomingMsg.id,
        senderDeviceId: profileRef.current.deviceId,
        senderName: profileRef.current.name,
        timestamp: Date.now(),
      });
    },
    [sendAuthHelloToContact, transmitPacketToContact]
  );

  // Initialize same-device LocalBrowserPeerBus for real zero-server local peer discovery
  useEffect(() => {
    const bus = new LocalBrowserPeerBus(
      () => ({
        deviceId: profileRef.current.deviceId,
        name: profileRef.current.name,
        username: profileRef.current.username,
      }),
      {
        onPeerSeen: (peer) => {
          setLocalNearbyPeers((prev) => {
            const exists = prev.some((p) => p.deviceId === peer.deviceId);
            return exists
              ? prev.map((p) => (p.deviceId === peer.deviceId ? peer : p))
              : [peer, ...prev];
          });
        },
        onPeerLeft: (deviceId) => {
          setLocalNearbyPeers((prev) => prev.filter((p) => p.deviceId !== deviceId));
          const c = contactsRef.current.find((x) => x.deviceId === deviceId);
          if (c && liveConnectionsRef.current[c.id]?.transport === 'local_window_channel') {
            setLiveConnections((prev) => ({
              ...prev,
              [c.id]: {
                status: 'disconnected',
                transport: 'none',
                writable: false,
                availabilityText: 'Disconnected · Peer window closed',
              },
            }));
          }
        },
        onConnectRequest: (peer) => {
          // Surface genuine connection request for User 2 to Accept or Reject
          const reqId = `local:${peer.deviceId}`;
          setIncomingRequests((prev) => {
            const nextReq: IncomingConnectionRequest = {
              id: reqId,
              peerId: peer.deviceId,
              peerName: peer.name,
              peerUsername: peer.username,
              deviceCode: peer.deviceId,
              platform: peer.platform ?? 'browser',
              transport: 'local_window_channel',
              receivedAt: Date.now(),
            };
            const exists = prev.some((r) => r.id === reqId);
            return exists ? prev.map((r) => (r.id === reqId ? nextReq : r)) : [nextReq, ...prev];
          });
          setBtScanFeedback(`Connection request received from ${peer.name}. Accept or Reject.`);
          if (prefsRef.current.soundEnabled) {
            playSubtleIncomingTone();
          }
        },
        onConnectAccepted: (peer) => {
          void (async () => {
            const contact = await ensureContactForPeer(peer);
            await patchContact(contact.id, { lastConnectedAt: Date.now() });
            setLiveConnections((prev) => ({
              ...prev,
              [contact.id]: {
                status: 'connected',
                transport: 'local_window_channel',
                writable: true,
                connectedAt: Date.now(),
                availabilityText: `Connected to ${peer.name} (Local Offline Link)`,
                connectedDeviceName: peer.name,
              },
            }));
            setPendingCodeApproval(null);
            setCodePairingState('connected');
            setCodePairingMessage(`Connected directly to ${peer.name}. Opening chat...`);
            setLastConnectedEvent({
              contactId: contact.id,
              peerName: peer.name,
              timestamp: Date.now(),
            });
            setTimeout(() => {
              void sendAuthHelloToContact(contact.id);
              void flushQueuedMessagesForContact(contact.id);
            }, 120);
          })();
        },
        onConnectRejected: (deviceId, peerName, reason) => {
          const c = contactsRef.current.find((x) => x.deviceId === deviceId);
          const msg = reason || `Connection Rejected by ${peerName || 'remote device'}.`;
          setBtScanFeedback(msg);
          setCodePairingState((cur) => (cur === 'awaiting_host_approval' ? 'rejected' : cur));
          setCodePairingMessage(msg);
          if (!c) return;
          setLiveConnections((prev) => ({
            ...prev,
            [c.id]: {
              status: 'failed',
              transport: 'none',
              writable: false,
              availabilityText: 'Connection Rejected',
              detailMessage: msg,
            },
          }));
        },
        onCodeHostSeen: (beacon) => {
          setDiscoveredCodeHosts((prev) => {
            const nextHost: DiscoveredCodeHost = {
              hostDeviceId: beacon.hostDeviceId,
              hostName: beacon.hostName,
              hostUsername: beacon.hostUsername,
              hostPlatform: beacon.hostPlatform,
              nonce: beacon.nonce,
              commitment: beacon.commitment,
              expiresAt: beacon.expiresAt,
              transport: 'local_window_channel',
              lastSeenAt: Date.now(),
            };
            const exists = prev.some((h) => h.hostDeviceId === beacon.hostDeviceId);
            return exists
              ? prev.map((h) => (h.hostDeviceId === beacon.hostDeviceId ? nextHost : h))
              : [nextHost, ...prev];
          });
        },
        onCodeHostCancelled: (hostDeviceId) => {
          setDiscoveredCodeHosts((prev) => prev.filter((h) => h.hostDeviceId !== hostDeviceId));
        },
        onCodeJoinRequest: (req) => {
          void (async () => {
            const session = activeCodeSessionRef.current;
            if (!session) {
              localBusRef.current?.rejectCodeJoin(
                req.fromDeviceId,
                'This device is no longer hosting a connection code.'
              );
              return;
            }
            if (session.expiresAt <= Date.now()) {
              setActiveCodeSession(null);
              localBusRef.current?.cancelCodeHost();
              setCodePairingState('expired');
              setCodePairingMessage('Temporary 6-digit connection code expired.');
              localBusRef.current?.rejectCodeJoin(
                req.fromDeviceId,
                'Connection code has expired. Ask the host to generate a new code.'
              );
              return;
            }
            if (req.nonce !== session.nonce) {
              localBusRef.current?.rejectCodeJoin(
                req.fromDeviceId,
                'Code session mismatch. Generate a fresh 6-digit code and retry.'
              );
              return;
            }

            const validProof = await verifyCodeJoinProof(
              session.code,
              session.nonce,
              profileRef.current.deviceId,
              req.fromDeviceId,
              req.proof
            );

            if (!validProof) {
              const nextFails = session.failedAttempts + 1;
              if (nextFails >= session.maxAttempts) {
                setActiveCodeSession(null);
                localBusRef.current?.cancelCodeHost();
                setCodePairingState('failed');
                setCodePairingMessage(
                  'Code invalidated after too many failed validation attempts. Generate a new code.'
                );
              } else {
                setActiveCodeSession({ ...session, failedAttempts: nextFails });
              }
              localBusRef.current?.rejectCodeJoin(
                req.fromDeviceId,
                'Invalid 6-digit connection code.'
              );
              return;
            }

            // Valid cryptographic proof! Present explicit approval request to Host (Approval #2)
            const reqId = `code:${req.fromDeviceId}`;
            setIncomingRequests((prev) => {
              const nextReq: IncomingConnectionRequest = {
                id: reqId,
                peerId: req.fromDeviceId,
                peerName: req.fromName,
                peerUsername: req.fromUsername,
                deviceCode: req.fromDeviceId,
                platform: req.fromPlatform,
                transport: 'local_window_channel',
                receivedAt: Date.now(),
                codeVerified: true,
              };
              const exists = prev.some((r) => r.id === reqId);
              return exists ? prev.map((r) => (r.id === reqId ? nextReq : r)) : [nextReq, ...prev];
            });
            setCodePairingMessage(
              `${req.fromName} verified your 6-digit code. Tap Accept to establish the local connection.`
            );
            if (prefsRef.current.soundEnabled) {
              playSubtleIncomingTone();
            }
          })();
        },
        onCodeJoinRejected: (_hostDeviceId, hostName, reason) => {
          setPendingCodeApproval(null);
          setCodePairingState('rejected');
          setCodePairingMessage(reason || `${hostName} rejected the code connection request.`);
        },
        onPeerDisconnected: (deviceId) => {
          const c = contactsRef.current.find((x) => x.deviceId === deviceId);
          if (!c) return;
          setLiveConnections((prev) => ({
            ...prev,
            [c.id]: {
              status: 'disconnected',
              transport: 'none',
              writable: false,
              availabilityText: 'Disconnected by peer',
            },
          }));
        },
        onPacket: (fromDeviceId, packet) => {
          void (async () => {
            const existing = contactsRef.current.find((c) => c.deviceId === fromDeviceId);
            const contact =
              existing ??
              (await ensureContactForPeer({
                deviceId: fromDeviceId,
                name: packet.senderName,
                username: packet.senderUsername,
              }));
            await handleIncomingWirePacket(contact.id, packet);
          })();
        },
      }
    );

    localBusRef.current = bus;

    // Expire stale local peers (12s) and expired 6-digit code hosts/sessions automatically
    const pruneTimer = window.setInterval(() => {
      const now = Date.now();
      const cutoff = now - 12_000;
      setLocalNearbyPeers((prev) => prev.filter((p) => p.lastSeenAt > cutoff));
      setDiscoveredCodeHosts((prev) =>
        prev.filter((h) => h.expiresAt > now && h.lastSeenAt > cutoff)
      );
      if (activeCodeSessionRef.current && activeCodeSessionRef.current.expiresAt <= now) {
        setActiveCodeSession(null);
        localBusRef.current?.cancelCodeHost();
        cancelNativeCodeHost();
        setCodePairingState('expired');
        setCodePairingMessage('Temporary 6-digit connection code expired automatically.');
      }
    }, 2000);

    return () => {
      window.clearInterval(pruneTimer);
      bus.close();
      localBusRef.current = null;
    };
  }, [ensureContactForPeer, flushQueuedMessagesForContact, handleIncomingWirePacket, patchContact]);

  // Real Native iOS / Android Bridge integration (CoreBluetooth, Multipeer, Android BLE + Wi-Fi Direct)
  useEffect(() => {
    if (capabilities.nativeBridgePlatform === 'none') return;
    syncNativeLocalIdentity({
      deviceId: profile.deviceId,
      name: profile.name,
      username: profile.username,
    });
  }, [capabilities.nativeBridgePlatform, profile.deviceId, profile.name, profile.username]);

  const clearScheduledReconnect = useCallback((contactId: string) => {
    const t = reconnectTimersRef.current.get(contactId);
    if (t !== undefined) {
      window.clearTimeout(t);
      reconnectTimersRef.current.delete(contactId);
    }
  }, []);

  // Genuine automatic reconnection loop for unexpected Web Bluetooth GATT drops (up to 3 backoff attempts)
  const scheduleBluetoothAutoReconnect = useCallback(
    (contactId: string, attempt = 1) => {
      if (manualDisconnectIdsRef.current.has(contactId)) return;
      if (!canReconnectBluetooth(contactId) || attempt > 3) {
        setLiveConnections((prev) => ({
          ...prev,
          [contactId]: {
            status: 'disconnected',
            transport: 'none',
            writable: false,
            isAutoReconnecting: false,
            availabilityText: 'Disconnected · Auto-reconnect exhausted',
            detailMessage: 'Device out of range or powered off. Reconnect manually when nearby.',
          },
        }));
        return;
      }

      const delayMs = attempt === 1 ? 2000 : attempt === 2 ? 4500 : 8000;
      setLiveConnections((prev) => ({
        ...prev,
        [contactId]: {
          status: 'connecting',
          transport: 'none',
          writable: false,
          isAutoReconnecting: true,
          reconnectAttempt: attempt,
          availabilityText: `Reconnecting Bluetooth (attempt ${attempt}/3)...`,
          detailMessage: 'Connection interrupted. Automatically attempting to restore BLE GATT link.',
        },
      }));

      clearScheduledReconnect(contactId);
      const timer = window.setTimeout(() => {
        reconnectTimersRef.current.delete(contactId);
        if (manualDisconnectIdsRef.current.has(contactId)) return;

        void attemptBluetoothReconnect(contactId, {
          onIncomingPacket: (cid, pkt) => {
            void handleIncomingWirePacket(cid, pkt);
          },
          onHardwareDisconnected: () => {
            scheduleBluetoothAutoReconnect(contactId, 1);
          },
        }).then((res) => {
          if (manualDisconnectIdsRef.current.has(contactId)) return;
          if (res && res.connected) {
            void patchContact(contactId, { lastConnectedAt: Date.now() });
            setLiveConnections((prev) => ({
              ...prev,
              [contactId]: {
                status: 'connected',
                transport: res.transport,
                writable: res.writable,
                isAutoReconnecting: false,
                availabilityText: res.writable
                  ? `Connected via Bluetooth (${res.serviceLabel})`
                  : 'Connected via BLE GATT (Read-Only)',
                detailMessage: res.message,
                connectedDeviceName: res.deviceName,
                hardwareId: res.deviceId,
              },
            }));
            if (res.writable) {
              setTimeout(() => void flushQueuedMessagesForContact(contactId), 150);
            }
          } else {
            scheduleBluetoothAutoReconnect(contactId, attempt + 1);
          }
        });
      }, delayMs);

      reconnectTimersRef.current.set(contactId, timer);
    },
    [
      clearScheduledReconnect,
      flushQueuedMessagesForContact,
      handleIncomingWirePacket,
      patchContact,
    ]
  );

  useEffect(() => {
    if (capabilities.nativeBridgePlatform === 'none') return;

    const unsubscribe = subscribeNativeBridgeEvents((event) => {
      if (event.type === 'peer_discovered') {
        const peer = event.peer;
        // Never show the user's own device in the nearby available list
        if (
          peer.deviceCode &&
          peer.deviceCode.toUpperCase() === profileRef.current.deviceId.toUpperCase()
        ) {
          return;
        }
        setNativeNearbyPeers((prev) => {
          const exists = prev.some((p) => p.id === peer.id);
          return exists ? prev.map((p) => (p.id === peer.id ? peer : p)) : [peer, ...prev];
        });
        setDiscoveredBtDevices((prev) => {
          const entry: DiscoveredBtDevice = {
            id: peer.id,
            name: peer.name,
            connected: peer.connected,
            writable: true,
            serviceLabel:
              peer.transport === 'native_ble'
                ? 'Native BLE GATT'
                : 'Native Wi-Fi Direct / Multipeer',
            discoveredAt: Date.now(),
            note: `Discovered via ${
              peer.transport === 'native_ble' ? 'Native Bluetooth LE' : 'Native P2P Wi-Fi'
            }${peer.rssi !== undefined ? ` (${peer.rssi} dBm)` : ''}`,
            source: peer.transport,
            deviceCode: peer.deviceCode,
            rssi: peer.rssi,
            peerPlatform: peer.platform,
          };
          const exists = prev.some((d) => d.id === entry.id);
          return exists ? prev.map((d) => (d.id === entry.id ? entry : d)) : [entry, ...prev];
        });
      } else if (event.type === 'peer_lost') {
        setNativeNearbyPeers((prev) => prev.filter((p) => p.id !== event.peerId));
        setDiscoveredBtDevices((prev) => prev.filter((d) => d.id !== event.peerId));
      } else if (event.type === 'bluetooth_state') {
        setBluetoothRuntime((prev) => ({
          ...prev,
          enabled: event.enabled,
          hardwareAvailable: event.hardwarePoweredOn,
          permissionState: event.permissionState,
          visibilityState: event.enabled
            ? event.discoverable
              ? 'discoverable'
              : 'central_only'
            : 'hidden',
          statusMessage:
            event.message ??
            (event.enabled
              ? 'Native Bluetooth active and ready.'
              : 'Bluetooth is currently disabled.'),
          lastCheckedAt: Date.now(),
        }));
      } else if (event.type === 'connection_request') {
        const reqId = `${event.transport}:${event.peerId}`;
        setIncomingRequests((prev) => {
          const nextReq: IncomingConnectionRequest = {
            id: reqId,
            peerId: event.peerId,
            peerName: event.peerName,
            deviceCode: event.deviceCode,
            platform: event.platform ?? 'ios',
            transport: event.transport,
            receivedAt: Date.now(),
          };
          const exists = prev.some((r) => r.id === reqId);
          return exists ? prev.map((r) => (r.id === reqId ? nextReq : r)) : [nextReq, ...prev];
        });
        setBtScanFeedback(`Connection request received from ${event.peerName}. Accept or Reject.`);
        if (prefsRef.current.soundEnabled) {
          playSubtleIncomingTone();
        }
      } else if (event.type === 'scan_state') {
        setBtScanState(event.state === 'searching' ? 'searching' : 'disconnected');
        if (event.message) setBtScanFeedback(event.message);
      } else if (event.type === 'error') {
        setBtScanFeedback(event.message);
      } else if (event.type === 'connection_state') {
        void (async () => {
          const mappedContactId = contactIdByNativePeerRef.current.get(event.peerId);
          let contactId = mappedContactId;
          if (!contactId && event.state === 'connected') {
            const c = await ensureContactForPeer({
              deviceId: event.deviceCode || `FC-${event.peerId.slice(0, 6).toUpperCase()}`,
              name: event.peerName || 'Nearby FreeConnect Device',
            });
            contactId = c.id;
            contactIdByNativePeerRef.current.set(event.peerId, c.id);
            nativePeerIdByContactRef.current.set(c.id, event.peerId);
          }
          if (!contactId) return;

          if (event.state === 'connected') {
            clearScheduledReconnect(contactId);
            manualDisconnectIdsRef.current.delete(contactId);
            await patchContact(contactId, {
              lastConnectedAt: Date.now(),
              bluetoothDeviceId: event.peerId,
              bluetoothDeviceName: event.peerName ?? undefined,
            });
            setLiveConnections((prev) => ({
              ...prev,
              [contactId!]: {
                status: 'connected',
                transport: event.transport,
                writable: true,
                isAutoReconnecting: false,
                connectedAt: Date.now(),
                availabilityText:
                  event.transport === 'native_ble'
                    ? `Connected via Native BLE (${event.peerName ?? 'Peer'})`
                    : `Connected via Native P2P (${event.peerName ?? 'Peer'})`,
                detailMessage: event.message,
                connectedDeviceName: event.peerName,
                hardwareId: event.peerId,
              },
            }));
            setLastConnectedEvent({
              contactId: contactId!,
              peerName: event.peerName || 'Nearby Device',
              timestamp: Date.now(),
            });
            setTimeout(() => {
              void sendAuthHelloToContact(contactId!);
              void flushQueuedMessagesForContact(contactId!);
            }, 150);
          } else if (event.state === 'connecting' || event.state === 'searching') {
            setLiveConnections((prev) => ({
              ...prev,
              [contactId!]: {
                status: event.state,
                transport: 'none',
                writable: false,
                availabilityText: event.message ?? 'Connecting...',
                hardwareId: event.peerId,
              },
            }));
          } else if (event.state === 'failed') {
            manualDisconnectIdsRef.current.add(contactId);
            clearScheduledReconnect(contactId);
            setBtScanFeedback(event.message ?? 'Connection Rejected.');
            setLiveConnections((prev) => ({
              ...prev,
              [contactId!]: {
                status: 'failed',
                transport: 'none',
                writable: false,
                availabilityText: 'Connection Rejected',
                detailMessage: event.message ?? 'Connection Rejected.',
                hardwareId: event.peerId,
              },
            }));
          } else {
            const wasManual = manualDisconnectIdsRef.current.has(contactId);
            setLiveConnections((prev) => ({
              ...prev,
              [contactId!]: {
                status: 'disconnected',
                transport: 'none',
                writable: false,
                availabilityText: event.message ?? 'Disconnected',
                hardwareId: event.peerId,
              },
            }));
            // Real auto-reconnect for unexpected native drops (once after 3s)
            if (!wasManual) {
              const cid = contactId;
              clearScheduledReconnect(cid);
              const timer = window.setTimeout(() => {
                reconnectTimersRef.current.delete(cid);
                if (!manualDisconnectIdsRef.current.has(cid)) {
                  setLiveConnections((prev) => ({
                    ...prev,
                    [cid]: {
                      status: 'connecting',
                      transport: 'none',
                      writable: false,
                      isAutoReconnecting: true,
                      reconnectAttempt: 1,
                      availabilityText: 'Reconnecting to nearby device...',
                      hardwareId: event.peerId,
                    },
                  }));
                  connectNativePeer(event.peerId, event.transport);
                }
              }, 3000);
              reconnectTimersRef.current.set(cid, timer);
            }
          }
        })();
      } else if (event.type === 'packet_received') {
        void (async () => {
          try {
            const pkt = JSON.parse(event.packetJson) as WireMessagePacket;
            if (!pkt || pkt.v !== 1) return;
            let contactId = contactIdByNativePeerRef.current.get(event.peerId);
            if (!contactId) {
              const c = await ensureContactForPeer({
                deviceId: pkt.senderDeviceId || `FC-${event.peerId.slice(0, 6).toUpperCase()}`,
                name: pkt.senderName || 'Nearby Device',
                username: pkt.senderUsername,
              });
              contactId = c.id;
              contactIdByNativePeerRef.current.set(event.peerId, c.id);
              nativePeerIdByContactRef.current.set(c.id, event.peerId);
            }
            await handleIncomingWirePacket(contactId, pkt);
          } catch {
            // Ignore malformed native packet JSON
          }
        })();
      }
    });

    return () => {
      unsubscribe();
      stopNativeDiscovery();
    };
  }, [
    capabilities.nativeBridgePlatform,
    clearScheduledReconnect,
    ensureContactForPeer,
    flushQueuedMessagesForContact,
    handleIncomingWirePacket,
    patchContact,
  ]);

  const deleteContactRecord = useCallback(
    async (contactId: string) => {
      const existing = contactsRef.current.find((c) => c.id === contactId);
      manualDisconnectIdsRef.current.add(contactId);
      clearScheduledReconnect(contactId);
      disconnectRealBluetoothDevice(contactId, true);
      disconnectOfflineP2p(contactId);
      const nativePeerId = nativePeerIdByContactRef.current.get(contactId);
      if (nativePeerId) {
        disconnectNativePeer(nativePeerId);
        nativePeerIdByContactRef.current.delete(contactId);
        contactIdByNativePeerRef.current.delete(nativePeerId);
      }
      if (existing) {
        localBusRef.current?.notifyDisconnect(existing.deviceId);
      }
      await removeContact(contactId);
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      setMessages((prev) => prev.filter((m) => m.contactId !== contactId));
      setLiveConnections((prev) => {
        const next = { ...prev };
        delete next[contactId];
        return next;
      });
    },
    [clearScheduledReconnect]
  );

  // Connect to a local nearby browser peer (sends genuine connection request)
  const connectLocalPeer = useCallback(
    async (peer: LocalPeerPresence): Promise<ContactRecord> => {
      const contact = await ensureContactForPeer(peer);
      setLiveConnections((prev) => ({
        ...prev,
        [contact.id]: {
          status: 'request_sent',
          transport: 'none',
          writable: false,
          availabilityText: `Request sent to ${peer.name} · Waiting for approval...`,
        },
      }));
      localBusRef.current?.requestConnect(peer.deviceId);
      setBtScanFeedback(`Connection request sent to ${peer.name}. Waiting for acceptance.`);
      return contact;
    },
    [ensureContactForPeer]
  );

  // Connect to a real native BLE / Wi-Fi Direct / Multipeer discovered peer
  const connectNativeDiscoveredPeer = useCallback(
    async (peer: NativeDiscoveredPeer): Promise<ContactRecord> => {
      const contact = await ensureContactForPeer({
        deviceId: peer.deviceCode || `FC-${peer.id.slice(0, 6).toUpperCase()}`,
        name: peer.name,
      });
      manualDisconnectIdsRef.current.delete(contact.id);
      clearScheduledReconnect(contact.id);
      nativePeerIdByContactRef.current.set(contact.id, peer.id);
      contactIdByNativePeerRef.current.set(peer.id, contact.id);

      setLiveConnections((prev) => ({
        ...prev,
        [contact.id]: {
          status: 'request_sent',
          transport: 'none',
          writable: false,
          hardwareId: peer.id,
          availabilityText: `Connection request sent to ${peer.name} via ${
            peer.transport === 'native_ble' ? 'Native BLE' : 'Native P2P'
          }...`,
        },
      }));
      connectNativePeer(peer.id, peer.transport);
      return contact;
    },
    [clearScheduledReconnect, ensureContactForPeer]
  );

  // Real Web Bluetooth / Native BLE pairing for a specific contact
  const connectContactBluetooth = useCallback(
    async (contact: ContactRecord) => {
      if (contact.isBlocked) return;
      manualDisconnectIdsRef.current.delete(contact.id);
      clearScheduledReconnect(contact.id);

      // 1. If running in native iOS/Android container & we know the peer's native ID, connect natively
      if (capabilities.nativeBridgePlatform !== 'none') {
        const nativePeer =
          nativeNearbyPeers.find(
            (p) =>
              p.id === contact.bluetoothDeviceId ||
              (p.deviceCode && p.deviceCode.toUpperCase() === contact.deviceId.toUpperCase())
          ) ?? null;
        if (nativePeer) {
          await connectNativeDiscoveredPeer(nativePeer);
          return;
        }
        if (contact.bluetoothDeviceId) {
          nativePeerIdByContactRef.current.set(contact.id, contact.bluetoothDeviceId);
          contactIdByNativePeerRef.current.set(contact.bluetoothDeviceId, contact.id);
          setLiveConnections((prev) => ({
            ...prev,
            [contact.id]: {
              status: 'connecting',
              transport: 'none',
              writable: false,
              hardwareId: contact.bluetoothDeviceId ?? undefined,
              availabilityText: `Connecting via Native BLE...`,
            },
          }));
          connectNativePeer(contact.bluetoothDeviceId, 'native_ble');
          return;
        }
      }

      // 2. If this contact is currently discovered as a nearby local peer, connect directly
      const matchingLocal = localNearbyPeers.find(
        (p) => p.deviceId.toUpperCase() === contact.deviceId.toUpperCase()
      );
      if (matchingLocal) {
        await connectLocalPeer(matchingLocal);
        return;
      }

      // 3. Real Browser Web Bluetooth GATT flow
      setBtScanState('searching');
      setLiveConnections((prev) => ({
        ...prev,
        [contact.id]: {
          status: 'searching',
          transport: 'none',
          writable: false,
          availabilityText: 'Searching for Bluetooth devices...',
        },
      }));

      const result = await requestRealBluetoothConnection(contact.id, {
        onStateChange: (state, msg) => {
          setBtScanState(state);
          setLiveConnections((prev) => ({
            ...prev,
            [contact.id]: {
              status: state,
              transport: 'none',
              writable: false,
              availabilityText: msg,
            },
          }));
        },
        onIncomingPacket: (cid, pkt) => {
          void handleIncomingWirePacket(cid, pkt);
        },
        onHardwareDisconnected: () => {
          if (manualDisconnectIdsRef.current.has(contact.id)) {
            setLiveConnections((prev) => ({
              ...prev,
              [contact.id]: {
                status: 'disconnected',
                transport: 'none',
                writable: false,
                availabilityText: 'Disconnected',
              },
            }));
          } else {
            scheduleBluetoothAutoReconnect(contact.id, 1);
          }
        },
      });

      setBtScanFeedback(result.message);
      setBtScanState(result.connected ? 'connected' : 'disconnected');

      if (result.deviceId) {
        setDiscoveredBtDevices((prev) => {
          const entry: DiscoveredBtDevice = {
            id: result.deviceId!,
            name: result.deviceName ?? 'Bluetooth Device',
            connected: result.connected,
            writable: result.writable,
            serviceLabel: result.serviceLabel,
            discoveredAt: Date.now(),
            note: result.message,
            source: 'bluetooth',
          };
          const exists = prev.some((d) => d.id === entry.id);
          return exists ? prev.map((d) => (d.id === entry.id ? entry : d)) : [entry, ...prev];
        });
      }

      if (result.connected) {
        await patchContact(contact.id, {
          lastConnectedAt: Date.now(),
          bluetoothDeviceId: result.deviceId ?? contact.bluetoothDeviceId,
          bluetoothDeviceName: result.deviceName ?? contact.bluetoothDeviceName,
        });
        setLiveConnections((prev) => ({
          ...prev,
          [contact.id]: {
            status: 'connected',
            transport: result.transport,
            writable: result.writable,
            isAutoReconnecting: false,
            availabilityText: result.writable
              ? `Connected via Bluetooth (${result.serviceLabel})`
              : `Connected via BLE GATT (Read-Only — no messaging service)`,
            detailMessage: result.message,
            connectedDeviceName: result.deviceName,
            hardwareId: result.deviceId,
          },
        }));
        if (result.writable) {
          setTimeout(() => void flushQueuedMessagesForContact(contact.id), 150);
        }
      } else {
        if (result.deviceId) {
          await patchContact(contact.id, {
            bluetoothDeviceId: result.deviceId,
            bluetoothDeviceName: result.deviceName ?? contact.bluetoothDeviceName,
          });
        }
        setLiveConnections((prev) => ({
          ...prev,
          [contact.id]: {
            status: 'disconnected',
            transport: 'none',
            writable: false,
            availabilityText: result.permissionBlocked
              ? 'Disconnected · Embedded iframe restricts Web Bluetooth'
              : 'Disconnected',
            detailMessage: result.message,
          },
        }));
      }
    },
    [
      capabilities.nativeBridgePlatform,
      clearScheduledReconnect,
      connectLocalPeer,
      connectNativeDiscoveredPeer,
      flushQueuedMessagesForContact,
      handleIncomingWirePacket,
      localNearbyPeers,
      nativeNearbyPeers,
      patchContact,
      scheduleBluetoothAutoReconnect,
    ]
  );

  const disconnectContact = useCallback(
    (contactId: string) => {
      manualDisconnectIdsRef.current.add(contactId);
      clearScheduledReconnect(contactId);
      peerCryptoKeysRef.current.delete(contactId);
      sentHelloContactIdsRef.current.delete(contactId);
      const contact = contactsRef.current.find((c) => c.id === contactId);
      disconnectRealBluetoothDevice(contactId, true);
      disconnectOfflineP2p(contactId);
      const nativePeerId = nativePeerIdByContactRef.current.get(contactId);
      if (nativePeerId) {
        disconnectNativePeer(nativePeerId);
      }
      if (contact) {
        localBusRef.current?.notifyDisconnect(contact.deviceId);
      }
      setLiveConnections((prev) => ({
        ...prev,
        [contactId]: {
          status: 'disconnected',
          transport: 'none',
          writable: false,
          isAutoReconnecting: false,
          availabilityText: 'Disconnected',
          detailMessage: 'Connection closed manually.',
        },
      }));
    },
    [clearScheduledReconnect]
  );

  const disconnectAllDevices = useCallback(() => {
    const activeIds = Object.entries(liveConnectionsRef.current)
      .filter(([, live]) => live.status === 'connected' || live.status === 'connecting')
      .map(([cid]) => cid);
    for (const cid of activeIds) {
      disconnectContact(cid);
    }
  }, [disconnectContact]);

  // Real Bluetooth ON/OFF control (never fakes ON when unsupported or hardware adapter is unavailable)
  const toggleBluetoothEnabled = useCallback(
    async (nextEnabled: boolean): Promise<{ ok: boolean; message: string }> => {
      if (!nextEnabled) {
        if (capabilities.nativeBridgePlatform !== 'none') {
          setNativeBluetoothEnabled(false);
          stopNativeDiscovery();
        }
        // Disconnect active Bluetooth sessions cleanly
        for (const [cid, live] of Object.entries(liveConnectionsRef.current)) {
          if (
            live.transport === 'native_ble' ||
            live.transport === 'web_bluetooth_gatt' ||
            live.transport === 'web_bluetooth_readonly'
          ) {
            disconnectContact(cid);
          }
        }
        setBtScanState('disconnected');
        const msg = 'Bluetooth is turned OFF in FreeConnect Settings.';
        setBtScanFeedback(msg);
        setBluetoothRuntime((prev) => ({
          ...prev,
          enabled: false,
          visibilityState: prev.platformSupportLevel === 'unsupported' ? 'unsupported' : 'hidden',
          statusMessage: msg,
          lastCheckedAt: Date.now(),
        }));
        return { ok: true, message: msg };
      }

      // Turning Bluetooth ON — route through real platform APIs only
      if (capabilities.nativeBridgePlatform !== 'none') {
        setNativeBluetoothEnabled(true);
        const msg =
          capabilities.nativeBridgePlatform === 'ios_native'
            ? 'Enabling native iOS CoreBluetooth & MultipeerConnectivity...'
            : 'Enabling native Android BLE GATT...';
        setBluetoothRuntime((prev) => ({
          ...prev,
          enabled: true,
          visibilityState: 'discoverable',
          statusMessage: msg,
          lastCheckedAt: Date.now(),
        }));
        return { ok: true, message: msg };
      }

      // Browser runtime: probe real Web Bluetooth availability (never calls Web Bluetooth on iOS Safari)
      const probe = await queryWebBluetoothAvailability();
      if (!probe.supported) {
        setBluetoothRuntime((prev) => ({
          ...prev,
          enabled: false,
          hardwareAvailable: false,
          permissionState: 'unsupported',
          visibilityState: 'unsupported',
          statusMessage: probe.reason,
          lastCheckedAt: Date.now(),
        }));
        return { ok: false, message: probe.reason };
      }

      if (probe.permissionBlocked) {
        setBluetoothRuntime((prev) => ({
          ...prev,
          enabled: false,
          hardwareAvailable: probe.available,
          permissionState: capabilities.isEmbeddedIframe ? 'iframe_blocked' : 'denied',
          visibilityState: 'unsupported',
          statusMessage: probe.reason,
          lastCheckedAt: Date.now(),
        }));
        return { ok: false, message: probe.reason };
      }

      if (probe.available === false) {
        setBluetoothRuntime((prev) => ({
          ...prev,
          enabled: false,
          hardwareAvailable: false,
          visibilityState: 'hidden',
          statusMessage: probe.reason,
          lastCheckedAt: Date.now(),
        }));
        return { ok: false, message: probe.reason };
      }

      const okMsg =
        'Bluetooth enabled via Web Bluetooth API (Central mode). Tap Scan for Devices to choose a nearby BLE peripheral.';
      setBluetoothRuntime((prev) => ({
        ...prev,
        enabled: true,
        hardwareAvailable: probe.available ?? true,
        visibilityState: 'central_only',
        statusMessage: okMsg,
        lastCheckedAt: Date.now(),
      }));
      return { ok: true, message: okMsg };
    },
    [capabilities.isEmbeddedIframe, capabilities.nativeBridgePlatform, disconnectContact]
  );

  // Live adapter & permission recheck (never simulates Bluetooth)
  const refreshBluetoothStatus = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    if (capabilities.nativeBridgePlatform !== 'none') {
      requestNativeBluetoothPermission();
      const msg =
        capabilities.nativeBridgePlatform === 'ios_native'
          ? 'Refreshed native iOS CoreBluetooth & Local Network status.'
          : 'Refreshed native Android Bluetooth adapter & permission status.';
      return { ok: true, message: msg };
    }

    const probe = await queryWebBluetoothAvailability();
    setBluetoothRuntime((prev) => ({
      ...prev,
      enabled:
        !probe.supported || probe.permissionBlocked || probe.available === false
          ? false
          : prev.enabled,
      hardwareAvailable: probe.available,
      permissionState: !probe.supported
        ? 'unsupported'
        : probe.permissionBlocked
          ? capabilities.isEmbeddedIframe
            ? 'iframe_blocked'
            : 'denied'
          : prev.permissionState === 'granted'
            ? 'granted'
            : 'prompt',
      visibilityState:
        !probe.supported || probe.permissionBlocked
          ? 'unsupported'
          : prev.enabled && probe.available !== false
            ? 'central_only'
            : 'hidden',
      statusMessage: probe.reason,
      lastCheckedAt: Date.now(),
    }));
    return {
      ok: probe.supported && !probe.permissionBlocked && probe.available !== false,
      message: probe.reason,
    };
  }, [capabilities.isEmbeddedIframe, capabilities.nativeBridgePlatform]);

  // Request real Bluetooth permission through platform API (invokes requestDevice directly in user gesture)
  const requestBluetoothPermission = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    if (capabilities.nativeBridgePlatform !== 'none') {
      requestNativeBluetoothPermission();
      const msg =
        capabilities.nativeBridgePlatform === 'ios_native'
          ? 'Requested CoreBluetooth & Local Network permission status from iOS.'
          : 'Requested Android Bluetooth permissions status.';
      return { ok: true, message: msg };
    }

    if (capabilities.isIos) {
      const msg =
        'iOS Safari does not support the Web Bluetooth API. Native Apple CoreBluetooth / MultipeerConnectivity (included in ios-freeconnect/) is required on iPhone.';
      setBluetoothRuntime((prev) => ({
        ...prev,
        enabled: false,
        hardwareAvailable: false,
        permissionState: 'unsupported',
        visibilityState: 'unsupported',
        statusMessage: msg,
        lastCheckedAt: Date.now(),
      }));
      return { ok: false, message: msg };
    }

    if (!capabilities.webBluetoothSupported) {
      const msg =
        'This browser does not support Web Bluetooth. Open FreeConnect in Chrome, Edge, or Opera over HTTPS, or use the native Android/iOS build.';
      setBluetoothRuntime((prev) => ({
        ...prev,
        enabled: false,
        hardwareAvailable: false,
        permissionState: 'unsupported',
        visibilityState: 'unsupported',
        statusMessage: msg,
        lastCheckedAt: Date.now(),
      }));
      return { ok: false, message: msg };
    }

    // Trigger real Web Bluetooth permission dialog immediately inside click gesture (no prior await)
    const tempId = `perm-${Date.now()}`;
    const res = await requestRealBluetoothConnection(tempId, {
      onIncomingPacket: (cid, pkt) => {
        void handleIncomingWirePacket(cid, pkt);
      },
      onHardwareDisconnected: () => {
        // Ignore probe disconnect
      },
    });

    if (res.permissionBlocked) {
      setBluetoothRuntime((prev) => ({
        ...prev,
        enabled: false,
        permissionState: capabilities.isEmbeddedIframe ? 'iframe_blocked' : 'denied',
        visibilityState: 'unsupported',
        statusMessage: res.message,
        lastCheckedAt: Date.now(),
      }));
      return { ok: false, message: res.message };
    }

    if (res.deviceId) {
      const entry: DiscoveredBtDevice = {
        id: res.deviceId,
        name: res.deviceName ?? 'Bluetooth Device',
        connected: res.connected,
        writable: res.writable,
        serviceLabel: res.serviceLabel,
        discoveredAt: Date.now(),
        note: res.message,
        source: 'bluetooth',
      };
      setDiscoveredBtDevices((prev) => {
        const exists = prev.some((d) => d.id === entry.id);
        return exists ? prev.map((d) => (d.id === entry.id ? entry : d)) : [entry, ...prev];
      });
      setBluetoothRuntime((prev) => ({
        ...prev,
        enabled: true,
        hardwareAvailable: true,
        permissionState: 'granted',
        visibilityState: 'central_only',
        statusMessage: res.message,
        lastCheckedAt: Date.now(),
      }));
      return { ok: true, message: res.message };
    }

    setBluetoothRuntime((prev) => ({
      ...prev,
      statusMessage: res.message,
      lastCheckedAt: Date.now(),
    }));
    return { ok: false, message: res.message };
  }, [
    capabilities.isEmbeddedIframe,
    capabilities.isIos,
    capabilities.nativeBridgePlatform,
    capabilities.webBluetoothSupported,
    handleIncomingWirePacket,
  ]);

  // Standalone Nearby Devices Scanner (Native iOS/Android BLE+P2P when hosted natively, Web Bluetooth GATT in browser)
  const scanNearbyWebBluetooth = useCallback(async () => {
    if (capabilities.nativeBridgePlatform !== 'none') {
      setBtScanState('searching');
      setBtScanFeedback(
        capabilities.nativeBridgePlatform === 'ios_native'
          ? 'Scanning nearby devices via Native iOS CoreBluetooth & Multipeer...'
          : 'Scanning nearby devices via Native Android BLE & Wi-Fi Direct...'
      );
      startNativeDiscovery('all');
      return;
    }

    setBtScanState('searching');
    setBtScanFeedback('Searching for nearby Bluetooth devices...');
    const tempId = `scan-${Date.now()}`;

    const res = await requestRealBluetoothConnection(tempId, {
      onStateChange: (state, msg) => {
        setBtScanState(state);
        setBtScanFeedback(msg);
      },
      onIncomingPacket: (cid, pkt) => {
        void handleIncomingWirePacket(cid, pkt);
      },
      onHardwareDisconnected: () => {
        setDiscoveredBtDevices((prev) =>
          prev.map((d) => (d.id === tempId ? { ...d, connected: false, writable: false } : d))
        );
      },
    });

    setBtScanFeedback(res.message);
    setBtScanState(res.connected ? 'connected' : 'disconnected');

    if (res.deviceId) {
      const entry: DiscoveredBtDevice = {
        id: res.deviceId,
        name: res.deviceName ?? 'Unnamed Bluetooth Device',
        connected: res.connected,
        writable: res.writable,
        serviceLabel: res.serviceLabel,
        discoveredAt: Date.now(),
        note: res.message,
        source: 'bluetooth',
      };
      setDiscoveredBtDevices((prev) => {
        const exists = prev.some((d) => d.id === entry.id);
        return exists ? prev.map((d) => (d.id === entry.id ? entry : d)) : [entry, ...prev];
      });
    }
  }, [capabilities.nativeBridgePlatform, handleIncomingWirePacket]);

  // Direct Offline P2P Pairing (Serverless WebRTC DataChannel, zero internet / zero server)
  const createP2pPairingOffer = useCallback(async (): Promise<string> => {
    return createOfflineP2pOffer({
      deviceId: profileRef.current.deviceId,
      name: profileRef.current.name,
      username: profileRef.current.username,
    });
  }, []);

  const acceptP2pPairingOffer = useCallback(
    async (offerCode: string): Promise<{ answerCode: string; contactId: string; peerName: string }> => {
      const result = await acceptOfflineP2pOffer(
        offerCode,
        {
          deviceId: profileRef.current.deviceId,
          name: profileRef.current.name,
          username: profileRef.current.username,
        },
        async (peer) => {
          const contact = await ensureContactForPeer(peer);
          setLiveConnections((prev) => ({
            ...prev,
            [contact.id]: {
              status: 'connecting',
              transport: 'none',
              writable: false,
              availabilityText: `Connecting directly to ${peer.name}...`,
            },
          }));
          return contact.id;
        },
        {
          onOpen: (contactId, peerMeta) => {
            void patchContact(contactId, { lastConnectedAt: Date.now() });
            setLiveConnections((prev) => ({
              ...prev,
              [contactId]: {
                status: 'connected',
                transport: 'offline_webrtc_p2p',
                writable: true,
                availabilityText: `Connected to ${peerMeta.name} (Direct Offline P2P)`,
                connectedDeviceName: peerMeta.name,
              },
            }));
            setTimeout(() => void flushQueuedMessagesForContact(contactId), 150);
          },
          onClose: (contactId, reason) => {
            setLiveConnections((prev) => ({
              ...prev,
              [contactId]: {
                status: 'disconnected',
                transport: 'none',
                writable: false,
                availabilityText: reason ?? 'Disconnected · Direct P2P link closed',
                detailMessage: reason,
              },
            }));
          },
          onPacket: (contactId, pkt) => {
            void handleIncomingWirePacket(contactId, pkt);
          },
        }
      );

      return {
        answerCode: result.answerCode,
        contactId: result.contactId,
        peerName: result.peerName,
      };
    },
    [ensureContactForPeer, flushQueuedMessagesForContact, handleIncomingWirePacket, patchContact]
  );

  const completeP2pPairingAnswer = useCallback(
    async (answerCode: string): Promise<{ contactId: string; peerName: string }> => {
      const result = await completeOfflineP2pAnswer(
        answerCode,
        async (peer) => {
          const contact = await ensureContactForPeer(peer);
          setLiveConnections((prev) => ({
            ...prev,
            [contact.id]: {
              status: 'connecting',
              transport: 'none',
              writable: false,
              availabilityText: `Connecting directly to ${peer.name}...`,
            },
          }));
          return contact.id;
        },
        {
          onOpen: (contactId, peerMeta) => {
            void patchContact(contactId, { lastConnectedAt: Date.now() });
            setLiveConnections((prev) => ({
              ...prev,
              [contactId]: {
                status: 'connected',
                transport: 'offline_webrtc_p2p',
                writable: true,
                availabilityText: `Connected to ${peerMeta.name} (Direct Offline P2P)`,
                connectedDeviceName: peerMeta.name,
              },
            }));
            setTimeout(() => void flushQueuedMessagesForContact(contactId), 150);
          },
          onClose: (contactId, reason) => {
            setLiveConnections((prev) => ({
              ...prev,
              [contactId]: {
                status: 'disconnected',
                transport: 'none',
                writable: false,
                availabilityText: reason ?? 'Disconnected · Direct P2P link closed',
                detailMessage: reason,
              },
            }));
          },
          onPacket: (contactId, pkt) => {
            void handleIncomingWirePacket(contactId, pkt);
          },
        }
      );

      return { contactId: result.contactId, peerName: result.peerName };
    },
    [ensureContactForPeer, flushQueuedMessagesForContact, handleIncomingWirePacket, patchContact]
  );

  // Direct Messages: Explicit SENDING -> SENT -> DELIVERED / FAILED lifecycle (or honest QUEUED_OFFLINE when disconnected)
  const sendDirectMessageToContact = useCallback(
    async (
      contactId: string,
      text: string,
      extra?: Partial<
        Pick<
          ContactDirectMessage,
          | 'kind'
          | 'voiceDurationSec'
          | 'voiceDataUrl'
          | 'voiceMimeType'
          | 'fileName'
          | 'fileSizeKb'
          | 'fileCategory'
          | 'fileDataUrl'
          | 'fileMimeType'
        >
      >
    ) => {
      const clean = text.trim();
      if (!clean) return;

      const msgId = makeUuid();
      const timestamp = Date.now();
      const live = liveConnectionsRef.current[contactId];
      const hasWritableLink = Boolean(live && live.status === 'connected' && live.writable);

      if (!hasWritableLink) {
        const queuedMsg: ContactDirectMessage = {
          id: msgId,
          contactId,
          text: clean,
          timestamp,
          isOutgoing: true,
          deliveryState: 'QUEUED_OFFLINE',
          kind: extra?.kind ?? 'text',
          reactions: [],
          ...extra,
        };
        await saveDirectMessage(queuedMsg);
        setMessages((prev) => [...prev, queuedMsg]);
        return;
      }

      // Immediately show SENDING state while writing real bytes to the active link
      const sendingMsg: ContactDirectMessage = {
        id: msgId,
        contactId,
        text: clean,
        timestamp,
        isOutgoing: true,
        deliveryState: 'SENDING',
        kind: extra?.kind ?? 'text',
        reactions: [],
        ...extra,
      };
      setMessages((prev) => [...prev, sendingMsg]);

      const pkt = await buildOutgoingMessagePacket(contactId, {
        id: msgId,
        text: clean,
        timestamp,
        kind: extra?.kind ?? 'text',
        voiceDurationSec: extra?.voiceDurationSec,
        voiceDataUrl: extra?.voiceDataUrl,
        voiceMimeType: extra?.voiceMimeType,
        fileName: extra?.fileName,
        fileSizeKb: extra?.fileSizeKb,
        fileCategory: extra?.fileCategory,
        fileDataUrl: extra?.fileDataUrl,
        fileMimeType: extra?.fileMimeType,
      });

      const tx = await transmitPacketToContact(contactId, pkt);
      const finalMsg: ContactDirectMessage = tx.sent
        ? {
            ...sendingMsg,
            deliveryState: tx.transport === 'bluetooth' ? 'SENT_OVER_BLUETOOTH' : 'SENT_OVER_P2P',
            errorText: undefined,
          }
        : {
            ...sendingMsg,
            deliveryState: 'FAILED',
            errorText: tx.error ?? 'Message transmission failed.',
          };

      await saveDirectMessage(finalMsg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === finalMsg.id
            ? m.deliveryState === 'DELIVERED'
              ? m // Preserve DELIVERED if ACK returned ultra-fast over local link
              : finalMsg
            : m
        )
      );
    },
    [buildOutgoingMessagePacket, transmitPacketToContact]
  );

  const retryDirectMessage = useCallback(
    async (messageId: string) => {
      const target = messagesRef.current.find((m) => m.id === messageId);
      if (!target || !target.isOutgoing) return;

      // Transition to SENDING immediately
      setMessages((prev) =>
        prev.map((m) =>
          m.id === target.id ? { ...m, deliveryState: 'SENDING', errorText: undefined } : m
        )
      );

      const pkt = await buildOutgoingMessagePacket(target.contactId, target);

      const tx = await transmitPacketToContact(target.contactId, pkt);
      const updated: ContactDirectMessage = tx.sent
        ? {
            ...target,
            deliveryState: tx.transport === 'bluetooth' ? 'SENT_OVER_BLUETOOTH' : 'SENT_OVER_P2P',
            errorText: undefined,
          }
        : {
            ...target,
            deliveryState: 'FAILED',
            errorText: tx.error ?? 'Device is not connected.',
          };

      await saveDirectMessage(updated);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === updated.id
            ? m.deliveryState === 'DELIVERED'
              ? m
              : updated
            : m
        )
      );
    },
    [transmitPacketToContact]
  );

  const toggleDirectMessageReaction = useCallback(async (messageId: string, emoji: string) => {
    const target = messagesRef.current.find((m) => m.id === messageId);
    if (!target) return;
    const current = target.reactions ?? [];
    const nextReactions = current.includes(emoji)
      ? current.filter((e) => e !== emoji)
      : [...current, emoji];
    const updated: ContactDirectMessage = { ...target, reactions: nextReactions };
    await saveDirectMessage(updated);
    setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
  }, []);

  const clearContactConversation = useCallback(async (contactId: string) => {
    await clearMessagesForContact(contactId);
    setMessages((prev) => prev.filter((m) => m.contactId !== contactId));
  }, []);

  const clearAllLocalMessages = useCallback(async () => {
    await clearAllDirectMessages();
    setMessages([]);
  }, []);

  // Group Chat operations (human participants only)
  const createGroupRoom = useCallback((name: string, description: string, memberIds: string[]) => {
    const clean = name.trim();
    if (!clean || memberIds.length === 0) return;
    const room: WebGroupRoom = {
      id: makeUuid(),
      name: clean,
      description: description.trim() || 'Offline group workspace',
      memberContactIds: memberIds,
      createdAt: Date.now(),
    };
    setGroupRooms((prev) => [room, ...prev]);
    return room.id;
  }, []);

  const sendGroupRoomMessage = useCallback(
    (roomId: string, text: string) => {
      const clean = text.trim();
      if (!clean) return;
      const room = groupRooms.find((r) => r.id === roomId);
      const members = room?.memberContactIds ?? [];
      let liveCount = 0;
      let queuedCount = 0;

      for (const memberId of members) {
        const live = liveConnectionsRef.current[memberId];
        if (live?.status === 'connected' && live.writable) {
          liveCount += 1;
          void sendDirectMessageToContact(memberId, `[Group: ${room?.name ?? 'Room'}] ${clean}`);
        } else {
          queuedCount += 1;
        }
      }

      const gm: WebGroupMessage = {
        id: makeUuid(),
        roomId,
        senderName: profileRef.current.name,
        text: clean,
        timestamp: Date.now(),
        sentLiveCount: liveCount,
        queuedCount,
        reactions: [],
      };
      setGroupMessages((prev) => [...prev, gm]);
    },
    [groupRooms, sendDirectMessageToContact]
  );

  const toggleGroupReaction = useCallback((msgId: string, emoji: string) => {
    setGroupMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        const has = m.reactions.includes(emoji);
        return {
          ...m,
          reactions: has ? m.reactions.filter((e) => e !== emoji) : [...m.reactions, emoji],
        };
      })
    );
  }, []);

  // Voice & File Management
  const addVoiceClip = useCallback((clip: LocalVoiceClip) => {
    setVoiceClips((prev) => [clip, ...prev]);
  }, []);

  const deleteVoiceClip = useCallback((id: string) => {
    setVoiceClips((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const addStagedFile = useCallback((file: StagedOfflineFile) => {
    setStagedFiles((prev) => [file, ...prev]);
  }, []);

  const deleteStagedFile = useCallback((id: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const shareFileWithContact = useCallback(
    async (file: StagedOfflineFile, contact: ContactRecord) => {
      const live = liveConnectionsRef.current[contact.id];
      const isBt = live?.status === 'connected' && live.transport === 'web_bluetooth_gatt';
      const isP2p =
        live?.status === 'connected' &&
        (live.transport === 'offline_webrtc_p2p' || live.transport === 'local_window_channel');

      await sendDirectMessageToContact(contact.id, `Shared file: ${file.name}`, {
        kind: 'file',
        fileName: file.name,
        fileSizeKb: file.sizeKb,
        fileCategory: file.category,
        fileDataUrl: file.dataUrl,
        fileMimeType: file.mimeType,
      });

      setStagedFiles((prev) =>
        prev.map((f) =>
          f.id === file.id
            ? {
                ...f,
                status: isBt
                  ? 'SENT_OVER_BLUETOOTH'
                  : isP2p
                    ? 'SENT_OVER_P2P'
                    : 'QUEUED_FOR_PEER',
                targetContactName: contact.name,
              }
            : f
        )
      );
    },
    [sendDirectMessageToContact]
  );

  // Emergency SOS Dispatch
  const dispatchEmergencySos = useCallback(
    async (sosMessage: string, targetContactIds: string[]) => {
      const clean = sosMessage.trim();
      if (!clean) return;
      const targets = contactsRef.current.filter(
        (c) => targetContactIds.includes(c.id) && !c.isBlocked
      );
      let liveCount = 0;
      let queuedCount = 0;

      for (const target of targets) {
        const live = liveConnectionsRef.current[target.id];
        const isLive = Boolean(live?.status === 'connected' && live.writable);
        if (isLive) liveCount += 1;
        else queuedCount += 1;
        await sendDirectMessageToContact(target.id, `[PRIORITY SOS] ${clean}`, {
          kind: 'sos',
        });
      }

      const record: WebSosRecord = {
        id: `SOS-${makeUuid().slice(0, 6).toUpperCase()}`,
        message: clean,
        timestamp: Date.now(),
        targetNames: targets.map((t) => t.name),
        liveBluetoothCount: liveCount,
        queuedOfflineCount: queuedCount,
      };
      setSosRecords((prev) => [record, ...prev]);
    },
    [sendDirectMessageToContact]
  );

  // --- iPhone-to-iPhone Discovery & Explicit Accept/Reject Request Handlers ---
  const startIphoneDiscovery = useCallback(() => {
    setBtScanState('searching');
    if (capabilities.nativeBridgePlatform !== 'none') {
      const started = startNativeDiscovery('all');
      if (started) {
        setBtScanFeedback(
          capabilities.nativeBridgePlatform === 'ios_native'
            ? 'Searching nearby iPhones via Apple MultipeerConnectivity & CoreBluetooth BLE...'
            : 'Searching nearby FreeConnect BLE & Wi-Fi Direct peers...'
        );
        return;
      }
    }

    // In standard browser (including iOS Safari): announce on real LocalBrowserPeerBus and report honestly
    localBusRef.current?.announce();
    setBtScanFeedback(
      capabilities.isIos
        ? 'Apple iOS Safari does not expose Web Bluetooth or Multipeer APIs to websites. Nearby tabs on this device are scanned automatically; to connect two separate iPhones or an iPhone and Android right now, open Pairing Code, or build the included native iOS app (ios-freeconnect/) for direct Bluetooth / Multipeer discovery.'
        : 'Scanning local browser peers. To pair across separate phones instantly, open Pairing Code; for zero-Wi-Fi native iOS Bluetooth/Multipeer discovery, build the included native iOS container (ios-freeconnect/).'
    );
  }, [capabilities.isIos, capabilities.nativeBridgePlatform]);

  const stopIphoneDiscovery = useCallback(() => {
    if (capabilities.nativeBridgePlatform !== 'none') {
      stopNativeDiscovery();
    }
    setBtScanState('disconnected');
  }, [capabilities.nativeBridgePlatform]);

  const acceptIncomingRequest = useCallback(
    async (req: IncomingConnectionRequest): Promise<ContactRecord | null> => {
      setIncomingRequests((prev) => prev.filter((r) => r.id !== req.id));

      if (req.transport === 'local_window_channel') {
        const contact = await ensureContactForPeer({
          deviceId: req.deviceCode || req.peerId,
          name: req.peerName,
          username: req.peerUsername,
        });
        await patchContact(contact.id, { lastConnectedAt: Date.now() });
        localBusRef.current?.acceptConnect(req.peerId);
        // Single-use 6-digit code burn on acceptance
        if (req.codeVerified && activeCodeSessionRef.current) {
          setActiveCodeSession(null);
          localBusRef.current?.cancelCodeHost();
          cancelNativeCodeHost();
          setCodePairingState('connected');
          setCodePairingMessage(`Connected to ${req.peerName} via 6-digit code. Opening chat...`);
        }
        setLiveConnections((prev) => ({
          ...prev,
          [contact.id]: {
            status: 'connected',
            transport: 'local_window_channel',
            writable: true,
            connectedAt: Date.now(),
            availabilityText: `Connected to ${req.peerName} (Local Offline Link)`,
            connectedDeviceName: req.peerName,
          },
        }));
        setLastConnectedEvent({
          contactId: contact.id,
          peerName: req.peerName,
          timestamp: Date.now(),
        });
        setTimeout(() => {
          void sendAuthHelloToContact(contact.id);
          void flushQueuedMessagesForContact(contact.id);
        }, 120);
        return contact;
      }

      if (req.transport === 'native_ble' || req.transport === 'native_wifi_direct') {
        const contact = await ensureContactForPeer({
          deviceId: req.deviceCode || `FC-${req.peerId.slice(0, 6).toUpperCase()}`,
          name: req.peerName,
        });
        manualDisconnectIdsRef.current.delete(contact.id);
        nativePeerIdByContactRef.current.set(contact.id, req.peerId);
        contactIdByNativePeerRef.current.set(req.peerId, contact.id);
        if (req.codeVerified && activeCodeSessionRef.current) {
          setActiveCodeSession(null);
          cancelNativeCodeHost();
        }
        setLiveConnections((prev) => ({
          ...prev,
          [contact.id]: {
            status: 'connecting',
            transport: 'none',
            writable: false,
            hardwareId: req.peerId,
            availabilityText: `Accepting connection from ${req.peerName}...`,
          },
        }));
        respondNativeConnectionRequest(req.peerId, true, req.transport);
        return contact;
      }

      return null;
    },
    [ensureContactForPeer, flushQueuedMessagesForContact, patchContact]
  );

  const rejectIncomingRequest = useCallback((req: IncomingConnectionRequest) => {
    setIncomingRequests((prev) => prev.filter((r) => r.id !== req.id));
    if (req.transport === 'local_window_channel') {
      if (req.codeVerified) {
        localBusRef.current?.rejectCodeJoin(
          req.peerId,
          `${profileRef.current.name} declined your code connection request.`
        );
      } else {
        localBusRef.current?.rejectConnect(req.peerId);
      }
    } else if (req.transport === 'native_ble' || req.transport === 'native_wifi_direct') {
      respondNativeConnectionRequest(req.peerId, false, req.transport);
    }
    setBtScanFeedback(`Rejected connection request from ${req.peerName}.`);
  }, []);

  // --- Connect with Code (Temporary 6-Digit Offline Connection Code with Dual Approval) ---
  const generateConnectionCode = useCallback(async () => {
    const session = await createTemporaryCodeSession(profileRef.current.deviceId);
    setActiveCodeSession(session);
    setCodePairingState('hosting');
    setCodePairingMessage(
      'Temporary 6-digit code active for 3 minutes. Share this code with the nearby user and approve their incoming request.'
    );
    localBusRef.current?.setActiveCodeHost({
      nonce: session.nonce,
      commitment: session.commitment,
      expiresAt: session.expiresAt,
    });
    if (capabilities.nativeBridgePlatform !== 'none') {
      startNativeCodeHost(session.commitment, session.nonce, session.expiresAt);
    }
    return session;
  }, [capabilities.nativeBridgePlatform]);

  const cancelConnectionCode = useCallback(() => {
    setActiveCodeSession(null);
    localBusRef.current?.cancelCodeHost();
    if (capabilities.nativeBridgePlatform !== 'none') {
      cancelNativeCodeHost();
    }
    setCodePairingState('idle');
    setCodePairingMessage(null);
  }, [capabilities.nativeBridgePlatform]);

  const validateEnteredConnectionCode = useCallback(
    async (rawCode: string): Promise<{ ok: boolean; error?: string }> => {
      const clean = normalizeSixDigitCode(rawCode);
      if (!isValidSixDigitCode(clean)) {
        setCodePairingState('failed');
        const err = 'Enter a complete 6-digit numeric connection code.';
        setCodePairingMessage(err);
        return { ok: false, error: err };
      }

      setCodePairingState('validating');
      setCodePairingMessage('Verifying 6-digit code cryptographically against nearby devices...');
      localBusRef.current?.announce();

      const now = Date.now();
      const activeHosts = discoveredCodeHostsRef.current.filter((h) => h.expiresAt > now);

      if (activeHosts.length === 0) {
        setCodePairingState('failed');
        const err =
          capabilities.nativeBridgePlatform === 'none'
            ? 'No nearby device is broadcasting an active 6-digit code right now. Make sure the other device generated a code on this same local channel or inside the native iOS/Android FreeConnect app.'
            : 'No nearby iOS/Android device is hosting an active 6-digit code right now. Ensure the other user generated a code and Bluetooth/Wi-Fi is enabled.';
        setCodePairingMessage(err);
        return { ok: false, error: err };
      }

      for (const host of activeHosts) {
        const matched = await verifyCodeAgainstCommitment(
          clean,
          host.nonce,
          host.hostDeviceId,
          host.commitment
        );
        if (matched) {
          const proof = await computeCodeJoinProof(
            clean,
            host.nonce,
            host.hostDeviceId,
            profileRef.current.deviceId
          );
          setPendingCodeApproval({
            hostDeviceId: host.hostDeviceId,
            hostName: host.hostName,
            hostUsername: host.hostUsername,
            hostPlatform: host.hostPlatform,
            nonce: host.nonce,
            proof,
            expiresAt: host.expiresAt,
            transport: host.transport,
            nativePeerId: host.nativePeerId,
          });
          setCodePairingState('awaiting_local_approval');
          setCodePairingMessage(
            `Code verified for ${host.hostName}. Confirm below to send your approval request.`
          );
          return { ok: true };
        }
      }

      setCodePairingState('failed');
      const err = 'Code did not match any active nearby device, or the code has expired.';
      setCodePairingMessage(err);
      return { ok: false, error: err };
    },
    [capabilities.nativeBridgePlatform]
  );

  const confirmAndSendCodeRequest = useCallback(async () => {
    const pending = pendingCodeApproval;
    if (!pending) return;
    if (pending.expiresAt <= Date.now()) {
      setPendingCodeApproval(null);
      setCodePairingState('expired');
      setCodePairingMessage('This 6-digit code expired before approval was sent.');
      return;
    }

    const contact = await ensureContactForPeer({
      deviceId: pending.hostDeviceId,
      name: pending.hostName,
      username: pending.hostUsername,
    });

    setLiveConnections((prev) => ({
      ...prev,
      [contact.id]: {
        status: 'request_sent',
        transport: 'none',
        writable: false,
        availabilityText: `Code approved · Waiting for ${pending.hostName} to accept...`,
      },
    }));

    setCodePairingState('awaiting_host_approval');
    setCodePairingMessage(
      `Approval sent to ${pending.hostName}. Waiting for them to accept on their device...`
    );

    if (pending.transport === 'local_window_channel') {
      localBusRef.current?.sendCodeJoinRequest(pending.hostDeviceId, pending.nonce, pending.proof);
    } else if (pending.nativePeerId) {
      sendNativeCodeJoinRequest(
        pending.nativePeerId,
        pending.nonce,
        pending.proof,
        pending.transport
      );
    }
  }, [ensureContactForPeer, pendingCodeApproval]);

  const cancelPendingCodeApproval = useCallback(() => {
    setPendingCodeApproval(null);
    setCodePairingState('idle');
    setCodePairingMessage(null);
  }, []);

  // --- PBKDF2-SHA256 PIN Security (IndexedDB only, zero plain-text / zero localStorage) ---
  const pinSecurity: PinSecuritySummary = useMemo(
    () => ({
      hasPin: Boolean(pinRecord),
      hasSecurityQuestion: Boolean(pinRecord?.securityQuestion),
      securityQuestion: pinRecord?.securityQuestion ?? null,
      hasRecoveryKey: Boolean(pinRecord?.recoveryKeyHashBase64),
      createdAt: pinRecord?.createdAt ?? null,
      updatedAt: pinRecord?.updatedAt ?? null,
      failedAttempts: pinRecord?.failedAttempts ?? 0,
      lockoutUntil: pinRecord?.lockoutUntil ?? null,
    }),
    [pinRecord]
  );

  const createUserPin = useCallback(
    async (params: {
      pin: string;
      securityQuestion?: string;
      securityAnswer?: string;
    }): Promise<{ recoveryKey: string }> => {
      const { record, recoveryKey } = await createPinSecurityRecord(params);
      await savePinSecurityRecord(record);
      setPinRecord(record);
      return { recoveryKey };
    },
    []
  );

  const verifyUserPin = useCallback(
    async (
      candidatePin: string
    ): Promise<{ ok: boolean; error?: string; lockoutRemainingSec?: number }> => {
      if (!pinRecord) {
        return { ok: false, error: 'No PIN has been configured yet.' };
      }
      const now = Date.now();
      if (pinRecord.lockoutUntil && pinRecord.lockoutUntil > now) {
        const remaining = Math.ceil((pinRecord.lockoutUntil - now) / 1000);
        return {
          ok: false,
          error: `Too many incorrect attempts. Try again in ${remaining}s or use Forgot PIN recovery.`,
          lockoutRemainingSec: remaining,
        };
      }

      const valid = await verifyPinAgainstRecord(candidatePin, pinRecord);
      if (valid) {
        if (pinRecord.failedAttempts > 0 || pinRecord.lockoutUntil) {
          const resetRecord: StoredPinSecurityRecord = {
            ...pinRecord,
            failedAttempts: 0,
            lockoutUntil: null,
          };
          await savePinSecurityRecord(resetRecord);
          setPinRecord(resetRecord);
        }
        return { ok: true };
      }

      const nextFails = pinRecord.failedAttempts + 1;
      const shouldLockout = nextFails >= 5;
      const updated: StoredPinSecurityRecord = {
        ...pinRecord,
        failedAttempts: shouldLockout ? 0 : nextFails,
        lockoutUntil: shouldLockout ? now + 30_000 : null,
      };
      await savePinSecurityRecord(updated);
      setPinRecord(updated);

      return {
        ok: false,
        error: shouldLockout
          ? '5 incorrect PIN attempts. Locked for 30 seconds.'
          : `Incorrect PIN (${5 - nextFails} attempts remaining before cooldown).`,
        lockoutRemainingSec: shouldLockout ? 30 : undefined,
      };
    },
    [pinRecord]
  );

  const changeUserPin = useCallback(
    async (
      currentPin: string,
      newPin: string
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!pinRecord) return { ok: false, error: 'No existing PIN found.' };
      const check = await verifyUserPin(currentPin);
      if (!check.ok) return check;
      try {
        const updated = await updatePinInRecord(pinRecord, newPin);
        await savePinSecurityRecord(updated);
        setPinRecord(updated);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Invalid new PIN.' };
      }
    },
    [pinRecord, verifyUserPin]
  );

  const disableUserPin = useCallback(
    async (currentPin: string): Promise<{ ok: boolean; error?: string }> => {
      if (!pinRecord) return { ok: true };
      const check = await verifyUserPin(currentPin);
      if (!check.ok) return check;
      await clearPinSecurityRecord();
      setPinRecord(null);
      return { ok: true };
    },
    [pinRecord, verifyUserPin]
  );

  const recoverPinWithRecoveryKey = useCallback(
    async (
      recoveryKey: string,
      newPin: string
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!pinRecord) return { ok: false, error: 'No PIN security record exists.' };
      const matches = await verifyRecoveryKeyAgainstRecord(recoveryKey, pinRecord);
      if (!matches) {
        return { ok: false, error: 'Recovery Key does not match.' };
      }
      try {
        const updated = await updatePinInRecord(pinRecord, newPin);
        await savePinSecurityRecord(updated);
        setPinRecord(updated);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Invalid new PIN.' };
      }
    },
    [pinRecord]
  );

  const recoverPinWithSecurityAnswer = useCallback(
    async (
      answer: string,
      newPin: string
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!pinRecord || !pinRecord.securityQuestion) {
        return { ok: false, error: 'No Security Question was configured for this PIN.' };
      }
      const matches = await verifySecurityAnswerAgainstRecord(answer, pinRecord);
      if (!matches) {
        return { ok: false, error: 'Security answer does not match.' };
      }
      try {
        const updated = await updatePinInRecord(pinRecord, newPin);
        await savePinSecurityRecord(updated);
        setPinRecord(updated);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Invalid new PIN.' };
      }
    },
    [pinRecord]
  );

  // --- Private Chat Folder Management & Individual Chat Locking ---
  const isContactPrivate = useCallback(
    (contactId: string): boolean => {
      const a = privateAssignments[contactId];
      if (!a) return false;
      if (a.isLocked) return true;
      if (a.folderId) {
        const folder = privateFolders.find((f) => f.id === a.folderId);
        if (folder?.isLocked) return true;
      }
      return false;
    },
    [privateAssignments, privateFolders]
  );

  const createPrivateFolder = useCallback(
    async (name: string, isLocked: boolean): Promise<PrivateChatFolder | null> => {
      const clean = name.trim();
      if (!clean) return null;
      const now = Date.now();
      const folder: PrivateChatFolder = {
        id: `folder-${makeUuid().slice(0, 8)}`,
        name: clean,
        isLocked,
        createdAt: now,
        updatedAt: now,
      };
      const next = [...privateFoldersRef.current, folder];
      setPrivateFolders(next);
      await savePrivateFolders(next);
      return folder;
    },
    []
  );

  const renamePrivateFolder = useCallback(async (folderId: string, newName: string) => {
    const clean = newName.trim();
    if (!clean) return;
    const next = privateFoldersRef.current.map((f) =>
      f.id === folderId ? { ...f, name: clean, updatedAt: Date.now() } : f
    );
    setPrivateFolders(next);
    await savePrivateFolders(next);
  }, []);

  const setFolderLocked = useCallback(async (folderId: string, isLocked: boolean) => {
    const next = privateFoldersRef.current.map((f) =>
      f.id === folderId ? { ...f, isLocked, updatedAt: Date.now() } : f
    );
    setPrivateFolders(next);
    await savePrivateFolders(next);
  }, []);

  // Safely deletes ONLY the folder; never deletes any contacts or chat messages!
  const deletePrivateFolder = useCallback(async (folderId: string) => {
    const nextFolders = privateFoldersRef.current.filter((f) => f.id !== folderId);
    const nextAssignments: Record<string, PrivateChatAssignment> = {};
    for (const [cid, assignment] of Object.entries(privateAssignmentsRef.current)) {
      if (assignment.folderId === folderId) {
        // Keep individually locked chats safely in Private Chats (unassigned);
        // return unlocked folder-only chats to Normal Chats without touching any messages
        if (assignment.isLocked) {
          nextAssignments[cid] = { ...assignment, folderId: null };
        }
      } else {
        nextAssignments[cid] = assignment;
      }
    }
    setPrivateFolders(nextFolders);
    setPrivateAssignments(nextAssignments);
    await Promise.all([
      savePrivateFolders(nextFolders),
      savePrivateAssignments(nextAssignments),
    ]);
  }, []);

  const lockChatAndMoveToPrivate = useCallback(
    async (contactId: string, folderId: string | null = null) => {
      const existing = privateAssignmentsRef.current[contactId];
      const next: Record<string, PrivateChatAssignment> = {
        ...privateAssignmentsRef.current,
        [contactId]: {
          contactId,
          folderId: folderId !== undefined ? folderId : existing?.folderId ?? null,
          isLocked: true,
          lockedAt: Date.now(),
        },
      };
      setPrivateAssignments(next);
      await savePrivateAssignments(next);
    },
    []
  );

  const moveChatToFolder = useCallback(
    async (contactId: string, folderId: string | null, keepLocked?: boolean) => {
      const existing = privateAssignmentsRef.current[contactId];
      const targetFolder = folderId
        ? privateFoldersRef.current.find((f) => f.id === folderId)
        : null;
      const shouldBeLocked =
        keepLocked !== undefined
          ? keepLocked
          : Boolean(existing?.isLocked || targetFolder?.isLocked);

      const next = { ...privateAssignmentsRef.current };
      if (!folderId && !shouldBeLocked) {
        delete next[contactId];
      } else {
        next[contactId] = {
          contactId,
          folderId,
          isLocked: shouldBeLocked,
          lockedAt: existing?.lockedAt ?? Date.now(),
        };
      }
      setPrivateAssignments(next);
      await savePrivateAssignments(next);
    },
    []
  );

  const unlockChatToNormal = useCallback(async (contactId: string) => {
    const next = { ...privateAssignmentsRef.current };
    delete next[contactId];
    setPrivateAssignments(next);
    await savePrivateAssignments(next);
  }, []);

  // Build a complete snapshot of all local website data (IndexedDB + localStorage)
  const buildLocalWebsiteBackup = useCallback(() => {
    return {
      format: 'freeconnect-full-website-data-backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      storageEngine,
      localData: {
        profile: profileRef.current,
        prefs: prefsRef.current,
        contacts: contactsRef.current,
        messages: messagesRef.current,
        privateFolders: privateFoldersRef.current,
        privateAssignments: privateAssignmentsRef.current,
        groupRooms,
        groupMessages,
        voiceClips,
        stagedFiles: stagedFiles.map(({ objectUrl: _u, ...rest }) => rest),
        sosRecords,
      },
    };
  }, [groupMessages, groupRooms, sosRecords, stagedFiles, storageEngine, voiceClips]);

  // Validate and restore a downloaded FreeConnect JSON backup safely into IndexedDB & localStorage
  const restoreLocalWebsiteBackup = useCallback(
    async (
      rawPayload: unknown
    ): Promise<{
      ok: boolean;
      summary: string;
      restoredCounts?: {
        contacts: number;
        messages: number;
        groupRooms: number;
        privateFolders: number;
      };
    }> => {
      if (!rawPayload || typeof rawPayload !== 'object') {
        return { ok: false, summary: 'Invalid backup file: expected a JSON object.' };
      }

      const root = rawPayload as Record<string, unknown>;
      const dataObj =
        root.localData && typeof root.localData === 'object'
          ? (root.localData as Record<string, unknown>)
          : root;

      const rawContacts = Array.isArray(dataObj.contacts)
        ? (dataObj.contacts as ContactRecord[]).filter(
            (c) => c && typeof c.id === 'string' && typeof c.name === 'string'
          )
        : [];
      const rawMessages = Array.isArray(dataObj.messages)
        ? (dataObj.messages as ContactDirectMessage[]).filter(
            (m) => m && typeof m.id === 'string' && typeof m.contactId === 'string'
          )
        : [];
      const rawFolders = Array.isArray(dataObj.privateFolders)
        ? (dataObj.privateFolders as PrivateChatFolder[]).filter(
            (f) => f && typeof f.id === 'string' && typeof f.name === 'string'
          )
        : [];
      const rawAssignments =
        dataObj.privateAssignments && typeof dataObj.privateAssignments === 'object'
          ? (dataObj.privateAssignments as Record<string, PrivateChatAssignment>)
          : null;
      const rawGroupRooms = Array.isArray(dataObj.groupRooms)
        ? (dataObj.groupRooms as WebGroupRoom[]).filter(
            (r) => r && typeof r.id === 'string' && typeof r.name === 'string'
          )
        : [];
      const rawGroupMessages = Array.isArray(dataObj.groupMessages)
        ? (dataObj.groupMessages as WebGroupMessage[]).filter(
            (m) => m && typeof m.id === 'string' && typeof m.roomId === 'string'
          )
        : [];
      const rawVoiceClips = Array.isArray(dataObj.voiceClips)
        ? (dataObj.voiceClips as LocalVoiceClip[]).filter((v) => v && typeof v.id === 'string')
        : [];
      const rawStagedFiles = Array.isArray(dataObj.stagedFiles)
        ? (dataObj.stagedFiles as StagedOfflineFile[]).filter((f) => f && typeof f.id === 'string')
        : [];
      const rawSos = Array.isArray(dataObj.sosRecords)
        ? (dataObj.sosRecords as WebSosRecord[]).filter((s) => s && typeof s.id === 'string')
        : [];

      const hasRecognizedBackupData =
        root.format === 'freeconnect-full-website-data-backup' ||
        rawContacts.length > 0 ||
        rawMessages.length > 0 ||
        rawGroupRooms.length > 0 ||
        rawFolders.length > 0 ||
        Boolean(dataObj.prefs);

      if (!hasRecognizedBackupData) {
        return {
          ok: false,
          summary: 'This JSON file is not a recognized FreeConnect website backup.',
        };
      }

      // Persist contacts and messages into IndexedDB (merge by id so existing records are preserved/updated)
      for (const contact of rawContacts) {
        await upsertContact(contact);
      }
      for (const message of rawMessages) {
        await saveDirectMessage(message);
      }

      if (rawContacts.length > 0) {
        const mergedContactsMap = new Map<string, ContactRecord>();
        for (const existing of contactsRef.current) mergedContactsMap.set(existing.id, existing);
        for (const incoming of rawContacts) mergedContactsMap.set(incoming.id, incoming);
        setContacts(
          Array.from(mergedContactsMap.values()).sort((a, b) => b.updatedAt - a.updatedAt)
        );
      }

      if (rawMessages.length > 0) {
        const mergedMsgsMap = new Map<string, ContactDirectMessage>();
        for (const existing of messagesRef.current) mergedMsgsMap.set(existing.id, existing);
        for (const incoming of rawMessages) mergedMsgsMap.set(incoming.id, incoming);
        setMessages(Array.from(mergedMsgsMap.values()).sort((a, b) => a.timestamp - b.timestamp));
      }

      if (rawFolders.length > 0) {
        const folderMap = new Map<string, PrivateChatFolder>();
        for (const existing of privateFoldersRef.current) folderMap.set(existing.id, existing);
        for (const incoming of rawFolders) folderMap.set(incoming.id, incoming);
        const mergedFolders = Array.from(folderMap.values());
        setPrivateFolders(mergedFolders);
        await savePrivateFolders(mergedFolders);
      }

      if (rawAssignments) {
        const mergedAssignments: Record<string, PrivateChatAssignment> = {
          ...privateAssignmentsRef.current,
          ...rawAssignments,
        };
        setPrivateAssignments(mergedAssignments);
        await savePrivateAssignments(mergedAssignments);
      }

      if (rawGroupRooms.length > 0) {
        setGroupRooms((prev) => {
          const map = new Map<string, WebGroupRoom>();
          for (const item of prev) map.set(item.id, item);
          for (const item of rawGroupRooms) map.set(item.id, item);
          return Array.from(map.values());
        });
      }

      if (rawGroupMessages.length > 0) {
        setGroupMessages((prev) => {
          const map = new Map<string, WebGroupMessage>();
          for (const item of prev) map.set(item.id, item);
          for (const item of rawGroupMessages) map.set(item.id, item);
          return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
        });
      }

      if (rawVoiceClips.length > 0) {
        setVoiceClips((prev) => {
          const map = new Map<string, LocalVoiceClip>();
          for (const item of prev) map.set(item.id, item);
          for (const item of rawVoiceClips) map.set(item.id, item);
          return Array.from(map.values());
        });
      }

      if (rawStagedFiles.length > 0) {
        setStagedFiles((prev) => {
          const map = new Map<string, StagedOfflineFile>();
          for (const item of prev) map.set(item.id, item);
          for (const item of rawStagedFiles) map.set(item.id, item);
          return Array.from(map.values());
        });
      }

      if (rawSos.length > 0) {
        setSosRecords((prev) => {
          const map = new Map<string, WebSosRecord>();
          for (const item of prev) map.set(item.id, item);
          for (const item of rawSos) map.set(item.id, item);
          return Array.from(map.values());
        });
      }

      if (dataObj.prefs && typeof dataObj.prefs === 'object') {
        const p = dataObj.prefs as Partial<WebsitePreferences>;
        setPrefs((prev) => ({
          themeMode: p.themeMode ?? prev.themeMode,
          language: p.language ?? prev.language,
          wallpaper: p.wallpaper ?? prev.wallpaper,
          textSize: p.textSize ?? prev.textSize,
          soundEnabled: typeof p.soundEnabled === 'boolean' ? p.soundEnabled : prev.soundEnabled,
          notificationsEnabled:
            typeof p.notificationsEnabled === 'boolean'
              ? p.notificationsEnabled
              : prev.notificationsEnabled,
        }));
      }

      return {
        ok: true,
        summary: `Restored ${rawContacts.length} contact(s), ${rawMessages.length} message(s), ${rawGroupRooms.length} group room(s), and ${rawFolders.length} private folder(s).`,
        restoredCounts: {
          contacts: rawContacts.length,
          messages: rawMessages.length,
          groupRooms: rawGroupRooms.length,
          privateFolders: rawFolders.length,
        },
      };
    },
    []
  );

  // Computed real metrics + unified 5-state overall connection status
  const metrics = useMemo(() => {
    const activeContacts = contacts.filter((c) => !c.isBlocked);
    const connectedContactsCount = activeContacts.filter(
      (c) => liveConnections[c.id]?.status === 'connected'
    ).length;
    const pendingMessagesCount = messages.filter(
      (m) => m.deliveryState === 'QUEUED_OFFLINE' || m.deliveryState === 'FAILED'
    ).length;
    const privateChatsCount = activeContacts.filter((c) => isContactPrivate(c.id)).length;

    const anyRequestReceived =
      incomingRequests.length > 0 ||
      Object.values(liveConnections).some((l) => l.status === 'request_received');
    const anyRequestSent = Object.values(liveConnections).some((l) => l.status === 'request_sent');
    const anySearching =
      btScanState === 'searching' ||
      Object.values(liveConnections).some((l) => l.status === 'searching');
    const anyConnecting =
      btScanState === 'connecting' ||
      Object.values(liveConnections).some((l) => l.status === 'connecting');

    const overallStatus: LiveConnectionState = anyRequestReceived
      ? 'request_received'
      : anyRequestSent
        ? 'request_sent'
        : anySearching
          ? 'searching'
          : anyConnecting
            ? 'connecting'
            : connectedContactsCount > 0
              ? 'connected'
              : 'disconnected';

    return {
      totalContacts: activeContacts.length,
      blockedContacts: contacts.filter((c) => c.isBlocked).length,
      nearbyDiscoveredCount: discoveredBtDevices.length + localNearbyPeers.length,
      connectedDevicesCount: connectedContactsCount,
      pendingMessagesCount,
      privateChatsCount,
      incomingRequestsCount: incomingRequests.length,
      totalMessagesCount: messages.length,
      overallStatus,
    };
  }, [
    contacts,
    liveConnections,
    messages,
    discoveredBtDevices,
    localNearbyPeers,
    btScanState,
    incomingRequests.length,
    isContactPrivate,
  ]);

  return {
    contacts,
    messages,
    loading,
    storageEngine,
    capabilities,
    bluetoothRuntime,
    liveConnections,
    discoveredBtDevices,
    nativeNearbyPeers,
    localNearbyPeers,
    incomingRequests,
    incomingToast,
    dismissIncomingToast: () => setIncomingToast(null),
    lastConnectedEvent,
    clearLastConnectedEvent: () => setLastConnectedEvent(null),
    activeCodeSession,
    discoveredCodeHosts,
    pendingCodeApproval,
    codePairingState,
    codePairingMessage,
    btScanState,
    btScanFeedback,
    btScanning: btScanState === 'searching' || btScanState === 'connecting',
    profile,
    prefs,
    pinSecurity,
    privateFolders,
    privateAssignments,
    isContactPrivate,
    groupRooms,
    groupMessages,
    voiceClips,
    stagedFiles,
    sosRecords,
    metrics,
    updatePrefs,
    updateProfile,
    rotateProfileKeys,
    saveContactRecord,
    deleteContactRecord,
    patchContact,
    connectContactBluetooth,
    disconnectContactBluetooth: disconnectContact,
    disconnectAllDevices,
    toggleBluetoothEnabled,
    requestBluetoothPermission,
    refreshBluetoothStatus,
    connectLocalPeer,
    connectNativeDiscoveredPeer,
    scanNearbyWebBluetooth,
    startIphoneDiscovery,
    stopIphoneDiscovery,
    acceptIncomingRequest,
    rejectIncomingRequest,
    generateConnectionCode,
    cancelConnectionCode,
    validateEnteredConnectionCode,
    confirmAndSendCodeRequest,
    cancelPendingCodeApproval,
    createP2pPairingOffer,
    acceptP2pPairingOffer,
    completeP2pPairingAnswer,
    sendDirectMessageToContact,
    retryDirectMessage,
    toggleDirectMessageReaction,
    clearContactConversation,
    clearAllLocalMessages,
    createGroupRoom,
    sendGroupRoomMessage,
    toggleGroupReaction,
    addVoiceClip,
    deleteVoiceClip,
    addStagedFile,
    deleteStagedFile,
    shareFileWithContact,
    dispatchEmergencySos,
    createUserPin,
    verifyUserPin,
    changeUserPin,
    disableUserPin,
    recoverPinWithRecoveryKey,
    recoverPinWithSecurityAnswer,
    createPrivateFolder,
    renamePrivateFolder,
    setFolderLocked,
    deletePrivateFolder,
    lockChatAndMoveToPrivate,
    moveChatToFolder,
    unlockChatToNormal,
    buildLocalWebsiteBackup,
    restoreLocalWebsiteBackup,
  };
}
