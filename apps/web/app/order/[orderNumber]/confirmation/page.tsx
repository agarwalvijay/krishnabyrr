'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient, formatINR } from '@/lib/api';
import { useIsLoggedIn } from '@/contexts/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────

interface LineItem {
  product_id: string;
  name:        string;
  sku:         string;
  unit_price:  number;
  quantity:    number;
  line_total:  number;
  gst_rate:    number;
}

interface ShippingAddress {
  name:    string;
  phone:   string;
  line1:   string;
  line2?:  string;
  city:    string;
  state:   string;
  pincode: string;
  country: string;
}

interface PolicySnapshot {
  exchange_window_days: number;
  exchange_active:      boolean;
}

interface Order {
  id:                      string;
  order_number:            string;
  customer_id:             string | null;
  guest_email:             string | null;
  line_items:              LineItem[];
  subtotal:                number;
  discount_amount:         number;
  coupon_code:             string | null;
  shipping_amount:         number;
  gst_amount:              number;
  total:                   number;
  shipping_address:        ShippingAddress;
  payment_status:          string;
  payment_method:          string | null;
  fulfillment_status:      string;
  exchange_eligible_until: string | null;
  policy_snapshot:         PolicySnapshot;
  created_at:              string;
}

interface Settings {
  whatsapp_number?: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ConfirmationPage() {
  const params       = useParams<{ orderNumber: string }>();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const isLoggedIn   = useIsLoggedIn();

  const guestEmail   = searchParams.get('email') ?? undefined;
  const orderNumber  = params.orderNumber.toUpperCase();

  const [order, setOrder]           = useState<Order | null>(null);
  const [settings, setSettings]     = useState<Settings>({});
  const [loading, setLoading]       = useState(true);
  const [awaitingPhonePe, setAwaitingPhonePe] = useState(false);

  useEffect(() => {
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function load(isRetry = false) {
      try {
        const [orderRes, settingsRes] = await Promise.all([
          apiClient.get<{ data: Order }>(
            `/orders/${orderNumber}${guestEmail ? `?email=${encodeURIComponent(guestEmail)}` : ''}`,
          ),
          isRetry
            ? Promise.resolve(null)
            : apiClient.get<{ data: Settings }>('/settings/public').catch(() => null),
        ]);

        const fetchedOrder = orderRes.data.data;
        setOrder(fetchedOrder);
        if (settingsRes) {
          setSettings((settingsRes as { data: { data: Settings } }).data.data ?? {});
        }

        // PhonePe payments: poll until callback confirms payment (up to ~20s)
        if (
          fetchedOrder.payment_method === 'phonepe' &&
          fetchedOrder.payment_status === 'pending'
        ) {
          setAwaitingPhonePe(true);
          pollTimer = setTimeout(() => load(true), 3000);
        } else {
          setAwaitingPhonePe(false);
        }
      } catch {
        if (!isRetry) router.replace('/');
      } finally {
        if (!isRetry) setLoading(false);
      }
    }

    load();
    return () => { if (pollTimer) clearTimeout(pollTimer); };
  }, [orderNumber, guestEmail, router]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--kb-teal)' }} />
      </div>
    );
  }

  if (!order) return null;

  const isGuest        = !order.customer_id;
  const whatsappNumber = settings.whatsapp_number?.replace(/\D/g, '');
  const phone          = order.shipping_address.phone;

  const deliveryEta =
    order.shipping_address.pincode.startsWith('11') ||
    ['110','111','112','122','123','124','201','202','203','204','205','206','207','208'].includes(order.shipping_address.pincode.slice(0, 3))
      ? '2–3 business days'
      : '5–7 business days';

  return (
    <div className="min-h-screen py-10 px-4" style={{ background: 'var(--kb-cream)' }}>
      <div className="max-w-[600px] mx-auto space-y-6">

        {/* PhonePe payment pending banner */}
        {awaitingPhonePe && (
          <div className="rounded-2xl p-4 flex items-center gap-3 text-sm"
            style={{ background: 'rgba(200,151,26,0.08)', border: '1px solid rgba(200,151,26,0.3)', color: 'var(--kb-charcoal)' }}>
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin flex-shrink-0"
              style={{ borderColor: 'var(--kb-gold)' }} />
            Confirming your PhonePe payment…
          </div>
        )}

        {/* Header */}
        <div className="bg-white rounded-2xl p-8 shadow-sm text-center space-y-4">
          {/* Checkmark */}
          <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(39,174,96,0.1)' }}>
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--kb-success)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="font-display text-4xl font-semibold" style={{ color: 'var(--kb-charcoal)' }}>
            Order Confirmed!
          </h1>
          <p className="text-base" style={{ color: 'var(--kb-muted)' }}>
            Thank you, {order.shipping_address.name}
          </p>

          {/* Order number chip */}
          <div className="inline-block px-4 py-1.5 rounded-full border font-mono text-sm font-medium"
            style={{ borderColor: 'var(--kb-gold)', color: 'var(--kb-gold)' }}>
            #{order.order_number}
          </div>
        </div>

        {/* What Happens Next */}
        <div className="rounded-2xl p-6 space-y-4" style={{ background: 'rgba(26,107,107,0.06)', border: '1px solid rgba(26,107,107,0.15)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--kb-teal)' }}>What happens next?</h2>
          <ol className="space-y-3">
            {(order.payment_status === 'paid'
              ? [
                  'Payment received — your order is confirmed',
                  'We\'ll carefully pack and dispatch your order',
                  `Delivery: ${deliveryEta}`,
                  'You\'ll receive tracking details once shipped',
                ]
              : order.payment_status === 'authorized'
              ? [
                  'Your payment is authorized and funds are reserved',
                  'We\'ll review and confirm your order within 1 business day',
                  'Once confirmed we\'ll dispatch — your card is only charged then',
                  `Delivery: ${deliveryEta}`,
                ]
              : order.payment_method === 'phonepe'
              ? [
                  'Your PhonePe payment is being confirmed',
                  'This page will update automatically once confirmed',
                  'We\'ll pack and dispatch your order once payment clears',
                  `Delivery: ${deliveryEta}`,
                ]
              : [
                  'We\'ll review your order shortly',
                  `We'll WhatsApp you at ${phone} with payment instructions`,
                  'Once payment is confirmed, we\'ll dispatch your order',
                  `Delivery: ${deliveryEta}`,
                ]
            ).map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm" style={{ color: 'var(--kb-charcoal)' }}>
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: 'var(--kb-teal)' }}
                >
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Order Details (collapsible) */}
        <details open className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <summary className="flex items-center justify-between px-6 py-4 cursor-pointer font-medium" style={{ color: 'var(--kb-charcoal)' }}>
            <span>Order Details</span>
            <span className="text-sm font-normal" style={{ color: 'var(--kb-muted)' }}>{formatINR(Number(order.total))}</span>
          </summary>
          <div className="px-6 pb-6 space-y-4">
            {/* Items */}
            <div className="space-y-2">
              {order.line_items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span style={{ color: 'var(--kb-charcoal)' }}>
                    {item.name} × {item.quantity}
                  </span>
                  <span style={{ color: 'var(--kb-charcoal)' }}>{formatINR(item.line_total)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--kb-muted)' }}>
                  Subtotal <span className="text-xs">(incl. GST)</span>
                </span>
                <span>{formatINR(Number(order.subtotal))}</span>
              </div>
              {Number(order.gst_amount) > 0 && (
                <div className="flex justify-between text-xs pl-3">
                  <span style={{ color: 'var(--kb-muted)' }}>of which GST</span>
                  <span style={{ color: 'var(--kb-muted)' }}>{formatINR(Number(order.gst_amount))}</span>
                </div>
              )}
              {Number(order.discount_amount) > 0 && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--kb-success)' }}>{order.coupon_code}</span>
                  <span style={{ color: 'var(--kb-success)' }}>−{formatINR(Number(order.discount_amount))}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--kb-muted)' }}>Shipping</span>
                <span>{Number(order.shipping_amount) === 0 ? 'Free' : formatINR(Number(order.shipping_amount))}</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-gray-100 pt-2">
                <span>Total</span>
                <span>{formatINR(Number(order.total))}</span>
              </div>
            </div>
            {/* Shipping address */}
            <div className="pt-2 text-sm" style={{ color: 'var(--kb-muted)' }}>
              <p className="font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>Shipping to</p>
              <p>{order.shipping_address.name}</p>
              <p>{order.shipping_address.line1}{order.shipping_address.line2 ? `, ${order.shipping_address.line2}` : ''}</p>
              <p>{order.shipping_address.city}, {order.shipping_address.state} – {order.shipping_address.pincode}</p>
            </div>
          </div>
        </details>

        {/* Download invoice */}
        <button
          type="button"
          onClick={async () => {
            try {
              const url = `/api/orders/${orderNumber}/invoice${guestEmail ? `?email=${encodeURIComponent(guestEmail)}` : ''}`;
              const res = await apiClient.get(url, { responseType: 'blob' });
              const blob = new Blob([res.data as BlobPart], { type: 'application/pdf' });
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = `invoice-${orderNumber}.pdf`;
              link.click();
              URL.revokeObjectURL(link.href);
            } catch {
              alert('Could not download invoice. Please try again or contact us on WhatsApp.');
            }
          }}
          className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center justify-center gap-2 text-sm font-medium hover:bg-gray-50 transition-colors"
          style={{ color: 'var(--kb-teal)' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          Download Tax Invoice (PDF)
        </button>

        {/* Exchange Policy Note */}
        <div className="bg-white rounded-2xl p-5 shadow-sm text-sm space-y-1" style={{ color: 'var(--kb-charcoal)' }}>
          <p className="font-medium">Exchange Policy</p>
          <p style={{ color: 'var(--kb-muted)' }}>
            Exchange window: <strong>{order.policy_snapshot.exchange_window_days} days</strong> from delivery
          </p>
          <p style={{ color: 'var(--kb-muted)' }}>
            Keep original packaging. WhatsApp us to initiate an exchange.
          </p>
        </div>

        {/* Account creation prompt (guests only) */}
        {isGuest && !isLoggedIn && (
          <div className="rounded-2xl p-6 border" style={{ borderColor: 'rgba(26,107,107,0.3)', background: 'rgba(26,107,107,0.04)' }}>
            <h3 className="font-semibold mb-1" style={{ color: 'var(--kb-charcoal)' }}>
              Track your order easily
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--kb-muted)' }}>
              Create a free account — your order will be linked automatically.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href={`/account/register?email=${encodeURIComponent(guestEmail ?? '')}&order=${orderNumber}`}
                className="flex-1 text-center py-2.5 px-4 rounded-xl text-white text-sm font-medium"
                style={{ background: 'var(--kb-teal)' }}
              >
                Create Account
              </Link>
              <Link
                href={`/account/login?redirect=/account`}
                className="flex-1 text-center py-2.5 px-4 rounded-xl text-sm font-medium border"
                style={{ color: 'var(--kb-teal)', borderColor: 'var(--kb-teal)' }}
              >
                Sign In
              </Link>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="space-y-3">
          <Link
            href="/shop"
            className="block w-full text-center py-3.5 rounded-2xl text-white font-semibold"
            style={{ background: 'var(--kb-teal)' }}
          >
            Continue Shopping
          </Link>
          {whatsappNumber && (
            <a
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-3 text-sm font-medium underline"
              style={{ color: 'var(--kb-teal)' }}
            >
              WhatsApp Us
            </a>
          )}
        </div>

      </div>
    </div>
  );
}
