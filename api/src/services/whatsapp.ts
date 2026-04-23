/**
 * WhatsApp Business API — Meta Cloud API wrapper
 *
 * Setup:
 *   1. Create a Meta Developer App → Add WhatsApp product
 *   2. Add a phone number and get the Phone Number ID
 *   3. Generate a System User permanent access token in Meta Business Suite
 *   4. Submit message templates for each template name below
 *   5. Add to api/.env:
 *        WHATSAPP_PHONE_NUMBER_ID=<from Meta developer portal>
 *        WHATSAPP_ACCESS_TOKEN=<system user permanent token>
 *        WHATSAPP_WEBHOOK_SECRET=<any random string you choose>
 *
 * Template names to register with Meta (category in parentheses):
 *   kb_otp               (AUTHENTICATION)  — phone verification OTP
 *   kb_order_confirmed   (UTILITY)          — payment succeeded
 *   kb_payment_failed    (UTILITY)          — payment failed
 *   kb_order_shipped     (UTILITY)          — order fulfilled/shipped
 *   kb_order_cancelled   (UTILITY)          — order cancelled
 *   kb_refund_initiated  (UTILITY)          — refund in progress
 *   kb_password_changed  (UTILITY)          — security alert
 *
 * Template body copy (submit exactly as below during Meta approval):
 *
 *   kb_otp:
 *     "{{1}} is your Krishna's Bliss verification code. Valid for 10 minutes."
 *     (add OTP copy-code button with {{1}})
 *
 *   kb_order_confirmed:
 *     "Hi {{1}}! Your order *{{2}}* for ₹{{3}} is confirmed. We'll notify you when it ships."
 *
 *   kb_payment_failed:
 *     "Hi {{1}}, your payment for order {{2}} didn't go through. Please try again or contact us on WhatsApp."
 *
 *   kb_order_shipped:
 *     "Hi {{1}}! Your order {{2}} has been shipped via {{3}}. Tracking: {{4}}"
 *
 *   kb_order_cancelled:
 *     "Hi {{1}}, your order {{2}} has been cancelled.{{3}}"
 *     ({{3}} = " A refund of ₹X is on its way." or "" if no refund)
 *
 *   kb_refund_initiated:
 *     "Hi {{1}}, your refund of ₹{{2}} for order {{3}} has been initiated. It will reflect in 5–7 business days."
 *
 *   kb_password_changed:
 *     "Hi {{1}}, your Krishna's Bliss account password was recently changed. If this wasn't you, contact us immediately on WhatsApp."
 *
 * If WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN are not set, all sends
 * are silently skipped — the order/auth flows are never affected.
 */

import pool from '../db/client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TextParameter {
  type: 'text';
  text: string;
}

interface TemplateComponent {
  type:       'body' | 'button';
  sub_type?:  'url';
  index?:     string;
  parameters: TextParameter[];
}

interface MetaSendResponse {
  messages?: Array<{ id: string }>;
  error?: { message: string; code: number };
}

// ── Config ────────────────────────────────────────────────────────────────────

function cfg() {
  return {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken:   process.env.WHATSAPP_ACCESS_TOKEN,
  };
}

function isConfigured(): boolean {
  const { phoneNumberId, accessToken } = cfg();
  return !!(phoneNumberId && accessToken);
}

/** Normalize to E.164 without '+': 91XXXXXXXXXX */
function toE164India(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // If already has country code (12 digits starting with 91)
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  // 10-digit local number
  return `91${digits.slice(-10)}`;
}

// ── Core send ─────────────────────────────────────────────────────────────────

async function sendTemplate(
  phone:        string,
  templateName: string,
  components:   TemplateComponent[],
  metadata?:    Record<string, string>,
): Promise<void> {
  if (!isConfigured()) return;

  const { phoneNumberId, accessToken } = cfg();
  const to = toE164India(phone);

  // Log intent before attempting send
  const { rows: [logRow] } = await pool.query<{ id: string }>(
    `INSERT INTO whatsapp_notifications (phone, template_name, status, metadata)
     VALUES ($1, $2, 'queued', $3)
     RETURNING id`,
    [to, templateName, metadata ? JSON.stringify(metadata) : null],
  );
  const logId = logRow?.id;

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name:     templateName,
            language: { code: 'en' },
            components,
          },
        }),
      },
    );

    const data = await response.json() as MetaSendResponse;
    const waMessageId = data.messages?.[0]?.id ?? null;
    const failed      = !response.ok || !!data.error;
    const errorMsg    = data.error ? `${data.error.code}: ${data.error.message}` : null;

    if (logId) {
      await pool.query(
        `UPDATE whatsapp_notifications
         SET status = $1, wa_message_id = $2, error_msg = $3, updated_at = NOW()
         WHERE id = $4`,
        [failed ? 'failed' : 'sent', waMessageId, errorMsg, logId],
      );
    }

    if (failed) {
      console.warn(`[whatsapp] Template "${templateName}" to ${to} failed:`, errorMsg);
    }
  } catch (err) {
    console.warn(`[whatsapp] Network error sending "${templateName}" to ${to}:`, err);
    if (logId) {
      await pool.query(
        `UPDATE whatsapp_notifications SET status = 'failed', error_msg = $1, updated_at = NOW() WHERE id = $2`,
        [(err as Error).message, logId],
      );
    }
  }
}

