import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/Layout/AdminLayout';
import StockAdjustModal from '../../components/StockAdjustModal';
import { useAuth } from '../../contexts/AuthContext';
import { api, imageUrl } from '../../lib/api';
import { formatINR, discountPct, stockColorClass, stockLabel } from '../../lib/format';
import { useDebounce } from '../../lib/hooks';

type StatusFilter = 'all' | 'active' | 'draft' | 'archived';
type StockFilter  = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
type SortCol      = 'created_at' | 'name' | 'mrp' | 'stock_qty' | 'status';
type SortDir      = 'asc' | 'desc';

interface CollectionItem { id: string; name: string; slug: string }
interface TagGroupData {
  label: string;
  is_filter: boolean;
  tags: Array<{ id: string; value: string }>;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  mrp: number;
  sale_price: number | null;
  stock_qty: number;
  status: 'active' | 'draft' | 'archived';
  primary_image: { gcs_path: string; alt_text: string } | null;
  first_category?: string;
  created_at: string;
}

interface ProductsResponse {
  data: Product[];
  meta: { total: number; page: number; limit: number; pages: number };
}

interface ApiErrorBody {
  error?: { message?: string; code?: string };
}

function StatusBadge({ status }: { status: Product['status'] }) {
  const cls = { active: 'badge-active', draft: 'badge-draft', archived: 'badge-archived' }[status];
  const label = { active: 'Active', draft: 'Draft', archived: 'Archived' }[status];
  return <span className={cls}>{label}</span>;
}

function StockCell({ qty }: { qty: number }) {
  const cls = stockColorClass(qty);
  return <span className={cls}>{stockLabel(qty)}</span>;
}

function PriceCell({ mrp, salePrice }: { mrp: number; salePrice: number | null }) {
  if (salePrice && salePrice < mrp) {
    return (
      <div>
        <span className="font-semibold text-kb-gold">{formatINR(salePrice)}</span>
        <span className="ml-1.5 text-xs text-kb-muted line-through">{formatINR(mrp)}</span>
        <span
          className="ml-1 text-xs font-medium px-1 py-0.5 rounded"
          style={{ background: 'rgba(200,151,26,0.12)', color: 'var(--kb-gold)' }}
        >
          {discountPct(mrp, salePrice)}% off
        </span>
      </div>
    );
  }
  return <span className="font-medium">{formatINR(mrp)}</span>;
}

