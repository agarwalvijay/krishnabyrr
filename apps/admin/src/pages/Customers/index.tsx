import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import AdminLayout from '../../components/Layout/AdminLayout';
import { api } from '../../lib/api';
import { useDebounce } from '../../lib/hooks';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  total_orders: number;
  lifetime_value: string;
  email_verified: boolean;
  created_at: string;
}

interface CustomerDetail extends Customer {
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

// ── Customer slide-over ───────────────────────────────────────────────────────

function CustomerSlideOver({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ data: CustomerDetail }>({
    queryKey: ['admin-customer', customerId],
    queryFn: () => api.get(`/admin/customers/${customerId}`).then((r) => r.data),
  });

  const customer = data?.data;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-50 w-full max-w-lg bg-white shadow-xl overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <div>
            <h2 className="font-semibold text-kb-charcoal text-base">
              {isLoading ? 'Loading…' : (customer?.name ?? customer?.email ?? '—')}
            </h2>
            {customer && (
              <p className="text-xs text-kb-muted mt-0.5">{customer.email}</p>
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

        {customer && (
          <div className="flex-1 px-5 py-5 space-y-6">
            {/* Summary cards */}
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

            {/* Details */}
            <section>
              <h3 className="text-sm font-semibold text-kb-charcoal mb-3">Details</h3>
              <div className="space-y-2 text-sm">
                {customer.phone && (
                  <div className="flex gap-2">
                    <span className="text-kb-muted w-28 flex-shrink-0">Phone</span>
                    <span>{customer.phone}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <span className="text-kb-muted w-28 flex-shrink-0">Joined</span>
                  <span>{new Date(customer.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-kb-muted w-28 flex-shrink-0">Email verified</span>
                  <span>{customer.email_verified ? '✓ Yes' : 'No'}</span>
                </div>
                {(customer.marketing_email || customer.marketing_whatsapp) && (
                  <div className="flex gap-2">
                    <span className="text-kb-muted w-28 flex-shrink-0">Marketing</span>
                    <span className="flex gap-2">
                      {customer.marketing_email && <span className="text-xs bg-teal-50 text-kb-teal px-1.5 py-0.5 rounded">Email</span>}
                      {customer.marketing_whatsapp && <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">WhatsApp</span>}
                    </span>
                  </div>
                )}
                {customer.line1 && (
                  <div className="flex gap-2">
                    <span className="text-kb-muted w-28 flex-shrink-0">Address</span>
                    <span className="text-kb-muted">
                      {[customer.line1, customer.city, customer.state, customer.pincode].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* Order history */}
            <section>
              <h3 className="text-sm font-semibold text-kb-charcoal mb-3">Order History</h3>
              {customer.orders.length === 0 ? (
                <p className="text-sm text-kb-muted">No orders yet.</p>
              ) : (
                <div className="space-y-2">
                  {customer.orders.map((o) => (
                    <div key={o.id} className="flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-2.5 text-sm">
                      <span className="font-medium text-kb-teal w-28 flex-shrink-0">{o.order_number}</span>
                      <span className="text-kb-muted text-xs flex-shrink-0">
                        {new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                      <div className="flex gap-1.5 flex-1 justify-end">
                        <Badge label={o.payment_status} colorClass={PAYMENT_COLORS[o.payment_status] ?? 'bg-gray-50 text-gray-600'} />
                        <Badge label={o.fulfillment_status} colorClass={FULFIL_COLORS[o.fulfillment_status] ?? 'bg-gray-50 text-gray-600'} />
                      </div>
                      <span className="font-medium flex-shrink-0">{fmt(o.total)}</span>
                    </div>
                  ))}
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
      return api.get(`/admin/customers?${params}`).then((r) => r.data);
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
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone…"
            autoComplete="off"
            className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-md text-sm w-64 focus:outline-none focus:ring-2 focus:ring-kb-teal"
          />
        </div>
        {isFetching && !isLoading && (
          <div className="w-3.5 h-3.5 border-2 border-kb-teal border-t-transparent rounded-full animate-spin" />
        )}
        {meta && (
          <p className="ml-auto text-sm text-kb-muted">{meta.total} customers</p>
        )}
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
              {customers.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedId(c.id)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-kb-charcoal">{c.name ?? '—'}</p>
                    <p className="text-xs text-kb-muted">{c.email}</p>
                  </td>
                  <td className="px-4 py-3 text-kb-muted">{c.phone ?? '—'}</td>
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
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md disabled:opacity-40 hover:bg-gray-50">← Prev</button>
            <button onClick={() => setPage((p) => Math.min(meta.pages, p + 1))} disabled={page === meta.pages}
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
