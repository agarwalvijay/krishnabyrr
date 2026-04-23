import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../../components/Layout/AdminLayout';
import { api } from '../../lib/api';
import { useDebounce } from '../../lib/hooks';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  total_orders: number;
  lifetime_value: string;
  phone_verified: boolean;
  is_suspended: boolean;
  customer_labels: string[];
  created_at: string;
}

interface CustomerDetail extends Customer {
  admin_notes: string | null;
  marketing_email: boolean;
  marketing_whatsapp: boolean;
  line1: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  orders: OrderRow[];
}

interface OrderRow {
  id: string;
  order_number: string;
  created_at: string;
  total: string;
  payment_status: string;
  fulfillment_status: string;
}

interface LinkableOrder {
  id: string;
  order_number: string;
  created_at: string;
  total: string;
  guest_email: string | null;
  payment_status: string;
}

interface Meta { total: number; page: number; pages: number }

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAYMENT_COLORS: Record<string, string> = {
  paid:                 'bg-green-50 text-green-700',
  pending_confirmation: 'bg-amber-50 text-amber-700',
  failed:               'bg-red-50 text-red-700',
  refunded:             'bg-gray-50 text-gray-600',
};
const FULFIL_COLORS: Record<string, string> = {
  unfulfilled:         'bg-gray-50 text-gray-600',
  partially_fulfilled: 'bg-blue-50 text-blue-700',
  fulfilled:           'bg-green-50 text-green-700',
  cancelled:           'bg-red-50 text-red-700',
};

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}

function fmt(v: string | number) {
  return `₹${parseFloat(String(v)).toLocaleString('en-IN')}`;
}

