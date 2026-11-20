import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { ContactRecord, UserProfileRecord, WebsitePage } from '../types/contacts';
import { AuthenticatedUserProfile, OtpPurpose, OtpSendResponse } from '../types/pairing';
import { COUNTRY_DIAL_OPTIONS } from '../utils/countryCodes';
import { getInitials, resizeAvatarFileToDataUrl } from '../utils/contactQrCodec';

interface EditProfilePageProps {
  profile: UserProfileRecord;
  authUser: AuthenticatedUserProfile;
  contacts: ContactRecord[];
  onUpdateProfile: (patch: Partial<UserProfileRecord>) => void;
  onSavePermanentProfile: (patch: {
    fullName?: string;
    username?: string;
    bio?: string;
    statusNote?: string;
    avatarDataUrl?: string | null;
    showPhoneToPeers?: boolean;
  }) => Promise<{ ok: true; user: AuthenticatedUserProfile } | { ok: false; error: string }>;
  onSendPhoneChangeOtp: (
    purpose: OtpPurpose,
    countryCode: string,
    phoneNumber: string
  ) => Promise<
    | { ok: true; data: OtpSendResponse }
    | { ok: false; error: string; code?: string }
  >;
  onConfirmPhoneChange: (
    challengeId: string,
    otpCode?: string
  ) => Promise<{ ok: true; user: AuthenticatedUserProfile } | { ok: false; error: string }>;
  onLogout: () => Promise<void>;
  onDeleteAccount: () => Promise<{ ok: boolean; error?: string }>;
  onRotateKeys: () => Promise<void>;
  onNavigate: (page: WebsitePage) => void;
}

const STATUS_PRESETS = [
  'Available Offline',
  'Nearby & Ready to Pair',
  'Busy · Messages Queued',
  'Do Not Disturb',
];

const MAX_BIO_CHARS = 180;
const MAX_NAME_CHARS = 60;
const MAX_STATUS_CHARS = 100;

function normalizeUsernameHandle(raw: string): string {
  const stripped = raw.trim().replace(/^@+/, '').toLowerCase();
  return stripped.replace(/[^a-z0-9_]/g, '');
}

