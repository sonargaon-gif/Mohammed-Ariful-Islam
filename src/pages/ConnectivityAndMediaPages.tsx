import { ChangeEvent, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Download,
  FileAudio,
  FileImage,
  FileText,
  FolderOpen,
  Loader2,
  Mic,
  Send,
  ShieldAlert,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  BrowserCapabilityReport,
  ContactLiveConnection,
  ContactRecord,
  LocalVoiceClip,
  StagedOfflineFile,
  UserProfileRecord,
  WebSosRecord,
} from '../types/contacts';
import { ActiveVoiceRecorder, startRealVoiceRecording } from '../utils/voiceRecorder';
import { VoiceMessagePlayer } from '../components/VoiceMessagePlayer';

const MAX_OFFLINE_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

/* PAGE 9: VOICE MESSAGES PAGE (REAL MICROPHONE RECORDING + PLAY/PAUSE/SEEK) */
interface VoiceMessagesPageProps {
  contacts: ContactRecord[];
  voiceClips: LocalVoiceClip[];
  onAddClip: (clip: LocalVoiceClip) => void;
  onDeleteClip: (id: string) => void;
  onSendClipToContact: (clip: LocalVoiceClip, contactId: string) => Promise<void>;
}

export function VoiceMessagesPage({
  contacts,
  voiceClips,
  onAddClip,
  onDeleteClip,
  onSendClipToContact,
}: VoiceMessagesPageProps) {
  const activeContacts = contacts.filter((c) => !c.isBlocked);
  const [targetId, setTargetId] = useState(activeContacts[0]?.id ?? '');
  const effectiveTargetId =
    activeContacts.some((c) => c.id === targetId) ? targetId : (activeContacts[0]?.id ?? '');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [savingClip, setSavingClip] = useState(false);
  const activeRecRef = useRef<ActiveVoiceRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      activeRecRef.current?.cancel();
      activeRecRef.current = null;
    };
  }, []);

  const startRecording = async () => {
    setMicError(null);
    try {
      const rec = await startRealVoiceRecording();
      activeRecRef.current = rec;
      setSeconds(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      setRecording(false);
      setMicError(
        err instanceof Error
          ? err.message
          : 'Microphone access was denied or is unavailable on this device.'
      );
    }
  };

  const cancelRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    activeRecRef.current?.cancel();
    activeRecRef.current = null;
    setRecording(false);
    setSeconds(0);
  };

  const stopAndSaveRecording = async () => {
    if (!activeRecRef.current) return;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const rec = activeRecRef.current;
    activeRecRef.current = null;
    setRecording(false);
    setSavingClip(true);
    try {
      const result = await rec.stop();
      onAddClip({
        id: `vc-${Date.now()}`,
        title: `Voice Note ${new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}`,
        durationSec: result.durationSec,
        createdAt: Date.now(),
        audioUrl: result.dataUrl,
        mimeType: result.mimeType,
      });
    } catch (err) {
      setMicError(
        err instanceof Error ? err.message : 'Could not save the voice recording.'
      );
    } finally {
      setSavingClip(false);
      setSeconds(0);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Offline Voice Messages
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          Record real audio with your device microphone, play/pause/seek offline, and send directly to any connected or saved contact.
        </p>
      </div>

      <div className="rounded-3xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/25 p-8 text-center space-y-5">
        <div className="flex items-center justify-center gap-4">
          {recording && (
            <button
              type="button"
              onClick={cancelRecording}
              title="Cancel recording"
              className="w-12 h-12 rounded-full border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          <button
            type="button"
            disabled={savingClip}
            onClick={() =>
              recording ? void stopAndSaveRecording() : void startRecording()
            }
            className={`w-24 h-24 rounded-full flex items-center justify-center transition-all disabled:opacity-60 cursor-pointer ${
              recording
                ? 'bg-red-600 text-white shadow-[0_0_32px_rgba(239,68,68,0.6)] animate-pulse'
                : 'bg-gradient-to-br from-[#2563EB] to-[#06B6D4] text-white shadow-[0_0_28px_rgba(37,99,235,0.5)] hover:brightness-110'
            }`}
          >
            {savingClip ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : recording ? (
              <Square className="w-8 h-8" />
            ) : (
              <Mic className="w-9 h-9" />
            )}
          </button>
        </div>

        <div>
          <p className="text-sm font-mono tabular-nums font-bold text-blue-600 dark:text-cyan-300">
            {recording
              ? `Recording voice · 00:${String(seconds).padStart(2, '0')} — Tap stop to save`
              : savingClip
                ? 'Encoding audio...'
                : 'Tap microphone to record a real voice message'}
          </p>
          {micError && (
            <div className="mt-3 max-w-md mx-auto p-3 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-400/35 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{micError}</span>
            </div>
          )}
        </div>

        {activeContacts.length > 0 && (
          <div className="flex items-center justify-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">Send to:</span>
            <select
              value={effectiveTargetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="h-9 px-3 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-xs text-slate-900 dark:text-white"
            >
              {activeContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.deviceId})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Recorded Clips Library with Real Playback Controls */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
          Recorded Voice Notes ({voiceClips.length})
        </h2>
        {voiceClips.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-[#07152C]/70 border border-slate-200 dark:border-cyan-400/15 p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            No voice notes recorded yet. Tap the microphone above to capture a real audio message.
          </div>
        ) : (
          voiceClips.map((clip) => (
            <div
              key={clip.id}
              className="rounded-2xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/20 p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{clip.title}</p>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {new Date(clip.createdAt).toLocaleString()} · {clip.mimeType ?? 'audio'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {effectiveTargetId && (
                    <button
                      type="button"
                      onClick={() => void onSendClipToContact(clip, effectiveTargetId)}
                      className="px-3.5 h-9 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" /> Send to Chat
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDeleteClip(clip.id)}
                    className="w-9 h-9 rounded-xl hover:bg-red-500/15 text-slate-400 hover:text-red-500 flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {clip.audioUrl && (
                <VoiceMessagePlayer
                  src={clip.audioUrl}
                  durationSec={clip.durationSec}
                  variant="card"
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* PAGE 10: OFFLINE FILE MANAGER (REAL DATAURL STORAGE + DOWNLOAD + P2P/BT SEND) */
interface OfflineFileManagerPageProps {
  contacts: ContactRecord[];
  files: StagedOfflineFile[];
  onAddFile: (file: StagedOfflineFile) => void;
  onDeleteFile: (id: string) => void;
  onShareFile: (file: StagedOfflineFile, contact: ContactRecord) => Promise<void>;
}

export function OfflineFileManagerPage({
  contacts,
  files,
  onAddFile,
  onDeleteFile,
  onShareFile,
}: OfflineFileManagerPageProps) {
  const activeContacts = contacts.filter((c) => !c.isBlocked);
  const [filter, setFilter] = useState<'All' | StagedOfflineFile['category']>('All');
  const [targetId, setTargetId] = useState(activeContacts[0]?.id ?? '');
  const [fileError, setFileError] = useState<string | null>(null);
  const effectiveTargetId =
    activeContacts.some((c) => c.id === targetId) ? targetId : (activeContacts[0]?.id ?? '');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFilePick = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    setFileError(null);

    if (picked.size > MAX_OFFLINE_FILE_BYTES) {
      setFileError(
        `File "${picked.name}" is ${(picked.size / (1024 * 1024)).toFixed(1)} MB. Please choose a file under 2 MB for reliable offline Bluetooth/P2P transfer.`
      );
      return;
    }

    const category: StagedOfflineFile['category'] = picked.type.startsWith('image/')
      ? 'Image'
      : picked.type.startsWith('audio/')
        ? 'Audio'
        : picked.type.includes('pdf') ||
            picked.type.includes('text') ||
            picked.type.includes('document')
          ? 'Document'
          : 'Other';

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : undefined;
      onAddFile({
        id: `file-${Date.now()}`,
        name: picked.name,
        category,
        sizeKb: Math.max(1, Math.round(picked.size / 1024)),
        addedAt: Date.now(),
        status: 'STORED_LOCALLY',
        dataUrl,
        mimeType: picked.type || 'application/octet-stream',
      });
    };
    reader.onerror = () => {
      setFileError(`Could not read "${picked.name}".`);
    };
    reader.readAsDataURL(picked);
  };

  const visibleFiles =
    filter === 'All' ? files : files.filter((f) => f.category === filter);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/25 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Offline File Manager
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Add images, audio, or documents (up to 2 MB) locally and send the real file to connected contacts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {activeContacts.length > 0 && (
            <select
              value={effectiveTargetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-xs text-slate-900 dark:text-white"
            >
              {activeContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  Share to {c.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="px-4 h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
          >
            <Upload className="w-4 h-4" /> Add Local File
          </button>
          <input ref={inputRef} type="file" onChange={handleFilePick} className="hidden" />
        </div>
      </div>

      {fileError && (
        <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-400/35 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{fileError}</span>
        </div>
      )}

      {/* Category Filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(['All', 'Image', 'Document', 'Audio', 'Other'] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setFilter(cat)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
              filter === cat
                ? 'bg-[#2563EB] text-white'
                : 'bg-white dark:bg-[#07152C]/75 border border-slate-200 dark:border-cyan-400/20 text-slate-600 dark:text-slate-300'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {visibleFiles.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-[#07152C]/75 border border-slate-200 dark:border-cyan-400/20 p-10 text-center space-y-2">
          <FolderOpen className="w-8 h-8 text-blue-500 dark:text-cyan-400 mx-auto" />
          <p className="text-sm font-bold text-slate-900 dark:text-white">No files in this category</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleFiles.map((file) => {
            const targetContact = activeContacts.find((c) => c.id === effectiveTargetId);
            const downloadHref = file.dataUrl ?? file.objectUrl;
            return (
              <div
                key={file.id}
                className="rounded-2xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/20 p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  {file.category === 'Image' && file.dataUrl && (
                    <img
                      src={file.dataUrl}
                      alt={file.name}
                      className="w-full h-32 object-cover rounded-xl border border-slate-200 dark:border-cyan-400/20"
                    />
                  )}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600/15 dark:bg-cyan-500/15 text-blue-600 dark:text-cyan-300 flex items-center justify-center shrink-0">
                      {file.category === 'Image' ? (
                        <FileImage className="w-5 h-5" />
                      ) : file.category === 'Audio' ? (
                        <FileAudio className="w-5 h-5" />
                      ) : (
                        <FileText className="w-5 h-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {file.name}
                      </p>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                        {file.category} · {file.sizeKb} KB
                      </p>
                      <p className="text-[11px] font-mono text-blue-600 dark:text-cyan-300 mt-1">
                        {file.status === 'SENT_OVER_BLUETOOTH'
                          ? `Sent Bluetooth → ${file.targetContactName}`
                          : file.status === 'SENT_OVER_P2P'
                            ? `Sent Offline P2P → ${file.targetContactName}`
                            : file.status === 'QUEUED_FOR_PEER'
                              ? `Queued Offline → ${file.targetContactName}`
                              : 'Stored Locally'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-cyan-400/15">
                  {targetContact && (
                    <button
                      type="button"
                      onClick={() => void onShareFile(file, targetContact)}
                      className="flex-1 h-9 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" /> Send to Chat
                    </button>
                  )}
                  {downloadHref && (
                    <a
                      href={downloadHref}
                      download={file.name}
                      title="Download file"
                      className="w-9 h-9 rounded-xl border border-slate-300 dark:border-cyan-400/30 text-slate-600 dark:text-cyan-300 hover:bg-slate-100 dark:hover:bg-cyan-400/10 flex items-center justify-center"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => onDeleteFile(file.id)}
                    className="w-9 h-9 rounded-xl hover:bg-red-500/15 text-slate-400 hover:text-red-500 flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* PAGE 12: INTERACTIVE NETWORK MAP PAGE */
interface NetworkMapPageProps {
  profile: UserProfileRecord;
  contacts: ContactRecord[];
  liveConnections: Record<string, ContactLiveConnection>;
  capabilities: BrowserCapabilityReport;
  onConnectBluetooth: (contact: ContactRecord) => Promise<void>;
  onDisconnectBluetooth: (contactId: string) => void;
  onOpenChat: (contactId: string) => void;
}

export function NetworkMapPage({
  profile,
  contacts,
  liveConnections,
  capabilities,
  onConnectBluetooth,
  onDisconnectBluetooth,
  onOpenChat,
}: NetworkMapPageProps) {
  const activeContacts = contacts.filter((c) => !c.isBlocked);
  const [selectedId, setSelectedId] = useState<string | null>(activeContacts[0]?.id ?? null);
  const selectedContact = activeContacts.find((c) => c.id === selectedId) ?? null;

  const centerX = 320;
  const centerY = 185;
  const radiusX = 215;
  const radiusY = 128;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Bluetooth Network Map
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Live visual topology centered on your local browser node. Glowing cyan links indicate genuine active Web Bluetooth GATT sessions.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 rounded-3xl bg-[#040C1E] border border-cyan-400/25 p-5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
            <span className="font-semibold text-white">Local Browser Node Topology</span>
            <span className="font-mono text-cyan-300 text-[11px]">
              Glowing Cyan: Active Web BT · Dashed Slate: Saved Offline
            </span>
          </div>

          <svg
            viewBox="0 0 640 370"
            className="w-full h-[360px] select-none"
            role="img"
            aria-label="FreeConnect Live Bluetooth Network Map"
          >
            <defs>
              <radialGradient id="fcNetGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.22" />
                <stop offset="60%" stopColor="#2563EB" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#040C1E" stopOpacity="0" />
              </radialGradient>
              <filter id="fcNeonGlow">
                <feGaussianBlur stdDeviation="3.5" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Digital Earth Radar Rings */}
            <circle cx={centerX} cy={centerY} r="158" fill="url(#fcNetGlow)" />
            <circle cx={centerX} cy={centerY} r="142" fill="none" stroke="#22D3EE" strokeOpacity="0.14" />
            <circle cx={centerX} cy={centerY} r="92" fill="none" stroke="#38BDF8" strokeOpacity="0.12" />
            <ellipse cx={centerX} cy={centerY} rx="142" ry="52" fill="none" stroke="#38BDF8" strokeOpacity="0.12" />

            {/* Links to saved contacts */}
            {activeContacts.slice(0, 8).map((c, idx) => {
              const total = Math.max(1, Math.min(8, activeContacts.length));
              const angle = (idx / total) * Math.PI * 2 - Math.PI / 2;
              const nx = centerX + Math.cos(angle) * radiusX;
              const ny = centerY + Math.sin(angle) * radiusY;
              const isLive = liveConnections[c.id]?.status === 'connected';
              return (
                <g key={`link-${c.id}`}>
                  {isLive ? (
                    <>
                      <line
                        x1={centerX}
                        y1={centerY}
                        x2={nx}
                        y2={ny}
                        stroke="#2563EB"
                        strokeWidth="5"
                        strokeOpacity="0.35"
                        filter="url(#fcNeonGlow)"
                      />
                      <line
                        x1={centerX}
                        y1={centerY}
                        x2={nx}
                        y2={ny}
                        stroke="#22D3EE"
                        strokeWidth="2.2"
                        className="fc-link-flow"
                      />
                    </>
                  ) : (
                    <line
                      x1={centerX}
                      y1={centerY}
                      x2={nx}
                      y2={ny}
                      stroke="#64748B"
                      strokeOpacity="0.4"
                      strokeWidth="1.4"
                      strokeDasharray="4 6"
                    />
                  )}
                </g>
              );
            })}

            {/* Center Node: Local Browser */}
            <g>
              <circle
                cx={centerX}
                cy={centerY}
                r="34"
                fill="#2563EB"
                stroke="#67E8F9"
                strokeWidth="2.5"
                filter="url(#fcNeonGlow)"
              />
              <text
                x={centerX}
                y={centerY - 2}
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="11"
                fontWeight="700"
              >
                YOU
              </text>
              <text
                x={centerX}
                y={centerY + 12}
                textAnchor="middle"
                fill="#CFFAFE"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
              >
                {profile.deviceId}
              </text>
            </g>

            {/* Saved Contact Nodes */}
            {activeContacts.slice(0, 8).map((c, idx) => {
              const total = Math.max(1, Math.min(8, activeContacts.length));
              const angle = (idx / total) * Math.PI * 2 - Math.PI / 2;
              const nx = centerX + Math.cos(angle) * radiusX;
              const ny = centerY + Math.sin(angle) * radiusY;
              const isLive = liveConnections[c.id]?.status === 'connected';
              const isSel = selectedId === c.id;

              return (
                <g
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="cursor-pointer"
                >
                  <circle
                    cx={nx}
                    cy={ny}
                    r={isSel ? 23 : 19}
                    fill={isLive ? '#059669' : '#0B1D3B'}
                    stroke={isLive ? '#34D399' : isSel ? '#22D3EE' : '#475569'}
                    strokeWidth={isSel ? 2.5 : 1.8}
                  />
                  <text
                    x={nx}
                    y={ny + 4}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize="10"
                    fontWeight="700"
                  >
                    {c.name.slice(0, 2).toUpperCase()}
                  </text>
                  <text
                    x={nx}
                    y={ny + 34}
                    textAnchor="middle"
                    fill="#F8FAFC"
                    fontSize="10.5"
                    fontWeight="600"
                  >
                    {c.name.split(' ')[0]}
                  </text>
                  <text
                    x={nx}
                    y={ny + 46}
                    textAnchor="middle"
                    fill={isLive ? '#34D399' : '#94A3B8'}
                    fontSize="9"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {isLive ? 'Connected BT' : 'Offline'}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Selected Node Inspector */}
        <div className="xl:col-span-4 rounded-3xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/25 p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Node Inspector</h2>

          {selectedContact ? (
            <div className="space-y-4">
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {selectedContact.name}
                </p>
                <p className="text-xs font-mono text-blue-600 dark:text-cyan-300">
                  {selectedContact.deviceId} · {selectedContact.username}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#050E20] border border-slate-200 dark:border-cyan-400/15 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Status</span>
                  <span
                    className={
                      liveConnections[selectedContact.id]?.status === 'connected'
                        ? 'text-emerald-500'
                        : 'text-amber-500'
                    }
                  >
                    {liveConnections[selectedContact.id]?.status === 'connected'
                      ? 'CONNECTED'
                      : 'DISCONNECTED'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Web Bluetooth</span>
                  <span className="text-slate-900 dark:text-white">
                    {capabilities.webBluetoothSupported ? 'API Present' : 'Unsupported'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onOpenChat(selectedContact.id)}
                  className="h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#0891B2] text-white text-xs font-semibold cursor-pointer"
                >
                  Open Chat
                </button>
                {liveConnections[selectedContact.id]?.status === 'connected' ? (
                  <button
                    type="button"
                    onClick={() => onDisconnectBluetooth(selectedContact.id)}
                    className="h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold cursor-pointer"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onConnectBluetooth(selectedContact)}
                    className="h-10 rounded-xl border border-blue-500/40 dark:border-cyan-400/35 text-blue-700 dark:text-cyan-300 text-xs font-semibold cursor-pointer"
                  >
                    Connect BT
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select any contact node on the map to inspect its real connection state.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* PAGE 13: EMERGENCY SOS PAGE */
interface EmergencySosPageProps {
  contacts: ContactRecord[];
  sosRecords: WebSosRecord[];
  onPatchContact: (id: string, patch: Partial<ContactRecord>) => Promise<void>;
  onDispatchSos: (message: string, targetIds: string[]) => Promise<void>;
}

export function EmergencySosPage({
  contacts,
  sosRecords,
  onPatchContact,
  onDispatchSos,
}: EmergencySosPageProps) {
  const activeContacts = contacts.filter((c) => !c.isBlocked);
  const emergencyContacts = activeContacts.filter((c) => c.isEmergencyContact);
  const [sosMsg, setSosMsg] = useState(
    'URGENT SOS: Immediate assistance needed. Sent via FreeConnect Offline Messenger.'
  );
  const [dispatching, setDispatching] = useState(false);

  const handleBroadcast = async () => {
    const targets =
      emergencyContacts.length > 0
        ? emergencyContacts.map((c) => c.id)
        : activeContacts.map((c) => c.id);
    if (targets.length === 0) return;
    setDispatching(true);
    try {
      await onDispatchSos(sosMsg, targets);
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="rounded-3xl bg-red-50 dark:bg-red-950/35 border border-red-300 dark:border-red-400/45 p-6 space-y-2">
        <h1 className="text-xl font-extrabold text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> Emergency SOS Broadcast
        </h1>
        <p className="text-xs sm:text-sm text-red-800 dark:text-red-100/90 leading-relaxed">
          <strong>Honest Range Notice:</strong> Bluetooth SOS alerts deliver only over active local Web Bluetooth links within physical Bluetooth range (~10–25m). For disconnected contacts, SOS alerts are queued locally in IndexedDB and cannot reach cellular emergency services.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 rounded-3xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/20 p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-500" /> Designate Emergency Contacts
          </h2>
          {activeContacts.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              No saved contacts yet. Add real people in Contacts to designate emergency recipients.
            </p>
          ) : (
            activeContacts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  void onPatchContact(c.id, { isEmergencyContact: !c.isEmergencyContact })
                }
                className={`w-full p-3 rounded-xl border text-left flex items-center justify-between text-xs cursor-pointer ${
                  c.isEmergencyContact
                    ? 'bg-red-50 dark:bg-red-500/15 border-red-400/50 text-red-700 dark:text-red-200'
                    : 'border-slate-200 dark:border-cyan-400/15 text-slate-700 dark:text-slate-300'
                }`}
              >
                <span className="font-semibold">{c.name}</span>
                <span className="font-mono text-[11px]">
                  {c.isEmergencyContact ? 'SOS Active' : 'Select'}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-7 rounded-3xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/20 p-6 space-y-4">
          <label className="block text-xs font-bold text-slate-900 dark:text-white">
            Priority SOS Message
          </label>
          <textarea
            rows={4}
            value={sosMsg}
            onChange={(e) => setSosMsg(e.target.value)}
            className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-[#040C1C] border border-red-300 dark:border-red-400/35 text-sm text-slate-900 dark:text-white"
          />
          <button
            type="button"
            disabled={dispatching || activeContacts.length === 0}
            onClick={() => void handleBroadcast()}
            className="w-full h-12 rounded-2xl bg-gradient-to-r from-red-600 to-rose-500 hover:brightness-110 disabled:opacity-50 text-white text-sm font-bold tracking-wider shadow-[0_0_24px_rgba(239,68,68,0.45)] cursor-pointer"
          >
            {dispatching
              ? 'DISPATCHING SOS...'
              : `BROADCAST SOS (${
                  emergencyContacts.length || activeContacts.length
                } CONTACTS)`}
          </button>

          {sosRecords.length > 0 && (
            <div className="space-y-2.5 pt-3 border-t border-slate-200 dark:border-cyan-400/15">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                SOS Dispatch History
              </h3>
              {sosRecords.map((r) => (
                <div
                  key={r.id}
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#050E20] border border-red-300/40 text-xs space-y-1"
                >
                  <div className="flex justify-between font-mono text-red-600 dark:text-red-300">
                    <span>{r.id}</span>
                    <span>
                      {new Date(r.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-slate-800 dark:text-slate-100">{r.message}</p>
                  <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    Targets: {r.targetNames.join(', ')} · Live BT: {r.liveBluetoothCount} · Queued Offline: {r.queuedOfflineCount}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
