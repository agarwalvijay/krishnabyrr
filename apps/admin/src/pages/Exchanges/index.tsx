import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/Layout/AdminLayout';
import { api } from '../../lib/api';
import { useDebounce } from '../../lib/hooks';

// ── Types ─────────────────────────────────────────────────────────────────────

type ExchangeStatus = 'requested' | 'approved' | 'rejected' | 'completed';

interface ExchangeRow {
  id:               string;
  exchange_number:  string;
  status:           ExchangeStatus;
  reason:           string;
  customer_notes:   string | null;
  admin_notes:      string | null;
  created_at:       string;
  updated_at:       string;
  order_number:     string;
  order_id:         string;
  customer_email:   string;
}

interface ExchangeDetail extends ExchangeRow {
  items:              Array<{ product_id: string; quantity: number }>;
  order_line_items:   Array<{ product_id: string; name: string; sku: string; quantity: number; line_total: number }>;
  customer_name:      string | null;
  customer_phone:     string | null;
  shipping_address:   { name: string; line1: string; city: string; state: string; pincode: string; phone: string };
}

interface Meta { total: number; page: number; limit: number; pages: number }

// ── Constants ─────────────────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  wrong_size:                  'Wrong size',
  fabric_defect:               'Fabric defect',
  different_from_description:  'Different from description',
  other:                       'Other',
};

// Pre-defined rejection reasons. Picking 'other' reveals a free-text field.
const REJECTION_REASONS: Array<{ value: string; label: string }> = [
  { value: 'used',              label: 'Item shows signs of use' },
  { value: 'window',            label: 'Outside exchange window' },
  { value: 'packaging',         label: 'Not in original packaging or tags missing' },
  { value: 'sale',              label: 'Sale items not eligible for exchange' },
  { value: 'damaged_in_return', label: 'Item damaged in return shipping' },
  { value: 'other',             label: 'Other (specify)' },
];

const REJECTION_TEXT: Record<string, string> = {
  used:               'Item shows signs of use',
  window:             'Outside the exchange window',
  packaging:          'Not in original packaging or tags missing',
  sale:               'Sale items are not eligible for exchange',
  damaged_in_return:  'Item was damaged in return shipping',
};

