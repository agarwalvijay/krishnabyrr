/**
 * OTP service — generate, store, and verify 6-digit phone OTPs.
 *
 * - Codes are stored as SHA-256 hashes (fast — OTPs are ephemeral & short)
 * - Each send invalidates all prior unused codes for the same phone
 * - Rate limit: max 3 sends per phone per 15-minute window
 * - Codes expire after 10 minutes
 */

import crypto from 'crypto';
import pool from '../db/client';

const OTP_EXPIRY_MINUTES = 10;
const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX = 3;

function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function generateCode(): string {
  // Cryptographically random 6-digit number, zero-padded
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export type OtpError =
  | 'RATE_LIMITED'   // too many sends recently
  | 'INVALID'        // wrong code
  | 'EXPIRED'        // code has expired
  | 'ALREADY_USED';  // code was already consumed

/** Returns the OTP string (so the caller can pass it to WhatsApp), or throws OtpError */
export async function createOtp(phone: string): Promise<string> {
  const normalPhone = phone.replace(/\D/g, '').slice(-10);

  // Rate limit: count sends in the last RATE_LIMIT_WINDOW_MINUTES
  const { rows: [{ count }] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM phone_otps
     WHERE phone = $1
       AND created_at > NOW() - INTERVAL '${RATE_LIMIT_WINDOW_MINUTES} minutes'`,
    [normalPhone],
  );
  if (parseInt(count, 10) >= RATE_LIMIT_MAX) {
    throw new Error('RATE_LIMITED');
  }

  // Invalidate any prior unused OTPs for this phone (keep the DB clean)
  await pool.query(
    `UPDATE phone_otps SET used_at = NOW()
     WHERE phone = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [normalPhone],
  );

  const otp        = generateCode();
  const expiresAt  = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);

  await pool.query(
    `INSERT INTO phone_otps (phone, otp_hash, expires_at) VALUES ($1, $2, $3)`,
    [normalPhone, hashOtp(otp), expiresAt],
  );

  return otp;
}

/** Verifies a code. Returns true on success (and marks it used), or throws OtpError */
export async function verifyOtp(phone: string, code: string): Promise<true> {
  const normalPhone = phone.replace(/\D/g, '').slice(-10);
  const hash        = hashOtp(code.trim());

  const { rows: [row] } = await pool.query<{
    id: string;
    expires_at: Date;
    used_at: Date | null;
  }>(
    `SELECT id, expires_at, used_at FROM phone_otps
     WHERE phone = $1 AND otp_hash = $2
     ORDER BY created_at DESC LIMIT 1`,
    [normalPhone, hash],
  );

  if (!row)             throw new Error('INVALID');
  if (row.used_at)      throw new Error('ALREADY_USED');
  if (new Date() > new Date(row.expires_at)) throw new Error('EXPIRED');

  // Mark as used
  await pool.query(`UPDATE phone_otps SET used_at = NOW() WHERE id = $1`, [row.id]);

  return true;
}
