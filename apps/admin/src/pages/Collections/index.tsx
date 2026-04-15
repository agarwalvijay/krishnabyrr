import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/Layout/AdminLayout';
import { api } from '../../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  is_homepage: boolean;
  homepage_order: number;
  product_count: number;
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const collectionSchema = z.object({
  name:             z.string().min(1, 'Name is required').max(120),
  slug:             z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only').optional().or(z.literal('')),
  description:      z.string().max(1000).optional().or(z.literal('')),
  is_active:        z.boolean().optional(),
  is_homepage: z.boolean().optional(),
  homepage_order:   z.coerce.number().int().min(0).optional(),
});

type FormData = z.infer<typeof collectionSchema>;

// ── Slide-over ────────────────────────────────────────────────────────────────

interface SlideOverProps {
  collection: Collection | null; // null = create new
  onClose: () => void;
}

function CollectionSlideOver({ collection, onClose }: SlideOverProps) {
  const queryClient = useQueryClient();
  const isNew = collection === null;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(collectionSchema),
    defaultValues: {
      name:             collection?.name             ?? '',
      slug:             collection?.slug             ?? '',
      description:      collection?.description      ?? '',
      is_active:        collection?.is_active        ?? true,
      is_homepage: collection?.is_homepage ?? false,
      homepage_order:   collection?.homepage_order   ?? 0,
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data: FormData) =>
      isNew
        ? api.post('/admin/collections', data)
        : api.put(`/admin/collections/${collection!.id}`, data),
    onSuccess: () => {
      toast.success(isNew ? 'Collection created' : 'Collection updated');
      queryClient.invalidateQueries({ queryKey: ['admin-collections'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Save failed';
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/admin/collections/${collection!.id}`),
    onSuccess: () => {
      toast.success('Collection deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-collections'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Delete failed';
      toast.error(msg);
    },
  });

  const onSubmit = (data: FormData) => {
    saveMutation.mutate({ ...data, slug: data.slug || undefined });
  };

  const showHomepage = watch('is_homepage');

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-md bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-kb-charcoal">
            {isNew ? 'New Collection' : 'Edit Collection'}
          </h2>
          <button onClick={onClose} className="text-kb-muted hover:text-kb-charcoal transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">
                Name <span className="text-kb-error">*</span>
              </label>
              <input {...register('name')} placeholder="e.g. New Arrivals" />
              {errors.name && <p className="mt-1 text-xs text-kb-error">{errors.name.message}</p>}
            </div>

            {/* Slug */}
            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">
                Slug <span className="text-kb-muted font-normal">(auto-generated if blank)</span>
              </label>
              <input {...register('slug')} placeholder="e.g. new-arrivals" />
              {errors.slug && <p className="mt-1 text-xs text-kb-error">{errors.slug.message}</p>}
              {watch('slug') && (
                <p className="mt-1 text-xs text-kb-muted">
                  URL: /collection/<strong>{watch('slug')}</strong>
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">Description</label>
              <textarea
                {...register('description')}
                rows={4}
                placeholder="Optional description shown on the collection page"
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-kb-teal resize-none"
              />
              {errors.description && <p className="mt-1 text-xs text-kb-error">{errors.description.message}</p>}
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between py-3 border-t border-gray-100">
              <div>
                <p className="text-sm font-medium text-kb-charcoal">Active</p>
                <p className="text-xs text-kb-muted">Inactive collections are hidden from the storefront</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" {...register('is_active')} className="sr-only peer" />
                <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-kb-teal" />
              </label>
            </div>

            {/* Homepage toggle */}
            <div className="flex items-center justify-between py-3 border-t border-gray-100">
              <div>
                <p className="text-sm font-medium text-kb-charcoal">Show on Homepage</p>
                <p className="text-xs text-kb-muted">Feature this collection on the homepage</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" {...register('is_homepage')} className="sr-only peer" />
                <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-kb-teal" />
              </label>
            </div>

            {/* Homepage order — only visible when is_homepage is on */}
            {showHomepage && (
              <div>
                <label className="block text-sm font-medium text-kb-charcoal mb-1">
                  Homepage Order
                  <span className="ml-1 text-kb-muted font-normal">(lower = appears first)</span>
                </label>
                <input type="number" {...register('homepage_order')} min={0} />
              </div>
            )}

            {/* Products in collection (read-only count) */}
            {!isNew && (
              <div className="py-3 border-t border-gray-100">
                <p className="text-sm text-kb-muted">
                  <span className="font-medium text-kb-charcoal">{collection?.product_count ?? 0}</span>{' '}
                  product{(collection?.product_count ?? 0) === 1 ? '' : 's'} in this collection.
                  Manage products from the Product form.
                </p>
              </div>
            )}

            {/* Delete zone */}
            {!isNew && (
              <div className="pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete "${collection?.name}"? This cannot be undone.`)) {
                      deleteMutation.mutate();
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="text-xs text-kb-error hover:underline disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Deleting…' : 'Delete this collection'}
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saveMutation.isPending || (!isNew && !isDirty)}
            >
              {saveMutation.isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving…
                </>
              ) : isNew ? 'Create Collection' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ── Drag-to-reorder list ──────────────────────────────────────────────────────

interface ReorderListProps {
  items: Collection[];
  onReorder: (ordered: Collection[]) => void;
}

function HomepageReorderList({ items, onReorder }: ReorderListProps) {
  const [list, setList] = useState(items);
  const dragging = useRef<number | null>(null);

  // Keep in sync when parent items change
  const prev = useRef(items);
  if (prev.current !== items) {
    prev.current = items;
    setList(items);
  }

  const handleDragStart = (idx: number) => { dragging.current = idx; };
  const handleDragOver  = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragging.current === null || dragging.current === idx) return;
    const next = [...list];
    const [moved] = next.splice(dragging.current, 1);
    next.splice(idx, 0, moved);
    dragging.current = idx;
    setList(next);
  };
  const handleDrop = () => {
    dragging.current = null;
    onReorder(list);
  };

  return (
    <ul className="space-y-2">
      {list.map((col, idx) => (
        <li
          key={col.id}
          draggable
          onDragStart={() => handleDragStart(idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDrop={handleDrop}
          className="flex items-center gap-3 bg-white border border-gray-200 rounded-md px-3 py-2.5 cursor-grab active:cursor-grabbing select-none hover:border-kb-teal transition-colors"
        >
          {/* Drag handle */}
          <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16" />
          </svg>

          <span className="flex-1 text-sm font-medium text-kb-charcoal truncate">{col.name}</span>

          <span className="text-xs text-kb-muted">#{idx + 1}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CollectionsPage() {
  const queryClient = useQueryClient();
  const [slideOver, setSlideOver] = useState<Collection | 'new' | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  const { data, isLoading, isError } = useQuery<Collection[]>({
    queryKey: ['admin-collections'],
    queryFn: async () => {
      const res = await api.get('/admin/collections');
      return res.data.data ?? res.data;
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.put(`/admin/collections/${id}`, { is_active }),
    onSuccess: (_d, vars) => {
      toast.success(vars.is_active ? 'Collection activated' : 'Collection deactivated');
      queryClient.invalidateQueries({ queryKey: ['admin-collections'] });
    },
    onError: () => toast.error('Failed to update'),
  });

  const toggleHomepageMutation = useMutation({
    mutationFn: ({ id, is_homepage }: { id: string; is_homepage: boolean }) =>
      api.put(`/admin/collections/${id}`, { is_homepage }),
    onSuccess: (_d, vars) => {
      toast.success(vars.is_homepage ? 'Added to homepage' : 'Removed from homepage');
      queryClient.invalidateQueries({ queryKey: ['admin-collections'] });
    },
    onError: () => toast.error('Failed to update'),
  });

  const collections = data ?? [];
  const homepageCollections = [...collections]
    .filter(c => c.is_homepage)
    .sort((a, b) => a.homepage_order - b.homepage_order);

  const handleReorder = async (ordered: Collection[]) => {
    setSavingOrder(true);
    try {
      await Promise.all(
        ordered.map((col, idx) =>
          api.put(`/admin/collections/${col.id}`, { homepage_order: idx + 1 })
        )
      );
      toast.success('Homepage order saved');
      queryClient.invalidateQueries({ queryKey: ['admin-collections'] });
    } catch {
      toast.error('Failed to save order');
    } finally {
      setSavingOrder(false);
    }
  };

  return (
    <AdminLayout
      title="Collections"
      action={
        <div className="flex items-center gap-2">
          {homepageCollections.length > 0 && (
            <button
              className="btn-secondary"
              onClick={() => setReorderMode(r => !r)}
            >
              {reorderMode ? 'Done Reordering' : 'Reorder Homepage'}
            </button>
          )}
          <button className="btn-primary" onClick={() => setSlideOver('new')}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            New Collection
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Homepage order panel */}
        {reorderMode && homepageCollections.length > 0 && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-kb-charcoal">Homepage Order</h2>
                <p className="text-xs text-kb-muted mt-0.5">Drag to reorder how collections appear on the homepage</p>
              </div>
              {savingOrder && (
                <div className="flex items-center gap-2 text-xs text-kb-muted">
                  <span className="w-3 h-3 border-2 border-kb-teal border-t-transparent rounded-full animate-spin" />
                  Saving…
                </div>
              )}
            </div>
            <HomepageReorderList items={homepageCollections} onReorder={handleReorder} />
          </div>
        )}

        {/* Collections table */}
        <div className="card p-0 overflow-hidden">
          {isLoading ? (
            <div className="py-20 text-center text-sm text-kb-muted">Loading collections…</div>
          ) : isError ? (
            <div className="py-20 text-center text-sm text-kb-error">Failed to load collections.</div>
          ) : collections.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-sm text-kb-muted mb-4">No collections yet.</p>
              <button className="btn-primary" onClick={() => setSlideOver('new')}>
                Add your first collection
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="py-3 pl-6 pr-4 text-left text-xs font-medium text-kb-muted uppercase tracking-wide">Name</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-kb-muted uppercase tracking-wide">Slug</th>
                  <th className="py-3 px-4 text-center text-xs font-medium text-kb-muted uppercase tracking-wide">Products</th>
                  <th className="py-3 px-4 text-center text-xs font-medium text-kb-muted uppercase tracking-wide">Active</th>
                  <th className="py-3 px-4 text-center text-xs font-medium text-kb-muted uppercase tracking-wide">Homepage</th>
                  <th className="py-3 pl-4 pr-6 text-right text-xs font-medium text-kb-muted uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {collections.map(col => (
                  <tr key={col.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 pl-6 pr-4">
                      <span className="text-sm font-medium text-kb-charcoal">{col.name}</span>
                    </td>
                    <td className="py-3 px-4">
                      <code className="text-xs text-kb-muted bg-gray-50 px-1.5 py-0.5 rounded">{col.slug}</code>
                    </td>
                    <td className="py-3 px-4 text-sm text-kb-muted text-center">
                      {col.product_count}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => toggleActiveMutation.mutate({ id: col.id, is_active: !col.is_active })}
                        disabled={toggleActiveMutation.isPending}
                        className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors disabled:opacity-50 ${
                          col.is_active ? 'bg-kb-teal' : 'bg-gray-200'
                        }`}
                      >
                        <span className={`inline-block w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${
                          col.is_active ? 'translate-x-4' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => toggleHomepageMutation.mutate({ id: col.id, is_homepage: !col.is_homepage })}
                        disabled={toggleHomepageMutation.isPending}
                        className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors disabled:opacity-50 ${
                          col.is_homepage ? 'bg-kb-gold' : 'bg-gray-200'
                        }`}
                      >
                        <span className={`inline-block w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${
                          col.is_homepage ? 'translate-x-4' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </td>
                    <td className="py-3 pl-4 pr-6 text-right">
                      <button
                        onClick={() => setSlideOver(col)}
                        className="text-xs font-medium text-kb-teal hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Slide-over */}
      {slideOver !== null && (
        <CollectionSlideOver
          collection={slideOver === 'new' ? null : slideOver as Collection}
          onClose={() => setSlideOver(null)}
        />
      )}
    </AdminLayout>
  );
}
