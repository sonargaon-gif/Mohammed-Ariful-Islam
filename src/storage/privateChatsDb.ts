import { PrivateChatAssignment, PrivateChatFolder } from '../types/contacts';
import { StoredPinSecurityRecord } from '../crypto/pinSecurity';

/**
 * IndexedDB Persistence for PIN Security Record, Private Chat Folders, and Chat Assignments.
 *
 * Strictly stores PIN hashes and private chat metadata inside IndexedDB (`freeconnect_contacts_db` -> `meta`),
 * NEVER in localStorage and NEVER as plain-text PINs.
 */

const DB_NAME = 'freeconnect_contacts_db';
const DB_VERSION = 1;
const STORE_CONTACTS = 'contacts';
const STORE_MESSAGES = 'direct_messages';
const STORE_META = 'meta';

const META_KEY_PIN_SECURITY = 'pin_security_v2';
const META_KEY_PRIVATE_FOLDERS = 'private_folders_v1';
const META_KEY_PRIVATE_ASSIGNMENTS = 'private_assignments_v1';

interface MetaRow<T> {
  key: string;
  value: T;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB is unavailable in this browser context.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_CONTACTS)) {
        const contactStore = db.createObjectStore(STORE_CONTACTS, { keyPath: 'id' });
        contactStore.createIndex('deviceId', 'deviceId', { unique: false });
        contactStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const msgStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
        msgStore.createIndex('contactId', 'contactId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });
}

function txPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB operation failed.'));
  });
}

async function readMeta<T>(key: string): Promise<T | null> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_META, 'readonly');
    const row = (await txPromise(tx.objectStore(STORE_META).get(key))) as MetaRow<T> | undefined;
    db.close();
    return row ? row.value : null;
  } catch {
    return null;
  }
}

async function writeMeta<T>(key: string, value: T): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(STORE_META, 'readwrite');
  await txPromise(tx.objectStore(STORE_META).put({ key, value }));
  db.close();
}

async function deleteMeta(key: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(STORE_META, 'readwrite');
  await txPromise(tx.objectStore(STORE_META).delete(key));
  db.close();
}

// --- PIN Security Record (strictly IndexedDB, never localStorage) ---

export async function loadPinSecurityRecord(): Promise<StoredPinSecurityRecord | null> {
  return readMeta<StoredPinSecurityRecord>(META_KEY_PIN_SECURITY);
}

export async function savePinSecurityRecord(record: StoredPinSecurityRecord): Promise<void> {
  await writeMeta<StoredPinSecurityRecord>(META_KEY_PIN_SECURITY, record);
}

export async function clearPinSecurityRecord(): Promise<void> {
  await deleteMeta(META_KEY_PIN_SECURITY);
}

// --- Private Chat Folders ---

export async function loadPrivateFolders(): Promise<PrivateChatFolder[]> {
  const stored = await readMeta<PrivateChatFolder[]>(META_KEY_PRIVATE_FOLDERS);
  return Array.isArray(stored) ? stored.sort((a, b) => a.createdAt - b.createdAt) : [];
}

export async function savePrivateFolders(folders: PrivateChatFolder[]): Promise<void> {
  await writeMeta<PrivateChatFolder[]>(META_KEY_PRIVATE_FOLDERS, folders);
}

// --- Private Chat Assignments (contactId -> folderId & lock status) ---

export async function loadPrivateAssignments(): Promise<Record<string, PrivateChatAssignment>> {
  const stored = await readMeta<Record<string, PrivateChatAssignment>>(
    META_KEY_PRIVATE_ASSIGNMENTS
  );
  return stored && typeof stored === 'object' ? stored : {};
}

export async function savePrivateAssignments(
  assignments: Record<string, PrivateChatAssignment>
): Promise<void> {
  await writeMeta<Record<string, PrivateChatAssignment>>(
    META_KEY_PRIVATE_ASSIGNMENTS,
    assignments
  );
}

/**
 * Scrubs any legacy plain-text appPin / chatPins keys from localStorage preferences
 * so zero plain-text PIN values remain in localStorage.
 */
export function scrubLegacyPlaintextPinsFromLocalStorage(prefsKey: string): void {
  try {
    const raw = window.localStorage.getItem(prefsKey);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if ('appPin' in parsed || 'chatPins' in parsed) {
      delete parsed.appPin;
      delete parsed.chatPins;
      window.localStorage.setItem(prefsKey, JSON.stringify(parsed));
    }
  } catch {
    // Ignore storage read errors
  }
}