// ── Placeholder image ──────────────────────────────────────────────────────────
function ProductThumb({ image, name }: { image: Product['primary_image']; name: string }) {
  if (!image?.gcs_path) {
    return (
      <div className="w-12 h-12 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={imageUrl(image.gcs_path)}
      alt={image.alt_text ?? name}
      className="w-12 h-12 rounded-md object-cover flex-shrink-0 bg-gray-100"
      onError={(e) => { (e.target as HTMLImageElement).src = ''; }}
    />
  );
}

// ── Bulk Organisation Modal ────────────────────────────────────────────────────

function BulkOrgModal({
  selectedIds,
  onClose,
  onDone,
}: {
  selectedIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();

  const { data: collectionsData } = useQuery<{ data: CollectionItem[] }>({
    queryKey: ['collections-list'],
    queryFn: () => api.get('/collections').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const { data: tagsData } = useQuery<{ data: Record<string, TagGroupData> }>({
    queryKey: ['tags-groups'],
    queryFn: () => api.get('/tags').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const { data: categoriesData } = useQuery<Array<{ id: string; name: string; children?: Array<{ id: string; name: string }> }>>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data.data),
    staleTime: 5 * 60 * 1000,
  });

  const allCollections = collectionsData?.data ?? [];
  const tagGroupEntries = Object.entries(tagsData?.data ?? {})
    .map(([key, g]) => ({ key, label: g.label, tags: g.tags }))
    .filter((g) => g.tags.length > 0);
  const allTags = tagGroupEntries.flatMap((g) => g.tags);

  // Flatten category tree
  const flatCategories: Array<{ id: string; name: string; indent: boolean }> = [];
  for (const cat of categoriesData ?? []) {
    flatCategories.push({ id: cat.id, name: cat.name, indent: false });
    for (const child of cat.children ?? []) {
      flatCategories.push({ id: child.id, name: child.name, indent: true });
    }
  }

  const [selTags, setSelTags]               = useState<string[]>([]);
  const [selCollections, setSelCollections] = useState<string[]>([]);
  const [selCategories, setSelCategories]   = useState<string[]>([]);
  const [tagMode, setTagMode]               = useState<'add' | 'replace'>('add');
  const [collMode, setCollMode]             = useState<'add' | 'replace'>('add');
  const [catMode, setCatMode]               = useState<'add' | 'replace'>('add');
  const [applying, setApplying]             = useState(false);

  const toggleTag  = (id: string) => setSelTags((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const toggleColl = (id: string) => setSelCollections((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const toggleCat  = (id: string) => setSelCategories((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const nothingSelected = selTags.length === 0 && selCollections.length === 0 && selCategories.length === 0;

  const handleApply = async () => {
    if (nothingSelected) {
      toast.error('Select at least one tag, category, or collection to apply');
      return;
    }
    setApplying(true);
    try {
      await Promise.all(
        selectedIds.map(async (productId) => {
          const tasks: Promise<unknown>[] = [];

          if (selTags.length > 0) {
            if (tagMode === 'replace') {
              tasks.push(api.put(`/admin/products/${productId}/tags`, { tag_ids: selTags }));
            } else {
              const cur = await api.get(`/admin/products/${productId}`);
              const existing: string[] = (cur.data.data.tags ?? []).map((t: { id: string }) => t.id);
              tasks.push(api.put(`/admin/products/${productId}/tags`, { tag_ids: [...new Set([...existing, ...selTags])] }));
            }
          }

          if (selCollections.length > 0) {
            if (collMode === 'replace') {
              tasks.push(api.put(`/admin/products/${productId}/collections`, { collection_ids: selCollections }));
            } else {
              const cur = await api.get(`/admin/products/${productId}`);
              const existing: string[] = (cur.data.data.collections ?? []).map((c: { id: string }) => c.id);
              tasks.push(api.put(`/admin/products/${productId}/collections`, { collection_ids: [...new Set([...existing, ...selCollections])] }));
            }
          }

          if (selCategories.length > 0) {
            if (catMode === 'replace') {
              tasks.push(api.put(`/admin/products/${productId}/categories`, { category_ids: selCategories }));
            } else {
              const cur = await api.get(`/admin/products/${productId}`);
              const existing: string[] = (cur.data.data.categories ?? []).map((c: { id: string }) => c.id);
              tasks.push(api.put(`/admin/products/${productId}/categories`, { category_ids: [...new Set([...existing, ...selCategories])] }));
            }
          }

          await Promise.all(tasks);
        })
      );

      toast.success(`Updated ${selectedIds.length} product(s)`);
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      onDone();
    } catch {
      toast.error('Some updates failed');
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-kb-charcoal">Bulk Organisation</h2>
            <p className="text-xs text-kb-muted mt-0.5">Applying to {selectedIds.length} product(s)</p>
          </div>
          <button onClick={onClose} className="text-kb-muted hover:text-kb-charcoal">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Tags section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-kb-charcoal">Tags</h3>
              <div className="flex items-center gap-3 text-xs text-kb-muted">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="tag-mode" value="add" checked={tagMode === 'add'}
                    onChange={() => setTagMode('add')} className="accent-kb-teal" />
                  Add to existing
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="tag-mode" value="replace" checked={tagMode === 'replace'}
                    onChange={() => setTagMode('replace')} className="accent-kb-teal" />
                  Replace all
                </label>
              </div>
            </div>
            {tagGroupEntries.length === 0 ? (
              <p className="text-sm text-kb-muted">No tag groups configured.</p>
            ) : (
              <div className="space-y-3">
                {tagGroupEntries.map((group) => (
                  <div key={group.key}>
                    <p className="text-xs font-medium text-kb-muted uppercase tracking-wide mb-1">{group.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.tags.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTag(t.id)}
                          className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                            selTags.includes(t.id)
                              ? 'bg-kb-teal text-white border-kb-teal'
                              : 'bg-white text-kb-muted border-gray-200 hover:border-kb-teal hover:text-kb-teal'
                          }`}
                        >
                          {t.value}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Categories section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-kb-charcoal">Categories</h3>
              <div className="flex items-center gap-3 text-xs text-kb-muted">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="cat-mode" value="add" checked={catMode === 'add'}
                    onChange={() => setCatMode('add')} className="accent-kb-teal" />
                  Add to existing
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="cat-mode" value="replace" checked={catMode === 'replace'}
                    onChange={() => setCatMode('replace')} className="accent-kb-teal" />
                  Replace all
                </label>
              </div>
            </div>
            {(categoriesData ?? []).length === 0 ? (
              <p className="text-sm text-kb-muted">No categories configured.</p>
            ) : (
              <div className="space-y-2">
                {(categoriesData ?? []).map((parent) => (
                  <div key={parent.id}>
                    <div className="mb-1.5">
                      <button
                        type="button"
                        onClick={() => toggleCat(parent.id)}
                        className={`px-2.5 py-1 rounded-full text-xs border font-medium transition-colors ${
                          selCategories.includes(parent.id)
                            ? 'bg-kb-teal text-white border-kb-teal'
                            : 'bg-white text-kb-muted border-gray-200 hover:border-kb-teal hover:text-kb-teal'
                        }`}
                      >
                        {parent.name}
                      </button>
                    </div>
                    {parent.children && parent.children.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pl-4">
                        {parent.children.map((child) => (
                          <button
                            key={child.id}
                            type="button"
                            onClick={() => toggleCat(child.id)}
                            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                              selCategories.includes(child.id)
                                ? 'bg-kb-teal text-white border-kb-teal'
                                : 'bg-white text-kb-muted border-gray-200 hover:border-kb-teal hover:text-kb-teal'
                            }`}
                          >
                            ↳ {child.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Collections section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-kb-charcoal">Collections</h3>
              <div className="flex items-center gap-3 text-xs text-kb-muted">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="coll-mode" value="add" checked={collMode === 'add'}
                    onChange={() => setCollMode('add')} className="accent-kb-teal" />
                  Add to existing
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="coll-mode" value="replace" checked={collMode === 'replace'}
                    onChange={() => setCollMode('replace')} className="accent-kb-teal" />
                  Replace all
                </label>
              </div>
            </div>
            {allCollections.length === 0 ? (
              <p className="text-sm text-kb-muted">No collections configured.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {allCollections.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleColl(c.id)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      selCollections.includes(c.id)
                        ? 'bg-kb-teal text-white border-kb-teal'
                        : 'bg-white text-kb-muted border-gray-200 hover:border-kb-teal hover:text-kb-teal'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!nothingSelected && (
            <div className="rounded-lg p-3 text-xs text-kb-muted bg-gray-50 border border-gray-100 space-y-1">
              <strong className="text-kb-charcoal">Will apply:</strong>
              {selCategories.length > 0 && (
                <div>{catMode === 'add' ? 'Add' : 'Replace with'} <strong>{selCategories.length}</strong> categor{selCategories.length === 1 ? 'y' : 'ies'}.</div>
              )}
              {selTags.length > 0 && (
                <div>{tagMode === 'add' ? 'Add' : 'Replace with'} <strong>{selTags.length}</strong> tag(s): {allTags.filter(t => selTags.includes(t.id)).map(t => `"${t.value}"`).join(', ')}.</div>
              )}
              {selCollections.length > 0 && (
                <div>{collMode === 'add' ? 'Add' : 'Replace with'} <strong>{selCollections.length}</strong> collection(s).</div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleApply}
            disabled={applying || nothingSelected}
          >
            {applying ? `Applying to ${selectedIds.length}…` : `Apply to ${selectedIds.length} product(s)`}
          </button>
        </div>
      </div>
    </>
  );
}

export default function ProductList() {
  const navigate      = useNavigate();
  const queryClient   = useQueryClient();
  const { user }      = useAuth();
  const isSuperAdmin  = user?.role === 'super_admin';

  // Filters
  const [search, setSearch]           = useState('');
  const [status, setStatus]           = useState<StatusFilter>('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [collection, setCollection]   = useState('');
  const [tagFilters, setTagFilters]   = useState<Record<string, string>>({});
  const [page, setPage]               = useState(1);
  const [sortCol, setSortCol]         = useState<SortCol>('created_at');
  const [sortDir, setSortDir]         = useState<SortDir>('desc');
  const debouncedSearch               = useDebounce(search, 400);

  // Reset to page 1 only when the debounced query actually changes,
  // not on every keystroke — avoids state churn while the user is still typing
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  // Selection
  const [selected, setSelected]   = useState<Set<string>>(new Set());

  // Stock modal
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);

  // Bulk org modal
  const [bulkOrgOpen, setBulkOrgOpen] = useState(false);

  // Fetch collections + tag groups for filter dropdowns
  const { data: collectionsData } = useQuery<{ data: CollectionItem[] }>({
    queryKey: ['collections-list'],
    queryFn: () => api.get('/collections').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const { data: tagsData } = useQuery<{ data: Record<string, TagGroupData> }>({
    queryKey: ['tags-groups'],
    queryFn: () => api.get('/tags').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const collections = collectionsData?.data ?? [];
  const tagGroups = tagsData?.data ?? {};
  const filterGroups = Object.entries(tagGroups).filter(([, g]) => g.is_filter && g.tags.length > 0);

  const hasFilters = debouncedSearch || status !== 'all' || stockFilter !== 'all'
    || collection || Object.values(tagFilters).some(Boolean);

  const handleSortCol = (col: SortCol) => {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir(col === 'created_at' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const sortParam = sortCol === 'created_at'
    ? (sortDir === 'desc' ? 'newest' : 'oldest')
    : `${sortCol}_${sortDir}`;

  // Build query params
  const params: Record<string, string> = { page: String(page), limit: '24', sort: sortParam };
  if (status !== 'all') params.status = status;
  if (debouncedSearch)  params.q = debouncedSearch;
  if (collection)       params.collection = collection;
  if (stockFilter === 'in_stock')      params.in_stock = 'true';
  if (stockFilter === 'out_of_stock')  { params.stock_max = '0'; }
  if (stockFilter === 'low_stock')     { params.stock_min = '1'; params.stock_max = '3'; }
  for (const [k, v] of Object.entries(tagFilters)) { if (v) params[k] = v; }

  const { data, isLoading, isFetching, isError, error } = useQuery<ProductsResponse, AxiosError>({
    queryKey: ['admin-products', params],
    queryFn: () => api.get('/admin/products', { params }).then((r) => r.data),
  });

  // Bulk mutation
  const bulkMutation = useMutation({
    mutationFn: async ({ ids, newStatus }: { ids: string[]; newStatus: string }) => {
      for (const id of ids) {
        await api.put(`/admin/products/${id}`, { status: newStatus });
      }
    },
    onSuccess: (_, { newStatus }) => {
      toast.success(`Updated ${selected.size} product(s) to "${newStatus}"`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    },
    onError: () => toast.error('Bulk update failed'),
  });

  // Hard-delete (super_admin only) — wipes the product, every cascaded
  // relation, and image files from disk. Optional force=true cleans up
  // order_items references (destroys order history; test-data only).
  const deleteMutation = useMutation({
    mutationFn: async ({ id, force }: { id: string; force: boolean }) => {
      const qs = force ? '?hard=true&force=true' : '?hard=true';
      const res = await api.delete(`/admin/products/${id}${qs}`);
      return res.data.data as { id: string; name: string; files_deleted: number };
    },
    onSuccess: (data) => {
      toast.success(`Deleted "${data.name}" (+${data.files_deleted} file${data.files_deleted === 1 ? '' : 's'})`);
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    },
    onError: (err: AxiosError<ApiErrorBody>) => {
      const code = err.response?.data?.error?.code;
      const msg  = err.response?.data?.error?.message ?? 'Delete failed.';
      if (code === 'PRODUCT_HAS_ORDERS') {
        // Let the caller (the delete button) decide whether to force.
        throw err;
      }
      toast.error(msg);
    },
  });

  const handleDelete = async (product: Product) => {
    const confirmed = window.confirm(
      `Hard delete "${product.name}"?\n\n` +
      `This permanently removes:\n` +
      `  • the product row and all cascaded relations\n` +
      `  • image files on disk\n\n` +
      `Cannot be undone. Continue?`
    );
    if (!confirmed) return;

    try {
      await deleteMutation.mutateAsync({ id: product.id, force: false });
    } catch (err: unknown) {
      const e = err as AxiosError<ApiErrorBody>;
      if (e.response?.data?.error?.code === 'PRODUCT_HAS_ORDERS') {
        const forceConfirm = window.confirm(
          `${e.response.data.error.message}\n\n` +
          `Proceed and also remove the order line items?`
        );
        if (forceConfirm) {
          try {
            await deleteMutation.mutateAsync({ id: product.id, force: true });
          } catch {
            // toast already shown by onError for non-PRODUCT_HAS_ORDERS
          }
        }
      } else {
        toast.error(e.response?.data?.error?.message ?? 'Delete failed.');
      }
    }
  };

  const products: Product[] = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, pages: 1 };
  const errorMessage =
    ((error?.response?.data as ApiErrorBody | undefined)?.error?.message) ??
    'Please try again.';

  const allSelected = products.length > 0 && products.every((p) => selected.has(p.id));
  const toggleAll   = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(products.map((p) => p.id)));
  };
  const toggleOne   = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const clearFilters = () => {
    setSearch(''); setStatus('all'); setStockFilter('all');
    setCollection(''); setTagFilters({}); setPage(1);
  };

  return (
    <AdminLayout
      title="Products"
      action={
        <Link to="/products/new" className="btn-primary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Add Product
        </Link>
      }
    >
      {/* Filters bar */}
      <div className="space-y-2 mb-4">
        {/* Row 1: search + status + stock + spinner */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-kb-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or SKU…"
              autoComplete="off"
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-md text-sm w-48 focus:outline-none focus:ring-2 focus:ring-kb-teal"
            />
          </div>

          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value as StatusFilter); setPage(1); }}
            className="select-inline border border-gray-200 rounded-md text-sm px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-kb-teal"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>

          <select
            value={stockFilter}
            onChange={(e) => { setStockFilter(e.target.value as StockFilter); setPage(1); }}
            className="select-inline border border-gray-200 rounded-md text-sm px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-kb-teal"
          >
            <option value="all">All Stock</option>
            <option value="in_stock">In Stock</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
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

        {/* Row 2: collection + tag group filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Collection */}
          {collections.length > 0 && (
            <select
              value={collection}
              onChange={(e) => { setCollection(e.target.value); setPage(1); }}
              className={`select-inline border rounded-md text-xs px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-kb-teal transition-colors ${
                collection ? 'border-kb-teal text-kb-teal font-medium' : 'border-gray-200 text-kb-muted'
              }`}
            >
              <option value="">Collection</option>
              {collections.map((c) => (
                <option key={c.id} value={c.slug}>{c.name}</option>
              ))}
            </select>
          )}

          {/* Tag group dropdowns */}
          {filterGroups.map(([key, group]) => (
            <select
              key={key}
              value={tagFilters[key] ?? ''}
              onChange={(e) => {
                setTagFilters((prev) => ({ ...prev, [key]: e.target.value }));
                setPage(1);
              }}
              className={`select-inline border rounded-md text-xs px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-kb-teal transition-colors ${
                tagFilters[key] ? 'border-kb-teal text-kb-teal font-medium' : 'border-gray-200 text-kb-muted'
              }`}
            >
              <option value="">{group.label}</option>
              {group.tags.map((t) => (
                <option key={t.id} value={t.value}>{t.value}</option>
              ))}
            </select>
          ))}
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-2 rounded-md mb-3 text-sm"
          style={{ background: 'rgba(26,107,107,0.06)', border: '1px solid rgba(26,107,107,0.2)' }}
        >
          <span className="font-medium text-kb-teal">{selected.size} selected</span>
          <div className="flex gap-2 ml-2">
            {(['active', 'draft', 'archived'] as const).map((s) => (
              <button
                key={s}
                onClick={() => bulkMutation.mutate({ ids: [...selected], newStatus: s })}
                disabled={bulkMutation.isPending}
                className="px-3 py-1 rounded-md border text-xs font-medium hover:bg-white transition-colors capitalize"
              >
                {s === 'active' ? 'Activate' : s === 'draft' ? 'Deactivate' : 'Archive'}
              </button>
            ))}
            <button
              onClick={() => setBulkOrgOpen(true)}
              className="px-3 py-1 rounded-md border text-xs font-medium hover:bg-white transition-colors text-kb-teal border-kb-teal/40"
            >
              Organise
            </button>
            {selected.size === 1 && (
              <button
                onClick={() => navigate(`/products/new?cloneFrom=${[...selected][0]}`)}
                className="px-3 py-1 rounded-md border text-xs font-medium hover:bg-white transition-colors text-kb-teal border-kb-teal/40"
              >
                Clone
              </button>
            )}
          </div>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-kb-muted hover:text-kb-charcoal">
            ✕
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {isError && (
          <div className="px-4 py-3 text-sm border-b border-red-100 bg-red-50 text-red-700">
            Failed to load filtered products. {errorMessage}
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-kb-teal border-t-transparent rounded-full animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg className="w-12 h-12 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-sm font-medium text-kb-charcoal mb-1">
              {hasFilters ? 'No products match your filters' : 'No products yet'}
            </p>
            {hasFilters ? (
              <button onClick={clearFilters} className="text-sm text-kb-teal hover:underline">Clear Filters</button>
            ) : (
              <Link to="/products/new" className="text-sm text-kb-teal hover:underline">Add your first product</Link>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
                </th>
                <th className="px-4 py-3 text-left w-14"></th>
                {(['name', 'mrp', 'stock_qty', 'status'] as SortCol[]).map((col, idx) => {
                  const labels: Partial<Record<SortCol, string>> = {
                    name: 'Name / SKU', mrp: 'Price', stock_qty: 'Stock', status: 'Status',
                  };
                  const active = sortCol === col;
                  return (
                    <>
                      <th
                        key={col}
                        onClick={() => handleSortCol(col)}
                        className={`px-4 py-3 text-left font-medium cursor-pointer select-none whitespace-nowrap transition-colors ${
                          active ? 'text-kb-teal' : 'text-kb-muted hover:text-kb-charcoal'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {labels[col]}
                          <span className="text-[10px]">
                            {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                          </span>
                        </span>
                      </th>
                      {/* Insert non-sortable Category column after Name */}
                      {idx === 0 && (
                        <th key="category" className="px-4 py-3 text-left font-medium text-kb-muted">
                          Category
                        </th>
                      )}
                    </>
                  );
                })}
                <th className="px-4 py-3 text-right font-medium text-kb-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleOne(p.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <ProductThumb image={p.primary_image} name={p.name} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-kb-charcoal line-clamp-1">{p.name}</p>
                    <p className="text-xs text-kb-muted mt-0.5">{p.sku}</p>
                  </td>
                  <td className="px-4 py-3 text-kb-muted">
                    {p.first_category ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <PriceCell mrp={parseFloat(String(p.mrp))} salePrice={p.sale_price ? parseFloat(String(p.sale_price)) : null} />
                  </td>
                  <td className="px-4 py-3">
                    <StockCell qty={p.stock_qty} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => navigate(`/products/${p.id}/edit`)}
                        className="text-xs px-2.5 py-1 rounded border border-gray-200 text-kb-muted hover:text-kb-charcoal hover:border-gray-300 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setAdjustingProduct(p)}
                        className="text-xs px-2.5 py-1 rounded border border-gray-200 text-kb-muted hover:text-kb-charcoal hover:border-gray-300 transition-colors"
                      >
                        Stock
                      </button>
                      {isSuperAdmin && (
                        <button
                          onClick={() => handleDelete(p)}
                          disabled={deleteMutation.isPending}
                          title="Hard delete (super_admin only)"
                          className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors disabled:opacity-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {meta.pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-kb-muted">
            {meta.total} product{meta.total === 1 ? '' : 's'} total
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded border border-gray-200 text-kb-muted hover:bg-gray-50 disabled:opacity-40"
            >
              ‹
            </button>
            {Array.from({ length: meta.pages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`px-3 py-1 rounded border text-sm transition-colors
                  ${p === page
                    ? 'border-kb-teal text-kb-teal font-medium'
                    : 'border-gray-200 text-kb-muted hover:bg-gray-50'
                  }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
              disabled={page === meta.pages}
              className="px-3 py-1 rounded border border-gray-200 text-kb-muted hover:bg-gray-50 disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>
      )}

      {/* Stock adjust modal */}
      {adjustingProduct && (
        <StockAdjustModal
          product={adjustingProduct}
          onClose={() => setAdjustingProduct(null)}
        />
      )}

      {/* Bulk organisation modal */}
      {bulkOrgOpen && (
        <BulkOrgModal
          selectedIds={[...selected]}
          onClose={() => setBulkOrgOpen(false)}
          onDone={() => { setBulkOrgOpen(false); setSelected(new Set()); }}
        />
      )}
    </AdminLayout>
  );
}
