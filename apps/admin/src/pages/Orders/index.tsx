import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/Layout/AdminLayout';
import { api } from '../../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderRow {
  id: string;
  order_number: string;
  created_at: string;
  payment_status: string;
  fulfillment_status: string;
  total: string;
  customer_email: string;
  customer_name: string;
  coupon_code: string | null;
  courier_name: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
}

interface OrderDetail extends OrderRow {
  subtotal: string;
  discount_amount: string;
  shipping_amount: string;
  gst_amount: string;
  line_items: unknown[];
  shipping_address: Record<string, string>;
  admin_notes: string | null;
  fulfilled_at: string | null;
  exchange_eligible_until: string | null;
  exchanges: ExchangeRow[];
}

interface ExchangeRow {
  id: string;
  exchange_number: string;
  status: string;
  reason: string;
  customer_notes: string | null;
  admin_notes: string | null;
  created_at: string;
}

interface Meta { total: number; page: number; limit: number; pages: number }

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAYMENT_COLORS: Record<string, string> = {
  paid:                 'bg-green-50 text-green-700',
  pending_confirmation: 'bg-amber-50 text-amber-700',
  failed:               'bg-red-50 text-red-700',
  refunded:             'bg-gray-50 text-gray-600',
};
const FULFIL_COLORS: Record<string, string> = {
  unfulfilled:          'bg-gray-50 text-gray-600',
  partially_fulfilled:  'bg-blue-50 text-blue-700',
  fulfilled:            'bg-green-50 text-green-700',
  cancelled:            'bg-red-50 text-red-700',
};

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}

function fmt(amount: string | number) {
  return `₹${parseFloat(String(amount)).toLocaleString('en-IN')}`;
}

// ── Order Detail Slide-Over ───────────────────────────────────────────────────

