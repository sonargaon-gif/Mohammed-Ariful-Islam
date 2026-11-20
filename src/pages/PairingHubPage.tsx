import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  Smartphone,
  Unplug,
  UserCheck,
  X,
} from 'lucide-react';
import {
  ActivePairingClaim,
  CodeVerificationResult,
  PairedPrivateRoom,
  PairedRoomMessage,
  PairingPoolCard,
  PairingRequestRecord,
  PairingSessionUser,
} from '../types/pairing';
import {
  buildOfficialWhatsAppShareUrl,
  buildWhatsAppPairingMessage,
} from '../utils/pairingApi';
import { getInitials } from '../utils/contactQrCodec';

const NAVY_BG_IMG = '/src/assets/images/freeconnect_futuristic_bg_1795073450644.jpg';

interface PairingHubPageProps {
  sessionUser: PairingSessionUser | null;
  sessionReady: boolean;
  sessionError: string | null;
  wsConnected: boolean;
  poolCards: PairingPoolCard[];
  poolAvailableCount: number;
  poolLoading: boolean;
  myClaim: ActivePairingClaim | null;
  incomingPendingRequests: PairingRequestRecord[];
  outgoingRequests: PairingRequestRecord[];
  rooms: PairedPrivateRoom[];
  messagesByRoom: Record<string, PairedRoomMessage[]>;
  activeRoomId: string | null;
  verificationResult: CodeVerificationResult | null;
  onRefreshPool: () => Promise<void>;
  onSelectCode: (code: string) => Promise<{ ok: boolean; message: string }>;
  onCancelMyCode: () => Promise<{ ok: boolean; message: string }>;
  onVerifyCode: (code: string) => Promise<CodeVerificationResult>;
  onClearVerification: () => void;
  onSendRequest: (code: string) => Promise<{ ok: boolean; message: string }>;
  onRespondRequest: (
    requestId: string,
    accept: boolean
  ) => Promise<{ ok: boolean; roomId?: string; message: string }>;
  onOpenRoom: (roomId: string) => Promise<void>;
  onSendPrivateMessage: (roomId: string, text: string) => Promise<{ ok: boolean; error?: string }>;
  onDisconnectRoom: (roomId: string) => Promise<{ ok: boolean; error?: string }>;
  onOpenAdmin: () => void;
}

function formatCodeSpaced(code: string): string {
  const digits = code.replace(/\D/g, '').slice(0, 6);
  return digits.length === 6 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
}