const STATUS_COLORS: Record<ExchangeStatus, string> = {
  requested:  'bg-amber-50 text-amber-700',
  approved:   'bg-blue-50 text-blue-700',
  rejected:   'bg-red-50 text-red-700',
  completed:  'bg-green-50 text-green-700',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ExchangeStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
      {status}
    </span>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ── Detail Slide-Over ─────────────────────────────────────────────────────────

function ExchangeDetailPanel({ exchangeId, onClose }: { exchangeId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [adminNotes, setAdminNotes] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState<string>(REJECTION_REASONS[0].value);
  const [rejectOtherText, setRejectOtherText] = useState('');

  const { data, isLoading } = useQuery<{ data: ExchangeDetail }>({
    queryKey: ['admin-exchange', exchangeId],
    queryFn:  () => api.get(`/admin/orders/exchanges/${exchangeId}`).then(r => r.data),
  });
  const ex = data?.data;

  useEffect(() => {
    if (ex && !adminNotes) setAdminNotes(ex.admin_notes ?? '');
  }, [ex]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/admin/orders/exchanges/${exchangeId}`, body),
    onSuccess: (_resp, body) => {
      const newStatus = (body as { status?: string }).status;
      toast.success(
        newStatus === 'approved'  ? 'Exchange approved' :
        newStatus === 'rejected'  ? 'Exchange rejected' :
        newStatus === 'completed' ? 'Exchange marked complete' :
        'Exchange updated'
      );
      setShowRejectForm(false);
      queryClient.invalidateQueries({ queryKey: ['admin-exchanges'] });
      queryClient.invalidateQueries({ queryKey: ['admin-exchange', exchangeId] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? 'Update failed');
    },
  });

  const submitReject = () => {
    const reasonText = rejectReason === 'other'
      ? rejectOtherText.trim()
      : REJECTION_TEXT[rejectReason];
    if (!reasonText) {
      toast.error('Please provide a reason');
      return;
    }
    patchMutation.mutate({
      status:      'rejected',
      admin_notes: reasonText,
    });
  };

  // Map item product_id → name + sku using the order's line_items
  const itemDetails = (ex?.items ?? []).map(it => {
    const orderItem = ex?.order_line_items.find(li => li.product_id === it.product_id);
    return {
      product_id: it.product_id,
      quantity:   it.quantity,
      name:       orderItem?.name ?? '(removed product)',
      sku:        orderItem?.sku ?? '',
    };
  });

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-50 w-full max-w-xl bg-white shadow-xl overflow-y-auto flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <div>
            <h2 className="font-semibold text-kb-charcoal text-base">
              {isLoading ? 'Loading…' : ex?.exchange_number}
            </h2>
            {ex && (
              <p className="text-xs text-kb-muted mt-0.5">
                Order {ex.order_number} · {fmtDate(ex.created_at)}
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

        {ex && (
          <div className="flex-1 px-5 py-5 space-y-6">

            {/* Status */}
            <section className="flex items-center gap-3">
              <span className="text-sm text-kb-muted">Status:</span>
              <StatusBadge status={ex.status} />
            </section>

            {/* Customer */}
            <section>
              <h3 className="text-sm font-semibold text-kb-charcoal mb-2">Customer</h3>
              <div className="text-sm text-kb-muted leading-6">
                <div className="text-kb-charcoal font-medium">{ex.customer_name ?? '—'}</div>
                <div>{ex.customer_email}</div>
                {ex.customer_phone && <div>+91 {ex.customer_phone}</div>}
              </div>
            </section>

            {/* Items requested for exchange */}
            <section>
              <h3 className="text-sm font-semibold text-kb-charcoal mb-2">Items being exchanged</h3>
              <div className="space-y-2">
                {itemDetails.map(item => (
                  <div key={item.product_id} className="flex items-start justify-between p-2.5 rounded-lg bg-kb-cream/50 text-sm">
                    <div>
                      <div className="text-kb-charcoal">{item.name}</div>
                      {item.sku && <div className="text-xs text-kb-muted mt-0.5">{item.sku}</div>}
                    </div>
                    <div className="text-kb-muted whitespace-nowrap">Qty {item.quantity}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Reason + customer notes */}
            <section>
              <h3 className="text-sm font-semibold text-kb-charcoal mb-2">Reason</h3>
              <p className="text-sm text-kb-charcoal">{REASON_LABELS[ex.reason] ?? ex.reason}</p>
              {ex.customer_notes && (
                <div className="mt-2 p-3 rounded-lg bg-amber-50/60 border border-amber-100">
                  <p className="text-xs font-medium text-amber-800 mb-1">Customer notes</p>
                  <p className="text-sm text-kb-charcoal italic">"{ex.customer_notes}"</p>
                </div>
              )}
            </section>

            {/* Admin notes (read-only after action; editable while requested) */}
            <section>
              <h3 className="text-sm font-semibold text-kb-charcoal mb-2">Admin notes</h3>
              {ex.admin_notes ? (
                <p className="text-sm text-kb-charcoal whitespace-pre-line p-3 rounded-lg bg-gray-50 border border-gray-100">
                  {ex.admin_notes}
                </p>
              ) : (
                <p className="text-sm text-kb-muted italic">No notes yet.</p>
              )}
            </section>

            {/* Actions — depend on current status */}
            {ex.status === 'requested' && !showRejectForm && (
              <section className="border-t border-gray-100 pt-5 flex flex-wrap gap-2">
                <button
                  onClick={() => patchMutation.mutate({ status: 'approved' })}
                  disabled={patchMutation.isPending}
                  className="px-4 py-2 rounded-md bg-kb-teal text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {patchMutation.isPending ? 'Working…' : 'Approve'}
                </button>
                <button
                  onClick={() => setShowRejectForm(true)}
                  disabled={patchMutation.isPending}
                  className="px-4 py-2 rounded-md border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                >
                  Reject
                </button>
              </section>
            )}

            {ex.status === 'requested' && showRejectForm && (
              <section className="border-t border-gray-100 pt-5 space-y-3 bg-red-50/30 -mx-5 px-5 py-5">
                <h3 className="text-sm font-semibold text-kb-charcoal">Reject exchange — pick a reason</h3>
                <p className="text-xs text-kb-muted">
                  This reason is sent to the customer via WhatsApp.
                </p>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-red-300 focus:border-red-400 outline-none"
                >
                  {REJECTION_REASONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                {rejectReason === 'other' && (
                  <textarea
                    value={rejectOtherText}
                    onChange={(e) => setRejectOtherText(e.target.value)}
                    rows={3}
                    placeholder="Reason that will be sent to the customer…"
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-red-300 focus:border-red-400 outline-none resize-none"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={submitReject}
                    disabled={patchMutation.isPending}
                    className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                  >
                    {patchMutation.isPending ? 'Rejecting…' : 'Confirm Rejection'}
                  </button>
                  <button
                    onClick={() => { setShowRejectForm(false); setRejectOtherText(''); }}
                    className="px-4 py-2 rounded-md border border-gray-200 text-sm text-kb-muted hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </section>
            )}

            {ex.status === 'approved' && (
              <section className="border-t border-gray-100 pt-5">
                <p className="text-xs text-kb-muted mb-3">
                  Customer has been notified to ship the item within 2 days. Mark complete once the replacement has been dispatched.
                </p>
                <button
                  onClick={() => patchMutation.mutate({ status: 'completed' })}
                  disabled={patchMutation.isPending}
                  className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {patchMutation.isPending ? 'Working…' : 'Mark Completed'}
                </button>
              </section>
            )}

            {(ex.status === 'rejected' || ex.status === 'completed') && (
              <section className="border-t border-gray-100 pt-5">
                <p className="text-xs text-kb-muted">
                  This exchange is in a final state. {ex.status === 'completed' ? 'Replacement has been dispatched.' : 'Customer has been notified of the rejection.'}
                </p>
              </section>
            )}

            {/* Free-text admin notes appender — usable in any state */}
            <section className="border-t border-gray-100 pt-5">
              <h3 className="text-sm font-semibold text-kb-charcoal mb-2">Add internal notes</h3>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
                placeholder="Anything you want to remember about this exchange…"
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-kb-teal/30 focus:border-kb-teal outline-none resize-none"
              />
              <button
                onClick={() => patchMutation.mutate({ admin_notes: adminNotes })}
                disabled={patchMutation.isPending || adminNotes === (ex.admin_notes ?? '')}
                className="mt-2 px-4 py-2 rounded-md border border-gray-200 text-sm text-kb-charcoal hover:bg-gray-50 disabled:opacity-50"
              >
                Save notes
              </button>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ExchangesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage]             = useState(1);
  const [statusFilter, setStatusFilter] = useState<ExchangeStatus | ''>('');
  const [search, setSearch]         = useState('');
  const debouncedSearch             = useDebounce(search, 400);

  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

  const { data, isLoading, isFetching } = useQuery<{ data: ExchangeRow[]; meta: Meta }>({
    queryKey: ['admin-exchanges', page, statusFilter, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (statusFilter)    params.set('status', statusFilter);
      // Backend list endpoint doesn't currently search; client-side filter below
      return api.get(`/admin/orders/exchanges?${params}`).then(r => r.data);
    },
  });

  const allRows = data?.data ?? [];
  const meta    = data?.meta;

  // Simple client-side search across visible page until backend gets search
  const q = debouncedSearch.trim().toLowerCase();
  const rows = q
    ? allRows.filter(r =>
        r.exchange_number.toLowerCase().includes(q) ||
        r.order_number.toLowerCase().includes(q) ||
        (r.customer_email ?? '').toLowerCase().includes(q),
      )
    : allRows;

  return (
    <AdminLayout title="Exchanges">
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
            placeholder="Exchange #, order #, or email…"
            autoComplete="off"
            className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-md text-sm w-64 focus:outline-none focus:ring-2 focus:ring-kb-teal"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ExchangeStatus | '')}
          className="select-inline border border-gray-200 rounded-md text-sm px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-kb-teal"
        >
          <option value="">All statuses</option>
          <option value="requested">Requested</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="completed">Completed</option>
        </select>
        {isFetching && !isLoading && (
          <div className="w-3.5 h-3.5 border-2 border-kb-teal border-t-transparent rounded-full animate-spin" />
        )}
        {(search || statusFilter) && (
          <button
            onClick={() => { setSearch(''); setStatusFilter(''); setPage(1); }}
            className="ml-auto text-xs text-kb-teal hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="w-8 h-8 border-4 border-kb-teal border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-kb-muted text-sm">No exchanges found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-kb-cream/60">
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Exchange #</th>
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Order</th>
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Reason</th>
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Status</th>
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedId(r.id)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-kb-teal">{r.exchange_number}</td>
                  <td className="px-4 py-3 text-kb-charcoal">{r.order_number}</td>
                  <td className="px-4 py-3 text-kb-muted truncate max-w-[200px]">{r.customer_email}</td>
                  <td className="px-4 py-3 text-kb-muted">{REASON_LABELS[r.reason] ?? r.reason}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-kb-muted">
                    {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </td>
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
            Page {meta.page} of {meta.pages} · {meta.total} exchanges
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

      {selectedId && (
        <ExchangeDetailPanel
          exchangeId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </AdminLayout>
  );
}
