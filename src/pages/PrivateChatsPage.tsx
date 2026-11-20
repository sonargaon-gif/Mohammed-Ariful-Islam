import { FormEvent, useMemo, useState } from 'react';
import {
  Check,
  Edit3,
  Folder,
  FolderLock,
  FolderPlus,
  KeyRound,
  Lock,
  MessageSquare,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import {
  ContactDirectMessage,
  ContactLiveConnection,
  ContactRecord,
  PinSecuritySummary,
  PrivateChatAssignment,
  PrivateChatFolder,
} from '../types/contacts';
import { TextSizeOption } from '../types/freeconnect';
import { getInitials } from '../utils/contactQrCodec';
import { PinPromptModal } from '../components/PinPromptModal';
import { ChatPage } from './ChatAndGroupPages';

interface PrivateChatsPageProps {
  contacts: ContactRecord[];
  messages: ContactDirectMessage[];
  liveConnections: Record<string, ContactLiveConnection>;
  textSize: TextSizeOption;
  pinSecurity: PinSecuritySummary;
  folders: PrivateChatFolder[];
  assignments: Record<string, PrivateChatAssignment>;
  onVerifyPin: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  onCreateFolder: (name: string, isLocked: boolean) => Promise<PrivateChatFolder | null>;
  onRenameFolder: (folderId: string, newName: string) => Promise<void>;
  onSetFolderLocked: (folderId: string, isLocked: boolean) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onMoveChatToFolder: (
    contactId: string,
    folderId: string | null,
    keepLocked?: boolean
  ) => Promise<void>;
  onLockChatToPrivate: (contactId: string, folderId?: string | null) => Promise<void>;
  onUnlockChatToNormal: (contactId: string) => Promise<void>;
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
  onOpenSecuritySettings: () => void;
  onAddNewContact: () => void;
  onOpenConnectPage: () => void;
}

type PendingPinAction =
  | { type: 'unlock_folder'; folderId: string; folderName: string }
  | { type: 'unlock_vault_all' }
  | { type: 'toggle_folder_lock'; folderId: string; nextLocked: boolean; folderName: string }
  | { type: 'unlock_chat_to_normal'; contactId: string; contactName: string }
  | { type: 'open_private_chat'; contactId: string; contactName: string }
  | { type: 'lock_chat_into_private'; contactId: string; folderId: string | null; contactName: string };

export function PrivateChatsPage({
  contacts,
  messages,
  liveConnections,
  textSize,
  pinSecurity,
  folders,
  assignments,
  onVerifyPin,
  onCreateFolder,
  onRenameFolder,
  onSetFolderLocked,
  onDeleteFolder,
  onMoveChatToFolder,
  onLockChatToPrivate,
  onUnlockChatToNormal,
  onSendMessage,
  onRetryMessage,
  onToggleReaction,
  onClearConversation,
  onConnectBluetooth,
  onDisconnectBluetooth,
  onPatchContact,
  onOpenSecuritySettings,
  onAddNewContact,
  onOpenConnectPage,
}: PrivateChatsPageProps) {
  // Session-only unlocked state (never persisted; wiped on reload or "Lock Vault Now")
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [unlockedFolderIds, setUnlockedFolderIds] = useState<Record<string, boolean>>({});
  const [unlockedContactIds, setUnlockedContactIds] = useState<Record<string, boolean>>({});

  const [selectedFolderId, setSelectedFolderId] = useState<'all_locked' | string>('all_locked');
  const [activePrivateContactId, setActivePrivateContactId] = useState<string | null>(null);

  // Create / Rename / Delete folder UI state
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderLocked, setNewFolderLocked] = useState(true);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);
  const [showAddChatPicker, setShowAddChatPicker] = useState(false);

  const [pendingAction, setPendingAction] = useState<PendingPinAction | null>(null);

  const nonBlockedContacts = useMemo(() => contacts.filter((c) => !c.isBlocked), [contacts]);

  // All contacts assigned to Private Chats (locked individually OR inside any folder)
  const privateContacts = useMemo(
    () =>
      nonBlockedContacts.filter((c) => {
        const a = assignments[c.id];
        return Boolean(a && (a.isLocked || a.folderId));
      }),
    [nonBlockedContacts, assignments]
  );

  // Contacts currently in Normal Chats (available to move into a Private Folder)
  const normalContacts = useMemo(
    () => nonBlockedContacts.filter((c) => !assignments[c.id]),
    [nonBlockedContacts, assignments]
  );

  const selectedFolder =
    selectedFolderId !== 'all_locked'
      ? folders.find((f) => f.id === selectedFolderId) ?? null
      : null;

  const isSelectedViewLocked = useMemo(() => {
    if (!pinSecurity.hasPin) return false;
    if (selectedFolderId === 'all_locked') return !vaultUnlocked;
    if (selectedFolder?.isLocked && !unlockedFolderIds[selectedFolder.id]) return true;
    return false;
  }, [pinSecurity.hasPin, selectedFolderId, vaultUnlocked, selectedFolder, unlockedFolderIds]);

  const contactsInSelectedView = useMemo(() => {
    if (selectedFolderId === 'all_locked') {
      return privateContacts;
    }
    return privateContacts.filter((c) => assignments[c.id]?.folderId === selectedFolderId);
  }, [privateContacts, selectedFolderId, assignments]);

  const activeContact = activePrivateContactId
    ? privateContacts.find((c) => c.id === activePrivateContactId) ?? null
    : null;

  const isActiveChatAuthenticated = useMemo(() => {
    if (!activeContact) return false;
    if (!pinSecurity.hasPin) return true;
    if (vaultUnlocked || unlockedContactIds[activeContact.id]) return true;
    const a = assignments[activeContact.id];
    if (a?.folderId && unlockedFolderIds[a.folderId]) return true;
    return false;
  }, [
    activeContact,
    pinSecurity.hasPin,
    vaultUnlocked,
    unlockedContactIds,
    assignments,
    unlockedFolderIds,
  ]);

  const handleCreateFolderSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const created = await onCreateFolder(newFolderName.trim(), newFolderLocked && pinSecurity.hasPin);
    setNewFolderName('');
    setShowNewFolder(false);
    if (created) {
      setSelectedFolderId(created.id);
      if (created.isLocked) {
        setUnlockedFolderIds((prev) => ({ ...prev, [created.id]: true }));
      }
    }
  };

  const handleLockVaultNow = () => {
    setVaultUnlocked(false);
    setUnlockedFolderIds({});
    setUnlockedContactIds({});
    setActivePrivateContactId(null);
  };

  const executePendingAction = async () => {
    if (!pendingAction) return;
    const act = pendingAction;
    setPendingAction(null);

    if (act.type === 'unlock_vault_all') {
      setVaultUnlocked(true);
    } else if (act.type === 'unlock_folder') {
      setUnlockedFolderIds((prev) => ({ ...prev, [act.folderId]: true }));
      setSelectedFolderId(act.folderId);
    } else if (act.type === 'toggle_folder_lock') {
      await onSetFolderLocked(act.folderId, act.nextLocked);
      if (act.nextLocked) {
        setUnlockedFolderIds((prev) => {
          const next = { ...prev };
          delete next[act.folderId];
          return next;
        });
      }
    } else if (act.type === 'unlock_chat_to_normal') {
      await onUnlockChatToNormal(act.contactId);
      if (activePrivateContactId === act.contactId) {
        setActivePrivateContactId(null);
      }
    } else if (act.type === 'open_private_chat') {
      setUnlockedContactIds((prev) => ({ ...prev, [act.contactId]: true }));
      setActivePrivateContactId(act.contactId);
    } else if (act.type === 'lock_chat_into_private') {
      await onLockChatToPrivate(act.contactId, act.folderId);
      setShowAddChatPicker(false);
    }
  };

  const promptMeta = useMemo(() => {
    if (!pendingAction) return { title: 'Enter PIN', description: 'Verify your personal PIN.' };
    switch (pendingAction.type) {
      case 'unlock_vault_all':
        return {
          title: 'Unlock Private Chats',
          description: 'Enter your personal PIN to view locked conversations.',
        };
      case 'unlock_folder':
        return {
          title: `Unlock "${pendingAction.folderName}"`,
          description: 'This chat folder is PIN-protected. Enter your PIN to open it.',
        };
      case 'toggle_folder_lock':
        return {
          title: pendingAction.nextLocked
            ? `Lock "${pendingAction.folderName}"`
            : `Remove Lock from "${pendingAction.folderName}"`,
          description: 'Confirm your personal PIN to change this folder lock.',
        };
      case 'unlock_chat_to_normal':
        return {
          title: `Unlock "${pendingAction.contactName}"`,
          description: 'Enter your PIN to unlock and move this conversation back to Normal Chats.',
        };
      case 'open_private_chat':
        return {
          title: `Open "${pendingAction.contactName}"`,
          description: 'Enter your personal PIN to read this locked conversation.',
        };
      case 'lock_chat_into_private':
        return {
          title: `Lock "${pendingAction.contactName}"`,
          description: 'Enter your personal PIN to lock and hide this chat inside Private Chats.',
        };
    }
  }, [pendingAction]);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="rounded-3xl bg-white dark:bg-[#07152C]/85 border border-slate-200 dark:border-cyan-400/25 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5">
            <FolderLock className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
            Private Chats &amp; Folders
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Organize personal conversations into custom folders and protect individual chats or
            entire folders with your hashed PBKDF2 PIN. Locked chats are hidden from Normal Chats
            and never expose message previews in notifications.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(vaultUnlocked || Object.keys(unlockedFolderIds).length > 0) && pinSecurity.hasPin && (
            <button
              type="button"
              onClick={handleLockVaultNow}
              className="px-4 h-10 rounded-xl border border-amber-400/45 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" /> Lock Vault Now
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowNewFolder(true)}
            className="px-4 h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" /> New Folder
          </button>
          <button
            type="button"
            onClick={onOpenSecuritySettings}
            className="px-4 h-10 rounded-xl border border-slate-300 dark:border-cyan-400/30 text-slate-700 dark:text-cyan-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" /> PIN Settings
          </button>
        </div>
      </div>

      {/* PIN STATUS BANNER */}
      {!pinSecurity.hasPin && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-400/35 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
            <Shield className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Personal PIN Not Created Yet</p>
              <p className="mt-0.5">
                You can organize folders right now, or create a secure hashed PIN in Settings →
                Privacy &amp; Security to lock individual chats and entire folders.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenSecuritySettings}
            className="px-4 h-9 rounded-xl bg-amber-600 text-white text-xs font-bold shrink-0 cursor-pointer"
          >
            Create PIN Now
          </button>
        </div>
      )}

      {/* CREATE NEW FOLDER FORM */}
      {showNewFolder && (
        <form
          onSubmit={handleCreateFolderSubmit}
          className="rounded-3xl bg-white dark:bg-[#07152C]/90 border border-blue-500/40 dark:border-cyan-400/40 p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
              Create New Chat Folder
            </h2>
            <button
              type="button"
              onClick={() => setShowNewFolder(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name (e.g. Family, Personal, Work)"
              className="flex-1 h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-300 dark:border-cyan-400/25 text-sm text-slate-900 dark:text-white"
            />
            <label className="flex items-center gap-2 px-3.5 h-10 rounded-xl bg-slate-50 dark:bg-[#040C1C] border border-slate-200 dark:border-cyan-400/20 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={newFolderLocked}
                disabled={!pinSecurity.hasPin}
                onChange={(e) => setNewFolderLocked(e.target.checked)}
                className="accent-blue-600"
              />
              Lock Folder with PIN
            </label>
            <button
              type="submit"
              disabled={!newFolderName.trim()}
              className="px-5 h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              Create Folder
            </button>
          </div>
        </form>
      )}

      {/* MAIN GRID: LEFT FOLDERS + RIGHT CONVERSATIONS / ACTIVE PRIVATE CHAT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: FOLDERS LIST */}
        <div className="lg:col-span-4 space-y-3">
          <div className="rounded-3xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/25 p-4 space-y-2">
            <p className="px-2 text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Private Folders
            </p>

            {/* All Private / Locked Chats View */}
            <button
              type="button"
              onClick={() => {
                setSelectedFolderId('all_locked');
                setActivePrivateContactId(null);
              }}
              className={`w-full p-3 rounded-2xl flex items-center justify-between text-left transition-colors cursor-pointer ${
                selectedFolderId === 'all_locked'
                  ? 'bg-gradient-to-r from-[#2563EB] to-[#0891B2] text-white'
                  : 'hover:bg-slate-100 dark:hover:bg-[#0B1E3D] text-slate-800 dark:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2.5 text-xs font-bold">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                All Private Chats
              </span>
              <span className="text-[11px] font-mono opacity-80">{privateContacts.length}</span>
            </button>

            {/* User-Created Custom Folders */}
            {folders.map((folder) => {
              const count = privateContacts.filter(
                (c) => assignments[c.id]?.folderId === folder.id
              ).length;
              const isSelected = selectedFolderId === folder.id;
              const isEditing = editingFolderId === folder.id;
              const isDeleting = confirmDeleteFolderId === folder.id;

              return (
                <div
                  key={folder.id}
                  className={`rounded-2xl border p-2.5 transition-colors ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-[#0D2347] border-blue-500/50 dark:border-cyan-400/50'
                      : 'border-slate-200 dark:border-cyan-400/15 hover:border-blue-400/40'
                  }`}
                >
                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        value={editingFolderName}
                        onChange={(e) => setEditingFolderName(e.target.value)}
                        className="flex-1 h-8 px-2.5 rounded-lg bg-white dark:bg-[#040C1C] border border-cyan-400/40 text-xs text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          await onRenameFolder(folder.id, editingFolderName);
                          setEditingFolderId(null);
                        }}
                        className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingFolderId(null)}
                        className="w-8 h-8 rounded-lg border border-slate-300 dark:border-cyan-400/25 flex items-center justify-center text-slate-500 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActivePrivateContactId(null);
                          if (
                            folder.isLocked &&
                            pinSecurity.hasPin &&
                            !unlockedFolderIds[folder.id]
                          ) {
                            setPendingAction({
                              type: 'unlock_folder',
                              folderId: folder.id,
                              folderName: folder.name,
                            });
                          } else {
                            setSelectedFolderId(folder.id);
                          }
                        }}
                        className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                      >
                        {folder.isLocked ? (
                          <FolderLock className="w-4 h-4 text-blue-600 dark:text-cyan-400 shrink-0" />
                        ) : (
                          <Folder className="w-4 h-4 text-slate-500 dark:text-slate-300 shrink-0" />
                        )}
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {folder.name}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">({count})</span>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          title={folder.isLocked ? 'Unlock Folder' : 'Lock Folder with PIN'}
                          onClick={() => {
                            if (!pinSecurity.hasPin) {
                              setPendingAction({
                                type: 'toggle_folder_lock',
                                folderId: folder.id,
                                nextLocked: true,
                                folderName: folder.name,
                              });
                              return;
                            }
                            setPendingAction({
                              type: 'toggle_folder_lock',
                              folderId: folder.id,
                              nextLocked: !folder.isLocked,
                              folderName: folder.name,
                            });
                          }}
                          className="w-7 h-7 rounded-lg hover:bg-slate-200 dark:hover:bg-cyan-400/15 flex items-center justify-center text-slate-600 dark:text-cyan-300 cursor-pointer"
                        >
                          {folder.isLocked ? (
                            <Lock className="w-3.5 h-3.5" />
                          ) : (
                            <Unlock className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          title="Rename Folder"
                          onClick={() => {
                            setEditingFolderId(folder.id);
                            setEditingFolderName(folder.name);
                          }}
                          className="w-7 h-7 rounded-lg hover:bg-slate-200 dark:hover:bg-cyan-400/15 flex items-center justify-center text-slate-500 dark:text-slate-300 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Delete Folder (keeps all messages safe)"
                          onClick={() => setConfirmDeleteFolderId(folder.id)}
                          className="w-7 h-7 rounded-lg hover:bg-red-500/15 flex items-center justify-center text-red-500 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {isDeleting && (
                    <div className="mt-2.5 p-2.5 rounded-xl bg-red-500/10 border border-red-400/35 space-y-2 text-[11px]">
                      <p className="text-red-700 dark:text-red-200">
                        Delete folder &ldquo;{folder.name}&rdquo;?{' '}
                        <strong>No messages or contacts will be deleted.</strong>
                      </p>
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteFolderId(null)}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-cyan-400/25 text-slate-600 dark:text-slate-300 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await onDeleteFolder(folder.id);
                            setConfirmDeleteFolderId(null);
                            if (selectedFolderId === folder.id) {
                              setSelectedFolderId('all_locked');
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold cursor-pointer"
                        >
                          Delete Folder
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {folders.length === 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 px-2 py-3">
                No custom folders yet. Click <strong>New Folder</strong> to organize personal chats.
              </p>
            )}
          </div>

          {/* ADD EXISTING CONVERSATION INTO PRIVATE FOLDER */}
          <div className="rounded-3xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/25 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                Move a Normal Chat Here
              </p>
              <button
                type="button"
                onClick={() => setShowAddChatPicker((v) => !v)}
                className="text-xs font-semibold text-blue-600 dark:text-cyan-300 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> {showAddChatPicker ? 'Hide' : 'Select Chat'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Tip: You can also <strong>long-press</strong> any conversation in Normal Chats and
              select <strong>Lock Chat</strong>.
            </p>

            {showAddChatPicker && (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pt-1">
                {normalContacts.length === 0 ? (
                  <p className="text-xs text-slate-500">All contacts are already in Private Chats.</p>
                ) : (
                  normalContacts.map((c) => (
                    <div
                      key={c.id}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#040C1C] flex items-center justify-between gap-2"
                    >
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {c.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const targetFolder =
                            selectedFolderId === 'all_locked' ? null : selectedFolderId;
                          if (pinSecurity.hasPin) {
                            setPendingAction({
                              type: 'lock_chat_into_private',
                              contactId: c.id,
                              folderId: targetFolder,
                              contactName: c.name,
                            });
                          } else {
                            void onMoveChatToFolder(c.id, targetFolder, false);
                            setShowAddChatPicker(false);
                          }
                        }}
                        className="px-2.5 h-7 rounded-lg bg-[#2563EB] text-white text-[11px] font-bold shrink-0 cursor-pointer"
                      >
                        {pinSecurity.hasPin ? 'Lock & Move' : 'Move Here'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: PIN GATE OR CONVERSATION LIST / LIVE CHAT */}
        <div className="lg:col-span-8">
          {isSelectedViewLocked ? (
            <div className="rounded-3xl bg-white dark:bg-[#07152C]/85 border border-slate-200 dark:border-cyan-400/25 p-10 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#06B6D4] flex items-center justify-center mx-auto shadow-[0_0_28px_rgba(37,99,235,0.4)]">
                <Lock className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {selectedFolder ? `${selectedFolder.name} is Locked` : 'Private Chats Locked'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  {contactsInSelectedView.length} hidden conversation
                  {contactsInSelectedView.length === 1 ? '' : 's'} protected by your personal
                  PBKDF2 PIN. Message previews are hidden until you authenticate.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setPendingAction(
                    selectedFolder
                      ? {
                          type: 'unlock_folder',
                          folderId: selectedFolder.id,
                          folderName: selectedFolder.name,
                        }
                      : { type: 'unlock_vault_all' }
                  )
                }
                className="px-6 h-11 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" /> Enter PIN to Unlock
              </button>
            </div>
          ) : activeContact && isActiveChatAuthenticated ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <button
                  type="button"
                  onClick={() => setActivePrivateContactId(null)}
                  className="text-xs font-bold text-blue-600 dark:text-cyan-300 hover:underline cursor-pointer"
                >
                  ← Back to {selectedFolder ? selectedFolder.name : 'Private Chats'}
                </button>
                <div className="flex items-center gap-2">
                  <select
                    value={assignments[activeContact.id]?.folderId ?? ''}
                    onChange={(e) =>
                      void onMoveChatToFolder(
                        activeContact.id,
                        e.target.value ? e.target.value : null,
                        assignments[activeContact.id]?.isLocked ?? true
                      )
                    }
                    className="h-8 px-2.5 rounded-lg bg-white dark:bg-[#07152C] border border-slate-300 dark:border-cyan-400/25 text-xs text-slate-800 dark:text-white"
                  >
                    <option value="">No Folder (Locked Only)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        Folder: {f.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (pinSecurity.hasPin) {
                        setPendingAction({
                          type: 'unlock_chat_to_normal',
                          contactId: activeContact.id,
                          contactName: activeContact.name,
                        });
                      } else {
                        void onUnlockChatToNormal(activeContact.id);
                        setActivePrivateContactId(null);
                      }
                    }}
                    className="px-3 h-8 rounded-lg border border-emerald-400/45 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Unlock className="w-3.5 h-3.5" /> Move to Normal Chats
                  </button>
                </div>
              </div>

              <ChatPage
                contacts={[activeContact]}
                messages={messages.filter((m) => m.contactId === activeContact.id)}
                liveConnections={liveConnections}
                selectedContactId={activeContact.id}
                textSize={textSize}
                onSelectContact={setActivePrivateContactId}
                onSendMessage={onSendMessage}
                onRetryMessage={onRetryMessage}
                onToggleReaction={onToggleReaction}
                onClearConversation={onClearConversation}
                onConnectBluetooth={onConnectBluetooth}
                onDisconnectBluetooth={onDisconnectBluetooth}
                onPatchContact={onPatchContact}
                onAddNewContact={onAddNewContact}
                onOpenConnectPage={onOpenConnectPage}
              />
            </div>
          ) : (
            <div className="rounded-3xl bg-white dark:bg-[#07152C]/80 border border-slate-200 dark:border-cyan-400/25 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                  {selectedFolder ? selectedFolder.name : 'All Private Conversations'} (
                  {contactsInSelectedView.length})
                </h2>
              </div>

              {contactsInSelectedView.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-50 dark:bg-[#040C1C] border border-dashed border-slate-300 dark:border-cyan-400/20 text-center space-y-2">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    No conversations in this private view yet.
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Long-press any chat in <strong>Normal Chats</strong> and select{' '}
                    <strong>Lock Chat</strong>, or use <strong>Move a Normal Chat Here</strong> on
                    the left.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {contactsInSelectedView.map((contact) => {
                    const assign = assignments[contact.id];
                    const folderName = assign?.folderId
                      ? folders.find((f) => f.id === assign.folderId)?.name
                      : null;
                    const cMsgs = messages.filter((m) => m.contactId === contact.id);
                    const latest = cMsgs[cMsgs.length - 1];
                    const canPreview =
                      !pinSecurity.hasPin ||
                      vaultUnlocked ||
                      unlockedContactIds[contact.id] ||
                      (assign?.folderId ? unlockedFolderIds[assign.folderId] : false);

                    return (
                      <div
                        key={contact.id}
                        className="p-4 rounded-2xl bg-slate-50 dark:bg-[#040C1C] border border-slate-200 dark:border-cyan-400/20 flex flex-wrap items-center justify-between gap-3"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (canPreview) {
                              setActivePrivateContactId(contact.id);
                            } else {
                              setPendingAction({
                                type: 'open_private_chat',
                                contactId: contact.id,
                                contactName: contact.name,
                              });
                            }
                          }}
                          className="flex items-center gap-3 text-left min-w-0 flex-1 cursor-pointer"
                        >
                          {contact.avatarDataUrl ? (
                            <img
                              src={contact.avatarDataUrl}
                              alt={contact.name}
                              className="w-10 h-10 rounded-2xl object-cover border border-cyan-400/35 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#0891B2] flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {getInitials(contact.name)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                {contact.name}
                              </p>
                              {assign?.isLocked && (
                                <Lock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              )}
                              {folderName && (
                                <span className="px-2 py-0.5 rounded-md bg-blue-500/15 text-[10px] font-mono text-blue-700 dark:text-cyan-300">
                                  {folderName}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {canPreview
                                ? latest?.text ?? 'No messages yet'
                                : 'Locked conversation · Enter PIN to view messages'}
                            </p>
                          </div>
                        </button>

                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            aria-label="Move conversation to folder"
                            value={assign?.folderId ?? ''}
                            onChange={(e) =>
                              void onMoveChatToFolder(
                                contact.id,
                                e.target.value ? e.target.value : null,
                                assign?.isLocked ?? true
                              )
                            }
                            className="h-8 px-2 rounded-lg bg-white dark:bg-[#07152C] border border-slate-300 dark:border-cyan-400/25 text-[11px] text-slate-700 dark:text-slate-200"
                          >
                            <option value="">No Folder</option>
                            {folders.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            title="Unlock & Move Back to Normal Chats"
                            onClick={() => {
                              if (pinSecurity.hasPin) {
                                setPendingAction({
                                  type: 'unlock_chat_to_normal',
                                  contactId: contact.id,
                                  contactName: contact.name,
                                });
                              } else {
                                void onUnlockChatToNormal(contact.id);
                              }
                            }}
                            className="px-2.5 h-8 rounded-lg border border-slate-300 dark:border-cyan-400/25 text-[11px] font-semibold text-slate-700 dark:text-cyan-200 flex items-center gap-1 cursor-pointer"
                          >
                            <Unlock className="w-3 h-3" /> Unlock
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* REUSABLE CRYPTOGRAPHIC PIN VERIFICATION MODAL */}
      <PinPromptModal
        open={Boolean(pendingAction)}
        title={promptMeta.title}
        description={promptMeta.description}
        hasPinConfigured={pinSecurity.hasPin}
        onVerifyPin={onVerifyPin}
        onSuccess={executePendingAction}
        onClose={() => setPendingAction(null)}
        onOpenSecuritySettings={onOpenSecuritySettings}
      />
    </div>
  );
}