/** Fire-and-forget wrapper — never throws, never blocks the caller */
function send(
  phone:        string,
  templateName: string,
  components:   TemplateComponent[],
  metadata?:    Record<string, string>,
): void {
  sendTemplate(phone, templateName, components, metadata).catch((err) => {
    console.error('[whatsapp] Unexpected error in sendTemplate:', err);
  });
}

function txt(text: string): TextParameter {
  return { type: 'text', text };
}

// ── Template senders ──────────────────────────────────────────────────────────

export function sendOtp(phone: string, otp: string): void {
  send(
    phone,
    'kb_otp',
    [
      { type: 'body', parameters: [txt(otp)] },
      // Copy-code button — index 0, same OTP as parameter
      { type: 'button', sub_type: 'url', index: '0', parameters: [txt(otp)] },
    ],
    { purpose: 'otp' },
  );
}

export function sendOrderConfirmed(params: {
  phone:       string;
  name:        string;
  orderNumber: string;
  total:       number;
}): void {
  send(
    params.phone,
    'kb_order_confirmed',
    [{ type: 'body', parameters: [txt(params.name), txt(params.orderNumber), txt(params.total.toLocaleString('en-IN'))] }],
    { order_number: params.orderNumber },
  );
}

export function sendPaymentFailed(params: {
  phone:       string;
  name:        string;
  orderNumber: string;
}): void {
  send(
    params.phone,
    'kb_payment_failed',
    [{ type: 'body', parameters: [txt(params.name), txt(params.orderNumber)] }],
    { order_number: params.orderNumber },
  );
}

export function sendOrderShipped(params: {
  phone:       string;
  name:        string;
  orderNumber: string;
  courier:     string;
  tracking:    string;
}): void {
  send(
    params.phone,
    'kb_order_shipped',
    [{ type: 'body', parameters: [txt(params.name), txt(params.orderNumber), txt(params.courier), txt(params.tracking)] }],
    { order_number: params.orderNumber },
  );
}

export function sendOrderCancelled(params: {
  phone:         string;
  name:          string;
  orderNumber:   string;
  refundAmount?: number;
}): void {
  const refundNote = params.refundAmount && params.refundAmount > 0
    ? ` A refund of ₹${params.refundAmount.toLocaleString('en-IN')} is on its way.`
    : '';
  send(
    params.phone,
    'kb_order_cancelled',
    [{ type: 'body', parameters: [txt(params.name), txt(params.orderNumber), txt(refundNote)] }],
    { order_number: params.orderNumber },
  );
}

export function sendRefundInitiated(params: {
  phone:       string;
  name:        string;
  orderNumber: string;
  amount:      number;
}): void {
  send(
    params.phone,
    'kb_refund_initiated',
    [{ type: 'body', parameters: [txt(params.name), txt(params.amount.toLocaleString('en-IN')), txt(params.orderNumber)] }],
    { order_number: params.orderNumber },
  );
}

export function sendPasswordChanged(phone: string, name: string): void {
  send(
    phone,
    'kb_password_changed',
    [{ type: 'body', parameters: [txt(name)] }],
  );
}

// ── Webhook delivery status update ────────────────────────────────────────────
// Called by the webhook route when Meta notifies us of status changes.

export async function handleDeliveryStatus(
  waMessageId: string,
  status: 'sent' | 'delivered' | 'read' | 'failed',
): Promise<void> {
  await pool.query(
    `UPDATE whatsapp_notifications
     SET status = $1, updated_at = NOW()
     WHERE wa_message_id = $2`,
    [status, waMessageId],
  ).catch(() => {}); // best-effort
}
