import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  Bluetooth,
  BluetoothConnected,
  Clock,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  ContactDirectMessage,
  ContactLiveConnection,
  ContactRecord,
} from '../types/contacts';
import {
  clearMessagesForContact,
  loadMessagesForContact,
  saveDirectMessage,
} from '../storage/contactsDb';
import { getInitials } from '../utils/contactQrCodec';

interface ContactChatModalProps {
  contact: ContactRecord | null;
  liveConnection: ContactLiveConnection | undefined;
  onClose: () => void;
  onConnectBluetooth: (contact: ContactRecord) => void;
  onDisconnectBluetooth: (contactId: string) => void;
}

export function ContactChatModal({
  contact,
  liveConnection,
  onClose,
  onConnectBluetooth,
  onDisconnectBluetooth,
}: ContactChatModalProps) {
  const [messages, setMessages] = useState<ContactDirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contact) return;
    let cancelled = false;
    setLoading(true);
    loadMessagesForContact(contact.id)
      .then((loaded) => {
        if (!cancelled) setMessages(loaded);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contact]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!contact) return null;

  const isConnected = liveConnection?.status === 'connected';

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const clean = draft.trim();
    if (!clean) return;

    const msg: ContactDirectMessage = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      contactId: contact.id,
      text: clean,
      timestamp: Date.now(),
      isOutgoing: true,
      deliveryState: isConnected ? 'SENT_OVER_BLUETOOTH' : 'QUEUED_OFFLINE',
    };

    await saveDirectMessage(msg);
    setMessages((prev) => [...prev, msg]);
    setDraft('');
  };

  const handleClear = async () => {
    await clearMessagesForContact(contact.id);
    setMessages([]);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Conversation with ${contact.name}`}
    >
      <div className="w-full max-w-xl h-[640px] max-h-[88vh] rounded-3xl bg-white dark:bg-[#07152C] border border-slate-200 dark:border-cyan-400/30 shadow-[0_24px_80px_rgba(3,8,20,0.65)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-cyan-400/20 bg-slate-50/90 dark:bg-[#050E20]/90 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {contact.avatarDataUrl ? (
              <img
                src={contact.avatarDataUrl}
                alt={contact.name}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-full object-cover border border-cyan-400/40 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2563EB] to-[#0891B2] flex items-center justify-center text-white text-xs font-bold shrink-0">
                {getInitials(contact.name)}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {contact.name}
              </h3>
              <p className="text-[11px] font-mono truncate">
                <span className="text-slate-500 dark:text-slate-400">{contact.deviceId} · </span>
                <span
                  className={
                    isConnected
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }
                >
                  {isConnected ? 'Connected via Web Bluetooth' : 'Disconnected · Local Queue'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isConnected ? (
              <button
                type="button"
                onClick={() => onDisconnectBluetooth(contact.id)}
                className="px-2.5 h-8 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <BluetoothConnected className="w-3.5 h-3.5" /> Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onConnectBluetooth(contact)}
                className="px-2.5 h-8 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Bluetooth className="w-3.5 h-3.5" /> Connect BT
              </button>
            )}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => void handleClear()}
                title="Clear local conversation"
                className="w-8 h-8 rounded-xl hover:bg-red-500/15 text-slate-400 hover:text-red-500 flex items-center justify-center cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl hover:bg-slate-200 dark:hover:bg-cyan-400/15 text-slate-500 dark:text-slate-300 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Honest Transport Banner */}
        <div className="px-5 py-2 bg-blue-50/80 dark:bg-[#081A36] border-b border-slate-200 dark:border-cyan-400/15 text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2 shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400 shrink-0" />
          {isConnected ? (
            <span>
              Live Web Bluetooth session active ({liveConnection?.connectedDeviceName}). Messages saved locally in IndexedDB.
            </span>
          ) : (
            <span>
              Device is currently <strong>Disconnected</strong>. Messages you compose are stored locally in IndexedDB as <em>Queued Offline</em> until paired via Bluetooth.
            </span>
          )}
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <p className="text-xs text-center text-slate-400 py-10">
              Loading local IndexedDB conversation...
            </p>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <Bluetooth className="w-9 h-9 text-blue-500 dark:text-cyan-400 mb-2.5" />
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Offline Conversation with {contact.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm leading-relaxed">
                Messages are persisted in your browser&apos;s IndexedDB and remain available after page refresh.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="flex flex-col items-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 bg-gradient-to-br from-[#2563EB] to-[#0284C7] text-white shadow-sm">
                  <p className="text-sm leading-relaxed">{msg.text}</p>
                  <div className="flex items-center justify-end gap-1.5 mt-1 text-[10px] font-mono tabular-nums text-cyan-100/90">
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span>·</span>
                    {msg.deliveryState === 'SENT_OVER_BLUETOOTH' ? (
                      <span className="flex items-center gap-0.5 text-emerald-200">
                        <BluetoothConnected className="w-3 h-3" /> BT Session
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-amber-200">
                        <Clock className="w-3 h-3" /> Queued Offline
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <form
          onSubmit={handleSend}
          className="p-3.5 border-t border-slate-200 dark:border-cyan-400/20 bg-slate-50 dark:bg-[#050E20] flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              isConnected
                ? `Message ${contact.name} over Bluetooth...`
                : `Queue offline message for ${contact.name}...`
            }
            className="flex-1 h-11 px-4 rounded-xl bg-white dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 dark:focus:border-cyan-300"
          />
          <button
            type="submit"
            aria-label="Send message"
            className="w-11 h-11 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] hover:brightness-110 text-white flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(37,99,235,0.45)] cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
