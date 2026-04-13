'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AccountLayout from '@/components/account/AccountLayout';
import { useCustomer } from '@/contexts/AuthContext';
import { apiClient, formatINR } from '@/lib/api';

interface Order {
  id:                 string;
  order_number:       string;
  total:              number | string;
  payment_status:     string;
  fulfillment_status: string;
  created_at:         string;
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ background: `${color}18`, color }}>
      {label}
    </span>
  );
}

function paymentLabel(status: string) {
  const map: Record<string, [string, string]> = {
    pending_confirmation: ['Awaiting Payment', 'var(--kb-amber)'],
    paid:                 ['Paid',             'var(--kb-success)'],
    failed:               ['Failed',           'var(--kb-error)'],
  };
  return map[status] ?? [status, 'var(--kb-muted)'];
}

export default function AccountDashboard() {
  const customer = useCustomer();
  const [orders, setOrders]           = useState<Order[]>([]);
  const [wishlistCount, setWishlistCount] = useState<number>(0);

  useEffect(() => {
    apiClient.get<{ data: Order[] }>('/orders').then(r => setOrders(r.data.data)).catch(() => {});
    apiClient.get<{ data: unknown[] }>('/account/wishlist').then(r => setWishlistCount(r.data.data.length)).catch(() => {});
  }, []);

  const lastOrder = orders[0];
  const [payStatus, payColor] = lastOrder ? paymentLabel(lastOrder.payment_status) : ['', ''];

  return (
    <AccountLayout title={`Welcome back, ${customer?.name ?? ''}!`}>
      <div className="space-y-6">
        {/* Quick-link cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Orders',   value: customer?.total_orders ?? orders.length, href: '/account/orders',    icon: '📦' },
            { label: 'Wishlist', value: wishlistCount,                            href: '/account/wishlist',  icon: '♡' },
            { label: 'Profile',  value: '',                                       href: '/account/profile',   icon: '👤' },
          ].map(card => (
            <Link
              key={card.href}
              href={card.href}
              className="bg-white rounded-2xl p-5 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow"
            >
              <span className="text-2xl">{card.icon}</span>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--kb-charcoal)' }}>{card.label}</p>
                {card.value !== '' && (
                  <p className="text-xl font-bold mt-0.5" style={{ color: 'var(--kb-teal)' }}>{card.value}</p>
                )}
              </div>
            </Link>
          ))}
        </div>

        {/* Last order preview */}
        {lastOrder && (
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h2 className="font-semibold mb-4" style={{ color: 'var(--kb-charcoal)' }}>Latest Order</h2>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="font-mono text-sm font-medium" style={{ color: 'var(--kb-charcoal)' }}>
                  #{lastOrder.order_number}
                </p>
                <p className="text-xs" style={{ color: 'var(--kb-muted)' }}>
                  {new Date(lastOrder.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <StatusBadge label={payStatus} color={payColor} />
                <span className="font-semibold" style={{ color: 'var(--kb-charcoal)' }}>
                  {formatINR(Number(lastOrder.total))}
                </span>
              </div>
              <Link
                href={`/account/orders/${lastOrder.order_number}`}
                className="text-sm underline font-medium"
                style={{ color: 'var(--kb-teal)' }}
              >
                View Details →
              </Link>
            </div>
          </div>
        )}

        {orders.length === 0 && (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <p className="text-sm mb-3" style={{ color: 'var(--kb-muted)' }}>You haven&apos;t placed any orders yet.</p>
            <Link href="/shop" className="text-sm font-medium underline" style={{ color: 'var(--kb-teal)' }}>
              Start shopping →
            </Link>
          </div>
        )}
      </div>
    </AccountLayout>
  );
}
