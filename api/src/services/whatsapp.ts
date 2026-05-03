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
 *        WHATSAPP_APP_SECRET=<App Secret from App Dashboard → Settings → Basic>
 *
 * Template names to register with Meta (category in parentheses):
 *   kb_verify_phone      (UTILITY)          — magic link phone verification
 *   kb_login_link        (UTILITY)          — passwordless WhatsApp login
 *   kb_order_conf        (UTILITY)          — payment succeeded
 *   kb_payment_fail      (UTILITY)          — payment failed
 *   kb_order_shipped     (UTILITY)          — order fulfilled/shipped
 *   kb_order_cancelled   (UTILITY)          — order cancelled
 *   kb_refund_initiated  (UTILITY)          — refund in progress
 *   kb_password_changed  (UTILITY)          — security alert
 *   kb_owner_new_order   (UTILITY)          — owner alert: new order received
 *
 * Template body copy (paste exactly as shown into the Meta template editor).
 * All variables are type "text". Bodies must NOT start with a variable.
 *
 *   kb_verify_phone (UTILITY):
 *     Header: none
 *     Body: "Hi {{1}}! Tap the button below to verify your phone number
 *            for your Krishna's Bliss account. This link expires in 30 minutes."
 *     Button: [Visit Website] label="Verify Phone"
 *             URL base (fixed in Meta): https://krishnasbliss.com/verify-phone?t=
 *             URL suffix (dynamic):     {{1}}
 *     Variables: body {{1}} = customer name, button suffix {{1}} = token
 *     Sample:
 *       "Hi Priya! Tap the button below to verify your phone number for your
 *        Krishna's Bliss account. This link expires in 30 minutes."
 *       Button → https://krishnasbliss.com/verify-phone?t=a3f8c2d1e9b4567f…
 *
 *   kb_login_link (UTILITY):
 *     Header: none
 *     Body: "Hi {{1}}! Tap the button below to sign in to your Krishna's Bliss
 *            account. This link expires in 15 minutes. If you didn't request
 *            this, ignore this message."
 *     Button: [Visit Website] label="Sign In"
 *             URL base (fixed in Meta): https://krishnasbliss.com/login-link?t=
 *             URL suffix (dynamic):     {{1}}
 *     Variables: body {{1}} = customer name, button suffix {{1}} = token
 *     Sample:
 *       "Hi Priya! Tap the button below to sign in to your Krishna's Bliss
 *        account. This link expires in 15 minutes. If you didn't request
 *        this, ignore this message."
 *       Button → https://krishnasbliss.com/login-link?t=b7e1d3f092c8a1e5…
 *
 *   kb_order_conf (UTILITY):
 *     Body: "Hi {{1}}! Your order *{{2}}* for ₹{{3}} is confirmed.
 *            We'll notify you when it ships."
 *     Variables: {{1}} = customer name, {{2}} = order number, {{3}} = total (e.g. 2,450)
 *     Sample: "Hi Priya! Your order *KB-00123* for ₹2,450 is confirmed.
 *              We'll notify you when it ships."
 *
 *   kb_payment_fail (UTILITY):
 *     Body: "Hi {{1}}, your payment for order {{2}} didn't go through.
 *            Please try again or contact us on WhatsApp."
 *     Variables: {{1}} = customer name, {{2}} = order number
 *     Sample: "Hi Priya, your payment for order KB-00123 didn't go through.
 *              Please try again or contact us on WhatsApp."
 *
 *   kb_order_shipped (UTILITY):
 *     Body: "Hi {{1}}! Your order {{2}} has been shipped via {{3}}.
 *            Tracking: {{4}}"
 *     Variables: {{1}} = customer name, {{2}} = order number,
 *                {{3}} = courier name, {{4}} = tracking number
 *     Sample: "Hi Priya! Your order KB-00123 has been shipped via Delhivery.
 *              Tracking: 1234567890"
 *
 *   kb_order_cancelled (UTILITY):
 *     Body: "Hi {{1}}, your order {{2}} has been cancelled.{{3}}"
 *     Variables: {{1}} = customer name, {{2}} = order number,
 *                {{3}} = refund note (" A refund of ₹2,450 is on its way." or "")
 *     Sample (with refund):
 *       "Hi Priya, your order KB-00123 has been cancelled. A refund of ₹2,450
 *        is on its way."
 *     Sample (no refund):
 *       "Hi Priya, your order KB-00123 has been cancelled."
 *
 *   kb_refund_initiated (UTILITY):
 *     Body: "Hi {{1}}, your refund of ₹{{2}} for order {{3}} has been initiated.
 *            It will reflect in 5–7 business days."
 *     Variables: {{1}} = customer name, {{2}} = amount (e.g. 2,450), {{3}} = order number
 *     Sample: "Hi Priya, your refund of ₹2,450 for order KB-00123 has been
 *              initiated. It will reflect in 5–7 business days."
 *
 *   kb_password_changed (UTILITY):
 *     Body: "Hi {{1}}, your Krishna's Bliss account password was recently changed.
 *            If this wasn't you, contact us immediately on WhatsApp."
 *     Variables: {{1}} = customer name
 *     Sample: "Hi Priya, your Krishna's Bliss account password was recently
 *              changed. If this wasn't you, contact us immediately on WhatsApp."
 *
 *   kb_owner_new_order (UTILITY):
 *     Body: "New order *{{1}}* received!\n\n{{2}}\n\nCustomer: {{3}}\nPayment: {{4}}"
 *     Variables: {{1}} = order number
 *                {{2}} = "₹6,750 · 1 item — Maheshwari Silk Ivory Bel Buti"
 *                {{3}} = "Priya Sharma · 9876543210 · PIN 110001"
 *                {{4}} = "Paid (Razorpay)"
 *     Sample: "New order *KB-000001* received!
 *
 *              ₹6,750 · 1 item — Maheshwari Silk Ivory Bel Buti
 *
 *              Customer: Priya Sharma · 9876543210 · PIN 110001
 *              Payment: Paid (Razorpay)"
 *     Note: set OWNER_PHONE in api/.env to the owner's WhatsApp number.
 *           If absent, owner notifications are silently skipped.
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

