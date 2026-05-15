'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AccountLayout from '@/components/account/AccountLayout';
import { apiClient, formatINR } from '@/lib/api';

interface LineItem {
  product_id: string;
  name:        string;
  sku:         string;
  unit_price:  number;
  quantity:    number;
  line_total:  number;
}

interface ShippingAddress {
  name:    string;
  phone:   string;
  line1:   string;
  line2?:  string;
  city:    string;
  state:   string;
  pincode: string;
}

interface PolicySnapshot {
  exchange_window_days: number;
  exchange_active:      boolean;
}

interface Order {
  id:                      string;
  order_number:            string;
  line_items:              LineItem[];
  subtotal:                number | string;
  discount_amount:         number | string;
  coupon_code:             string | null;
  shipping_amount:         number | string;
  gst_amount:              number | string;
  total:                   number | string;
  shipping_address:        ShippingAddress;
  payment_status:          string;
  fulfillment_status:      string;
  courier_name:            string | null;
  tracking_number:         string | null;
  tracking_url:            string | null;
  fulfilled_at:            string | null;
  exchange_eligible_until: string | null;
  policy_snapshot:         PolicySnapshot;
  created_at:              string;
}

function Badge({ status, type }: { status: string; type: 'payment' | 'fulfillment' }) {
  const paymentMap: Record<string, [string, string]> = {
    pending_confirmation: ['Awaiting Payment', 'var(--kb-amber)'],
    paid:                 ['Paid',             'var(--kb-success)'],
    failed:               ['Failed',           'var(--kb-error)'],
    refunded:             ['Refunded',         'var(--kb-muted)'],
  };
  const fulfillmentMap: Record<string, [string, string]> = {
    unfulfilled:         ['Processing',  'var(--kb-muted)'],
    fulfilled:           ['Shipped',     'var(--kb-blue)'],
    delivered:           ['Delivered',   'var(--kb-success)'],
    cancelled:           ['Cancelled',   'var(--kb-error)'],
    partially_fulfilled: ['Part Shipped','var(--kb-blue)'],
  };
  const map = type === 'payment' ? paymentMap : fulfillmentMap;
  const [label, color] = map[status] ?? [status, 'var(--kb-muted)'];
  return (
    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ background: `${color}18`, color }}>
      {label}
    </span>
  );
}

