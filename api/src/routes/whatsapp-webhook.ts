/**
 * WhatsApp webhook — receives delivery status updates from Meta.
 *
 * Setup in Meta developer portal:
 *   1. Go to your app → WhatsApp → Configuration → Webhook
 *   2. Callback URL: https://krishnasbliss.com/api/whatsapp/webhook
 *   3. Verify Token: the value of WHATSAPP_WEBHOOK_SECRET in your .env
 *   4. Subscribe to: messages
 */

import { Router } from 'express';
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

router.post('/', (req, res) => {
  // Always respond 200 immediately — Meta retries on non-200
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
