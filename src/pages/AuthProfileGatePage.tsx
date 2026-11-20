import { FormEvent, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  Phone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  User,
} from 'lucide-react';
import { AuthenticatedUserProfile, OtpPurpose, OtpSendResponse } from '../types/pairing';
import { COUNTRY_DIAL_OPTIONS } from '../utils/countryCodes';
import { FuturisticBackdrop } from '../components/FuturisticBackdrop';
import { FreeConnectLogoMark } from '../components/FreeConnectLogo';

interface AuthProfileGatePageProps {
  restoreError: string | null;
  onSendOtp: (
    purpose: OtpPurpose,
    countryCode: string,
    phoneNumber: string
  ) => Promise<
    | { ok: true; data: OtpSendResponse }
    | { ok: false; error: string; code?: string }
  >;
  onVerifyOtp: (
    challengeId: string,
    otpCode: string,
    purpose: OtpPurpose
  ) => Promise<{ ok: true; phoneE164: string } | { ok: false; error: string }>;
  onCreateProfile: (input: {
    challengeId: string;
    otpCode?: string;
    fullName: string;
  }) => Promise<{ ok: true; user: AuthenticatedUserProfile } | { ok: false; error: string }>;
  onRecoverWithOtp: (input: {
    challengeId: string;
    otpCode?: string;
  }) => Promise<{ ok: true; user: AuthenticatedUserProfile } | { ok: false; error: string }>;
}

