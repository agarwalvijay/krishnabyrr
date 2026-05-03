/**
 * WhatsApp webhook — receives delivery status updates from Meta.
 *
 * Setup in Meta developer portal:
 *   1. Go to your app → WhatsApp → Configuration → Webhook
 *   2. Callback URL: https://krishnasbliss.com/api/whatsapp/webhook
 *   3. Verify Token: the value of WHATSAPP_WEBHOOK_SECRET in your .env
 *   4. App Secret: copied from App Dashboard → Settings → Basic → App Secret.
 *      Set this as WHATSAPP_APP_SECRET in your .env — used to verify the
 *      X-Hub-Signature-256 HMAC on every incoming POST.
 *   5. Subscribe to: messages
 */

import { Router, Request } from 'express';
import crypto from 'crypto';
import { handleDeliveryStatus } from '../services/whatsapp';

const router = Router();

// ── GET /api/whatsapp/webhook — Meta verification handshake ───────────────────

router.get('/', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;

  if (mode === 'subscribe' && token === secret) {
    res.status(200).send(challenge);
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
});

// ── POST /api/whatsapp/webhook — incoming status updates ──────────────────────
// Meta signs every payload with HMAC-SHA256(app_secret, raw_body) and sends it
// as `X-Hub-Signature-256: sha256=<hex>`. Reject any request that doesn't match.

function verifyMetaSignature(req: Request): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return false;

  const header = req.header('x-hub-signature-256') ?? '';
  if (!header.startsWith('sha256=')) return false;

  const provided = header.slice('sha256='.length);
  const rawBody  = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) return false;

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  // Constant-time comparison
  const a = Buffer.from(provided, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

router.post('/', (req, res) => {
  if (!verifyMetaSignature(req)) {
    // Meta retries on non-200 — but a forged request should not be acknowledged
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // Always respond 200 immediately on valid requests so Meta doesn't retry
  res.status(200).json({ received: true });

  try {
    const body = req.body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            statuses?: Array<{
              id:     string;
              status: string;
            }>;
          };
        }>;
      }>;
    };

    const statuses = body.entry?.[0]?.changes?.[0]?.value?.statuses ?? [];

    for (const s of statuses) {
      const status = s.status as 'sent' | 'delivered' | 'read' | 'failed';
      if (['sent', 'delivered', 'read', 'failed'].includes(status)) {
        handleDeliveryStatus(s.id, status);
      }
    }
  } catch (err) {
    console.error('[whatsapp-webhook] Error processing payload:', err);
  }
});

export default router;
