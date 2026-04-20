/**
 * Push notification service — Firebase Admin SDK (FCM).
 *
 * Env vars required:
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY   (paste the full PEM from the service-account JSON;
 *                           literal \n in the .env file is fine)
 */

import pool from '../db/client';

// Lazy-init the Admin SDK so missing env vars don't crash the server
// for deployments that haven't configured Firebase yet.
let messaging: import('firebase-admin/messaging').Messaging | null = null;

function getMessaging(): import('firebase-admin/messaging').Messaging | null {
  if (messaging) return messaging;

  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) return null;

  try {
    const admin = require('firebase-admin') as typeof import('firebase-admin');
    // Only initialise once (handles hot-reload in dev)
    const app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
    messaging = admin.messaging(app);
    return messaging;
  } catch (err) {
    console.error('[push] Firebase Admin init failed:', err);
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PushPayload {
  title:    string;
  body:     string;
  data?:    Record<string, string>;
}

// ── Core send ─────────────────────────────────────────────────────────────────

/**
 * Send a push notification to all registered devices for a customer.
 * Silently no-ops if Firebase isn't configured or the customer has no tokens.
 * Stale/invalid tokens are cleaned up automatically.
 */
export async function pushToCustomer(
  customerId: string,
  payload: PushPayload,
): Promise<void> {
  const m = getMessaging();
  if (!m) return;

  const { rows } = await pool.query<{ id: string; fcm_token: string }>(
    `SELECT id, fcm_token FROM device_tokens WHERE customer_id = $1`,
    [customerId],
  );
  if (!rows.length) return;

  const staleIds: string[] = [];

  await Promise.all(
    rows.map(async ({ id, fcm_token }) => {
      try {
        await m.send({
          token:        fcm_token,
          notification: { title: payload.title, body: payload.body },
          data:         payload.data ?? {},
          android: {
            notification: {
              color:    '#1A6B6B',
              priority: 'high',
            },
          },
        });
      } catch (err: unknown) {
        // FCM error codes that mean the token is permanently invalid
        const code = (err as { errorInfo?: { code?: string } })?.errorInfo?.code ?? '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          staleIds.push(id);
        } else {
          console.error('[push] send failed:', code, err);
        }
      }
    }),
  );

  // Remove stale tokens — fire-and-forget
  if (staleIds.length) {
    pool.query(
      `DELETE FROM device_tokens WHERE id = ANY($1)`,
      [staleIds],
    ).catch((e) => console.error('[push] stale token cleanup failed:', e.message));
  }
}
