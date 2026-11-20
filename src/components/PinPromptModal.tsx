import { FormEvent, useEffect, useState } from 'react';
import { KeyRound, Loader2, Lock, ShieldAlert, X } from 'lucide-react';

interface PinPromptModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  hasPinConfigured: boolean;
  onVerifyPin: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  onSuccess: () => void | Promise<void>;
  onClose: () => void;
  onOpenSecuritySettings?: () => void;
}

export function PinPromptModal({
  open,
  title,
  description,
  confirmLabel = 'Verify PIN',
  hasPinConfigured,
  onVerifyPin,
  onSuccess,
  onClose,
  onOpenSecuritySettings,
}: PinPromptModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (open) {
      setPin('');
      setError(null);
      setVerifying(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pin.trim() || verifying) return;
    setVerifying(true);
    setError(null);
    const res = await onVerifyPin(pin);
    setVerifying(false);
    if (!res.ok) {
      setError(res.error ?? 'Incorrect PIN.');
      setPin('');
      return;
    }
    await onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#07152C] border border-slate-200 dark:border-cyan-400/35 p-6 space-y-5 shadow-[0_24px_80px_rgba(2,7,20,0.65)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#06B6D4] flex items-center justify-center text-white shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">{title}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close PIN prompt"
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-cyan-400/15 flex items-center justify-center text-slate-500 dark:text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!hasPinConfigured ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-400/35 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                You haven&apos;t created a personal PIN yet. Create a hashed PIN in{' '}
                <strong>Settings → Privacy &amp; Security</strong> before locking chats or folders.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 h-10 rounded-xl border border-slate-300 dark:border-cyan-400/25 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              {onOpenSecuritySettings && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSecuritySettings();
                  }}
                  className="px-4 h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" /> Create PIN in Settings
                </button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                autoFocus
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, ''));
                  setError(null);
                }}
                placeholder="Enter your PIN"
                className="w-full h-12 px-4 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/30 text-center font-mono text-lg tracking-[0.35em] text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-cyan-300"
              />
              {error && <p className="text-xs text-red-500 mt-2 text-center">{error}</p>}
            </div>

            <div className="flex items-center justify-between gap-2">
              {onOpenSecuritySettings ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSecuritySettings();
                  }}
                  className="text-xs text-blue-600 dark:text-cyan-300 hover:underline cursor-pointer"
                >
                  Forgot PIN?
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 h-10 rounded-xl border border-slate-300 dark:border-cyan-400/25 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pin.length < 4 || verifying}
                  className="px-5 h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {verifying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {confirmLabel}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
