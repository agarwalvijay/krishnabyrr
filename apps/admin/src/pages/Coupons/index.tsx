import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../../lib/hooks';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/Layout/AdminLayout';
import { api } from '../../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  type: 'flat' | 'percent' | 'free_shipping';
  value: string | null;
  valid_from: string | null;
  valid_until: string | null;
  max_uses_total: number | null;
  max_uses_per_customer: number;
  current_use_count: number;
  min_order_value: string | null;
  max_discount_cap: string | null;
  customer_eligibility: string;
  is_public: boolean;
  is_active: boolean;
  auto_apply: boolean;
  redemption_count: number;
  created_at: string;
}

interface Meta { total: number; page: number; pages: number }

// ── Schema ────────────────────────────────────────────────────────────────────

const couponSchema = z.object({
  code:                  z.string().min(2, 'Required').max(50).regex(/^[A-Z0-9_-]+$/i, 'Alphanumeric, _ and - only'),
  description:           z.string().max(500).optional().or(z.literal('')),
  type:                  z.enum(['flat', 'percent', 'free_shipping']),
  value:                 z.coerce.number().min(0).optional(),
  valid_from:            z.string().optional().or(z.literal('')),
  valid_until:           z.string().optional().or(z.literal('')),
  max_uses_total:        z.coerce.number().int().positive().optional().or(z.literal('')),
  max_uses_per_customer: z.coerce.number().int().min(1).default(1),
  min_order_value:       z.coerce.number().min(0).optional().or(z.literal('')),
  max_discount_cap:      z.coerce.number().min(0).optional().or(z.literal('')),
  customer_eligibility:  z.enum(['ALL', 'SPECIFIC', 'FIRST_ORDER']).default('ALL'),
  is_public:             z.boolean().default(true),
  auto_apply:            z.boolean().default(false),
  is_active:             z.boolean().default(true),
});

type FormData = z.infer<typeof couponSchema>;

// ── Live preview ──────────────────────────────────────────────────────────────

function DiscountPreview({ type, value }: { type: string; value: string | number | undefined }) {
  if (!value || type === 'free_shipping') {
    return <span className="text-kb-teal font-medium">Free Shipping</span>;
  }
  if (type === 'percent') {
    return <span className="text-kb-teal font-medium">{value}% off</span>;
  }
  return <span className="text-kb-teal font-medium">₹{Number(value).toLocaleString('en-IN')} off</span>;
}

// ── Field helper (defined outside slide-over so its identity is stable) ───────

const inputCls = "w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-kb-teal/30 focus:border-kb-teal outline-none";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-kb-muted mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-kb-error mt-0.5">{error}</p>}
    </div>
  );
}

// ── Slide-Over ────────────────────────────────────────────────────────────────

