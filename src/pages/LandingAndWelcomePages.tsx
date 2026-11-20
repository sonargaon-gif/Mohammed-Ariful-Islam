import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CreditCard,
  Database,
  Globe,
  KeyRound,
  Lock,
  MessageSquare,
  Radio,
  ShieldCheck,
  SignalZero,
  Smartphone,
  Users,
  WifiOff,
} from 'lucide-react';
import { UserProfileRecord, WebsitePage } from '../types/contacts';
import { TranslationBundle } from '../i18n/translations';
import { FreeConnectLogoMark, FreeConnectWordmark } from '../components/FreeConnectLogo';

const HERO_EARTH_IMG = '/src/assets/images/freeconnect_hero_mesh_1795073452538.jpg';
const FUTURISTIC_BG_IMG = '/src/assets/images/freeconnect_futuristic_bg_1795073450644.jpg';

interface LandingPageProps {
  t: TranslationBundle;
  totalContacts: number;
  connectedCount: number;
  webBtSupported: boolean;
  onNavigate: (page: WebsitePage) => void;
}

export function LandingPage({
  t,
  totalContacts,
  connectedCount,
  webBtSupported,
  onNavigate,
}: LandingPageProps) {
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 h-16 px-6 lg:px-12 bg-white/85 dark:bg-[#020817]/85 backdrop-blur-xl border-b border-slate-200 dark:border-cyan-400/15 flex items-center justify-between gap-8">
        <a
          href="#hero"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('landing');
          }}
          className="inline-flex items-center whitespace-nowrap shrink-0"
        >
          <FreeConnectWordmark size="sm" />
        </a>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          {(
            [
              ['welcome', 'Welcome'],
              ['dashboard', 'Dashboard'],
              ['contacts', 'Contacts'],
              ['network', 'Network'],
              ['language', 'Language'],
            ] as [WebsitePage, string][]
          ).map(([page, label]) => (
            <button
              key={page}
              type="button"
              onClick={() => onNavigate(page)}
              className="text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] hover:brightness-110 text-white text-xs font-bold tracking-wide border border-cyan-300/45 shadow-[0_0_22px_rgba(37,99,235,0.45)] transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            Open Web App
          </button>
        </div>
      </header>

      {/* Main Marketing & Product Narrative */}
      <main id="hero" className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-slate-200 dark:border-cyan-400/15 bg-[#020714]">
          {!heroImgFailed && (
            <img
              src={HERO_EARTH_IMG}
              alt="FreeConnect futuristic digital Earth and glowing Bluetooth wireless network"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgFailed(true)}
              className="absolute inset-0 w-full h-full object-cover object-center opacity-60 pointer-events-none"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-[#020714]/96 via-[#041028]/82 to-[#020714]/55 pointer-events-none" />

          <div className="relative z-10 max-w-[1360px] mx-auto px-6 lg:px-12 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-cyan-300 tracking-wider">
                <span>{t.offlineMessenger}</span>
                <span aria-hidden="true">·</span>
                <span>{t.slogan}</span>
              </div>

              <h1
                className="font-extrabold text-white tracking-tight leading-[1.08] text-balance"
                style={{ fontSize: 'clamp(2.35rem, 4.4vw, 3.85rem)' }}
              >
                Connect, chat, and share without internet.
              </h1>

              <p className="text-base sm:text-lg text-slate-300 max-w-2xl leading-relaxed">
                FREECONNECT is a cross-platform communication workspace combining local IndexedDB contact management, a verified 6-digit Pairing Code system with WhatsApp sharing, Web Bluetooth hardware pairing, voice notes, offline file staging, and end-to-end Web Crypto protection.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate('dashboard')}
                  className="px-6 h-12 rounded-2xl bg-gradient-to-r from-[#2563EB] via-[#2F7CF6] to-[#06B6D4] hover:brightness-110 text-white text-sm font-bold tracking-wide border border-cyan-300/60 shadow-[0_0_30px_rgba(37,99,235,0.55)] flex items-center gap-2 transition-all active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Launch Dashboard
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('welcome')}
                  className="px-6 h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-cyan-400/35 text-cyan-200 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Open Welcome Page
                </button>
              </div>
            </div>

            {/* Right Focal Luminous Bluetooth Visual Frame */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center">
              <div className="w-full max-w-md rounded-3xl bg-[#05122B]/75 backdrop-blur-2xl border border-cyan-400/30 p-7 text-center space-y-6 shadow-[0_0_60px_rgba(37,99,235,0.28)]">
                <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
                  <div className="absolute inset-0 rounded-[34px] border border-cyan-400/30 fc-signal-wave" />
                  <div className="absolute inset-2.5 rounded-[30px] border border-blue-400/35" />
                  <FreeConnectLogoMark size="hero" />
                </div>

                <div className="space-y-1">
                  <p className="text-xl font-extrabold tracking-[0.14em] text-white">
                    FREE
                    <span className="bg-gradient-to-r from-[#168BFF] to-[#38D9FF] bg-clip-text text-transparent">
                      CONNECT
                    </span>
                  </p>
                  <p className="text-xs font-mono text-cyan-300">{t.offlineMessenger}</p>
                </div>

                {/* Live Honest Local Workspace Metrics */}
                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-cyan-400/20 font-mono tabular-nums text-left">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Contacts</span>
                    <span className="text-sm font-bold text-white">{totalContacts} saved</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Live BT</span>
                    <span className="text-sm font-bold text-cyan-300">{connectedCount} active</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Browser BT</span>
                    <span className="text-sm font-bold text-emerald-400">
                      {webBtSupported ? 'API Ready' : 'Limited'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4 Offline Guarantees Strip (Clean Unboxed Hairline Columns) */}
        <section className="border-b border-slate-200 dark:border-cyan-400/15 bg-white/80 dark:bg-[#040C1E]/85 backdrop-blur-xl">
          <div className="max-w-[1360px] mx-auto px-6 lg:px-12 py-8 grid grid-cols-2 lg:grid-cols-4 gap-6 lg:divide-x divide-slate-200 dark:divide-cyan-400/15">
            {[
              { icon: WifiOff, title: t.noInternet, desc: 'Offline messaging & local IndexedDB storage without cloud servers.' },
              { icon: SignalZero, title: t.noMobileData, desc: 'Zero cellular bandwidth or background telemetry transfers.' },
              { icon: Smartphone, title: t.noSimBalance, desc: 'No phone number required — communicate with FreeConnect Device IDs.' },
              { icon: CreditCard, title: t.noSubscription, desc: '100% free open communication workspace with zero paywalls.' },
            ].map(({ icon: Icon, title, desc }, idx) => (
              <div key={title} className={idx > 0 ? 'lg:pl-6' : ''}>
                <Icon className="w-5 h-5 text-blue-600 dark:text-cyan-400 mb-2.5" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Asymmetric Bento Capability Showcase */}
        <section className="max-w-[1360px] mx-auto px-6 lg:px-12 py-16 space-y-10">
          <div className="max-w-2xl">
            <p className="text-xs font-mono text-blue-600 dark:text-cyan-300 mb-2">
              01. Complete Offline Web Architecture
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight text-balance">
              Everything needed for local-first communication in one futuristic web platform.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Marquee Card 1: Chat & Messaging */}
            <button
              type="button"
              onClick={() => onNavigate('chat')}
              className="md:col-span-7 text-left rounded-3xl bg-white dark:bg-[#07152C]/75 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/25 hover:border-blue-500 dark:hover:border-cyan-300/60 p-7 transition-all group cursor-pointer"
            >
              <MessageSquare className="w-6 h-6 text-blue-600 dark:text-cyan-400 mb-4" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Split-Pane Offline Chat, Voice Notes & File Attachments
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed max-w-xl">
                Message saved contacts with emoji reactions, local voice message recording & playback, file staging, and clear offline queue vs live Bluetooth delivery receipts.
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-cyan-300 mt-5 group-hover:translate-x-0.5 transition-transform">
                Open Chat Workspace <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </button>

            {/* Card 2: Contact Management */}
            <button
              type="button"
              onClick={() => onNavigate('contacts')}
              className="md:col-span-5 text-left rounded-3xl bg-white dark:bg-[#07152C]/75 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/25 hover:border-blue-500 dark:hover:border-cyan-300/60 p-7 transition-all group cursor-pointer"
            >
              <Users className="w-6 h-6 text-blue-600 dark:text-cyan-400 mb-4" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                IndexedDB Contact Management
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                Add, edit, search, favorite, and block contacts locally with unique FreeConnect Device IDs and zero cloud sync.
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-cyan-300 mt-5 group-hover:translate-x-0.5 transition-transform">
                Manage Contacts <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </button>

            {/* Card 3: 6-Digit Pairing Code System */}
            <button
              type="button"
              onClick={() => onNavigate('pairing')}
              className="md:col-span-4 text-left rounded-3xl bg-white dark:bg-[#07152C]/75 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/25 hover:border-blue-500 dark:hover:border-cyan-300/60 p-6 transition-all group cursor-pointer"
            >
              <KeyRound className="w-6 h-6 text-blue-600 dark:text-cyan-400 mb-3.5" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                6-Digit Pairing Code System
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                Claim a unique backend-verified 6-digit code, share it via WhatsApp, approve requests, and chat across iPhone, Android, and Desktop.
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-cyan-300 mt-4">
                Open Pairing Codes <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </button>

            {/* Card 4: Network Map & Web Bluetooth */}
            <button
              type="button"
              onClick={() => onNavigate('network')}
              className="md:col-span-4 text-left rounded-3xl bg-white dark:bg-[#07152C]/75 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/25 hover:border-blue-500 dark:hover:border-cyan-300/60 p-6 transition-all group cursor-pointer"
            >
              <Radio className="w-6 h-6 text-blue-600 dark:text-cyan-400 mb-3.5" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Interactive Bluetooth Network Map
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                Visualize your local browser node, live Web Bluetooth GATT sessions, and saved offline peers honestly.
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-cyan-300 mt-4">
                Inspect Network Map <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </button>

            {/* Card 5: Emergency SOS & Security */}
            <button
              type="button"
              onClick={() => onNavigate('sos')}
              className="md:col-span-4 text-left rounded-3xl bg-white dark:bg-[#07152C]/75 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/25 hover:border-red-400/60 p-6 transition-all group cursor-pointer"
            >
              <AlertTriangle className="w-6 h-6 text-red-500 dark:text-red-400 mb-3.5" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Emergency SOS & Local Privacy
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                Dispatch priority SOS alerts to designated contacts, protect your workspace with an App PIN, and keep data strictly on-device.
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 dark:text-red-400 mt-4">
                Open Emergency SOS <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </button>
          </div>
        </section>

        {/* Honest Browser & Security Transparency Section */}
        <section className="max-w-[1360px] mx-auto px-6 lg:px-12 pb-16">
          <div className="rounded-3xl bg-white dark:bg-[#061328]/85 border border-slate-200 dark:border-cyan-400/20 p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div>
              <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-cyan-400 mb-3" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Zero Simulated Connections
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                FreeConnect uses real browser APIs (<code className="font-mono">navigator.bluetooth</code>, <code className="font-mono">IndexedDB</code>, <code className="font-mono">Web Crypto</code>, <code className="font-mono">MediaRecorder</code>). Saved contacts remain clearly marked Disconnected until real Bluetooth pairing occurs.
              </p>
            </div>
            <div>
              <Database className="w-5 h-5 text-blue-600 dark:text-cyan-400 mb-3" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                100% Browser-Local Persistence
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                Contacts, avatars, conversations, voice clips, and settings stay inside your browser&apos;s IndexedDB and localStorage across refreshes — never transmitted to third-party servers.
              </p>
            </div>
            <div>
              <Globe className="w-5 h-5 text-blue-600 dark:text-cyan-400 mb-3" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Multi-Language & Responsive Web
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                Designed natively for desktop, laptop, tablet, and mobile browsers with Dark/Light modes and full English, Bengali, Hindi, and Arabic (RTL) support.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-cyan-400/15 bg-white/75 dark:bg-[#020817]/90 py-6 px-6 lg:px-12">
        <div className="max-w-[1360px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 dark:text-white tracking-wider">FREECONNECT</span>
            <span>·</span>
            <span>{t.offlineMessenger}</span>
            <span>·</span>
            <span className="text-blue-600 dark:text-cyan-300 font-medium">{t.slogan}</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <button type="button" onClick={() => onNavigate('privacy')} className="hover:text-cyan-400 cursor-pointer">
              Privacy & Security
            </button>
            <button type="button" onClick={() => onNavigate('settings')} className="hover:text-cyan-400 cursor-pointer">
              Settings
            </button>
            <button type="button" onClick={() => onNavigate('language')} className="hover:text-cyan-400 cursor-pointer">
              Language
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

interface WelcomePageProps {
  t: TranslationBundle;
  profile: UserProfileRecord;
  onUpdateProfile: (patch: Partial<UserProfileRecord>) => void;
  onNavigate: (page: WebsitePage) => void;
}

export function WelcomePage({
  t,
  profile,
  onUpdateProfile,
  onNavigate,
}: WelcomePageProps) {
  const [nameInput, setNameInput] = useState(profile.name);
  const [bgFailed, setBgFailed] = useState(false);

  const handleStart = () => {
    const clean = nameInput.trim();
    if (clean) {
      onUpdateProfile({
        name: clean,
        username: `@${clean.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      });
    }
    onNavigate('dashboard');
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden bg-[#020714] text-white">
      {!bgFailed && (
        <img
          src={FUTURISTIC_BG_IMG}
          alt="FreeConnect luminous Bluetooth welcome backdrop"
          referrerPolicy="no-referrer"
          onError={() => setBgFailed(true)}
          className="absolute inset-0 w-full h-full object-cover opacity-50 pointer-events-none"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-[#020714]/88 via-[#04112A]/72 to-[#020714]/96 pointer-events-none" />

      <div className="relative z-10 w-full max-w-2xl rounded-3xl bg-[#05122B]/80 backdrop-blur-2xl border border-cyan-400/30 p-8 sm:p-10 text-center space-y-7 shadow-[0_24px_80px_rgba(3,8,20,0.75)]">
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[0.16em] text-white drop-shadow-[0_0_22px_rgba(34,211,238,0.45)]">
            {t.appName}
          </h1>
          <p className="text-xs sm:text-sm font-mono text-cyan-300 tracking-widest">
            {t.offlineMessenger}
          </p>
          <p className="text-sm sm:text-base text-slate-200 pt-1">{t.tagline}</p>
        </div>

        {/* Bespoke FreeConnect Emblem Centerpiece */}
        <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
          <div className="absolute inset-0 rounded-[34px] border border-cyan-400/35 fc-signal-wave" />
          <div className="absolute inset-2.5 rounded-[30px] border border-blue-400/35" />
          <FreeConnectLogoMark size="hero" />
        </div>

        {/* Four Offline Guarantees */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: WifiOff, label: t.noInternet },
            { icon: SignalZero, label: t.noMobileData },
            { icon: Smartphone, label: t.noSimBalance },
            { icon: CreditCard, label: t.noSubscription },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="rounded-2xl bg-[#081A3A]/75 border border-cyan-400/20 p-3 flex flex-col items-center gap-2"
            >
              <Icon className="w-4 h-4 text-cyan-300" />
              <span className="text-[11px] font-medium text-slate-200">{label}</span>
            </div>
          ))}
        </div>

        {/* Quick Local Identity Setup */}
        <div className="max-w-md mx-auto space-y-2.5 text-left">
          <label className="block text-xs font-medium text-slate-300">
            Your Local Display Name (stored only in this browser)
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Enter your name"
              className="flex-1 h-11 px-4 rounded-xl bg-[#030B1D] border border-cyan-400/30 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-300"
            />
            <div className="h-11 px-3.5 rounded-xl bg-[#030B1D] border border-cyan-400/20 flex items-center gap-1.5 font-mono text-xs text-cyan-300 shrink-0">
              <Lock className="w-3.5 h-3.5" />
              {profile.deviceId}
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-1">
          <button
            type="button"
            onClick={handleStart}
            className="w-full max-w-md h-12 mx-auto rounded-2xl bg-gradient-to-r from-[#2563EB] via-[#2F7CF6] to-[#06B6D4] hover:brightness-110 text-white text-sm font-bold tracking-[0.12em] border border-cyan-300/60 shadow-[0_0_28px_rgba(37,99,235,0.55)] transition-all active:scale-[0.98] cursor-pointer"
          >
            {t.startConnecting}
          </button>

          <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
            <button
              type="button"
              onClick={() => onNavigate('landing')}
              className="hover:text-cyan-300 cursor-pointer"
            >
              Back to Landing Page
            </button>
            <span>·</span>
            <span className="text-cyan-300 font-medium">{t.slogan}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
