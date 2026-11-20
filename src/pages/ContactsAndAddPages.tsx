import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Ban,
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Edit3,
  KeyRound,
  Loader2,
  MessageSquare,
  Phone,
  Radio,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  BrowserCapabilityReport,
  ContactFilterTab,
  ContactLiveConnection,
  ContactRecord,
  DiscoveredBtDevice,
  WebsitePage,
} from '../types/contacts';
import { LocalPeerPresence } from '../utils/offlineP2pTransport';
import {
  generateFreeConnectDeviceId,
  getInitials,
  resizeAvatarFileToDataUrl,
} from '../utils/contactQrCodec';
import {
  AddEditContactModal,
  ContactFormSubmission,
} from '../components/AddEditContactModal';

/* PAGE 7: IMPROVED ADD NEW CONTACT PAGE WITH NEARBY DISCOVERY */
interface AddNewContactPageProps {
  existingDeviceIds: string[];
  initialDeviceId?: string | null;
  discoveredBtDevices: DiscoveredBtDevice[];
  localNearbyPeers: LocalPeerPresence[];
  btScanning: boolean;
  btScanFeedback: string | null;
  onScanBluetooth: () => Promise<void>;
  onConnectLocalPeer: (peer: LocalPeerPresence) => Promise<ContactRecord>;
  onOpenChat: (contactId: string) => void;
  onSave: (data: ContactFormSubmission) => Promise<ContactRecord>;
  onNavigate: (page: WebsitePage) => void;
  onClearPrefill: () => void;
}

