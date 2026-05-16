import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/Layout/AdminLayout';
import { api, imageUrl } from '../../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type BannerHeight = 'sm' | 'md' | 'lg' | 'xl';

const HEIGHT_OPTIONS: Array<{ value: BannerHeight; label: string; hint: string }> = [
  { value: 'sm', label: 'Small',  hint: '180px' },
  { value: 'md', label: 'Medium', hint: '360px' },
  { value: 'lg', label: 'Large',  hint: '500px' },
  { value: 'xl', label: 'XL',     hint: '650px' },
];

interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  banner_img: string | null;
  banner_height: BannerHeight;
  is_active: boolean;
  is_nav: boolean;
  product_count: number;
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const collectionSchema = z.object({
  name:        z.string().min(1, 'Name is required').max(120),
  slug:        z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only').optional().or(z.literal('')),
  description: z.string().max(1000).optional().or(z.literal('')),
  is_active:   z.boolean().optional(),
  is_nav:      z.boolean().optional(),
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [bannerFile,    setBannerFile]    = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(
    collection?.banner_img ? imageUrl(collection.banner_img) : null
  );
  const [bannerHeight, setBannerHeight] = useState<BannerHeight>(collection?.banner_height ?? 'md');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(collectionSchema),
    defaultValues: {
      name:        collection?.name        ?? '',
      slug:        collection?.slug        ?? '',
      description: collection?.description ?? '',
      is_active:   collection?.is_active   ?? true,
      is_nav:      collection?.is_nav      ?? true,
    },
  });

  const uploadBanner = async (collectionId: string, file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    await api.post(`/admin/collections/${collectionId}/banner`, fd);
  };

  const removeBannerMutation = useMutation({
    mutationFn: () => api.delete(`/admin/collections/${collection!.id}/banner`),
    onSuccess: () => {
      setBannerPreview(null);
      setBannerFile(null);
      queryClient.invalidateQueries({ queryKey: ['admin-collections'] });
      toast.success('Banner removed');
    },
    onError: () => toast.error('Failed to remove banner'),
  });

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = { ...data, slug: data.slug || undefined, banner_height: bannerHeight };
      if (isNew) {
        const res = await api.post('/admin/collections', payload);
        const newId = res.data.data.id as string;
        if (bannerFile) await uploadBanner(newId, bannerFile);
        return res;
      } else {
        const res = await api.put(`/admin/collections/${collection!.id}`, payload);
        if (bannerFile) await uploadBanner(collection!.id, bannerFile);
        return res;
      }
    },
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

  const onSubmit = (data: FormData) => saveMutation.mutate(data);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerFile(file);
    setBannerPreview(URL.createObjectURL(file));
  };

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

            {/* Show in site navigation menu */}
            <div className="flex items-center justify-between py-3 border-t border-gray-100">
              <div>
                <p className="text-sm font-medium text-kb-charcoal">Show in site navigation menu</p>
                <p className="text-xs text-kb-muted">When off, this collection still works via direct link and the Shop page but doesn&apos;t appear in the top menu flyout</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" {...register('is_nav')} className="sr-only peer" />
                <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-kb-teal" />
              </label>
            </div>

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

            {/* Banner image */}
            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-2">Banner Image</label>
              {bannerPreview && (
                <div className="mb-2 relative rounded-lg overflow-hidden bg-gray-100" style={{ height: 120 }}>
                  <img src={bannerPreview} alt="Banner preview" className="w-full h-full object-cover" />
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary text-xs"
                >
                  {bannerPreview ? 'Replace image' : 'Upload image'}
                </button>
                {bannerPreview && !isNew && (
                  <button
                    type="button"
                    onClick={() => {
                      if (bannerFile) {
                        setBannerFile(null);
                        setBannerPreview(collection?.banner_img ? imageUrl(collection.banner_img) : null);
                      } else {
                        removeBannerMutation.mutate();
                      }
                    }}
                    className="text-xs text-red-500 hover:text-red-700"
                    disabled={removeBannerMutation.isPending}
                  >
                    {removeBannerMutation.isPending ? 'Removing…' : 'Remove banner'}
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-kb-muted">Compressed to JPEG 85% on upload. Recommended: 1920×500px.</p>
            </div>

            {/* Banner height */}
            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-2">Banner Height</label>
              <div className="flex gap-2">
                {HEIGHT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    title={opt.hint}
                    onClick={() => setBannerHeight(opt.value)}
                    className={[
                      'flex-1 py-1.5 text-xs rounded-md border transition-colors',
                      bannerHeight === opt.value
                        ? 'border-kb-teal bg-teal-50 text-kb-teal font-semibold'
                        : 'border-gray-200 text-kb-muted hover:border-gray-300',
                    ].join(' ')}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-kb-muted">
                {HEIGHT_OPTIONS.find(o => o.value === bannerHeight)?.hint}
              </p>
            </div>

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
              disabled={saveMutation.isPending || (!isNew && !isDirty && !bannerFile && bannerHeight === (collection?.banner_height ?? 'md'))}
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CollectionsPage() {
  const queryClient = useQueryClient();
  const [slideOver, setSlideOver] = useState<Collection | 'new' | null>(null);

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

  const collections = data ?? [];

  return (
    <AdminLayout
      title="Collections"
      action={
        <button className="btn-primary" onClick={() => setSlideOver('new')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          New Collection
        </button>
      }
    >
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
