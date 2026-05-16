import crypto from 'crypto';
import pool from '../db/client';

export interface ClaimTokenRow {
  token:      string;
  order_id:   string;
  phone:      string;
  expires_at: string;
  used_at:    string | null;
}

export async function createClaimToken(orderId: string, phone: string): Promise<string> {
  const token = crypto.randomBytes(24).toString('base64url');
  await pool.query(
    `INSERT INTO account_claim_tokens (token, order_id, phone) VALUES ($1, $2, $3)`,
    [token, orderId, phone],
  );
  return token;
}

export async function lookupClaimToken(token: string): Promise<ClaimTokenRow | null> {
  const { rows } = await pool.query<ClaimTokenRow>(
    `SELECT token, order_id, phone, expires_at, used_at
       FROM account_claim_tokens
      WHERE token = $1`,
    [token],
  );
  return rows[0] ?? null;
}

export async function markClaimTokenUsed(token: string): Promise<void> {
  await pool.query(
    `UPDATE account_claim_tokens SET used_at = NOW() WHERE token = $1 AND used_at IS NULL`,
    [token],
  );
}
