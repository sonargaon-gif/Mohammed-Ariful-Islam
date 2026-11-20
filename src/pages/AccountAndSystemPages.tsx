import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  HardDrive,
  History,
  KeyRound,
  Loader2,
  Lock,
  Palette,
  Radio,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  Unlock,
  Upload,
  Volume2,
} from 'lucide-react';
import {
  BluetoothRuntimeStatus,
  BrowserCapabilityReport,
  ContactDirectMessage,
  ContactRecord,
  LiveConnectionState,
  PinSecuritySummary,
  UserProfileRecord,
  WebsitePage,
} from '../types/contacts';
import { ChatWallpaper, TextSizeOption, ThemeMode } from '../types/freeconnect';
import { LanguageCode, TRANSLATIONS } from '../i18n/translations';
import { WebsitePreferences } from '../state/useFreeConnectWebsite';
import { getInitials, resizeAvatarFileToDataUrl } from '../utils/contactQrCodec';
import {
  createServerWebsiteSnapshot,
  downloadServerBackupArchive,
  fetchUserBackendBackup,
  listServerWebsiteBackups,
  ServerBackupArchiveMeta,
} from '../utils/pairingApi';

/* PAGE 14: MESSAGE HISTORY PAGE */
interface MessageHistoryPageProps {
  contacts: ContactRecord[];
  messages: ContactDirectMessage[];
  isContactPrivate?: (contactId: string) => boolean;
  onOpenChat: (contactId: string) => void;
}

