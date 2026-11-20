import { ComponentType, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  Check,
  ChevronDown,
  ChevronRight,
  FolderLock,
  FolderOpen,
  Globe,
  History,
  Home,
  KeyRound,
  Loader2,
  Lock,
  Menu,
  MessageSquare,
  Mic,
  Moon,
  Radio,
  Settings,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { LocalVoiceClip, WebsitePage } from './types/contacts';
import { TRANSLATIONS } from './i18n/translations';
import { useFreeConnectWebsite } from './state/useFreeConnectWebsite';
import { useAuthProfile } from './hooks/useAuthProfile';
import { usePairingSystem } from './hooks/usePairingSystem';
import { getInitials } from './utils/contactQrCodec';
import { FuturisticBackdrop } from './components/FuturisticBackdrop';
import { FreeConnectLogoMark, FreeConnectWordmark } from './components/FreeConnectLogo';
import { AuthProfileGatePage } from './pages/AuthProfileGatePage';
import { LandingPage, WelcomePage } from './pages/LandingAndWelcomePages';
import { HomeDashboardPage } from './pages/HomeDashboardPage';
import { ChatPage, GroupChatPage } from './pages/ChatAndGroupPages';
import { ConnectIphonePage } from './pages/ConnectIphonePage';
import { NearbyDevicesHubPage } from './pages/NearbyDevicesHubPage';
import { PairingHubPage } from './pages/PairingHubPage';
import { AdminControlCenterPage } from './pages/AdminControlCenterPage';
import { EditProfilePage } from './pages/EditProfilePage';
import { PrivateChatsPage } from './pages/PrivateChatsPage';
import { AddNewContactPage, ContactManagementPage } from './pages/ContactsAndAddPages';
import {
  EmergencySosPage,
  NetworkMapPage,
  OfflineFileManagerPage,
  VoiceMessagesPage,
} from './pages/ConnectivityAndMediaPages';
import {
  LanguageSelectionPage,
  MessageHistoryPage,
  PrivacySecurityPage,
  SettingsPage,
} from './pages/AccountAndSystemPages';

interface NavItemDef {
  id: WebsitePage;
  label: string;
  icon: ComponentType<{ className?: string }>;
  danger?: boolean;
}

const CORE_NAV: NavItemDef[] = [
  { id: 'chat', label: 'Normal Chats', icon: MessageSquare },
  { id: 'pairing', label: 'Pairing Code', icon: KeyRound },
  { id: 'nearby', label: 'Nearby Devices', icon: Radio },
  { id: 'connect_iphone', label: 'Connect iPhone', icon: Smartphone },
  { id: 'private_chats', label: 'Private Chats', icon: FolderLock },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'add_contact', label: 'Add Contact', icon: UserPlus },
  { id: 'profile', label: 'Edit Profile', icon: User },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const MOBILE_BOTTOM_NAV: NavItemDef[] = [
  { id: 'chat', label: 'Chats', icon: MessageSquare },
  { id: 'pairing', label: 'Code', icon: KeyRound },
  { id: 'nearby', label: 'Nearby', icon: Radio },
  { id: 'private_chats', label: 'Private', icon: FolderLock },
  { id: 'profile', label: 'Profile', icon: User },
];

const MORE_NAV: NavItemDef[] = [
  { id: 'admin_control', label: 'Admin Control Center', icon: ShieldCheck },
  { id: 'dashboard', label: 'Overview', icon: Home },
  { id: 'group', label: 'Group Chat', icon: Users },
  { id: 'network', label: 'Network Map', icon: Radio },
  { id: 'history', label: 'Message History', icon: History },
  { id: 'privacy', label: 'Privacy & Security', icon: Shield },
  { id: 'language', label: 'Language', icon: Globe },
  { id: 'sos', label: 'Emergency SOS', icon: AlertTriangle, danger: true },
  { id: 'welcome', label: 'Welcome Setup', icon: Sparkles },
];

const PAGE_TITLES: Record<WebsitePage, string> = {
  landing: 'Landing',
  welcome: 'Welcome',
  dashboard: 'Overview',
  chat: 'Normal Chats',
  pairing: 'Pairing Code System',
  admin_control: 'Admin Control Center',
  connect_iphone: 'Connect iPhone',
  private_chats: 'Private Chats',
  group: 'Group Chat',
  nearby: 'Nearby Devices',
  add_contact: 'Add Contact',
  contacts: 'Contacts',
  voice: 'Voice Messages',
  files: 'File Sharing',
  network: 'Network Map',
  sos: 'Emergency SOS',
  history: 'Message History',
  profile: 'Edit Profile',
  settings: 'Settings',
  privacy: 'Privacy & Security',
  language: 'Language',
};

export function App() {
  const website = useFreeConnectWebsite();
  const auth = useAuthProfile(website.profile.deviceId);
  const pairing = usePairingSystem(auth.user, website.profile.deviceId);
  const [page, setPage] = useState<WebsitePage>('chat');
  const [selectedChatContactId, setSelectedChatContactId] = useState<string | null>(null);
  const [deviceIdPrefill, setDeviceIdPrefill] = useState<string | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  const [pairingReqBusy, setPairingReqBusy] = useState(false);

  // Sync permanent authenticated user profile into local FreeConnect profile automatically
  useEffect(() => {
    const u = auth.user;
    if (!u) return;
    const needsSync =
      website.profile.name !== u.fullName ||
      website.profile.username !== u.username ||
      (website.profile.bio ?? '') !== (u.bio ?? '') ||
      website.profile.statusNote !== u.statusNote ||
      (website.profile.avatarDataUrl ?? '') !== (u.avatarDataUrl ?? '') ||
      (website.profile.phoneNumber ?? '') !== (u.phoneE164 ?? '');
    if (needsSync) {
      website.updateProfile({
        name: u.fullName,
        username: u.username,
        bio: u.bio,
        statusNote: u.statusNote,
        avatarDataUrl: u.avatarDataUrl ?? '',
        phoneNumber: u.phoneE164,
      });
    }
  }, [
    auth.user,
    website.profile.name,
    website.profile.username,
    website.profile.bio,
    website.profile.statusNote,
    website.profile.avatarDataUrl,
    website.profile.phoneNumber,
    website.updateProfile,
  ]);

  // Local App PIN Lock state (PBKDF2-SHA256 verified against IndexedDB)
  const [appLocked, setAppLocked] = useState(false);
  const [unlockInput, setUnlockInput] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [showLockRecovery, setShowLockRecovery] = useState(false);
  const [lockRecoveryKey, setLockRecoveryKey] = useState('');
  const [lockRecoveryNewPin, setLockRecoveryNewPin] = useState('');

  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedDark =
    website.prefs.themeMode === 'dark' ||
    (website.prefs.themeMode === 'auto' && systemDark);

  const t = TRANSLATIONS[website.prefs.language];

  // Sync Tailwind dark class and RTL direction globally
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedDark);
    document.documentElement.dir = t.rtl ? 'rtl' : 'ltr';
    document.documentElement.lang = website.prefs.language;
  }, [resolvedDark, t.rtl, website.prefs.language]);

  const navigate = (nextPage: WebsitePage) => {
    setPage(nextPage);
    setMobileDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenChatWithContact = (contactId: string) => {
    if (website.isContactPrivate(contactId)) {
      navigate('private_chats');
      return;
    }
    setSelectedChatContactId(contactId);
    navigate('chat');
  };

  // Automatically open private 1-to-1 chat immediately after a successful Nearby Devices connection
  useEffect(() => {
    const evt = website.lastConnectedEvent;
    if (!evt) return;
    website.clearLastConnectedEvent();
    if (page === 'nearby' || page === 'connect_iphone') {
      if (website.isContactPrivate(evt.contactId)) {
        setPage('private_chats');
      } else {
        setSelectedChatContactId(evt.contactId);
        setPage('chat');
      }
      setMobileDrawerOpen(false);
    }
  }, [page, website]);

  // Automatically open the Private Paired Room when a Pairing Code request is accepted
  useEffect(() => {
    const roomId = pairing.justConnectedRoomId;
    if (!roomId) return;
    pairing.clearJustConnectedRoom();
    void pairing.loadRoomMessages(roomId);
    setPage('pairing');
    setMobileDrawerOpen(false);
  }, [pairing]);

  const handleSendVoiceClipToContact = async (clip: LocalVoiceClip, contactId: string) => {
    await website.sendDirectMessageToContact(
      contactId,
      `Voice message (${clip.durationSec}s)`,
      {
        kind: 'voice',
        voiceDurationSec: clip.durationSec,
        voiceDataUrl: clip.audioUrl,
        voiceMimeType: clip.mimeType,
      }
    );
    handleOpenChatWithContact(contactId);
  };

  // Normal (non-private) contacts & messages — locked chats are completely hidden here
  const normalContacts = useMemo(
    () => website.contacts.filter((c) => !website.isContactPrivate(c.id)),
    [website]
  );

  // Automatic Remember Me Session Restoration splash (prevents flashing registration to returning users)
  if (auth.status === 'checking') {
    return (
      <div className="min-h-screen bg-[#020714] text-white flex items-center justify-center p-6 relative overflow-hidden">
        <FuturisticBackdrop />
        <div className="relative z-10 flex flex-col items-center gap-4 text-center">
          <FreeConnectLogoMark size="lg" />
          <div className="flex items-center gap-2 text-sm font-semibold text-cyan-200">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-300" />
            <span>Restoring your FreeConnect profile...</span>
          </div>
        </div>
      </div>
    );
  }

  // Mandatory First-Time User Registration & Cross-Device OTP Recovery Gate
  if (auth.status === 'unauthenticated' || !auth.user) {
    return (
      <AuthProfileGatePage
        restoreError={auth.restoreError}
        onSendOtp={auth.sendOtp}
        onVerifyOtp={auth.verifyOtp}
        onCreateProfile={auth.createProfile}
        onRecoverWithOtp={auth.recoverWithOtp}
      />
    );
  }

  // Full-screen App PIN Lock overlay when explicitly locked (PBKDF2-SHA256 verified)
  if (appLocked && website.pinSecurity.hasPin) {
    return (
      <div className="min-h-screen bg-[#020714] text-white flex items-center justify-center p-6 relative overflow-hidden">
        <FuturisticBackdrop />
        <div className="relative z-10 w-full max-w-sm rounded-3xl bg-[#07152C]/90 backdrop-blur-2xl border border-cyan-400/35 p-8 text-center space-y-5 shadow-[0_24px_80px_rgba(3,8,20,0.75)]">
          <div className="relative w-20 h-20 mx-auto">
            <FreeConnectLogoMark size="xl" />
            <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-[#06152E] border border-cyan-300/60 flex items-center justify-center shadow-[0_0_16px_rgba(56,217,255,0.45)]">
              <Lock className="w-3.5 h-3.5 text-[#38D9FF]" />
            </div>
          </div>
          <div>
            <p className="text-xs font-mono text-cyan-300 tracking-widest">FREECONNECT LOCKED</p>
            <h1 className="text-xl font-extrabold mt-1">
              {showLockRecovery ? 'Recover PIN Offline' : 'Enter Personal PIN'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {showLockRecovery
                ? 'Enter your saved Offline Recovery Key and choose a new PIN.'
                : 'Verified locally via PBKDF2-SHA256 in IndexedDB.'}
            </p>
          </div>

          {!showLockRecovery ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const res = await website.verifyUserPin(unlockInput);
                if (res.ok) {
                  setAppLocked(false);
                  setUnlockInput('');
                  setUnlockError(null);
                } else {
                  setUnlockError(res.error ?? 'Incorrect PIN.');
                }
              }}
              className="space-y-3"
            >
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                autoFocus
                value={unlockInput}
                onChange={(e) => {
                  setUnlockInput(e.target.value.replace(/\D/g, ''));
                  setUnlockError(null);
                }}
                placeholder="••••"
                className="w-full h-12 px-4 rounded-xl bg-[#030B1D] border border-cyan-400/35 text-center font-mono text-lg tracking-[0.4em] text-white focus:outline-none focus:border-cyan-300"
              />
              {unlockError && <p className="text-xs text-red-400">{unlockError}</p>}
              <button
                type="submit"
                className="w-full h-11 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-sm font-bold cursor-pointer"
              >
                Unlock FreeConnect
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLockRecovery(true);
                  setUnlockError(null);
                }}
                className="text-xs text-cyan-300 hover:underline cursor-pointer"
              >
                Forgot PIN? Use Recovery Key
              </button>
            </form>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const res = await website.recoverPinWithRecoveryKey(
                  lockRecoveryKey,
                  lockRecoveryNewPin
                );
                if (res.ok) {
                  setAppLocked(false);
                  setShowLockRecovery(false);
                  setLockRecoveryKey('');
                  setLockRecoveryNewPin('');
                  setUnlockError(null);
                } else {
                  setUnlockError(res.error ?? 'Recovery Key did not match.');
                }
              }}
              className="space-y-3"
            >
              <input
                type="text"
                value={lockRecoveryKey}
                onChange={(e) => setLockRecoveryKey(e.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                className="w-full h-11 px-3 rounded-xl bg-[#030B1D] border border-cyan-400/35 text-center font-mono text-xs text-white"
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={lockRecoveryNewPin}
                onChange={(e) => setLockRecoveryNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="New PIN (4–8 digits)"
                className="w-full h-11 px-3 rounded-xl bg-[#030B1D] border border-cyan-400/35 text-center font-mono text-sm text-white"
              />
              {unlockError && <p className="text-xs text-red-400">{unlockError}</p>}
              <button
                type="submit"
                className="w-full h-11 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-sm font-bold cursor-pointer"
              >
                Reset PIN &amp; Unlock
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLockRecovery(false);
                  setUnlockError(null);
                }}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                ← Back to PIN Entry
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Full-bleed Landing & Welcome Pages when explicitly navigated to
  if (page === 'landing') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#020714] text-slate-900 dark:text-white relative">
        <FuturisticBackdrop />
        <LandingPage
          t={t}
          totalContacts={website.metrics.totalContacts}
          connectedCount={website.metrics.connectedDevicesCount + pairing.activeRoomsCount}
          webBtSupported={website.capabilities.webBluetoothSupported}
          onNavigate={navigate}
        />
      </div>
    );
  }

  if (page === 'welcome') {
    return (
      <WelcomePage
        t={t}
        profile={website.profile}
        onUpdateProfile={website.updateProfile}
        onNavigate={navigate}
      />
    );
  }

  const totalIncomingRequests =
    website.metrics.incomingRequestsCount + pairing.incomingPendingRequests.length;
  const totalConnectedCount =
    website.metrics.connectedDevicesCount + pairing.activeRoomsCount;

  const overall =
    pairing.incomingPendingRequests.length > 0
      ? 'request_received'
      : website.metrics.overallStatus === 'disconnected' && pairing.activeRoomsCount > 0
        ? 'connected'
        : website.metrics.overallStatus;

  const statusPill =
    overall === 'request_received'
      ? {
          label: `Request Received (${totalIncomingRequests})`,
          cls: 'bg-purple-500/15 border-purple-400/45 text-purple-700 dark:text-purple-200',
        }
      : overall === 'request_sent'
        ? {
            label: 'Request Sent...',
            cls: 'bg-amber-500/15 border-amber-400/40 text-amber-700 dark:text-amber-300',
          }
        : overall === 'searching'
          ? {
              label: 'Searching...',
              cls: 'bg-blue-500/15 border-blue-400/40 text-blue-700 dark:text-cyan-300',
            }
          : overall === 'connecting'
            ? {
                label: 'Connecting...',
                cls: 'bg-amber-500/15 border-amber-400/40 text-amber-700 dark:text-amber-300',
              }
            : overall === 'connected'
              ? {
                  label: `Connected (${totalConnectedCount})`,
                  cls: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-700 dark:text-emerald-300',
                }
              : {
                  label: 'Disconnected',
                  cls: 'bg-slate-100 dark:bg-[#0B1E3D] border-slate-300 dark:border-cyan-400/25 text-slate-600 dark:text-slate-300',
                };

  const pairingUnreadTotal = pairing.rooms.reduce((sum, r) => sum + r.unreadCount, 0);
  const pairingBadgeCount =
    pairing.incomingPendingRequests.length || pairingUnreadTotal || pairing.activeRoomsCount;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020714] text-slate-900 dark:text-white flex relative">
      <FuturisticBackdrop />

      {/* CLEAN DESKTOP SIDEBAR */}
      <aside className="hidden lg:flex w-60 shrink-0 sticky top-0 h-screen z-30 flex-col bg-white/90 dark:bg-[#040D1F]/92 backdrop-blur-2xl border-r border-slate-200 dark:border-cyan-400/15">
        {/* Brand Block */}
        <div className="h-16 px-4 border-b border-slate-200 dark:border-cyan-400/15 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => navigate('chat')}
            className="flex items-center text-left group cursor-pointer transition-transform duration-200 hover:scale-[1.01]"
          >
            <FreeConnectWordmark size="md" showTagline />
          </button>
        </div>

        {/* Live User Profile Identity Card (Reflects Edit Profile Everywhere) */}
        <button
          type="button"
          onClick={() => navigate('profile')}
          className="mx-3 mt-3 p-2.5 rounded-2xl bg-slate-100/90 dark:bg-[#081733]/90 hover:bg-slate-200/80 dark:hover:bg-[#0D224A] border border-slate-200 dark:border-cyan-400/20 flex items-center gap-2.5 text-left transition-colors cursor-pointer"
        >
          {website.profile.avatarDataUrl ? (
            <img
              src={website.profile.avatarDataUrl}
              alt={website.profile.name}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-xl object-cover border border-cyan-400/40 shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#0891B2] flex items-center justify-center text-white text-xs font-bold shrink-0">
              {getInitials(website.profile.name)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
              {auth.user.fullName}
            </p>
            <p className="text-[11px] font-mono text-blue-600 dark:text-cyan-300 truncate">
              {auth.user.username}
            </p>
            <p className="text-[10px] font-mono text-emerald-600 dark:text-emerald-300 truncate">
              ID {auth.user.id} · Verified
            </p>
          </div>
        </button>

        {/* Core Messaging Navigation + Collapsible More Tools */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          <div className="space-y-1">
            {CORE_NAV.map((item) => {
              const Icon = item.icon;
              const active = page === item.id;
              const badgeCount =
                item.id === 'pairing'
                  ? pairingBadgeCount
                  : item.id === 'contacts'
                    ? website.metrics.totalContacts
                    : item.id === 'chat'
                      ? website.metrics.pendingMessagesCount
                      : item.id === 'connect_iphone'
                        ? website.metrics.incomingRequestsCount ||
                          website.metrics.connectedDevicesCount
                        : item.id === 'private_chats'
                          ? website.metrics.privateChatsCount
                          : item.id === 'nearby'
                            ? website.metrics.incomingRequestsCount ||
                              website.metrics.nearbyDiscoveredCount ||
                              website.metrics.connectedDevicesCount
                            : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'add_contact') setDeviceIdPrefill(null);
                    navigate(item.id);
                  }}
                  className={`w-full h-10 px-3 rounded-xl flex items-center justify-between text-xs font-semibold transition-all cursor-pointer ${
                    active
                      ? 'bg-gradient-to-r from-[#2563EB] to-[#0891B2] text-white shadow-[0_0_20px_rgba(37,99,235,0.35)]'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#0A1C3A]/80 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {badgeCount > 0 && (
                    <span
                      className={`font-mono tabular-nums text-[11px] ${
                        active ? 'text-cyan-100' : 'text-slate-400'
                      }`}
                    >
                      {badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-cyan-400/15 space-y-1">
            <button
              type="button"
              onClick={() => setMoreToolsOpen((o) => !o)}
              className="w-full h-8 px-3 rounded-lg flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <span>MORE TOOLS</span>
              {moreToolsOpen ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>

            {moreToolsOpen && (
              <div className="space-y-0.5 pt-1">
                {MORE_NAV.map((item) => {
                  const Icon = item.icon;
                  const active = page === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(item.id)}
                      className={`w-full h-9 px-3 rounded-xl flex items-center gap-2.5 text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? item.danger
                            ? 'bg-red-600 text-white'
                            : 'bg-blue-600/15 dark:bg-cyan-500/20 text-blue-700 dark:text-cyan-200 font-semibold'
                          : item.danger
                            ? 'text-red-600 dark:text-red-400 hover:bg-red-500/10'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#0A1C3A]/70 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => navigate('landing')}
                  className="w-full h-9 px-3 rounded-xl flex items-center gap-2.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#0A1C3A]/70 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Home Landing</span>
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* Quiet Sidebar Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-cyan-400/15 flex items-center justify-between gap-2 shrink-0">
          <p className="text-[11px] text-slate-500 dark:text-cyan-300/80 truncate font-medium">
            {t.slogan}
          </p>
          <button
            type="button"
            title={resolvedDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            onClick={() =>
              website.updatePrefs({ themeMode: resolvedDark ? 'light' : 'dark' })
            }
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-cyan-400/25 hover:bg-slate-100 dark:hover:bg-cyan-400/15 flex items-center justify-center text-slate-600 dark:text-cyan-300 shrink-0 cursor-pointer"
          >
            {resolvedDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* MOBILE SLIDE-OVER DRAWER */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div className="relative z-10 w-72 max-w-[85vw] h-full bg-white dark:bg-[#040D1F] border-r border-slate-200 dark:border-cyan-400/25 flex flex-col">
            <div className="h-14 px-4 border-b border-slate-200 dark:border-cyan-400/15 flex items-center justify-between">
              <button
                type="button"
                onClick={() => navigate('chat')}
                className="flex items-center cursor-pointer"
              >
                <FreeConnectWordmark size="sm" />
              </button>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-cyan-400/15 flex items-center justify-center text-slate-500 dark:text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => navigate('profile')}
              className="mx-3 mt-3 p-2.5 rounded-2xl bg-slate-100 dark:bg-[#081733] border border-slate-200 dark:border-cyan-400/20 flex items-center gap-2.5 text-left cursor-pointer"
            >
              {website.profile.avatarDataUrl ? (
                <img
                  src={website.profile.avatarDataUrl}
                  alt={website.profile.name}
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-xl object-cover border border-cyan-400/40 shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#0891B2] flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {getInitials(website.profile.name)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {website.profile.name}
                </p>
                <p className="text-[11px] font-mono text-blue-600 dark:text-cyan-300 truncate">
                  {website.profile.username}
                </p>
              </div>
            </button>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <div className="space-y-1">
                {CORE_NAV.map((item) => {
                  const Icon = item.icon;
                  const active = page === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.id === 'add_contact') setDeviceIdPrefill(null);
                        navigate(item.id);
                      }}
                      className={`w-full h-10 px-3 rounded-xl flex items-center gap-2.5 text-xs font-semibold cursor-pointer ${
                        active
                          ? 'bg-gradient-to-r from-[#2563EB] to-[#0891B2] text-white'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#0A1C3A]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-cyan-400/15 space-y-1">
                <p className="px-3 pb-1 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  More Tools
                </p>
                {MORE_NAV.map((item) => {
                  const Icon = item.icon;
                  const active = page === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(item.id)}
                      className={`w-full h-9 px-3 rounded-xl flex items-center gap-2.5 text-xs font-medium cursor-pointer ${
                        active
                          ? 'bg-blue-600/15 dark:bg-cyan-500/20 text-blue-700 dark:text-cyan-200 font-semibold'
                          : item.danger
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-cyan-400/15 flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-cyan-300">{t.slogan}</span>
              <button
                type="button"
                onClick={() =>
                  website.updatePrefs({ themeMode: resolvedDark ? 'light' : 'dark' })
                }
                className="px-2.5 h-8 rounded-lg border border-slate-300 dark:border-cyan-400/30 text-xs flex items-center gap-1.5 text-slate-700 dark:text-cyan-200 cursor-pointer"
              >
                {resolvedDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                {resolvedDark ? 'Light' : 'Dark'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RIGHT WORKSPACE COLUMN */}
      <div className="flex-1 min-w-0 flex flex-col relative z-10">
        {/* Compact Workspace Top Bar with Live Connection Status */}
        <header className="sticky top-0 z-30 h-14 px-4 sm:px-6 lg:px-8 bg-white/88 dark:bg-[#030A1A]/88 backdrop-blur-xl border-b border-slate-200 dark:border-cyan-400/15 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation drawer"
              onClick={() => setMobileDrawerOpen(true)}
              className="lg:hidden w-9 h-9 rounded-xl border border-slate-200 dark:border-cyan-400/25 flex items-center justify-center text-slate-700 dark:text-cyan-200 shrink-0 cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0">
              <button
                type="button"
                onClick={() => navigate('chat')}
                className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-cyan-300 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FreeConnectLogoMark size="xs" className="lg:hidden" />
                <span>FreeConnect</span>
              </button>
              <span className="text-slate-400">/</span>
              <span className="font-bold text-slate-900 dark:text-white truncate">
                {PAGE_TITLES[page]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Live Connection Status Indicator */}
            <button
              type="button"
              onClick={() =>
                navigate(pairing.incomingPendingRequests.length > 0 ? 'pairing' : 'nearby')
              }
              title="Open Connections"
              className={`px-3 h-9 rounded-xl border text-xs font-mono font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${statusPill.cls}`}
            >
              {(overall === 'searching' ||
                overall === 'connecting' ||
                overall === 'request_sent') && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {overall === 'request_received' && <Radio className="w-3.5 h-3.5" />}
              {overall === 'connected' && <BluetoothConnected className="w-3.5 h-3.5" />}
              {overall === 'disconnected' && <BluetoothOff className="w-3.5 h-3.5" />}
              <span>{statusPill.label}</span>
            </button>

            {website.pinSecurity.hasPin && (
              <button
                type="button"
                title="Lock Workspace"
                onClick={() => setAppLocked(true)}
                className="w-9 h-9 rounded-xl border border-slate-200 dark:border-cyan-400/25 hover:bg-slate-100 dark:hover:bg-cyan-400/15 flex items-center justify-center text-slate-600 dark:text-cyan-300 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate('pairing')}
              className="px-3.5 h-9 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] hover:brightness-110 text-white text-xs font-bold flex items-center gap-1.5 border border-cyan-300/45 shadow-[0_0_16px_rgba(37,99,235,0.4)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Pairing Code</span>
            </button>
          </div>
        </header>

        {/* Active Page Canvas */}
        <main className="flex-1 w-full max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-5 pb-24 lg:pb-8">
          {page === 'dashboard' && (
            <HomeDashboardPage
              profile={website.profile}
              contacts={normalContacts}
              messages={website.messages.filter((m) => !website.isContactPrivate(m.contactId))}
              liveConnections={website.liveConnections}
              capabilities={website.capabilities}
              storageEngine={website.storageEngine}
              metrics={website.metrics}
              onNavigate={navigate}
              onOpenChatWithContact={handleOpenChatWithContact}
            />
          )}

          {page === 'chat' && (
            <ChatPage
              contacts={normalContacts}
              messages={website.messages.filter((m) => !website.isContactPrivate(m.contactId))}
              liveConnections={website.liveConnections}
              selectedContactId={selectedChatContactId}
              textSize={website.prefs.textSize}
              hasPinConfigured={website.pinSecurity.hasPin}
              privateFolders={website.privateFolders}
              onVerifyPin={website.verifyUserPin}
              onLockChatToPrivate={website.lockChatAndMoveToPrivate}
              onOpenSecuritySettings={() => navigate('privacy')}
              onSelectContact={setSelectedChatContactId}
              onSendMessage={website.sendDirectMessageToContact}
              onRetryMessage={website.retryDirectMessage}
              onToggleReaction={website.toggleDirectMessageReaction}
              onClearConversation={website.clearContactConversation}
              onConnectBluetooth={website.connectContactBluetooth}
              onDisconnectBluetooth={website.disconnectContactBluetooth}
              onPatchContact={website.patchContact}
              onAddNewContact={() => {
                setDeviceIdPrefill(null);
                navigate('add_contact');
              }}
              onOpenConnectPage={() => navigate('pairing')}
            />
          )}

          {page === 'pairing' && (
            <PairingHubPage
              sessionUser={pairing.sessionUser}
              sessionReady={pairing.sessionReady}
              sessionError={pairing.sessionError}
              wsConnected={pairing.wsConnected}
              poolCards={pairing.poolCards}
              poolAvailableCount={pairing.poolAvailableCount}
              poolLoading={pairing.poolLoading}
              myClaim={pairing.myClaim}
              incomingPendingRequests={pairing.incomingPendingRequests}
              outgoingRequests={pairing.outgoingRequests}
              rooms={pairing.rooms}
              messagesByRoom={pairing.messagesByRoom}
              activeRoomId={pairing.activeRoomId}
              verificationResult={pairing.verificationResult}
              onRefreshPool={pairing.refreshPool}
              onSelectCode={pairing.selectCode}
              onCancelMyCode={pairing.cancelMyCode}
              onVerifyCode={pairing.verifyReceivedCode}
              onClearVerification={pairing.clearVerification}
              onSendRequest={pairing.sendRequestForCode}
              onRespondRequest={pairing.respondRequest}
              onOpenRoom={pairing.loadRoomMessages}
              onSendPrivateMessage={pairing.sendPrivateMessage}
              onDisconnectRoom={pairing.disconnectRoom}
              onOpenAdmin={() => navigate('admin_control')}
            />
          )}

          {page === 'admin_control' && (
            <AdminControlCenterPage
              sessionUser={pairing.sessionUser}
              overview={pairing.adminOverview}
              onUnlockAdmin={pairing.unlockAdmin}
              onLoadOverview={pairing.loadAdminOverview}
              onGenerateCodes={pairing.generateMoreCodes}
              onDisableCode={pairing.disableSuspiciousCode}
              onRecycleExpired={pairing.recycleExpiredCodes}
            />
          )}

          {page === 'connect_iphone' && (
            <ConnectIphonePage
              profile={website.profile}
              capabilities={website.capabilities}
              contacts={website.contacts}
              liveConnections={website.liveConnections}
              nativeNearbyPeers={website.nativeNearbyPeers}
              localNearbyPeers={website.localNearbyPeers}
              incomingRequests={website.incomingRequests}
              scanState={website.btScanState}
              scanFeedback={website.btScanFeedback}
              onStartDiscovery={website.startIphoneDiscovery}
              onStopDiscovery={website.stopIphoneDiscovery}
              onConnectNativePeer={website.connectNativeDiscoveredPeer}
              onConnectLocalPeer={website.connectLocalPeer}
              onAcceptRequest={website.acceptIncomingRequest}
              onRejectRequest={website.rejectIncomingRequest}
              onDisconnectContact={website.disconnectContactBluetooth}
              onOpenChat={handleOpenChatWithContact}
              onOpenPairingPage={() => navigate('pairing')}
            />
          )}

          {page === 'private_chats' && (
            <PrivateChatsPage
              contacts={website.contacts}
              messages={website.messages}
              liveConnections={website.liveConnections}
              textSize={website.prefs.textSize}
              pinSecurity={website.pinSecurity}
              folders={website.privateFolders}
              assignments={website.privateAssignments}
              onVerifyPin={website.verifyUserPin}
              onCreateFolder={website.createPrivateFolder}
              onRenameFolder={website.renamePrivateFolder}
              onSetFolderLocked={website.setFolderLocked}
              onDeleteFolder={website.deletePrivateFolder}
              onMoveChatToFolder={website.moveChatToFolder}
              onLockChatToPrivate={website.lockChatAndMoveToPrivate}
              onUnlockChatToNormal={website.unlockChatToNormal}
              onSendMessage={website.sendDirectMessageToContact}
              onRetryMessage={website.retryDirectMessage}
              onToggleReaction={website.toggleDirectMessageReaction}
              onClearConversation={website.clearContactConversation}
              onConnectBluetooth={website.connectContactBluetooth}
              onDisconnectBluetooth={website.disconnectContactBluetooth}
              onPatchContact={website.patchContact}
              onOpenSecuritySettings={() => navigate('privacy')}
              onAddNewContact={() => {
                setDeviceIdPrefill(null);
                navigate('add_contact');
              }}
              onOpenConnectPage={() => navigate('pairing')}
            />
          )}

          {page === 'group' && (
            <GroupChatPage
              rooms={website.groupRooms}
              groupMessages={website.groupMessages}
              contacts={website.contacts}
              onCreateRoom={website.createGroupRoom}
              onSendGroupMessage={website.sendGroupRoomMessage}
              onToggleReaction={website.toggleGroupReaction}
            />
          )}

          {page === 'nearby' && (
            <NearbyDevicesHubPage
              profile={website.profile}
              capabilities={website.capabilities}
              bluetoothRuntime={website.bluetoothRuntime}
              contacts={website.contacts}
              liveConnections={website.liveConnections}
              discoveredBtDevices={website.discoveredBtDevices}
              nativeNearbyPeers={website.nativeNearbyPeers}
              localNearbyPeers={website.localNearbyPeers}
              incomingRequests={website.incomingRequests}
              btScanState={website.btScanState}
              btScanFeedback={website.btScanFeedback}
              overallStatus={website.metrics.overallStatus}
              activeCodeSession={website.activeCodeSession}
              discoveredCodeHosts={website.discoveredCodeHosts}
              pendingCodeApproval={website.pendingCodeApproval}
              codePairingState={website.codePairingState}
              codePairingMessage={website.codePairingMessage}
              onToggleBluetooth={website.toggleBluetoothEnabled}
              onOpenBluetoothSettings={() => navigate('settings')}
              onStartAutoDiscovery={website.startIphoneDiscovery}
              onStopAutoDiscovery={website.stopIphoneDiscovery}
              onScanWebBluetooth={website.scanNearbyWebBluetooth}
              onConnectNativePeer={website.connectNativeDiscoveredPeer}
              onConnectLocalPeer={website.connectLocalPeer}
              onAcceptRequest={website.acceptIncomingRequest}
              onRejectRequest={website.rejectIncomingRequest}
              onDisconnectContact={website.disconnectContactBluetooth}
              onDisconnectAll={website.disconnectAllDevices}
              onOpenChat={handleOpenChatWithContact}
              onEditProfile={() => navigate('profile')}
              onGenerateCode={website.generateConnectionCode}
              onCancelCode={website.cancelConnectionCode}
              onValidateEnteredCode={website.validateEnteredConnectionCode}
              onConfirmCodeRequest={website.confirmAndSendCodeRequest}
              onCancelPendingCodeApproval={website.cancelPendingCodeApproval}
            />
          )}

          {page === 'add_contact' && (
            <AddNewContactPage
              existingDeviceIds={website.contacts.map((c) => c.deviceId)}
              initialDeviceId={deviceIdPrefill}
              discoveredBtDevices={website.discoveredBtDevices}
              localNearbyPeers={website.localNearbyPeers}
              btScanning={website.btScanning}
              btScanFeedback={website.btScanFeedback}
              onScanBluetooth={website.scanNearbyWebBluetooth}
              onConnectLocalPeer={website.connectLocalPeer}
              onOpenChat={handleOpenChatWithContact}
              onSave={(data) => website.saveContactRecord(data)}
              onNavigate={navigate}
              onClearPrefill={() => setDeviceIdPrefill(null)}
            />
          )}

          {page === 'contacts' && (
            <ContactManagementPage
              contacts={website.contacts}
              loading={website.loading}
              storageEngine={website.storageEngine}
              capabilities={website.capabilities}
              liveConnections={website.liveConnections}
              onSaveContact={website.saveContactRecord}
              onDeleteContact={website.deleteContactRecord}
              onPatchContact={website.patchContact}
              onConnectBluetooth={website.connectContactBluetooth}
              onDisconnectBluetooth={website.disconnectContactBluetooth}
              onStartChat={handleOpenChatWithContact}
              onOpenPairingPage={() => navigate('pairing')}
              onNavigateAddContactPage={(prefillDeviceId) => {
                setDeviceIdPrefill(prefillDeviceId ?? null);
                navigate('add_contact');
              }}
            />
          )}

          {page === 'voice' && (
            <VoiceMessagesPage
              contacts={website.contacts}
              voiceClips={website.voiceClips}
              onAddClip={website.addVoiceClip}
              onDeleteClip={website.deleteVoiceClip}
              onSendClipToContact={handleSendVoiceClipToContact}
            />
          )}

          {page === 'files' && (
            <OfflineFileManagerPage
              contacts={website.contacts}
              files={website.stagedFiles}
              onAddFile={website.addStagedFile}
              onDeleteFile={website.deleteStagedFile}
              onShareFile={website.shareFileWithContact}
            />
          )}

          {page === 'network' && (
            <NetworkMapPage
              profile={website.profile}
              contacts={website.contacts}
              liveConnections={website.liveConnections}
              capabilities={website.capabilities}
              onConnectBluetooth={website.connectContactBluetooth}
              onDisconnectBluetooth={website.disconnectContactBluetooth}
              onOpenChat={handleOpenChatWithContact}
            />
          )}

          {page === 'sos' && (
            <EmergencySosPage
              contacts={website.contacts}
              sosRecords={website.sosRecords}
              onPatchContact={website.patchContact}
              onDispatchSos={website.dispatchEmergencySos}
            />
          )}

          {page === 'history' && (
            <MessageHistoryPage
              contacts={website.contacts}
              messages={website.messages}
              isContactPrivate={website.isContactPrivate}
              onOpenChat={handleOpenChatWithContact}
            />
          )}

          {page === 'profile' && (
            <EditProfilePage
              profile={website.profile}
              authUser={auth.user}
              contacts={website.contacts}
              onUpdateProfile={website.updateProfile}
              onSavePermanentProfile={auth.updatePermanentProfile}
              onSendPhoneChangeOtp={auth.sendOtp}
              onConfirmPhoneChange={auth.changePhone}
              onLogout={auth.logout}
              onDeleteAccount={auth.deleteAccount}
              onRotateKeys={website.rotateProfileKeys}
              onNavigate={navigate}
            />
          )}

          {page === 'settings' && (
            <SettingsPage
              prefs={website.prefs}
              capabilities={website.capabilities}
              bluetoothRuntime={website.bluetoothRuntime}
              overallConnectionStatus={website.metrics.overallStatus}
              connectedDevicesCount={website.metrics.connectedDevicesCount}
              storageEngine={website.storageEngine}
              contactsCount={website.contacts.length}
              messagesCount={website.messages.length}
              onToggleBluetooth={website.toggleBluetoothEnabled}
              onRequestBluetoothPermission={website.requestBluetoothPermission}
              onRefreshBluetoothStatus={website.refreshBluetoothStatus}
              onUpdatePrefs={website.updatePrefs}
              onBuildLocalBackup={website.buildLocalWebsiteBackup}
              onRestoreLocalBackup={website.restoreLocalWebsiteBackup}
              onNavigate={navigate}
            />
          )}

          {page === 'privacy' && (
            <PrivacySecurityPage
              pinSecurity={website.pinSecurity}
              privateChatsCount={website.metrics.privateChatsCount}
              privateFoldersCount={website.privateFolders.length}
              onCreatePin={website.createUserPin}
              onChangePin={website.changeUserPin}
              onDisablePin={website.disableUserPin}
              onRecoverWithKey={website.recoverPinWithRecoveryKey}
              onRecoverWithAnswer={website.recoverPinWithSecurityAnswer}
              onLockNow={() => setAppLocked(true)}
              onOpenPrivateChats={() => navigate('private_chats')}
              onClearAllMessages={website.clearAllLocalMessages}
            />
          )}

          {page === 'language' && (
            <LanguageSelectionPage
              currentLanguage={website.prefs.language}
              onSelectLanguage={(code) => website.updatePrefs({ language: code })}
            />
          )}
        </main>
      </div>

      {/* PRIVACY-AWARE INCOMING MESSAGE NOTIFICATION (MASKS PRIVATE PREVIEWS) */}
      {website.incomingToast && (
        <div className="fixed top-16 right-4 z-40 max-w-xs w-full rounded-2xl bg-white dark:bg-[#07152C] border border-blue-500/40 dark:border-cyan-400/40 p-3.5 shadow-2xl flex items-start justify-between gap-2.5">
          <button
            type="button"
            onClick={() => {
              const toast = website.incomingToast!;
              website.dismissIncomingToast();
              if (toast.isPrivate) {
                navigate('private_chats');
              } else {
                handleOpenChatWithContact(toast.contactId);
              }
            }}
            className="text-left min-w-0 flex-1 cursor-pointer"
          >
            <p className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
              {website.incomingToast.isPrivate && <Lock className="w-3.5 h-3.5 text-cyan-400" />}
              <span className="truncate">{website.incomingToast.title}</span>
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-300 truncate mt-0.5">
              {website.incomingToast.preview}
            </p>
          </button>
          <button
            type="button"
            onClick={website.dismissIncomingToast}
            aria-label="Dismiss notification"
            className="w-6 h-6 rounded-lg hover:bg-slate-100 dark:hover:bg-cyan-400/15 flex items-center justify-center text-slate-400 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* CLEAN 5-TAB MOBILE BOTTOM NAVIGATION */}
      <nav
        aria-label="Primary Mobile Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-[60px] bg-white/95 dark:bg-[#040D1F]/95 backdrop-blur-xl border-t border-slate-200 dark:border-cyan-400/20 grid grid-cols-5 px-1.5 gap-1 items-center"
      >
        {MOBILE_BOTTOM_NAV.map((item) => {
          const Icon = item.icon;
          const active = page === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === 'add_contact') setDeviceIdPrefill(null);
                navigate(item.id);
              }}
              className={`h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                active
                  ? 'text-blue-600 dark:text-cyan-300 bg-blue-50 dark:bg-cyan-500/15 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-[10px] leading-none whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* GLOBAL BLUETOOTH / LOCAL CONNECTION REQUEST POPUP MODAL */}
      {website.incomingRequests.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fc-conn-req-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#020817]/75 backdrop-blur-sm"
        >
          {(() => {
            const activeReq = website.incomingRequests[0];
            return (
              <div className="w-full max-w-md rounded-3xl bg-[#06152E] text-white border border-[#38D9FF]/50 p-6 space-y-5 shadow-[0_24px_80px_rgba(6,21,46,0.9)]">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#168BFF] to-[#38D9FF] flex items-center justify-center shrink-0 shadow-[0_0_24px_rgba(22,139,255,0.45)]">
                    <Bluetooth className="w-6 h-6 text-[#06152E]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 id="fc-conn-req-title" className="text-lg font-extrabold text-white">
                      Connection Request
                    </h2>
                    <p className="text-sm text-slate-200 mt-1">
                      Someone wants to connect with you.
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl bg-[#0A1F40] border border-[#123B68] p-4 space-y-1">
                  <p className="text-sm font-bold text-white truncate">{activeReq.peerName}</p>
                  <p className="text-xs text-[#38D9FF] font-mono">
                    {activeReq.deviceCode ?? activeReq.peerId.slice(0, 12)} ·{' '}
                    {activeReq.transport === 'native_ble'
                      ? 'Native Bluetooth LE'
                      : activeReq.transport === 'native_wifi_direct'
                        ? 'Apple Multipeer / Wi-Fi Direct'
                        : 'Local Offline Channel'}
                  </p>
                  <p className="text-xs text-slate-400 pt-1">
                    No automatic connection will be opened until you approve.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => website.rejectIncomingRequest(activeReq)}
                    className="h-11 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/45 text-rose-100 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const contact = await website.acceptIncomingRequest(activeReq);
                      if (contact) {
                        handleOpenChatWithContact(contact.id);
                      }
                    }}
                    className="h-11 rounded-xl bg-gradient-to-r from-[#168BFF] to-[#38D9FF] hover:brightness-110 text-[#06152E] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    Accept
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* GLOBAL PAIRING CODE CONNECTION REQUEST MODAL (Always requires explicit Accept / Reject) */}
      {website.incomingRequests.length === 0 &&
        pairing.incomingPendingRequests.length > 0 &&
        page !== 'pairing' && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fc-pairing-req-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#020817]/75 backdrop-blur-sm"
          >
            {(() => {
              const req = pairing.incomingPendingRequests[0];
              return (
                <div className="w-full max-w-md rounded-3xl bg-[#06152E] text-white border border-[#38D9FF]/50 p-6 space-y-5 shadow-[0_24px_80px_rgba(6,21,46,0.9)]">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#168BFF] to-[#38D9FF] flex items-center justify-center shrink-0 shadow-[0_0_24px_rgba(22,139,255,0.45)]">
                      <KeyRound className="w-6 h-6 text-[#06152E]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 id="fc-pairing-req-title" className="text-lg font-extrabold text-white">
                        Pairing Code Request
                      </h2>
                      <p className="text-sm text-slate-200 mt-1">
                        A user verified your 6-digit code and wants to connect.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[#0A1F40] border border-[#123B68] p-4 space-y-1.5">
                    <p className="text-sm font-bold text-white truncate">
                      {req.peer.displayName}{' '}
                      <span className="text-xs font-mono text-[#38D9FF]">{req.peer.username}</span>
                    </p>
                    <p className="text-xs text-slate-300 font-mono tabular-nums">
                      Code: {req.code.slice(0, 3)} {req.code.slice(3)} · {req.peer.platform}
                    </p>
                    <p className="text-xs text-slate-400 pt-1">
                      No connection will be created until you tap Accept.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={pairingReqBusy}
                      onClick={async () => {
                        setPairingReqBusy(true);
                        try {
                          await pairing.respondRequest(req.id, false);
                        } finally {
                          setPairingReqBusy(false);
                        }
                      }}
                      className="h-11 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/45 text-rose-100 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={pairingReqBusy}
                      onClick={async () => {
                        setPairingReqBusy(true);
                        try {
                          const res = await pairing.respondRequest(req.id, true);
                          if (res.ok && res.roomId) {
                            await pairing.loadRoomMessages(res.roomId);
                            navigate('pairing');
                          }
                        } finally {
                          setPairingReqBusy(false);
                        }
                      }}
                      className="h-11 rounded-xl bg-gradient-to-r from-[#168BFF] to-[#38D9FF] hover:brightness-110 text-[#06152E] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {pairingReqBusy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Accept
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
    </div>
  );
}

export default App;
