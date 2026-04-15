import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/Layout/AdminLayout';
import StockAdjustModal from '../../components/StockAdjustModal';
import { api, imageUrl } from '../../lib/api';
import { formatINR, discountPct, stockColorClass, stockLabel } from '../../lib/format';
import { useDebounce } from '../../lib/hooks';

type StatusFilter = 'all' | 'active' | 'draft' | 'archived';
type StockFilter  = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';

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
  error?: { message?: string };
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

export default function ProductList() {
  const navigate      = useNavigate();
  const queryClient   = useQueryClient();

  // Filters
  const [search, setSearch]           = useState('');
  const [status, setStatus]           = useState<StatusFilter>('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [collection, setCollection]   = useState('');
  const [tagFilters, setTagFilters]   = useState<Record<string, string>>({});
  const [page, setPage]               = useState(1);
  const debouncedSearch               = useDebounce(search, 400);

  // Selection
  const [selected, setSelected]   = useState<Set<string>>(new Set());

  // Stock modal
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);

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

  // Build query params
  const params: Record<string, string> = { page: String(page), limit: '24' };
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
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name or SKU…"
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-md text-sm w-48 focus:outline-none focus:ring-2 focus:ring-kb-teal"
            />
          </div>

          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value as StatusFilter); setPage(1); }}
            className="border border-gray-200 rounded-md text-sm px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-kb-teal"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>

          <select
            value={stockFilter}
            onChange={(e) => { setStockFilter(e.target.value as StockFilter); setPage(1); }}
            className="border border-gray-200 rounded-md text-sm px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-kb-teal"
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
              className={`border rounded-md text-xs px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-kb-teal transition-colors ${
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
              className={`border rounded-md text-xs px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-kb-teal transition-colors ${
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
                <th className="px-4 py-3 text-left font-medium text-kb-muted">Name / SKU</th>
                <th className="px-4 py-3 text-left font-medium text-kb-muted">Category</th>
                <th className="px-4 py-3 text-left font-medium text-kb-muted">Price</th>
                <th className="px-4 py-3 text-left font-medium text-kb-muted">Stock</th>
                <th className="px-4 py-3 text-left font-medium text-kb-muted">Status</th>
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
    </AdminLayout>
  );
}