function formatOtpCountdown(expiresAt: number, nowMs: number): string {
  const sec = Math.max(0, Math.ceil((expiresAt - nowMs) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function AuthProfileGatePage({
  restoreError,
  onSendOtp,
  onVerifyOtp,
  onCreateProfile,
  onRecoverWithOtp,
}: AuthProfileGatePageProps) {
  const [mode, setMode] = useState<'register' | 'recover'>('register');
  const [fullName, setFullName] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [phoneNumber, setPhoneNumber] = useState('');

  const [challenge, setChallenge] = useState<OtpSendResponse | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);

  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [duplicateSuggestRecover, setDuplicateSuggestRecover] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!challenge) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [challenge]);

  const challengeExpired = Boolean(challenge && nowMs >= challenge.expiresAt);
  const cleanPhoneDigits = phoneNumber.replace(/\D/g, '');
  const cleanOtpDigits = otpInput.replace(/\D/g, '').slice(0, 6);

  const resetOtpFlow = () => {
    setChallenge(null);
    setOtpInput('');
    setOtpVerified(false);
    setErrorMsg(null);
    setDuplicateSuggestRecover(false);
  };

  const handleSwitchMode = (nextMode: 'register' | 'recover') => {
    setMode(nextMode);
    resetOtpFlow();
  };

  const handleRequestOtp = async () => {
    setErrorMsg(null);
    setDuplicateSuggestRecover(false);
    if (cleanPhoneDigits.length < 6) {
      setErrorMsg('Enter a valid mobile phone number before requesting an OTP.');
      return;
    }

    setSendingOtp(true);
    try {
      const purpose: OtpPurpose = mode === 'register' ? 'register' : 'login';
      const res = await onSendOtp(purpose, countryCode, cleanPhoneDigits);
      if (!res.ok) {
        setErrorMsg(res.error);
        if (res.code === 'ACCOUNT_EXISTS' && mode === 'register') {
          setDuplicateSuggestRecover(true);
        }
        return;
      }
      setChallenge(res.data);
      setOtpInput('');
      setOtpVerified(false);
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!challenge) return;
    setErrorMsg(null);
    if (cleanOtpDigits.length !== 6) {
      setErrorMsg('Enter the exact 6-digit verification OTP code.');
      return;
    }

    setVerifyingOtp(true);
    try {
      const purpose: OtpPurpose = mode === 'register' ? 'register' : 'login';
      const res = await onVerifyOtp(challenge.challengeId, cleanOtpDigits, purpose);
      if (!res.ok) {
        setErrorMsg(res.error);
        return;
      }
      setOtpVerified(true);
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!challenge || challengeExpired) {
      setErrorMsg('Please request and verify a fresh 6-digit OTP first.');
      return;
    }

    if (mode === 'register') {
      if (fullName.trim().length < 2) {
        setErrorMsg('Enter your Full Name (at least 2 characters).');
        return;
      }
      if (!otpVerified && cleanOtpDigits.length !== 6) {
        setErrorMsg('Enter and verify the 6-digit OTP sent to your mobile number.');
        return;
      }

      setSubmitting(true);
      try {
        const res = await onCreateProfile({
          challengeId: challenge.challengeId,
          otpCode: otpVerified ? undefined : cleanOtpDigits,
          fullName: fullName.trim(),
        });
        if (!res.ok) {
          setErrorMsg(res.error);
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Recover / Sign In flow
    if (!otpVerified && cleanOtpDigits.length !== 6) {
      setErrorMsg('Enter the 6-digit OTP to verify ownership and restore your account.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await onRecoverWithOtp({
        challengeId: challenge.challengeId,
        otpCode: otpVerified ? undefined : cleanOtpDigits,
      });
      if (!res.ok) {
        setErrorMsg(res.error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmitRegister =
    fullName.trim().length >= 2 &&
    Boolean(challenge) &&
    !challengeExpired &&
    (otpVerified || cleanOtpDigits.length === 6);

  const canSubmitRecover =
    Boolean(challenge) &&
    !challengeExpired &&
    (otpVerified || cleanOtpDigits.length === 6);

  return (
    <div className="min-h-screen bg-[#020714] text-white relative overflow-hidden flex items-center justify-center p-4 sm:p-6">
      <FuturisticBackdrop />

      <div className="relative z-10 w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Identity & Trust Column */}
        <div className="lg:col-span-5 rounded-3xl bg-[#06142C]/90 backdrop-blur-2xl border border-cyan-400/25 p-7 sm:p-8 flex flex-col justify-between gap-6 shadow-[0_24px_80px_rgba(2,7,20,0.8)]">
          <div className="space-y-5">
            <div className="flex items-center gap-3.5">
              <FreeConnectLogoMark size="md" />
              <div>
                <p className="text-lg font-extrabold tracking-tight text-white">FreeConnect</p>
                <p className="text-xs font-mono text-cyan-300">Permanent Verified Messenger</p>
              </div>
            </div>

            <div className="space-y-2.5 pt-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight text-white">
                {mode === 'register'
                  ? 'Create Your Permanent Profile'
                  : 'Recover Your Existing Account'}
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                {mode === 'register'
                  ? 'Verify your mobile number once to receive your permanent Unique User ID. FreeConnect remembers your session automatically whenever you return.'
                  : 'Cleared browser data or switched to a new phone? Verify your registered mobile number with OTP to restore your profile, User ID, and private chats.'}
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="rounded-2xl bg-[#0A1E3E]/90 border border-cyan-400/20 p-3.5 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-cyan-300 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-white">Remembered Permanently</p>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Saved in the secure backend database with persistent session cookies and cross-device recovery.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-[#0A1E3E]/90 border border-cyan-400/20 p-3.5 flex items-start gap-3">
                <KeyRound className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-white">Linked to 6-Digit Pairing Codes</p>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Every pairing code you claim binds to your permanent User ID and displays your registered name to peers.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-[#0A1E3E]/90 border border-cyan-400/20 p-3.5 flex items-start gap-3">
                <Lock className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-white">Phone Number Privacy Protected</p>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Duplicate accounts per phone are blocked, and your full phone number stays hidden from peers unless you permit sharing.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 border-t border-cyan-400/15 pt-4">
            Profile verification is required before entering chats, contacts, or 6-digit pairing rooms.
          </p>
        </div>

        {/* Right Form Card */}
        <div className="lg:col-span-7 rounded-3xl bg-[#071630]/95 backdrop-blur-2xl border border-cyan-400/30 p-6 sm:p-8 shadow-[0_24px_80px_rgba(2,7,20,0.85)] flex flex-col justify-between">
          <div className="space-y-6">
            {/* Mode Switcher */}
            <div className="grid grid-cols-2 p-1 rounded-2xl bg-[#030C1E] border border-cyan-400/20">
              <button
                type="button"
                onClick={() => handleSwitchMode('register')}
                className={`h-10 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  mode === 'register'
                    ? 'bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white shadow-[0_0_18px_rgba(37,99,235,0.45)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Create Your Profile
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMode('recover')}
                className={`h-10 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  mode === 'recover'
                    ? 'bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white shadow-[0_0_18px_rgba(37,99,235,0.45)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Recover / Sign In
              </button>
            </div>

            {restoreError && (
              <div className="rounded-2xl bg-amber-500/15 border border-amber-400/40 p-3.5 text-xs text-amber-100 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />
                <span>{restoreError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* 1. Full Name (Registration Only) */}
              {mode === 'register' && (
                <div>
                  <label
                    htmlFor="fc-reg-fullname"
                    className="block text-xs font-bold text-slate-200 mb-1.5"
                  >
                    1. Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="fc-reg-fullname"
                      type="text"
                      maxLength={60}
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        setErrorMsg(null);
                      }}
                      placeholder="Enter your full name (e.g., Alex Morgan)"
                      className="w-full h-12 pl-10 pr-4 rounded-xl bg-[#030B1D] border border-cyan-400/25 focus:border-cyan-300 focus:outline-none text-sm text-white placeholder:text-slate-500"
                    />
                  </div>
                </div>
              )}

              {/* 2 & 3. Country Code + Mobile Phone Number */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-200">
                  {mode === 'register'
                    ? '2. Country Code & Mobile Phone Number'
                    : 'Registered Country Code & Mobile Phone Number'}
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <div className="sm:col-span-5">
                    <select
                      aria-label="Country Code"
                      value={countryCode}
                      disabled={otpVerified}
                      onChange={(e) => {
                        setCountryCode(e.target.value);
                        if (challenge) resetOtpFlow();
                      }}
                      className="w-full h-12 px-3 rounded-xl bg-[#030B1D] border border-cyan-400/25 focus:border-cyan-300 focus:outline-none text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {COUNTRY_DIAL_OPTIONS.map((opt) => (
                        <option key={`${opt.iso}-${opt.code}`} value={opt.code} className="bg-[#06142C]">
                          {opt.code} · {opt.country}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-7 relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="fc-reg-phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      disabled={otpVerified}
                      value={phoneNumber}
                      onChange={(e) => {
                        setPhoneNumber(e.target.value.replace(/[^\d\s-]/g, '').slice(0, 18));
                        if (challenge) resetOtpFlow();
                        setErrorMsg(null);
                      }}
                      placeholder="Mobile phone number"
                      className="w-full h-12 pl-10 pr-4 rounded-xl bg-[#030B1D] border border-cyan-400/25 focus:border-cyan-300 focus:outline-none text-sm font-mono text-white placeholder:text-slate-500 disabled:opacity-60"
                    />
                  </div>
                </div>

                {/* Request OTP Button Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-slate-400">
                    Formatted number:{' '}
                    <span className="font-mono text-cyan-300">
                      {cleanPhoneDigits ? `${countryCode}${cleanPhoneDigits}` : `${countryCode} —`}
                    </span>
                  </span>

                  {!otpVerified ? (
                    <button
                      type="button"
                      disabled={sendingOtp || cleanPhoneDigits.length < 6}
                      onClick={handleRequestOtp}
                      className="px-4 h-9 rounded-xl bg-[#0D254D] hover:bg-[#13356E] disabled:opacity-50 border border-cyan-400/40 text-xs font-bold text-cyan-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      {sendingOtp ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : challenge ? (
                        <RefreshCw className="w-3.5 h-3.5" />
                      ) : (
                        <Smartphone className="w-3.5 h-3.5" />
                      )}
                      {challenge ? 'Resend OTP' : 'Send Verification OTP'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={resetOtpFlow}
                      className="text-xs font-semibold text-cyan-300 hover:underline cursor-pointer"
                    >
                      Change number
                    </button>
                  )}
                </div>
              </div>

              {/* 4. OTP Verification Box */}
              {challenge && (
                <div className="rounded-2xl bg-[#040E24] border border-cyan-400/30 p-4 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold text-white flex items-center gap-1.5">
                      {otpVerified ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-emerald-300">Phone Number Verified</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4 text-cyan-300" />
                          <span>
                            {mode === 'register'
                              ? '3. Verify Phone Number with OTP'
                              : 'Enter 6-Digit Verification OTP'}
                          </span>
                        </>
                      )}
                    </p>
                    {!otpVerified && (
                      <span
                        className={`text-[11px] font-mono tabular-nums ${
                          challengeExpired ? 'text-rose-400' : 'text-cyan-300'
                        }`}
                      >
                        {challengeExpired
                          ? 'OTP Expired'
                          : `Expires in ${formatOtpCountdown(challenge.expiresAt, nowMs)}`}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {challenge.deliveryMessage}
                  </p>

                  {/* Transparent backend-issued verification code card when external SMS gateway is not configured */}
                  {challenge.secureChannelOtp && !otpVerified && (
                    <div className="rounded-xl bg-cyan-500/10 border border-cyan-400/35 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-wider text-cyan-300">
                          Secure Server OTP Delivery
                        </p>
                        <p className="text-base font-mono font-extrabold tracking-[0.25em] text-white mt-0.5">
                          {challenge.secureChannelOtp}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setOtpInput(challenge.secureChannelOtp ?? '');
                          setErrorMsg(null);
                        }}
                        className="px-3 h-8 rounded-lg bg-cyan-400/20 hover:bg-cyan-400/30 border border-cyan-300/40 text-[11px] font-bold text-cyan-100 cursor-pointer"
                      >
                        Auto-Fill Code
                      </button>
                    </div>
                  )}

                  {!otpVerified && (
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        autoComplete="one-time-code"
                        value={otpInput}
                        onChange={(e) => {
                          setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6));
                          setErrorMsg(null);
                        }}
                        placeholder="Enter 6-digit OTP"
                        className="flex-1 h-11 px-4 rounded-xl bg-[#020817] border border-cyan-400/30 focus:border-cyan-300 focus:outline-none text-center font-mono text-base tracking-[0.35em] text-white placeholder:tracking-normal placeholder:text-xs placeholder:text-slate-500"
                      />
                      <button
                        type="button"
                        disabled={verifyingOtp || cleanOtpDigits.length !== 6 || challengeExpired}
                        onClick={handleVerifyOtp}
                        className="px-5 h-11 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-50 border border-emerald-400/45 text-emerald-200 text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        {verifyingOtp ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        Verify OTP
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Error Banner + Duplicate Account Recovery Shortcut */}
              {errorMsg && (
                <div className="rounded-2xl bg-rose-500/15 border border-rose-400/45 p-3.5 space-y-2.5">
                  <p className="text-xs text-rose-100 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-300" />
                    <span>{errorMsg}</span>
                  </p>
                  {duplicateSuggestRecover && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('recover');
                        resetOtpFlow();
                      }}
                      className="px-3.5 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                    >
                      Sign In &amp; Recover Existing Profile
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              {/* Primary Submit CTA */}
              <button
                type="submit"
                disabled={
                  submitting || (mode === 'register' ? !canSubmitRegister : !canSubmitRecover)
                }
                className="w-full h-12 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] hover:brightness-110 disabled:opacity-45 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(37,99,235,0.45)] cursor-pointer transition-all"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                {mode === 'register' ? 'Create My Profile' : 'Verify & Restore My Account'}
              </button>
            </form>
          </div>

          <div className="pt-5 mt-6 border-t border-cyan-400/15 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>
              {mode === 'register'
                ? 'Already created a profile on another device?'
                : 'New to FreeConnect Offline Messenger?'}
            </span>
            <button
              type="button"
              onClick={() => handleSwitchMode(mode === 'register' ? 'recover' : 'register')}
              className="font-bold text-cyan-300 hover:underline cursor-pointer"
            >
              {mode === 'register' ? 'Recover with Phone & OTP →' : 'Create a New Profile →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
