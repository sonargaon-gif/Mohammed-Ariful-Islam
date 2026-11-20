/**
 * Real Web Crypto API engine mirroring Android CryptoManager.kt:
 * - Elliptic Curve P-256 (ECDH) identity keypairs per simulated phone
 * - HKDF-SHA256 shared key derivation
 * - AES-256-GCM authenticated encryption with AAD binding
 * - SHA-256 Safety Number fingerprints
 */

export interface NodeCryptoIdentity {
  keyPair: CryptoKeyPair;
  publicKeyBase64: string;
  fingerprint: string;
  nodeId: string;
}

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

function toHex(bytes: Uint8Array, maxBytes = 8): string {
  return Array.from(bytes.slice(0, maxBytes))
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
}

function formatBlocks(hex: string): string {
  return hex.match(/.{1,4}/g)?.join(' ') ?? hex;
}

export async function generateNodeIdentity(): Promise<NodeCryptoIdentity> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  const rawPub = new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey));
  const hashBuffer = await crypto.subtle.digest('SHA-256', rawPub);
  const hashBytes = new Uint8Array(hashBuffer);

  return {
    keyPair,
    publicKeyBase64: bytesToBase64(rawPub),
    fingerprint: formatBlocks(toHex(hashBytes, 8)),
    nodeId: `FC-${toHex(hashBytes, 4)}`,
  };
}

export async function computeSafetyNumber(
  pubKeyABase64: string,
  pubKeyBBase64: string
): Promise<string> {
  if (!pubKeyABase64 || !pubKeyBBase64) return '---- ---- ---- ----';
  const [first, second] =
    pubKeyABase64 <= pubKeyBBase64
      ? [pubKeyABase64, pubKeyBBase64]
      : [pubKeyBBase64, pubKeyABase64];
  const combined = new TextEncoder().encode(`${first}|${second}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', combined));
  return formatBlocks(toHex(digest, 8));
}

export async function importPeerPublicKey(publicKeyBase64: string): Promise<CryptoKey> {
  const spkiBytes = base64ToBytes(publicKeyBase64);
  return crypto.subtle.importKey(
    'spki',
    spkiBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
}

async function deriveSharedAesKey(
  localPrivateKey: CryptoKey,
  remotePublicKey: CryptoKey
): Promise<CryptoKey> {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: remotePublicKey },
    localPrivateKey,
    256
  );

  const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('FreeConnect-v1-Salt'),
      info: new TextEncoder().encode('FreeConnect-AES256-GCM'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptMessageForPeer(
  plaintext: string,
  senderPrivateKey: CryptoKey,
  recipientPublicKey: CryptoKey,
  associatedData: string
): Promise<{ ciphertextBase64: string; ivBase64: string }> {
  const aesKey = await deriveSharedAesKey(senderPrivateKey, recipientPublicKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const aad = new TextEncoder().encode(associatedData);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
    aesKey,
    encoded
  );

  return {
    ciphertextBase64: bytesToBase64(new Uint8Array(encryptedBuffer)),
    ivBase64: bytesToBase64(iv),
  };
}

export async function decryptMessageFromPeer(
  ciphertextBase64: string,
  ivBase64: string,
  recipientPrivateKey: CryptoKey,
  senderPublicKey: CryptoKey,
  associatedData: string
): Promise<string> {
  const aesKey = await deriveSharedAesKey(recipientPrivateKey, senderPublicKey);
  const iv = base64ToBytes(ivBase64);
  const ciphertext = base64ToBytes(ciphertextBase64);
  const aad = new TextEncoder().encode(associatedData);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
    aesKey,
    ciphertext
  );

  return new TextDecoder().decode(decryptedBuffer);
}