function CouponSlideOver({ coupon, onClose }: { coupon: Coupon | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isNew = coupon === null;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(couponSchema),
    defaultValues: {
      code:                  coupon?.code ?? '',
      description:           coupon?.description ?? '',
      type:                  coupon?.type ?? 'flat',
      value:                 coupon?.value ? Number(coupon.value) : undefined,
      valid_from:            coupon?.valid_from ? coupon.valid_from.slice(0, 10) : '',
      valid_until:           coupon?.valid_until ? coupon.valid_until.slice(0, 10) : '',
      max_uses_total:        coupon?.max_uses_total ?? '',
      max_uses_per_customer: coupon?.max_uses_per_customer ?? 1,
      min_order_value:       coupon?.min_order_value ? Number(coupon.min_order_value) : '',
      max_discount_cap:      coupon?.max_discount_cap ? Number(coupon.max_discount_cap) : '',
      customer_eligibility:  (coupon?.customer_eligibility as 'ALL' | 'SPECIFIC' | 'FIRST_ORDER') ?? 'ALL',
      is_public:             coupon?.is_public ?? true,
      auto_apply:            coupon?.auto_apply ?? false,
      is_active:             coupon?.is_active ?? true,
    },
  });

  const watchType  = watch('type');
  const watchValue = watch('value');

  const saveMutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        ...data,
        code: (data.code as string).toUpperCase(),
        value: data.value ?? null,
        valid_from:         (data.valid_from as string)   || null,
        valid_until:        (data.valid_until as string)  || null,
        max_uses_total:     data.max_uses_total === '' ? null : data.max_uses_total,
        min_order_value:    data.min_order_value === '' ? null : data.min_order_value,
        max_discount_cap:   data.max_discount_cap === '' ? null : data.max_discount_cap,
      };
      return isNew
        ? api.post('/admin/coupons', payload)
        : api.put(`/admin/coupons/${coupon!.id}`, payload);
    },
    onSuccess: () => {
      toast.success(isNew ? 'Coupon created' : 'Coupon updated');
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Save failed';
      toast.error(msg);
    },
  });

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-50 w-full max-w-lg bg-white shadow-xl overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-kb-charcoal text-base">
            {isNew ? 'New Coupon' : `Edit ${coupon.code}`}
          </h2>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-gray-50 text-kb-muted">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Preview */}
        <div className="px-5 pt-4 pb-2">
          <div className="bg-kb-cream rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-mono font-semibold text-kb-charcoal">
              {watch('code') || 'CODE'}
            </span>
            <DiscountPreview type={watchType} value={watchValue} />
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="flex-1 px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code *" error={errors.code?.message}>
              <input {...register('code')} className={inputCls} placeholder="SUMMER20"
                style={{ textTransform: 'uppercase' }} />
            </Field>
            <Field label="Type *" error={errors.type?.message}>
              <select {...register('type')} className={inputCls}>
                <option value="flat">Flat (₹)</option>
                <option value="percent">Percent (%)</option>
                <option value="free_shipping">Free Shipping</option>
              </select>
            </Field>
          </div>

          {watchType !== 'free_shipping' && (
            <Field label={watchType === 'percent' ? 'Percent Off *' : 'Discount Amount (₹) *'} error={errors.value?.message}>
              <input {...register('value')} type="number" min="0" step={watchType === 'percent' ? '1' : '1'} className={inputCls} />
            </Field>
          )}

          <Field label="Description" error={errors.description?.message}>
            <input {...register('description')} className={inputCls} placeholder="Internal note" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Valid From" error={errors.valid_from?.message}>
              <input {...register('valid_from')} type="date" className={inputCls} />
            </Field>
            <Field label="Valid Until" error={errors.valid_until?.message}>
              <input {...register('valid_until')} type="date" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Max Total Uses" error={errors.max_uses_total?.message}>
              <input {...register('max_uses_total')} type="number" min="1" className={inputCls} placeholder="∞" />
            </Field>
            <Field label="Max Per Customer" error={errors.max_uses_per_customer?.message}>
              <input {...register('max_uses_per_customer')} type="number" min="1" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Min Order (₹)" error={errors.min_order_value?.message}>
              <input {...register('min_order_value')} type="number" min="0" className={inputCls} placeholder="None" />
            </Field>
            <Field label="Max Discount Cap (₹)" error={errors.max_discount_cap?.message}>
              <input {...register('max_discount_cap')} type="number" min="0" className={inputCls} placeholder="None" />
            </Field>
          </div>

          <Field label="Customer Eligibility" error={errors.customer_eligibility?.message}>
            <select {...register('customer_eligibility')} className={inputCls}>
              <option value="ALL">All customers</option>
              <option value="FIRST_ORDER">First order only</option>
              <option value="SPECIFIC">Specific customers</option>
            </select>
          </Field>

          {/* Toggles */}
          <div className="space-y-2 pt-2">
            {([
              ['is_active',  'Active'],
              ['is_public',  'Public (show on checkout)'],
              ['auto_apply', 'Auto-apply'],
            ] as const).map(([field, label]) => (
              <label key={field} className="flex items-center gap-3 cursor-pointer">
                <input {...register(field)} type="checkbox" className="w-4 h-4 rounded accent-kb-teal" />
                <span className="text-sm text-kb-charcoal">{label}</span>
              </label>
            ))}
          </div>
        </form>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex gap-3">
          <button
            onClick={handleSubmit((d) => saveMutation.mutate(d))}
            disabled={saveMutation.isPending || (!isDirty && !isNew)}
            className="flex-1 py-2.5 rounded-lg bg-kb-teal text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving…' : isNew ? 'Create Coupon' : 'Save Changes'}
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

