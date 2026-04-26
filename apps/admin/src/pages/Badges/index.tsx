import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/Layout/AdminLayout';
import { api } from '../../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Badge {
  id: string;
  name: string;
  hex_color: string;
  text_color: string;
  is_active: boolean;
  is_filter: boolean;
  is_nav: boolean;
  display_order: number;
  product_count: number;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const badgeSchema = z.object({
  name:          z.string().min(1, 'Name is required').max(100),
  hex_color:     z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use format #RRGGBB').default('#1A6B6B'),
  text_color:    z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use format #RRGGBB').default('#FFFFFF'),
  is_active:     z.boolean().default(true),
  is_filter:     z.boolean().default(false),
  is_nav:        z.boolean().default(false),
  display_order: z.coerce.number().int().min(0).default(0),
});
type BadgeFormData = z.infer<typeof badgeSchema>;

// ── Slide-over ────────────────────────────────────────────────────────────────

function BadgeSlideOver({ badge, onClose }: { badge: Badge | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isNew = badge === null;

  const { register, handleSubmit, watch, formState: { errors, isDirty } } = useForm<BadgeFormData>({
    resolver: zodResolver(badgeSchema),
    defaultValues: {
      name:          badge?.name          ?? '',
      hex_color:     badge?.hex_color     ?? '#1A6B6B',
      text_color:    badge?.text_color    ?? '#FFFFFF',
      is_active:     badge?.is_active     ?? true,
      is_filter:     badge?.is_filter     ?? false,
      is_nav:        badge?.is_nav        ?? false,
      display_order: badge?.display_order ?? 0,
    },
  });

  const hexColor  = watch('hex_color');
  const textColor = watch('text_color');
  const name      = watch('name');

  const saveMutation = useMutation({
    mutationFn: (data: BadgeFormData) =>
      isNew
        ? api.post('/admin/badges', data)
        : api.put(`/admin/badges/${badge!.id}`, data),
    onSuccess: () => {
      toast.success(isNew ? 'Badge created' : 'Badge updated');
      queryClient.invalidateQueries({ queryKey: ['admin-badges'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Save failed';
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/admin/badges/${badge!.id}`),
    onSuccess: () => {
      toast.success('Badge deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-badges'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Delete failed';
      toast.error(msg);
    },
  });

  const isValidHex = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v);

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-md bg-white shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-kb-charcoal">{isNew ? 'New Badge' : 'Edit Badge'}</h2>
          <button onClick={onClose} className="text-kb-muted hover:text-kb-charcoal transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {/* Preview */}
            {name && isValidHex(hexColor) && isValidHex(textColor) && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <span className="text-xs text-kb-muted">Preview:</span>
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: hexColor, color: textColor }}
                >
                  {name}
                </span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">
                Badge Name <span className="text-kb-error">*</span>
              </label>
              <input {...register('name')} placeholder="e.g. Bestseller" />
              {errors.name && <p className="mt-1 text-xs text-kb-error">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-kb-charcoal mb-1">
                  Background Color <span className="text-kb-error">*</span>
                </label>
                <div className="flex items-center gap-2">
                  {isValidHex(hexColor) && (
                    <span className="w-6 h-6 rounded-full border border-black/10 flex-shrink-0" style={{ backgroundColor: hexColor }} />
                  )}
                  <input {...register('hex_color')} placeholder="#1A6B6B" />
                </div>
                {errors.hex_color && <p className="mt-1 text-xs text-kb-error">{errors.hex_color.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-kb-charcoal mb-1">
                  Text Color <span className="text-kb-error">*</span>
                </label>
                <div className="flex items-center gap-2">
                  {isValidHex(textColor) && (
                    <span className="w-6 h-6 rounded-full border border-black/10 flex-shrink-0" style={{ backgroundColor: textColor }} />
                  )}
                  <input {...register('text_color')} placeholder="#FFFFFF" />
                </div>
                {errors.text_color && <p className="mt-1 text-xs text-kb-error">{errors.text_color.message}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">Display Order</label>
              <input {...register('display_order')} type="number" min={0} placeholder="0" />
              <p className="mt-1 text-xs text-kb-muted">Lower = shown first on product cards</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input type="checkbox" id="is_active" {...register('is_active')} className="rounded" />
                <label htmlFor="is_active" className="text-sm font-medium text-kb-charcoal">
                  Active (visible on products)
                </label>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="is_filter" {...register('is_filter')} className="rounded" />
                <label htmlFor="is_filter" className="text-sm font-medium text-kb-charcoal">
                  Show as filter on shop page
                </label>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="is_nav" {...register('is_nav')} className="rounded" />
                <label htmlFor="is_nav" className="text-sm font-medium text-kb-charcoal">
                  Show in site navigation menu
                </label>
              </div>
            </div>

            {!isNew && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-kb-muted mb-2">
                  Attached to <strong>{badge?.product_count ?? 0}</strong> product(s).
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete badge "${badge?.name}"? It will be removed from all products.`)) {
                      deleteMutation.mutate();
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="text-xs text-kb-error hover:underline disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Deleting…' : 'Delete this badge'}
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saveMutation.isPending || (!isNew && !isDirty)}
            >
              {saveMutation.isPending ? 'Saving…' : isNew ? 'Create Badge' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BadgesPage() {
  const [slideOver, setSlideOver] = useState<Badge | 'new' | null>(null);

  const { data: badges = [], isLoading } = useQuery<Badge[]>({
    queryKey: ['admin-badges'],
    queryFn: () => api.get('/admin/badges').then((r) => r.data.data ?? []),
  });

  return (
    <AdminLayout
      title="Badges"
      action={
        <button className="btn-primary" onClick={() => setSlideOver('new')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          New Badge
        </button>
      }
    >
      {isLoading ? (
        <div className="card p-10 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-kb-teal border-t-transparent rounded-full animate-spin" />
        </div>
      ) : badges.length === 0 ? (
        <div className="card p-10 text-center text-kb-muted">
          No badges yet.{' '}
          <button className="text-kb-teal hover:underline" onClick={() => setSlideOver('new')}>
            Create one
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-kb-muted">Badge</th>
                <th className="px-4 py-3 text-left font-medium text-kb-muted">Colors</th>
                <th className="px-4 py-3 text-center font-medium text-kb-muted">Order</th>
                <th className="px-4 py-3 text-center font-medium text-kb-muted">Flags</th>
                <th className="px-4 py-3 text-center font-medium text-kb-muted">Products</th>
                <th className="px-4 py-3 text-right font-medium text-kb-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {badges.map((badge) => (
                <tr key={badge.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: badge.hex_color, color: badge.text_color }}
                      >
                        {badge.name}
                      </span>
                      {!badge.is_active && (
                        <span className="text-xs text-kb-muted bg-gray-100 px-1.5 py-0.5 rounded">inactive</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: badge.hex_color }} title={badge.hex_color} />
                      <span className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: badge.text_color }} title={badge.text_color} />
                      <code className="text-xs text-kb-muted">{badge.hex_color}</code>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-kb-muted">{badge.display_order}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      {badge.is_filter && (
                        <span className="text-xs text-kb-teal bg-kb-teal/10 px-1.5 py-0.5 rounded">filter</span>
                      )}
                      {badge.is_nav && (
                        <span className="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">nav</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-kb-muted">{badge.product_count}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSlideOver(badge)}
                      className="text-xs text-kb-teal hover:underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {slideOver !== null && (
        <BadgeSlideOver
          badge={slideOver === 'new' ? null : slideOver}
          onClose={() => setSlideOver(null)}
        />
      )}
    </AdminLayout>
  );
}
