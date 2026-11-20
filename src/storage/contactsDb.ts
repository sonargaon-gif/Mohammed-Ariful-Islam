import { ContactDirectMessage, ContactRecord } from '../types/contacts';

const DB_NAME = 'freeconnect_contacts_db';
const DB_VERSION = 1;
const STORE_CONTACTS = 'contacts';
const STORE_MESSAGES = 'direct_messages';
const STORE_META = 'meta';

const LS_CONTACTS_KEY = 'freeconnect_contacts_fallback_v1';
const LS_MESSAGES_KEY = 'freeconnect_direct_msgs_fallback_v1';

const LEGACY_STARTER_IDS = new Set([
  'contact-starter-maya',
  'contact-starter-devon',
  'contact-starter-priya',
]);

let activeStorageEngine: 'IndexedDB' | 'localStorage' = 'IndexedDB';

export function getActiveStorageEngine(): 'IndexedDB' | 'localStorage' {
  return activeStorageEngine;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
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
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

function txPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function readFallbackContacts(): ContactRecord[] {
  try {
    const raw = window.localStorage.getItem(LS_CONTACTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ContactRecord[];
    const cleaned = parsed.filter((c) => !LEGACY_STARTER_IDS.has(c.id));
    if (cleaned.length !== parsed.length) {
      window.localStorage.setItem(LS_CONTACTS_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return [];
  }
}

function writeFallbackContacts(list: ContactRecord[]): void {
  try {
    window.localStorage.setItem(LS_CONTACTS_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota errors
  }
}

function readFallbackMessages(): ContactDirectMessage[] {
  try {
    const raw = window.localStorage.getItem(LS_MESSAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ContactDirectMessage[];
    const cleaned = parsed.filter((m) => !LEGACY_STARTER_IDS.has(m.contactId));
    if (cleaned.length !== parsed.length) {
      window.localStorage.setItem(LS_MESSAGES_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return [];
  }
}

function writeFallbackMessages(list: ContactDirectMessage[]): void {
  try {
    window.localStorage.setItem(LS_MESSAGES_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota errors
  }
}

export async function loadAllContacts(): Promise<ContactRecord[]> {
  try {
    const db = await openDatabase();
    activeStorageEngine = 'IndexedDB';

    const tx = db.transaction([STORE_CONTACTS, STORE_MESSAGES], 'readwrite');
    const contactStore = tx.objectStore(STORE_CONTACTS);
    const msgStore = tx.objectStore(STORE_MESSAGES);

    // Purge any previously auto-seeded starter contacts & their messages
    const existing = (await txPromise(contactStore.getAll())) as ContactRecord[];
    const realContacts: ContactRecord[] = [];
    for (const c of existing) {
      if (LEGACY_STARTER_IDS.has(c.id)) {
        contactStore.delete(c.id);
        const index = msgStore.index('contactId');
        const legacyMsgs = (await txPromise(index.getAll(c.id))) as ContactDirectMessage[];
        for (const m of legacyMsgs) {
          msgStore.delete(m.id);
        }
      } else {
        realContacts.push(c);
      }
    }

    db.close();
    return realContacts.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    activeStorageEngine = 'localStorage';
    return readFallbackContacts().sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

export async function upsertContact(contact: ContactRecord): Promise<void> {
  try {
    const db = await openDatabase();
    activeStorageEngine = 'IndexedDB';
    const tx = db.transaction(STORE_CONTACTS, 'readwrite');
    await txPromise(tx.objectStore(STORE_CONTACTS).put(contact));
    db.close();
  } catch {
    activeStorageEngine = 'localStorage';
    const current = readFallbackContacts();
    const exists = current.some((c) => c.id === contact.id);
    const next = exists
      ? current.map((c) => (c.id === contact.id ? contact : c))
      : [contact, ...current];
    writeFallbackContacts(next);
  }
}

export async function removeContact(contactId: string): Promise<void> {
  try {
    const db = await openDatabase();
    activeStorageEngine = 'IndexedDB';
    const tx = db.transaction([STORE_CONTACTS, STORE_MESSAGES], 'readwrite');
    tx.objectStore(STORE_CONTACTS).delete(contactId);

    const msgStore = tx.objectStore(STORE_MESSAGES);
    const index = msgStore.index('contactId');
    const msgs = (await txPromise(index.getAll(contactId))) as ContactDirectMessage[];
    for (const m of msgs) {
      msgStore.delete(m.id);
    }
    db.close();
  } catch {
    activeStorageEngine = 'localStorage';
    writeFallbackContacts(readFallbackContacts().filter((c) => c.id !== contactId));
    writeFallbackMessages(readFallbackMessages().filter((m) => m.contactId !== contactId));
  }
}

export async function loadAllDirectMessages(): Promise<ContactDirectMessage[]> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_MESSAGES, 'readonly');
    const all = (await txPromise(tx.objectStore(STORE_MESSAGES).getAll())) as ContactDirectMessage[];
    db.close();
    return all.sort((a, b) => a.timestamp - b.timestamp);
  } catch {
    return readFallbackMessages().sort((a, b) => a.timestamp - b.timestamp);
  }
}

export async function loadMessagesForContact(
  contactId: string
): Promise<ContactDirectMessage[]> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_MESSAGES, 'readonly');
    const index = tx.objectStore(STORE_MESSAGES).index('contactId');
    const msgs = (await txPromise(index.getAll(contactId))) as ContactDirectMessage[];
    db.close();
    return msgs.sort((a, b) => a.timestamp - b.timestamp);
  } catch {
    return readFallbackMessages()
      .filter((m) => m.contactId === contactId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }
}

export async function saveDirectMessage(message: ContactDirectMessage): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    await txPromise(tx.objectStore(STORE_MESSAGES).put(message));
    db.close();
  } catch {
    const current = readFallbackMessages();
    const exists = current.some((m) => m.id === message.id);
    const next = exists
      ? current.map((m) => (m.id === message.id ? message : m))
      : [...current, message];
    writeFallbackMessages(next);
  }
}

export async function clearMessagesForContact(contactId: string): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    const msgs = (await txPromise(
      store.index('contactId').getAll(contactId)
    )) as ContactDirectMessage[];
    for (const m of msgs) {
      store.delete(m.id);
    }
    db.close();
  } catch {
    writeFallbackMessages(readFallbackMessages().filter((m) => m.contactId !== contactId));
  }
}

export async function clearAllDirectMessages(): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    await txPromise(tx.objectStore(STORE_MESSAGES).clear());
    db.close();
  } catch {
    writeFallbackMessages([]);
  }
}