function formatCountdown(msRemaining: number): string {
  const sec = Math.max(0, Math.ceil(msRemaining / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function verdictBannerInfo(verdict: CodeVerificationResult['verdict']): {
  title: string;
  cls: string;
} {
  switch (verdict) {
    case 'valid':
      return {
        title: 'Valid Code',
        cls: 'bg-emerald-500/15 border-emerald-400/45 text-emerald-200',
      };
    case 'already_used':
      return {
        title: 'Code Already Used',
        cls: 'bg-amber-500/15 border-amber-400/45 text-amber-100',
      };
    case 'expired':
      return {
        title: 'Code Expired',
        cls: 'bg-amber-500/15 border-amber-400/45 text-amber-100',
      };
    case 'user_not_available':
      return {
        title: 'User Not Available',
        cls: 'bg-slate-500/20 border-slate-400/40 text-slate-200',
      };
    default:
      return {
        title: 'Invalid Code',
        cls: 'bg-rose-500/15 border-rose-400/45 text-rose-100',
      };
  }
}

export function PairingHubPage({
  sessionUser,
  sessionReady,
  sessionError,
  wsConnected,
  poolCards,
  poolAvailableCount,
  poolLoading,
  myClaim,
  incomingPendingRequests,
  outgoingRequests,
  rooms,
  messagesByRoom,
  activeRoomId,
  verificationResult,
  onRefreshPool,
  onSelectCode,
  onCancelMyCode,
  onVerifyCode,
  onClearVerification,
  onSendRequest,
  onRespondRequest,
  onOpenRoom,
  onSendPrivateMessage,
  onDisconnectRoom,
  onOpenAdmin,
}: PairingHubPageProps) {
  const [activeTab, setActiveTab] = useState<'choose' | 'enter' | 'chats'>('choose');
  const [showPoolForChange, setShowPoolForChange] = useState(false);
  const [selectingCode, setSelectingCode] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [whatsAppOpenedNotice, setWhatsAppOpenedNotice] = useState(false);

  const [enteredCode, setEnteredCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [requestNotice, setRequestNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [bgFailed, setBgFailed] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Live 1-second timer for 10-minute code expiration countdown
  useEffect(() => {
    if (!myClaim) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      const t = Date.now();
      setNowMs(t);
      if (myClaim && t >= myClaim.expiresAt) {
        void onRefreshPool();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [myClaim, onRefreshPool]);

  // Switch automatically to Private Paired Chats when an activeRoomId is set via acceptance
  useEffect(() => {
    if (activeRoomId && rooms.some((r) => r.id === activeRoomId)) {
      void onOpenRoom(activeRoomId);
    }
  }, [activeRoomId, rooms, onOpenRoom]);

  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) ?? null,
    [rooms, activeRoomId]
  );

  const activeMessages = useMemo(
    () => (activeRoom ? messagesByRoom[activeRoom.id] ?? [] : []),
    [activeRoom, messagesByRoom]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, activeRoom?.id]);

  const claimRemainingMs = myClaim ? Math.max(0, myClaim.expiresAt - nowMs) : 0;
  const activeRoomsCount = rooms.filter((r) => r.status === 'active').length;

  const handleSelectCode = async (code: string) => {
    setSelectingCode(code);
    setActionFeedback(null);
    setWhatsAppOpenedNotice(false);
    try {
      const res = await onSelectCode(code);
      setActionFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setShowPoolForChange(false);
      }
    } finally {
      setSelectingCode(null);
    }
  };

  const handleCancelCode = async () => {
    setActionFeedback(null);
    setWhatsAppOpenedNotice(false);
    const res = await onCancelMyCode();
    setActionFeedback({ ok: res.ok, text: res.message });
    setShowPoolForChange(false);
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2200);
    } catch {
      setActionFeedback({
        ok: false,
        text: `Copy failed — manually copy your 6-digit code: ${code}`,
      });
    }
  };

  const handleVerifySubmit = async (e: FormEvent) => {
    e.preventDefault();
    setRequestNotice(null);
    setVerifying(true);
    try {
      await onVerifyCode(enteredCode);
    } finally {
      setVerifying(false);
    }
  };

  const handleSendConnectionRequest = async () => {
    if (!verificationResult || verificationResult.verdict !== 'valid') return;
    setSendingRequest(true);
    setRequestNotice(null);
    try {
      const res = await onSendRequest(verificationResult.code);
      setRequestNotice({ ok: res.ok, text: res.message });
    } finally {
      setSendingRequest(false);
    }
  };

  const handleRespondIncoming = async (requestId: string, accept: boolean) => {
    setRespondingId(requestId);
    setActionFeedback(null);
    try {
      const res = await onRespondRequest(requestId, accept);
      setActionFeedback({ ok: res.ok, text: res.message });
      if (res.ok && accept && res.roomId) {
        setActiveTab('chats');
        await onOpenRoom(res.roomId);
      }
    } finally {
      setRespondingId(null);
    }
  };

  const handleSendChat = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeRoom || !draftText.trim() || sendingMsg) return;
    setSendingMsg(true);
    setChatError(null);
    const toSend = draftText;
    setDraftText('');
    try {
      const res = await onSendPrivateMessage(activeRoom.id, toSend);
      if (!res.ok) {
        setChatError(res.error ?? 'Message failed to send.');
      }
    } finally {
      setSendingMsg(false);
    }
  };

  return (
    <div className="relative rounded-3xl overflow-hidden border border-[#168BFF]/35 shadow-[0_24px_80px_rgba(6,21,46,0.65)] bg-[#06152E] text-white">
      {/* Subtle Navy Backdrop */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {!bgFailed && (
          <img
            src={NAVY_BG_IMG}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            onError={() => setBgFailed(true)}
            className="w-full h-full object-cover opacity-35"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#06152E]/94 via-[#0A1F40]/90 to-[#06152E]/96" />
      </div>

      <div className="relative z-10 p-5 sm:p-7 lg:p-8 space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#123B68]">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono text-[#38D9FF]">
              <span>Random Pre-Generated Pairing Code System</span>
              <span aria-hidden="true">·</span>
              <span>iPhone &amp; Android Cross-Platform</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Connect with 6-Digit Pairing Code
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300 font-mono tabular-nums">
              <span>{poolAvailableCount.toLocaleString()} codes available in backend pool</span>
              <span aria-hidden="true">·</span>
              <span>{activeRoomsCount} active private chat{activeRoomsCount === 1 ? '' : 's'}</span>
              <span aria-hidden="true">·</span>
              <span className={wsConnected ? 'text-emerald-300' : 'text-amber-300'}>
                {wsConnected ? 'Live sync active' : sessionReady ? 'Reconnecting...' : 'Initializing...'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onOpenAdmin}
              className="px-3.5 h-10 rounded-xl bg-[#0A1F40] hover:bg-[#123B68] border border-[#123B68] text-xs font-semibold text-slate-200 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-[#38D9FF]" />
              Admin Control Center
            </button>
          </div>
        </div>

        {sessionError && (
          <div className="rounded-xl bg-rose-500/15 border border-rose-400/45 px-4 py-3 text-xs text-rose-100 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{sessionError}</span>
          </div>
        )}

        {/* Incoming Connection Requests Banner (Never Auto-Connects) */}
        {incomingPendingRequests.length > 0 && (
          <section
            aria-label="Incoming Connection Requests"
            className="rounded-2xl bg-[#123B68]/85 border border-[#38D9FF]/60 p-5 space-y-3 shadow-[0_0_32px_rgba(56,217,255,0.2)]"
          >
            <div className="flex items-center gap-2 text-[#38D9FF]">
              <UserCheck className="w-5 h-5 shrink-0" />
              <h2 className="text-sm font-extrabold text-white">
                Incoming Connection Request ({incomingPendingRequests.length})
              </h2>
            </div>

            <div className="divide-y divide-[#38D9FF]/20">
              {incomingPendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="py-3 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {req.peer.avatarDataUrl ? (
                      <img
                        src={req.peer.avatarDataUrl}
                        alt={req.peer.displayName}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-xl object-cover border border-[#38D9FF]/45 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#168BFF] to-[#38D9FF] flex items-center justify-center text-xs font-extrabold text-[#06152E] shrink-0">
                        {getInitials(req.peer.displayName)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">
                        {req.peer.displayName}{' '}
                        <span className="font-mono text-xs text-[#38D9FF]">{req.peer.username}</span>
                      </p>
                      <p className="text-xs text-slate-200 font-mono">
                        Code {formatCodeSpaced(req.code)} · {req.peer.platform} ·{' '}
                        {req.peer.online ? 'Online' : 'Recently Active'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={respondingId === req.id}
                      onClick={() => void handleRespondIncoming(req.id, false)}
                      className="px-3.5 h-9 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/45 text-rose-100 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={respondingId === req.id}
                      onClick={() => void handleRespondIncoming(req.id, true)}
                      className="px-4 h-9 rounded-xl bg-gradient-to-r from-[#168BFF] to-[#38D9FF] hover:brightness-110 text-[#06152E] text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      {respondingId === req.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Segmented Control Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#0A1F40] border border-[#123B68]">
            <button
              type="button"
              onClick={() => setActiveTab('choose')}
              className={`px-4 h-9 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'choose'
                  ? 'bg-[#168BFF] text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              Choose Your Connection Code
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('enter')}
              className={`px-4 h-9 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'enter'
                  ? 'bg-[#168BFF] text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              Enter Connection Code
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('chats')}
              className={`px-4 h-9 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'chats'
                  ? 'bg-[#168BFF] text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Private Paired Chats
              {activeRoomsCount > 0 && (
                <span className="font-mono tabular-nums text-[11px] opacity-90">
                  ({activeRoomsCount})
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ============================================================
            TAB 1: CHOOSE YOUR CONNECTION CODE
           ============================================================ */}
        {activeTab === 'choose' && (
          <div className="space-y-6">
            {actionFeedback && (
              <div
                role="status"
                className={`rounded-xl px-4 py-3 border text-xs flex items-start gap-2 ${
                  actionFeedback.ok
                    ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-100'
                    : 'bg-amber-500/15 border-amber-400/45 text-amber-100'
                }`}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{actionFeedback.text}</span>
              </div>
            )}

            {/* MY CONNECTION CODE PANEL (When User Has Claimed a Code) */}
            {myClaim && (
              <section
                aria-label="My Connection Code"
                className="rounded-2xl bg-[#0A1F40]/95 border border-[#38D9FF]/50 p-6 space-y-5 shadow-[0_0_40px_rgba(22,139,255,0.22)]"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-mono text-[#38D9FF]">
                      My Connection Code
                      {sessionUser && (
                        <span className="text-slate-400">
                          {' '}
                          · Linked to {sessionUser.fullName} ({sessionUser.id})
                        </span>
                      )}
                    </p>
                    <p className="text-4xl sm:text-5xl font-extrabold font-mono tabular-nums tracking-[0.18em] text-white">
                      {formatCodeSpaced(myClaim.code)}
                    </p>
                    <p className="text-xs text-slate-300 flex items-center gap-1.5 font-mono tabular-nums pt-1">
                      <Clock className="w-3.5 h-3.5 text-[#38D9FF]" />
                      Expires in {formatCountdown(claimRemainingMs)} · Single-use private pairing
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => void handleCopyCode(myClaim.code)}
                      className="px-4 h-10 rounded-xl bg-[#123B68] hover:bg-[#194c84] border border-[#38D9FF]/40 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      {copiedCode ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-300" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 text-[#38D9FF]" />
                          Copy Code
                        </>
                      )}
                    </button>

                    <a
                      href={buildOfficialWhatsAppShareUrl(myClaim.code)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setWhatsAppOpenedNotice(true)}
                      className="px-4 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Share2 className="w-4 h-4" />
                      Share via WhatsApp
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        setShowPoolForChange((v) => !v);
                        void onRefreshPool();
                      }}
                      className="px-3.5 h-10 rounded-xl bg-[#06152E] hover:bg-[#123B68] border border-[#123B68] text-slate-200 text-xs font-semibold whitespace-nowrap cursor-pointer"
                    >
                      Change Code
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleCancelCode()}
                      className="px-3.5 h-10 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/40 text-rose-200 text-xs font-semibold whitespace-nowrap cursor-pointer"
                    >
                      Cancel Code
                    </button>
                  </div>
                </div>

                {/* Prepared WhatsApp message preview & honest delivery disclaimer */}
                <div className="rounded-xl bg-[#06152E]/90 border border-[#123B68] p-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-300">
                    Prepared WhatsApp Message:
                  </p>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    &ldquo;{buildWhatsAppPairingMessage(myClaim.code)}&rdquo;
                  </p>
                  {whatsAppOpenedNotice && (
                    <p className="text-xs text-amber-200 pt-1">
                      WhatsApp share window opened. Choose a contact inside WhatsApp and tap Send —
                      FreeConnect cannot confirm delivery until your contact enters this code and
                      sends you a request.
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* SELECTABLE RANDOM CODE CARDS FROM BACKEND POOL */}
            {(!myClaim || showPoolForChange) && (
              <section
                aria-label="Choose Your Connection Code"
                className="rounded-2xl bg-[#0A1F40]/90 border border-[#123B68] p-5 sm:p-6 space-y-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-extrabold text-white">
                      Choose Your Connection Code
                    </h2>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Select an available 6-digit code reserved atomically from our backend database.
                      Codes expire automatically after 10 minutes.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={poolLoading}
                    onClick={() => void onRefreshPool()}
                    className="px-3.5 h-9 rounded-xl bg-[#06152E] hover:bg-[#123B68] border border-[#168BFF]/40 text-xs font-semibold text-[#38D9FF] flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${poolLoading ? 'animate-spin' : ''}`} />
                    Show Different Codes
                  </button>
                </div>

                {poolLoading && poolCards.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-300 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-[#38D9FF]" />
                    Loading pre-generated random codes from backend database...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {poolCards.map((card) => {
                      const isTaken = card.status === 'taken';
                      const isBusy = selectingCode === card.code;
                      return (
                        <div
                          key={card.code}
                          className={`rounded-2xl p-4 border flex items-center justify-between gap-3 transition-colors ${
                            card.isMine
                              ? 'bg-[#123B68]/80 border-[#38D9FF]/60'
                              : isTaken
                                ? 'bg-[#06152E]/60 border-white/10 opacity-75'
                                : 'bg-[#06152E]/90 border-[#123B68] hover:border-[#38D9FF]/55'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xl font-extrabold font-mono tabular-nums tracking-[0.14em] text-white">
                              {formatCodeSpaced(card.code)}
                            </p>
                            <p
                              className={`text-xs mt-0.5 font-medium ${
                                card.isMine
                                  ? 'text-[#38D9FF]'
                                  : isTaken
                                    ? 'text-amber-300'
                                    : 'text-emerald-300'
                              }`}
                            >
                              {card.isMine
                                ? 'Your Active Code'
                                : isTaken
                                  ? 'Taken'
                                  : 'Available'}
                            </p>
                          </div>

                          <button
                            type="button"
                            disabled={isTaken || isBusy}
                            onClick={() => void handleSelectCode(card.code)}
                            className={`px-3.5 h-9 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                              card.isMine
                                ? 'bg-[#38D9FF]/20 text-[#38D9FF] border border-[#38D9FF]/45 cursor-default'
                                : isTaken
                                  ? 'bg-slate-800/70 text-slate-400 border border-white/10 cursor-not-allowed'
                                  : 'bg-gradient-to-r from-[#168BFF] to-[#38D9FF] hover:brightness-110 text-[#06152E] cursor-pointer'
                            }`}
                          >
                            {isBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : card.isMine ? (
                              'Selected'
                            ) : isTaken ? (
                              'Taken'
                            ) : (
                              'Select Code'
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* ============================================================
            TAB 2: ENTER CONNECTION CODE
           ============================================================ */}
        {activeTab === 'enter' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <section
              aria-label="Enter Connection Code"
              className="lg:col-span-7 rounded-2xl bg-[#0A1F40]/92 border border-[#123B68] p-6 space-y-5"
            >
              <div>
                <h2 className="text-lg font-extrabold text-white">Enter Connection Code</h2>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Open WhatsApp, read the exact 6-digit connection code sent to you, enter it below,
                  and press Verify Code to validate it against the backend database.
                </p>
              </div>

              <form onSubmit={(e) => void handleVerifySubmit(e)} className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={7}
                    value={enteredCode}
                    onChange={(e) => {
                      setEnteredCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                      if (verificationResult) onClearVerification();
                      setRequestNotice(null);
                    }}
                    placeholder="Enter 6-digit code"
                    aria-label="6-digit connection code"
                    className="flex-1 h-12 px-4 rounded-xl bg-[#06152E] border border-[#168BFF]/45 text-center font-mono tabular-nums text-xl tracking-[0.28em] text-white placeholder:text-slate-500 placeholder:tracking-normal placeholder:text-sm focus:outline-none focus:border-[#38D9FF]"
                  />
                  <button
                    type="submit"
                    disabled={verifying || enteredCode.replace(/\D/g, '').length !== 6}
                    className="px-6 h-12 rounded-xl bg-gradient-to-r from-[#168BFF] to-[#38D9FF] hover:brightness-110 disabled:opacity-50 text-[#06152E] text-xs font-extrabold whitespace-nowrap cursor-pointer flex items-center justify-center gap-2"
                  >
                    {verifying ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    Verify Code
                  </button>
                </div>
              </form>

              {/* Backend Verification Verdict */}
              {verificationResult && (
                <div className="space-y-4">
                  <div
                    role="status"
                    className={`rounded-xl px-4 py-3.5 border text-xs space-y-1 ${
                      verdictBannerInfo(verificationResult.verdict).cls
                    }`}
                  >
                    <p className="font-extrabold text-sm">
                      {verdictBannerInfo(verificationResult.verdict).title}
                    </p>
                    <p className="leading-relaxed opacity-95">{verificationResult.message}</p>
                  </div>

                  {/* Verified First User Profile + Send Connection Request */}
                  {verificationResult.verdict === 'valid' && verificationResult.owner && (
                    <div className="rounded-2xl bg-[#06152E]/95 border border-[#38D9FF]/50 p-5 space-y-4">
                      <div className="flex items-center gap-4">
                        {verificationResult.owner.avatarDataUrl ? (
                          <img
                            src={verificationResult.owner.avatarDataUrl}
                            alt={verificationResult.owner.displayName}
                            referrerPolicy="no-referrer"
                            className="w-14 h-14 rounded-2xl object-cover border border-[#38D9FF]/50 shrink-0"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#168BFF] to-[#38D9FF] flex items-center justify-center text-base font-extrabold text-[#06152E] shrink-0">
                            {getInitials(verificationResult.owner.displayName)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-extrabold text-white truncate">
                              {verificationResult.owner.displayName}
                            </p>
                            {verificationResult.owner.phoneVerified && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-400/40 text-[10px] font-bold text-emerald-300">
                                <ShieldCheck className="w-3 h-3" />
                                Verified
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-mono text-[#38D9FF] truncate">
                            {verificationResult.owner.username} · ID {verificationResult.owner.id} ·{' '}
                            {verificationResult.owner.platform}
                          </p>
                          {verificationResult.owner.publicPhone && (
                            <p className="text-xs font-mono text-slate-300 mt-0.5">
                              Phone: {verificationResult.owner.publicPhone}
                            </p>
                          )}
                          {verificationResult.owner.bio && (
                            <p className="text-xs text-slate-300 mt-1 line-clamp-2">
                              {verificationResult.owner.bio}
                            </p>
                          )}
                          <p className="text-[11px] font-mono text-emerald-300 mt-1">
                            {verificationResult.owner.online ? 'Online now' : 'Available'}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={sendingRequest}
                        onClick={() => void handleSendConnectionRequest()}
                        className="w-full h-11 rounded-xl bg-gradient-to-r from-[#168BFF] to-[#38D9FF] hover:brightness-110 disabled:opacity-60 text-[#06152E] text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {sendingRequest ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        Send Connection Request
                      </button>
                    </div>
                  )}
                </div>
              )}

              {requestNotice && (
                <div
                  role="status"
                  className={`rounded-xl px-4 py-3 border text-xs ${
                    requestNotice.ok
                      ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-100'
                      : 'bg-rose-500/15 border-rose-400/45 text-rose-100'
                  }`}
                >
                  {requestNotice.text}
                </div>
              )}
            </section>

            {/* Outgoing Request Status Tracker */}
            <aside className="lg:col-span-5 rounded-2xl bg-[#0A1F40]/90 border border-[#123B68] p-6 space-y-4">
              <div>
                <h3 className="text-sm font-extrabold text-white">Your Sent Requests</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Connections open only after the code owner explicitly clicks Accept.
                </p>
              </div>

              {outgoingRequests.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center border border-dashed border-[#123B68] rounded-xl">
                  No outgoing pairing requests yet.
                </p>
              ) : (
                <div className="divide-y divide-[#123B68]">
                  {outgoingRequests.slice(0, 8).map((req) => (
                    <div key={req.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          {req.peer.displayName}{' '}
                          <span className="font-mono text-[#38D9FF]">{req.peer.username}</span>
                        </p>
                        <p className="text-[11px] font-mono text-slate-400">
                          Code {formatCodeSpaced(req.code)} ·{' '}
                          {req.status === 'pending'
                            ? 'Waiting for Acceptance'
                            : req.status === 'accepted'
                              ? 'Connected'
                              : req.status === 'rejected'
                                ? 'Rejected'
                                : 'Expired / Cancelled'}
                        </p>
                      </div>

                      {req.status === 'accepted' && req.roomId && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('chats');
                            void onOpenRoom(req.roomId!);
                          }}
                          className="px-3 h-8 rounded-lg bg-[#168BFF] text-white text-xs font-bold whitespace-nowrap cursor-pointer"
                        >
                          Open Chat
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>
        )}

        {/* ============================================================
            TAB 3: REAL-TIME PRIVATE PAIRED CHATS
           ============================================================ */}
        {activeTab === 'chats' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[480px]">
            {/* Rooms List */}
            <div
              className={`lg:col-span-4 rounded-2xl bg-[#0A1F40]/92 border border-[#123B68] flex flex-col overflow-hidden ${
                activeRoom ? 'hidden lg:flex' : 'flex'
              }`}
            >
              <div className="p-4 border-b border-[#123B68] flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-white">Private Paired Rooms</h2>
                <span className="text-xs font-mono tabular-nums text-[#38D9FF]">
                  {rooms.length}
                </span>
              </div>

              {rooms.length === 0 ? (
                <div className="p-8 text-center space-y-3 my-auto">
                  <Lock className="w-7 h-7 text-[#38D9FF] mx-auto" />
                  <p className="text-sm font-bold text-white">No paired conversations yet</p>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Choose a connection code or enter a received code to start a private two-way
                    conversation.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('choose')}
                    className="px-4 h-9 rounded-xl bg-[#168BFF] text-white text-xs font-bold cursor-pointer"
                  >
                    Choose Connection Code
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[#123B68] overflow-y-auto flex-1">
                  {rooms.map((room) => {
                    const selected = activeRoom?.id === room.id;
                    return (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => void onOpenRoom(room.id)}
                        className={`w-full p-4 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                          selected ? 'bg-[#123B68]/85' : 'hover:bg-[#123B68]/40'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {room.peer.avatarDataUrl ? (
                            <img
                              src={room.peer.avatarDataUrl}
                              alt={room.peer.displayName}
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-xl object-cover border border-[#38D9FF]/40 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#168BFF] to-[#38D9FF] flex items-center justify-center text-xs font-extrabold text-[#06152E] shrink-0">
                              {getInitials(room.peer.displayName)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">
                              {room.peer.displayName}
                            </p>
                            <p className="text-xs text-slate-300 truncate">
                              {room.lastMessageText ?? `Paired via code ${room.code}`}
                            </p>
                            <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                              {room.status === 'disconnected'
                                ? 'Disconnected'
                                : room.peer.online
                                  ? 'Online'
                                  : 'Offline'}
                            </p>
                          </div>
                        </div>

                        {room.unreadCount > 0 && (
                          <span className="font-mono tabular-nums text-xs font-bold text-[#38D9FF]">
                            {room.unreadCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Active Private Chat Pane */}
            <div
              className={`lg:col-span-8 rounded-2xl bg-[#0A1F40]/92 border border-[#123B68] flex flex-col overflow-hidden min-h-[480px] ${
                !activeRoom ? 'hidden lg:flex' : 'flex'
              }`}
            >
              {!activeRoom ? (
                <div className="m-auto p-8 text-center space-y-2 max-w-sm">
                  <MessageSquare className="w-8 h-8 text-[#38D9FF] mx-auto" />
                  <p className="text-sm font-bold text-white">Select a private paired chat</p>
                  <p className="text-xs text-slate-400">
                    Each room is strictly isolated to the two paired users — third parties cannot
                    join or read messages.
                  </p>
                </div>
              ) : (
                <>
                  {/* Room Header */}
                  <div className="px-4 sm:px-5 py-3.5 border-b border-[#123B68] flex items-center justify-between gap-3 bg-[#06152E]/70">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => void onOpenRoom('')}
                        aria-label="Back to room list"
                        className="lg:hidden w-8 h-8 rounded-lg bg-[#123B68] flex items-center justify-center text-white shrink-0 cursor-pointer"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-white truncate">
                          {activeRoom.peer.displayName}{' '}
                          <span className="font-mono text-xs text-[#38D9FF]">
                            {activeRoom.peer.username}
                          </span>
                        </p>
                        <p className="text-[11px] font-mono text-slate-300">
                          {activeRoom.status === 'disconnected'
                            ? 'Disconnected'
                            : activeRoom.peer.online
                              ? 'Online · Private 2-Party Room'
                              : 'Offline · Messages deliver when peer returns'}
                        </p>
                      </div>
                    </div>

                    {activeRoom.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => void onDisconnectRoom(activeRoom.id)}
                        className="px-3 h-9 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/45 text-rose-100 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0"
                      >
                        <Unplug className="w-3.5 h-3.5" />
                        Disconnect
                      </button>
                    )}
                  </div>

                  {/* Messages Feed */}
                  <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 max-h-[420px]">
                    {activeMessages.length === 0 ? (
                      <div className="py-12 text-center text-xs text-slate-400">
                        Private connection established via code {formatCodeSpaced(activeRoom.code)}.
                        Send your first message below.
                      </div>
                    ) : (
                      activeMessages.map((msg) => {
                        const mine = msg.senderId === sessionUser?.id;
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[82%] rounded-2xl px-4 py-2.5 space-y-1 ${
                                mine
                                  ? 'bg-gradient-to-br from-[#168BFF] to-[#0E7490] text-white'
                                  : 'bg-[#06152E] border border-[#123B68] text-slate-100'
                              }`}
                            >
                              <p className="text-sm leading-relaxed break-words">{msg.text}</p>
                              <div className="flex items-center justify-end gap-1.5 text-[10px] font-mono tabular-nums opacity-80">
                                <span>
                                  {new Date(msg.createdAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                                {mine && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="inline-flex items-center gap-0.5">
                                      {msg.deliveryStatus === 'delivered' && (
                                        <CheckCheck className="w-3 h-3 text-[#38D9FF]" />
                                      )}
                                      {msg.deliveryStatus === 'sent' && (
                                        <Check className="w-3 h-3" />
                                      )}
                                      {msg.deliveryStatus === 'sending'
                                        ? 'Sending'
                                        : msg.deliveryStatus === 'delivered'
                                          ? 'Delivered'
                                          : msg.deliveryStatus === 'failed'
                                            ? 'Failed'
                                            : 'Sent'}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Composer */}
                  {chatError && (
                    <div className="px-4 py-2 bg-rose-500/20 text-rose-100 text-xs">
                      {chatError}
                    </div>
                  )}

                  {activeRoom.status === 'active' ? (
                    <form
                      onSubmit={(e) => void handleSendChat(e)}
                      className="p-3.5 border-t border-[#123B68] bg-[#06152E]/80 flex items-center gap-2.5"
                    >
                      <input
                        type="text"
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        placeholder="Write a private message..."
                        className="flex-1 h-11 px-4 rounded-xl bg-[#0A1F40] border border-[#123B68] text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-[#38D9FF]"
                      />
                      <button
                        type="submit"
                        disabled={sendingMsg || !draftText.trim()}
                        className="px-4 h-11 rounded-xl bg-gradient-to-r from-[#168BFF] to-[#38D9FF] hover:brightness-110 disabled:opacity-50 text-[#06152E] text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                        Send
                      </button>
                    </form>
                  ) : (
                    <div className="p-4 border-t border-[#123B68] bg-[#06152E]/90 text-center text-xs text-slate-400">
                      This private chat has been disconnected. Choose or enter a new pairing code to
                      reconnect.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
