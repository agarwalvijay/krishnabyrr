/**
 * Cross-device pairing for magic-link flows.
 *
 * Use case: user requests a WhatsApp login link on their laptop. The link
 * opens on their phone. We need the laptop to know when the phone has
 * verified, so it can complete sign-in automatically.
 *
 * How it works:
 *   1. send-link endpoint calls createPairing(token, purpose) → returns
 *      a session_id, returned to the requesting laptop.
 *   2. Phone clicks the WA link, which triggers verify-token. That handler
 *      calls markApproved(token, payload) which looks up the paired session
 *      via a token hash reverse index and marks it approved with the JWT
 *      (or whatever payload the laptop needs).
 *   3. The laptop polls pollSession(session_id) every 2s. On 'approved'
 *      it receives the payload and the session is deleted (single-use).
 *
 * Security: the WhatsApp link only contains the verification token, never
 * the session_id — so an attacker who intercepts the WA message cannot
 * silently retrieve the JWT through the polling endpoint. They could call
 * verify-token and receive the JWT directly, but that's the same risk that
 * exists without this pairing layer.
 *
 * TTL: 15 minutes. Both the session record and the token reverse index
 * expire automatically.
 */

import crypto from 'crypto';
import { getRedisClient } from '../redis';

const SESSION_TTL_SECONDS = 15 * 60;

export type MagicPurpose = 'login' | 'verify';

interface PendingSession {
  status:     'pending';
  purpose:    MagicPurpose;
  created_at: string;
}

interface ApprovedSession {
  status:      'approved';
  purpose:     MagicPurpose;
  payload:     unknown;
  approved_at: string;
}

type Session = PendingSession | ApprovedSession;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const sessionKey = (id: string)        => `magic:session:${id}`;
const tokenKey   = (tokenHash: string) => `magic:token:${tokenHash}`;

/**
 * Create a pairing tied to a verification token. Returns the session_id
 * that the laptop should poll on.
 */
export async function createPairing(
  token:   string,
  purpose: MagicPurpose,
): Promise<string> {
  const redis     = await getRedisClient();
  const sessionId = crypto.randomBytes(16).toString('hex');
  const tokenHash = hashToken(token);

  const pending: PendingSession = {
    status:     'pending',
    purpose,
    created_at: new Date().toISOString(),
  };

  await redis.set(sessionKey(sessionId), JSON.stringify(pending), { EX: SESSION_TTL_SECONDS });
  await redis.set(tokenKey(tokenHash),   sessionId,                 { EX: SESSION_TTL_SECONDS });

  return sessionId;
}

/**
 * Mark the session paired with this token as approved. No-op if there is
 * no paired session (the link was clicked without a waiting laptop, e.g.
 * user opened the verification link directly without going through the
 * web app first).
 */
export async function markApproved(token: string, payload: unknown): Promise<void> {
  const redis     = await getRedisClient();
  const tokenHash = hashToken(token);
  const sessionId = await redis.get(tokenKey(tokenHash));
  if (!sessionId) return;

  const raw = await redis.get(sessionKey(sessionId));
  if (!raw) return;
  const existing = JSON.parse(raw) as Session;

  const approved: ApprovedSession = {
    status:      'approved',
    purpose:     existing.purpose,
    payload,
    approved_at: new Date().toISOString(),
  };

  await redis.set(sessionKey(sessionId), JSON.stringify(approved), { EX: SESSION_TTL_SECONDS });
  await redis.del(tokenKey(tokenHash));
}

export interface PollResult {
  status:   'pending' | 'approved' | 'expired';
  purpose?: MagicPurpose;
  payload?: unknown;
}

/**
 * Poll a session. On 'approved' the session is deleted so the payload
 * cannot be retrieved twice.
 */
export async function pollSession(sessionId: string): Promise<PollResult> {
  const redis = await getRedisClient();
  const raw   = await redis.get(sessionKey(sessionId));
  if (!raw) return { status: 'expired' };

  const session = JSON.parse(raw) as Session;
  if (session.status === 'pending') {
    return { status: 'pending', purpose: session.purpose };
  }

  // Single-use: delete on read so the JWT can't be replayed by another caller
  await redis.del(sessionKey(sessionId));
  return {
    status:  'approved',
    purpose: session.purpose,
    payload: session.payload,
  };
}
