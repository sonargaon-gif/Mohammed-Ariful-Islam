import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

export const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const EXPIRED_GRACE_MS = 5 * 60 * 1000; // 5 minutes so late verifiers see "Code Expired" before recycle
export const INITIAL_PREGENERATED_CODES = 3000;

export type CodeStatus = 'available' | 'claimed' | 'used' | 'expired' | 'disabled';
export type VerifyVerdict =
  | 'valid'
  | 'invalid'
  | 'already_used'
  | 'expired'
  | 'user_not_available';

export interface PairingUserRecord {
  id: string;
  displayName: string;
  username: string;
  bio: string;
  statusNote: string;
  avatarDataUrl: string | null;
  countryCode: string;
  phoneNational: string;
  phoneE164: string;
  phoneVerified: boolean;
  phoneVerifiedAt: number | null;
  showPhoneToPeers: boolean;
  accountStatus: 'active' | 'suspended';
  deviceId: string;
  platform: string;
  role: 'user' | 'admin';
  lastSeenAt: number;
  createdAt: number;
}

export interface AuthenticatedUserProfile {
  id: string;
  fullName: string;
  displayName: string;
  username: string;
  bio: string;
  statusNote: string;
  avatarDataUrl: string | null;
  countryCode: string;
  phoneNational: string;
  phoneE164: string;
  phoneVerified: boolean;
  phoneVerifiedAt: number | null;
  showPhoneToPeers: boolean;
  accountStatus: 'active' | 'suspended';
  deviceId: string;
  platform: string;
  role: 'user' | 'admin';
  createdAt: number;
  lastSeenAt: number;
}

export interface PairingPublicProfile {
  id: string;
  displayName: string;
  username: string;
  bio: string;
  avatarDataUrl: string | null;
  deviceId: string;
  platform: string;
  phoneVerified: boolean;
  publicPhone: string | null;
  online: boolean;
  lastSeenAt: number;
}

export type OtpPurpose = 'register' | 'login' | 'change_phone';

export interface PoolCodeCard {
  code: string;
  status: 'available' | 'taken';
  expiresAt: number | null;
  isMine: boolean;
}

export interface ActiveClaimInfo {
  code: string;
  claimedAt: number;
  expiresAt: number;
  status: CodeStatus;
}

export interface ConnectionRequestItem {
  id: string;
  code: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
  createdAt: number;
  respondedAt: number | null;
  direction: 'incoming' | 'outgoing';
  peer: PairingPublicProfile;
  roomId: string | null;
}

export interface PrivateRoomSummary {
  id: string;
  code: string;
  status: 'active' | 'disconnected';
  createdAt: number;
  disconnectedAt: number | null;
  disconnectedBy: string | null;
  peer: PairingPublicProfile;
  lastMessageText: string | null;
  lastMessageAt: number | null;
  unreadCount: number;
}

export interface PrivateRoomMessage {
  id: string;
  roomId: string;
  senderId: string;
  text: string;
  deliveryStatus: 'sent' | 'delivered';
  createdAt: number;
  deliveredAt: number | null;
}

export interface PairingEventRecord {
  id: number;
  eventType: string;
  code: string | null;
  userId: string | null;
  severity: 'info' | 'warn' | 'error';
  message: string;
  createdAt: number;
}

export interface AdminStatsSummary {
  totalGenerated: number;
  availableCodes: number;
  claimedCodes: number;
  expiredCodes: number;
  totalExpiredEvents: number;
  usedCodes: number;
  disabledCodes: number;
  activeConnections: number;
  pendingRequests: number;
  registeredUsers: number;
}

export interface AdminCodeRow {
  code: string;
  status: CodeStatus;
  claimedByUsername: string | null;
  claimedByName: string | null;
  claimedAt: number | null;
  expiresAt: number | null;
  usedAt: number | null;
  disabledReason: string | null;
  timesExpired: number;
}

export interface AdminConnectionRow {
  roomId: string;
  code: string;
  status: 'active' | 'disconnected';
  userAName: string;
  userAUsername: string;
  userBName: string;
  userBUsername: string;
  createdAt: number;
  messageCount: number;
}

