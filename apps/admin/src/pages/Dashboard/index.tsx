import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/Layout/AdminLayout';
import { api } from '../../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardData {
  revenue: {
    today: string; this_month: string; all_time: string;
    today_count: number; month_count: number;
  };
  orders: {
    total: number; pending: number; fulfilled: number; cancelled: number;
  };
  products: {
    active: number; low_stock: number; out_of_stock: number; draft: number;
  };
  customers: {
    total: number; new_this_month: number;
  };
  recent_orders: RecentOrder[];
}

interface RecentOrder {
  id: string;
  order_number: string;
  created_at: string;
  total: string;
  payment_status: string;
  fulfillment_status: string;
  customer_name: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: string | number) {
  const n = parseFloat(String(v));
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function fmtFull(v: string | number) {
  return `₹${parseFloat(String(v)).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

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

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, subLabel, accent, href,
}: {
  label: string;
  value: string | number;
  sub?: string | number;
  subLabel?: string;
  accent?: 'teal' | 'amber' | 'red' | 'green';
  href?: string;
}) {
  const accentCls = {
    teal:  'text-kb-teal',
    amber: 'text-amber-600',
    red:   'text-red-600',
    green: 'text-green-600',
  }[accent ?? 'teal'];

  const card = (
    <div className={`bg-white rounded-xl border border-gray-100 p-4 ${href ? 'hover:border-kb-teal/40 transition-colors' : ''}`}>
      <p className="text-xs font-medium text-kb-muted uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-semibold ${accentCls}`}>{value}</p>
      {sub != null && (
        <p className="text-xs text-kb-muted mt-1">
          <span className="font-medium text-kb-charcoal">{sub}</span>
          {subLabel && ` ${subLabel}`}
        </p>
      )}
    </div>
  );

  return href ? <Link to={href}>{card}</Link> : card;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data, isLoading } = useQuery<{ data: DashboardData }>({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get('/admin/dashboard').then((r) => r.data),
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min
  });

  const d = data?.data;

  if (isLoading || !d) {
    return (
      <AdminLayout title="Dashboard">
        <div className="flex justify-center py-24">
          <div className="w-8 h-8 border-4 border-kb-teal border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-6 max-w-5xl">

        {/* Revenue row */}
        <div>
          <h2 className="text-xs font-semibold text-kb-muted uppercase tracking-wider mb-3">Revenue</h2>
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Today"
              value={fmt(d.revenue.today)}
              sub={d.revenue.today_count}
              subLabel="orders"
              accent="teal"
            />
            <StatCard
              label="This Month"
              value={fmt(d.revenue.this_month)}
              sub={d.revenue.month_count}
              subLabel="orders"
              accent="teal"
            />
            <StatCard
              label="All Time"
              value={fmt(d.revenue.all_time)}
              accent="teal"
            />
          </div>
        </div>

        {/* Orders + Products + Customers row */}
        <div>
          <h2 className="text-xs font-semibold text-kb-muted uppercase tracking-wider mb-3">At a Glance</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Pending Fulfilment"
              value={d.orders.pending}
              sub={d.orders.total}
              subLabel="total orders"
              accent={d.orders.pending > 0 ? 'amber' : 'teal'}
              href="/orders"
            />
            <StatCard
              label="Active Products"
              value={d.products.active}
              sub={d.products.draft > 0 ? d.products.draft : undefined}
              subLabel={d.products.draft > 0 ? 'drafts' : undefined}
              accent="teal"
              href="/products"
            />
            <StatCard
              label="Low / Out of Stock"
              value={`${d.products.low_stock} / ${d.products.out_of_stock}`}
              accent={d.products.out_of_stock > 0 ? 'red' : d.products.low_stock > 0 ? 'amber' : 'green'}
              href="/products"
            />
            <StatCard
              label="Customers"
              value={d.customers.total}
              sub={d.customers.new_this_month > 0 ? `+${d.customers.new_this_month}` : undefined}
              subLabel={d.customers.new_this_month > 0 ? 'this month' : undefined}
              accent="teal"
              href="/customers"
            />
          </div>
        </div>

        {/* Recent orders */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-kb-muted uppercase tracking-wider">Recent Orders</h2>
            <Link to="/orders" className="text-xs text-kb-teal hover:underline">View all →</Link>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {d.recent_orders.length === 0 ? (
              <p className="text-center py-10 text-sm text-kb-muted">No orders yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-kb-cream/60">
                    <th className="text-left px-4 py-3 font-medium text-kb-muted">Order</th>
                    <th className="text-left px-4 py-3 font-medium text-kb-muted">Customer</th>
                    <th className="text-left px-4 py-3 font-medium text-kb-muted">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-kb-muted">Payment</th>
                    <th className="text-left px-4 py-3 font-medium text-kb-muted">Fulfilment</th>
                    <th className="text-right px-4 py-3 font-medium text-kb-muted">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {d.recent_orders.map((o) => (
                    <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-kb-teal">{o.order_number}</td>
                      <td className="px-4 py-2.5 text-kb-charcoal max-w-[140px] truncate">
                        {o.customer_name ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-kb-muted text-xs">
                        {new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PAYMENT_COLORS[o.payment_status] ?? 'bg-gray-50 text-gray-600'}`}>
                          {o.payment_status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${FULFIL_COLORS[o.fulfillment_status] ?? 'bg-gray-50 text-gray-600'}`}>
                          {o.fulfillment_status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">{fmtFull(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}
