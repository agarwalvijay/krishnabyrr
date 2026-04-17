import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db/client';
import { notifyNewOrder } from '../services/notifications';

const router = Router();

// ── POST /api/payments/phonepe/callback ───────────────────────────────────────
// Server-to-server notification from PhonePe after payment completes / fails.
// PhonePe will retry until it receives HTTP 200, so always return 200.

router.post('/phonepe/callback', async (req, res) => {
  try {
    const xVerify     = (req.headers['x-verify'] as string) ?? '';
    const { response: base64Response } = req.body as { response?: string };

    if (!base64Response) {
      res.status(200).json({ success: false, message: 'Missing response payload' });
      return;
    }

    const saltKey   = process.env.PHONEPE_SALT_KEY   ?? '';
    const saltIndex = process.env.PHONEPE_SALT_INDEX ?? '1';

    // Verify: SHA256(base64Response + saltKey) + "###" + saltIndex
    const expectedHash   = crypto.createHash('sha256').update(base64Response + saltKey).digest('hex');
    const expectedVerify = `${expectedHash}###${saltIndex}`;

    if (saltKey && xVerify !== expectedVerify) {
      console.warn('[phonepe-callback] Signature mismatch — ignoring');
      res.status(200).json({ success: false, message: 'Signature mismatch' });
      return;
    }

    // Decode payload
    let decoded: {
      success: boolean;
      code:    string;
      data?: {
        merchantTransactionId: string;
        transactionId?:        string;
        state?:                string; // COMPLETED | FAILED | PENDING
      };
    };
    try {
      decoded = JSON.parse(Buffer.from(base64Response, 'base64').toString('utf-8'));
    } catch {
      res.status(200).json({ success: false, message: 'Invalid payload' });
      return;
    }

    const mtId  = decoded.data?.merchantTransactionId;
    const state = decoded.data?.state;

    if (!mtId) {
      res.status(200).json({ success: false, message: 'Missing merchantTransactionId' });
      return;
    }

    if (state === 'COMPLETED') {
      const { rows: [updated] } = await pool.query<{
        order_number:     string;
        total:            string;
        line_items:       Array<{ name: string; quantity: number }>;
        shipping_address: { name: string; phone: string; pincode: string };
        guest_email:      string | null;
      }>(
        `UPDATE orders
           SET payment_status = 'paid',
               updated_at     = NOW()
         WHERE phonepe_transaction_id = $1
           AND payment_status NOT IN ('paid', 'refunded')
         RETURNING order_number, total, line_items, shipping_address, guest_email`,
        [mtId],
      );

      if (updated) {
        notifyNewOrder({
          orderNumber:     updated.order_number,
          total:           parseFloat(updated.total),
          itemCount:       updated.line_items.reduce((s, i) => s + i.quantity, 0),
          itemNames:       updated.line_items.map(i => i.name),
          customerName:    updated.shipping_address.name,
          customerContact: updated.guest_email ?? updated.shipping_address.phone,
          pincode:         updated.shipping_address.pincode,
          paymentMethod:   'phonepe',
        });
      }
    } else if (state === 'FAILED') {
      await pool.query(
        `UPDATE orders
           SET payment_status = 'failed',
               updated_at     = NOW()
         WHERE phonepe_transaction_id = $1
           AND payment_status = 'pending'`,
        [mtId],
      );
    }
    // PENDING — leave as-is

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[phonepe-callback] Unexpected error:', err);
    // Always 200 so PhonePe stops retrying
    res.status(200).json({ success: false });
  }
});

export default router;