export default function OrderDetailPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const [order, setOrder]   = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<{ data: Order }>(`/orders/${orderNumber}`)
      .then(r => setOrder(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orderNumber]);

  const canExchange = order &&
    order.fulfillment_status === 'fulfilled' &&
    order.policy_snapshot?.exchange_active === true &&
    order.exchange_eligible_until !== null &&
    new Date() <= new Date(order.exchange_eligible_until);

  return (
    <AccountLayout>
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--kb-teal)' }} />
        </div>
      ) : !order ? (
        <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
          <p style={{ color: 'var(--kb-muted)' }}>Order not found.</p>
          <Link href="/account/orders" className="mt-3 inline-block text-sm underline" style={{ color: 'var(--kb-teal)' }}>
            Back to orders
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Header */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-semibold" style={{ color: 'var(--kb-charcoal)' }}>
                  Order #{order.order_number}
                </h1>
                <p className="text-sm mt-1" style={{ color: 'var(--kb-muted)' }}>
                  Placed on {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge status={order.payment_status} type="payment" />
                <Badge status={order.fulfillment_status} type="fulfillment" />
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h2 className="font-semibold mb-4" style={{ color: 'var(--kb-charcoal)' }}>Items</h2>
            <div className="space-y-3">
              {order.line_items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="font-medium" style={{ color: 'var(--kb-charcoal)' }}>{item.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--kb-muted)' }}>
                      {item.sku} · Qty {item.quantity} × {formatINR(item.unit_price)}
                    </p>
                  </div>
                  <span className="font-medium whitespace-nowrap" style={{ color: 'var(--kb-charcoal)' }}>
                    {formatINR(item.line_total)}
                  </span>
                </div>
              ))}
            </div>
            {/* Price breakdown */}
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span style={{ color: 'var(--kb-muted)' }}>Subtotal</span>
                <span>{formatINR(Number(order.subtotal))}</span>
              </div>
              {Number(order.discount_amount) > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--kb-success)' }}>{order.coupon_code}</span>
                  <span style={{ color: 'var(--kb-success)' }}>−{formatINR(Number(order.discount_amount))}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span style={{ color: 'var(--kb-muted)' }}>Shipping</span>
                <span>{Number(order.shipping_amount) === 0 ? 'Free' : formatINR(Number(order.shipping_amount))}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--kb-muted)' }}>GST</span>
                <span>{formatINR(Number(order.gst_amount))}</span>
              </div>
              <div className="flex justify-between font-bold pt-1.5 border-t border-gray-100">
                <span>Total</span>
                <span>{formatINR(Number(order.total))}</span>
              </div>
            </div>

            {/* Tax invoice — only available once the order has shipped (fraud protection) */}
            {order.fulfilled_at ? (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await apiClient.get(`/orders/${order.order_number}/invoice`, { responseType: 'blob' });
                    const blob = new Blob([res.data as BlobPart], { type: 'application/pdf' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `invoice-${order.order_number}.pdf`;
                    link.click();
                    URL.revokeObjectURL(link.href);
                  } catch {
                    alert('Could not download invoice. Please try again later.');
                  }
                }}
                className="mt-4 w-full py-2.5 rounded-xl border text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                style={{ color: 'var(--kb-teal)', borderColor: 'rgba(26,107,107,0.3)' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                Download Tax Invoice (PDF)
              </button>
            ) : (
              <p className="mt-4 text-xs text-center" style={{ color: 'var(--kb-muted)' }}>
                Tax invoice will be available here once your order ships.
              </p>
            )}
          </div>

          {/* Shipping address */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h2 className="font-semibold mb-3" style={{ color: 'var(--kb-charcoal)' }}>Shipping Address</h2>
            <div className="text-sm space-y-0.5" style={{ color: 'var(--kb-muted)' }}>
              <p className="font-medium" style={{ color: 'var(--kb-charcoal)' }}>{order.shipping_address.name}</p>
              <p>{order.shipping_address.line1}</p>
              {order.shipping_address.line2 && <p>{order.shipping_address.line2}</p>}
              <p>{order.shipping_address.city}, {order.shipping_address.state} – {order.shipping_address.pincode}</p>
              <p>📞 {order.shipping_address.phone}</p>
            </div>
          </div>

          {/* Tracking (if fulfilled) */}
          {order.fulfillment_status === 'fulfilled' && (order.courier_name || order.tracking_number) && (
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="font-semibold mb-3" style={{ color: 'var(--kb-charcoal)' }}>Tracking</h2>
              <div className="text-sm space-y-1" style={{ color: 'var(--kb-muted)' }}>
                {order.courier_name && <p>Courier: <strong>{order.courier_name}</strong></p>}
                {order.tracking_number && (
                  <p>
                    Tracking: {' '}
                    {order.tracking_url ? (
                      <a href={order.tracking_url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--kb-teal)' }}>
                        {order.tracking_number}
                      </a>
                    ) : (
                      <strong>{order.tracking_number}</strong>
                    )}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Exchange eligibility */}
          {order.exchange_eligible_until && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <p className="text-sm" style={{ color: 'var(--kb-muted)' }}>
                Exchange eligible until:{' '}
                <strong style={{ color: 'var(--kb-charcoal)' }}>
                  {new Date(order.exchange_eligible_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                </strong>
              </p>
              {canExchange && (
                <Link
                  href={`/account/orders/${order.order_number}/exchange`}
                  className="mt-3 inline-block px-4 py-2 rounded-xl text-sm font-medium text-white"
                  style={{ background: 'var(--kb-teal)' }}
                >
                  Request Exchange
                </Link>
              )}
            </div>
          )}

          {!order.exchange_eligible_until && order.fulfillment_status !== 'fulfilled' && (
            <div className="text-xs px-4 py-3 rounded-xl" style={{ background: 'rgba(26,107,107,0.06)', color: 'var(--kb-muted)' }}>
              Exchange window: {order.policy_snapshot?.exchange_window_days ?? 7} days from delivery
            </div>
          )}
        </div>
      )}
    </AccountLayout>
  );
}
