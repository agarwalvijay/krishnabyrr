import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/Layout/AdminLayout';
import { api } from '../../lib/api';
import { useDebounce } from '../../lib/hooks';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderRow {
  id: string;
  order_number: string;
  created_at: string;
  payment_status: string;
  payment_method: string | null;
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
  refunds: RefundRow[];
  razorpay_payment_id: string | null;
  razorpay_authorized_at: string | null;
  phonepe_transaction_id: string | null;
  refunded_amount: string;
  captured_amount: string | null;
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

interface RefundRow {
  id: string;
  amount: string;
  razorpay_refund_id: string | null;
  notes: string | null;
  created_at: string;
}

interface Meta { total: number; page: number; limit: number; pages: number }

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAYMENT_COLORS: Record<string, string> = {
  paid:                 'bg-green-50 text-green-700',
  authorized:           'bg-blue-50 text-blue-700',
  pending_confirmation: 'bg-amber-50 text-amber-700',
  failed:               'bg-red-50 text-red-700',
  refunded:             'bg-gray-50 text-gray-600',
  voided:               'bg-gray-50 text-gray-500',
};

const METHOD_LABELS: Record<string, { label: string; cls: string }> = {
  razorpay: { label: 'Razorpay',  cls: 'bg-blue-50 text-blue-700' },
  phonepe:  { label: 'PhonePe',   cls: 'bg-purple-50 text-purple-700' },
  manual:   { label: 'Manual',    cls: 'bg-gray-50 text-gray-600' },
};

function PaymentMethodBadge({ method }: { method: string | null }) {
  if (!method) return null;
  const m = METHOD_LABELS[method] ?? { label: method, cls: 'bg-gray-50 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}
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
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [refundAmount, setRefundAmount]           = useState('');
  const [captureAmount, setCaptureAmount]         = useState('');
  const refundInputRef                            = useRef<HTMLInputElement>(null);

  // Initiate-exchange-on-customer's-behalf state
  const [showExchangeForm, setShowExchangeForm]     = useState(false);
  const [exItemQtys, setExItemQtys]                 = useState<Record<string, number>>({});
  const [exReason, setExReason]                     = useState('fabric_defect');
  const [exCustomerNotes, setExCustomerNotes]       = useState('');
  const [exAdminNotes, setExAdminNotes]             = useState('');

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

  const cancelMutation = useMutation({
    mutationFn: (forceNoRefund: boolean) =>
      api.post(`/admin/orders/${orderId}/cancel`, forceNoRefund ? { force_no_refund: true } : {}),
    onSuccess: (resp) => {
      const { refund_issued, refund_warning } = (resp.data as { data: { refund_issued: boolean; refund_warning?: string } }).data;
      if (refund_warning) {
        toast(refund_warning, { duration: 8000, icon: '⚠️' });
      } else {
        toast.success(refund_issued ? 'Order cancelled and refund issued' : 'Order cancelled');
      }
      setShowCancelConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-order', orderId] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      // The backend now refuses to half-cancel when refund fails. Show the
      // full message so the admin knows their options (retry, manual + force).
      toast.error(msg ?? 'Cancel failed', { duration: 12_000 });
      // Don't hide the confirm panel on error — admin can switch to force mode.
    },
  });

  const refundMutation = useMutation({
    mutationFn: (amount: number | null) => api.post(`/admin/orders/${orderId}/refund`, { amount }),
    onSuccess: () => {
      toast.success('Refund issued successfully');
      setRefundAmount('');
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-order', orderId] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? 'Refund failed');
    },
  });

  const captureMutation = useMutation({
    mutationFn: (amount: number | null) => api.post(`/admin/orders/${orderId}/capture`, { amount }),
    onSuccess: () => {
      toast.success('Payment captured — order is now paid');
      setCaptureAmount('');
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-order', orderId] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? 'Capture failed');
    },
  });

  const voidMutation = useMutation({
    mutationFn: () => api.post(`/admin/orders/${orderId}/void`, {}),
    onSuccess: () => {
      toast.success('Authorization voided — order cancelled, inventory restored');
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-order', orderId] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? 'Void failed');
    },
  });

  const initiateExchangeMutation = useMutation({
    mutationFn: (body: { items: Array<{ product_id: string; quantity: number }>; reason: string; customer_notes?: string; admin_notes?: string }) =>
      api.post(`/admin/orders/${orderId}/exchanges`, body),
    onSuccess: () => {
      toast.success('Exchange created — customer notified');
      setShowExchangeForm(false);
      setExItemQtys({});
      setExCustomerNotes('');
      setExAdminNotes('');
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['admin-exchanges'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? 'Could not create exchange');
    },
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
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <p className="text-xs text-kb-muted">
                  {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' · '}{order.customer_email}
                </p>
                <PaymentMethodBadge method={order.payment_method} />
              </div>
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
                {order.captured_amount && parseFloat(order.captured_amount) < parseFloat(order.total) - 0.01 && (
                  <div className="flex justify-between text-xs text-blue-700 border-t border-gray-100 pt-1.5 mt-0.5">
                    <span>Captured</span>
                    <span className="font-medium">{fmt(order.captured_amount)} <span className="font-normal text-kb-muted">(partial — {fmt(parseFloat(order.total) - parseFloat(order.captured_amount))} released)</span></span>
                  </div>
                )}
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

            {/* Refund history — show even when fully refunded */}
            {(order.refunds?.length > 0 || (order.payment_status === 'paid' && order.razorpay_payment_id)) && (() => {
              const total     = parseFloat(order.total);
              const refunded  = parseFloat(order.refunded_amount ?? '0');
              const remaining = total - refunded;
              const canRefund = order.payment_status === 'paid' && order.razorpay_payment_id && remaining > 0;

              return (
                <section className="border border-amber-200 rounded-xl p-4 bg-amber-50/50">
                  <h3 className="text-sm font-semibold text-kb-charcoal mb-3">Refunds</h3>

                  {/* Individual refund transactions */}
                  {order.refunds?.length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {order.refunds.map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-sm">
                          <div>
                            <span className="font-medium text-kb-charcoal">{fmt(r.amount)}</span>
                            {r.notes && <span className="text-kb-muted text-xs ml-1.5">· {r.notes}</span>}
                            {r.razorpay_refund_id && (
                              <span className="text-kb-muted text-xs ml-1.5 font-mono">{r.razorpay_refund_id}</span>
                            )}
                          </div>
                          <span className="text-xs text-kb-muted whitespace-nowrap ml-3">
                            {new Date(r.created_at).toLocaleString('en-IN', {
                              day: 'numeric', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs text-kb-muted border-t border-amber-200 pt-1.5 mt-1.5">
                        <span>Total refunded</span>
                        <span className="font-medium">{fmt(refunded)}{remaining > 0 ? ` · ₹${remaining.toFixed(0)} remaining` : ' · Fully refunded'}</span>
                      </div>
                    </div>
                  )}

                  {/* Issue new refund — only when balance remains */}
                  {canRefund && (
                    <div className="flex gap-2 items-end pt-1">
                      <div className="flex-1">
                        <label className="block text-xs text-kb-muted mb-1">
                          Amount (₹) — leave blank for full {fmt(remaining)}
                        </label>
                        <input
                          ref={refundInputRef}
                          type="number"
                          min={1}
                          max={remaining}
                          step={0.01}
                          value={refundAmount}
                          onChange={(e) => setRefundAmount(e.target.value)}
                          placeholder={remaining.toFixed(2)}
                          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none"
                        />
                      </div>
                      <button
                        onClick={() => {
                          const amt = refundAmount.trim() ? parseFloat(refundAmount) : null;
                          refundMutation.mutate(amt);
                        }}
                        disabled={refundMutation.isPending}
                        className="px-4 py-2 rounded-md bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50 whitespace-nowrap"
                      >
                        {refundMutation.isPending ? 'Processing…' : 'Issue Refund'}
                      </button>
                    </div>
                  )}
                </section>
              );
            })()}

            {/* Capture / Void — only for authorized Razorpay payments */}
            {order.payment_status === 'authorized' && order.razorpay_payment_id && (() => {
              const authAt     = order.razorpay_authorized_at ? new Date(order.razorpay_authorized_at) : null;
              const expiresAt  = authAt ? new Date(authAt.getTime() + 5 * 24 * 60 * 60 * 1000) : null;
              const hoursLeft  = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 3_600_000)) : null;
              const expireSoon = hoursLeft !== null && hoursLeft < 24;
              const authTotal  = parseFloat(order.total);
              const capAmt     = captureAmount.trim() ? parseFloat(captureAmount) : null;
              const isPartial  = capAmt !== null && capAmt < authTotal - 0.01;

              return (
                <section className="border border-blue-200 rounded-xl p-4 bg-blue-50/40 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-kb-charcoal">Payment Authorized</h3>
                    <p className="text-xs text-kb-muted mt-0.5">
                      {fmt(order.total)} is held on the customer's card but not yet captured.
                      {expiresAt && (
                        <span className={expireSoon ? ' text-red-600 font-medium' : ''}>
                          {' '}Expires {expiresAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          {hoursLeft !== null && ` (${hoursLeft}h left)`}.
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Partial capture input */}
                  <div>
                    <label className="block text-xs text-kb-muted mb-1">
                      Capture amount (₹) — leave blank to capture full {fmt(order.total)}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={authTotal}
                      step={0.01}
                      value={captureAmount}
                      onChange={(e) => setCaptureAmount(e.target.value)}
                      placeholder={authTotal.toFixed(2)}
                      className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                    />
                    {isPartial && (
                      <p className="text-xs text-blue-700 mt-1">
                        Capturing {fmt(capAmt!)} — Razorpay will auto-release the remaining {fmt(authTotal - capAmt!)} back to the customer.
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => captureMutation.mutate(capAmt)}
                      disabled={captureMutation.isPending || voidMutation.isPending}
                      className="flex-1 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {captureMutation.isPending
                        ? 'Capturing…'
                        : isPartial ? `Capture ${fmt(capAmt!)}` : 'Capture Full Amount'}
                    </button>
                    <button
                      onClick={() => voidMutation.mutate()}
                      disabled={captureMutation.isPending || voidMutation.isPending}
                      className="px-4 py-2 rounded-md border border-gray-300 text-sm text-kb-muted hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
                    >
                      {voidMutation.isPending ? 'Voiding…' : 'Void & Cancel'}
                    </button>
                  </div>
                  <p className="text-xs text-kb-muted">
                    Void cancels the order and restores inventory. The hold releases automatically within 5 days — no refund issued.
                  </p>
                </section>
              );
            })()}

            {/* Cancel order — hidden for authorized payments (use Void above instead) */}
            {order.fulfillment_status !== 'cancelled' && order.fulfillment_status !== 'fulfilled' && order.payment_status !== 'authorized' && (
              <section className="border border-red-100 rounded-xl p-4 bg-red-50/40">
                <h3 className="text-sm font-semibold text-kb-charcoal mb-1">Cancel Order</h3>
                <p className="text-xs text-kb-muted mb-3">
                  Cancels the order and restores inventory.
                  {order.payment_status === 'paid' && order.razorpay_payment_id
                    ? ' Issues a full Razorpay refund automatically — if Razorpay rejects the refund, the order will NOT be cancelled.'
                    : order.payment_status === 'paid' && order.phonepe_transaction_id
                    ? ' PhonePe refund must be issued manually from the PhonePe dashboard.'
                    : ''}
                </p>
                {showCancelConfirm ? (
                  <div className="space-y-2">
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => cancelMutation.mutate(false)}
                        disabled={cancelMutation.isPending}
                        className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                      >
                        {cancelMutation.isPending ? 'Cancelling…' : 'Yes, Cancel Order'}
                      </button>
                      <button
                        onClick={() => setShowCancelConfirm(false)}
                        className="px-4 py-2 rounded-md border border-gray-200 text-sm text-kb-muted hover:bg-gray-50"
                      >
                        Never mind
                      </button>
                    </div>

                    {/* Force option — only shown for paid Razorpay orders where the automatic refund could fail */}
                    {order.payment_status === 'paid' && order.razorpay_payment_id && (
                      <div className="pt-3 border-t border-red-100">
                        <p className="text-xs text-kb-muted mb-2">
                          Already refunded manually in Razorpay? Use this to skip the automatic
                          refund and just mark the order cancelled. <strong>Only use after confirming
                          the refund was issued in the Razorpay dashboard</strong> — this will not move money.
                        </p>
                        <button
                          onClick={() => cancelMutation.mutate(true)}
                          disabled={cancelMutation.isPending}
                          className="px-3 py-1.5 rounded-md border border-amber-400 text-amber-700 text-xs font-medium hover:bg-amber-50 disabled:opacity-50"
                        >
                          Force cancel (no refund attempt)
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    className="px-4 py-2 rounded-md border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50"
                  >
                    Cancel Order
                  </button>
                )}
              </section>
            )}

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

            {/* Initiate exchange on customer's behalf — only for shipped orders.
                Useful when a guest (or any customer) requests exchange via WhatsApp
                and admin creates the record so the standard flow can take over. */}
            {order.fulfilled_at && order.fulfillment_status !== 'cancelled' && (
              <section className="border border-amber-100 rounded-xl p-4 bg-amber-50/30">
                {!showExchangeForm ? (
                  <>
                    <h3 className="text-sm font-semibold text-kb-charcoal mb-1">Initiate exchange on customer's behalf</h3>
                    <p className="text-xs text-kb-muted mb-3">
                      Use when a customer requests an exchange via WhatsApp / phone and you
                      want to create the record manually. The customer is notified, then the
                      exchange shows up under <strong>Exchanges</strong> for the standard
                      approve / reject / complete flow.
                    </p>
                    <button
                      onClick={() => {
                        setShowExchangeForm(true);
                        // Pre-fill: zero qty per item, admin picks what to include
                        const initial: Record<string, number> = {};
                        for (const li of order.line_items as Array<{ product_id: string }>) {
                          initial[li.product_id] = 0;
                        }
                        setExItemQtys(initial);
                      }}
                      className="px-4 py-2 rounded-md border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50"
                    >
                      + Initiate Exchange
                    </button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-kb-charcoal">Initiate exchange</h3>

                    {/* Items + quantities */}
                    <div>
                      <p className="text-xs text-kb-muted mb-1.5">Items to exchange (qty 0 = skip)</p>
                      <div className="space-y-1.5">
                        {(order.line_items as Array<{ product_id: string; name: string; sku: string; quantity: number }>).map((li) => (
                          <div key={li.product_id} className="flex items-center gap-2 text-sm">
                            <div className="flex-1 min-w-0">
                              <div className="text-kb-charcoal truncate">{li.name}</div>
                              <div className="text-xs text-kb-muted">{li.sku} · ordered {li.quantity}</div>
                            </div>
                            <input
                              type="number"
                              min={0}
                              max={li.quantity}
                              value={exItemQtys[li.product_id] ?? 0}
                              onChange={(e) => setExItemQtys(prev => ({
                                ...prev,
                                [li.product_id]: Math.max(0, Math.min(li.quantity, Number(e.target.value) || 0)),
                              }))}
                              className="w-16 border border-gray-200 rounded-md px-2 py-1 text-sm text-right"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Reason */}
                    <div>
                      <label className="block text-xs text-kb-muted mb-1">Reason</label>
                      <select
                        value={exReason}
                        onChange={(e) => setExReason(e.target.value)}
                        className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none"
                      >
                        <option value="fabric_defect">Fabric defect</option>
                        <option value="different_from_description">Different from description</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    {/* Customer notes (what they told you) */}
                    <div>
                      <label className="block text-xs text-kb-muted mb-1">Customer's description (optional)</label>
                      <textarea
                        value={exCustomerNotes}
                        onChange={(e) => setExCustomerNotes(e.target.value)}
                        rows={2}
                        placeholder="What did the customer tell you over WhatsApp?"
                        className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none resize-none"
                      />
                    </div>

                    {/* Internal notes */}
                    <div>
                      <label className="block text-xs text-kb-muted mb-1">Internal admin notes (optional, not sent to customer)</label>
                      <textarea
                        value={exAdminNotes}
                        onChange={(e) => setExAdminNotes(e.target.value)}
                        rows={2}
                        className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none resize-none"
                      />
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => {
                          const items = Object.entries(exItemQtys)
                            .filter(([, q]) => q > 0)
                            .map(([product_id, quantity]) => ({ product_id, quantity }));
                          if (items.length === 0) {
                            toast.error('Pick at least one item with quantity ≥ 1');
                            return;
                          }
                          initiateExchangeMutation.mutate({
                            items,
                            reason: exReason,
                            customer_notes: exCustomerNotes.trim() || undefined,
                            admin_notes:    exAdminNotes.trim() || undefined,
                          });
                        }}
                        disabled={initiateExchangeMutation.isPending}
                        className="px-4 py-2 rounded-md bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                      >
                        {initiateExchangeMutation.isPending ? 'Creating…' : 'Create Exchange'}
                      </button>
                      <button
                        onClick={() => setShowExchangeForm(false)}
                        className="px-4 py-2 rounded-md border border-gray-200 text-sm text-kb-muted hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 space-y-2">
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={patchMutation.isPending}
              className="flex-1 py-2.5 rounded-lg bg-kb-teal text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {patchMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
            <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-kb-muted hover:border-gray-300">
              Close
            </button>
          </div>
          {order && (
            <button
              onClick={async () => {
                try {
                  const resp = await api.get(`/admin/orders/${orderId}/pdf`, { responseType: 'blob' });
                  const url  = URL.createObjectURL(new Blob([resp.data as BlobPart], { type: 'application/pdf' }));
                  const a    = document.createElement('a');
                  a.href     = url;
                  a.download = `order-${order.order_number}.pdf`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch {
                  toast.error('Could not download PDF');
                }
              }}
              className="flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-gray-200 text-sm text-kb-muted hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              Download Order PDF
            </button>
          )}
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
  const [search, setSearch]                   = useState('');
  const debouncedSearch                       = useDebounce(search, 400);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const hasFilters = debouncedSearch || paymentFilter || fulfillFilter;

  const queryKey = ['admin-orders', page, paymentFilter, fulfillFilter, debouncedSearch];

  const { data, isLoading, isFetching } = useQuery<{ data: OrderRow[]; meta: Meta }>({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (paymentFilter)    params.set('payment_status', paymentFilter);
      if (fulfillFilter)    params.set('fulfillment_status', fulfillFilter);
      if (debouncedSearch)  params.set('q', debouncedSearch);
      return api.get(`/admin/orders?${params}`).then((r) => r.data);
    },
  });

  const orders = data?.data ?? [];
  const meta   = data?.meta;

  const clearFilters = () => { setSearch(''); setPaymentFilter(''); setFulfillFilter(''); setPage(1); };

  return (
    <AdminLayout title="Orders">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative">
          <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-kb-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order # or email…"
            autoComplete="off"
            className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-md text-sm w-52 focus:outline-none focus:ring-2 focus:ring-kb-teal"
          />
        </div>
        <select
          value={paymentFilter}
          onChange={(e) => { setPaymentFilter(e.target.value); setPage(1); }}
          className="select-inline border border-gray-200 rounded-md text-sm px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-kb-teal"
        >
          <option value="">All Payment</option>
          <option value="authorized">Authorized</option>
          <option value="pending_confirmation">Pending</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
          <option value="voided">Voided</option>
        </select>
        <select
          value={fulfillFilter}
          onChange={(e) => { setFulfillFilter(e.target.value); setPage(1); }}
          className="select-inline border border-gray-200 rounded-md text-sm px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-kb-teal"
        >
          <option value="">All Fulfillment</option>
          <option value="unfulfilled">Unfulfilled</option>
          <option value="partially_fulfilled">Partial</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {isFetching && !isLoading && (
          <div className="w-3.5 h-3.5 border-2 border-kb-teal border-t-transparent rounded-full animate-spin" />
        )}
        {hasFilters && (
          <button onClick={clearFilters} className="ml-auto text-xs text-kb-teal hover:underline">
            Clear all
          </button>
        )}
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
                    <div className="flex flex-col gap-1">
                      <Badge label={order.payment_status} colorClass={PAYMENT_COLORS[order.payment_status] ?? 'bg-gray-50 text-gray-600'} />
                      <PaymentMethodBadge method={order.payment_method} />
                    </div>
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
