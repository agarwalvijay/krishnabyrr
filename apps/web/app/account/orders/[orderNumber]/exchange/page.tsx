'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AccountLayout from '@/components/account/AccountLayout';
import { apiClient, formatINR } from '@/lib/api';

const REASONS = [
  { value: 'wrong_size',               label: 'Wrong size' },
  { value: 'fabric_defect',            label: 'Fabric defect' },
  { value: 'different_from_description', label: 'Different from description' },
  { value: 'other',                    label: 'Other' },
] as const;

interface LineItem {
  product_id: string;
  name:        string;
  quantity:    number;
  unit_price:  number;
}

interface Order {
  id:                      string;
  order_number:            string;
  line_items:              LineItem[];
  exchange_eligible_until: string | null;
  policy_snapshot:         { exchange_window_days: number; exchange_active: boolean };
  shipping_address:        { name: string };
}

interface SelectedItem { productId: string; qty: number; maxQty: number; name: string }

export default function ExchangePage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const router = useRouter();

  const [order, setOrder]         = useState<Order | null>(null);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<Record<string, SelectedItem>>({});
  const [reason, setReason]       = useState('');
  const [notes, setNotes]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]     = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<{ data: Order }>(`/orders/${orderNumber}`)
      .then(r => { setOrder(r.data.data); })
      .catch(() => router.replace('/account/orders'))
      .finally(() => setLoading(false));
  }, [orderNumber, router]);

  const toggleItem = useCallback((item: LineItem) => {
    setSelected(prev => {
      if (prev[item.product_id]) {
        const next = { ...prev };
        delete next[item.product_id];
        return next;
      }
      return { ...prev, [item.product_id]: { productId: item.product_id, qty: 1, maxQty: item.quantity, name: item.name } };
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!order) return;
    if (Object.keys(selected).length === 0) { setError('Please select at least one item.'); return; }
    if (!reason) { setError('Please select a reason.'); return; }

    setSubmitting(true);
    setError(null);
    try {
      const res = await apiClient.post<{ data: { exchange_number: string } }>('/exchanges', {
        order_id: order.id,
        items: Object.values(selected).map(i => ({ product_id: i.productId, quantity: i.qty })),
        reason,
        customer_notes: notes || undefined,
      });
      setSuccess(res.data.data.exchange_number);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr?.response?.data?.error?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [order, selected, reason, notes]);

  return (
    <AccountLayout title="Request Exchange">
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--kb-teal)' }} />
        </div>
      ) : success ? (
        <div className="bg-white rounded-2xl p-8 shadow-sm text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(39,174,96,0.1)' }}>
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--kb-success)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-display text-2xl font-semibold" style={{ color: 'var(--kb-charcoal)' }}>
            Exchange request submitted!
          </h2>
          <p className="text-sm" style={{ color: 'var(--kb-muted)' }}>
            We&apos;ll contact you within 24 hours.
          </p>
          <p className="font-mono text-sm font-medium px-3 py-1.5 rounded-full inline-block" style={{ background: 'rgba(200,151,26,0.1)', color: 'var(--kb-gold)' }}>
            {success}
          </p>
        </div>
      ) : order && (
        <div className="bg-white rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--kb-charcoal)' }}>Order #{order.order_number}</p>
            <p className="text-xs" style={{ color: 'var(--kb-muted)' }}>
              Exchange eligible until{' '}
              {order.exchange_eligible_until
                ? new Date(order.exchange_eligible_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                : '—'}
            </p>
          </div>

          {/* Item selection */}
          <div>
            <h3 className="font-medium mb-3 text-sm" style={{ color: 'var(--kb-charcoal)' }}>Select items to exchange</h3>
            <div className="space-y-2">
              {order.line_items.map(item => {
                const sel = selected[item.product_id];
                return (
                  <div key={item.product_id} className="border rounded-xl p-3" style={{ borderColor: sel ? 'var(--kb-teal)' : '#e5e7eb' }}>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!sel}
                        onChange={() => toggleItem(item)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium" style={{ color: 'var(--kb-charcoal)' }}>{item.name}</p>
                        <p className="text-xs" style={{ color: 'var(--kb-muted)' }}>
                          Qty ordered: {item.quantity} · {formatINR(item.unit_price)} each
                        </p>
                      </div>
                    </label>
                    {sel && item.quantity > 1 && (
                      <div className="mt-2 ml-6 flex items-center gap-2">
                        <label className="text-xs" style={{ color: 'var(--kb-muted)' }}>Qty to exchange:</label>
                        <select
                          value={sel.qty}
                          onChange={e => setSelected(prev => ({ ...prev, [item.product_id]: { ...prev[item.product_id], qty: parseInt(e.target.value) } }))}
                          className="text-sm border rounded-lg px-2 py-1"
                        >
                          {Array.from({ length: item.quantity }, (_, i) => i + 1).map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block font-medium text-sm mb-2" style={{ color: 'var(--kb-charcoal)' }}>Reason</label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none"
            >
              <option value="">Select a reason</option>
              {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-medium text-sm mb-2" style={{ color: 'var(--kb-charcoal)' }}>
              Additional notes <span className="text-xs font-normal" style={{ color: 'var(--kb-muted)' }}>(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Any additional details…"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none resize-none"
            />
            <p className="text-xs mt-1 text-right" style={{ color: 'var(--kb-muted)' }}>{notes.length}/500</p>
          </div>

          {error && (
            <p className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(192,57,43,0.08)', color: 'var(--kb-error)' }}>
              {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-60"
            style={{ background: 'var(--kb-teal)' }}
          >
            {submitting ? 'Submitting…' : 'Submit Exchange Request'}
          </button>
        </div>
      )}
    </AccountLayout>
  );
}
