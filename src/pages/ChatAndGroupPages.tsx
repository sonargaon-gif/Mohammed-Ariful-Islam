import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Ban,
  Bluetooth,
  BluetoothConnected,
  CheckCheck,
  Clock,
  Download,
  FileText,
  Info,
  Loader2,
  Lock,
  MessageSquare,
  Mic,
  Paperclip,
  Phone,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Send,
  Square,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  ContactDirectMessage,
  ContactLiveConnection,
  ContactRecord,
  PrivateChatFolder,
  WebGroupMessage,
  WebGroupRoom,
} from '../types/contacts';
import { TextSizeOption } from '../types/freeconnect';
import { getInitials } from '../utils/contactQrCodec';
import { ActiveVoiceRecorder, startRealVoiceRecording } from '../utils/voiceRecorder';
import { VoiceMessagePlayer } from '../components/VoiceMessagePlayer';
import { PinPromptModal } from '../components/PinPromptModal';

interface ChatPageProps {
  contacts: ContactRecord[];
  messages: ContactDirectMessage[];
  liveConnections: Record<string, ContactLiveConnection>;
  selectedContactId: string | null;
  textSize: TextSizeOption;
  hasPinConfigured?: boolean;
  privateFolders?: PrivateChatFolder[];
  onVerifyPin?: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  onLockChatToPrivate?: (contactId: string, folderId?: string | null) => Promise<void>;
  onOpenSecuritySettings?: () => void;
  onSelectContact: (contactId: string) => void;
  onSendMessage: (
    contactId: string,
    text: string,
    extra?: Partial<
      Pick<
        ContactDirectMessage,
        | 'kind'
        | 'voiceDurationSec'
        | 'voiceDataUrl'
        | 'voiceMimeType'
        | 'fileName'
        | 'fileSizeKb'
        | 'fileCategory'
        | 'fileDataUrl'
        | 'fileMimeType'
      >
    >
  ) => Promise<void>;
  onRetryMessage: (messageId: string) => Promise<void>;
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
  onClearConversation: (contactId: string) => Promise<void>;
  onConnectBluetooth: (contact: ContactRecord) => Promise<void>;
  onDisconnectBluetooth: (contactId: string) => void;
  onPatchContact: (contactId: string, patch: Partial<ContactRecord>) => Promise<void>;
  onAddNewContact: () => void;
  onOpenConnectPage: () => void;
}

const REACTION_EMOJIS = ['👍', '❤️', '🔒', '⚡'];
const MAX_OFFLINE_FILE_BYTES = 2 * 1024 * 1024; // 2 MB safe browser storage & P2P transfer limit

function formatStatusLabel(live?: ContactLiveConnection): {
  label: string;
  colorClass: string;
} {
  if (!live || live.status === 'disconnected') {
    return { label: 'Disconnected', colorClass: 'text-slate-500 dark:text-slate-400' };
  }
  if (live.status === 'failed') {
    return { label: 'Connection Declined', colorClass: 'text-rose-600 dark:text-rose-400' };
  }
  if (live.status === 'request_sent') {
    return { label: 'Request Sent...', colorClass: 'text-amber-600 dark:text-amber-300' };
  }
  if (live.status === 'request_received') {
    return { label: 'Request Received', colorClass: 'text-purple-600 dark:text-purple-300' };
  }
  if (live.status === 'searching') {
    return { label: 'Searching...', colorClass: 'text-blue-600 dark:text-cyan-300' };
  }
  if (live.status === 'connecting') {
    return {
      label: live.isAutoReconnecting
        ? `Reconnecting (${live.reconnectAttempt ?? 1}/3)...`
        : 'Connecting...',
      colorClass: 'text-amber-600 dark:text-amber-300',
    };
  }
  if (!live.writable) {
    return { label: 'Connected (Read-Only)', colorClass: 'text-amber-600 dark:text-amber-300' };
  }
  if (live.transport === 'native_ble') {
    return { label: 'Connected (Native BLE)', colorClass: 'text-emerald-600 dark:text-emerald-400' };
  }
  if (live.transport === 'native_wifi_direct') {
    return { label: 'Connected (Native P2P)', colorClass: 'text-emerald-600 dark:text-emerald-400' };
  }
  if (live.transport === 'web_bluetooth_gatt') {
    return { label: 'Connected (Bluetooth)', colorClass: 'text-emerald-600 dark:text-emerald-400' };
  }
  return { label: 'Connected (Offline P2P)', colorClass: 'text-emerald-600 dark:text-emerald-400' };
}