function downloadCsv(url: string, filename: string) {
  api.get(url, { responseType: 'blob' }).then(res => {
    const blob = new Blob([res.data as BlobPart], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

// ── Customer slide-over ───────────────────────────────────────────────────────

function CustomerSlideOver({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ data: CustomerDetail }>({
    queryKey: ['admin-customer', customerId],
    queryFn: () => api.get(`/admin/customers/${customerId}`).then(r => r.data),
  });
  const customer = data?.data;

  // ── Edit profile ─────────────────────────────────────────────────────────────
  const [editing, setEditing]     = useState(false);
  const [editName, setEditName]   = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError]   = useState('');

  useEffect(() => {
    if (customer) {
      setEditName(customer.name ?? '');
      setEditEmail(customer.email ?? '');
      setEditPhone(customer.phone ?? '');
    }
  }, [customer]);

  const saveProfile = async () => {
    setEditSaving(true); setEditError('');
    try {
      await api.patch(`/admin/customers/${customerId}`, { name: editName, email: editEmail, phone: editPhone });
      await qc.invalidateQueries({ queryKey: ['admin-customer', customerId] });
      await qc.invalidateQueries({ queryKey: ['admin-customers'] });
      setEditing(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setEditError(e?.response?.data?.error?.message ?? 'Save failed');
    } finally { setEditSaving(false); }
  };

  // ── Admin notes ───────────────────────────────────────────────────────────────
  const [notes, setNotes]           = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved]   = useState(false);

  useEffect(() => { if (customer) setNotes(customer.admin_notes ?? ''); }, [customer]);

  const saveNotes = async () => {
    setNotesSaving(true);
    try {
      await api.patch(`/admin/customers/${customerId}`, { admin_notes: notes });
      await qc.invalidateQueries({ queryKey: ['admin-customer', customerId] });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } finally { setNotesSaving(false); }
  };

  // ── Labels ────────────────────────────────────────────────────────────────────
  const [newLabel, setNewLabel]   = useState('');
  const [labelBusy, setLabelBusy] = useState(false);

  const addLabel = async () => {
    if (!newLabel.trim()) return;
    setLabelBusy(true);
    try {
      await api.post(`/admin/customers/${customerId}/labels`, { label: newLabel.trim() });
      await qc.invalidateQueries({ queryKey: ['admin-customer', customerId] });
      await qc.invalidateQueries({ queryKey: ['admin-customers'] });
      setNewLabel('');
    } finally { setLabelBusy(false); }
  };

  const removeLabel = async (label: string) => {
    await api.delete(`/admin/customers/${customerId}/labels/${encodeURIComponent(label)}`);
    await qc.invalidateQueries({ queryKey: ['admin-customer', customerId] });
    await qc.invalidateQueries({ queryKey: ['admin-customers'] });
  };

  // ── Suspend ───────────────────────────────────────────────────────────────────
  const [suspendBusy, setSuspendBusy] = useState(false);

  const toggleSuspend = async () => {
    setSuspendBusy(true);
    try {
      await api.patch(`/admin/customers/${customerId}/suspend`, { suspended: !customer?.is_suspended });
      await qc.invalidateQueries({ queryKey: ['admin-customer', customerId] });
      await qc.invalidateQueries({ queryKey: ['admin-customers'] });
    } finally { setSuspendBusy(false); }
  };

  // ── Verify phone ──────────────────────────────────────────────────────────────
  const [verifyBusy, setVerifyBusy] = useState(false);

  const verifyPhone = async () => {
    setVerifyBusy(true);
    try {
      await api.patch(`/admin/customers/${customerId}/verify-phone`);
      await qc.invalidateQueries({ queryKey: ['admin-customer', customerId] });
    } finally { setVerifyBusy(false); }
  };

  // ── Link guest orders ─────────────────────────────────────────────────────────
  const [linkableOrders, setLinkableOrders]   = useState<LinkableOrder[]>([]);
  const [showLinkable, setShowLinkable]       = useState(false);
  const [linkBusy, setLinkBusy]               = useState<string | null>(null);

  const loadLinkable = async () => {
    const res = await api.get<{ data: LinkableOrder[] }>(`/admin/customers/${customerId}/linkable-orders`);
    setLinkableOrders(res.data.data);
    setShowLinkable(true);
  };

  const linkOrder = async (orderId: string) => {
    setLinkBusy(orderId);
    try {
      await api.post(`/admin/customers/${customerId}/link-order`, { orderId });
      setLinkableOrders(prev => prev.filter(o => o.id !== orderId));
      await qc.invalidateQueries({ queryKey: ['admin-customer', customerId] });
    } finally { setLinkBusy(null); }
  };

  // ── Delete account ────────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy]       = useState(false);

  const deleteCustomer = async () => {
    setDeleteBusy(true);
    try {
      await api.delete(`/admin/customers/${customerId}`);
      await qc.invalidateQueries({ queryKey: ['admin-customers'] });
      onClose();
    } finally { setDeleteBusy(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-50 w-full max-w-lg bg-white shadow-xl overflow-y-auto flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="min-w-0 flex-1 pr-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-kb-charcoal text-base truncate">
                {isLoading ? 'Loading…' : (customer?.name ?? customer?.email ?? '—')}
              </h2>
              {customer?.is_suspended && (
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600">Suspended</span>
              )}
              {customer?.phone_verified && (
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">✓ Verified</span>
              )}
            </div>
            {customer && (
              <p className="text-xs text-kb-muted mt-0.5 truncate">
                {[customer.email, customer.phone ? `+91 ${customer.phone}` : null].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-gray-50 text-kb-muted flex-shrink-0">
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

        {customer && (
          <div className="flex-1 px-5 py-5 space-y-6">

            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-kb-cream rounded-lg p-3 text-center">
                <p className="text-2xl font-semibold text-kb-charcoal">{customer.total_orders}</p>
                <p className="text-xs text-kb-muted mt-0.5">Orders</p>
              </div>
              <div className="bg-kb-cream rounded-lg p-3 text-center">
                <p className="text-2xl font-semibold text-kb-teal">{fmt(customer.lifetime_value)}</p>
                <p className="text-xs text-kb-muted mt-0.5">Lifetime Value</p>
              </div>
            </div>

            {/* Actions */}
            <section className="flex flex-wrap gap-2">
              <button
                onClick={toggleSuspend}
                disabled={suspendBusy}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                  customer.is_suspended
                    ? 'border-green-300 text-green-700 hover:bg-green-50'
                    : 'border-red-300 text-red-600 hover:bg-red-50'
                }`}
              >
                {suspendBusy ? '…' : customer.is_suspended ? 'Unsuspend Account' : 'Suspend Account'}
              </button>

              {!customer.phone_verified && customer.phone && (
                <button
                  onClick={verifyPhone}
                  disabled={verifyBusy}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-kb-teal text-kb-teal hover:bg-teal-50 transition-colors disabled:opacity-50"
                >
                  {verifyBusy ? '…' : 'Mark Phone Verified'}
                </button>
              )}

              <button
                onClick={() => setEditing(e => !e)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-kb-charcoal hover:bg-gray-50 transition-colors"
              >
                {editing ? 'Cancel Edit' : 'Edit Profile'}
              </button>
            </section>

            {/* Edit profile form */}
            {editing && (
              <section className="border border-gray-100 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-semibold text-kb-muted uppercase tracking-wide">Edit Profile</h3>
                {[
                  { label: 'Name', value: editName, set: setEditName, type: 'text' },
                  { label: 'Email', value: editEmail, set: setEditEmail, type: 'email' },
                  { label: 'Phone (10 digits)', value: editPhone, set: setEditPhone, type: 'tel' },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-xs font-medium text-kb-muted mb-0.5">{f.label}</label>
                    <input
                      type={f.type}
                      value={f.value}
                      onChange={e => f.set(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-kb-teal"
                    />
                  </div>
                ))}
                {editError && <p className="text-xs text-red-600">{editError}</p>}
                <button
                  onClick={saveProfile}
                  disabled={editSaving}
                  className="w-full py-2 rounded-lg text-sm font-semibold text-white bg-kb-teal disabled:opacity-50"
                >
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </section>
            )}

            {/* Labels */}
            <section>
              <h3 className="text-sm font-semibold text-kb-charcoal mb-2">Labels</h3>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(customer.customer_labels ?? []).map(label => (
                  <span key={label} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-kb-teal/10 text-kb-teal">
                    {label}
                    <button onClick={() => removeLabel(label)} className="ml-0.5 hover:text-red-500 leading-none">×</button>
                  </span>
                ))}
                {customer.customer_labels?.length === 0 && (
                  <span className="text-xs text-kb-muted">No labels yet</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addLabel()}
                  placeholder="VIP, Wholesale, Influencer…"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-kb-teal"
                />
                <button
                  onClick={addLabel}
                  disabled={labelBusy || !newLabel.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-kb-teal text-white disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </section>

            {/* Admin notes */}
            <section>
              <h3 className="text-sm font-semibold text-kb-charcoal mb-2">Admin Notes</h3>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Internal notes (not visible to customer)…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-kb-teal"
              />
              <button
                onClick={saveNotes}
                disabled={notesSaving}
                className="mt-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-kb-charcoal text-white disabled:opacity-50"
              >
                {notesSaving ? 'Saving…' : notesSaved ? 'Saved ✓' : 'Save Notes'}
              </button>
            </section>

            {/* Details */}
            <section>
              <h3 className="text-sm font-semibold text-kb-charcoal mb-2">Details</h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex gap-2">
                  <span className="text-kb-muted w-28 flex-shrink-0">Joined</span>
                  <span>{new Date(customer.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                {customer.line1 && (
                  <div className="flex gap-2">
                    <span className="text-kb-muted w-28 flex-shrink-0">Address</span>
                    <span className="text-kb-muted">{[customer.line1, customer.city, customer.state, customer.pincode].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {(customer.marketing_email || customer.marketing_whatsapp) && (
                  <div className="flex gap-2">
                    <span className="text-kb-muted w-28 flex-shrink-0">Marketing</span>
                    <span className="flex gap-1.5">
                      {customer.marketing_email && <span className="text-xs bg-teal-50 text-kb-teal px-1.5 py-0.5 rounded">Email</span>}
                      {customer.marketing_whatsapp && <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">WhatsApp</span>}
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* Order history */}
            <section>
              <h3 className="text-sm font-semibold text-kb-charcoal mb-2">Order History</h3>
              {customer.orders.length === 0 ? (
                <p className="text-sm text-kb-muted">No orders yet.</p>
              ) : (
                <div className="space-y-2">
                  {customer.orders.map(o => (
                    <div key={o.id} className="flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-2.5 text-sm">
                      <span className="font-medium text-kb-teal w-28 flex-shrink-0">{o.order_number}</span>
                      <span className="text-kb-muted text-xs flex-shrink-0">
                        {new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                      <div className="flex gap-1.5 flex-1 justify-end flex-wrap">
                        <Badge label={o.payment_status} colorClass={PAYMENT_COLORS[o.payment_status] ?? 'bg-gray-50 text-gray-600'} />
                        <Badge label={o.fulfillment_status} colorClass={FULFIL_COLORS[o.fulfillment_status] ?? 'bg-gray-50 text-gray-600'} />
                      </div>
                      <span className="font-medium flex-shrink-0">{fmt(o.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Link guest orders */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-kb-charcoal">Link Guest Orders</h3>
                <button
                  onClick={loadLinkable}
                  className="text-xs text-kb-teal underline"
                >
                  {showLinkable ? 'Refresh' : 'Find unlinked orders'}
                </button>
              </div>
              {showLinkable && (
                linkableOrders.length === 0 ? (
                  <p className="text-xs text-kb-muted">No unlinked guest orders found for this email/phone.</p>
                ) : (
                  <div className="space-y-2">
                    {linkableOrders.map(o => (
                      <div key={o.id} className="flex items-center gap-3 border border-dashed border-gray-200 rounded-lg px-3 py-2 text-sm">
                        <span className="font-medium text-kb-charcoal w-28 flex-shrink-0">{o.order_number}</span>
                        <span className="text-kb-muted text-xs flex-shrink-0">
                          {new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                        <span className="flex-1 text-xs text-kb-muted truncate">{o.guest_email}</span>
                        <span className="font-medium flex-shrink-0">{fmt(o.total)}</span>
                        <button
                          onClick={() => linkOrder(o.id)}
                          disabled={linkBusy === o.id}
                          className="px-2.5 py-1 rounded-md text-xs font-semibold bg-kb-teal text-white disabled:opacity-50"
                        >
                          {linkBusy === o.id ? '…' : 'Link'}
                        </button>
                      </div>
                    ))}
                  </div>
                )
              )}
            </section>

            {/* Delete account */}
            <section className="border-t border-gray-100 pt-5">
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs text-red-500 underline"
                >
                  Delete account
                </button>
              ) : (
                <div className="bg-red-50 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-red-700">Delete this account?</p>
                  <p className="text-xs text-red-600">
                    The customer record will be permanently deleted. Their orders will remain in the system as guest orders. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={deleteCustomer}
                      disabled={deleteBusy}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white disabled:opacity-50"
                    >
                      {deleteBusy ? 'Deleting…' : 'Yes, delete'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-kb-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>

          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const debouncedSearch             = useDebounce(search, 400);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const { data, isLoading, isFetching } = useQuery<{ data: Customer[]; meta: Meta }>({
    queryKey: ['admin-customers', page, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (debouncedSearch) params.set('q', debouncedSearch);
      return api.get(`/admin/customers?${params}`).then(r => r.data);
    },
  });

  const customers = data?.data ?? [];
  const meta      = data?.meta;

  return (
    <AdminLayout title="Customers">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative">
          <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-kb-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, phone…"
            autoComplete="off"
            className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-md text-sm w-64 focus:outline-none focus:ring-2 focus:ring-kb-teal"
          />
        </div>
        {isFetching && !isLoading && (
          <div className="w-3.5 h-3.5 border-2 border-kb-teal border-t-transparent rounded-full animate-spin" />
        )}
        <div className="ml-auto flex items-center gap-3">
          {meta && <p className="text-sm text-kb-muted">{meta.total} customers</p>}
          <button
            onClick={() => downloadCsv('/admin/customers/export', `customers-${new Date().toISOString().slice(0,10)}.csv`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 text-sm text-kb-charcoal hover:bg-gray-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="w-8 h-8 border-4 border-kb-teal border-t-transparent rounded-full animate-spin" />
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-16 text-kb-muted text-sm">No customers found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-kb-cream/60">
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Phone</th>
                <th className="text-center px-4 py-3 font-medium text-kb-muted">Orders</th>
                <th className="text-right px-4 py-3 font-medium text-kb-muted">Lifetime Value</th>
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {customers.map(c => (
                <tr
                  key={c.id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedId(c.id)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-medium ${c.is_suspended ? 'text-red-500' : 'text-kb-charcoal'}`}>
                        {c.name ?? '—'}
                        {c.is_suspended && <span className="ml-1.5 text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded">Suspended</span>}
                      </p>
                    </div>
                    <p className="text-xs text-kb-muted">{c.email ?? c.phone}</p>
                    {c.customer_labels?.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {c.customer_labels.map(l => (
                          <span key={l} className="text-xs bg-kb-teal/10 text-kb-teal px-1.5 py-0.5 rounded-full">{l}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-kb-muted">{c.phone ? `+91 ${c.phone}` : '—'}</span>
                    {c.phone && !c.phone_verified && (
                      <span className="block text-xs text-amber-500">Unverified</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-medium ${c.total_orders > 0 ? 'text-kb-charcoal' : 'text-kb-muted'}`}>
                      {c.total_orders}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {parseFloat(c.lifetime_value) > 0 ? fmt(c.lifetime_value) : '—'}
                  </td>
                  <td className="px-4 py-3 text-kb-muted text-xs">
                    {new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
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
          <p className="text-sm text-kb-muted">Page {meta.page} of {meta.pages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md disabled:opacity-40 hover:bg-gray-50">← Prev</button>
            <button onClick={() => setPage(p => Math.min(meta.pages, p + 1))} disabled={page === meta.pages}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md disabled:opacity-40 hover:bg-gray-50">Next →</button>
          </div>
        </div>
      )}

      {selectedId && (
        <CustomerSlideOver customerId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </AdminLayout>
  );
}
