import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Cpu,
  RefreshCw,
  Star,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { ContactRecord } from '../types/contacts';
import {
  generateFreeConnectDeviceId,
  getInitials,
  resizeAvatarFileToDataUrl,
} from '../utils/contactQrCodec';



export interface ContactFormSubmission {
  name: string;
  username: string;
  phoneNumber: string;
  deviceId: string;
  avatarDataUrl: string;
  description: string;
  isFavorite: boolean;
}

interface AddEditContactModalProps {
  open: boolean;
  editingContact: ContactRecord | null;
  existingDeviceIds: string[];
  onClose: () => void;
  onSave: (data: ContactFormSubmission, existingId?: string) => Promise<void>;
}

export function AddEditContactModal({
  open,
  editingContact,
  existingDeviceIds,
  onClose,
  onSave,
}: AddEditContactModalProps) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [avatarDataUrl, setAvatarDataUrl] = useState('');
  const [description, setDescription] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingContact) {
      setName(editingContact.name);
      setUsername(editingContact.username);
      setPhoneNumber(editingContact.phoneNumber);
      setDeviceId(editingContact.deviceId);
      setAvatarDataUrl(editingContact.avatarDataUrl);
      setDescription(editingContact.description);
      setIsFavorite(editingContact.isFavorite);
    } else {
      setName('');
      setUsername('');
      setPhoneNumber('');
      setDeviceId(generateFreeConnectDeviceId());
      setAvatarDataUrl('');
      setDescription('');
      setIsFavorite(false);
    }
  }, [open, editingContact]);

  if (!open) return null;

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, WebP).');
      return;
    }
    try {
      const dataUrl = await resizeAvatarFileToDataUrl(file);
      setAvatarDataUrl(dataUrl);
      setError(null);
    } catch {
      setError('Could not process that image. Please try another file.');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanDeviceId = deviceId.trim().toUpperCase();
    const cleanUsername = username.trim()
      ? username.trim().startsWith('@')
        ? username.trim()
        : `@${username.trim()}`
      : `@${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'peer'}`;

    if (!cleanName) {
      setError('Contact Name is required.');
      return;
    }
    if (!cleanDeviceId || cleanDeviceId.length < 4) {
      setError('A valid FreeConnect Device ID is required (e.g. FC-9A2B4C).');
      return;
    }

    const duplicate = existingDeviceIds.some(
      (id) =>
        id.toUpperCase() === cleanDeviceId &&
        (!editingContact || editingContact.deviceId.toUpperCase() !== cleanDeviceId)
    );
    if (duplicate) {
      setError(`Device ID "${cleanDeviceId}" already exists in your local contact book.`);
      return;
    }

    setSaving(true);
    try {
      await onSave(
        {
          name: cleanName,
          username: cleanUsername,
          phoneNumber: phoneNumber.trim(),
          deviceId: cleanDeviceId,
          avatarDataUrl,
          description: description.trim(),
          isFavorite,
        },
        editingContact?.id
      );
      onClose();
    } catch {
      setError('Failed to save contact locally.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-contact-modal-title"
    >
      <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-[#07152C] border border-slate-200 dark:border-cyan-400/30 shadow-[0_24px_80px_rgba(3,8,20,0.65)] overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-cyan-400/20 flex items-center justify-between gap-4 bg-slate-50/80 dark:bg-[#050E20]/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#06B6D4] flex items-center justify-center text-white shadow-[0_0_16px_rgba(37,99,235,0.45)]">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="add-contact-modal-title"
                className="text-base font-bold text-slate-900 dark:text-white"
              >
                {editingContact ? 'Edit Contact Details' : 'Add New FreeConnect Contact'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-cyan-300/80">
                Stored locally in browser IndexedDB · Zero cloud upload
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-9 h-9 rounded-xl hover:bg-slate-200 dark:hover:bg-cyan-400/15 flex items-center justify-center text-slate-500 dark:text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/15 border border-red-300 dark:border-red-400/40 text-xs text-red-700 dark:text-red-200">
              {error}
            </div>
          )}

          {/* Profile Picture Picker */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-[#050E20]/80 border border-slate-200 dark:border-cyan-400/20">
            <div className="relative shrink-0">
              {avatarDataUrl ? (
                <img
                  src={avatarDataUrl}
                  alt="Selected contact profile"
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-cyan-400/50"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#0891B2] flex items-center justify-center text-white text-lg font-bold border-2 border-cyan-300/40">
                  {getInitials(name || 'New Contact')}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Upload profile photo"
                className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-lg bg-[#2563EB] text-white flex items-center justify-center border border-white dark:border-[#07152C] shadow cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  Profile Picture
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-lg bg-blue-600/15 dark:bg-cyan-500/15 border border-blue-400/35 dark:border-cyan-400/35 text-blue-700 dark:text-cyan-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <Upload className="w-3 h-3" /> Upload Image
                  </button>
                  {avatarDataUrl && (
                    <button
                      type="button"
                      onClick={() => setAvatarDataUrl('')}
                      className="px-2 py-1 rounded-lg text-[11px] text-slate-500 hover:text-red-500 cursor-pointer"
                    >
                      Use Initials
                    </button>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Upload a photo from your device or leave empty for contact initials.
              </p>
            </div>
          </div>

          {/* Core Identity Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Contact Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Nadia Rahman"
                className="w-full h-10 px-3.5 rounded-xl bg-white dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 dark:focus:border-cyan-300"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="@nadia_offline"
                className="w-full h-10 px-3.5 rounded-xl bg-white dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 dark:focus:border-cyan-300"
              />
            </div>
          </div>

          {/* Device ID + Optional Phone Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
                  FreeConnect Device ID <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setDeviceId(generateFreeConnectDeviceId())}
                  className="text-[11px] font-medium text-blue-600 dark:text-cyan-300 hover:underline flex items-center gap-1 cursor-pointer"
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
                className="w-full h-10 px-3.5 rounded-xl bg-white dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 font-mono text-xs text-slate-900 dark:text-cyan-300 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 dark:focus:border-cyan-300"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Phone Number{' '}
                <span className="text-[11px] font-normal text-slate-400">(optional, reference only)</span>
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 (555) 014-8920"
                className="w-full h-10 px-3.5 rounded-xl bg-white dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 dark:focus:border-cyan-300"
              />
            </div>
          </div>

          {/* Personal Description */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Personal Description / Notes
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Team role, meeting point, or offline verification note..."
              className="w-full p-3 rounded-xl bg-white dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 dark:focus:border-cyan-300 resize-none"
            />
          </div>

          {/* Favorite Contact Option */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-[#050E20]/80 border border-slate-200 dark:border-cyan-400/20">
            <div className="flex items-center gap-2.5">
              <Star
                className={`w-4 h-4 ${
                  isFavorite ? 'text-amber-400 fill-amber-400' : 'text-slate-400'
                }`}
              />
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  Favorite Contact
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Pin to Favorite Contacts tab for quick offline access
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isFavorite}
              onClick={() => setIsFavorite((prev) => !prev)}
              className={`w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer ${
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

          {/* Honest Offline Storage Notice */}
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Note: Saving a contact stores it locally in IndexedDB as{' '}
            <strong className="text-slate-700 dark:text-slate-200">Disconnected</strong>. It does
            not mean the remote device is connected until a real Web Bluetooth link is established.
          </p>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-cyan-400/15">
            <button
              type="button"
              onClick={onClose}
              className="px-4 h-10 rounded-xl border border-slate-300 dark:border-cyan-400/25 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-cyan-400/10 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] hover:brightness-110 disabled:opacity-60 text-white text-xs font-bold tracking-wide shadow-[0_0_20px_rgba(37,99,235,0.45)] cursor-pointer"
            >
              {saving
                ? 'Saving to IndexedDB...'
                : editingContact
                  ? 'Save Changes'
                  : 'Save Contact Locally'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
