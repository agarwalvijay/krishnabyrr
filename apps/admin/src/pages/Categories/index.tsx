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

interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  description: string | null;
  banner_img: string | null;
  banner_height: BannerHeight;
  is_active: boolean;
  is_nav: boolean;
  sort_order: number;
  product_count: number;
  children?: Category[];
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const categorySchema = z.object({
  name:        z.string().min(1, 'Name is required').max(120),
  slug:        z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only').optional().or(z.literal('')),
  parent_id:   z.string().nullable().optional(),
  description: z.string().max(500).optional().or(z.literal('')),
  sort_order:  z.coerce.number().int().min(0).optional(),
  is_active:   z.boolean().optional(),
  is_nav:      z.boolean().optional(),
});

type FormData = z.infer<typeof categorySchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTree(flat: Category[]): Category[] {
  const byId = new Map<string, Category>();
  const roots: Category[] = [];

  flat.forEach(c => byId.set(c.id, { ...c, children: [] }));
  flat.forEach(c => {
    const node = byId.get(c.id)!;
    if (c.parent_id && byId.has(c.parent_id)) {
      byId.get(c.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });

  const sort = (arr: Category[]): Category[] =>
    arr.sort((a, b) => a.sort_order - b.sort_order).map(n => ({ ...n, children: sort(n.children ?? []) }));

  return sort(roots);
}

function flatten(tree: Category[], depth = 0): Array<{ node: Category; depth: number }> {
  const result: Array<{ node: Category; depth: number }> = [];
  tree.forEach(n => {
    result.push({ node: n, depth });
    if (n.children?.length) result.push(...flatten(n.children, depth + 1));
  });
  return result;
}

// ── Slide-over panel ──────────────────────────────────────────────────────────

interface SlideOverProps {
  category: Category | null; // null = create new
  allFlat: Category[];
  onClose: () => void;
}

function CategorySlideOver({ category, allFlat, onClose }: SlideOverProps) {
  const queryClient = useQueryClient();
  const isNew = category === null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [bannerFile,   setBannerFile]   = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(
    category?.banner_img ? imageUrl(category.banner_img) : null
  );
  const [bannerHeight, setBannerHeight] = useState<BannerHeight>(category?.banner_height ?? 'md');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name:        category?.name        ?? '',
      slug:        category?.slug        ?? '',
      parent_id:   category?.parent_id   ?? null,
      description: category?.description ?? '',
      sort_order:  category?.sort_order  ?? 0,
      is_active:   category?.is_active   ?? true,
      is_nav:      category?.is_nav      ?? true,
    },
  });

  const uploadBanner = async (categoryId: string, file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    await api.post(`/admin/categories/${categoryId}/banner`, fd);
  };

  const removeBannerMutation = useMutation({
    mutationFn: () => api.delete(`/admin/categories/${category!.id}/banner`),
    onSuccess: () => {
      setBannerPreview(null);
      setBannerFile(null);
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      toast.success('Banner removed');
    },
    onError: () => toast.error('Failed to remove banner'),
  });

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = { ...data, slug: data.slug || undefined, parent_id: data.parent_id || null, banner_height: bannerHeight };
      if (isNew) {
        const res = await api.post('/admin/categories', payload);
        const newId = res.data.data.id as string;
        if (bannerFile) await uploadBanner(newId, bannerFile);
        return res;
      } else {
        const res = await api.put(`/admin/categories/${category!.id}`, payload);
        if (bannerFile) await uploadBanner(category!.id, bannerFile);
        return res;
      }
    },
    onSuccess: () => {
      toast.success(isNew ? 'Category created' : 'Category updated');
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Save failed';
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/admin/categories/${category!.id}`),
    onSuccess: () => {
      toast.success('Category deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
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

  const parentOptions = allFlat.filter(c => c.id !== category?.id && c.parent_id !== category?.id);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-md bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-kb-charcoal">
            {isNew ? 'New Category' : 'Edit Category'}
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
              <input {...register('name')} placeholder="e.g. Sarees" />
              {errors.name && <p className="mt-1 text-xs text-kb-error">{errors.name.message}</p>}
            </div>

            {/* Slug */}
            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">
                Slug <span className="text-kb-muted font-normal">(auto-generated if blank)</span>
              </label>
              <input {...register('slug')} placeholder="e.g. sarees" />
              {errors.slug && <p className="mt-1 text-xs text-kb-error">{errors.slug.message}</p>}
              {watch('slug') && (
                <p className="mt-1 text-xs text-kb-muted">
                  URL: /category/<strong>{watch('slug')}</strong>
                </p>
              )}
            </div>

            {/* Parent */}
            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">Parent Category</label>
              <select {...register('parent_id')}>
                <option value="">None (top-level)</option>
                {parentOptions.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">Description</label>
              <textarea
                {...register('description')}
                rows={3}
                placeholder="Optional short description"
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-kb-teal resize-none"
              />
              {errors.description && <p className="mt-1 text-xs text-kb-error">{errors.description.message}</p>}
            </div>

            {/* Sort order */}
            <div>
              <label className="block text-sm font-medium text-kb-charcoal mb-1">Sort Order</label>
              <input type="number" {...register('sort_order')} min={0} />
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between py-2 border-t border-gray-100">
              <div>
                <p className="text-sm font-medium text-kb-charcoal">Active</p>
                <p className="text-xs text-kb-muted">Inactive categories are hidden from the storefront</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" {...register('is_active')} className="sr-only peer" />
                <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-kb-teal" />
              </label>
            </div>

            {/* Show in site navigation menu */}
            <div className="flex items-center justify-between py-2 border-t border-gray-100">
              <div>
                <p className="text-sm font-medium text-kb-charcoal">Show in site navigation menu</p>
                <p className="text-xs text-kb-muted">When off, this category still works via direct link and the Shop page but doesn&apos;t appear in the top menu flyout</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" {...register('is_nav')} className="sr-only peer" />
                <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-kb-teal" />
              </label>
            </div>

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
                        setBannerPreview(category?.banner_img ? imageUrl(category.banner_img) : null);
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
                {(category?.product_count ?? 0) > 0 ? (
                  <p className="text-xs text-kb-muted">
                    Cannot delete — {category?.product_count} product{category?.product_count === 1 ? '' : 's'} assigned.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete "${category?.name}"? This cannot be undone.`)) {
                        deleteMutation.mutate();
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="text-xs text-kb-error hover:underline disabled:opacity-50"
                  >
                    {deleteMutation.isPending ? 'Deleting…' : 'Delete this category'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saveMutation.isPending || (!isNew && !isDirty && !bannerFile && bannerHeight === (category?.banner_height ?? 'md'))}
            >
              {saveMutation.isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving…
                </>
              ) : isNew ? 'Create Category' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ── Row component ─────────────────────────────────────────────────────────────

interface RowProps {
  node: Category;
  depth: number;
  onEdit: (c: Category) => void;
  onToggleActive: (c: Category) => void;
  toggling: string | null;
}

function CategoryRow({ node, depth, onEdit, onToggleActive, toggling }: RowProps) {
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="py-3 pr-4" style={{ paddingLeft: `${16 + depth * 24}px` }}>
        <div className="flex items-center gap-2">
          {depth > 0 && (
            <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          )}
          <span className={`text-sm ${depth === 0 ? 'font-medium text-kb-charcoal' : 'text-kb-muted'}`}>
            {node.name}
          </span>
        </div>
      </td>
      <td className="py-3 px-4">
        <code className="text-xs text-kb-muted bg-gray-50 px-1.5 py-0.5 rounded">{node.slug}</code>
      </td>
      <td className="py-3 px-4 text-sm text-kb-muted text-center">
        {node.product_count}
      </td>
      <td className="py-3 px-4 text-center">
        <button
          onClick={() => onToggleActive(node)}
          disabled={toggling === node.id}
          className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors disabled:opacity-50 ${
            node.is_active ? 'bg-kb-teal' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${
              node.is_active ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </td>
      <td className="py-3 pl-4 pr-6 text-right">
        <button
          onClick={() => onEdit(node)}
          className="text-xs font-medium text-kb-teal hover:underline"
        >
          Edit
        </button>
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [panelOpen, setPanelOpen]   = useState(false);
  const [editing, setEditing]       = useState<Category | null>(null); // null = create new
  const [toggling, setToggling]     = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<Category[]>({
    queryKey: ['admin-categories'],
    queryFn: async () => {
      const res = await api.get('/admin/categories');
      return res.data.data ?? res.data;
    },
  });

  const flat = data ?? [];
  const tree = buildTree(flat);
  const rows = flatten(tree);

  const handleToggleActive = async (cat: Category) => {
    setToggling(cat.id);
    try {
      await api.put(`/admin/categories/${cat.id}`, { is_active: !cat.is_active });
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      toast.success(cat.is_active ? 'Category deactivated' : 'Category activated');
    } catch {
      toast.error('Failed to update category');
    } finally {
      setToggling(null);
    }
  };

  const openEdit   = (cat: Category) => { setEditing(cat);  setPanelOpen(true); };
  const openNew    = ()               => { setEditing(null); setPanelOpen(true); };
  const closePanel = ()               => setPanelOpen(false);

  return (
    <AdminLayout
      title="Categories"
      action={
        <button className="btn-primary" onClick={openNew}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          New Category
        </button>
      }
    >
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="py-20 text-center text-sm text-kb-muted">Loading categories…</div>
        ) : isError ? (
          <div className="py-20 text-center text-sm text-kb-error">Failed to load categories.</div>
        ) : rows.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm text-kb-muted mb-4">No categories yet.</p>
            <button className="btn-primary" onClick={openNew}>Add your first category</button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="py-3 pl-4 pr-4 text-left text-xs font-medium text-kb-muted uppercase tracking-wide">Name</th>
                <th className="py-3 px-4 text-left text-xs font-medium text-kb-muted uppercase tracking-wide">Slug</th>
                <th className="py-3 px-4 text-center text-xs font-medium text-kb-muted uppercase tracking-wide">Products</th>
                <th className="py-3 px-4 text-center text-xs font-medium text-kb-muted uppercase tracking-wide">Active</th>
                <th className="py-3 pl-4 pr-6 text-right text-xs font-medium text-kb-muted uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(({ node, depth }) => (
                <CategoryRow
                  key={node.id}
                  node={node}
                  depth={depth}
                  onEdit={openEdit}
                  onToggleActive={handleToggleActive}
                  toggling={toggling}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Slide-over */}
      {panelOpen && (
        <CategorySlideOver
          category={editing}
          allFlat={flat}
          onClose={closePanel}
        />
      )}
    </AdminLayout>
  );
}