export default function CouponsPage() {
  const queryClient = useQueryClient();
  const [slideOver, setSlideOver] = useState<Coupon | null | 'new'>('new' as never);
  const [openSlide, setOpenSlide] = useState(false);
  const [page, setPage]           = useState(1);
  const [activeFilter, setActiveFilter] = useState('');
  const [search, setSearch]             = useState('');
  const debouncedSearch                 = useDebounce(search, 400);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const hasFilters = debouncedSearch || activeFilter;

  const { data, isLoading, isFetching } = useQuery<{ data: Coupon[]; meta: Meta }>({
    queryKey: ['admin-coupons', page, activeFilter, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (activeFilter !== '')  params.set('is_active', activeFilter);
      if (debouncedSearch)      params.set('q', debouncedSearch);
      return api.get(`/admin/coupons?${params}`).then((r) => r.data);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/coupons/${id}`),
    onSuccess: () => {
      toast.success('Coupon deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
    },
    onError: () => toast.error('Delete failed'),
  });

  const coupons = data?.data ?? [];
  const meta    = data?.meta;

  const handleNew = () => {
    setSlideOver(null);
    setOpenSlide(true);
  };
  const handleEdit = (c: Coupon) => {
    setSlideOver(c);
    setOpenSlide(true);
  };

  return (
    <AdminLayout
      title="Coupons"
      action={
        <button
          onClick={handleNew}
          className="flex items-center gap-2 px-4 py-2 bg-kb-teal text-white text-sm font-medium rounded-lg hover:opacity-90"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Coupon
        </button>
      }
    >
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
            placeholder="Search code…"
            autoComplete="off"
            className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-md text-sm w-44 focus:outline-none focus:ring-2 focus:ring-kb-teal"
          />
        </div>
        <select
          value={activeFilter}
          onChange={(e) => { setActiveFilter(e.target.value); setPage(1); }}
          className="select-inline border border-gray-200 rounded-md text-sm px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-kb-teal"
        >
          <option value="">All</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
        {isFetching && !isLoading && (
          <div className="w-3.5 h-3.5 border-2 border-kb-teal border-t-transparent rounded-full animate-spin" />
        )}
        {hasFilters && (
          <button onClick={() => { setSearch(''); setActiveFilter(''); setPage(1); }} className="text-xs text-kb-teal hover:underline">
            Clear all
          </button>
        )}
        <p className="ml-auto text-sm text-kb-muted">{meta?.total ?? 0} coupons</p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="w-8 h-8 border-4 border-kb-teal border-t-transparent rounded-full animate-spin" />
          </div>
        ) : coupons.length === 0 ? (
          <div className="text-center py-16 text-kb-muted text-sm">No coupons found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-kb-cream/60">
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Code</th>
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Type</th>
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Discount</th>
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Validity</th>
                <th className="text-right px-4 py-3 font-medium text-kb-muted">Uses</th>
                <th className="text-left px-4 py-3 font-medium text-kb-muted">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {coupons.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono font-semibold text-kb-charcoal">{c.code}</td>
                  <td className="px-4 py-3 capitalize text-kb-muted">{c.type.replace('_', ' ')}</td>
                  <td className="px-4 py-3">
                    {c.type === 'free_shipping' ? 'Free shipping' :
                     c.type === 'percent' ? `${Number(c.value)}%` :
                     `₹${Number(c.value).toLocaleString('en-IN')}`}
                  </td>
                  <td className="px-4 py-3 text-kb-muted text-xs">
                    {c.valid_from ? new Date(c.valid_from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                    {c.valid_from && c.valid_until ? ' – ' : ''}
                    {c.valid_until ? new Date(c.valid_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : ''}
                    {!c.valid_from && !c.valid_until ? '—' : ''}
                  </td>
                  <td className="px-4 py-3 text-right text-kb-muted">
                    {c.current_use_count}{c.max_uses_total ? `/${c.max_uses_total}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'
                    }`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => handleEdit(c)}
                        className="text-xs text-kb-teal hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete coupon ${c.code}?`)) deleteMutation.mutate(c.id);
                        }}
                        className="text-xs text-kb-error hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {meta && meta.pages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-md disabled:opacity-40 hover:bg-gray-50">← Prev</button>
          <span className="text-sm text-kb-muted">{page} / {meta.pages}</span>
          <button onClick={() => setPage((p) => Math.min(meta.pages, p + 1))} disabled={page === meta.pages}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-md disabled:opacity-40 hover:bg-gray-50">Next →</button>
        </div>
      )}

      {/* Slide-over */}
      {openSlide && (
        <CouponSlideOver
          coupon={slideOver as Coupon | null}
          onClose={() => setOpenSlide(false)}
        />
      )}
    </AdminLayout>
  );
}