/**
 * Sends a magic-link phone verification message (kb_verify_phone).
 * {{1}} = customer_name, button URL suffix = token
 * Sample button URL: https://krishnasbliss.com/verify-phone?t=a3f8c2d1e9b4567f…
 */
export function sendVerificationLink(phone: string, name: string, token: string): void {
  send(
    phone,
    'kb_verify_phone',
    [
      { type: 'body',   parameters: [txt(name)] },
      // Button index 0: URL suffix = token (base URL fixed in template config)
      { type: 'button', sub_type: 'url', index: '0', parameters: [txt(token)] },
    ],
    { purpose: 'phone_verification' },
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
    'kb_order_conf',
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
    'kb_payment_fail',
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

export function sendLoginLink(phone: string, name: string, token: string): void {
  send(
    phone,
    'kb_login_link',
    [
      { type: 'body',   parameters: [txt(name)] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [txt(token)] },
    ],
    { purpose: 'login' },
  );
}

export function sendPasswordChanged(phone: string, name: string): void {
  send(
    phone,
    'kb_password_changed',
    [{ type: 'body', parameters: [txt(name)] }],
  );
}

export function sendOwnerNewOrder(params: {
  orderNumber:     string;
  total:           number;
  itemCount:       number;
  itemSummary:     string;
  customerName:    string;
  customerContact: string;
  pincode:         string;
  paymentLabel:    string;
}): void {
  const ownerPhone = process.env.OWNER_PHONE;
  if (!ownerPhone) return;

  const itemLine     = `₹${params.total.toLocaleString('en-IN')} · ${params.itemCount} item${params.itemCount !== 1 ? 's' : ''} — ${params.itemSummary}`;
  const customerLine = `${params.customerName} · ${params.customerContact} · PIN ${params.pincode}`;

  send(
    ownerPhone,
    'kb_owner_new_order',
    [{ type: 'body', parameters: [
      txt(params.orderNumber),
      txt(itemLine),
      txt(customerLine),
      txt(params.paymentLabel),
    ]}],
    { order_number: params.orderNumber },
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
