import {
  ActivePairingClaim,
  AdminOverviewPayload,
  AdminStatsData,
  AuthenticatedUserProfile,
  CodeVerificationResult,
  OtpPurpose,
  OtpSendResponse,
  PairedPrivateRoom,
  PairedRoomMessage,
  PairingCodeStatus,
  PairingPoolCard,
  PairingRequestRecord,
  PairingSessionUser,
} from '../types/pairing';

const SESSION_TOKEN_KEY = 'freeconnect_pairing_session_token_v1';
const IDB_AUTH_DB_NAME = 'freeconnect_persistent_auth_v1';
const IDB_AUTH_STORE_NAME = 'sessions';
const IDB_AUTH_KEY = 'primary_session_token';

function openAuthIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_AUTH_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_AUTH_STORE_NAME)) {
          db.createObjectStore(IDB_AUTH_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readTokenFromIdb(): Promise<string | null> {
  const db = await openAuthIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_AUTH_STORE_NAME, 'readonly');
      const req = tx.objectStore(IDB_AUTH_STORE_NAME).get(IDB_AUTH_KEY);
      req.onsuccess = () => {
        db.close();
        resolve(typeof req.result === 'string' && req.result ? req.result : null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function writeTokenToIdb(token: string | null): Promise<void> {
  const db = await openAuthIdb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_AUTH_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IDB_AUTH_STORE_NAME);
      if (token) {
        store.put(token, IDB_AUTH_KEY);
      } else {
        store.delete(IDB_AUTH_KEY);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export function getStoredPairingToken(): string | null {
  try {
    return window.localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function restoreStoredPairingToken(): Promise<string | null> {
  const lsToken = getStoredPairingToken();
  if (lsToken) return lsToken;
  const idbToken = await readTokenFromIdb();
  if (idbToken) {
    try {
      window.localStorage.setItem(SESSION_TOKEN_KEY, idbToken);
    } catch {
      // Ignore storage quota errors
    }
  }
  return idbToken;
}

export function setStoredPairingToken(token: string): void {
  try {
    window.localStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    // Ignore storage quota errors
  }
  void writeTokenToIdb(token);
}

export function clearStoredPairingToken(): void {
  try {
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // Ignore
  }
  void writeTokenToIdb(null);
}

export function buildWhatsAppPairingMessage(code: string): string {
  const cleanCode = code.replace(/\D/g, '').slice(0, 6);
  return `Hello! I want to connect with you on Offline Messenger. My connection code is: ${cleanCode}. Open the messenger website, enter this code, and send me a connection request.`;
}

export function buildOfficialWhatsAppShareUrl(code: string): string {
  const text = buildWhatsAppPairingMessage(code);
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export class ApiRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function apiRequest<T>(
  url: string,
  options: { method?: string; body?: unknown; token?: string | null } = {}
): Promise<T> {
  const token = options.token !== undefined ? options.token : getStoredPairingToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = (await response.json().catch(() => ({}))) as {
    error?: unknown;
    code?: unknown;
  };
  if (!response.ok) {
    const errMsg =
      typeof data.error === 'string'
        ? data.error
        : `Request failed (${response.status})`;
    const errCode = typeof data.code === 'string' ? data.code : undefined;
    throw new ApiRequestError(errMsg, response.status, errCode);
  }
  return data as T;
}

export interface SessionSyncResponse {
  sessionToken: string;
  user: PairingSessionUser;
  myClaim: ActivePairingClaim | null;
  requests: PairingRequestRecord[];
  rooms: PairedPrivateRoom[];
}

export interface AuthRestoreResponse {
  authenticated: boolean;
  sessionToken?: string;
  user: AuthenticatedUserProfile | null;
  myClaim?: ActivePairingClaim | null;
  requests?: PairingRequestRecord[];
  rooms?: PairedPrivateRoom[];
}

export async function restoreAuthenticatedSession(): Promise<AuthRestoreResponse> {
  const token = await restoreStoredPairingToken();
  const res = await apiRequest<AuthRestoreResponse>('/api/auth/me', {
    method: 'GET',
    token,
  });
  if (res.authenticated && res.sessionToken) {
    setStoredPairingToken(res.sessionToken);
  } else if (!res.authenticated) {
    clearStoredPairingToken();
  }
  return res;
}

export async function requestPhoneOtp(payload: {
  purpose: OtpPurpose;
  countryCode: string;
  phoneNumber: string;
}): Promise<OtpSendResponse> {
  return apiRequest<OtpSendResponse>('/api/auth/otp/send', {
    method: 'POST',
    body: payload,
  });
}

export async function verifyPhoneOtp(payload: {
  challengeId: string;
  otpCode: string;
  purpose: OtpPurpose;
}): Promise<{ ok: true; verified: true; phoneE164: string; purpose: OtpPurpose }> {
  return apiRequest('/api/auth/otp/verify', {
    method: 'POST',
    body: payload,
  });
}

export async function completeAccountRegistration(payload: {
  challengeId: string;
  otpCode?: string;
  fullName: string;
  deviceId?: string;
  platform?: string;
}): Promise<SessionSyncResponse & { ok: true; expiresAt: number }> {
  const res = await apiRequest<SessionSyncResponse & { ok: true; expiresAt: number }>(
    '/api/auth/register',
    {
      method: 'POST',
      body: payload,
    }
  );
  if (res.sessionToken) {
    setStoredPairingToken(res.sessionToken);
  }
  return res;
}

export async function completeAccountOtpLogin(payload: {
  challengeId: string;
  otpCode?: string;
  deviceId?: string;
  platform?: string;
}): Promise<SessionSyncResponse & { ok: true; expiresAt: number }> {
  const res = await apiRequest<SessionSyncResponse & { ok: true; expiresAt: number }>(
    '/api/auth/login',
    {
      method: 'POST',
      body: payload,
    }
  );
  if (res.sessionToken) {
    setStoredPairingToken(res.sessionToken);
  }
  return res;
}

export async function patchPermanentProfile(patch: {
  fullName?: string;
  displayName?: string;
  username?: string;
  bio?: string;
  statusNote?: string;
  avatarDataUrl?: string | null;
  showPhoneToPeers?: boolean;
  deviceId?: string;
  platform?: string;
}): Promise<{ ok: true; user: AuthenticatedUserProfile }> {
  return apiRequest('/api/auth/profile', {
    method: 'PATCH',
    body: patch,
  });
}

export async function completePhoneNumberChange(payload: {
  challengeId: string;
  otpCode?: string;
}): Promise<{ ok: true; user: AuthenticatedUserProfile }> {
  return apiRequest('/api/auth/change-phone', {
    method: 'POST',
    body: payload,
  });
}

export async function logoutAccountSession(): Promise<{ ok: true }> {
  try {
    return await apiRequest('/api/auth/logout', { method: 'POST' });
  } finally {
    clearStoredPairingToken();
  }
}

export async function deletePermanentAccount(): Promise<{ ok: true }> {
  try {
    return await apiRequest('/api/auth/account', { method: 'DELETE' });
  } finally {
    clearStoredPairingToken();
  }
}

export async function syncPairingSession(payload: {
  displayName: string;
  username: string;
  bio: string;
  avatarDataUrl: string | null;
  deviceId: string;
  platform: string;
}): Promise<SessionSyncResponse> {
  const res = await apiRequest<SessionSyncResponse>('/api/pairing/session', {
    method: 'POST',
    body: payload,
  });
  if (res.sessionToken) {
    setStoredPairingToken(res.sessionToken);
  }
  return res;
}

export async function fetchCuratedCodePool(limit = 15): Promise<{
  cards: PairingPoolCard[];
  totalAvailableCount: number;
  myClaim: ActivePairingClaim | null;
}> {
  return apiRequest(`/api/pairing/pool?limit=${limit}`);
}

export async function claimPairingCode(code: string): Promise<{
  ok: true;
  claim: ActivePairingClaim;
}> {
  return apiRequest('/api/pairing/claim', {
    method: 'POST',
    body: { code },
  });
}

export async function cancelActivePairingCode(): Promise<{
  ok: true;
  releasedCode: string | null;
}> {
  return apiRequest('/api/pairing/cancel', {
    method: 'POST',
  });
}

export async function verifyPairingCode(code: string): Promise<CodeVerificationResult> {
  return apiRequest('/api/pairing/verify', {
    method: 'POST',
    body: { code },
  });
}

export async function sendPairingConnectionRequest(code: string): Promise<{
  ok: true;
  request: PairingRequestRecord;
}> {
  return apiRequest('/api/pairing/request', {
    method: 'POST',
    body: { code },
  });
}

export async function respondPairingRequest(
  requestId: string,
  accept: boolean
): Promise<{
  ok: true;
  status: 'accepted' | 'rejected';
  room: PairedPrivateRoom | null;
}> {
  return apiRequest(`/api/pairing/request/${encodeURIComponent(requestId)}/respond`, {
    method: 'POST',
    body: { accept },
  });
}

export async function fetchPairingState(): Promise<{
  myClaim: ActivePairingClaim | null;
  requests: PairingRequestRecord[];
  rooms: PairedPrivateRoom[];
}> {
  return apiRequest('/api/pairing/state');
}

export async function fetchRoomMessages(roomId: string): Promise<{
  messages: PairedRoomMessage[];
}> {
  return apiRequest(`/api/pairing/rooms/${encodeURIComponent(roomId)}/messages`);
}

export async function postRoomMessage(
  roomId: string,
  text: string
): Promise<{
  ok: true;
  message: PairedRoomMessage;
}> {
  return apiRequest(`/api/pairing/rooms/${encodeURIComponent(roomId)}/messages`, {
    method: 'POST',
    body: { text },
  });
}

export async function disconnectPairedRoom(roomId: string): Promise<{
  ok: true;
  roomId: string;
}> {
  return apiRequest(`/api/pairing/rooms/${encodeURIComponent(roomId)}/disconnect`, {
    method: 'POST',
  });
}

// --- Admin Control Center API ---

export async function unlockAdminAccess(passcode: string): Promise<{
  ok: true;
  role: 'admin';
}> {
  return apiRequest('/api/admin/unlock', {
    method: 'POST',
    body: { passcode },
  });
}

export async function fetchAdminOverview(
  status: PairingCodeStatus | 'all' = 'all',
  search = ''
): Promise<AdminOverviewPayload> {
  const qs = new URLSearchParams({ status, search });
  return apiRequest(`/api/admin/overview?${qs.toString()}`);
}

export async function adminGenerateCodes(count: number): Promise<{
  ok: true;
  generated: number;
  totalGenerated: number;
  stats: AdminStatsData;
}> {
  return apiRequest('/api/admin/codes/generate', {
    method: 'POST',
    body: { count },
  });
}

export async function adminDisableCode(
  code: string,
  reason: string
): Promise<{
  ok: true;
  code: string;
  stats: AdminStatsData;
}> {
  return apiRequest(`/api/admin/codes/${encodeURIComponent(code)}/disable`, {
    method: 'POST',
    body: { reason },
  });
}

export async function adminRecycleExpiredCodes(): Promise<{
  ok: true;
  newlyExpired: number;
  recycledToAvailable: number;
  stats: AdminStatsData;
}> {
  return apiRequest('/api/admin/codes/recycle-expired', {
    method: 'POST',
  });
}

// --- Full Website Backup & Restore API ---

export interface ServerBackupArchiveMeta {
  filename: string;
  sizeBytes: number;
  createdAt: number;
  checksumShort: string;
}

export interface BackendUserBackupPayload {
  exportedAt: string;
  user: AuthenticatedUserProfile;
  myClaim: ActivePairingClaim | null;
  requests: PairingRequestRecord[];
  rooms: Array<PairedPrivateRoom & { messages: PairedRoomMessage[] }>;
}

export async function fetchUserBackendBackup(): Promise<{
  ok: true;
  backup: BackendUserBackupPayload;
}> {
  return apiRequest('/api/backup/user-export');
}

export async function listServerWebsiteBackups(): Promise<{
  ok: true;
  backups: ServerBackupArchiveMeta[];
}> {
  return apiRequest('/api/backup/list');
}

export async function createServerWebsiteSnapshot(): Promise<{
  ok: true;
  backup: ServerBackupArchiveMeta;
  backups: ServerBackupArchiveMeta[];
}> {
  return apiRequest('/api/backup/server-snapshot', {
    method: 'POST',
  });
}

export async function downloadServerBackupArchive(filename: string): Promise<void> {
  const token = getStoredPairingToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`/api/backup/download/${encodeURIComponent(filename)}`, {
    method: 'GET',
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    const errData = (await response.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(
      typeof errData.error === 'string'
        ? errData.error
        : `Failed to download backup (${response.status}).`
    );
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
