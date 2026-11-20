import {
  AlertTriangle,
  ArrowRight,
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  Clock,
  Database,
  FolderOpen,
  KeyRound,
  MessageSquare,
  Mic,
  Radio,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  BrowserCapabilityReport,
  ContactDirectMessage,
  ContactLiveConnection,
  ContactRecord,
  UserProfileRecord,
  WebsitePage,
} from '../types/contacts';
import { getInitials } from '../utils/contactQrCodec';

interface HomeDashboardPageProps {
  profile: UserProfileRecord;
  contacts: ContactRecord[];
  messages: ContactDirectMessage[];
  liveConnections: Record<string, ContactLiveConnection>;
  capabilities: BrowserCapabilityReport;
  storageEngine: 'IndexedDB' | 'localStorage';
  metrics: {
    totalContacts: number;
    nearbyDiscoveredCount: number;
    connectedDevicesCount: number;
    pendingMessagesCount: number;
    totalMessagesCount: number;
  };
  onNavigate: (page: WebsitePage) => void;
  onOpenChatWithContact: (contactId: string) => void;
}

export function HomeDashboardPage({
  profile,
  contacts,
  messages,
  liveConnections,
  capabilities,
  storageEngine,
  metrics,
  onNavigate,
  onOpenChatWithContact,
}: HomeDashboardPageProps) {
  const activeContacts = contacts.filter((c) => !c.isBlocked);

  const recentConversations = activeContacts
    .map((contact) => {
      const contactMsgs = messages.filter((m) => m.contactId === contact.id);
      const latest = contactMsgs[contactMsgs.length - 1] ?? null;
      return { contact, latest, count: contactMsgs.length };
    })
    .sort((a, b) => {
      const ta = a.latest?.timestamp ?? a.contact.updatedAt;
      const tb = b.latest?.timestamp ?? b.contact.updatedAt;
      return tb - ta;
    })
    .slice(0, 5);

  const bluetoothStatusLabel = capabilities.webBluetoothSupported
    ? capabilities.isEmbeddedIframe
      ? 'Iframe Restricted'
      : metrics.connectedDevicesCount > 0
        ? 'Active GATT Link'
        : 'API Ready'
    : 'Browser Unsupported';

  return (
    <div className="space-y-6">
      {/* Welcome Greeting & Primary Action Strip */}
      <div className="rounded-3xl bg-white dark:bg-[#07152C]/80 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/25 p-6 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-start gap-4 min-w-0">
          {profile.avatarDataUrl ? (
            <img
              src={profile.avatarDataUrl}
              alt={profile.name}
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-2xl object-cover border border-cyan-400/45 shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#0891B2] flex items-center justify-center text-white text-base font-bold shrink-0">
              {getInitials(profile.name)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-mono text-blue-600 dark:text-cyan-300 truncate">
              {profile.username} · {profile.deviceId} · {storageEngine}
            </p>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-0.5 truncate">
              Welcome back, {profile.name}
            </h1>
            {profile.bio ? (
              <p className="text-sm text-slate-600 dark:text-slate-200 mt-1">{profile.bio}</p>
            ) : null}
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Status: {profile.statusNote}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="px-4 h-10 rounded-xl bg-slate-100 dark:bg-[#0B1E3D] hover:bg-slate-200 dark:hover:bg-[#112B54] border border-slate-300 dark:border-cyan-400/30 text-slate-800 dark:text-cyan-200 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            Edit Profile
          </button>
          <button
            type="button"
            onClick={() => onNavigate('nearby')}
            className="px-4 h-10 rounded-xl bg-slate-100 dark:bg-[#0B1E3D] hover:bg-slate-200 dark:hover:bg-[#112B54] border border-slate-300 dark:border-cyan-400/30 text-slate-800 dark:text-cyan-200 text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Radio className="w-4 h-4 text-blue-600 dark:text-cyan-300" />
            Nearby Devices
          </button>
          <button
            type="button"
            onClick={() => onNavigate('add_contact')}
            className="px-4 h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] hover:brightness-110 text-white text-xs font-bold flex items-center gap-2 border border-cyan-300/50 shadow-[0_0_20px_rgba(37,99,235,0.4)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            Add Contact
          </button>
        </div>
      </div>

      {/* 6 Required Dashboard Metric Cards (Tabular Numerals, Honest Real State) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('contacts')}
          className="text-left rounded-2xl bg-white dark:bg-[#07152C]/75 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/20 hover:border-blue-400 dark:hover:border-cyan-300/50 p-5 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Total Saved Contacts</span>
            <Users className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
          </div>
          <p className="text-3xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
            {metrics.totalContacts}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Stored offline in {storageEngine}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('nearby')}
          className="text-left rounded-2xl bg-white dark:bg-[#07152C]/75 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/20 hover:border-blue-400 dark:hover:border-cyan-300/50 p-5 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Nearby Discoverable Devices</span>
            <Radio className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
          </div>
          <p className="text-3xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
            {metrics.nearbyDiscoveredCount}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Discovered via Web Bluetooth picker this session
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('network')}
          className="text-left rounded-2xl bg-white dark:bg-[#07152C]/75 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/20 hover:border-blue-400 dark:hover:border-cyan-300/50 p-5 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Connected Devices</span>
            <BluetoothConnected className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          </div>
          <p className="text-3xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
            {metrics.connectedDevicesCount}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {metrics.connectedDevicesCount > 0
              ? 'Active Web Bluetooth GATT links'
              : 'Zero active links (never simulated)'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('history')}
          className="text-left rounded-2xl bg-white dark:bg-[#07152C]/75 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/20 hover:border-blue-400 dark:hover:border-cyan-300/50 p-5 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Pending Messages</span>
            <Clock className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          </div>
          <p className="text-3xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-2">
            {metrics.pendingMessagesCount}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Queued locally across {metrics.totalMessagesCount} total messages
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('nearby')}
          className="text-left rounded-2xl bg-white dark:bg-[#07152C]/75 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/20 hover:border-blue-400 dark:hover:border-cyan-300/50 p-5 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Bluetooth Status</span>
            {capabilities.webBluetoothSupported ? (
              <Bluetooth className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
            ) : (
              <BluetoothOff className="w-4 h-4 text-amber-500" />
            )}
          </div>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-3">
            {bluetoothStatusLabel}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {capabilities.webBluetoothSupported
              ? 'Requires HTTPS top-level Chrome/Edge/Opera'
              : 'Use Chrome/Edge/Opera for Web Bluetooth'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('privacy')}
          className="text-left rounded-2xl bg-white dark:bg-[#07152C]/75 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/20 hover:border-blue-400 dark:hover:border-cyan-300/50 p-5 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Network Status</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          </div>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-3">
            Local-Only · Zero Cloud
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
            <Database className="w-3 h-3" /> {storageEngine} + Web Crypto ECDH P-256
          </p>
        </button>
      </div>

      {/* Main Split: Recent Conversations + Quick Launch Modules */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Recent Conversations */}
        <div className="xl:col-span-7 rounded-3xl bg-white dark:bg-[#07152C]/75 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/20 p-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Recent Conversations
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select any saved contact to open the full messaging workspace.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('chat')}
              className="text-xs font-semibold text-blue-600 dark:text-cyan-300 hover:underline flex items-center gap-1 cursor-pointer"
            >
              Open Chats <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentConversations.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <MessageSquare className="w-8 h-8 text-blue-500 dark:text-cyan-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                No contacts yet
              </p>
              <button
                type="button"
                onClick={() => onNavigate('add_contact')}
                className="px-4 h-9 rounded-xl bg-[#2563EB] text-white text-xs font-semibold cursor-pointer"
              >
                Add First Contact
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-cyan-400/15">
              {recentConversations.map(({ contact, latest }) => {
                const live = liveConnections[contact.id];
                const isConnected = live?.status === 'connected';
                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => onOpenChatWithContact(contact.id)}
                    className="w-full py-3.5 px-2 -mx-2 rounded-xl hover:bg-slate-50 dark:hover:bg-[#0C1F3F]/60 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {contact.avatarDataUrl ? (
                        <img
                          src={contact.avatarDataUrl}
                          alt={contact.name}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-2xl object-cover border border-cyan-400/35 shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#0891B2] flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {getInitials(contact.name)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {contact.name}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                          {latest ? latest.text : 'No messages yet · Tap to start offline chat'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 space-y-0.5">
                      <p className="text-[11px] font-mono tabular-nums text-slate-400">
                        {latest
                          ? new Date(latest.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : contact.deviceId}
                      </p>
                      <p
                        className={`text-[11px] font-mono ${
                          isConnected
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {isConnected
                          ? live?.transport === 'web_bluetooth_gatt'
                            ? 'Connected BT'
                            : live?.transport === 'web_bluetooth_readonly'
                              ? 'BT Read-Only'
                              : 'Connected P2P'
                          : 'Disconnected'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Modules Grid */}
        <div className="xl:col-span-5 rounded-3xl bg-white dark:bg-[#07152C]/75 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/20 p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Quick Workspace Tools
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Jump directly to any FreeConnect offline communication module.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { page: 'pairing' as WebsitePage, icon: KeyRound, title: 'Pairing Code', sub: 'Pick or enter 6-digit code' },
              { page: 'voice' as WebsitePage, icon: Mic, title: 'Voice Notes', sub: 'Record & play offline' },
              { page: 'files' as WebsitePage, icon: FolderOpen, title: 'File Manager', sub: 'Stage & attach files' },
              { page: 'group' as WebsitePage, icon: Users, title: 'Group Chat', sub: 'Local team rooms' },
              { page: 'network' as WebsitePage, icon: Radio, title: 'Network Map', sub: 'Live topology view' },
              { page: 'sos' as WebsitePage, icon: AlertTriangle, title: 'Emergency SOS', sub: 'Priority alert dispatch' },
            ].map(({ page, icon: Icon, title, sub }) => (
              <button
                key={page}
                type="button"
                onClick={() => onNavigate(page)}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-[#050E20]/85 border border-slate-200 dark:border-cyan-400/15 hover:border-blue-500 dark:hover:border-cyan-300/50 text-left transition-all cursor-pointer"
              >
                <Icon
                  className={`w-5 h-5 mb-2.5 ${
                    page === 'sos'
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-blue-600 dark:text-cyan-400'
                  }`}
                />
                <p className="text-xs font-bold text-slate-900 dark:text-white">{title}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