export function AddNewContactPage({
  existingDeviceIds,
  initialDeviceId,
  discoveredBtDevices,
  localNearbyPeers,
  btScanning,
  btScanFeedback,
  onScanBluetooth,
  onConnectLocalPeer,
  onOpenChat,
  onSave,
  onNavigate,
  onClearPrefill,
}: AddNewContactPageProps) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [deviceId, setDeviceId] = useState(
    initialDeviceId ?? generateFreeConnectDeviceId()
  );
  const [avatarDataUrl, setAvatarDataUrl] = useState('');
  const [description, setDescription] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedContact, setSavedContact] = useState<ContactRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!initialDeviceId) return;
    setDeviceId(initialDeviceId);
  }, [initialDeviceId]);

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const dataUrl = await resizeAvatarFileToDataUrl(file);
      setAvatarDataUrl(dataUrl);
      setError(null);
    } catch {
      setError('Unable to process that image file.');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanId = deviceId.trim().toUpperCase();
    const cleanUser = username.trim()
      ? username.trim().startsWith('@')
        ? username.trim()
        : `@${username.trim()}`
      : `@${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'peer'}`;

    if (!cleanName) {
      setError('Please enter a Contact Name.');
      return;
    }
    if (!cleanId || cleanId.length < 4) {
      setError('Please enter a valid FreeConnect Device ID (e.g. FC-9A2B4C).');
      return;
    }
    if (existingDeviceIds.some((id) => id.toUpperCase() === cleanId)) {
      setError(`Device ID "${cleanId}" is already saved in your contact book.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const record = await onSave({
        name: cleanName,
        username: cleanUser,
        phoneNumber: phoneNumber.trim(),
        deviceId: cleanId,
        avatarDataUrl,
        description: description.trim(),
        isFavorite,
      });
      setSavedContact(record);
      onClearPrefill();
      setName('');
      setUsername('');
      setPhoneNumber('');
      setDeviceId(generateFreeConnectDeviceId());
      setAvatarDataUrl('');
      setDescription('');
      setIsFavorite(false);
    } catch {
      setError('Could not save contact to IndexedDB.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Add Contact
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Discover nearby available users, connect using a 6-digit Pairing Code, or save a real person by Device ID.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('pairing')}
            className="px-3.5 h-10 rounded-xl bg-slate-100 dark:bg-[#0B1E3D] border border-slate-300 dark:border-cyan-400/30 text-slate-800 dark:text-cyan-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <KeyRound className="w-4 h-4 text-blue-600 dark:text-cyan-300" />
            Pairing Code
          </button>
          <button
            type="button"
            onClick={() => onNavigate('nearby')}
            className="px-3.5 h-10 rounded-xl bg-slate-100 dark:bg-[#0B1E3D] border border-slate-300 dark:border-cyan-400/30 text-slate-800 dark:text-cyan-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Radio className="w-4 h-4 text-blue-600 dark:text-cyan-300" />
            Nearby Devices
          </button>
        </div>
      </div>

      {/* NEARBY DISCOVERY PANEL RIGHT INSIDE ADD CONTACT */}
      <div className="rounded-3xl bg-white dark:bg-[#07152C]/80 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/25 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bluetooth className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
              Discover Nearby Devices &amp; Users
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Scan for compatible Bluetooth peripherals or connect to open nearby FreeConnect peers.
            </p>
          </div>
          <button
            type="button"
            disabled={btScanning}
            onClick={() => void onScanBluetooth()}
            className="px-4 h-9 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            {btScanning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching...
              </>
            ) : (
              <>
                <Bluetooth className="w-3.5 h-3.5" /> Scan Nearby Bluetooth
              </>
            )}
          </button>
        </div>

        {btScanFeedback && (
          <p className="text-xs text-slate-600 dark:text-cyan-200 bg-slate-50 dark:bg-[#050E20] border border-slate-200 dark:border-cyan-400/20 rounded-xl px-3.5 py-2.5 leading-relaxed">
            {btScanFeedback}
          </p>
        )}

        {(localNearbyPeers.length > 0 || discoveredBtDevices.length > 0) && (
          <div className="space-y-2">
            {localNearbyPeers.map((peer) => (
              <div
                key={peer.deviceId}
                className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-400/35 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {peer.name}{' '}
                    <span className="font-mono text-emerald-600 dark:text-emerald-300">
                      ({peer.deviceId})
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-300">
                    Available nearby on this device · Instant offline messaging
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const contact = await onConnectLocalPeer(peer);
                    onOpenChat(contact.id);
                  }}
                  className="px-3 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shrink-0 cursor-pointer"
                >
                  Add &amp; Chat
                </button>
              </div>
            ))}

            {discoveredBtDevices.map((dev) => (
              <div
                key={dev.id}
                className="p-3 rounded-2xl bg-slate-50 dark:bg-[#050E20] border border-slate-200 dark:border-cyan-400/20 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {dev.name}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {dev.connected
                      ? dev.writable
                        ? `Connected (${dev.serviceLabel})`
                        : 'Connected (Read-Only BLE)'
                      : 'Discovered Bluetooth Device'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setName(dev.name);
                    setUsername(
                      `@${dev.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'bt_user'}`
                    );
                    setDescription(`Bluetooth hardware ID: ${dev.id.slice(0, 14)}`);
                  }}
                  className="px-3 h-8 rounded-xl bg-[#2563EB] text-white text-xs font-semibold shrink-0 cursor-pointer"
                >
                  Use in Form
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {savedContact && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-400/40 flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-800 dark:text-emerald-200">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Saved &ldquo;{savedContact.name}&rdquo; locally (Status: Disconnected until paired).
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChat(savedContact.id)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer"
            >
              Open Chat
            </button>
            <button
              type="button"
              onClick={() => onNavigate('contacts')}
              className="px-3 py-1.5 rounded-lg border border-emerald-500/50 text-emerald-700 dark:text-emerald-200 font-semibold cursor-pointer"
            >
              Contacts
            </button>
          </div>
        </div>
      )}

      {initialDeviceId && (
        <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-cyan-500/10 border border-blue-200 dark:border-cyan-400/30 text-xs text-blue-800 dark:text-cyan-200 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          Device ID {initialDeviceId} prefilled below. Add their name and save to your contacts.
        </div>
      )}

      {/* CLEAN MANUAL ADD CONTACT FORM */}
      <form
        onSubmit={handleSubmit}
        className="rounded-3xl bg-white dark:bg-[#07152C]/80 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/25 p-6 sm:p-8 space-y-6 shadow-sm"
      >
        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-500/15 border border-red-300 dark:border-red-400/40 text-xs text-red-700 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-5 p-4 rounded-2xl bg-slate-50 dark:bg-[#050E20]/80 border border-slate-200 dark:border-cyan-400/20">
          <div className="relative shrink-0">
            {avatarDataUrl ? (
              <img
                src={avatarDataUrl}
                alt="Contact preview"
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-2xl object-cover border-2 border-cyan-400/50"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#0891B2] flex items-center justify-center text-white text-lg font-bold">
                {getInitials(name || 'New Contact')}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-xl bg-[#2563EB] text-white flex items-center justify-center border-2 border-white dark:border-[#07152C] cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
          </div>

          <div className="flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Profile Photo (Optional)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-blue-600/15 dark:bg-cyan-500/15 border border-blue-400/35 dark:border-cyan-400/35 text-blue-700 dark:text-cyan-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload Photo
                </button>
                {avatarDataUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarDataUrl('')}
                    className="text-xs text-slate-500 hover:text-red-500 cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Upload a photo from your device or leave blank to use initials.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Contact Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter person's name"
              className="w-full h-11 px-4 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-cyan-300"
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
              placeholder="@username"
              className="w-full h-11 px-4 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-cyan-300"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
                FreeConnect Device ID <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setDeviceId(generateFreeConnectDeviceId())}
                className="text-xs text-blue-600 dark:text-cyan-300 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" /> Generate
              </button>
            </div>
            <input
              type="text"
              required
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value.toUpperCase())}
              placeholder="FC-9A2B4C"
              className="w-full h-11 px-4 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 font-mono text-sm text-blue-600 dark:text-cyan-300 focus:outline-none focus:border-blue-500 dark:focus:border-cyan-300"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Phone Number{' '}
              <span className="font-normal text-slate-400">(optional, reference only)</span>
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="Optional personal note"
              className="w-full h-11 px-4 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-cyan-300"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
            Personal Note
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional note about this contact..."
            className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-cyan-300 resize-none"
          />
        </div>

        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-[#050E20]/85 border border-slate-200 dark:border-cyan-400/20">
          <div className="flex items-center gap-3">
            <Star
              className={`w-5 h-5 ${
                isFavorite ? 'text-amber-400 fill-amber-400' : 'text-slate-400'
              }`}
            />
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                Favorite Contact
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pin to Favorite Contacts for quick access.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isFavorite}
            onClick={() => setIsFavorite((v) => !v)}
            className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
              isFavorite ? 'bg-[#2563EB]' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                isFavorite ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-cyan-400/15">
          <button
            type="button"
            onClick={() => onNavigate('contacts')}
            className="px-5 h-11 rounded-xl border border-slate-300 dark:border-cyan-400/25 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 h-11 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] hover:brightness-110 disabled:opacity-60 text-white text-xs font-bold tracking-wide shadow-[0_0_24px_rgba(37,99,235,0.45)] flex items-center gap-2 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Contact'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* PAGE 8: ORGANIZED CONTACT MANAGEMENT PAGE */
interface ContactManagementPageProps {
  contacts: ContactRecord[];
  loading: boolean;
  storageEngine: 'IndexedDB' | 'localStorage';
  capabilities: BrowserCapabilityReport;
  liveConnections: Record<string, ContactLiveConnection>;
  onSaveContact: (data: ContactFormSubmission, existingId?: string) => Promise<ContactRecord>;
  onDeleteContact: (id: string) => Promise<void>;
  onPatchContact: (id: string, patch: Partial<ContactRecord>) => Promise<void>;
  onConnectBluetooth: (contact: ContactRecord) => Promise<void>;
  onDisconnectBluetooth: (id: string) => void;
  onStartChat: (contactId: string) => void;
  onOpenPairingPage: () => void;
  onNavigateAddContactPage: (prefillDeviceId?: string) => void;
}

export function ContactManagementPage({
  contacts,
  loading,
  storageEngine,
  capabilities,
  liveConnections,
  onSaveContact,
  onDeleteContact,
  onPatchContact,
  onConnectBluetooth,
  onDisconnectBluetooth,
  onStartChat,
  onOpenPairingPage,
  onNavigateAddContactPage,
}: ContactManagementPageProps) {
  const [activeTab, setActiveTab] = useState<ContactFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deviceIdLookup, setDeviceIdLookup] = useState('');
  const [lookupFeedback, setLookupFeedback] = useState<{
    text: string;
    unknownId?: string;
  } | null>(null);
  const [editingContact, setEditingContact] = useState<ContactRecord | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const nonBlocked = contacts.filter((c) => !c.isBlocked);
    return {
      all: nonBlocked.length,
      online_nearby: nonBlocked.filter((c) => liveConnections[c.id]?.status === 'connected').length,
      recent: nonBlocked.filter((c) => c.lastConnectedAt !== null).length,
      favorites: nonBlocked.filter((c) => c.isFavorite).length,
      blocked: contacts.filter((c) => c.isBlocked).length,
    };
  }, [contacts, liveConnections]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = [...contacts];
    if (activeTab === 'all') list = list.filter((c) => !c.isBlocked);
    else if (activeTab === 'online_nearby')
      list = list.filter((c) => !c.isBlocked && liveConnections[c.id]?.status === 'connected');
    else if (activeTab === 'recent')
      list = list
        .filter((c) => !c.isBlocked && c.lastConnectedAt !== null)
        .sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0));
    else if (activeTab === 'favorites') list = list.filter((c) => !c.isBlocked && c.isFavorite);
    else if (activeTab === 'blocked') list = list.filter((c) => c.isBlocked);

    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.username.toLowerCase().includes(q) ||
          c.deviceId.toLowerCase().includes(q) ||
          c.phoneNumber.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [contacts, activeTab, searchQuery, liveConnections]);

  const handleDeviceConnect = (e: FormEvent) => {
    e.preventDefault();
    const id = deviceIdLookup.trim().toUpperCase();
    if (!id) return;
    const match = contacts.find((c) => c.deviceId.toUpperCase() === id);
    if (!match) {
      setLookupFeedback({
        text: `No contact found for Device ID "${id}". Add this person first to connect.`,
        unknownId: id,
      });
      return;
    }
    if (match.isBlocked) {
      setLookupFeedback({ text: `${match.name} is blocked. Unblock them before connecting.` });
      setActiveTab('blocked');
      return;
    }
    setActiveTab('all');
    setSearchQuery(id);
    setLookupFeedback({
      text: `Opening connection request for ${match.name} (${match.deviceId})...`,
    });
    void onConnectBluetooth(match);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white dark:bg-[#07152C]/80 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/25 p-6 space-y-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-mono text-blue-600 dark:text-cyan-300 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              {storageEngine} Offline Contacts · {contacts.length} Saved
            </p>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
              Contacts
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenPairingPage}
              className="px-3.5 h-10 rounded-xl bg-slate-100 dark:bg-[#0B1E3D] border border-slate-300 dark:border-cyan-400/30 text-slate-800 dark:text-cyan-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <KeyRound className="w-4 h-4 text-blue-600 dark:text-cyan-300" /> Pairing Code
            </button>
            <button
              type="button"
              onClick={() => onNavigateAddContactPage()}
              className="px-5 h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] hover:brightness-110 text-white text-xs font-bold flex items-center gap-2 border border-cyan-300/50 shadow-[0_0_22px_rgba(37,99,235,0.45)] cursor-pointer"
            >
              <UserPlus className="w-4 h-4" /> Add Contact
            </button>
          </div>
        </div>

        <form
          onSubmit={handleDeviceConnect}
          className="pt-4 border-t border-slate-200 dark:border-cyan-400/15 flex flex-col sm:flex-row gap-2.5"
        >
          <div className="relative flex-1">
            <Cpu className="w-4 h-4 text-blue-600 dark:text-cyan-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={deviceIdLookup}
              onChange={(e) => {
                setDeviceIdLookup(e.target.value.toUpperCase());
                setLookupFeedback(null);
              }}
              placeholder="Connect by FreeConnect Device ID (e.g. FC-9A2B4C)..."
              className="w-full h-10 pl-10 pr-3 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 font-mono text-xs text-slate-900 dark:text-white"
            />
          </div>
          <button
            type="submit"
            className="px-4 h-10 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Bluetooth className="w-3.5 h-3.5" /> Connect
          </button>
        </form>

        {lookupFeedback && (
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-[#050E20] border border-blue-200 dark:border-cyan-400/25 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-200">
            <span>{lookupFeedback.text}</span>
            {lookupFeedback.unknownId && (
              <button
                type="button"
                onClick={() => onNavigateAddContactPage(lookupFeedback.unknownId!)}
                className="px-3 py-1 rounded-lg bg-[#2563EB] text-white font-semibold cursor-pointer"
              >
                Add {lookupFeedback.unknownId}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filter Tabs + Search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: 'All Contacts', count: counts.all },
              { id: 'online_nearby', label: 'Connected', count: counts.online_nearby },
              { id: 'recent', label: 'Recently Connected', count: counts.recent },
              { id: 'favorites', label: 'Favorites', count: counts.favorites },
              { id: 'blocked', label: 'Blocked', count: counts.blocked },
            ] as Array<{ id: ContactFilterTab; label: string; count: number }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-[#2563EB] to-[#0891B2] text-white border border-cyan-300/50'
                  : 'bg-white dark:bg-[#07152C]/75 border border-slate-200 dark:border-cyan-400/20 text-slate-700 dark:text-slate-300 hover:border-blue-400'
              }`}
            >
              <span>{tab.label}</span>
              <span className="font-mono tabular-nums opacity-80">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts..."
            className="w-full h-10 pl-10 pr-3 rounded-xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/25 text-xs text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-sm text-slate-400">Loading saved contacts...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-[#07152C]/75 border border-slate-200 dark:border-cyan-400/20 p-10 text-center space-y-3">
          {activeTab === 'online_nearby' ? (
            <Radio className="w-8 h-8 text-blue-500 dark:text-cyan-400 mx-auto" />
          ) : (
            <Users className="w-8 h-8 text-blue-500 dark:text-cyan-400 mx-auto" />
          )}
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {activeTab === 'online_nearby'
              ? 'No Connected Contacts'
              : 'No Contacts Saved Yet'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            {activeTab === 'online_nearby'
              ? 'Contacts appear here only while a real Bluetooth GATT or Direct Offline P2P connection is active.'
              : 'Add a real person by discovering nearby devices, pairing with a 6-digit Pairing Code, or entering their Device ID.'}
          </p>
          <button
            type="button"
            onClick={() => onNavigateAddContactPage()}
            className="px-4 h-9 rounded-xl bg-[#2563EB] text-white text-xs font-semibold cursor-pointer"
          >
            Add Contact
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((contact) => {
            const live = liveConnections[contact.id];
            const isConnected = live?.status === 'connected';
            const isSearching = live?.status === 'searching';
            const isConnecting = live?.status === 'connecting';

            return (
              <div
                key={contact.id}
                className={`rounded-2xl bg-white dark:bg-[#07152C]/78 backdrop-blur-xl border p-5 flex flex-col justify-between gap-4 shadow-sm ${
                  isConnected
                    ? 'border-emerald-400/60'
                    : contact.isBlocked
                      ? 'border-red-300 dark:border-red-400/35 opacity-85'
                      : 'border-slate-200 dark:border-cyan-400/20 hover:border-blue-400 dark:hover:border-cyan-300/50'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {contact.avatarDataUrl ? (
                        <img
                          src={contact.avatarDataUrl}
                          alt={contact.name}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-2xl object-cover border border-cyan-400/35 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#0891B2] flex items-center justify-center text-white text-sm font-bold shrink-0">
                          {getInitials(contact.name)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {contact.name}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {contact.username}
                        </p>
                        <p className="text-[11px] font-mono text-blue-600 dark:text-cyan-300 mt-0.5">
                          {contact.deviceId}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          void onPatchContact(contact.id, { isFavorite: !contact.isFavorite })
                        }
                        title="Toggle Favorite"
                        className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-cyan-400/15 flex items-center justify-center cursor-pointer"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            contact.isFavorite
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-slate-400'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {contact.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                      {contact.description}
                    </p>
                  )}

                  {contact.phoneNumber && (
                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Phone className="w-3 h-3" /> {contact.phoneNumber}
                    </p>
                  )}

                  {/* Honest 4-State Connection Status */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#050E20]/90 border border-slate-200 dark:border-cyan-400/15 space-y-1 text-[11px]">
                    <div className="flex items-center justify-between font-mono">
                      <span
                        className={`font-semibold ${
                          isConnected
                            ? live?.writable
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-300'
                            : isSearching || isConnecting
                              ? 'text-blue-600 dark:text-cyan-300'
                              : contact.isBlocked
                                ? 'text-red-500'
                                : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {isConnected
                          ? live?.writable
                            ? 'CONNECTED'
                            : 'CONNECTED (READ-ONLY)'
                          : isSearching
                            ? 'SEARCHING...'
                            : isConnecting
                              ? 'CONNECTING...'
                              : contact.isBlocked
                                ? 'BLOCKED'
                                : 'DISCONNECTED'}
                      </span>
                      {contact.lastConnectedAt && (
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(contact.lastConnectedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-500 dark:text-slate-400">
                      {live?.availabilityText ?? 'Disconnected · Ready to pair via Bluetooth or Direct P2P'}
                    </p>
                    {live?.detailMessage && (
                      <p className="text-amber-700 dark:text-amber-300 leading-snug pt-0.5">
                        {live.detailMessage}
                      </p>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-cyan-400/15">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={contact.isBlocked}
                      onClick={() => onStartChat(contact.id)}
                      className="h-9 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#0891B2] disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> Open Chat
                    </button>

                    {isConnected ? (
                      <button
                        type="button"
                        onClick={() => onDisconnectBluetooth(contact.id)}
                        className="h-9 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <BluetoothConnected className="w-3.5 h-3.5" /> Disconnect
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={contact.isBlocked || isSearching || isConnecting}
                        onClick={() => void onConnectBluetooth(contact)}
                        className="h-9 rounded-xl border border-blue-500/40 dark:border-cyan-400/35 text-blue-700 dark:text-cyan-300 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                      >
                        <Bluetooth className="w-3.5 h-3.5" />
                        {isSearching ? 'Searching' : isConnecting ? 'Connecting' : 'Connect'}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingContact(contact);
                        setEditModalOpen(true);
                      }}
                      className="px-2 py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-cyan-400/10 flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" /> Edit
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void onPatchContact(contact.id, { isBlocked: !contact.isBlocked })
                      }
                      className="px-2 py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-amber-500/10 flex items-center gap-1 cursor-pointer"
                    >
                      <Ban className="w-3 h-3" /> {contact.isBlocked ? 'Unblock' : 'Block'}
                    </button>

                    {confirmDeleteId === contact.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            void onDeleteContact(contact.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-1 rounded-lg bg-red-600 text-white font-semibold cursor-pointer"
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-1 text-slate-400 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(contact.id)}
                        className="px-2 py-1 rounded-lg text-slate-500 hover:text-red-500 flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" /> Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Honest Browser Capability Notice */}
      <div className="rounded-2xl bg-white dark:bg-[#07152C]/70 border border-slate-200 dark:border-cyan-400/20 p-4 flex items-start gap-3 text-xs text-slate-600 dark:text-slate-300">
        {capabilities.webBluetoothSupported ? (
          <AlertCircle className="w-4 h-4 text-blue-600 dark:text-cyan-400 shrink-0 mt-0.5" />
        ) : (
          <BluetoothOff className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        )}
        <p className="leading-relaxed">
          {capabilities.isIos
            ? 'iOS Safari does not support Web Bluetooth. Use Direct Offline P2P Pair on the Connect page to pair and message between iPhones, Android, and desktop browsers with zero internet.'
            : 'Web Bluetooth connects to compatible BLE GATT peripherals (Chrome/Edge/Opera over HTTPS). For browser-to-browser offline messaging across any two devices, use Direct Offline P2P Pair on the Connect page.'}
        </p>
      </div>

      <AddEditContactModal
        open={editModalOpen}
        editingContact={editingContact}
        existingDeviceIds={contacts.map((c) => c.deviceId)}
        onClose={() => {
          setEditModalOpen(false);
          setEditingContact(null);
        }}
        onSave={async (data, id) => {
          await onSaveContact(data, id);
        }}
      />
    </div>
  );
}
