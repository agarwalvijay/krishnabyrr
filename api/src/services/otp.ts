/**
 * Phone verification service — magic-link style (no code entry required).
 *
 * Flow:
 *   1. createVerificationToken(phone) → returns a random hex token
 *   2. sendVerificationLink() sends a WhatsApp message with a tap-to-verify button
 *   3. User taps the link → opens /verify-phone?t=<token>
 *   4. verifyToken(token, 'verify') → marks phone_verified = true on the customer record
 *
 * Token properties:
 *   - 32 bytes of cryptographic randomness (64 hex chars) — unguessable
 *   - Stored as SHA-256 hash in DB (token itself never persisted)
 *   - Expires in 30 minutes
 *   - Rate limited: max 3 sends per phone per 15-minute window
 *   - purpose column prevents login tokens from satisfying verify flows and vice versa
 */

import crypto from 'crypto';
import pool from '../db/client';

const TOKEN_EXPIRY_MINUTES       = 30; // phone verification
const LOGIN_TOKEN_EXPIRY_MINUTES = 15; // login links — shorter for security

// Defaults applied when no admin override is present in the settings table.
const DEFAULT_RATE_LIMIT_WINDOW_MINUTES = 15;
const DEFAULT_RATE_LIMIT_MAX            = 10;

// Tiny in-process cache so we don't hit the settings table on every send.
// 60s is short enough that admin changes propagate quickly during testing.
interface RateLimitCfg { window: number; max: number }
let cachedCfg:        RateLimitCfg | null = null;
let cachedCfgExpires = 0;

async function getRateLimitConfig(): Promise<RateLimitCfg> {
  const now = Date.now();
  if (cachedCfg && now < cachedCfgExpires) return cachedCfg;

  const { rows } = await pool.query<{ key: string; value: unknown }>(
    `SELECT key, value FROM settings
     WHERE key IN ('otp_rate_limit_max','otp_rate_limit_window_minutes')`,
  );
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const parse = (v: unknown, fallback: number): number => {
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  cachedCfg = {
    window: parse(map.get('otp_rate_limit_window_minutes'), DEFAULT_RATE_LIMIT_WINDOW_MINUTES),
    max:    parse(map.get('otp_rate_limit_max'),            DEFAULT_RATE_LIMIT_MAX),
  };
  cachedCfgExpires = now + 60_000;
  return cachedCfg;
}

/** Forces a refresh on the next call — used by the admin settings PUT handler. */
export function invalidateRateLimitCache(): void {
  cachedCfg = null;
  cachedCfgExpires = 0;
}

export type TokenPurpose = 'login' | 'verify';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createToken(phone: string, expiryMinutes: number, purpose: TokenPurpose): Promise<string> {
  const normalPhone = phone.replace(/\D/g, '').slice(-10);

  // Rate limit — window and max come from admin-configurable settings (cached 60s).
  // Pass window as a parameter rather than string-interpolating it (defence-in-depth).
  const { window: windowMins, max: maxAttempts } = await getRateLimitConfig();
  const { rows: [{ count }] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM phone_otps
     WHERE phone = $1
       AND created_at > NOW() - ($2::int * INTERVAL '1 minute')`,
    [normalPhone, windowMins],
  );
  if (parseInt(count, 10) >= maxAttempts) {
    throw new Error('RATE_LIMITED');
  }

  // Invalidate any prior unused tokens for this phone+purpose
  await pool.query(
    `UPDATE phone_otps SET used_at = NOW()
     WHERE phone = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > NOW()`,
    [normalPhone, purpose],
  );

  const token     = crypto.randomBytes(32).toString('hex'); // 64-char hex string
  const expiresAt = new Date(Date.now() + expiryMinutes * 60_000);

  await pool.query(
    `INSERT INTO phone_otps (phone, otp_hash, expires_at, purpose) VALUES ($1, $2, $3, $4)`,
    [normalPhone, hashToken(token), expiresAt, purpose],
  );

  return token;
}

/** Creates a 30-min phone verification token. */
export async function createVerificationToken(phone: string): Promise<string> {
  return createToken(phone, TOKEN_EXPIRY_MINUTES, 'verify');
}

/** Creates a 15-min login token. */
export async function createLoginToken(phone: string): Promise<string> {
  return createToken(phone, LOGIN_TOKEN_EXPIRY_MINUTES, 'login');
}

/**
 * Verifies a token from the magic link.
 * Returns the phone number on success (so the caller can mark the customer verified).
 * Throws: 'INVALID' | 'EXPIRED' | 'ALREADY_USED'
 */
export async function verifyToken(token: string, purpose: TokenPurpose): Promise<string> {
  const hash = hashToken(token.trim());

  const { rows: [row] } = await pool.query<{
    id:         string;
    phone:      string;
    expires_at: Date;
    used_at:    Date | null;
  }>(
    `SELECT id, phone, expires_at, used_at FROM phone_otps
     WHERE otp_hash = $1 AND purpose = $2
     ORDER BY created_at DESC LIMIT 1`,
    [hash, purpose],
  );

  if (!row)        throw new Error('INVALID');
  if (row.used_at) throw new Error('ALREADY_USED');
  if (new Date() > new Date(row.expires_at)) throw new Error('EXPIRED');

  await pool.query(`UPDATE phone_otps SET used_at = NOW() WHERE id = $1`, [row.id]);

  return row.phone;
}
