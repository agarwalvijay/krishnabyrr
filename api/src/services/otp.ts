/**
 * Phone verification service — magic-link style (no code entry required).
 *
 * Flow:
 *   1. createVerificationToken(phone) → returns a random hex token
 *   2. sendVerificationLink() sends a WhatsApp message with a tap-to-verify button
 *   3. User taps the link → opens /verify-phone?t=<token>
 *   4. verifyToken(token) → marks phone_verified = true on the customer record
 *
 * Token properties:
 *   - 32 bytes of cryptographic randomness (64 hex chars) — unguessable
 *   - Stored as SHA-256 hash in DB (token itself never persisted)
 *   - Expires in 30 minutes
 *   - Rate limited: max 3 sends per phone per 15-minute window
 */

import crypto from 'crypto';
import pool from '../db/client';

const TOKEN_EXPIRY_MINUTES    = 30;
const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX          = 3;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Creates a verification token for a phone number. Throws 'RATE_LIMITED' if too many recent sends. */
export async function createVerificationToken(phone: string): Promise<string> {
  const normalPhone = phone.replace(/\D/g, '').slice(-10);

  // Rate limit
  const { rows: [{ count }] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM phone_otps
     WHERE phone = $1
       AND created_at > NOW() - INTERVAL '${RATE_LIMIT_WINDOW_MINUTES} minutes'`,
    [normalPhone],
  );
  if (parseInt(count, 10) >= RATE_LIMIT_MAX) {
    throw new Error('RATE_LIMITED');
  }

  // Invalidate any prior unused tokens for this phone
  await pool.query(
    `UPDATE phone_otps SET used_at = NOW()
     WHERE phone = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [normalPhone],
  );

  const token     = crypto.randomBytes(32).toString('hex'); // 64-char hex string
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60_000);

  await pool.query(
    `INSERT INTO phone_otps (phone, otp_hash, expires_at) VALUES ($1, $2, $3)`,
    [normalPhone, hashToken(token), expiresAt],
  );

  return token;
}

/**
 * Verifies a token from the magic link.
 * Returns the phone number on success (so the caller can mark the customer verified).
 * Throws: 'INVALID' | 'EXPIRED' | 'ALREADY_USED'
 */
export async function verifyToken(token: string): Promise<string> {
  const hash = hashToken(token.trim());

  const { rows: [row] } = await pool.query<{
    id:         string;
    phone:      string;
    expires_at: Date;
    used_at:    Date | null;
  }>(
    `SELECT id, phone, expires_at, used_at FROM phone_otps
     WHERE otp_hash = $1
     ORDER BY created_at DESC LIMIT 1`,
    [hash],
  );

  if (!row)        throw new Error('INVALID');
  if (row.used_at) throw new Error('ALREADY_USED');
  if (new Date() > new Date(row.expires_at)) throw new Error('EXPIRED');

  await pool.query(`UPDATE phone_otps SET used_at = NOW() WHERE id = $1`, [row.id]);

  return row.phone;
}
