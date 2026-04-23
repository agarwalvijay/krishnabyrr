'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import AccountLayout from '@/components/account/AccountLayout';
import { useCustomer } from '@/contexts/AuthContext';
import { apiClient, formatINR, type Customer } from '@/lib/api';

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

// ── Phone verification banner ─────────────────────────────────────────────────

function PhoneVerificationBanner({ phone }: { phone: string }) {
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const resend = async () => {
    setSending(true);
    setError(null);
    try {
      await apiClient.post('/auth/send-verification');
      setSent(true);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Failed to send. Please try again.';
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3"
      style={{ background: 'rgba(191,155,48,0.10)', border: '1px solid rgba(191,155,48,0.3)' }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--kb-charcoal)' }}>
          Verify your WhatsApp number
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--kb-muted)' }}>
          We sent a verification link to +91 {phone}. Tap it in WhatsApp to confirm your number.
        </p>
        {sent  && <p className="text-xs mt-1 font-medium" style={{ color: 'var(--kb-success)' }}>New link sent!</p>}
        {error && <p className="text-xs mt-1" style={{ color: 'var(--kb-error)' }}>{error}</p>}
      </div>
      <button
        onClick={resend}
        disabled={sending}
        className="text-xs font-semibold px-4 py-2 rounded-xl whitespace-nowrap disabled:opacity-50 transition-opacity"
        style={{ background: 'var(--kb-gold)', color: '#fff' }}
      >
        {sending ? 'Sending…' : 'Resend link'}
      </button>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function AccountDashboard() {
  const customer = useCustomer();
  const [orders, setOrders]               = useState<Order[]>([]);
  const [wishlistCount, setWishlistCount] = useState<number>(0);
  const [phoneVerified, setPhoneVerified] = useState<boolean>(customer?.phone_verified ?? true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll /auth/me every 4s while phone is unverified — detects when user taps the link
  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiClient.get<{ data: Customer }>('/auth/me');
        if (res.data.data.phone_verified) {
          setPhoneVerified(true);
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      } catch {}
    }, 4000);
  }, []);

  useEffect(() => {
    if (customer && !customer.phone_verified) {
      setPhoneVerified(false);
      startPolling();
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [customer, startPolling]);

  useEffect(() => {
    apiClient.get<{ data: Order[] }>('/orders').then(r => setOrders(r.data.data)).catch(() => {});
    apiClient.get<{ data: unknown[] }>('/account/wishlist').then(r => setWishlistCount(r.data.data.length)).catch(() => {});
  }, []);

  const lastOrder = orders[0];
  const [payStatus, payColor] = lastOrder ? paymentLabel(lastOrder.payment_status) : ['', ''];

  return (
    <AccountLayout title={`Welcome back, ${customer?.name ?? ''}!`}>
      <div className="space-y-6">
        {/* Phone verification banner — shown until user taps the WhatsApp link */}
        {!phoneVerified && customer?.phone && (
          <PhoneVerificationBanner phone={customer.phone} />
        )}

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