function OrderDetail({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [fulfillmentStatus, setFulfillmentStatus] = useState('');
  const [paymentStatus, setPaymentStatus]         = useState('');
  const [courierName, setCourierName]             = useState('');
  const [trackingNumber, setTrackingNumber]       = useState('');
  const [trackingUrl, setTrackingUrl]             = useState('');
  const [adminNotes, setAdminNotes]               = useState('');
  const [initialized, setInitialized]             = useState(false);

  const { data, isLoading } = useQuery<{ data: OrderDetail }>({
    queryKey: ['admin-order', orderId],
    queryFn: async () => {
      const result = await api.get<{ data: OrderDetail }>(`/admin/orders/${orderId}`);
      if (!initialized) {
        const o = result.data.data;
        setFulfillmentStatus(o.fulfillment_status);
        setPaymentStatus(o.payment_status);
        setCourierName(o.courier_name ?? '');
        setTrackingNumber(o.tracking_number ?? '');
        setTrackingUrl(o.tracking_url ?? '');
        setAdminNotes(o.admin_notes ?? '');
        setInitialized(true);
      }
      return result.data;
    },
  });

  const patchMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.patch(`/admin/orders/${orderId}`, payload),
    onSuccess: () => {
      toast.success('Order updated');
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-order', orderId] });
    },
    onError: () => toast.error('Update failed'),
  });

  const order = (data as { data: OrderDetail } | undefined)?.data;

  const handleSave = () => {
    patchMutation.mutate({
      fulfillment_status: fulfillmentStatus,
      payment_status:     paymentStatus,
      courier_name:       courierName || null,
      tracking_number:    trackingNumber || null,
      tracking_url:       trackingUrl || null,
      admin_notes:        adminNotes || null,
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-50 w-full max-w-xl bg-white shadow-xl overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <div>
            <h2 className="font-semibold text-kb-charcoal text-base">
              {isLoading ? 'Loading…' : order?.order_number}
            </h2>
            {order && (
              <p className="text-xs text-kb-muted mt-0.5">
                {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' · '}{order.customer_email}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-gray-50 text-kb-muted">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isLoading && (
          <div className="flex justify-center p-12">
            <div className="w-8 h-8 border-4 border-kb-teal border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {order && (
          <div className="flex-1 px-5 py-5 space-y-6">
            {/* Totals */}
            <section>
              <h3 className="text-sm font-semibold text-kb-charcoal mb-3">Order Summary</h3>
              <div className="bg-kb-cream rounded-lg p-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-kb-muted">Subtotal</span><span>{fmt(order.subtotal)}</span></div>
                {parseFloat(order.discount_amount) > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>Discount {order.coupon_code ? `(${order.coupon_code})` : ''}</span>
                    <span>−{fmt(order.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between"><span className="text-kb-muted">Shipping</span><span>{parseFloat(order.shipping_amount) === 0 ? 'Free' : fmt(order.shipping_amount)}</span></div>
                <div className="flex justify-between"><span className="text-kb-muted">GST</span><span>{fmt(order.gst_amount)}</span></div>
                <div className="flex justify-between font-semibold border-t border-gray-200 pt-1.5 mt-1.5">
                  <span>Total</span><span>{fmt(order.total)}</span>
                </div>
              </div>
            </section>

            {/* Shipping address */}
            <section>
              <h3 className="text-sm font-semibold text-kb-charcoal mb-2">Ship To</h3>
              <div className="text-sm text-kb-muted leading-6">
                {[
                  order.shipping_address?.name,
                  order.shipping_address?.line1,
                  order.shipping_address?.line2,
                  `${order.shipping_address?.city}, ${order.shipping_address?.state} ${order.shipping_address?.pincode}`,
                  order.shipping_address?.phone,
                ].filter(Boolean).join('\n').split('\n').map((line, i) => <div key={i}>{line}</div>)}
              </div>
            </section>

            {/* Status controls */}
            <section>
              <h3 className="text-sm font-semibold text-kb-charcoal mb-3">Update Status</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-kb-muted mb-1">Payment</label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-kb-teal/30 focus:border-kb-teal outline-none"
                  >
                    {['pending_confirmation', 'paid', 'failed', 'refunded'].map((s) => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-kb-muted mb-1">Fulfillment</label>
                  <select
                    value={fulfillmentStatus}
                    onChange={(e) => setFulfillmentStatus(e.target.value)}
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-kb-teal/30 focus:border-kb-teal outline-none"
                  >
                    {['unfulfilled', 'partially_fulfilled', 'fulfilled', 'cancelled'].map((s) => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* Tracking */}
            <section>
              <h3 className="text-sm font-semibold text-kb-charcoal mb-3">Tracking</h3>
              <div className="space-y-2">
                {[
                  { label: 'Courier', value: courierName, setter: setCourierName, placeholder: 'e.g. Shiprocket' },
                  { label: 'Tracking Number', value: trackingNumber, setter: setTrackingNumber, placeholder: '' },
                  { label: 'Tracking URL', value: trackingUrl, setter: setTrackingUrl, placeholder: 'https://' },
                ].map(({ label, value, setter, placeholder }) => (
                  <div key={label}>
                    <label className="block text-xs text-kb-muted mb-1">{label}</label>
                    <input
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      placeholder={placeholder}
                      className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-kb-teal/30 focus:border-kb-teal outline-none"
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Admin notes */}
            <section>
              <label className="block text-sm font-semibold text-kb-charcoal mb-2">Admin Notes</label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-kb-teal/30 focus:border-kb-teal outline-none resize-none"
              />
            </section>

            {/* Exchanges */}
            {order.exchanges.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-kb-charcoal mb-3">Exchange Requests</h3>
                <div className="space-y-2">
                  {order.exchanges.map((ex: ExchangeRow) => (
                    <div key={ex.id} className="border border-gray-100 rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-kb-charcoal">{ex.exchange_number}</span>
                        <Badge label={ex.status} colorClass={FULFIL_COLORS[ex.status] ?? 'bg-gray-50 text-gray-600'} />
                      </div>
                      <p className="text-kb-muted text-xs">{ex.reason}</p>
                      {ex.customer_notes && <p className="text-kb-muted text-xs mt-0.5">"{ex.customer_notes}"</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex gap-3">
          <button
            onClick={handleSave}
            disabled={patchMutation.isPending}
            className="flex-1 py-2.5 rounded-lg bg-kb-teal text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {patchMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-kb-muted hover:border-gray-300">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [page, setPage]                       = useState(1);
  const [paymentFilter, setPaymentFilter]     = useState('');
  const [fulfillFilter, setFulfillFilter]     = useState('');
  const [q, setQ]                             = useState('');
  const [searchInput, setSearchInput]         = useState('');

  const queryKey = ['admin-orders', page, paymentFilter, fulfillFilter, q];

  const { data, isLoading } = useQuery<{ data: OrderRow[]; meta: Meta }>({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (paymentFilter) params.set('payment_status', paymentFilter);
      if (fulfillFilter) params.set('fulfillment_status', fulfillFilter);
      if (q)             params.set('q', q);
      return api.get(`/admin/orders?${params}`).then((r) => r.data);
    },
  });

  const orders = data?.data ?? [];
  const meta   = data?.meta;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQ(searchInput);
    setPage(1);
  };

  return (
    <AdminLayout title="Orders">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-52">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Order # or email…"
            className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-kb-teal/30 focus:border-kb-teal outline-none"
          />
          <button type="submit" className="px-4 py-2 text-sm bg-kb-teal text-white rounded-md hover:opacity-90">Search</button>
        </form>
        <select
          value={paymentFilter}
          onChange={(e) => { setPaymentFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">All payment</option>
          <option value="pending_confirmation">Pending</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
        <select
          value={fulfillFilter}
          onChange={(e) => { setFulfillFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">All fulfillment</option>
          <option value="unfulfilled">Unfulfilled</option>
          <option value="partially_fulfilled">Partial</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="w-8 h-8 border-4 border-kb-teal border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 text-kb-muted text-sm">No orders found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-kb-cream/60">
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Order</th>
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Date</th>
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Payment</th>
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Fulfillment</th>
                <th className="text-right px-4 py-3 font-medium text-kb-muted">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedOrderId(order.id)}
                >
                  <td className="px-4 py-3 font-medium text-kb-teal">{order.order_number}</td>
                  <td className="px-4 py-3 text-kb-charcoal max-w-[180px] truncate">
                    <div>{order.customer_name}</div>
                    <div className="text-xs text-kb-muted truncate">{order.customer_email}</div>
                  </td>
                  <td className="px-4 py-3 text-kb-muted">
                    {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={order.payment_status} colorClass={PAYMENT_COLORS[order.payment_status] ?? 'bg-gray-50 text-gray-600'} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={order.fulfillment_status} colorClass={FULFIL_COLORS[order.fulfillment_status] ?? 'bg-gray-50 text-gray-600'} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{fmt(order.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {meta && meta.pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-kb-muted">
            Page {meta.page} of {meta.pages} · {meta.total} orders
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md disabled:opacity-40 hover:bg-gray-50"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
              disabled={page === meta.pages}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md disabled:opacity-40 hover:bg-gray-50"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Detail slide-over */}
      {selectedOrderId && (
        <OrderDetail orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
      )}
    </AdminLayout>
  );
}
