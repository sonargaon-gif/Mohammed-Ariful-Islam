/**
 * Cryptographic PIN Security Engine (PBKDF2-SHA256)
 *
 * Security Guarantees:
 * - Never stores plain-text PINs anywhere.
 * - Uses 150,000 iterations of PBKDF2-HMAC-SHA256 with a unique 16-byte random salt per secret.
 * - Constant-time byte comparison prevents timing side-channels.
 * - Generates offline Recovery Keys (XXXX-XXXX-XXXX-XXXX) and hashes both the recovery key
 *   and optional Security Question answer with independent salts.
 */

export interface StoredPinSecurityRecord {
  version: 2;
  pinHashBase64: string;
  pinSaltBase64: string;
  iterations: number;
  recoveryKeyHashBase64: string;
  recoveryKeySaltBase64: string;
  securityQuestion: string | null;
  securityAnswerHashBase64: string | null;
  securityAnswerSaltBase64: string | null;
  createdAt: number;
  updatedAt: number;
  failedAttempts: number;
  lockoutUntil: number | null;
}

const PBKDF2_ITERATIONS = 150_000;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function derivePbkdf2Hash(
  secret: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<Uint8Array<ArrayBuffer>> {
  const enc = new TextEncoder().encode(secret);
  const keyMaterial = await crypto.subtle.importKey('raw', enc, 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    keyMaterial,
    256
  );
  return new Uint8Array(derived);
}

function createRandomSalt(): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(16);
  const salt = new Uint8Array(buffer);
  crypto.getRandomValues(salt);
  return salt;
}

export function validatePinFormat(pin: string): string | null {
  const trimmed = pin.trim();
  if (!/^\d{4,8}$/.test(trimmed)) {
    return 'PIN must be 4 to 8 numeric digits (0–9).';
  }
  return null;
}

export function generateOfflineRecoveryKey(): string {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  let raw = '';
  for (let i = 0; i < 16; i++) {
    raw += RECOVERY_ALPHABET[randomBytes[i] % RECOVERY_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

function normalizeRecoveryKey(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeSecurityAnswer(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function createPinSecurityRecord(params: {
  pin: string;
  securityQuestion?: string;
  securityAnswer?: string;
}): Promise<{ record: StoredPinSecurityRecord; recoveryKey: string }> {
  const err = validatePinFormat(params.pin);
  if (err) throw new Error(err);

  const pinSalt = createRandomSalt();
  const pinHash = await derivePbkdf2Hash(params.pin.trim(), pinSalt, PBKDF2_ITERATIONS);

  const recoveryKey = generateOfflineRecoveryKey();
  const recoverySalt = createRandomSalt();
  const recoveryHash = await derivePbkdf2Hash(
    normalizeRecoveryKey(recoveryKey),
    recoverySalt,
    PBKDF2_ITERATIONS
  );

  let securityQuestion: string | null = null;
  let securityAnswerHashBase64: string | null = null;
  let securityAnswerSaltBase64: string | null = null;

  if (params.securityQuestion?.trim() && params.securityAnswer?.trim()) {
    securityQuestion = params.securityQuestion.trim();
    const ansSalt = createRandomSalt();
    const ansHash = await derivePbkdf2Hash(
      normalizeSecurityAnswer(params.securityAnswer),
      ansSalt,
      PBKDF2_ITERATIONS
    );
    securityAnswerSaltBase64 = bytesToBase64(ansSalt);
    securityAnswerHashBase64 = bytesToBase64(ansHash);
  }

  const now = Date.now();
  return {
    recoveryKey,
    record: {
      version: 2,
      pinHashBase64: bytesToBase64(pinHash),
      pinSaltBase64: bytesToBase64(pinSalt),
      iterations: PBKDF2_ITERATIONS,
      recoveryKeyHashBase64: bytesToBase64(recoveryHash),
      recoveryKeySaltBase64: bytesToBase64(recoverySalt),
      securityQuestion,
      securityAnswerHashBase64,
      securityAnswerSaltBase64,
      createdAt: now,
      updatedAt: now,
      failedAttempts: 0,
      lockoutUntil: null,
    },
  };
}

export async function verifyPinAgainstRecord(
  candidatePin: string,
  record: StoredPinSecurityRecord
): Promise<boolean> {
  const trimmed = candidatePin.trim();
  if (!trimmed) return false;
  const salt = base64ToBytes(record.pinSaltBase64);
  const expected = base64ToBytes(record.pinHashBase64);
  const derived = await derivePbkdf2Hash(trimmed, salt, record.iterations || PBKDF2_ITERATIONS);
  return constantTimeEquals(derived, expected);
}

export async function verifyRecoveryKeyAgainstRecord(
  candidateKey: string,
  record: StoredPinSecurityRecord
): Promise<boolean> {
  const normalized = normalizeRecoveryKey(candidateKey);
  if (normalized.length < 8) return false;
  const salt = base64ToBytes(record.recoveryKeySaltBase64);
  const expected = base64ToBytes(record.recoveryKeyHashBase64);
  const derived = await derivePbkdf2Hash(normalized, salt, record.iterations || PBKDF2_ITERATIONS);
  return constantTimeEquals(derived, expected);
}

export async function verifySecurityAnswerAgainstRecord(
  candidateAnswer: string,
  record: StoredPinSecurityRecord
): Promise<boolean> {
  if (!record.securityAnswerHashBase64 || !record.securityAnswerSaltBase64) return false;
  const normalized = normalizeSecurityAnswer(candidateAnswer);
  if (!normalized) return false;
  const salt = base64ToBytes(record.securityAnswerSaltBase64);
  const expected = base64ToBytes(record.securityAnswerHashBase64);
  const derived = await derivePbkdf2Hash(normalized, salt, record.iterations || PBKDF2_ITERATIONS);
  return constantTimeEquals(derived, expected);
}

export async function updatePinInRecord(
  existing: StoredPinSecurityRecord,
  newPin: string
): Promise<StoredPinSecurityRecord> {
  const err = validatePinFormat(newPin);
  if (err) throw new Error(err);

  const pinSalt = createRandomSalt();
  const pinHash = await derivePbkdf2Hash(newPin.trim(), pinSalt, PBKDF2_ITERATIONS);

  return {
    ...existing,
    pinHashBase64: bytesToBase64(pinHash),
    pinSaltBase64: bytesToBase64(pinSalt),
    iterations: PBKDF2_ITERATIONS,
    updatedAt: Date.now(),
    failedAttempts: 0,
    lockoutUntil: null,
  };
}