export function MessageHistoryPage({
  contacts,
  messages,
  isContactPrivate,
  onOpenChat,
}: MessageHistoryPageProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'SENT_BT' | 'QUEUED' | 'VOICE' | 'FILE' | 'SOS'>('ALL');

  const publicMessages = useMemo(
    () => (isContactPrivate ? messages.filter((m) => !isContactPrivate(m.contactId)) : messages),
    [messages, isContactPrivate]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...publicMessages]
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter((m) => {
        if (
          filter === 'SENT_BT' &&
          m.deliveryState !== 'SENT_OVER_BLUETOOTH' &&
          m.deliveryState !== 'SENT_OVER_P2P' &&
          m.deliveryState !== 'DELIVERED'
        )
          return false;
        if (
          filter === 'QUEUED' &&
          m.deliveryState !== 'QUEUED_OFFLINE' &&
          m.deliveryState !== 'FAILED'
        )
          return false;
        if (filter === 'VOICE' && m.kind !== 'voice') return false;
        if (filter === 'FILE' && m.kind !== 'file') return false;
        if (filter === 'SOS' && m.kind !== 'sos') return false;
        if (!q) return true;
        const cName = contacts.find((c) => c.id === m.contactId)?.name.toLowerCase() ?? '';
        return m.text.toLowerCase().includes(q) || cName.includes(q);
      });
  }, [publicMessages, query, filter, contacts]);

  const exportJson = () => {
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), messages: publicMessages }, null, 2)],
      {
        type: 'application/json',
      }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'freeconnect-local-message-history.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/25 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <History className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
            Message History
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            {messages.length} total message{messages.length === 1 ? '' : 's'} archived locally in browser IndexedDB.
          </p>
        </div>

        <button
          type="button"
          onClick={exportJson}
          className="px-4 h-10 rounded-xl bg-slate-100 dark:bg-[#0B1E3D] border border-slate-300 dark:border-cyan-400/30 text-slate-800 dark:text-cyan-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <Download className="w-4 h-4" /> Export JSON Backup
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['ALL', 'All'],
              ['SENT_BT', 'Delivered / Sent'],
              ['QUEUED', 'Queued / Failed'],
              ['VOICE', 'Voice'],
              ['FILE', 'Files'],
              ['SOS', 'SOS'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                filter === key
                  ? 'bg-[#2563EB] text-white'
                  : 'bg-white dark:bg-[#07152C]/75 border border-slate-200 dark:border-cyan-400/20 text-slate-600 dark:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search archived messages..."
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/25 text-xs text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-[#07152C]/75 border border-slate-200 dark:border-cyan-400/20 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          No archived messages match your filter yet. Start chatting with any contact to populate local history.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((msg) => {
            const peer = contacts.find((c) => c.id === msg.contactId);
            const stateLabel =
              msg.deliveryState === 'DELIVERED'
                ? 'Delivered'
                : msg.deliveryState === 'SENDING'
                  ? 'Sending...'
                  : msg.deliveryState === 'SENT_OVER_BLUETOOTH'
                    ? 'Sent via Bluetooth'
                    : msg.deliveryState === 'SENT_OVER_P2P'
                      ? 'Sent via Offline P2P'
                      : msg.deliveryState === 'FAILED'
                        ? 'Failed to Send'
                        : 'Queued Offline';
            return (
              <button
                key={msg.id}
                type="button"
                onClick={() => onOpenChat(msg.contactId)}
                className="w-full text-left rounded-2xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/20 hover:border-blue-500 dark:hover:border-cyan-300/50 p-4 space-y-1.5 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900 dark:text-white">
                    {msg.isOutgoing ? 'To' : 'From'} {peer?.name ?? msg.senderName ?? 'Saved Contact'} ({peer?.deviceId ?? 'Local'})
                  </span>
                  <span className="font-mono tabular-nums text-slate-400">
                    {new Date(msg.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-200">{msg.text}</p>
                <p className="text-[11px] font-mono text-blue-600 dark:text-cyan-300">
                  {msg.kind?.toUpperCase() ?? 'TEXT'} · {stateLabel}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* PAGE 15: USER PROFILE PAGE */
interface UserProfilePageProps {
  profile: UserProfileRecord;
  onUpdateProfile: (patch: Partial<UserProfileRecord>) => void;
  onRotateKeys: () => Promise<void>;
  onNavigate: (page: WebsitePage) => void;
}

export function UserProfilePage({
  profile,
  onUpdateProfile,
  onRotateKeys,
  onNavigate,
}: UserProfilePageProps) {
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username);
  const [statusNote, setStatusNote] = useState(profile.statusNote);
  const [savedNotice, setSavedNotice] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await resizeAvatarFileToDataUrl(file);
    onUpdateProfile({ avatarDataUrl: dataUrl });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            User Profile & Local Identity
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Zero cloud account or phone number required. Your identity lives strictly inside this browser.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('pairing')}
          className="px-4 h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
        >
          <KeyRound className="w-4 h-4" /> Choose Pairing Code
        </button>
      </div>

      <div className="rounded-3xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/25 p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            {profile.avatarDataUrl ? (
              <img
                src={profile.avatarDataUrl}
                alt={profile.name}
                referrerPolicy="no-referrer"
                className="w-20 h-20 rounded-2xl object-cover border-2 border-cyan-400/50"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#0891B2] flex items-center justify-center text-white text-xl font-bold">
                {getInitials(profile.name)}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-xl bg-[#2563EB] text-white flex items-center justify-center border-2 border-white dark:border-[#07152C] cursor-pointer"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{profile.name}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{profile.username}</p>
            <p className="text-xs font-mono text-blue-600 dark:text-cyan-300 mt-1">
              FreeConnect Device ID: {profile.deviceId}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-sm text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-sm text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
            Offline Status Note
          </label>
          <input
            type="text"
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            className="w-full h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-sm text-slate-900 dark:text-white"
          />
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#050E20] border border-slate-200 dark:border-cyan-400/20 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
              ECDH P-256 Identity Fingerprint
            </p>
            <p className="text-xs font-mono text-blue-600 dark:text-cyan-300 mt-1">
              {profile.fingerprint}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onRotateKeys()}
            className="px-3.5 h-9 rounded-xl border border-slate-300 dark:border-cyan-400/30 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Rotate Keypair
          </button>
        </div>

        <div className="flex items-center justify-between">
          {savedNotice ? (
            <span className="text-xs text-emerald-500 flex items-center gap-1 font-medium">
              <Check className="w-4 h-4" /> Profile saved locally
            </span>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => {
              onUpdateProfile({
                name: name.trim() || profile.name,
                username: username.trim().startsWith('@')
                  ? username.trim()
                  : `@${username.trim() || 'user'}`,
                statusNote: statusNote.trim(),
              });
              setSavedNotice(true);
              setTimeout(() => setSavedNotice(false), 2000);
            }}
            className="px-6 h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold cursor-pointer"
          >
            Save Profile
          </button>
        </div>
      </div>
    </div>
  );
}

/* PAGE 16: SETTINGS PAGE */
interface SettingsPageProps {
  prefs: WebsitePreferences;
  capabilities: BrowserCapabilityReport;
  bluetoothRuntime: BluetoothRuntimeStatus;
  overallConnectionStatus: LiveConnectionState;
  connectedDevicesCount: number;
  storageEngine: 'IndexedDB' | 'localStorage';
  contactsCount: number;
  messagesCount: number;
  onToggleBluetooth: (enabled: boolean) => Promise<{ ok: boolean; message: string }>;
  onRequestBluetoothPermission: () => Promise<{ ok: boolean; message: string }>;
  onRefreshBluetoothStatus: () => Promise<{ ok: boolean; message: string }>;
  onUpdatePrefs: (patch: Partial<WebsitePreferences>) => void;
  onBuildLocalBackup: () => Record<string, unknown>;
  onRestoreLocalBackup: (payload: unknown) => Promise<{ ok: boolean; summary: string }>;
  onNavigate: (page: WebsitePage) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function SettingsPage({
  prefs,
  capabilities,
  bluetoothRuntime,
  overallConnectionStatus,
  connectedDevicesCount,
  storageEngine,
  contactsCount,
  messagesCount,
  onToggleBluetooth,
  onRequestBluetoothPermission,
  onRefreshBluetoothStatus,
  onUpdatePrefs,
  onBuildLocalBackup,
  onRestoreLocalBackup,
  onNavigate,
}: SettingsPageProps) {
  const [btBusy, setBtBusy] = useState(false);
  const [btNotice, setBtNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Full Website Backup & Restore state
  const [serverBackups, setServerBackups] = useState<ServerBackupArchiveMeta[]>([]);
  const [backupLoadingList, setBackupLoadingList] = useState(false);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [dataExportBusy, setDataExportBusy] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [backupNotice, setBackupNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const restoreFileInputRef = useRef<HTMLInputElement | null>(null);

  const loadServerBackups = async () => {
    setBackupLoadingList(true);
    try {
      const res = await listServerWebsiteBackups();
      setServerBackups(res.backups);
    } catch {
      // User may be offline or session not yet synced; keep existing list
    } finally {
      setBackupLoadingList(false);
    }
  };

  useEffect(() => {
    void loadServerBackups();
  }, []);

  const handleCreateFullWebsiteSnapshot = async () => {
    setSnapshotBusy(true);
    setBackupNotice(null);
    try {
      const res = await createServerWebsiteSnapshot();
      setServerBackups(res.backups);
      setBackupNotice({
        ok: true,
        text: `Full website archive created: ${res.backup.filename} (${formatBytes(res.backup.sizeBytes)}).`,
      });
    } catch (err) {
      setBackupNotice({
        ok: false,
        text: err instanceof Error ? err.message : 'Unable to create full website backup archive.',
      });
    } finally {
      setSnapshotBusy(false);
    }
  };

  const handleDownloadServerArchive = async (filename: string) => {
    setDownloadingFile(filename);
    setBackupNotice(null);
    try {
      await downloadServerBackupArchive(filename);
      setBackupNotice({
        ok: true,
        text: `Downloaded ${filename} to your device.`,
      });
    } catch (err) {
      setBackupNotice({
        ok: false,
        text: err instanceof Error ? err.message : 'Download failed.',
      });
    } finally {
      setDownloadingFile(null);
    }
  };

  const handleExportCompleteDataJson = async () => {
    setDataExportBusy(true);
    setBackupNotice(null);
    try {
      const localSnapshot = onBuildLocalBackup();
      let backendAccountData: unknown = null;
      try {
        const res = await fetchUserBackendBackup();
        backendAccountData = res.backup;
      } catch {
        backendAccountData = null;
      }

      const combined = {
        ...localSnapshot,
        backendAccountData,
      };

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `freeconnect-data-backup-${stamp}.json`;
      const blob = new Blob([JSON.stringify(combined, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setBackupNotice({
        ok: true,
        text: `Downloaded complete website data backup (${filename}).`,
      });
    } catch (err) {
      setBackupNotice({
        ok: false,
        text: err instanceof Error ? err.message : 'Unable to export website data.',
      });
    } finally {
      setDataExportBusy(false);
    }
  };

  const handleRestoreBackupFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setRestoreBusy(true);
    setBackupNotice(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const res = await onRestoreLocalBackup(parsed);
      setBackupNotice({ ok: res.ok, text: res.summary });
    } catch (err) {
      setBackupNotice({
        ok: false,
        text:
          err instanceof Error
            ? `Restore failed: ${err.message}`
            : 'Unable to parse the selected JSON backup file.',
      });
    } finally {
      setRestoreBusy(false);
    }
  };

  const handleToggleBluetooth = async () => {
    setBtBusy(true);
    setBtNotice(null);
    try {
      const res = await onToggleBluetooth(!bluetoothRuntime.enabled);
      setBtNotice({ ok: res.ok, text: res.message });
    } catch (err) {
      setBtNotice({
        ok: false,
        text: err instanceof Error ? err.message : 'Unable to toggle Bluetooth right now.',
      });
    } finally {
      setBtBusy(false);
    }
  };

  const handleRequestPermission = async () => {
    setBtBusy(true);
    setBtNotice(null);
    try {
      const res = await onRequestBluetoothPermission();
      setBtNotice({ ok: res.ok, text: res.message });
    } catch (err) {
      setBtNotice({
        ok: false,
        text: err instanceof Error ? err.message : 'Unable to request Bluetooth permission.',
      });
    } finally {
      setBtBusy(false);
    }
  };

  const handleRefreshBluetooth = async () => {
    setBtBusy(true);
    setBtNotice(null);
    try {
      const res = await onRefreshBluetoothStatus();
      setBtNotice({ ok: res.ok, text: res.message });
    } finally {
      setBtBusy(false);
    }
  };

  const btConnectionStatusLabel =
    overallConnectionStatus === 'connected'
      ? `Connected (${connectedDevicesCount} active)`
      : overallConnectionStatus === 'searching'
        ? 'Scanning for Nearby Devices'
        : overallConnectionStatus === 'connecting'
          ? 'Connecting...'
          : overallConnectionStatus === 'request_received'
            ? 'Connection Request Pending'
            : overallConnectionStatus === 'request_sent'
              ? 'Request Sent · Awaiting Approval'
              : bluetoothRuntime.enabled
                ? 'Enabled · Ready to Scan'
                : 'Disabled';

  const visibilityLabel =
    bluetoothRuntime.visibilityState === 'discoverable'
      ? 'Discoverable to nearby FreeConnect devices'
      : bluetoothRuntime.visibilityState === 'central_only'
        ? 'Central Mode Only (browsers can scan/connect, not advertise as a BLE peripheral)'
        : bluetoothRuntime.visibilityState === 'unsupported'
          ? 'Unavailable in this browser (requires native iOS/Android build)'
          : 'Hidden (Bluetooth is turned OFF)';

  const permissionLabel =
    bluetoothRuntime.permissionState === 'granted'
      ? 'Granted'
      : bluetoothRuntime.permissionState === 'prompt'
        ? 'Permission Required'
        : bluetoothRuntime.permissionState === 'denied'
          ? 'Denied'
          : bluetoothRuntime.permissionState === 'iframe_blocked'
            ? 'Blocked in Embedded Frame'
            : 'Not Supported in Browser';

  const currentPageHref = typeof window !== 'undefined' ? window.location.href : '/';
  const isIframeBlocked = bluetoothRuntime.permissionState === 'iframe_blocked';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Settings &amp; Customization
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          Manage real Bluetooth hardware settings, permissions, appearance, and local preferences.
        </p>
      </div>

      {/* BLUETOOTH SETTINGS SECTION */}
      <section
        aria-label="Bluetooth Settings"
        className="rounded-3xl bg-[#06152E] text-white border border-[#168BFF]/35 p-6 space-y-5 shadow-[0_18px_50px_rgba(6,21,46,0.45)]"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#168BFF] to-[#38D9FF] flex items-center justify-center shrink-0 shadow-[0_0_24px_rgba(22,139,255,0.45)]">
              {bluetoothRuntime.enabled ? (
                overallConnectionStatus === 'connected' ? (
                  <BluetoothConnected className="w-5 h-5 text-white" />
                ) : (
                  <Bluetooth className="w-5 h-5 text-white" />
                )
              ) : (
                <BluetoothOff className="w-5 h-5 text-white" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-white tracking-tight">
                Bluetooth Settings
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {bluetoothRuntime.enabled
                  ? 'Bluetooth is enabled via supported platform APIs.'
                  : 'Bluetooth is disabled. Turn ON to check real hardware availability and enable scanning.'}
              </p>
            </div>
          </div>

          {/* Real Bluetooth ON/OFF Switch + Explicit Toggle Button */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              disabled={btBusy}
              onClick={() => void handleToggleBluetooth()}
              className={`px-3.5 h-9 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60 ${
                bluetoothRuntime.enabled
                  ? 'bg-[#123B68] border-[#38D9FF]/50 text-[#38D9FF] hover:bg-[#194c84]'
                  : 'bg-gradient-to-r from-[#168BFF] to-[#38D9FF] border-transparent text-[#041024] hover:brightness-110'
              }`}
            >
              {btBusy
                ? 'Checking...'
                : bluetoothRuntime.enabled
                  ? 'Turn OFF'
                  : 'Turn ON'}
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={bluetoothRuntime.enabled}
              aria-label="Toggle Bluetooth ON or OFF"
              disabled={btBusy}
              onClick={() => void handleToggleBluetooth()}
              className={`relative w-14 h-8 rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38D9FF] cursor-pointer disabled:opacity-60 ${
                bluetoothRuntime.enabled
                  ? 'bg-gradient-to-r from-[#168BFF] to-[#38D9FF]'
                  : 'bg-[#123B68] border border-white/20'
              }`}
            >
              <span
                className={`block w-6 h-6 rounded-full bg-white shadow transition-transform duration-200 ${
                  bluetoothRuntime.enabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Live Status Rows (Unboxed clean typographic grid, zero pill clutter) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[#123B68]">
          <div className="space-y-1">
            <p className="text-xs text-slate-400">Bluetooth Power</p>
            <p className="text-sm font-bold text-white">
              {bluetoothRuntime.enabled ? 'Enabled' : 'Disabled'}
            </p>
            <p className="text-xs text-slate-300">
              Adapter:{' '}
              {bluetoothRuntime.hardwareAvailable === true
                ? 'Detected'
                : bluetoothRuntime.hardwareAvailable === false
                  ? 'Unavailable / Off'
                  : 'Requires permission check'}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-slate-400">Connection Status</p>
            <p className="text-sm font-bold text-[#38D9FF]">{btConnectionStatusLabel}</p>
            <p className="text-xs text-slate-300">Permission: {permissionLabel}</p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              {bluetoothRuntime.visibilityState === 'discoverable' ? (
                <Eye className="w-3.5 h-3.5 text-[#38D9FF]" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
              )}
              Device Visibility
            </p>
            <p className="text-xs font-medium text-slate-200 leading-relaxed">{visibilityLabel}</p>
          </div>
        </div>

        {/* Permission Requirement Explanation */}
        <div className="rounded-2xl bg-[#0A1F40] border border-[#123B68] p-4 space-y-2">
          <p className="text-xs font-bold text-[#38D9FF] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            Bluetooth Permission &amp; Platform Requirement
          </p>
          <p className="text-xs text-slate-200 leading-relaxed">
            {bluetoothRuntime.permissionExplanation}
          </p>
          <p className="text-xs text-slate-300 leading-relaxed">
            Live status: <span className="text-white">{bluetoothRuntime.statusMessage}</span>
          </p>
        </div>

        {btNotice && (
          <div
            role="status"
            className={`rounded-xl px-4 py-3 border text-xs flex items-start gap-2 ${
              btNotice.ok
                ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                : 'bg-amber-500/15 border-amber-400/40 text-amber-100'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-2 flex-1">
              <p className="leading-relaxed">{btNotice.text}</p>
              {(isIframeBlocked || capabilities.isEmbeddedIframe) && !btNotice.ok && (
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

        {/* Real Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            disabled={btBusy}
            onClick={() => void handleRequestPermission()}
            className="px-4 h-10 rounded-xl bg-gradient-to-r from-[#168BFF] to-[#38D9FF] hover:brightness-110 disabled:opacity-60 text-[#041024] text-xs font-extrabold flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            {btBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Shield className="w-4 h-4" />
            )}
            Request Bluetooth Permission
          </button>

          <button
            type="button"
            disabled={btBusy}
            onClick={() => void handleRefreshBluetooth()}
            className="px-3.5 h-10 rounded-xl bg-[#0A1F40] hover:bg-[#123B68] border border-[#168BFF]/40 text-slate-100 text-xs font-semibold flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#38D9FF] ${btBusy ? 'animate-spin' : ''}`} />
            Recheck Adapter
          </button>

          {(isIframeBlocked || capabilities.isEmbeddedIframe) && (
            <a
              href={currentPageHref}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 h-10 rounded-xl bg-[#123B68] hover:bg-[#194c84] border border-[#38D9FF]/45 text-[#38D9FF] text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Full Tab
            </a>
          )}

          <button
            type="button"
            onClick={() => onNavigate('nearby')}
            className="px-4 h-10 rounded-xl bg-[#123B68] hover:bg-[#194c84] border border-[#38D9FF]/30 text-white text-xs font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Radio className="w-4 h-4 text-[#38D9FF]" />
            Open Nearby Devices Connectivity
          </button>
        </div>
      </section>

      {/* Theme, Wallpaper, Text Size */}
      <div className="rounded-3xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/25 p-6 space-y-5">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Palette className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
          Theme &amp; Typography
        </h2>

        <div className="space-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">Website Color Theme</p>
          <div className="grid grid-cols-3 gap-2.5">
            {(['dark', 'light', 'auto'] as ThemeMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onUpdatePrefs({ themeMode: mode })}
                className={`h-10 rounded-xl text-xs font-semibold capitalize border cursor-pointer ${
                  prefs.themeMode === mode
                    ? 'bg-gradient-to-r from-[#2563EB] to-[#0891B2] text-white border-cyan-300'
                    : 'border-slate-300 dark:border-cyan-400/20 text-slate-700 dark:text-slate-300'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">Chat Background Style</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['futuristic', 'midnight', 'arctic', 'minimal'] as ChatWallpaper[]).map((wp) => (
              <button
                key={wp}
                type="button"
                onClick={() => onUpdatePrefs({ wallpaper: wp })}
                className={`h-9 rounded-xl text-xs font-medium capitalize border cursor-pointer ${
                  prefs.wallpaper === wp
                    ? 'bg-blue-600/20 border-cyan-400 text-blue-700 dark:text-cyan-300 font-semibold'
                    : 'border-slate-300 dark:border-cyan-400/20 text-slate-600 dark:text-slate-300'
                }`}
              >
                {wp}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">Message Text Size</p>
          <div className="grid grid-cols-3 gap-2.5">
            {(
              [
                ['sm', 'Small'],
                ['md', 'Normal'],
                ['lg', 'Large'],
              ] as [TextSizeOption, string][]
            ).map(([sz, label]) => (
              <button
                key={sz}
                type="button"
                onClick={() => onUpdatePrefs({ textSize: sz })}
                className={`h-9 rounded-xl text-xs font-medium border cursor-pointer ${
                  prefs.textSize === sz
                    ? 'bg-blue-600/20 border-cyan-400 text-blue-700 dark:text-cyan-300 font-semibold'
                    : 'border-slate-300 dark:border-cyan-400/20 text-slate-600 dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Audio & Navigation Shortcuts */}
      <div className="rounded-3xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/25 divide-y divide-slate-200 dark:divide-cyan-400/15 overflow-hidden">
        <div className="p-5 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2.5">
            <Volume2 className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
            Message Sound & Alerts
          </span>
          <button
            type="button"
            onClick={() => onUpdatePrefs({ soundEnabled: !prefs.soundEnabled })}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
              prefs.soundEnabled
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            {prefs.soundEnabled ? 'Enabled' : 'Muted'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('privacy')}
          className="w-full p-5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#0B1E3D]/60 text-left cursor-pointer"
        >
          <span className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
            Privacy & Security (App PIN, Chat Locks, Data Wipe)
          </span>
          <span className="text-xs text-blue-600 dark:text-cyan-300">Open →</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('language')}
          className="w-full p-5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#0B1E3D]/60 text-left cursor-pointer"
        >
          <span className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2.5">
            <Globe className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
            Language Selection ({TRANSLATIONS[prefs.language].nativeLabel})
          </span>
          <span className="text-xs text-blue-600 dark:text-cyan-300">Change →</span>
        </button>

        <div className="p-5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
          <span>Local Persistence ({storageEngine})</span>
          <span>
            {contactsCount} contacts · {messagesCount} messages
          </span>
        </div>
      </div>

      {/* FULL WEBSITE BACKUP & RESTORE SECTION */}
      <section
        aria-label="Full Website Backup and Restore"
        className="rounded-3xl bg-white dark:bg-[#07152C]/90 border border-slate-200 dark:border-cyan-400/25 p-6 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#0EA5E9] to-[#10B981] flex items-center justify-center shrink-0">
              <Archive className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                Full Website Backup &amp; Restore
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                Create complete server snapshots (web app, backend, mobile companions, and SQLite
                database) or export and restore all your contacts, chats, private folders, and
                account data.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={backupLoadingList}
            onClick={() => void loadServerBackups()}
            className="px-3 h-9 rounded-xl border border-slate-300 dark:border-cyan-400/25 text-slate-700 dark:text-cyan-200 hover:bg-slate-50 dark:hover:bg-[#0B1E3D] text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${backupLoadingList ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Action Grid: Full Website Archive vs Portable JSON Data Backup & Restore */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            disabled={snapshotBusy}
            onClick={() => void handleCreateFullWebsiteSnapshot()}
            className="h-11 px-4 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#0891B2] hover:brightness-110 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            {snapshotBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <HardDrive className="w-4 h-4" />
            )}
            {snapshotBusy ? 'Archiving...' : 'Backup Full Website (.tar.gz)'}
          </button>

          <button
            type="button"
            disabled={dataExportBusy}
            onClick={() => void handleExportCompleteDataJson()}
            className="h-11 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            {dataExportBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            {dataExportBusy ? 'Exporting...' : 'Export All Data (.json)'}
          </button>

          <button
            type="button"
            disabled={restoreBusy}
            onClick={() => restoreFileInputRef.current?.click()}
            className="h-11 px-4 rounded-xl border border-slate-300 dark:border-cyan-400/35 text-slate-800 dark:text-cyan-100 hover:bg-slate-50 dark:hover:bg-[#0B1E3D] disabled:opacity-60 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            {restoreBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {restoreBusy ? 'Restoring...' : 'Restore Data (.json)'}
          </button>
          <input
            ref={restoreFileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => void handleRestoreBackupFile(e)}
            className="hidden"
          />
        </div>

        {backupNotice && (
          <div
            role="status"
            className={`rounded-xl px-4 py-3 border text-xs flex items-start gap-2 ${
              backupNotice.ok
                ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-700 dark:text-emerald-200'
                : 'bg-amber-500/10 border-amber-500/35 text-amber-800 dark:text-amber-200'
            }`}
          >
            {backupNotice.ok ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <p className="leading-relaxed">{backupNotice.text}</p>
          </div>
        )}

        {/* Saved Server Full-Website Archives */}
        <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-cyan-400/15">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800 dark:text-slate-100">
              Saved Full Website Archives ({serverBackups.length})
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              Includes web source, server, native apps &amp; SQLite DB
            </span>
          </div>

          {serverBackups.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
              No server backup archives yet. Click &ldquo;Backup Full Website (.tar.gz)&rdquo; above
              to generate a complete compressed backup archive.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-cyan-400/15 rounded-2xl border border-slate-200 dark:border-cyan-400/20 overflow-hidden">
              {serverBackups.map((item) => (
                <div
                  key={item.filename}
                  className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-[#051022]/60"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-semibold text-slate-900 dark:text-white truncate">
                      {item.filename}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {formatBytes(item.sizeBytes)} ·{' '}
                      {new Date(item.createdAt).toLocaleString()} · SHA256: {item.checksumShort}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={downloadingFile === item.filename}
                    onClick={() => void handleDownloadServerArchive(item.filename)}
                    className="px-3.5 h-8 rounded-lg bg-[#168BFF] hover:brightness-110 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {downloadingFile === item.filename ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    Download
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* PAGE 17: PRIVACY & SECURITY PAGE (PBKDF2-SHA256 PIN SECURITY IN INDEXEDDB) */
interface PrivacySecurityPageProps {
  pinSecurity: PinSecuritySummary;
  privateChatsCount: number;
  privateFoldersCount: number;
  onCreatePin: (params: {
    pin: string;
    securityQuestion?: string;
    securityAnswer?: string;
  }) => Promise<{ recoveryKey: string }>;
  onChangePin: (currentPin: string, newPin: string) => Promise<{ ok: boolean; error?: string }>;
  onDisablePin: (currentPin: string) => Promise<{ ok: boolean; error?: string }>;
  onRecoverWithKey: (
    recoveryKey: string,
    newPin: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onRecoverWithAnswer: (
    answer: string,
    newPin: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onLockNow: () => void;
  onOpenPrivateChats: () => void;
  onClearAllMessages: () => Promise<void>;
}

const DEFAULT_SECURITY_QUESTIONS = [
  'What is the name of your first school?',
  'What city were you born in?',
  'What was the name of your first pet?',
  'What is your favorite childhood book?',
];

export function PrivacySecurityPage({
  pinSecurity,
  privateChatsCount,
  privateFoldersCount,
  onCreatePin,
  onChangePin,
  onDisablePin,
  onRecoverWithKey,
  onRecoverWithAnswer,
  onLockNow,
  onOpenPrivateChats,
  onClearAllMessages,
}: PrivacySecurityPageProps) {
  const [activeTab, setActiveTab] = useState<'manage' | 'change' | 'disable' | 'recover'>('manage');

  // Create PIN state
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [secQuestion, setSecQuestion] = useState(DEFAULT_SECURITY_QUESTIONS[0]);
  const [secAnswer, setSecAnswer] = useState('');
  const [issuedRecoveryKey, setIssuedRecoveryKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Change PIN state
  const [currentPinForChange, setCurrentPinForChange] = useState('');
  const [nextPinForChange, setNextPinForChange] = useState('');
  const [confirmNextPin, setConfirmNextPin] = useState('');

  // Disable PIN state
  const [currentPinForDisable, setCurrentPinForDisable] = useState('');

  // Forgot PIN Recovery state
  const [recoveryMethod, setRecoveryMethod] = useState<'key' | 'question'>('key');
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [recoveryAnswerInput, setRecoveryAnswerInput] = useState('');
  const [recoveryNewPin, setRecoveryNewPin] = useState('');
  const [recoveryConfirmPin, setRecoveryConfirmPin] = useState('');

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  const resetMessages = () => {
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const handleCreatePin = async (e: FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (!/^\d{4,8}$/.test(newPin)) {
      setErrorMessage('PIN must be 4 to 8 numeric digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setErrorMessage('Confirm PIN does not match.');
      return;
    }
    setBusy(true);
    try {
      const { recoveryKey } = await onCreatePin({
        pin: newPin,
        securityQuestion: secAnswer.trim() ? secQuestion : undefined,
        securityAnswer: secAnswer.trim() || undefined,
      });
      setIssuedRecoveryKey(recoveryKey);
      setNewPin('');
      setConfirmPin('');
      setSecAnswer('');
      setStatusMessage(
        'Personal PIN created and hashed with PBKDF2-SHA256 in IndexedDB. Save your offline Recovery Key below.'
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to create PIN.');
    } finally {
      setBusy(false);
    }
  };

  const handleChangePin = async (e: FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (!/^\d{4,8}$/.test(nextPinForChange)) {
      setErrorMessage('New PIN must be 4 to 8 numeric digits.');
      return;
    }
    if (nextPinForChange !== confirmNextPin) {
      setErrorMessage('Confirm new PIN does not match.');
      return;
    }
    setBusy(true);
    const res = await onChangePin(currentPinForChange, nextPinForChange);
    setBusy(false);
    if (!res.ok) {
      setErrorMessage(res.error ?? 'Failed to change PIN.');
      return;
    }
    setCurrentPinForChange('');
    setNextPinForChange('');
    setConfirmNextPin('');
    setStatusMessage('PIN updated successfully with a fresh cryptographic salt.');
  };

  const handleDisablePin = async (e: FormEvent) => {
    e.preventDefault();
    resetMessages();
    setBusy(true);
    const res = await onDisablePin(currentPinForDisable);
    setBusy(false);
    if (!res.ok) {
      setErrorMessage(res.error ?? 'Incorrect current PIN.');
      return;
    }
    setCurrentPinForDisable('');
    setIssuedRecoveryKey(null);
    setActiveTab('manage');
    setStatusMessage('PIN disabled and hash removed from IndexedDB.');
  };

  const handleRecoverPin = async (e: FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (!/^\d{4,8}$/.test(recoveryNewPin)) {
      setErrorMessage('New PIN must be 4 to 8 numeric digits.');
      return;
    }
    if (recoveryNewPin !== recoveryConfirmPin) {
      setErrorMessage('Confirm new PIN does not match.');
      return;
    }
    setBusy(true);
    const res =
      recoveryMethod === 'key'
        ? await onRecoverWithKey(recoveryKeyInput, recoveryNewPin)
        : await onRecoverWithAnswer(recoveryAnswerInput, recoveryNewPin);
    setBusy(false);
    if (!res.ok) {
      setErrorMessage(res.error ?? 'Recovery verification failed.');
      return;
    }
    setRecoveryKeyInput('');
    setRecoveryAnswerInput('');
    setRecoveryNewPin('');
    setRecoveryConfirmPin('');
    setStatusMessage('PIN recovered and reset successfully. Your private chats remain intact.');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
            Privacy &amp; Security
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            PBKDF2-SHA256 (150,000 iterations) PIN protection stored strictly in IndexedDB — never
            plain-text and never stored in localStorage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenPrivateChats}
            className="px-4 h-10 rounded-xl border border-slate-300 dark:border-cyan-400/30 text-slate-700 dark:text-cyan-200 text-xs font-semibold cursor-pointer"
          >
            Private Chats ({privateChatsCount})
          </button>
          {pinSecurity.hasPin && (
            <button
              type="button"
              onClick={onLockNow}
              className="px-4 h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" /> Lock App Now
            </button>
          )}
        </div>
      </div>

      {/* STATUS & ERROR BANNERS */}
      {statusMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-400/40 text-xs text-emerald-700 dark:text-emerald-200 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-400/40 text-xs text-red-600 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {/* ONE-TIME RECOVERY KEY CARD AFTER CREATION */}
      {issuedRecoveryKey && (
        <div className="rounded-3xl bg-amber-500/10 border border-amber-400/45 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-extrabold text-amber-800 dark:text-amber-200 flex items-center gap-2">
              <KeyRound className="w-4 h-4" /> Save Your Offline Recovery Key
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(issuedRecoveryKey);
                  setCopiedKey(true);
                  setTimeout(() => setCopiedKey(false), 1800);
                } catch {
                  // Ignore
                }
              }}
              className="px-3 h-8 rounded-lg bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedKey ? 'Copied' : 'Copy Key'}
            </button>
          </div>
          <p className="font-mono text-lg font-extrabold tracking-widest text-slate-900 dark:text-white bg-white/80 dark:bg-[#040C1C] px-4 py-3 rounded-xl border border-amber-400/40 text-center">
            {issuedRecoveryKey}
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-200/90">
            Write this key down offline. Only its PBKDF2 hash is stored on your device — if you ever
            forget your PIN, this key lets you reset your PIN without losing your Private Chats.
          </p>
        </div>
      )}

      {/* MAIN PIN MANAGEMENT PANEL */}
      <div className="rounded-3xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/25 p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
              Personal PIN Security ({pinSecurity.hasPin ? 'Active · PBKDF2-SHA256' : 'Not Set'})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Protects Private Chats ({privateChatsCount} chats, {privateFoldersCount} folders) and
              workspace lock.
            </p>
          </div>

          {pinSecurity.hasPin && (
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['change', 'Change PIN'],
                  ['disable', 'Disable PIN'],
                  ['recover', 'Forgot PIN'],
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    resetMessages();
                    setActiveTab(tab);
                  }}
                  className={`px-3 h-8 rounded-lg text-xs font-bold cursor-pointer ${
                    activeTab === tab
                      ? 'bg-[#2563EB] text-white'
                      : 'bg-slate-100 dark:bg-[#0B1E3D] text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 1. CREATE & CONFIRM PIN (WHEN NO PIN EXISTS) */}
        {!pinSecurity.hasPin ? (
          <form onSubmit={handleCreatePin} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  Create PIN (4–8 digits)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 4–8 digit PIN"
                  className="w-full h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 font-mono text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  Confirm PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Re-enter PIN"
                  className="w-full h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 font-mono text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#040C1C] border border-slate-200 dark:border-cyan-400/20 space-y-3">
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                Optional Security Question (Additional Forgot-PIN Recovery Option)
              </p>
              <select
                value={secQuestion}
                onChange={(e) => setSecQuestion(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#07152C] border border-slate-300 dark:border-cyan-400/25 text-xs text-slate-900 dark:text-white"
              >
                {DEFAULT_SECURITY_QUESTIONS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={secAnswer}
                onChange={(e) => setSecAnswer(e.target.value)}
                placeholder="Your secret answer (hashed with PBKDF2-SHA256, never stored plain-text)"
                className="w-full h-10 px-3.5 rounded-xl bg-white dark:bg-[#07152C] border border-slate-300 dark:border-cyan-400/25 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={busy || newPin.length < 4 || confirmPin.length < 4}
              className="px-6 h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'Hashing PIN...' : 'Create PIN & Generate Recovery Key'}
            </button>
          </form>
        ) : activeTab === 'change' || activeTab === 'manage' ? (
          /* 2. CHANGE PIN */
          <form onSubmit={handleChangePin} className="space-y-4">
            <p className="text-xs font-bold text-slate-800 dark:text-cyan-200">Change Personal PIN</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={currentPinForChange}
                onChange={(e) => setCurrentPinForChange(e.target.value.replace(/\D/g, ''))}
                placeholder="Current PIN"
                className="h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 font-mono text-sm text-slate-900 dark:text-white"
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={nextPinForChange}
                onChange={(e) => setNextPinForChange(e.target.value.replace(/\D/g, ''))}
                placeholder="New PIN (4–8 digits)"
                className="h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 font-mono text-sm text-slate-900 dark:text-white"
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={confirmNextPin}
                onChange={(e) => setConfirmNextPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Confirm New PIN"
                className="h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 font-mono text-sm text-slate-900 dark:text-white"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !currentPinForChange || nextPinForChange.length < 4}
              className="px-5 h-10 rounded-xl bg-[#2563EB] text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'Updating...' : 'Change PIN'}
            </button>
          </form>
        ) : activeTab === 'disable' ? (
          /* 3. DISABLE PIN */
          <form onSubmit={handleDisablePin} className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Enter your current PIN to disable PIN protection. Your folders and messages stay safe
              locally, but locked folders and Private Chats will no longer require a PIN.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={currentPinForDisable}
                onChange={(e) => setCurrentPinForDisable(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter Current PIN"
                className="flex-1 min-w-[200px] h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 font-mono text-sm text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                disabled={busy || !currentPinForDisable}
                className="px-5 h-10 rounded-xl bg-red-600 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                <Unlock className="w-3.5 h-3.5" /> Disable PIN
              </button>
            </div>
          </form>
        ) : (
          /* 4. FORGOT PIN RECOVERY */
          <form onSubmit={handleRecoverPin} className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setRecoveryMethod('key')}
                className={`px-3.5 h-9 rounded-xl text-xs font-bold cursor-pointer ${
                  recoveryMethod === 'key'
                    ? 'bg-[#2563EB] text-white'
                    : 'bg-slate-100 dark:bg-[#0B1E3D] text-slate-700 dark:text-slate-200'
                }`}
              >
                Use Offline Recovery Key
              </button>
              {pinSecurity.hasSecurityQuestion && (
                <button
                  type="button"
                  onClick={() => setRecoveryMethod('question')}
                  className={`px-3.5 h-9 rounded-xl text-xs font-bold cursor-pointer ${
                    recoveryMethod === 'question'
                      ? 'bg-[#2563EB] text-white'
                      : 'bg-slate-100 dark:bg-[#0B1E3D] text-slate-700 dark:text-slate-200'
                  }`}
                >
                  Answer Security Question
                </button>
              )}
            </div>

            {recoveryMethod === 'key' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  Offline Recovery Key (XXXX-XXXX-XXXX-XXXX)
                </label>
                <input
                  type="text"
                  value={recoveryKeyInput}
                  onChange={(e) => setRecoveryKeyInput(e.target.value)}
                  placeholder="Enter your saved 16-character Recovery Key"
                  className="w-full h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 font-mono text-sm text-slate-900 dark:text-white"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-blue-700 dark:text-cyan-300">
                  Question: {pinSecurity.securityQuestion}
                </p>
                <input
                  type="text"
                  value={recoveryAnswerInput}
                  onChange={(e) => setRecoveryAnswerInput(e.target.value)}
                  placeholder="Enter your secret answer"
                  className="w-full h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-sm text-slate-900 dark:text-white"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={recoveryNewPin}
                onChange={(e) => setRecoveryNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="New PIN (4–8 digits)"
                className="h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 font-mono text-sm text-slate-900 dark:text-white"
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={recoveryConfirmPin}
                onChange={(e) => setRecoveryConfirmPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Confirm New PIN"
                className="h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 font-mono text-sm text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={busy || recoveryNewPin.length < 4}
              className="px-5 h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'Verifying...' : 'Verify & Reset PIN'}
            </button>
          </form>
        )}
      </div>

      {/* SECURITY GUARANTEES CARD */}
      <div className="rounded-3xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/25 p-5 space-y-2 text-xs text-slate-600 dark:text-slate-300">
        <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          Private Chat Privacy Protections Active
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>PINs are salted and hashed via Web Crypto PBKDF2-SHA256 (150,000 rounds) inside IndexedDB — never plain-text and never written to localStorage.</li>
          <li>Locked chats and chats inside locked folders are hidden from Normal Chats and Message History.</li>
          <li>Incoming notifications for locked/private chats mask the sender and message text preview automatically.</li>
        </ul>
      </div>

      {/* Delete All Local Messages */}
      <div className="rounded-3xl bg-white dark:bg-[#07152C]/80 border border-red-300 dark:border-red-400/35 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-red-600 dark:text-red-300">
            Clear All Local Chat History
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Permanently deletes all direct messages stored in browser IndexedDB (saved contacts and
            folders remain intact).
          </p>
        </div>

        {confirmWipe ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void onClearAllMessages();
                setConfirmWipe(false);
              }}
              className="px-4 h-9 rounded-xl bg-red-600 text-white text-xs font-bold cursor-pointer"
            >
              Confirm Clear All
            </button>
            <button
              type="button"
              onClick={() => setConfirmWipe(false)}
              className="px-3 h-9 text-xs text-slate-500 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmWipe(true)}
            className="px-4 h-10 rounded-xl bg-red-600/15 border border-red-400/45 text-red-600 dark:text-red-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" /> Clear All Messages
          </button>
        )}
      </div>
    </div>
  );
}

/* PAGE 18: LANGUAGE SELECTION PAGE */
interface LanguageSelectionPageProps {
  currentLanguage: LanguageCode;
  onSelectLanguage: (code: LanguageCode) => void;
}

export function LanguageSelectionPage({
  currentLanguage,
  onSelectLanguage,
}: LanguageSelectionPageProps) {
  const activeBundle = TRANSLATIONS[currentLanguage];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <Globe className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
          Language Selection
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          Choose your preferred interface language. Arabic automatically enables right-to-left (RTL) layout across the entire website.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(Object.keys(TRANSLATIONS) as LanguageCode[]).map((code) => {
          const item = TRANSLATIONS[code];
          const selected = currentLanguage === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => onSelectLanguage(code)}
              className={`text-left rounded-3xl p-5 border transition-all cursor-pointer ${
                selected
                  ? 'bg-blue-50 dark:bg-[#0D2347] border-blue-500 dark:border-cyan-300 shadow-[0_0_24px_rgba(37,99,235,0.2)]'
                  : 'bg-white dark:bg-[#07152C]/75 border-slate-200 dark:border-cyan-400/20 hover:border-blue-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-slate-900 dark:text-white">
                  {item.nativeLabel}
                </span>
                <span className="text-xs font-mono text-blue-600 dark:text-cyan-300">
                  {item.rtl ? 'RTL' : 'LTR'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
                {item.offlineMessenger}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{item.slogan}</p>
            </button>
          );
        })}
      </div>

      {/* Live Localized Preview */}
      <div className="rounded-3xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/25 p-6 space-y-2">
        <p className="text-xs font-mono text-blue-600 dark:text-cyan-300">
          LIVE LOCALIZATION PREVIEW
        </p>
        <p className="text-xl font-extrabold text-slate-900 dark:text-white">
          {activeBundle.appName} — {activeBundle.offlineMessenger}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300">{activeBundle.tagline}</p>
        <p className="text-xs font-semibold text-blue-600 dark:text-cyan-300">
          {activeBundle.slogan}
        </p>
      </div>
    </div>
  );
}
