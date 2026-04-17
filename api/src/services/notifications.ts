/**
 * Owner notifications via WhatsApp (CallMeBot).
 *
 * Setup (one-time):
 *   1. Save the number +34 623 78 95 80 as a contact on your phone.
 *   2. Send it a WhatsApp message: "I allow callmebot to send me messages"
 *   3. You'll receive your API key within a few seconds.
 *   4. Add to api/.env:
 *        OWNER_WHATSAPP=91XXXXXXXXXX   (country code + number, no + or spaces)
 *        CALLMEBOT_API_KEY=XXXXXX
 *
 * If either env var is missing, notifications are silently skipped — the order
 * flow is never affected by a notification failure.
 */

interface OrderNotificationParams {
  orderNumber:  string;
  total:        number;
  itemCount:    number;
  itemNames:    string[];
  customerName: string;
  customerContact: string; // email or phone
  pincode:      string;
  paymentMethod: string;   // 'razorpay' | 'manual'
}

export async function notifyNewOrder(params: OrderNotificationParams): Promise<void> {
  const phone  = process.env.OWNER_WHATSAPP;
  const apiKey = process.env.CALLMEBOT_API_KEY;
  if (!phone || !apiKey) return;

  const {
    orderNumber, total, itemCount, itemNames,
    customerName, customerContact, pincode, paymentMethod,
  } = params;

  const paymentLabel = paymentMethod === 'razorpay' ? 'Paid (Razorpay)' : 'Pending payment';
  const itemSummary  = itemNames.slice(0, 3).join(', ') + (itemNames.length > 3 ? ` +${itemNames.length - 3} more` : '');

  const message = [
    `New order ${orderNumber}`,
    `Rs ${total.toLocaleString('en-IN')} · ${itemCount} item${itemCount !== 1 ? 's' : ''}`,
    itemSummary,
    `${customerName} · ${customerContact}`,
    `Pincode: ${pincode}`,
    paymentLabel,
  ].join('\n');

  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apiKey)}`;

  // Fire-and-forget — never block or fail the order response
  fetch(url).catch(() => {});
}