function formatCreationDate(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

export function EditProfilePage({
  profile,
  authUser,
  contacts,
  onUpdateProfile,
  onSavePermanentProfile,
  onSendPhoneChangeOtp,
  onConfirmPhoneChange,
  onLogout,
  onDeleteAccount,
  onRotateKeys,
  onNavigate,
}: EditProfilePageProps) {
  const [name, setName] = useState(authUser.fullName || profile.name);
  const [usernameRaw, setUsernameRaw] = useState(
    (authUser.username || profile.username).replace(/^@/, '')
  );
  const [bio, setBio] = useState(authUser.bio ?? profile.bio ?? '');
  const [statusNote, setStatusNote] = useState(authUser.statusNote || profile.statusNote);
  const [avatarDataUrl, setAvatarDataUrl] = useState(authUser.avatarDataUrl ?? profile.avatarDataUrl ?? '');
  const [showPhoneToPeers, setShowPhoneToPeers] = useState(authUser.showPhoneToPeers);

  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);
  const [rotating, setRotating] = useState(false);

  // Change Phone Number OTP flow
  const [showChangePhone, setShowChangePhone] = useState(false);
  const [newCountryCode, setNewCountryCode] = useState(authUser.countryCode || '+1');
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [phoneOtpChallenge, setPhoneOtpChallenge] = useState<OtpSendResponse | null>(null);
  const [phoneOtpInput, setPhoneOtpInput] = useState('');
  const [phoneOtpBusy, setPhoneOtpBusy] = useState(false);
  const [phoneOtpError, setPhoneOtpError] = useState<string | null>(null);
  const [phoneUpdatedNotice, setPhoneUpdatedNotice] = useState<string | null>(null);

  // Logout & Delete Account modals
  const [loggingOut, setLoggingOut] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const editFormRef = useRef<HTMLFormElement | null>(null);

  // Sync local form when authUser updates from backend
  useEffect(() => {
    setName(authUser.fullName || profile.name);
    setUsernameRaw((authUser.username || profile.username).replace(/^@/, ''));
    setBio(authUser.bio ?? '');
    setStatusNote(authUser.statusNote || profile.statusNote);
    setAvatarDataUrl(authUser.avatarDataUrl ?? '');
    setShowPhoneToPeers(authUser.showPhoneToPeers);
  }, [
    authUser.id,
    authUser.fullName,
    authUser.username,
    authUser.bio,
    authUser.statusNote,
    authUser.avatarDataUrl,
    authUser.showPhoneToPeers,
    profile.name,
    profile.username,
    profile.statusNote,
  ]);

  const normalizedHandle = useMemo(() => normalizeUsernameHandle(usernameRaw), [usernameRaw]);
  const formattedUsername = normalizedHandle ? `@${normalizedHandle}` : '';

  const takenUsernames = useMemo(
    () => new Set(contacts.map((c) => c.username.trim().toLowerCase())),
    [contacts]
  );

  const usernameValidationError = useMemo(() => {
    if (!normalizedHandle) return 'Username is required.';
    if (normalizedHandle.length < 3) return 'Username must be at least 3 characters.';
    if (normalizedHandle.length > 24) return 'Username must be 24 characters or fewer.';
    if (takenUsernames.has(formattedUsername.toLowerCase())) {
      return `Username ${formattedUsername} is already used by one of your saved contacts. Choose a unique handle.`;
    }
    return null;
  }, [normalizedHandle, formattedUsername, takenUsernames]);

  const nameValidationError = useMemo(() => {
    if (name.trim().length < 2) return 'Full name must be at least 2 characters.';
    if (name.trim().length > MAX_NAME_CHARS) {
      return `Full name must be ${MAX_NAME_CHARS} characters or fewer.`;
    }
    return null;
  }, [name]);

  const hasUnsavedChanges =
    name.trim() !== authUser.fullName ||
    formattedUsername !== authUser.username ||
    bio.trim() !== (authUser.bio ?? '') ||
    statusNote.trim() !== authUser.statusNote ||
    (avatarDataUrl || null) !== (authUser.avatarDataUrl ?? null) ||
    showPhoneToPeers !== authUser.showPhoneToPeers;

  const canSave = !nameValidationError && !usernameValidationError && !saving;

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAvatarError('Please select a valid image file (PNG, JPG, WebP).');
      return;
    }
    setAvatarError(null);
    try {
      const dataUrl = await resizeAvatarFileToDataUrl(file);
      setAvatarDataUrl(dataUrl);
      setSavedNotice(false);
    } catch {
      setAvatarError('Could not process that image. Try another photo.');
    }
  };

  const handleSaveSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const cleanName = name.trim();
      const cleanBio = bio.trim().slice(0, MAX_BIO_CHARS);
      const cleanStatus = statusNote.trim().slice(0, MAX_STATUS_CHARS) || 'Available Offline';
      const res = await onSavePermanentProfile({
        fullName: cleanName,
        username: formattedUsername,
        bio: cleanBio,
        statusNote: cleanStatus,
        avatarDataUrl: avatarDataUrl || null,
        showPhoneToPeers,
      });

      if (!res.ok) {
        setSaveError(res.error);
        return;
      }

      onUpdateProfile({
        name: res.user.fullName,
        username: res.user.username,
        bio: res.user.bio,
        statusNote: res.user.statusNote,
        avatarDataUrl: res.user.avatarDataUrl ?? '',
        phoneNumber: res.user.phoneE164,
      });

      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 2800);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyUserId = async () => {
    try {
      await navigator.clipboard.writeText(authUser.id);
      setCopiedUid(true);
      window.setTimeout(() => setCopiedUid(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleRequestNewPhoneOtp = async () => {
    setPhoneOtpError(null);
    const digits = newPhoneNumber.replace(/\D/g, '');
    if (digits.length < 6) {
      setPhoneOtpError('Enter a valid new mobile phone number.');
      return;
    }
    setPhoneOtpBusy(true);
    try {
      const res = await onSendPhoneChangeOtp('change_phone', newCountryCode, digits);
      if (!res.ok) {
        setPhoneOtpError(res.error);
        return;
      }
      setPhoneOtpChallenge(res.data);
      setPhoneOtpInput('');
    } finally {
      setPhoneOtpBusy(false);
    }
  };

  const handleConfirmNewPhone = async (e: FormEvent) => {
    e.preventDefault();
    if (!phoneOtpChallenge) return;
    setPhoneOtpError(null);
    const cleanOtp = phoneOtpInput.replace(/\D/g, '').slice(0, 6);
    if (cleanOtp.length !== 6) {
      setPhoneOtpError('Enter the 6-digit OTP code to verify your new phone number.');
      return;
    }
    setPhoneOtpBusy(true);
    try {
      const res = await onConfirmPhoneChange(phoneOtpChallenge.challengeId, cleanOtp);
      if (!res.ok) {
        setPhoneOtpError(res.error);
        return;
      }
      onUpdateProfile({ phoneNumber: res.user.phoneE164 });
      setShowChangePhone(false);
      setPhoneOtpChallenge(null);
      setNewPhoneNumber('');
      setPhoneOtpInput('');
      setPhoneUpdatedNotice(`Verified phone number updated to ${res.user.phoneE164}.`);
      window.setTimeout(() => setPhoneUpdatedNotice(null), 4000);
    } finally {
      setPhoneOtpBusy(false);
    }
  };

  const handleLogoutClick = async () => {
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  };

  const handleDeleteAccountSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Type DELETE to permanently delete your account.');
      return;
    }
    setDeletingAccount(true);
    setDeleteError(null);
    try {
      const res = await onDeleteAccount();
      if (!res.ok) {
        setDeleteError(res.error ?? 'Could not delete your account.');
      }
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <User className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
            User Profile &amp; Permanent Account
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Your permanent FreeConnect identity, verified phone number, privacy preferences, and pairing code link.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('pairing')}
          className="px-4 h-10 rounded-xl bg-slate-100 dark:bg-[#0B1E3D] hover:bg-slate-200 dark:hover:bg-[#112A54] border border-slate-300 dark:border-cyan-400/30 text-slate-800 dark:text-cyan-200 text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <KeyRound className="w-4 h-4" />
          Choose Pairing Code
        </button>
      </div>

      {/* Permanent Account Identity Overview Card */}
      <div className="rounded-3xl bg-white dark:bg-[#07152C]/90 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/30 p-6 sm:p-7 space-y-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-cyan-400/15">
          <div className="flex items-center gap-4 min-w-0">
            {avatarDataUrl ? (
              <img
                src={avatarDataUrl}
                alt={authUser.fullName}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-2xl object-cover border-2 border-blue-500/50 dark:border-cyan-400/50 shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#0891B2] flex items-center justify-center text-white text-xl font-extrabold shrink-0">
                {getInitials(authUser.fullName)}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white truncate">
                  {authUser.fullName}
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-400/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {authUser.accountStatus === 'active' ? 'Verified & Active' : 'Suspended'}
                </span>
              </div>
              <p className="text-xs font-mono text-blue-600 dark:text-cyan-300 mt-0.5">
                {authUser.username} · Remembered Session Active
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => editFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="px-3.5 h-9 rounded-xl bg-slate-100 dark:bg-[#0B1E3D] hover:bg-slate-200 dark:hover:bg-[#132E5C] border border-slate-300 dark:border-cyan-400/30 text-xs font-bold text-slate-800 dark:text-cyan-200 cursor-pointer"
            >
              Edit Profile
            </button>
            <button
              type="button"
              onClick={() => {
                setShowChangePhone((v) => !v);
                setPhoneOtpChallenge(null);
                setPhoneOtpError(null);
              }}
              className="px-3.5 h-9 rounded-xl bg-slate-100 dark:bg-[#0B1E3D] hover:bg-slate-200 dark:hover:bg-[#132E5C] border border-slate-300 dark:border-cyan-400/30 text-xs font-bold text-slate-800 dark:text-cyan-200 flex items-center gap-1.5 cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5" />
              Change Phone Number
            </button>
            <button
              type="button"
              disabled={loggingOut}
              onClick={handleLogoutClick}
              className="px-3.5 h-9 rounded-xl border border-amber-400/45 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {loggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
              Logout
            </button>
            <button
              type="button"
              onClick={() => {
                setShowDeleteModal(true);
                setDeleteConfirmText('');
                setDeleteError(null);
              }}
              className="px-3.5 h-9 rounded-xl border border-rose-400/45 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Account
            </button>
          </div>
        </div>

        {/* 4 Permanent Account Fields Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="rounded-2xl bg-slate-50 dark:bg-[#040E24] border border-slate-200 dark:border-cyan-400/20 p-3.5">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Verified Phone Number
            </p>
            <p className="text-sm font-mono font-bold text-slate-900 dark:text-white mt-1 flex items-center gap-1.5">
              <span>{authUser.phoneE164 || 'Not set'}</span>
              {authUser.phoneVerified && (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              )}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
              {showPhoneToPeers ? 'Visible to paired peers' : 'Hidden from other users'}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 dark:bg-[#040E24] border border-slate-200 dark:border-cyan-400/20 p-3.5">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Unique User ID
            </p>
            <div className="flex items-center justify-between gap-2 mt-1">
              <p className="text-sm font-mono font-bold text-blue-600 dark:text-cyan-300 truncate">
                {authUser.id}
              </p>
              <button
                type="button"
                onClick={handleCopyUserId}
                title="Copy Unique User ID"
                className="w-7 h-7 rounded-lg bg-slate-200/80 dark:bg-[#0B1E3D] hover:bg-slate-300 dark:hover:bg-[#143060] flex items-center justify-center text-slate-700 dark:text-cyan-200 shrink-0 cursor-pointer"
              >
                {copiedUid ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
              Linked to all pairing codes &amp; chats
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 dark:bg-[#040E24] border border-slate-200 dark:border-cyan-400/20 p-3.5">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Profile Creation Date
            </p>
            <p className="text-xs font-bold text-slate-900 dark:text-white mt-1.5 leading-snug">
              {formatCreationDate(authUser.createdAt)}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 dark:bg-[#040E24] border border-slate-200 dark:border-cyan-400/20 p-3.5">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Account Status
            </p>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-300 mt-1 capitalize">
              {authUser.accountStatus} · Persistent
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
              Recoverable anytime via Phone OTP
            </p>
          </div>
        </div>

        {phoneUpdatedNotice && (
          <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/40 p-3.5 text-xs font-semibold text-emerald-700 dark:text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{phoneUpdatedNotice}</span>
          </div>
        )}

        {/* Inline Change Phone Number Panel (OTP Verified) */}
        {showChangePhone && (
          <div className="rounded-2xl bg-slate-100 dark:bg-[#040E24] border border-blue-500/35 dark:border-cyan-400/35 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                  Change Verified Phone Number
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Verify ownership of your new mobile number with a 6-digit OTP. Duplicate accounts are automatically prevented.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowChangePhone(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-200 dark:hover:bg-[#0B1E3D] flex items-center justify-center text-slate-500 dark:text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div className="sm:col-span-4">
                <select
                  value={newCountryCode}
                  onChange={(e) => {
                    setNewCountryCode(e.target.value);
                    setPhoneOtpChallenge(null);
                  }}
                  className="w-full h-11 px-3 rounded-xl bg-white dark:bg-[#07152C] border border-slate-300 dark:border-cyan-400/25 text-xs font-semibold text-slate-900 dark:text-white"
                >
                  {COUNTRY_DIAL_OPTIONS.map((opt) => (
                    <option key={`${opt.iso}-${opt.code}`} value={opt.code} className="bg-white dark:bg-[#06142C]">
                      {opt.code} · {opt.country}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-5">
                <input
                  type="tel"
                  inputMode="numeric"
                  value={newPhoneNumber}
                  onChange={(e) => {
                    setNewPhoneNumber(e.target.value.replace(/[^\d\s-]/g, '').slice(0, 18));
                    setPhoneOtpChallenge(null);
                    setPhoneOtpError(null);
                  }}
                  placeholder="New mobile phone number"
                  className="w-full h-11 px-3.5 rounded-xl bg-white dark:bg-[#07152C] border border-slate-300 dark:border-cyan-400/25 text-sm font-mono text-slate-900 dark:text-white"
                />
              </div>
              <div className="sm:col-span-3">
                <button
                  type="button"
                  disabled={phoneOtpBusy || newPhoneNumber.replace(/\D/g, '').length < 6}
                  onClick={handleRequestNewPhoneOtp}
                  className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {phoneOtpBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {phoneOtpChallenge ? 'Resend OTP' : 'Send OTP'}
                </button>
              </div>
            </div>

            {phoneOtpChallenge && (
              <form onSubmit={handleConfirmNewPhone} className="space-y-3 pt-2 border-t border-slate-200 dark:border-cyan-400/15">
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {phoneOtpChallenge.deliveryMessage}
                </p>
                {phoneOtpChallenge.secureChannelOtp && (
                  <div className="rounded-xl bg-blue-500/10 dark:bg-cyan-500/10 border border-blue-400/35 dark:border-cyan-400/35 px-3.5 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold text-blue-700 dark:text-cyan-200">
                      OTP Code: {phoneOtpChallenge.secureChannelOtp}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPhoneOtpInput(phoneOtpChallenge.secureChannelOtp ?? '')}
                      className="px-2.5 h-7 rounded-lg bg-blue-600/20 dark:bg-cyan-400/20 text-[11px] font-bold text-blue-700 dark:text-cyan-100 cursor-pointer"
                    >
                      Fill
                    </button>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={phoneOtpInput}
                    onChange={(e) => setPhoneOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit OTP"
                    className="flex-1 h-11 px-4 rounded-xl bg-white dark:bg-[#07152C] border border-slate-300 dark:border-cyan-400/30 font-mono text-sm tracking-[0.3em] text-center text-slate-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={phoneOtpBusy || phoneOtpInput.length !== 6}
                    className="px-5 h-11 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                  >
                    Verify &amp; Save Phone
                  </button>
                </div>
              </form>
            )}

            {phoneOtpError && (
              <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {phoneOtpError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Main Two-Column Layout: Edit Profile Form + Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          ref={editFormRef}
          onSubmit={handleSaveSubmit}
          className="lg:col-span-8 rounded-3xl bg-white dark:bg-[#07152C]/85 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/25 p-6 sm:p-8 space-y-6"
        >
          {/* Profile Picture Upload / Change / Remove */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 pb-6 border-b border-slate-200 dark:border-cyan-400/15">
            <div className="relative shrink-0 self-start">
              {avatarDataUrl ? (
                <img
                  src={avatarDataUrl}
                  alt={name || authUser.fullName}
                  referrerPolicy="no-referrer"
                  className="w-24 h-24 rounded-2xl object-cover border-2 border-blue-500/50 dark:border-cyan-400/50"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#0891B2] flex items-center justify-center text-white text-2xl font-bold">
                  {getInitials(name || authUser.fullName)}
                </div>
              )}
              <button
                type="button"
                aria-label="Upload profile picture"
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-2 -right-2 w-9 h-9 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white flex items-center justify-center border-2 border-white dark:border-[#07152C] shadow-md cursor-pointer"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>

            <div className="space-y-2 min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-white">Profile Picture</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Synced to your permanent profile so connected peers recognize you across devices.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="px-3.5 h-9 rounded-xl bg-slate-100 dark:bg-[#0B1E3D] hover:bg-slate-200 dark:hover:bg-[#132E5C] border border-slate-300 dark:border-cyan-400/30 text-xs font-semibold text-slate-800 dark:text-cyan-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  {avatarDataUrl ? 'Change Photo' : 'Upload Photo'}
                </button>
                {avatarDataUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarDataUrl('');
                      setSavedNotice(false);
                    }}
                    className="px-3.5 h-9 rounded-xl border border-rose-300 dark:border-rose-400/35 text-xs font-semibold text-rose-600 dark:text-rose-300 hover:bg-rose-500/10 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                )}
              </div>
              {avatarError && (
                <p className="text-xs text-rose-600 dark:text-rose-400">{avatarError}</p>
              )}
            </div>
          </div>

          {/* Full Name & Unique Username */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="fc-edit-name"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Full Name
                </label>
                <span className="text-[11px] font-mono tabular-nums text-slate-400">
                  {name.length}/{MAX_NAME_CHARS}
                </span>
              </div>
              <input
                id="fc-edit-name"
                type="text"
                maxLength={MAX_NAME_CHARS}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSavedNotice(false);
                }}
                placeholder="Your full name"
                className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 focus:border-blue-500 dark:focus:border-cyan-300 focus:outline-none text-sm text-slate-900 dark:text-white"
              />
              {nameValidationError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {nameValidationError}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="fc-edit-username"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Unique Username
                </label>
                <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                  {!usernameValidationError ? 'Valid handle' : 'Check handle'}
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-mono text-slate-400">
                  @
                </span>
                <input
                  id="fc-edit-username"
                  type="text"
                  maxLength={24}
                  value={usernameRaw}
                  onChange={(e) => {
                    setUsernameRaw(e.target.value.replace(/^@+/, ''));
                    setSavedNotice(false);
                  }}
                  placeholder="your_username"
                  className="w-full h-11 pl-8 pr-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 focus:border-blue-500 dark:focus:border-cyan-300 focus:outline-none text-sm font-mono text-slate-900 dark:text-white"
                />
              </div>
              {usernameValidationError ? (
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {usernameValidationError}
                </p>
              ) : (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Saved as <span className="font-mono text-blue-600 dark:text-cyan-300">{formattedUsername}</span>
                </p>
              )}
            </div>
          </div>

          {/* Personal Bio */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="fc-edit-bio"
                className="text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                Personal Bio
              </label>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                {bio.length}/{MAX_BIO_CHARS}
              </span>
            </div>
            <textarea
              id="fc-edit-bio"
              rows={3}
              maxLength={MAX_BIO_CHARS}
              value={bio}
              onChange={(e) => {
                setBio(e.target.value);
                setSavedNotice(false);
              }}
              placeholder="Write a short personal bio about yourself..."
              className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 focus:border-blue-500 dark:focus:border-cyan-300 focus:outline-none text-sm text-slate-900 dark:text-white resize-none"
            />
          </div>

          {/* Status Message + Presets */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="fc-edit-status"
                className="text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                Status Message
              </label>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                {statusNote.length}/{MAX_STATUS_CHARS}
              </span>
            </div>
            <input
              id="fc-edit-status"
              type="text"
              maxLength={MAX_STATUS_CHARS}
              value={statusNote}
              onChange={(e) => {
                setStatusNote(e.target.value);
                setSavedNotice(false);
              }}
              placeholder="Share your current availability..."
              className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 focus:border-blue-500 dark:focus:border-cyan-300 focus:outline-none text-sm text-slate-900 dark:text-white"
            />
            <div className="flex flex-wrap gap-1.5">
              {STATUS_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setStatusNote(preset);
                    setSavedNotice(false);
                  }}
                  className={`px-3 h-8 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    statusNote === preset
                      ? 'bg-[#2563EB] text-white'
                      : 'bg-slate-100 dark:bg-[#0B1E3D] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#132C57]'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Phone Privacy Control */}
          <div className="rounded-2xl bg-slate-50 dark:bg-[#040E24] border border-slate-200 dark:border-cyan-400/20 p-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                {showPhoneToPeers ? (
                  <Eye className="w-4 h-4 text-amber-500" />
                ) : (
                  <EyeOff className="w-4 h-4 text-emerald-500" />
                )}
                Phone Number Privacy
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {showPhoneToPeers
                  ? 'You explicitly permitted paired users to see your verified phone number.'
                  : 'Protected (Recommended): Your full phone number is never shown to other users.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showPhoneToPeers}
              onClick={() => {
                setShowPhoneToPeers((v) => !v);
                setSavedNotice(false);
              }}
              className={`w-12 h-7 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                showPhoneToPeers ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  showPhoneToPeers ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {saveError && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-400/40 p-3 text-xs text-rose-600 dark:text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Save Action Bar */}
          <div className="pt-4 border-t border-slate-200 dark:border-cyan-400/15 flex flex-wrap items-center justify-between gap-3">
            <div>
              {savedNotice ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  Permanent profile saved to backend database
                </span>
              ) : hasUnsavedChanges ? (
                <span className="text-xs text-amber-600 dark:text-amber-300 font-medium">
                  You have unsaved changes
                </span>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Synced with permanent account {authUser.id}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSave}
              className="px-6 h-11 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] hover:brightness-110 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(37,99,235,0.35)] cursor-pointer"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Profile Changes
            </button>
          </div>
        </form>

        {/* Right Column: Live Pairing Identity Preview & Cryptographic Keypair */}
        <div className="lg:col-span-4 space-y-5">
          <div className="rounded-3xl bg-white dark:bg-[#07152C]/85 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/25 p-6 space-y-4">
            <p className="text-xs font-mono text-blue-600 dark:text-cyan-300">
              How Peers See Your Profile
            </p>
            <div className="flex items-center gap-3.5">
              {avatarDataUrl ? (
                <img
                  src={avatarDataUrl}
                  alt={name || authUser.fullName}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-2xl object-cover border border-cyan-400/40 shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#0891B2] flex items-center justify-center text-white text-base font-bold shrink-0">
                  {getInitials(name || authUser.fullName)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-base font-extrabold text-slate-900 dark:text-white truncate">
                  {name.trim() || authUser.fullName}
                </p>
                <p className="text-xs font-mono text-blue-600 dark:text-cyan-300 truncate">
                  {formattedUsername || authUser.username}
                </p>
              </div>
            </div>

            {bio.trim() ? (
              <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                {bio.trim()}
              </p>
            ) : (
              <p className="text-xs text-slate-400 italic">No personal bio added yet.</p>
            )}

            <div className="pt-3 border-t border-slate-200 dark:border-cyan-400/15 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">User ID</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{authUser.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Phone Shown</span>
                <span className="font-mono text-slate-700 dark:text-cyan-200">
                  {showPhoneToPeers ? authUser.phoneE164 : 'Hidden (Private)'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Status</span>
                <span className="font-medium text-slate-900 dark:text-white truncate max-w-[160px]">
                  {statusNote.trim() || 'Available Offline'}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white dark:bg-[#07152C]/85 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/25 p-6 space-y-3">
            <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
              ECDH P-256 Device Fingerprint
            </p>
            <p className="text-xs font-mono break-all text-blue-600 dark:text-cyan-300">
              {profile.fingerprint}
            </p>
            <button
              type="button"
              disabled={rotating}
              onClick={async () => {
                setRotating(true);
                try {
                  await onRotateKeys();
                } finally {
                  setRotating(false);
                }
              }}
              className="w-full h-9 rounded-xl border border-slate-300 dark:border-cyan-400/30 hover:bg-slate-100 dark:hover:bg-[#0B1E3D] text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${rotating ? 'animate-spin' : ''}`} />
              Rotate Local Keypair
            </button>
          </div>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fc-delete-acc-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#020817]/80 backdrop-blur-sm"
        >
          <form
            onSubmit={handleDeleteAccountSubmit}
            className="w-full max-w-md rounded-3xl bg-[#06152E] text-white border border-rose-400/50 p-6 space-y-5 shadow-[0_24px_80px_rgba(6,21,46,0.95)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="fc-delete-acc-title" className="text-lg font-extrabold text-rose-200">
                  Delete Permanent Account
                </h2>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  This permanently removes your profile ({authUser.id}), verified phone link ({authUser.phoneE164}), active sessions, and paired private chat rooms from the backend database. This cannot be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-400 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                Type <span className="font-mono text-rose-300">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => {
                  setDeleteConfirmText(e.target.value);
                  setDeleteError(null);
                }}
                placeholder="DELETE"
                className="w-full h-11 px-3.5 rounded-xl bg-[#030B1D] border border-rose-400/40 text-sm font-mono text-white focus:outline-none focus:border-rose-300"
              />
              {deleteError && <p className="text-xs text-rose-300 mt-1.5">{deleteError}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="h-11 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deletingAccount || deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
                className="h-11 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-45 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {deletingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete Permanently
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