export const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days persistent Remember Me session
export const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes OTP expiration
export const OTP_MAX_ATTEMPTS = 5;

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function hashOtp(otpCode: string, salt: string): string {
  return crypto.createHash('sha256').update(`${salt}:${otpCode}`).digest('hex');
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function makePermanentUserId(): string {
  return `FCU-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6);
}

export function normalizePhoneParts(
  rawCountryCode: string,
  rawNational: string
): { ok: true; countryCode: string; phoneNational: string; phoneE164: string } | { ok: false; error: string } {
  const ccDigits = String(rawCountryCode || '').replace(/\D/g, '').slice(0, 4);
  if (!ccDigits) {
    return { ok: false, error: 'Please select a valid country dial code.' };
  }
  let natDigits = String(rawNational || '').replace(/\D/g, '');
  // Strip leading trunk zero if user typed e.g. 0300... after selecting country code
  if (natDigits.startsWith('0') && natDigits.length >= 10) {
    natDigits = natDigits.replace(/^0+/, '');
  }
  if (natDigits.length < 6 || natDigits.length > 15) {
    return { ok: false, error: 'Enter a valid mobile phone number (6 to 15 digits).' };
  }
  const countryCode = `+${ccDigits}`;
  const phoneE164 = `${countryCode}${natDigits}`;
  return { ok: true, countryCode, phoneNational: natDigits, phoneE164 };
}

function buildUsernameBase(fullName: string): string {
  const slug = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 16);
  return slug.length >= 3 ? slug : 'member';
}

export class PairingDatabase {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath =
      dbPath ?? path.resolve(process.cwd(), 'data', 'freeconnect_pairing.db');
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');

    this.initSchema();
    this.ensureInitialCodePool();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        username TEXT NOT NULL,
        bio TEXT NOT NULL DEFAULT '',
        status_note TEXT NOT NULL DEFAULT 'Available Offline',
        avatar_data_url TEXT,
        country_code TEXT NOT NULL DEFAULT '',
        phone_national TEXT NOT NULL DEFAULT '',
        phone_e164 TEXT,
        phone_verified INTEGER NOT NULL DEFAULT 0,
        phone_verified_at INTEGER,
        show_phone_to_peers INTEGER NOT NULL DEFAULT 0,
        account_status TEXT NOT NULL DEFAULT 'active',
        device_id TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'browser',
        role TEXT NOT NULL DEFAULT 'user',
        session_token_hash TEXT,
        last_seen_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        device_label TEXT NOT NULL DEFAULT 'Web Browser',
        platform TEXT NOT NULL DEFAULT 'browser',
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        revoked_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_user_sessions_user
        ON user_sessions(user_id, revoked_at);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_token
        ON user_sessions(token_hash);

      CREATE TABLE IF NOT EXISTS otp_challenges (
        id TEXT PRIMARY KEY,
        phone_e164 TEXT NOT NULL,
        country_code TEXT NOT NULL,
        phone_national TEXT NOT NULL,
        purpose TEXT NOT NULL,
        user_id TEXT,
        otp_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        expires_at INTEGER NOT NULL,
        verified_at INTEGER,
        consumed_at INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_otp_challenges_phone
        ON otp_challenges(phone_e164, created_at DESC);

      CREATE TABLE IF NOT EXISTS pairing_codes (
        code TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'available',
        claimed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        claimed_at INTEGER,
        expires_at INTEGER,
        expired_at INTEGER,
        used_at INTEGER,
        used_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        disabled_reason TEXT,
        times_expired INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pairing_codes_status
        ON pairing_codes(status);
      CREATE INDEX IF NOT EXISTS idx_pairing_codes_claimer
        ON pairing_codes(claimed_by_user_id);
      CREATE INDEX IF NOT EXISTS idx_pairing_codes_expires
        ON pairing_codes(status, expires_at);

      CREATE TABLE IF NOT EXISTS connection_requests (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL REFERENCES pairing_codes(code),
        from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        room_id TEXT,
        created_at INTEGER NOT NULL,
        responded_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_requests_to_user
        ON connection_requests(to_user_id, status);
      CREATE INDEX IF NOT EXISTS idx_requests_from_user
        ON connection_requests(from_user_id, status);

      CREATE TABLE IF NOT EXISTS private_rooms (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL REFERENCES pairing_codes(code),
        user_a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        disconnected_at INTEGER,
        disconnected_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_rooms_participants
        ON private_rooms(user_a_id, user_b_id);

      CREATE TABLE IF NOT EXISTS room_messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES private_rooms(id) ON DELETE CASCADE,
        sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        delivery_status TEXT NOT NULL DEFAULT 'sent',
        created_at INTEGER NOT NULL,
        delivered_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_room_messages_room
        ON room_messages(room_id, created_at);

      CREATE TABLE IF NOT EXISTS pairing_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        code TEXT,
        user_id TEXT,
        severity TEXT NOT NULL DEFAULT 'info',
        message TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pairing_events_created
        ON pairing_events(created_at DESC);
    `);

    // Non-destructive column migrations for any pre-existing database files
    const userCols = new Set(
      (this.db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map(
        (c) => c.name
      )
    );
    const migrations: Array<[string, string]> = [
      ['status_note', `ALTER TABLE users ADD COLUMN status_note TEXT NOT NULL DEFAULT 'Available Offline'`],
      ['country_code', `ALTER TABLE users ADD COLUMN country_code TEXT NOT NULL DEFAULT ''`],
      ['phone_national', `ALTER TABLE users ADD COLUMN phone_national TEXT NOT NULL DEFAULT ''`],
      ['phone_e164', `ALTER TABLE users ADD COLUMN phone_e164 TEXT`],
      ['phone_verified', `ALTER TABLE users ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 0`],
      ['phone_verified_at', `ALTER TABLE users ADD COLUMN phone_verified_at INTEGER`],
      ['show_phone_to_peers', `ALTER TABLE users ADD COLUMN show_phone_to_peers INTEGER NOT NULL DEFAULT 0`],
      ['account_status', `ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'`],
    ];
    for (const [col, ddl] of migrations) {
      if (!userCols.has(col)) {
        this.db.exec(ddl);
      }
    }

    // Unique index on verified phone numbers prevents duplicate accounts at the database level
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_e164_unique
        ON users(phone_e164)
        WHERE phone_e164 IS NOT NULL AND phone_e164 != '';
    `);
  }

  private ensureInitialCodePool(): void {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM pairing_codes')
      .get() as { count: number };

    if (row.count < INITIAL_PREGENERATED_CODES) {
      const needed = INITIAL_PREGENERATED_CODES - row.count;
      this.generateAdditionalCodes(needed);
    }
  }

  public generateAdditionalCodes(requestedCount: number): {
    generated: number;
    totalGenerated: number;
  } {
    const count = Math.max(1, Math.min(5000, Math.floor(requestedCount)));
    const insertStmt = this.db.prepare(
      `INSERT OR IGNORE INTO pairing_codes (code, status, created_at) VALUES (?, 'available', ?)`
    );

    const now = Date.now();
    let inserted = 0;

    const runBatch = this.db.transaction(() => {
      let attempts = 0;
      const maxAttempts = count * 12;
      while (inserted < count && attempts < maxAttempts) {
        attempts += 1;
        const code = String(crypto.randomInt(100000, 1000000));
        const result = insertStmt.run(code, now);
        if (result.changes > 0) {
          inserted += 1;
        }
      }
    });

    runBatch();

    if (inserted > 0) {
      this.logEvent(
        'codes_generated',
        null,
        null,
        'info',
        `Generated ${inserted} cryptographically random 6-digit pairing codes.`
      );
    }

    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM pairing_codes').get() as {
        count: number;
      }
    ).count;

    return { generated: inserted, totalGenerated: total };
  }

  public logEvent(
    eventType: string,
    code: string | null,
    userId: string | null,
    severity: 'info' | 'warn' | 'error',
    message: string
  ): void {
    this.db
      .prepare(
        `INSERT INTO pairing_events (event_type, code, user_id, severity, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(eventType, code, userId, severity, message.slice(0, 400), Date.now());
  }

  /**
   * Transitions claimed codes past their 10-minute expiration to 'expired',
   * expires pending requests tied to expired codes, and releases expired unused codes
   * back into the available pool once the short verification grace window passes.
   */
  public sweepExpiredCodes(forceRecycleAllExpired = false): {
    newlyExpired: number;
    recycledToAvailable: number;
  } {
    const now = Date.now();
    const recycleCutoff = forceRecycleAllExpired ? now + 1 : now - EXPIRED_GRACE_MS;

    const tx = this.db.transaction(() => {
      const expiringRows = this.db
        .prepare(
          `SELECT code, claimed_by_user_id FROM pairing_codes
           WHERE status = 'claimed' AND expires_at IS NOT NULL AND expires_at <= ?`
        )
        .all(now) as Array<{ code: string; claimed_by_user_id: string | null }>;

      if (expiringRows.length > 0) {
        this.db
          .prepare(
            `UPDATE pairing_codes
             SET status = 'expired',
                 expired_at = ?,
                 times_expired = times_expired + 1
             WHERE status = 'claimed' AND expires_at IS NOT NULL AND expires_at <= ?`
          )
          .run(now, now);

        const expireReqStmt = this.db.prepare(
          `UPDATE connection_requests
           SET status = 'expired', responded_at = ?
           WHERE code = ? AND status = 'pending'`
        );
        for (const r of expiringRows) {
          expireReqStmt.run(now, r.code);
        }
      }

      const recycled = this.db
        .prepare(
          `UPDATE pairing_codes
           SET status = 'available',
               claimed_by_user_id = NULL,
               claimed_at = NULL,
               expires_at = NULL,
               expired_at = NULL
           WHERE status = 'expired'
             AND used_at IS NULL
             AND expired_at IS NOT NULL
             AND expired_at <= ?`
        )
        .run(recycleCutoff);

      return {
        newlyExpired: expiringRows.length,
        recycledToAvailable: recycled.changes,
      };
    });

    return tx();
  }

  // --- PERMANENT USER AUTHENTICATION, OTP & MULTI-DEVICE SESSIONS ---

  public getUserByPhone(phoneE164: string): PairingUserRecord | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE phone_e164 = ? AND phone_verified = 1 LIMIT 1')
      .get(phoneE164) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapUserRow(row);
  }

  public createOtpChallenge(input: {
    purpose: OtpPurpose;
    countryCode: string;
    phoneNumber: string;
    actingUserId?: string | null;
  }):
    | {
        ok: true;
        challengeId: string;
        otpCode: string;
        phoneE164: string;
        expiresAt: number;
      }
    | { ok: false; statusCode: number; code?: string; error: string } {
    const normalized = normalizePhoneParts(input.countryCode, input.phoneNumber);
    if (!normalized.ok) {
      return { ok: false, statusCode: 400, error: normalized.error };
    }

    const existing = this.getUserByPhone(normalized.phoneE164);

    if (input.purpose === 'register' && existing) {
      this.logEvent(
        'duplicate_phone_blocked',
        null,
        existing.id,
        'warn',
        `Duplicate registration prevented for already-verified phone ending in ${normalized.phoneNational.slice(-4)}.`
      );
      return {
        ok: false,
        statusCode: 409,
        code: 'ACCOUNT_EXISTS',
        error:
          'An account with this verified phone number already exists. Sign in with OTP to recover your existing profile.',
      };
    }

    if (input.purpose === 'login' && !existing) {
      return {
        ok: false,
        statusCode: 404,
        code: 'ACCOUNT_NOT_FOUND',
        error:
          'No permanent profile was found for this phone number. Please create a new profile first.',
      };
    }

    if (input.purpose === 'change_phone') {
      if (!input.actingUserId) {
        return { ok: false, statusCode: 401, error: 'Authentication required to change phone number.' };
      }
      if (existing && existing.id !== input.actingUserId) {
        return {
          ok: false,
          statusCode: 409,
          code: 'PHONE_IN_USE',
          error: 'That phone number is already verified by another FreeConnect account.',
        };
      }
      if (existing && existing.id === input.actingUserId) {
        return {
          ok: false,
          statusCode: 400,
          error: 'This is already your current verified phone number.',
        };
      }
    }

    const now = Date.now();
    const expiresAt = now + OTP_TTL_MS;
    const challengeId = makeId('otp');
    const otpCode = String(crypto.randomInt(100000, 1000000));
    const salt = crypto.randomBytes(16).toString('hex');
    const otpHash = hashOtp(otpCode, salt);

    // Clean up expired challenges periodically
    this.db.prepare('DELETE FROM otp_challenges WHERE expires_at < ?').run(now - 60 * 60 * 1000);

    this.db
      .prepare(
        `INSERT INTO otp_challenges
           (id, phone_e164, country_code, phone_national, purpose, user_id, otp_hash, salt, attempts, max_attempts, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
      )
      .run(
        challengeId,
        normalized.phoneE164,
        normalized.countryCode,
        normalized.phoneNational,
        input.purpose,
        input.actingUserId ?? null,
        otpHash,
        salt,
        OTP_MAX_ATTEMPTS,
        expiresAt,
        now
      );

    this.logEvent(
      'otp_issued',
      null,
      input.actingUserId ?? existing?.id ?? null,
      'info',
      `Issued 6-digit OTP (${input.purpose}) for phone ending in ${normalized.phoneNational.slice(-4)}.`
    );

    return {
      ok: true,
      challengeId,
      otpCode,
      phoneE164: normalized.phoneE164,
      expiresAt,
    };
  }

  public verifyOtpChallenge(
    challengeId: string,
    rawOtpCode: string,
    expectedPurpose?: OtpPurpose
  ):
    | { ok: true; phoneE164: string; countryCode: string; phoneNational: string; purpose: OtpPurpose; userId: string | null }
    | { ok: false; statusCode: number; error: string } {
    const cleanOtp = String(rawOtpCode || '').replace(/\D/g, '').slice(0, 6);
    if (!challengeId || cleanOtp.length !== 6) {
      return { ok: false, statusCode: 400, error: 'Enter the exact 6-digit verification OTP code.' };
    }

    const row = this.db
      .prepare('SELECT * FROM otp_challenges WHERE id = ?')
      .get(challengeId) as
      | {
          id: string;
          phone_e164: string;
          country_code: string;
          phone_national: string;
          purpose: OtpPurpose;
          user_id: string | null;
          otp_hash: string;
          salt: string;
          attempts: number;
          max_attempts: number;
          expires_at: number;
          verified_at: number | null;
          consumed_at: number | null;
        }
      | undefined;

    if (!row) {
      return { ok: false, statusCode: 404, error: 'Verification session not found. Request a new OTP.' };
    }

    if (expectedPurpose && row.purpose !== expectedPurpose) {
      return { ok: false, statusCode: 400, error: 'OTP challenge does not match this action.' };
    }

    if (row.consumed_at) {
      return { ok: false, statusCode: 400, error: 'This OTP has already been used. Request a fresh OTP.' };
    }

    const now = Date.now();
    if (row.expires_at <= now) {
      return { ok: false, statusCode: 410, error: 'OTP has expired. Request a new verification code.' };
    }

    if (row.attempts >= row.max_attempts) {
      return {
        ok: false,
        statusCode: 429,
        error: 'Too many incorrect OTP attempts. Please request a new OTP code.',
      };
    }

    const candidateHash = hashOtp(cleanOtp, row.salt);
    const valid =
      candidateHash.length === row.otp_hash.length &&
      crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(row.otp_hash));

    if (!valid) {
      const nextAttempts = row.attempts + 1;
      this.db
        .prepare('UPDATE otp_challenges SET attempts = ? WHERE id = ?')
        .run(nextAttempts, challengeId);
      const remaining = Math.max(0, row.max_attempts - nextAttempts);
      this.logEvent(
        'otp_failed',
        null,
        row.user_id,
        'warn',
        `Invalid OTP attempt (${nextAttempts}/${row.max_attempts}) for ${row.purpose}.`
      );
      return {
        ok: false,
        statusCode: 400,
        error:
          remaining > 0
            ? `Incorrect OTP code. ${remaining} attempt(s) remaining.`
            : 'Maximum OTP attempts exceeded. Request a new verification code.',
      };
    }

    this.db
      .prepare('UPDATE otp_challenges SET verified_at = ? WHERE id = ?')
      .run(now, challengeId);

    return {
      ok: true,
      phoneE164: row.phone_e164,
      countryCode: row.country_code,
      phoneNational: row.phone_national,
      purpose: row.purpose,
      userId: row.user_id,
    };
  }

  private createPersistentSession(
    userId: string,
    platform: string,
    deviceLabel: string
  ): { sessionId: string; sessionToken: string; expiresAt: number } {
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;
    const sessionId = makeId('ses');
    const sessionToken = crypto.randomBytes(36).toString('hex');
    const tokenHash = hashToken(sessionToken);

    this.db
      .prepare(
        `INSERT INTO user_sessions (id, user_id, token_hash, device_label, platform, created_at, last_used_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        sessionId,
        userId,
        tokenHash,
        (deviceLabel || 'Web Browser').slice(0, 64),
        (platform || 'browser').slice(0, 32),
        now,
        now,
        expiresAt
      );

    return { sessionId, sessionToken, expiresAt };
  }

  private generateUniqueUsername(fullName: string): string {
    const base = buildUsernameBase(fullName);
    const direct = `@${base}`;
    const taken = this.db
      .prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1')
      .get(direct);
    if (!taken) return direct;

    for (let i = 0; i < 12; i += 1) {
      const candidate = `@${base}_${crypto.randomInt(100, 9999)}`;
      const exists = this.db
        .prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1')
        .get(candidate);
      if (!exists) return candidate;
    }
    return `@${base}_${crypto.randomBytes(3).toString('hex')}`;
  }

  public completeRegistration(input: {
    challengeId: string;
    otpCode?: string;
    fullName: string;
    deviceId?: string;
    platform?: string;
  }):
    | { ok: true; user: PairingUserRecord; sessionToken: string; expiresAt: number }
    | { ok: false; statusCode: number; error: string } {
    const cleanName = String(input.fullName || '').trim().slice(0, 60);
    if (cleanName.length < 2) {
      return { ok: false, statusCode: 400, error: 'Please enter your full name (at least 2 characters).' };
    }

    const row = this.db
      .prepare('SELECT * FROM otp_challenges WHERE id = ?')
      .get(input.challengeId) as
      | {
          id: string;
          phone_e164: string;
          country_code: string;
          phone_national: string;
          purpose: OtpPurpose;
          expires_at: number;
          verified_at: number | null;
          consumed_at: number | null;
        }
      | undefined;

    if (!row || row.purpose !== 'register') {
      return { ok: false, statusCode: 400, error: 'Please verify your mobile phone number with OTP first.' };
    }

    if (row.consumed_at) {
      return { ok: false, statusCode: 400, error: 'This OTP challenge has already been completed.' };
    }

    if (row.expires_at <= Date.now()) {
      return { ok: false, statusCode: 410, error: 'Your OTP expired. Please request a fresh verification code.' };
    }

    if (!row.verified_at) {
      if (!input.otpCode) {
        return { ok: false, statusCode: 400, error: 'Enter and verify the 6-digit OTP sent to your phone.' };
      }
      const verifyRes = this.verifyOtpChallenge(input.challengeId, input.otpCode, 'register');
      if (!verifyRes.ok) {
        return verifyRes;
      }
    }

    const now = Date.now();
    const cleanDeviceId = (input.deviceId || `FC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`)
      .trim()
      .slice(0, 32);
    const cleanPlatform = (input.platform || 'Web Browser').trim().slice(0, 32);

    const tx = this.db.transaction(() => {
      const existing = this.getUserByPhone(row.phone_e164);
      if (existing) {
        return {
          ok: false as const,
          statusCode: 409,
          error: 'An account with this verified phone number already exists. Sign in with OTP to recover it.',
        };
      }

      let userId = makePermanentUserId();
      while (this.db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) {
        userId = makePermanentUserId();
      }

      const username = this.generateUniqueUsername(cleanName);
      const userCount = (
        this.db.prepare('SELECT COUNT(*) as count FROM users WHERE phone_verified = 1').get() as {
          count: number;
        }
      ).count;
      const role: 'user' | 'admin' = userCount === 0 ? 'admin' : 'user';

      const initialAccountKeyHash = hashToken(`${userId}:${crypto.randomBytes(16).toString('hex')}`);

      this.db
        .prepare(
          `INSERT INTO users
             (id, display_name, username, bio, status_note, avatar_data_url,
              country_code, phone_national, phone_e164, phone_verified, phone_verified_at,
              show_phone_to_peers, account_status, device_id, platform, role, session_token_hash, last_seen_at, created_at)
           VALUES (?, ?, ?, '', 'Available Offline', NULL, ?, ?, ?, 1, ?, 0, 'active', ?, ?, ?, ?, ?, ?)`
        )
        .run(
          userId,
          cleanName,
          username,
          row.country_code,
          row.phone_national,
          row.phone_e164,
          now,
          cleanDeviceId,
          cleanPlatform,
          role,
          initialAccountKeyHash,
          now,
          now
        );

      this.db
        .prepare('UPDATE otp_challenges SET consumed_at = ?, verified_at = COALESCE(verified_at, ?) WHERE id = ?')
        .run(now, now, row.id);

      const session = this.createPersistentSession(userId, cleanPlatform, cleanPlatform);

      this.logEvent(
        'account_created',
        null,
        userId,
        'info',
        `Permanent verified account ${userId} (${username}) created.`
      );

      return {
        ok: true as const,
        user: this.getUserById(userId)!,
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt,
      };
    });

    return tx();
  }

  public completeOtpLogin(input: {
    challengeId: string;
    otpCode?: string;
    deviceId?: string;
    platform?: string;
  }):
    | { ok: true; user: PairingUserRecord; sessionToken: string; expiresAt: number }
    | { ok: false; statusCode: number; error: string } {
    const row = this.db
      .prepare('SELECT * FROM otp_challenges WHERE id = ?')
      .get(input.challengeId) as
      | {
          id: string;
          phone_e164: string;
          purpose: OtpPurpose;
          expires_at: number;
          verified_at: number | null;
          consumed_at: number | null;
        }
      | undefined;

    if (!row || row.purpose !== 'login') {
      return { ok: false, statusCode: 400, error: 'Request an OTP code for your phone number first.' };
    }
    if (row.consumed_at) {
      return { ok: false, statusCode: 400, error: 'This OTP has already been used. Request a fresh OTP.' };
    }
    if (row.expires_at <= Date.now()) {
      return { ok: false, statusCode: 410, error: 'OTP expired. Request a new code to sign in.' };
    }

    if (!row.verified_at) {
      if (!input.otpCode) {
        return { ok: false, statusCode: 400, error: 'Enter the 6-digit verification OTP code.' };
      }
      const verifyRes = this.verifyOtpChallenge(input.challengeId, input.otpCode, 'login');
      if (!verifyRes.ok) return verifyRes;
    }

    const user = this.getUserByPhone(row.phone_e164);
    if (!user) {
      return { ok: false, statusCode: 404, error: 'No permanent account found for this phone number.' };
    }

    const now = Date.now();
    const cleanPlatform = (input.platform || user.platform || 'Web Browser').trim().slice(0, 32);

    const tx = this.db.transaction(() => {
      this.db
        .prepare('UPDATE otp_challenges SET consumed_at = ?, verified_at = COALESCE(verified_at, ?) WHERE id = ?')
        .run(now, now, row.id);

      this.db
        .prepare('UPDATE users SET last_seen_at = ?, platform = ? WHERE id = ?')
        .run(now, cleanPlatform, user.id);

      const session = this.createPersistentSession(user.id, cleanPlatform, cleanPlatform);

      this.logEvent(
        'account_recovered_login',
        null,
        user.id,
        'info',
        `Persistent session restored via Phone OTP for ${user.id} on ${cleanPlatform}.`
      );

      return {
        ok: true as const,
        user: this.getUserById(user.id)!,
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt,
      };
    });

    return tx();
  }

  public completeChangePhone(input: {
    userId: string;
    challengeId: string;
    otpCode?: string;
  }): { ok: true; user: PairingUserRecord } | { ok: false; statusCode: number; error: string } {
    const row = this.db
      .prepare('SELECT * FROM otp_challenges WHERE id = ?')
      .get(input.challengeId) as
      | {
          id: string;
          phone_e164: string;
          country_code: string;
          phone_national: string;
          purpose: OtpPurpose;
          user_id: string | null;
          expires_at: number;
          verified_at: number | null;
          consumed_at: number | null;
        }
      | undefined;

    if (!row || row.purpose !== 'change_phone' || row.user_id !== input.userId) {
      return { ok: false, statusCode: 400, error: 'Phone change OTP session is invalid.' };
    }
    if (row.consumed_at) {
      return { ok: false, statusCode: 400, error: 'This OTP has already been used.' };
    }
    if (row.expires_at <= Date.now()) {
      return { ok: false, statusCode: 410, error: 'OTP expired. Request a new code.' };
    }

    if (!row.verified_at) {
      if (!input.otpCode) {
        return { ok: false, statusCode: 400, error: 'Enter the 6-digit verification OTP code.' };
      }
      const verifyRes = this.verifyOtpChallenge(input.challengeId, input.otpCode, 'change_phone');
      if (!verifyRes.ok) return verifyRes;
    }

    const now = Date.now();
    const tx = this.db.transaction(() => {
      const conflict = this.getUserByPhone(row.phone_e164);
      if (conflict && conflict.id !== input.userId) {
        return {
          ok: false as const,
          statusCode: 409,
          error: 'This phone number is already linked to another account.',
        };
      }

      this.db
        .prepare(
          `UPDATE users
           SET country_code = ?, phone_national = ?, phone_e164 = ?, phone_verified = 1, phone_verified_at = ?, last_seen_at = ?
           WHERE id = ?`
        )
        .run(row.country_code, row.phone_national, row.phone_e164, now, now, input.userId);

      this.db
        .prepare('UPDATE otp_challenges SET consumed_at = ?, verified_at = COALESCE(verified_at, ?) WHERE id = ?')
        .run(now, now, row.id);

      this.logEvent(
        'phone_number_changed',
        null,
        input.userId,
        'info',
        `Verified phone number updated for account ${input.userId}.`
      );

      return { ok: true as const, user: this.getUserById(input.userId)! };
    });

    return tx();
  }

  public updateAuthenticatedProfile(
    userId: string,
    patch: {
      fullName?: string;
      displayName?: string;
      username?: string;
      bio?: string;
      statusNote?: string;
      avatarDataUrl?: string | null;
      showPhoneToPeers?: boolean;
      deviceId?: string;
      platform?: string;
    }
  ): { ok: true; user: PairingUserRecord } | { ok: false; statusCode: number; error: string } {
    const existing = this.getUserById(userId);
    if (!existing) {
      return { ok: false, statusCode: 404, error: 'User profile not found.' };
    }

    const nextName =
      typeof patch.fullName === 'string' || typeof patch.displayName === 'string'
        ? String(patch.fullName ?? patch.displayName).trim().slice(0, 60)
        : existing.displayName;
    if (nextName.length < 2) {
      return { ok: false, statusCode: 400, error: 'Full name must be at least 2 characters.' };
    }

    let nextUsername = existing.username;
    if (typeof patch.username === 'string' && patch.username.trim()) {
      const stripped = patch.username.trim().replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
      if (stripped.length < 3) {
        return { ok: false, statusCode: 400, error: 'Username must be at least 3 characters (letters, numbers, underscores).' };
      }
      const formatted = `@${stripped}`;
      const conflict = this.db
        .prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ? LIMIT 1')
        .get(formatted, userId) as { id: string } | undefined;
      if (conflict) {
        return { ok: false, statusCode: 409, error: `Username ${formatted} is already taken by another user.` };
      }
      nextUsername = formatted;
    }

    const nextBio = typeof patch.bio === 'string' ? patch.bio.trim().slice(0, 180) : existing.bio;
    const nextStatusNote =
      typeof patch.statusNote === 'string'
        ? patch.statusNote.trim().slice(0, 100) || 'Available Offline'
        : existing.statusNote;
    const nextAvatar =
      patch.avatarDataUrl === undefined
        ? existing.avatarDataUrl
        : patch.avatarDataUrl && patch.avatarDataUrl.length < 180_000
          ? patch.avatarDataUrl
          : null;
    const nextShowPhone =
      typeof patch.showPhoneToPeers === 'boolean'
        ? patch.showPhoneToPeers
        : existing.showPhoneToPeers;
    const nextDeviceId =
      typeof patch.deviceId === 'string' && patch.deviceId.trim()
        ? patch.deviceId.trim().slice(0, 32)
        : existing.deviceId;
    const nextPlatform =
      typeof patch.platform === 'string' && patch.platform.trim()
        ? patch.platform.trim().slice(0, 32)
        : existing.platform;

    this.db
      .prepare(
        `UPDATE users
         SET display_name = ?, username = ?, bio = ?, status_note = ?, avatar_data_url = ?,
             show_phone_to_peers = ?, device_id = ?, platform = ?, last_seen_at = ?
         WHERE id = ?`
      )
      .run(
        nextName,
        nextUsername,
        nextBio,
        nextStatusNote,
        nextAvatar,
        nextShowPhone ? 1 : 0,
        nextDeviceId,
        nextPlatform,
        Date.now(),
        userId
      );

    return { ok: true, user: this.getUserById(userId)! };
  }

  public revokeSessionByToken(rawToken: string | null | undefined): boolean {
    if (!rawToken) return false;
    const tokenHash = hashToken(rawToken);
    const res = this.db
      .prepare('UPDATE user_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .run(Date.now(), tokenHash);
    return res.changes > 0;
  }

  public deleteUserAccount(userId: string): { ok: boolean } {
    const existing = this.getUserById(userId);
    if (!existing) return { ok: false };

    const now = Date.now();
    const tx = this.db.transaction(() => {
      // Return any unused actively claimed pairing codes back to the available pool
      this.db
        .prepare(
          `UPDATE pairing_codes
           SET status = 'available', claimed_by_user_id = NULL, claimed_at = NULL, expires_at = NULL
           WHERE claimed_by_user_id = ? AND status = 'claimed'`
        )
        .run(userId);

      this.db.prepare('DELETE FROM otp_challenges WHERE user_id = ? OR phone_e164 = ?').run(userId, existing.phoneE164);
      this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);

      this.logEvent(
        'account_deleted',
        null,
        null,
        'warn',
        `Permanent account ${userId} (${existing.username}) was deleted by the owner.`
      );
    });

    tx();
    return { ok: true };
  }

  public getUserByToken(rawToken: string | null | undefined): PairingUserRecord | null {
    if (!rawToken) return null;
    const tokenHash = hashToken(rawToken);
    const now = Date.now();

    const sessionRow = this.db
      .prepare(
        `SELECT s.id as session_id, u.*
         FROM user_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
         LIMIT 1`
      )
      .get(tokenHash, now) as (Record<string, unknown> & { session_id: string }) | undefined;

    if (sessionRow) {
      this.db
        .prepare('UPDATE user_sessions SET last_used_at = ? WHERE id = ?')
        .run(now, sessionRow.session_id);
      return this.mapUserRow(sessionRow);
    }

    return null;
  }

  public getUserById(userId: string): PairingUserRecord | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(userId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapUserRow(row);
  }

  public touchUserLastSeen(userId: string): void {
    this.db
      .prepare('UPDATE users SET last_seen_at = ? WHERE id = ?')
      .run(Date.now(), userId);
  }

  public setUserRole(userId: string, role: 'user' | 'admin'): PairingUserRecord | null {
    this.db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
    return this.getUserById(userId);
  }

  private mapUserRow(row: Record<string, unknown>): PairingUserRecord {
    return {
      id: String(row.id),
      displayName: String(row.display_name),
      username: String(row.username),
      bio: String(row.bio ?? ''),
      statusNote: String(row.status_note ?? 'Available Offline'),
      avatarDataUrl: (row.avatar_data_url as string | null) ?? null,
      countryCode: String(row.country_code ?? ''),
      phoneNational: String(row.phone_national ?? ''),
      phoneE164: String(row.phone_e164 ?? ''),
      phoneVerified: Boolean(row.phone_verified),
      phoneVerifiedAt: row.phone_verified_at ? Number(row.phone_verified_at) : null,
      showPhoneToPeers: Boolean(row.show_phone_to_peers),
      accountStatus: row.account_status === 'suspended' ? 'suspended' : 'active',
      deviceId: String(row.device_id),
      platform: String(row.platform ?? 'browser'),
      role: row.role === 'admin' ? 'admin' : 'user',
      lastSeenAt: Number(row.last_seen_at),
      createdAt: Number(row.created_at),
    };
  }

  public toAuthenticatedProfile(user: PairingUserRecord): AuthenticatedUserProfile {
    return {
      id: user.id,
      fullName: user.displayName,
      displayName: user.displayName,
      username: user.username,
      bio: user.bio,
      statusNote: user.statusNote,
      avatarDataUrl: user.avatarDataUrl,
      countryCode: user.countryCode,
      phoneNational: user.phoneNational,
      phoneE164: user.phoneE164,
      phoneVerified: user.phoneVerified,
      phoneVerifiedAt: user.phoneVerifiedAt,
      showPhoneToPeers: user.showPhoneToPeers,
      accountStatus: user.accountStatus,
      deviceId: user.deviceId,
      platform: user.platform,
      role: user.role,
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
    };
  }

  public toPublicProfile(
    user: PairingUserRecord,
    onlineUserIds: Set<string>
  ): PairingPublicProfile {
    return {
      id: user.id,
      displayName: user.displayName,
      username: user.username,
      bio: user.bio,
      avatarDataUrl: user.avatarDataUrl,
      deviceId: user.deviceId,
      platform: user.platform,
      phoneVerified: user.phoneVerified,
      // Strict privacy: never reveal full phone number unless owner explicitly permits it
      publicPhone: user.showPhoneToPeers && user.phoneE164 ? user.phoneE164 : null,
      online: onlineUserIds.has(user.id),
      lastSeenAt: user.lastSeenAt,
    };
  }

  public getMyActiveClaim(userId: string): ActiveClaimInfo | null {
    this.sweepExpiredCodes();
    const row = this.db
      .prepare(
        `SELECT code, status, claimed_at, expires_at FROM pairing_codes
         WHERE claimed_by_user_id = ? AND status = 'claimed'
         ORDER BY claimed_at DESC LIMIT 1`
      )
      .get(userId) as
      | { code: string; status: CodeStatus; claimed_at: number; expires_at: number }
      | undefined;

    if (!row) return null;
    return {
      code: row.code,
      claimedAt: row.claimed_at,
      expiresAt: row.expires_at,
      status: row.status,
    };
  }

  /**
   * Returns a curated random slice of codes (NEVER exposes the complete database).
   * Shows real Available codes + up to 3 real currently Taken codes for clear live status.
   */
  public getCuratedPool(
    userId: string,
    limit = 15
  ): { cards: PoolCodeCard[]; totalAvailableCount: number; myClaim: ActiveClaimInfo | null } {
    this.sweepExpiredCodes();
    const capped = Math.max(6, Math.min(20, limit));

    const totalAvailableCount = (
      this.db
        .prepare(`SELECT COUNT(*) as count FROM pairing_codes WHERE status = 'available'`)
        .get() as { count: number }
    ).count;

    // Auto-replenish if available pool drops below 200
    if (totalAvailableCount < 200) {
      this.generateAdditionalCodes(1000);
    }

    const takenRows = this.db
      .prepare(
        `SELECT code, claimed_by_user_id, expires_at FROM pairing_codes
         WHERE status = 'claimed'
         ORDER BY claimed_at DESC LIMIT 3`
      )
      .all() as Array<{ code: string; claimed_by_user_id: string | null; expires_at: number | null }>;

    const availableNeeded = Math.max(4, capped - takenRows.length);
    const availableRows = this.db
      .prepare(
        `SELECT code FROM pairing_codes
         WHERE status = 'available'
         ORDER BY RANDOM() LIMIT ?`
      )
      .all(availableNeeded) as Array<{ code: string }>;

    const cards: PoolCodeCard[] = [
      ...takenRows.map((r) => ({
        code: r.code,
        status: 'taken' as const,
        expiresAt: r.expires_at,
        isMine: r.claimed_by_user_id === userId,
      })),
      ...availableRows.map((r) => ({
        code: r.code,
        status: 'available' as const,
        expiresAt: null,
        isMine: false,
      })),
    ];

    // Deterministic-free shuffle so taken cards aren't always clustered at index 0
    for (let i = cards.length - 1; i > 0; i -= 1) {
      const j = crypto.randomInt(0, i + 1);
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }

    return {
      cards,
      totalAvailableCount,
      myClaim: this.getMyActiveClaim(userId),
    };
  }

  /**
   * Atomically claims an available code from the pre-generated database for `userId`.
   * Prevents duplicate simultaneous claims and releases any prior unused claim held by `userId`.
   */
  public claimCode(
    userId: string,
    rawCode: string
  ): { ok: true; claim: ActiveClaimInfo } | { ok: false; error: string } {
    const code = normalizeCode(rawCode);
    if (code.length !== 6) {
      return { ok: false, error: 'Pairing code must be a valid 6-digit code from the available pool.' };
    }

    this.sweepExpiredCodes();
    const now = Date.now();
    const expiresAt = now + CODE_TTL_MS;

    const tx = this.db.transaction(() => {
      const target = this.db
        .prepare('SELECT code, status, claimed_by_user_id FROM pairing_codes WHERE code = ?')
        .get(code) as
        | { code: string; status: CodeStatus; claimed_by_user_id: string | null }
        | undefined;

      if (!target) {
        this.logEvent('claim_invalid', code, userId, 'warn', `Attempted to claim non-existent code ${code}.`);
        return { ok: false as const, error: 'This code does not exist in the backend code pool.' };
      }

      if (target.status === 'disabled') {
        this.logEvent('claim_disabled', code, userId, 'warn', `Attempted to claim disabled code ${code}.`);
        return { ok: false as const, error: 'This code has been disabled by an administrator.' };
      }

      if (target.status === 'used') {
        return { ok: false as const, error: 'This code has already been used for a pairing.' };
      }

      if (target.status === 'claimed' && target.claimed_by_user_id !== userId) {
        return {
          ok: false as const,
          error: 'Code already taken by another user. Please pick another available code.',
        };
      }

      if (target.status !== 'available' && target.claimed_by_user_id !== userId) {
        return { ok: false as const, error: 'Code is not currently available.' };
      }

      // Release any other unused code previously claimed by this user back to the available pool
      const prevCodes = this.db
        .prepare(
          `SELECT code FROM pairing_codes
           WHERE claimed_by_user_id = ? AND status = 'claimed' AND code != ?`
        )
        .all(userId, code) as Array<{ code: string }>;

      for (const prev of prevCodes) {
        this.db
          .prepare(
            `UPDATE connection_requests SET status = 'cancelled', responded_at = ?
             WHERE code = ? AND status = 'pending'`
          )
          .run(now, prev.code);
      }

      this.db
        .prepare(
          `UPDATE pairing_codes
           SET status = 'available', claimed_by_user_id = NULL, claimed_at = NULL, expires_at = NULL
           WHERE claimed_by_user_id = ? AND status = 'claimed' AND code != ?`
        )
        .run(userId, code);

      // Atomic conditional update guarantees zero race condition between two simultaneous claimers
      const updateRes = this.db
        .prepare(
          `UPDATE pairing_codes
           SET status = 'claimed',
               claimed_by_user_id = ?,
               claimed_at = ?,
               expires_at = ?,
               expired_at = NULL
           WHERE code = ? AND (status = 'available' OR (status = 'claimed' AND claimed_by_user_id = ?))`
        )
        .run(userId, now, expiresAt, code, userId);

      if (updateRes.changes === 0) {
        return {
          ok: false as const,
          error: 'Code was just claimed by another user. Refresh and select a different code.',
        };
      }

      this.logEvent('code_claimed', code, userId, 'info', `User claimed pairing code ${code} (10m expiry).`);

      return {
        ok: true as const,
        claim: {
          code,
          claimedAt: now,
          expiresAt,
          status: 'claimed' as const,
        },
      };
    });

    return tx();
  }

  public cancelActiveCode(userId: string): { releasedCode: string | null } {
    this.sweepExpiredCodes();
    const now = Date.now();

    const tx = this.db.transaction(() => {
      const current = this.db
        .prepare(
          `SELECT code FROM pairing_codes WHERE claimed_by_user_id = ? AND status = 'claimed' LIMIT 1`
        )
        .get(userId) as { code: string } | undefined;

      if (!current) {
        return { releasedCode: null };
      }

      this.db
        .prepare(
          `UPDATE connection_requests
           SET status = 'cancelled', responded_at = ?
           WHERE code = ? AND status = 'pending'`
        )
        .run(now, current.code);

      this.db
        .prepare(
          `UPDATE pairing_codes
           SET status = 'available', claimed_by_user_id = NULL, claimed_at = NULL, expires_at = NULL
           WHERE code = ? AND claimed_by_user_id = ? AND status = 'claimed'`
        )
        .run(current.code, userId);

      this.logEvent(
        'code_cancelled',
        current.code,
        userId,
        'info',
        `User cancelled code ${current.code} and released it back to the available pool.`
      );

      return { releasedCode: current.code };
    });

    return tx();
  }

  public verifyCode(
    rawCode: string,
    requesterUserId: string,
    onlineUserIds: Set<string>
  ): {
    verdict: VerifyVerdict;
    message: string;
    code: string;
    owner?: PairingPublicProfile;
    expiresAt?: number;
  } {
    const code = normalizeCode(rawCode);
    this.sweepExpiredCodes();

    if (code.length !== 6) {
      this.logEvent('verify_invalid', code || rawCode, requesterUserId, 'warn', 'Verification rejected: non-6-digit format.');
      return {
        verdict: 'invalid',
        code,
        message: 'Invalid Code. Please enter the exact 6-digit numeric pairing code.',
      };
    }

    const row = this.db
      .prepare('SELECT * FROM pairing_codes WHERE code = ?')
      .get(code) as
      | {
          code: string;
          status: CodeStatus;
          claimed_by_user_id: string | null;
          expires_at: number | null;
          disabled_reason: string | null;
        }
      | undefined;

    if (!row) {
      this.logEvent('verify_invalid', code, requesterUserId, 'warn', `Invalid code entered: ${code}`);
      return {
        verdict: 'invalid',
        code,
        message: 'Invalid Code. That 6-digit pairing code does not exist in our database.',
      };
    }

    if (row.status === 'disabled') {
      this.logEvent('verify_disabled', code, requesterUserId, 'warn', `Disabled code attempted: ${code}`);
      return {
        verdict: 'invalid',
        code,
        message: 'Invalid Code. This pairing code has been disabled by security controls.',
      };
    }

    if (row.status === 'used') {
      this.logEvent('verify_used', code, requesterUserId, 'warn', `Already-used code attempted: ${code}`);
      return {
        verdict: 'already_used',
        code,
        message: 'Code Already Used. Each pairing code can only be used for one successful connection.',
      };
    }

    if (row.status === 'expired' || (row.expires_at !== null && row.expires_at <= Date.now())) {
      this.logEvent('verify_expired', code, requesterUserId, 'warn', `Expired code attempted: ${code}`);
      return {
        verdict: 'expired',
        code,
        message: 'Code Expired. Pairing codes expire after 10 minutes — ask the user to select a fresh code.',
      };
    }

    if (row.status === 'available' || !row.claimed_by_user_id) {
      this.logEvent('verify_unclaimed', code, requesterUserId, 'info', `Unclaimed code checked: ${code}`);
      return {
        verdict: 'user_not_available',
        code,
        message: 'User Not Available. No active user is currently holding this connection code.',
      };
    }

    if (row.claimed_by_user_id === requesterUserId) {
      return {
        verdict: 'user_not_available',
        code,
        message: 'User Not Available. You cannot send a connection request to your own connection code.',
      };
    }

    const owner = this.getUserById(row.claimed_by_user_id);
    if (!owner) {
      return {
        verdict: 'user_not_available',
        code,
        message: 'User Not Available. The account associated with this code is no longer active.',
      };
    }

    // Consider user available if connected via WebSocket OR active within the last 5 minutes
    const recentlySeen = Date.now() - owner.lastSeenAt <= 5 * 60 * 1000;
    const isOnline = onlineUserIds.has(owner.id);
    if (!isOnline && !recentlySeen) {
      this.logEvent(
        'verify_owner_offline',
        code,
        requesterUserId,
        'warn',
        `Owner ${owner.username} offline for code ${code}.`
      );
      return {
        verdict: 'user_not_available',
        code,
        message: 'User Not Available. The user who claimed this code appears to be offline.',
      };
    }

    return {
      verdict: 'valid',
      code,
      message: 'Valid Code. Review the user profile below and send a connection request.',
      owner: this.toPublicProfile(owner, onlineUserIds),
      expiresAt: row.expires_at ?? undefined,
    };
  }

  public createConnectionRequest(
    fromUserId: string,
    rawCode: string,
    onlineUserIds: Set<string>
  ):
    | { ok: true; request: ConnectionRequestItem; targetUserId: string }
    | { ok: false; verdict?: VerifyVerdict; error: string } {
    const verification = this.verifyCode(rawCode, fromUserId, onlineUserIds);
    if (verification.verdict !== 'valid' || !verification.owner) {
      return {
        ok: false,
        verdict: verification.verdict,
        error: verification.message,
      };
    }

    const targetUserId = verification.owner.id;
    const code = verification.code;
    const now = Date.now();

    const tx = this.db.transaction(() => {
      const existingPending = this.db
        .prepare(
          `SELECT id, created_at FROM connection_requests
           WHERE code = ? AND from_user_id = ? AND to_user_id = ? AND status = 'pending'
           LIMIT 1`
        )
        .get(code, fromUserId, targetUserId) as { id: string; created_at: number } | undefined;

      if (existingPending) {
        return {
          id: existingPending.id,
          createdAt: existingPending.created_at,
        };
      }

      const id = makeId('req');
      this.db
        .prepare(
          `INSERT INTO connection_requests (id, code, from_user_id, to_user_id, status, created_at)
           VALUES (?, ?, ?, ?, 'pending', ?)`
        )
        .run(id, code, fromUserId, targetUserId, now);

      this.logEvent(
        'request_sent',
        code,
        fromUserId,
        'info',
        `Connection request sent for code ${code}.`
      );

      return { id, createdAt: now };
    });

    const created = tx();

    return {
      ok: true,
      targetUserId,
      request: {
        id: created.id,
        code,
        status: 'pending',
        createdAt: created.createdAt,
        respondedAt: null,
        direction: 'outgoing',
        peer: verification.owner,
        roomId: null,
      },
    };
  }

  public respondToConnectionRequest(
    requestId: string,
    actingUserId: string,
    accept: boolean,
    onlineUserIds: Set<string>
  ):
    | {
        ok: true;
        status: 'accepted' | 'rejected';
        code: string;
        fromUserId: string;
        toUserId: string;
        room?: PrivateRoomSummary;
      }
    | { ok: false; error: string } {
    this.sweepExpiredCodes();
    const now = Date.now();

    const tx = this.db.transaction(() => {
      const reqRow = this.db
        .prepare('SELECT * FROM connection_requests WHERE id = ?')
        .get(requestId) as
        | {
            id: string;
            code: string;
            from_user_id: string;
            to_user_id: string;
            status: string;
          }
        | undefined;

      if (!reqRow) {
        return { ok: false as const, error: 'Connection request not found.' };
      }

      if (reqRow.to_user_id !== actingUserId) {
        this.logEvent(
          'unauthorized_respond',
          reqRow.code,
          actingUserId,
          'error',
          `Unauthorized attempt to respond to request ${requestId}.`
        );
        return { ok: false as const, error: 'Only the code owner can accept or reject this request.' };
      }

      if (reqRow.status !== 'pending') {
        return { ok: false as const, error: `This request has already been ${reqRow.status}.` };
      }

      if (!accept) {
        this.db
          .prepare(
            `UPDATE connection_requests SET status = 'rejected', responded_at = ? WHERE id = ?`
          )
          .run(now, requestId);

        this.logEvent(
          'request_rejected',
          reqRow.code,
          actingUserId,
          'info',
          `Connection request ${requestId} rejected by code owner.`
        );

        return {
          ok: true as const,
          status: 'rejected' as const,
          code: reqRow.code,
          fromUserId: reqRow.from_user_id,
          toUserId: reqRow.to_user_id,
        };
      }

      // Atomic verification that the code is still actively claimed by actingUserId & not yet used/expired
      const codeRow = this.db
        .prepare(
          `SELECT code, status, claimed_by_user_id, expires_at FROM pairing_codes WHERE code = ?`
        )
        .get(reqRow.code) as
        | {
            code: string;
            status: CodeStatus;
            claimed_by_user_id: string | null;
            expires_at: number | null;
          }
        | undefined;

      if (
        !codeRow ||
        codeRow.status !== 'claimed' ||
        codeRow.claimed_by_user_id !== actingUserId ||
        (codeRow.expires_at !== null && codeRow.expires_at <= now)
      ) {
        this.db
          .prepare(
            `UPDATE connection_requests SET status = 'expired', responded_at = ? WHERE id = ?`
          )
          .run(now, requestId);
        return {
          ok: false as const,
          error: 'Pairing code expired or is no longer active. Select a new code to pair.',
        };
      }

      // Consume the code permanently (single successful pairing only!)
      const consumeRes = this.db
        .prepare(
          `UPDATE pairing_codes
           SET status = 'used', used_at = ?, used_by_user_id = ?
           WHERE code = ? AND status = 'claimed' AND claimed_by_user_id = ?`
        )
        .run(now, reqRow.from_user_id, reqRow.code, actingUserId);

      if (consumeRes.changes === 0) {
        return {
          ok: false as const,
          error: 'This code was already consumed by another pairing.',
        };
      }

      // Reject any other competing pending requests on the same single-use code
      this.db
        .prepare(
          `UPDATE connection_requests
           SET status = 'expired', responded_at = ?
           WHERE code = ? AND id != ? AND status = 'pending'`
        )
        .run(now, reqRow.code, requestId);

      const roomId = makeId('room');
      this.db
        .prepare(
          `INSERT INTO private_rooms (id, code, user_a_id, user_b_id, status, created_at)
           VALUES (?, ?, ?, ?, 'active', ?)`
        )
        .run(roomId, reqRow.code, actingUserId, reqRow.from_user_id, now);

      this.db
        .prepare(
          `UPDATE connection_requests
           SET status = 'accepted', room_id = ?, responded_at = ?
           WHERE id = ?`
        )
        .run(roomId, now, requestId);

      this.logEvent(
        'pairing_connected',
        reqRow.code,
        actingUserId,
        'info',
        `Private room ${roomId} created via single-use code ${reqRow.code}.`
      );

      return {
        ok: true as const,
        status: 'accepted' as const,
        code: reqRow.code,
        fromUserId: reqRow.from_user_id,
        toUserId: reqRow.to_user_id,
        roomId,
      };
    });

    const result = tx();
    if (!result.ok) return result;

    if (result.status === 'accepted' && result.roomId) {
      const room = this.getRoomSummaryForUser(result.roomId, actingUserId, onlineUserIds);
      return {
        ok: true,
        status: 'accepted',
        code: result.code,
        fromUserId: result.fromUserId,
        toUserId: result.toUserId,
        room: room ?? undefined,
      };
    }

    return {
      ok: true,
      status: 'rejected',
      code: result.code,
      fromUserId: result.fromUserId,
      toUserId: result.toUserId,
    };
  }

  public listRequestsForUser(
    userId: string,
    onlineUserIds: Set<string>
  ): ConnectionRequestItem[] {
    this.sweepExpiredCodes();
    const rows = this.db
      .prepare(
        `SELECT * FROM connection_requests
         WHERE to_user_id = ? OR from_user_id = ?
         ORDER BY created_at DESC LIMIT 30`
      )
      .all(userId, userId) as Array<{
      id: string;
      code: string;
      from_user_id: string;
      to_user_id: string;
      status: ConnectionRequestItem['status'];
      room_id: string | null;
      created_at: number;
      responded_at: number | null;
    }>;

    const result: ConnectionRequestItem[] = [];
    for (const r of rows) {
      const incoming = r.to_user_id === userId;
      const peerUser = this.getUserById(incoming ? r.from_user_id : r.to_user_id);
      if (!peerUser) continue;
      result.push({
        id: r.id,
        code: r.code,
        status: r.status,
        createdAt: r.created_at,
        respondedAt: r.responded_at,
        direction: incoming ? 'incoming' : 'outgoing',
        peer: this.toPublicProfile(peerUser, onlineUserIds),
        roomId: r.room_id,
      });
    }
    return result;
  }

  public getRoomSummaryForUser(
    roomId: string,
    userId: string,
    onlineUserIds: Set<string>
  ): PrivateRoomSummary | null {
    const row = this.db
      .prepare('SELECT * FROM private_rooms WHERE id = ?')
      .get(roomId) as
      | {
          id: string;
          code: string;
          user_a_id: string;
          user_b_id: string;
          status: 'active' | 'disconnected';
          created_at: number;
          disconnected_at: number | null;
          disconnected_by: string | null;
        }
      | undefined;

    if (!row) return null;
    if (row.user_a_id !== userId && row.user_b_id !== userId) {
      return null;
    }

    const peerId = row.user_a_id === userId ? row.user_b_id : row.user_a_id;
    const peerUser = this.getUserById(peerId);
    if (!peerUser) return null;

    const lastMsg = this.db
      .prepare(
        `SELECT text, created_at FROM room_messages
         WHERE room_id = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(roomId) as { text: string; created_at: number } | undefined;

    const unreadRow = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM room_messages
         WHERE room_id = ? AND sender_id != ? AND delivery_status != 'delivered'`
      )
      .get(roomId, userId) as { count: number };

    return {
      id: row.id,
      code: row.code,
      status: row.status,
      createdAt: row.created_at,
      disconnectedAt: row.disconnected_at,
      disconnectedBy: row.disconnected_by,
      peer: this.toPublicProfile(peerUser, onlineUserIds),
      lastMessageText: lastMsg?.text ?? null,
      lastMessageAt: lastMsg?.created_at ?? null,
      unreadCount: unreadRow.count,
    };
  }

  public listRoomsForUser(
    userId: string,
    onlineUserIds: Set<string>
  ): PrivateRoomSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id FROM private_rooms
         WHERE user_a_id = ? OR user_b_id = ?
         ORDER BY created_at DESC LIMIT 50`
      )
      .all(userId, userId) as Array<{ id: string }>;

    const rooms: PrivateRoomSummary[] = [];
    for (const r of rows) {
      const summary = this.getRoomSummaryForUser(r.id, userId, onlineUserIds);
      if (summary) rooms.push(summary);
    }
    return rooms;
  }

  public getRoomParticipants(roomId: string): { userAId: string; userBId: string; status: string } | null {
    const row = this.db
      .prepare('SELECT user_a_id, user_b_id, status FROM private_rooms WHERE id = ?')
      .get(roomId) as { user_a_id: string; user_b_id: string; status: string } | undefined;
    if (!row) return null;
    return { userAId: row.user_a_id, userBId: row.user_b_id, status: row.status };
  }

  public getRoomMessages(
    roomId: string,
    userId: string
  ): { ok: true; messages: PrivateRoomMessage[] } | { ok: false; statusCode: number; error: string } {
    const room = this.getRoomParticipants(roomId);
    if (!room) {
      return { ok: false, statusCode: 404, error: 'Private room not found.' };
    }
    if (room.userAId !== userId && room.userBId !== userId) {
      this.logEvent(
        'unauthorized_room_access',
        null,
        userId,
        'error',
        `Blocked unauthorized read attempt on private room ${roomId}.`
      );
      return { ok: false, statusCode: 403, error: 'Access denied to this private conversation.' };
    }

    const rows = this.db
      .prepare(
        `SELECT id, room_id, sender_id, text, delivery_status, created_at, delivered_at
         FROM room_messages
         WHERE room_id = ?
         ORDER BY created_at ASC LIMIT 300`
      )
      .all(roomId) as Array<{
      id: string;
      room_id: string;
      sender_id: string;
      text: string;
      delivery_status: 'sent' | 'delivered';
      created_at: number;
      delivered_at: number | null;
    }>;

    return {
      ok: true,
      messages: rows.map((m) => ({
        id: m.id,
        roomId: m.room_id,
        senderId: m.sender_id,
        text: m.text,
        deliveryStatus: m.delivery_status,
        createdAt: m.created_at,
        deliveredAt: m.delivered_at,
      })),
    };
  }

  public sendRoomMessage(
    roomId: string,
    senderId: string,
    rawText: string,
    peerOnline: boolean
  ):
    | { ok: true; message: PrivateRoomMessage; peerUserId: string }
    | { ok: false; statusCode: number; error: string } {
    const room = this.getRoomParticipants(roomId);
    if (!room) {
      return { ok: false, statusCode: 404, error: 'Private room not found.' };
    }
    if (room.userAId !== senderId && room.userBId !== senderId) {
      this.logEvent(
        'unauthorized_room_write',
        null,
        senderId,
        'error',
        `Blocked unauthorized message attempt into private room ${roomId}.`
      );
      return { ok: false, statusCode: 403, error: 'Access denied to this private conversation.' };
    }
    if (room.status !== 'active') {
      return { ok: false, statusCode: 409, error: 'This private connection has been disconnected.' };
    }

    const text = rawText.trim().slice(0, 2000);
    if (!text) {
      return { ok: false, statusCode: 400, error: 'Message cannot be empty.' };
    }

    const now = Date.now();
    const id = makeId('msg');
    const deliveryStatus: 'sent' | 'delivered' = peerOnline ? 'delivered' : 'sent';
    const deliveredAt = peerOnline ? now : null;

    this.db
      .prepare(
        `INSERT INTO room_messages (id, room_id, sender_id, text, delivery_status, created_at, delivered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, roomId, senderId, text, deliveryStatus, now, deliveredAt);

    const peerUserId = room.userAId === senderId ? room.userBId : room.userAId;

    return {
      ok: true,
      peerUserId,
      message: {
        id,
        roomId,
        senderId,
        text,
        deliveryStatus,
        createdAt: now,
        deliveredAt,
      },
    };
  }

  public markRoomMessagesDelivered(roomId: string, readerUserId: string): string[] {
    const room = this.getRoomParticipants(roomId);
    if (!room) return [];
    if (room.userAId !== readerUserId && room.userBId !== readerUserId) return [];

    const pending = this.db
      .prepare(
        `SELECT id FROM room_messages
         WHERE room_id = ? AND sender_id != ? AND delivery_status != 'delivered'`
      )
      .all(roomId, readerUserId) as Array<{ id: string }>;

    if (pending.length === 0) return [];

    const now = Date.now();
    this.db
      .prepare(
        `UPDATE room_messages
         SET delivery_status = 'delivered', delivered_at = ?
         WHERE room_id = ? AND sender_id != ? AND delivery_status != 'delivered'`
      )
      .run(now, roomId, readerUserId);

    return pending.map((p) => p.id);
  }

  public disconnectRoom(
    roomId: string,
    userId: string
  ): { ok: true; peerUserId: string } | { ok: false; statusCode: number; error: string } {
    const room = this.getRoomParticipants(roomId);
    if (!room) {
      return { ok: false, statusCode: 404, error: 'Private room not found.' };
    }
    if (room.userAId !== userId && room.userBId !== userId) {
      return { ok: false, statusCode: 403, error: 'Access denied.' };
    }

    const now = Date.now();
    this.db
      .prepare(
        `UPDATE private_rooms
         SET status = 'disconnected', disconnected_at = ?, disconnected_by = ?
         WHERE id = ?`
      )
      .run(now, userId, roomId);

    this.logEvent('room_disconnected', null, userId, 'info', `Private room ${roomId} disconnected.`);

    return {
      ok: true,
      peerUserId: room.userAId === userId ? room.userBId : room.userAId,
    };
  }

  // --- ADMIN CONTROL CENTER METHODS ---

  public getAdminStats(): AdminStatsSummary {
    this.sweepExpiredCodes();
    const codeCounts = this.db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available,
           SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) as claimed,
           SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired,
           SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) as used,
           SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END) as disabled,
           COALESCE(SUM(times_expired), 0) as total_expired_events
         FROM pairing_codes`
      )
      .get() as Record<string, number>;

    const activeConnections = (
      this.db
        .prepare(`SELECT COUNT(*) as count FROM private_rooms WHERE status = 'active'`)
        .get() as { count: number }
    ).count;

    const pendingRequests = (
      this.db
        .prepare(`SELECT COUNT(*) as count FROM connection_requests WHERE status = 'pending'`)
        .get() as { count: number }
    ).count;

    const registeredUsers = (
      this.db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }
    ).count;

    return {
      totalGenerated: Number(codeCounts.total ?? 0),
      availableCodes: Number(codeCounts.available ?? 0),
      claimedCodes: Number(codeCounts.claimed ?? 0),
      expiredCodes: Number(codeCounts.expired ?? 0),
      totalExpiredEvents: Number(codeCounts.total_expired_events ?? 0),
      usedCodes: Number(codeCounts.used ?? 0),
      disabledCodes: Number(codeCounts.disabled ?? 0),
      activeConnections,
      pendingRequests,
      registeredUsers,
    };
  }

  public getAdminCodeList(
    statusFilter: CodeStatus | 'all',
    searchQuery: string,
    limit = 40
  ): AdminCodeRow[] {
    this.sweepExpiredCodes();
    const capped = Math.max(5, Math.min(100, limit));
    const cleanSearch = normalizeCode(searchQuery);

    let sql = `
      SELECT pc.code, pc.status, pc.claimed_at, pc.expires_at, pc.used_at,
             pc.disabled_reason, pc.times_expired,
             u.username as claimed_by_username, u.display_name as claimed_by_name
      FROM pairing_codes pc
      LEFT JOIN users u ON pc.claimed_by_user_id = u.id
      WHERE 1=1
    `;
    const params: Array<string | number> = [];

    if (statusFilter !== 'all') {
      sql += ` AND pc.status = ?`;
      params.push(statusFilter);
    } else if (!cleanSearch) {
      // Prioritize interesting/active codes first rather than dumping thousands of untouched rows
      sql += ` ORDER BY CASE pc.status
        WHEN 'claimed' THEN 1
        WHEN 'expired' THEN 2
        WHEN 'disabled' THEN 3
        WHEN 'used' THEN 4
        ELSE 5 END, pc.claimed_at DESC, pc.created_at DESC LIMIT ?`;
      params.push(capped);
    }

    if (cleanSearch) {
      sql += ` AND pc.code LIKE ?`;
      params.push(`%${cleanSearch}%`);
    }

    if (statusFilter !== 'all' || cleanSearch) {
      sql += ` ORDER BY COALESCE(pc.claimed_at, pc.used_at, pc.created_at) DESC LIMIT ?`;
      params.push(capped);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      code: String(r.code),
      status: r.status as CodeStatus,
      claimedByUsername: (r.claimed_by_username as string | null) ?? null,
      claimedByName: (r.claimed_by_name as string | null) ?? null,
      claimedAt: r.claimed_at ? Number(r.claimed_at) : null,
      expiresAt: r.expires_at ? Number(r.expires_at) : null,
      usedAt: r.used_at ? Number(r.used_at) : null,
      disabledReason: (r.disabled_reason as string | null) ?? null,
      timesExpired: Number(r.times_expired ?? 0),
    }));
  }

  public disableCode(
    rawCode: string,
    reason: string,
    adminUserId: string
  ): { ok: true; code: string } | { ok: false; error: string } {
    const code = normalizeCode(rawCode);
    if (code.length !== 6) {
      return { ok: false, error: 'Provide a valid 6-digit code to disable.' };
    }

    const cleanReason = (reason || 'Disabled by administrator as suspicious').trim().slice(0, 180);
    const now = Date.now();

    const tx = this.db.transaction(() => {
      const existing = this.db
        .prepare('SELECT code, status FROM pairing_codes WHERE code = ?')
        .get(code) as { code: string; status: CodeStatus } | undefined;

      if (!existing) {
        return { ok: false as const, error: `Code ${code} was not found in the database.` };
      }

      this.db
        .prepare(
          `UPDATE pairing_codes
           SET status = 'disabled',
               disabled_reason = ?,
               claimed_by_user_id = NULL,
               expires_at = NULL
           WHERE code = ?`
        )
        .run(cleanReason, code);

      this.db
        .prepare(
          `UPDATE connection_requests
           SET status = 'cancelled', responded_at = ?
           WHERE code = ? AND status = 'pending'`
        )
        .run(now, code);

      this.logEvent(
        'code_disabled',
        code,
        adminUserId,
        'warn',
        `Admin disabled code ${code}: ${cleanReason}`
      );

      return { ok: true as const, code };
    });

    return tx();
  }

  public getAdminConnections(limit = 30): AdminConnectionRow[] {
    const rows = this.db
      .prepare(
        `SELECT pr.id as room_id, pr.code, pr.status, pr.created_at,
                ua.display_name as user_a_name, ua.username as user_a_username,
                ub.display_name as user_b_name, ub.username as user_b_username,
                (SELECT COUNT(*) FROM room_messages rm WHERE rm.room_id = pr.id) as message_count
         FROM private_rooms pr
         JOIN users ua ON pr.user_a_id = ua.id
         JOIN users ub ON pr.user_b_id = ub.id
         ORDER BY pr.created_at DESC
         LIMIT ?`
      )
      .all(Math.max(5, Math.min(100, limit))) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      roomId: String(r.room_id),
      code: String(r.code),
      status: r.status === 'active' ? 'active' : 'disconnected',
      userAName: String(r.user_a_name),
      userAUsername: String(r.user_a_username),
      userBName: String(r.user_b_name),
      userBUsername: String(r.user_b_username),
      createdAt: Number(r.created_at),
      messageCount: Number(r.message_count ?? 0),
    }));
  }

  public getRecentEvents(limit = 40): PairingEventRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, event_type, code, user_id, severity, message, created_at
         FROM pairing_events
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(Math.max(5, Math.min(150, limit))) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: Number(r.id),
      eventType: String(r.event_type),
      code: (r.code as string | null) ?? null,
      userId: (r.user_id as string | null) ?? null,
      severity: (r.severity as 'info' | 'warn' | 'error') ?? 'info',
      message: String(r.message),
      createdAt: Number(r.created_at),
    }));
  }

  public exportUserAccountData(
    userId: string,
    onlineUserIds: Set<string>
  ): {
    exportedAt: string;
    user: AuthenticatedUserProfile;
    myClaim: ActiveClaimInfo | null;
    requests: ConnectionRequestItem[];
    rooms: Array<PrivateRoomSummary & { messages: PrivateRoomMessage[] }>;
  } | null {
    const user = this.getUserById(userId);
    if (!user) return null;

    const myClaim = this.getMyActiveClaim(userId);
    const requests = this.listRequestsForUser(userId, onlineUserIds);
    const rooms = this.listRoomsForUser(userId, onlineUserIds);

    const roomsWithMessages = rooms.map((room) => {
      const msgResult = this.getRoomMessages(room.id, userId);
      return {
        ...room,
        messages: msgResult.ok ? msgResult.messages : [],
      };
    });

    return {
      exportedAt: new Date().toISOString(),
      user: this.toAuthenticatedProfile(user),
      myClaim,
      requests,
      rooms: roomsWithMessages,
    };
  }

  public async createSqliteBackupSnapshot(destPath: string): Promise<void> {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    if (fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
    }
    await this.db.backup(destPath);
  }
}
