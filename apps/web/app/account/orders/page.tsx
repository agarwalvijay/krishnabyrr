'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AccountLayout from '@/components/account/AccountLayout';
import { apiClient, formatINR } from '@/lib/api';

interface Order {
  id:                 string;
  order_number:       string;
  total:              number | string;
  subtotal:           number | string;
  payment_status:     string;
  fulfillment_status: string;
  created_at:         string;
}

function Badge({ status, type }: { status: string; type: 'payment' | 'fulfillment' }) {
  const paymentMap: Record<string, [string, string]> = {
    pending_confirmation: ['Awaiting Payment', 'var(--kb-amber)'],
    paid:                 ['Paid',             'var(--kb-success)'],
    failed:               ['Failed',           'var(--kb-error)'],
  };
  const fulfillmentMap: Record<string, [string, string]> = {
    unfulfilled: ['Processing', 'var(--kb-muted)'],
    fulfilled:   ['Shipped',    'var(--kb-blue)'],
    delivered:   ['Delivered',  'var(--kb-success)'],
  };
  const map  = type === 'payment' ? paymentMap : fulfillmentMap;
  const [label, color] = map[status] ?? [status, 'var(--kb-muted)'];
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: `${color}18`, color }}>
      {label}
    </span>
  );
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<{ data: Order[] }>('/orders')
      .then(r => setOrders(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <AccountLayout title="My Orders">
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--kb-teal)' }} />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
          <p className="text-sm mb-3" style={{ color: 'var(--kb-muted)' }}>No orders yet.</p>
          <Link href="/shop" className="text-sm font-medium underline" style={{ color: 'var(--kb-teal)' }}>
            Start shopping →
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead style={{ background: 'var(--kb-cream)' }}>
                <tr>
                  {['Order', 'Date', 'Total', 'Payment', 'Fulfillment', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium" style={{ color: 'var(--kb-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium" style={{ color: 'var(--kb-charcoal)' }}>
                      #{order.order_number}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--kb-muted)' }}>
                      {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--kb-charcoal)' }}>
                      {formatINR(Number(order.total))}
                    </td>
                    <td className="px-4 py-3">
                      <Badge status={order.payment_status} type="payment" />
                    </td>
                    <td className="px-4 py-3">
                      <Badge status={order.fulfillment_status} type="fulfillment" />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/account/orders/${order.order_number}`}
                        className="text-sm underline font-medium"
                        style={{ color: 'var(--kb-teal)' }}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {orders.map(order => (
              <div key={order.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <p className="font-mono font-medium" style={{ color: 'var(--kb-charcoal)' }}>
                    #{order.order_number}
                  </p>
                  <span className="font-semibold" style={{ color: 'var(--kb-charcoal)' }}>
                    {formatINR(Number(order.total))}
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--kb-muted)' }}>
                  {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Badge status={order.payment_status} type="payment" />
                  <Badge status={order.fulfillment_status} type="fulfillment" />
                </div>
                <Link
                  href={`/account/orders/${order.order_number}`}
                  className="block text-sm text-center py-2 rounded-xl border font-medium"
                  style={{ color: 'var(--kb-teal)', borderColor: 'var(--kb-teal)' }}
                >
                  View Details
                </Link>
              </div>
            ))}
          </div>
        </>
      )}
    </AccountLayout>
  );
}
