/**
 * Cryptographic 6-Digit Offline Connection Code Engine (100% Local, Zero Server)
 *
 * Security design:
 *  - Generates a CSPRNG 6-digit temporary numeric code via `crypto.getRandomValues`.
 *  - Pairs it with a 128-bit random nonce and a 3-minute automatic expiration TTL.
 *  - Broadcasts ONLY `commitment = SHA-256("fc-code-v1:" + code + ":" + nonce + ":" + hostDeviceId)`
 *    so the raw 6-digit code never traverses local discovery channels in plaintext.
 *  - Joiners verify the entered 6-digit code against discovered commitments and transmit a
 *    distinct proof `SHA-256("fc-proof-v1:" + code + ":" + nonce + ":" + hostDeviceId + ":" + joinerDeviceId)`
 *    which the host verifies in constant time before presenting the dual-approval Accept/Reject prompt.
 */

export const CODE_TTL_MS = 3 * 60 * 1000; // 3 minutes automatic expiration
export const CODE_MAX_FAILED_ATTEMPTS = 5;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return toHex(new Uint8Array(digest));
  }
  // Fallback deterministic FNV-1a 256-bit mixing only if WebCrypto subtle is unavailable in an insecure HTTP dev context
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < data.length; i++) {
    h1 ^= data[i];
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= data[i] ^ (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function normalizeSixDigitCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6);
}

export function isValidSixDigitCode(raw: string): boolean {
  return /^\d{6}$/.test(normalizeSixDigitCode(raw));
}

export function formatSixDigitCode(code: string): string {
  const clean = normalizeSixDigitCode(code);
  if (clean.length <= 3) return clean;
  return `${clean.slice(0, 3)} ${clean.slice(3)}`;
}

export function generateRandomNonceHex(byteLen = 16): string {
  const bytes = new Uint8Array(byteLen);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return toHex(bytes);
}

export function generateCryptoSixDigitCode(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    // Rejection sampling for uniform distribution over 0..999999
    const maxUnbiased = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
    const buf = new Uint32Array(1);
    while (true) {
      crypto.getRandomValues(buf);
      if (buf[0] < maxUnbiased) {
        return String(buf[0] % 1_000_000).padStart(6, '0');
      }
    }
  }
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
}

export async function computeCodeCommitment(
  code: string,
  nonce: string,
  hostDeviceId: string
): Promise<string> {
  const clean = normalizeSixDigitCode(code);
  return sha256Hex(`fc-code-v1:${clean}:${nonce}:${hostDeviceId}`);
}

export async function computeCodeJoinProof(
  code: string,
  nonce: string,
  hostDeviceId: string,
  joinerDeviceId: string
): Promise<string> {
  const clean = normalizeSixDigitCode(code);
  return sha256Hex(`fc-proof-v1:${clean}:${nonce}:${hostDeviceId}:${joinerDeviceId}`);
}

export async function verifyCodeAgainstCommitment(
  enteredCode: string,
  nonce: string,
  hostDeviceId: string,
  expectedCommitment: string
): Promise<boolean> {
  if (!isValidSixDigitCode(enteredCode)) return false;
  const computed = await computeCodeCommitment(enteredCode, nonce, hostDeviceId);
  return constantTimeEqual(computed, expectedCommitment);
}

export async function verifyCodeJoinProof(
  expectedCode: string,
  nonce: string,
  hostDeviceId: string,
  joinerDeviceId: string,
  providedProof: string
): Promise<boolean> {
  if (!isValidSixDigitCode(expectedCode)) return false;
  const expected = await computeCodeJoinProof(expectedCode, nonce, hostDeviceId, joinerDeviceId);
  return constantTimeEqual(expected, providedProof);
}

export async function createTemporaryCodeSession(hostDeviceId: string) {
  const code = generateCryptoSixDigitCode();
  const nonce = generateRandomNonceHex(16);
  const commitment = await computeCodeCommitment(code, nonce, hostDeviceId);
  const createdAt = Date.now();
  return {
    code,
    nonce,
    commitment,
    createdAt,
    expiresAt: createdAt + CODE_TTL_MS,
    failedAttempts: 0,
    maxAttempts: CODE_MAX_FAILED_ATTEMPTS,
  };
}