export function ChatPage({
  contacts,
  messages,
  liveConnections,
  selectedContactId,
  textSize,
  hasPinConfigured = false,
  privateFolders = [],
  onVerifyPin,
  onLockChatToPrivate,
  onOpenSecuritySettings,
  onSelectContact,
  onSendMessage,
  onRetryMessage,
  onToggleReaction,
  onClearConversation,
  onConnectBluetooth,
  onDisconnectBluetooth,
  onPatchContact,
  onAddNewContact,
  onOpenConnectPage,
}: ChatPageProps) {
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [showProfilePane, setShowProfilePane] = useState(false);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);

  // Long-press / context menu for "Lock Chat" -> Private Chats
  const [actionMenuContact, setActionMenuContact] = useState<ContactRecord | null>(null);
  const [targetLockFolderId, setTargetLockFolderId] = useState<string>('');
  const [pinLockTarget, setPinLockTarget] = useState<{
    contact: ContactRecord;
    folderId: string | null;
  } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  // Real microphone voice recording state (zero fake audio)
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const activeRecorderRef = useRef<ActiveVoiceRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Cleanup active recorder if component unmounts
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      activeRecorderRef.current?.cancel();
    };
  }, []);

  const visibleContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts
      .filter((c) => !c.isBlocked)
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.username.toLowerCase().includes(q) ||
          c.deviceId.toLowerCase().includes(q)
      );
  }, [contacts, search]);

  const activeContact =
    visibleContacts.find((c) => c.id === selectedContactId) ??
    contacts.find((c) => c.id === selectedContactId && !c.isBlocked) ??
    visibleContacts[0] ??
    null;

  const activeMessages = useMemo(
    () =>
      activeContact
        ? messages
            .filter((m) => m.contactId === activeContact.id)
            .sort((a, b) => a.timestamp - b.timestamp)
        : [],
    [messages, activeContact]
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, activeContact?.id]);

  const activeLive = activeContact ? liveConnections[activeContact.id] : undefined;
  const statusInfo = formatStatusLabel(activeLive);
  const isConnected = activeLive?.status === 'connected';
  const isBusy = activeLive?.status === 'searching' || activeLive?.status === 'connecting';

  const startLongPress = (contact: ContactRecord) => {
    if (!onLockChatToPrivate) return;
    longPressFiredRef.current = false;
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      setTargetLockFolderId('');
      setActionMenuContact(contact);
    }, 550);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const bodySizeClass =
    textSize === 'sm' ? 'text-xs' : textSize === 'lg' ? 'text-base' : 'text-sm';

  const handleSendText = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeContact || !draft.trim()) return;
    setComposerNotice(null);
    const textToSend = draft;
    setDraft('');
    await onSendMessage(activeContact.id, textToSend);
  };

  const handleAttachFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeContact) return;
    setComposerNotice(null);

    if (file.size > MAX_OFFLINE_FILE_BYTES) {
      setComposerNotice(
        `"${file.name}" is larger than 2 MB. Choose a smaller file for reliable offline transfer.`
      );
      return;
    }

    const category: ContactDirectMessage['fileCategory'] = file.type.startsWith('image/')
      ? 'Image'
      : file.type.startsWith('audio/')
        ? 'Audio'
        : file.type.includes('pdf') || file.type.includes('text') || file.type.includes('document')
          ? 'Document'
          : 'Other';
    const sizeKb = Math.max(1, Math.round(file.size / 1024));

    const reader = new FileReader();
    reader.onerror = () => {
      setComposerNotice(`Could not read "${file.name}".`);
    };
    reader.onload = () => {
      void onSendMessage(activeContact.id, `Shared file: ${file.name}`, {
        kind: 'file',
        fileName: file.name,
        fileSizeKb: sizeKb,
        fileCategory: category,
        fileDataUrl: String(reader.result),
        fileMimeType: file.type || 'application/octet-stream',
      });
    };
    reader.readAsDataURL(file);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleStartVoiceRecording = async () => {
    if (!activeContact || recording) return;
    setComposerNotice(null);
    try {
      const rec = await startRealVoiceRecording();
      activeRecorderRef.current = rec;
      setRecordSec(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => setRecordSec((s) => s + 1), 1000);
    } catch (err) {
      setRecording(false);
      stopTimer();
      setComposerNotice(
        err instanceof Error ? err.message : 'Unable to access device microphone.'
      );
    }
  };

  const handleStopAndSendVoice = async () => {
    if (!activeContact || !activeRecorderRef.current) return;
    const rec = activeRecorderRef.current;
    activeRecorderRef.current = null;
    setRecording(false);
    stopTimer();
    try {
      const result = await rec.stop();
      await onSendMessage(activeContact.id, `Voice message (${result.durationSec}s)`, {
        kind: 'voice',
        voiceDurationSec: result.durationSec,
        voiceDataUrl: result.dataUrl,
        voiceMimeType: result.mimeType,
      });
    } catch (err) {
      setComposerNotice(
        err instanceof Error ? err.message : 'Voice recording could not be saved.'
      );
    }
  };

  const handleCancelVoice = () => {
    activeRecorderRef.current?.cancel();
    activeRecorderRef.current = null;
    setRecording(false);
    stopTimer();
    setRecordSec(0);
  };

  const downloadAttachment = (msg: ContactDirectMessage) => {
    if (!msg.fileDataUrl) return;
    const a = document.createElement('a');
    a.href = msg.fileDataUrl;
    a.download = msg.fileName ?? 'freeconnect-file';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="rounded-3xl bg-white dark:bg-[#07152C]/80 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/25 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[640px] lg:h-[calc(100vh-140px)] shadow-sm">
      {/* LEFT PANE: CONVERSATION LIST */}
      <div className="lg:col-span-4 xl:col-span-3 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-cyan-400/15 flex flex-col min-h-0">
        <div className="p-4 border-b border-slate-200 dark:border-cyan-400/15 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Chats</h2>
            <button
              type="button"
              onClick={onAddNewContact}
              title="Add new contact"
              className="px-2.5 py-1 rounded-lg bg-blue-600/15 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts..."
              className="w-full h-9 pl-8 pr-3 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-200 dark:border-cyan-400/20 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 dark:focus:border-cyan-300"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-cyan-400/10">
          {visibleContacts.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No contacts yet. Add a real person or connect a nearby device.
              </p>
              <button
                type="button"
                onClick={onOpenConnectPage}
                className="text-xs font-semibold text-blue-600 dark:text-cyan-300 hover:underline cursor-pointer"
              >
                Open Bluetooth &amp; Connect →
              </button>
            </div>
          ) : (
            visibleContacts.map((contact) => {
              const cMsgs = messages.filter((m) => m.contactId === contact.id);
              const latest = cMsgs[cMsgs.length - 1];
              const isSelected = activeContact?.id === contact.id;
              const cStatus = formatStatusLabel(liveConnections[contact.id]);
              return (
                <div
                  key={contact.id}
                  onPointerDown={() => startLongPress(contact)}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onContextMenu={(e) => {
                    if (!onLockChatToPrivate) return;
                    e.preventDefault();
                    setTargetLockFolderId('');
                    setActionMenuContact(contact);
                  }}
                  className={`w-full p-3.5 flex items-center gap-3 text-left transition-colors select-none ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-[#0D2347]/90'
                      : 'hover:bg-slate-50 dark:hover:bg-[#0B1C3A]/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (longPressFiredRef.current) {
                        longPressFiredRef.current = false;
                        return;
                      }
                      onSelectContact(contact.id);
                    }}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    {contact.avatarDataUrl ? (
                      <img
                        src={contact.avatarDataUrl}
                        alt={contact.name}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-2xl object-cover border border-cyan-400/35 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#0891B2] flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {getInitials(contact.name)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {contact.name}
                        </span>
                        {latest && (
                          <span className="text-[10px] font-mono tabular-nums text-slate-400 shrink-0">
                            {new Date(latest.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {latest
                          ? `${latest.isOutgoing ? 'You: ' : ''}${latest.text}`
                          : contact.deviceId}
                      </p>
                      <p className={`text-[10px] font-mono mt-0.5 ${cStatus.colorClass}`}>
                        {cStatus.label}
                      </p>
                    </div>
                  </button>

                  {onLockChatToPrivate && (
                    <button
                      type="button"
                      title="Lock Chat (or long-press row)"
                      onClick={() => {
                        setTargetLockFolderId('');
                        setActionMenuContact(contact);
                      }}
                      className="w-7 h-7 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-cyan-300 hover:bg-slate-200/70 dark:hover:bg-cyan-400/15 flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
        {onLockChatToPrivate && visibleContacts.length > 0 && (
          <div className="px-3.5 py-2 border-t border-slate-100 dark:border-cyan-400/10 text-[10px] text-slate-400 text-center">
            Tip: Long-press any chat or tap the lock icon to move it to Private Chats
          </div>
        )}
      </div>

      {/* CENTER PANE: ACTIVE CHAT STREAM */}
      <div
        className={`${
          showProfilePane ? 'lg:col-span-8 xl:col-span-6' : 'lg:col-span-8 xl:col-span-9'
        } flex flex-col min-h-[480px] lg:min-h-0`}
      >
        {!activeContact ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <MessageSquare className="w-10 h-10 text-blue-500 dark:text-cyan-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {visibleContacts.length === 0
                ? 'Start an Offline Conversation'
                : 'Select a contact to message'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
              Connect directly to a nearby Bluetooth device or pair with another person using a
              6-digit Pairing Code to exchange text, voice recordings, and files.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={onAddNewContact}
                className="px-4 h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Contact
              </button>
              <button
                type="button"
                onClick={onOpenConnectPage}
                className="px-4 h-10 rounded-xl border border-slate-300 dark:border-cyan-400/35 text-slate-700 dark:text-cyan-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Bluetooth className="w-4 h-4" /> Connect Device
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-cyan-400/15 bg-slate-50/70 dark:bg-[#050E20]/80 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {activeContact.avatarDataUrl ? (
                  <img
                    src={activeContact.avatarDataUrl}
                    alt={activeContact.name}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-xl object-cover border border-cyan-400/35 shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#0891B2] flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {getInitials(activeContact.name)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {activeContact.name}
                  </p>
                  <p className="text-[11px] font-mono truncate">
                    <span className="text-slate-500 dark:text-slate-400">
                      {activeContact.deviceId} ·{' '}
                    </span>
                    <span className={statusInfo.colorClass}>{statusInfo.label}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {isConnected ? (
                  <button
                    type="button"
                    onClick={() => onDisconnectBluetooth(activeContact.id)}
                    className="px-3 h-8 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <BluetoothConnected className="w-3.5 h-3.5" /> Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void onConnectBluetooth(activeContact)}
                    className="px-3 h-8 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {isBusy ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {activeLive?.status === 'searching' ? 'Searching' : 'Connecting'}
                      </>
                    ) : (
                      <>
                        <Bluetooth className="w-3.5 h-3.5" /> Connect
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowProfilePane((s) => !s)}
                  title="Toggle contact info"
                  className={`w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer ${
                    showProfilePane
                      ? 'bg-blue-600/15 dark:bg-cyan-500/20 text-blue-600 dark:text-cyan-300'
                      : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-cyan-400/10'
                  }`}
                >
                  <Info className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Connection detail notice when non-writable or error */}
            {activeLive?.detailMessage && !activeLive.writable && (
              <div className="px-4 py-2 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-400/25 flex items-center justify-between gap-3 text-[11px] text-amber-800 dark:text-amber-200">
                <span className="leading-snug">{activeLive.detailMessage}</span>
                <button
                  type="button"
                  onClick={onOpenConnectPage}
                  className="font-semibold underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Direct Pair
                </button>
              </div>
            )}

                {/* Message Bubbles (Both Incoming & Outgoing) */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
                  {activeMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
                      <Radio className="w-9 h-9 text-blue-500 dark:text-cyan-400 mb-2.5" />
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Ready to chat with {activeContact.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm leading-relaxed">
                        {isConnected && activeLive?.writable
                          ? 'Connected live. Messages, voice notes, and files will transmit immediately.'
                          : 'Currently disconnected. Messages sent now will queue offline in IndexedDB and transmit automatically when you connect.'}
                      </p>
                    </div>
                  ) : (
                    activeMessages.map((msg) => {
                      const outgoing = msg.isOutgoing;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${outgoing ? 'items-end' : 'items-start'}`}
                        >
                          {!outgoing && (
                            <span className="text-[11px] font-semibold text-blue-600 dark:text-cyan-300 mb-1 px-1">
                              {msg.senderName ?? activeContact.name}
                            </span>
                          )}

                          <div
                            onClick={() =>
                              setActiveReactionMsgId((prev) => (prev === msg.id ? null : msg.id))
                            }
                            className={`max-w-[85%] sm:max-w-[76%] rounded-2xl px-4 py-2.5 cursor-pointer transition-all ${
                              outgoing
                                ? msg.kind === 'sos'
                                  ? 'rounded-br-sm bg-red-600 text-white border border-red-300 shadow-[0_0_18px_rgba(239,68,68,0.35)]'
                                  : 'rounded-br-sm bg-gradient-to-br from-[#2563EB] to-[#0284C7] text-white border border-cyan-300/40 shadow-sm'
                                : msg.kind === 'sos'
                                  ? 'rounded-bl-sm bg-red-50 dark:bg-red-950/60 text-red-900 dark:text-red-100 border border-red-400/50'
                                  : 'rounded-bl-sm bg-slate-100 dark:bg-[#0D2142] text-slate-900 dark:text-white border border-slate-200 dark:border-cyan-400/25'
                            }`}
                          >
                            {msg.kind === 'voice' ? (
                              <VoiceMessagePlayer
                                src={msg.voiceDataUrl}
                                durationSec={msg.voiceDurationSec}
                                variant={outgoing ? 'outgoing' : 'incoming'}
                              />
                            ) : msg.kind === 'file' ? (
                              <div className="space-y-2">
                                {msg.fileCategory === 'Image' && msg.fileDataUrl && (
                                  <img
                                    src={msg.fileDataUrl}
                                    alt={msg.fileName ?? 'Shared image'}
                                    className="max-h-56 rounded-xl object-contain bg-black/20"
                                  />
                                )}
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <FileText className="w-5 h-5 shrink-0" />
                                    <div className="min-w-0">
                                      <p className={`${bodySizeClass} font-semibold truncate`}>
                                        {msg.fileName ?? msg.text}
                                      </p>
                                      <p className="text-[10px] font-mono opacity-80">
                                        {msg.fileCategory ?? 'File'} · {msg.fileSizeKb ?? 1} KB
                                      </p>
                                    </div>
                                  </div>
                                  {msg.fileDataUrl && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        downloadAttachment(msg);
                                      }}
                                      className={`px-2.5 h-8 rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer ${
                                        outgoing
                                          ? 'bg-white/20 hover:bg-white/30 text-white'
                                          : 'bg-blue-600 text-white hover:bg-blue-700'
                                      }`}
                                    >
                                      <Download className="w-3.5 h-3.5" /> Save
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <p className={`${bodySizeClass} leading-relaxed whitespace-pre-wrap break-words`}>
                                {msg.text}
                              </p>
                            )}

                            <div
                              className={`flex items-center justify-end gap-1.5 mt-1.5 text-[10px] font-mono tabular-nums ${
                                outgoing
                                  ? 'text-cyan-100/90'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              <span>
                                {new Date(msg.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>

                              {outgoing && (
                                <>
                                  <span>·</span>
                                  {msg.deliveryState === 'SENDING' ? (
                                    <span className="flex items-center gap-0.5 text-cyan-100">
                                      <Loader2 className="w-3 h-3 animate-spin" /> Sending...
                                    </span>
                                  ) : msg.deliveryState === 'DELIVERED' ? (
                                    <span className="flex items-center gap-0.5 text-emerald-200">
                                      <CheckCheck className="w-3 h-3" /> Delivered
                                    </span>
                                  ) : msg.deliveryState === 'SENT_OVER_BLUETOOTH' ? (
                                    <span className="flex items-center gap-0.5 text-emerald-200">
                                      <BluetoothConnected className="w-3 h-3" /> Sent (BT)
                                    </span>
                                  ) : msg.deliveryState === 'SENT_OVER_P2P' ? (
                                    <span className="flex items-center gap-0.5 text-cyan-200">
                                      <Radio className="w-3 h-3" /> Sent
                                    </span>
                                  ) : msg.deliveryState === 'FAILED' ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void onRetryMessage(msg.id);
                                      }}
                                      className="flex items-center gap-1 text-red-200 underline cursor-pointer"
                                    >
                                      <RotateCcw className="w-3 h-3" /> Failed · Retry
                                    </button>
                                  ) : (
                                    <span className="flex items-center gap-0.5 text-amber-200">
                                      <Clock className="w-3 h-3" /> Queued Offline
                                    </span>
                                  )}
                                </>
                              )}
                            </div>

                            {msg.errorText && (
                              <p className="text-[10px] text-amber-200 mt-1">{msg.errorText}</p>
                            )}
                          </div>

                          {/* Emoji Reactions */}
                          {msg.reactions && msg.reactions.length > 0 && (
                            <div className="flex items-center gap-1 mt-1">
                              {msg.reactions.map((em) => (
                                <button
                                  key={em}
                                  type="button"
                                  onClick={() => void onToggleReaction(msg.id, em)}
                                  className="px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-[#0D2142] border border-slate-200 dark:border-cyan-400/30 cursor-pointer"
                                >
                                  {em}
                                </button>
                              ))}
                            </div>
                          )}

                          {activeReactionMsgId === msg.id && (
                            <div className="flex items-center gap-1 mt-1.5 px-2 py-1 rounded-xl bg-white dark:bg-[#050E20] border border-slate-200 dark:border-cyan-400/30 shadow-sm">
                              {REACTION_EMOJIS.map((em) => (
                                <button
                                  key={em}
                                  type="button"
                                  onClick={() => {
                                    void onToggleReaction(msg.id, em);
                                    setActiveReactionMsgId(null);
                                  }}
                                  className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-cyan-400/15 text-sm flex items-center justify-center cursor-pointer"
                                >
                                  {em}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div ref={endRef} />
                </div>

                {/* Microphone / File Error Feedback */}
                {composerNotice && (
                  <div className="px-4 py-2 bg-red-50 dark:bg-red-500/15 border-t border-red-200 dark:border-red-400/30 flex items-center justify-between gap-2 text-xs text-red-700 dark:text-red-200">
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {composerNotice}
                    </span>
                    <button
                      type="button"
                      onClick={() => setComposerNotice(null)}
                      className="text-red-500 hover:text-red-300 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Composer */}
                <form
                  onSubmit={handleSendText}
                  className="p-3.5 border-t border-slate-200 dark:border-cyan-400/15 bg-slate-50/80 dark:bg-[#050E20]/90 flex items-center gap-2 shrink-0"
                >
                  {recording ? (
                    <div className="flex-1 flex items-center justify-between gap-3 h-10 px-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-400/40">
                      <div className="flex items-center gap-2 text-xs font-mono font-bold text-red-600 dark:text-red-300">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                        Recording voice · 00:{String(recordSec).padStart(2, '0')}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCancelVoice}
                          className="px-2.5 h-7 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:bg-white/10 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleStopAndSendVoice()}
                          className="px-3 h-7 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Square className="w-3 h-3" /> Send Voice
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        title="Share file (up to 2 MB)"
                        className="w-10 h-10 rounded-xl border border-slate-300 dark:border-cyan-400/25 hover:bg-slate-200 dark:hover:bg-cyan-400/10 text-slate-600 dark:text-cyan-300 flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        <Paperclip className="w-4 h-4" />
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleAttachFile}
                        className="hidden"
                      />

                      <button
                        type="button"
                        onClick={() => void handleStartVoiceRecording()}
                        title="Record voice message"
                        className="w-10 h-10 rounded-xl border border-slate-300 dark:border-cyan-400/25 hover:bg-slate-200 dark:hover:bg-cyan-400/10 text-slate-600 dark:text-cyan-300 flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        <Mic className="w-4 h-4" />
                      </button>

                      <input
                        type="text"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={
                          isConnected && activeLive?.writable
                            ? `Message ${activeContact.name}...`
                            : `Queue offline message for ${activeContact.name}...`
                        }
                        className="flex-1 h-10 px-3.5 rounded-xl bg-white dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 dark:focus:border-cyan-300"
                      />

                      <button
                        type="submit"
                        aria-label="Send message"
                        className="w-10 h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] hover:brightness-110 text-white flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(37,99,235,0.45)] cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </form>
          </>
        )}
      </div>

      {/* LONG-PRESS / LOCK CHAT ACTION SHEET */}
      {actionMenuContact && onLockChatToPrivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#07152C] border border-slate-200 dark:border-cyan-400/35 p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                  Lock Chat: {actionMenuContact.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Hides this conversation from Normal Chats and protects it inside Private Chats
                  with your personal PIN.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActionMenuContact(null)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-cyan-400/15 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {privateFolders.length > 0 && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Move into Private Folder (optional)
                </label>
                <select
                  value={targetLockFolderId}
                  onChange={(e) => setTargetLockFolderId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-xs text-slate-900 dark:text-white"
                >
                  <option value="">All Private Chats (No specific folder)</option>
                  {privateFolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} {f.isLocked ? '(Locked Folder)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActionMenuContact(null)}
                className="px-4 h-10 rounded-xl border border-slate-300 dark:border-cyan-400/25 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = actionMenuContact;
                  const fId = targetLockFolderId || null;
                  setActionMenuContact(null);
                  setPinLockTarget({ contact: target, folderId: fId });
                }}
                className="px-4 h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" /> Lock Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CRYPTOGRAPHIC PIN PROMPT FOR LOCKING A CHAT */}
      {onVerifyPin && onLockChatToPrivate && (
        <PinPromptModal
          open={Boolean(pinLockTarget)}
          title={pinLockTarget ? `Lock "${pinLockTarget.contact.name}"` : 'Lock Chat'}
          description="Enter your personal PIN to lock this conversation and move it into Private Chats."
          confirmLabel="Confirm & Lock"
          hasPinConfigured={hasPinConfigured}
          onVerifyPin={onVerifyPin}
          onSuccess={async () => {
            if (!pinLockTarget) return;
            await onLockChatToPrivate(pinLockTarget.contact.id, pinLockTarget.folderId);
            setPinLockTarget(null);
          }}
          onClose={() => setPinLockTarget(null)}
          onOpenSecuritySettings={onOpenSecuritySettings}
        />
      )}

      {/* RIGHT PANE: CONTACT PROFILE INFORMATION */}
      {showProfilePane && activeContact && (
        <div className="hidden xl:flex xl:col-span-3 border-l border-slate-200 dark:border-cyan-400/15 p-5 flex-col justify-between bg-slate-50/50 dark:bg-[#050E20]/50 overflow-y-auto">
          <div className="space-y-5">
            <div className="text-center space-y-2.5 pt-2">
              {activeContact.avatarDataUrl ? (
                <img
                  src={activeContact.avatarDataUrl}
                  alt={activeContact.name}
                  referrerPolicy="no-referrer"
                  className="w-20 h-20 rounded-3xl object-cover mx-auto border-2 border-cyan-400/45"
                />
              ) : (
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#2563EB] to-[#0891B2] flex items-center justify-center text-white text-xl font-bold mx-auto">
                  {getInitials(activeContact.name)}
                </div>
              )}
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {activeContact.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {activeContact.username}
                </p>
                <p className="text-xs font-mono text-blue-600 dark:text-cyan-300 mt-1">
                  {activeContact.deviceId}
                </p>
              </div>
            </div>

            <div className="space-y-2.5 pt-4 border-t border-slate-200 dark:border-cyan-400/15 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Connection Status</span>
                <span className={`font-mono font-semibold ${statusInfo.colorClass}`}>
                  {statusInfo.label}
                </span>
              </div>

              {activeContact.phoneNumber && (
                <div>
                  <span className="text-slate-400 block text-[11px]">
                    Phone (Reference Only)
                  </span>
                  <span className="font-mono text-slate-800 dark:text-slate-200 flex items-center gap-1 mt-0.5">
                    <Phone className="w-3 h-3" /> {activeContact.phoneNumber}
                  </span>
                </div>
              )}

              {activeContact.description && (
                <div>
                  <span className="text-slate-400 block text-[11px]">Notes</span>
                  <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                    {activeContact.description}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() =>
                  void onPatchContact(activeContact.id, {
                    isFavorite: !activeContact.isFavorite,
                  })
                }
                className="w-full h-9 rounded-xl border border-slate-300 dark:border-cyan-400/25 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 hover:bg-slate-100 dark:hover:bg-cyan-400/10 cursor-pointer"
              >
                <Star
                  className={`w-3.5 h-3.5 ${
                    activeContact.isFavorite ? 'text-amber-400 fill-amber-400' : ''
                  }`}
                />
                {activeContact.isFavorite ? 'Favorited' : 'Favorite'}
              </button>
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-cyan-400/15">
            <button
              type="button"
              onClick={() => void onClearConversation(activeContact.id)}
              className="w-full h-9 rounded-xl border border-slate-300 dark:border-cyan-400/20 hover:bg-red-500/10 text-slate-600 dark:text-slate-300 hover:text-red-400 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear Local Chat
            </button>
            <button
              type="button"
              onClick={() => void onPatchContact(activeContact.id, { isBlocked: true })}
              className="w-full h-9 rounded-xl border border-red-300 dark:border-red-400/30 hover:bg-red-500/15 text-red-600 dark:text-red-300 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Ban className="w-3.5 h-3.5" /> Block Contact
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface GroupChatPageProps {
  rooms: WebGroupRoom[];
  groupMessages: WebGroupMessage[];
  contacts: ContactRecord[];
  onCreateRoom: (name: string, description: string, memberIds: string[]) => string | undefined;
  onSendGroupMessage: (roomId: string, text: string) => void;
  onToggleReaction: (msgId: string, emoji: string) => void;
}

export function GroupChatPage({
  rooms,
  groupMessages,
  contacts,
  onCreateRoom,
  onSendGroupMessage,
  onToggleReaction,
}: GroupChatPageProps) {
  const [selectedRoomId, setSelectedRoomId] = useState<string>(rooms[0]?.id ?? '');
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const activeContacts = contacts.filter((c) => !c.isBlocked);
  const activeRoom = rooms.find((r) => r.id === selectedRoomId) ?? rooms[0] ?? null;
  const activeMsgs = activeRoom
    ? groupMessages.filter((m) => m.roomId === activeRoom.id)
    : [];

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || selectedMembers.length === 0) return;
    const id = onCreateRoom(newName, newDesc, selectedMembers);
    if (id) setSelectedRoomId(id);
    setNewName('');
    setNewDesc('');
    setSelectedMembers([]);
    setCreating(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-4 rounded-3xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/25 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
            Offline Group Rooms
          </h2>
          <button
            type="button"
            onClick={() => setCreating((s) => !s)}
            className="px-3 py-1.5 rounded-xl bg-[#2563EB] text-white text-xs font-semibold cursor-pointer"
          >
            {creating ? 'Cancel' : '+ New Room'}
          </button>
        </div>

        {creating && (
          <form
            onSubmit={handleCreate}
            className="p-4 rounded-2xl bg-slate-50 dark:bg-[#050E20] border border-slate-200 dark:border-cyan-400/20 space-y-3"
          >
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Group Room Name"
              className="w-full h-9 px-3 rounded-xl bg-white dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-xs text-slate-900 dark:text-white"
            />
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Purpose / short description"
              className="w-full h-9 px-3 rounded-xl bg-white dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-xs text-slate-900 dark:text-white"
            />
            <div className="space-y-1.5">
              <p className="text-[11px] text-slate-500">
                Select Real Human Participants ({selectedMembers.length} selected)
              </p>
              {activeContacts.length === 0 ? (
                <p className="text-[11px] text-amber-600 dark:text-amber-300 leading-relaxed">
                  No saved contacts yet. Add real people in Contacts first to invite them to a group.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {activeContacts.map((c) => {
                    const picked = selectedMembers.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setSelectedMembers((prev) =>
                            picked ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] border cursor-pointer ${
                          picked
                            ? 'bg-[#2563EB] text-white border-cyan-300'
                            : 'border-slate-300 dark:border-cyan-400/20 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={selectedMembers.length === 0}
              className="w-full h-9 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] disabled:opacity-45 text-white text-xs font-bold cursor-pointer"
            >
              Create Offline Group
            </button>
          </form>
        )}

        {rooms.length === 0 ? (
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-[#050E20]/80 border border-slate-200 dark:border-cyan-400/15 text-center space-y-1.5">
            <p className="text-xs font-semibold text-slate-900 dark:text-white">
              No group rooms yet
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Create a group room with your saved human contacts using + New Room.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setSelectedRoomId(room.id)}
                className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
                  activeRoom?.id === room.id
                    ? 'bg-blue-50 dark:bg-[#0D2347] border-blue-500 dark:border-cyan-300/60'
                    : 'bg-slate-50 dark:bg-[#050E20]/80 border-slate-200 dark:border-cyan-400/15 hover:border-blue-400'
                }`}
              >
                <p className="text-sm font-bold text-slate-900 dark:text-white">{room.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                  {room.description}
                </p>
                <p className="text-[11px] font-mono text-blue-600 dark:text-cyan-300 mt-1.5">
                  {room.memberContactIds.length} member
                  {room.memberContactIds.length === 1 ? '' : 's'}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="lg:col-span-8 rounded-3xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/25 overflow-hidden flex flex-col min-h-[560px]">
        {activeRoom ? (
          <>
            <div className="px-6 py-4 border-b border-slate-200 dark:border-cyan-400/15 bg-slate-50/70 dark:bg-[#050E20]/80 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {activeRoom.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {activeRoom.description}
                </p>
              </div>
              <span className="text-xs font-mono text-blue-600 dark:text-cyan-300">
                Local Room · Zero Cloud Server
              </span>
            </div>

            <div className="flex-1 p-5 space-y-3 overflow-y-auto">
              {activeMsgs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 space-y-2">
                  <Users className="w-8 h-8 text-blue-500 dark:text-cyan-400" />
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    No messages in {activeRoom.name} yet
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                    Send your first message below to deliver to connected members or queue locally.
                  </p>
                </div>
              ) : (
                activeMsgs.map((gm) => (
                  <div
                    key={gm.id}
                    className="rounded-2xl bg-slate-50 dark:bg-[#050E20]/90 border border-slate-200 dark:border-cyan-400/20 p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-blue-600 dark:text-cyan-300">
                        {gm.senderName}
                      </span>
                      <span className="font-mono tabular-nums text-slate-400">
                        {new Date(gm.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
                      {gm.text}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        Delivered Live: {gm.sentLiveCount} · Queued Offline: {gm.queuedCount}
                      </span>
                      <div className="flex items-center gap-1">
                        {REACTION_EMOJIS.map((em) => (
                          <button
                            key={em}
                            type="button"
                            onClick={() => onToggleReaction(gm.id, em)}
                            className={`px-2 py-0.5 rounded-lg text-xs border cursor-pointer ${
                              gm.reactions.includes(em)
                                ? 'bg-blue-600/20 border-cyan-400/50'
                                : 'border-slate-200 dark:border-cyan-400/15 opacity-70 hover:opacity-100'
                            }`}
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                onSendGroupMessage(activeRoom.id, draft);
                setDraft('');
              }}
              className="p-4 border-t border-slate-200 dark:border-cyan-400/15 flex gap-2 bg-slate-50/70 dark:bg-[#050E20]/85"
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Broadcast to ${activeRoom.name}...`}
                className="flex-1 h-10 px-4 rounded-xl bg-white dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-sm text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="px-4 h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-4 h-4" /> Send
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-3">
            <Users className="w-10 h-10 text-blue-500 dark:text-cyan-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Create Your First Human Group Chat
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
              Group chats contain only real contacts you save locally. Add real people in Contacts,
              then create an offline group room here.
            </p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="px-4 h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold cursor-pointer"
            >
              + Create Group Room
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
