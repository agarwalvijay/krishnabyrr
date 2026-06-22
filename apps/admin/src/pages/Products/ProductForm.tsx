import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/Layout/AdminLayout';
import { api, imageUrl } from '../../lib/api';
import { formatINR, discountPct } from '../../lib/format';

// ── Zod schema ────────────────────────────────────────────────────────────────
const schema = z.object({
  name:              z.string().min(1, 'Product name is required'),
  sku:               z.string().optional(),
  short_desc:        z.string().max(150).optional(),
  description:       z.string().optional(),
  care_instr:        z.string().optional(),
  mrp:               z.coerce.number({ required_error: 'MRP is required' }).positive('MRP must be positive'),
  sale_price:        z.preprocess(
    (v) => (v === '' || v == null ? null : Number(v)),
    z.number().positive('Sale price must be positive').nullable().optional()
  ),
  cost_price:        z.preprocess(
    (v) => (v === '' || v == null ? null : Number(v)),
    z.number().positive('Cost price must be positive').nullable().optional()
  ),
  gst_rate:          z.coerce.number().default(5),
  hsn_code:          z.string().optional(),
  stock_qty:         z.coerce.number().int().min(0).default(0),
  low_stock_threshold: z.coerce.number().int().min(0).default(2),
  oos_behavior:      z.enum(['show_sold_out', 'hide']).default('show_sold_out'),
  meta_title:        z.string().max(60).optional(),
  meta_desc:         z.string().max(160).optional(),
  slug:              z.string().optional(),
  video_url:         z.string().optional().nullable(),
  status:            z.enum(['draft', 'active', 'archived']).default('draft'),
});

type FormData = z.infer<typeof schema>;

const TABS = ['Basic Info', 'Media', 'Pricing', 'Inventory', 'Organisation', 'SEO', 'Related'];

// ── Char counter ──────────────────────────────────────────────────────────────
function CharCount({ value, max }: { value: string | undefined; max: number }) {
  const len = value?.length ?? 0;
  return (
    <span className={`text-xs ${len > max ? 'text-kb-error' : 'text-kb-muted'}`}>
      {len}/{max}
    </span>
  );
}

// ── Multi-checkbox list ───────────────────────────────────────────────────────
function MultiCheckList({
  items,
  selected,
  onChange,
  labelKey = 'name',
  valueKey = 'id',
  indent = false,
}: {
  items: Array<Record<string, unknown>>;
  selected: string[];
  onChange: (ids: string[]) => void;
  labelKey?: string;
  valueKey?: string;
  indent?: boolean;
}) {
  const toggle = (id: string) => {
    onChange(
      selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]
    );
  };
  return (
    <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-2">
      {items.map((item) => {
        const id = item[valueKey] as string;
        const label = (
          (item[labelKey] as string | undefined) ??
          (item.value as string | undefined) ??
          (item.slug as string | undefined) ??
          id
        );
        const isChild = indent && item.parent_id;
        return (
          <label key={id} className={`flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer ${isChild ? 'ml-4' : ''}`}>
            <input
              type="checkbox"
              checked={selected.includes(id)}
              onChange={() => toggle(id)}
              className="rounded text-kb-teal"
            />
            <span className="text-sm text-kb-charcoal">{label}</span>
            {(item.hex_color as string) && (
              <span
                className="w-3 h-3 rounded-full inline-block ml-auto"
                style={{ background: item.hex_color as string }}
              />
            )}
          </label>
        );
      })}
      {items.length === 0 && (
        <p className="text-xs text-kb-muted px-2 py-2">No items available</p>
      )}
    </div>
  );
}

// ── Image grid with drag-to-reorder ──────────────────────────────────────────
interface ImageRecord {
  id: string;
  gcs_path: string;
  alt_text?: string;
  display_order: number;
  is_primary: boolean;
}

interface PendingUpload {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;         // 0-100 (network upload); server processing shown as 100
  status: 'uploading' | 'processing' | 'failed';
  error?: string;
}

const PROCESS_GEMINI_LS_KEY = 'kb-admin:product-image-process-gemini';

function ImageGrid({
  productId,
  ensureProductId,
  images,
  onRefresh,
}: {
  productId: string | null;
  ensureProductId: () => Promise<string>;
  images: ImageRecord[];
  onRefresh: () => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const pendingRef = useRef<PendingUpload[]>([]);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  const [processGemini, setProcessGemini] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    // Default on; respect explicit opt-out only.
    return window.localStorage.getItem(PROCESS_GEMINI_LS_KEY) !== '0';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PROCESS_GEMINI_LS_KEY, processGemini ? '1' : '0');
  }, [processGemini]);

  // Revoke object URLs on unmount to avoid leaks
  useEffect(() => {
    return () => {
      pendingRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, []);

  const deleteMutation = useMutation({
    mutationFn: (imgId: string) =>
      api.delete(`/admin/products/${productId}/images/${imgId}`),
    onSuccess: () => { onRefresh(); toast.success('Image removed'); },
  });

  const reorderMutation = useMutation({
    mutationFn: (imgs: Array<{ id: string; display_order: number }>) =>
      api.put(`/admin/products/${productId}/images/reorder`, { images: imgs }),
    onSuccess: onRefresh,
  });

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    // Resolve the product ID (auto-saves draft if this is a brand-new product).
    let pid: string;
    try {
      pid = await ensureProductId();
    } catch {
      return; // ensureProductId surfaces its own user-facing error
    }

    // Seed pending tiles immediately so the user sees feedback before any
    // network activity begins.
    const newPending: PendingUpload[] = acceptedFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      status: 'uploading',
    }));
    setPending((prev) => [...prev, ...newPending]);

    // Upload sequentially — keeps server CPU/RAM predictable on free tier
    // and matches the existing behaviour.
    let successCount = 0;
    let failCount    = 0;
    for (const item of newPending) {
      const fd = new FormData();
      fd.append('image', item.file);
      if (processGemini) fd.append('process_gemini', 'true');
      try {
        await api.post(`/admin/products/${pid}/images`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            const total = e.total ?? item.file.size;
            const pct = total ? Math.min(99, Math.round((e.loaded / total) * 100)) : 0;
            setPending((prev) => prev.map((p) =>
              p.id === item.id
                ? { ...p, progress: pct, status: pct >= 99 ? 'processing' : 'uploading' }
                : p,
            ));
          },
        });
        // Success — drop this entry from pending and free its preview URL.
        URL.revokeObjectURL(item.previewUrl);
        setPending((prev) => prev.filter((p) => p.id !== item.id));
        successCount++;
      } catch (err) {
        const msg = (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? 'Upload failed';
        setPending((prev) => prev.map((p) =>
          p.id === item.id ? { ...p, status: 'failed', error: msg } : p,
        ));
        failCount++;
      }
    }

    onRefresh();
    if (successCount > 0) {
      toast.success(`${successCount} image${successCount === 1 ? '' : 's'} uploaded`);
    }
    if (failCount > 0) {
      toast.error(`${failCount} upload${failCount === 1 ? '' : 's'} failed`);
    }
  }, [ensureProductId, onRefresh, processGemini]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxSize: 5 * 1024 * 1024,
    multiple: true,
  });

  const dismissFailed = (uploadId: string) => {
    setPending((prev) => {
      const item = prev.find((p) => p.id === uploadId);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.id !== uploadId);
    });
  };

  const handleDragStart = (id: string) => setDragId(id);
  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const sorted = [...images].sort((a, b) => a.display_order - b.display_order);
    const fromIdx = sorted.findIndex((i) => i.id === dragId);
    const toIdx   = sorted.findIndex((i) => i.id === targetId);
    const reordered = [...sorted];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const updates = reordered.map((img, idx) => ({ id: img.id, display_order: idx }));
    reorderMutation.mutate(updates);
    setDragId(null);
  };

  return (
    <div className="space-y-4">
      {/* Krishna's Bliss stamp toggle */}
      <label className="flex items-center gap-2 text-sm text-kb-charcoal cursor-pointer select-none">
        <input
          type="checkbox"
          checked={processGemini}
          onChange={(e) => setProcessGemini(e.target.checked)}
        />
        <span>Add Krishna's Bliss Stamp</span>
      </label>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-kb-teal bg-teal-50' : 'border-gray-200 hover:border-kb-teal'}`}
      >
        <input {...getInputProps()} />
        <svg className="w-8 h-8 mx-auto text-kb-muted mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-sm text-kb-charcoal font-medium">
          {isDragActive ? 'Drop images here…' : 'Drag & drop images here'}
        </p>
        <p className="text-xs text-kb-muted mt-1">JPG, PNG, WebP · Max 5MB per file · Up to 10 images</p>
      </div>

      {/* Image grid (pending uploads first, then saved images) */}
      {(pending.length > 0 || images.length > 0) && (
        <div className="grid grid-cols-5 gap-3">
          {pending.map((p) => (
            <div
              key={p.id}
              className={`relative rounded-lg overflow-hidden border-2 aspect-square bg-gray-100
                ${p.status === 'failed' ? 'border-kb-error' : 'border-gray-200'}`}
            >
              <img
                src={p.previewUrl}
                alt={p.file.name}
                className="absolute inset-0 w-full h-full object-cover opacity-60"
              />
              {/* Progress / status overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
                {p.status === 'failed' ? (
                  <>
                    <span className="text-xs font-semibold text-white px-2 text-center leading-tight">
                      Failed
                    </span>
                    <button
                      type="button"
                      onClick={() => dismissFailed(p.id)}
                      className="mt-1 text-[10px] text-white underline"
                    >
                      Dismiss
                    </button>
                  </>
                ) : (
                  <>
                    {/* Circular progress */}
                    <svg className="w-10 h-10" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="15" fill="none" stroke="white" strokeWidth="3"
                        strokeDasharray={`${(p.progress / 100) * 94.25} 94.25`}
                        strokeLinecap="round"
                        transform="rotate(-90 18 18)"
                        style={{ transition: 'stroke-dasharray 0.2s linear' }}
                      />
                    </svg>
                    <span className="text-[10px] mt-1 text-white font-medium">
                      {p.status === 'processing' ? 'Processing…' : `${p.progress}%`}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
          {[...images].sort((a, b) => a.display_order - b.display_order).map((img) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => handleDragStart(img.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(img.id)}
              className={`relative group rounded-lg overflow-hidden border-2 cursor-grab aspect-square bg-gray-100
                ${img.is_primary ? 'border-kb-teal' : 'border-gray-200 hover:border-gray-300'}`}
            >
              {!failedImageIds.has(img.id) ? (
                <img
                  src={imageUrl(img.gcs_path)}
                  alt={img.alt_text ?? 'Product image'}
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={() => {
                    setFailedImageIds((prev) => {
                      const next = new Set(prev);
                      next.add(img.id);
                      return next;
                    });
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                  <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              )}
              {img.is_primary && (
                <span className="absolute top-1 left-1 text-xs px-1.5 py-0.5 rounded font-medium text-white"
                  style={{ background: 'var(--kb-teal)' }}>
                  Primary
                </span>
              )}
              <button
                onClick={() => {
                  if (confirm('Remove this image?')) deleteMutation.mutate(img.id);
                }}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 text-kb-error
                  flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main form component ───────────────────────────────────────────────────────
export default function ProductForm() {
  const { id }      = useParams<{ id: string }>();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  // localProductId holds the ID assigned when an unsaved product is implicitly
  // saved as part of dropping the first image. Lets us continue rendering the
  // current form (and its pending-upload state) without a route remount.
  const [localProductId, setLocalProductId] = useState<string | null>(null);
  const effectiveProductId = id ?? localProductId;
  const isNew       = !effectiveProductId;
  const [searchParams] = useSearchParams();
  const cloneFromId    = isNew ? (searchParams.get('cloneFrom') ?? undefined) : undefined;

  const [activeTab, setActiveTab] = useState(0);

  // Organisation state (separate from main form)
  const [selCategories,  setSelCategories]  = useState<string[]>([]);
  const [selTags,        setSelTags]        = useState<string[]>([]);
  const [selCollections, setSelCollections] = useState<string[]>([]);
  const [selBadges,      setSelBadges]      = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    getValues,
    trigger,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    shouldUnregister: false,
    defaultValues: {
      status: 'draft', gst_rate: 5, stock_qty: 0,
      low_stock_threshold: 2, oos_behavior: 'show_sold_out',
    },
  });

  // ── Load existing product ─────────────────────────────────────────────────
  const { data: productData, refetch: refetchProduct } = useQuery({
    queryKey: ['admin-product', effectiveProductId],
    queryFn: () => api.get(`/admin/products/${effectiveProductId}`).then((r) => r.data.data),
    enabled: !!effectiveProductId,
  });

  // ── Load clone source (new product only, when ?cloneFrom= is set) ─────────
  const { data: cloneSource } = useQuery({
    queryKey: ['admin-product', cloneFromId],
    queryFn: () => api.get(`/admin/products/${cloneFromId}`).then((r) => r.data.data),
    enabled: !!cloneFromId,
  });

  useEffect(() => {
    if (!productData) return;
    reset({
      name:               productData.name,
      sku:                productData.sku,
      short_desc:         productData.short_desc ?? '',
      description:        productData.description ?? '',
      care_instr:         productData.care_instr ?? '',
      mrp:                productData.mrp,
      sale_price:         productData.sale_price ?? null,
      cost_price:         productData.cost_price ?? null,
      gst_rate:           productData.gst_rate,
      hsn_code:           productData.hsn_code ?? '',
      stock_qty:          productData.stock_qty,
      low_stock_threshold: productData.low_stock_threshold,
      oos_behavior:       productData.oos_behavior,
      meta_title:         productData.meta_title ?? '',
      meta_desc:          productData.meta_desc ?? '',
      slug:               productData.slug,
      video_url:          productData.video_url ?? '',
      status:             productData.status,
    });
    setSelCategories(productData.categories?.map((c: {id: string}) => c.id) ?? []);
    setSelTags(productData.tags?.map((t: {id: string}) => t.id) ?? []);
    setSelCollections(productData.collections?.map((c: {id: string}) => c.id) ?? []);
    setSelBadges(productData.badges?.map((b: {id: string}) => b.id) ?? []);
  }, [productData, reset]);

  // Pre-fill from clone source (Basic Info + Organisation only)
  useEffect(() => {
    if (!cloneSource) return;
    reset({
      name:        `Copy of ${cloneSource.name}`,
      short_desc:  cloneSource.short_desc ?? '',
      description: cloneSource.description ?? '',
      care_instr:  cloneSource.care_instr ?? '',
      // Pricing / inventory / SEO start fresh
      gst_rate:    cloneSource.gst_rate ?? 5,
      status:      'draft',
      stock_qty:   0,
      low_stock_threshold: 2,
      oos_behavior: 'show_sold_out',
    });
    setSelCategories(cloneSource.categories?.map((c: { id: string }) => c.id) ?? []);
    setSelTags(cloneSource.tags?.map((t: { id: string }) => t.id) ?? []);
    setSelCollections(cloneSource.collections?.map((c: { id: string }) => c.id) ?? []);
  }, [cloneSource, reset]);

  // Auto-generate slug from name when creating new
  const watchedName = watch('name');
  const watchedSlug = watch('slug');
  useEffect(() => {
    if (!isNew || watchedSlug) return;
    const generated = watchedName
      ?.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    if (generated) setValue('slug', generated, { shouldDirty: false });
  }, [watchedName, isNew, watchedSlug, setValue]);

  // Live discount calculation
  const mrp       = parseFloat(String(watch('mrp') ?? 0));
  const salePrice = parseFloat(String(watch('sale_price') ?? 0));
  const discount  = discountPct(mrp, salePrice);

  // ── Reference data ────────────────────────────────────────────────────────
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data.data),
  });
  const { data: tagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: () => api.get('/tags').then((r) => r.data.data),
  });
  const { data: collectionsData } = useQuery({
    queryKey: ['collections'],
    queryFn: () => api.get('/collections').then((r) => r.data.data),
  });
  const { data: badgesData = [] } = useQuery<Array<{ id: string; name: string; hex_color: string; text_color: string }>>({
    queryKey: ['admin-badges'],
    queryFn: () => api.get('/admin/badges').then((r) => r.data.data ?? []),
  });

  // Flatten category tree for checkbox list
  const flatCategories: Array<{ id: string; name: string; parent_id: string | null }> = [];
  if (Array.isArray(categoriesData)) {
    for (const parent of categoriesData) {
      flatCategories.push({ id: parent.id, name: parent.name, parent_id: null });
      if (Array.isArray(parent.children)) {
        for (const child of parent.children) {
          flatCategories.push({ id: child.id, name: child.name, parent_id: parent.id });
        }
      }
    }
  }

  // Build dynamic tag groups from API response { groupName: { label, is_filter, tags: [] } }
  const tagGroupEntries: Array<{ key: string; label: string; tags: Array<{ id: string; value: string }> }> =
    tagsData && typeof tagsData === 'object'
      ? Object.entries(tagsData as Record<string, { label: string; tags: Array<{ id: string; value: string }> }>)
          .map(([key, g]) => ({ key, label: g.label, tags: g.tags ?? [] }))
          .filter((g) => g.tags.length > 0)
      : [];
  const allTagItems = tagGroupEntries.flatMap((g) => g.tags);

  // ── Save ─────────────────────────────────────────────────────────────────
  // Core save logic — reused by manual submit and by the auto-save that fires
  // when the admin drops images onto an unsaved product.
  const saveProductCore = useCallback(async (data: FormData): Promise<string> => {
    let productId = effectiveProductId;
    if (!productId) {
      const res = await api.post('/admin/products', data);
      productId = res.data.data.id as string;
    } else {
      await api.put(`/admin/products/${productId}`, data);
    }
    await Promise.all([
      api.put(`/admin/products/${productId}/categories`,  { category_ids: selCategories }),
      api.put(`/admin/products/${productId}/tags`,        { tag_ids: selTags }),
      api.put(`/admin/products/${productId}/collections`, { collection_ids: selCollections }),
      api.put(`/admin/products/${productId}/badges`,      { badge_ids: selBadges }),
    ]);
    return productId!;
  }, [effectiveProductId, selCategories, selTags, selCollections, selBadges]);

  const saveMutation = useMutation({
    mutationFn: saveProductCore,
    onSuccess: (productId) => {
      toast.success('Product saved!');
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['admin-product', productId] });
      // If we got here via the very first manual save of a brand-new product
      // (no URL id, no local id yet), promote the URL so refresh works.
      if (!id && !localProductId) navigate(`/products/${productId}/edit`);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Failed to save product';
      toast.error(msg);
    },
  });

  // ── Implicit save when dropping images onto an unsaved product ──────────
  const ensureProductId = useCallback(async (): Promise<string> => {
    if (effectiveProductId) return effectiveProductId;
    // Validate the minimum required fields before persisting a draft.
    const ok = await trigger(['name', 'mrp']);
    if (!ok) {
      toast.error('Add product name and MRP before uploading images');
      throw new Error('VALIDATION_FAILED');
    }
    const data = getValues();
    try {
      const newId = await saveProductCore(data);
      setLocalProductId(newId);
      // Update URL silently so a refresh lands on the edit route. We avoid
      // navigate() here because it would remount this component and lose the
      // in-flight upload state.
      window.history.replaceState(null, '', `/products/${newId}/edit`);
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast.success('Draft saved — starting upload…');
      return newId;
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Failed to save product';
      toast.error(msg);
      throw err;
    }
  }, [effectiveProductId, trigger, getValues, saveProductCore, queryClient]);

  const currentStatus = watch('status');
  const shortDesc     = watch('short_desc') ?? '';
  const metaTitle     = watch('meta_title') ?? '';
  const metaDesc      = watch('meta_desc')  ?? '';
  const currentSlug   = watch('slug') ?? '';

  const title = isNew
    ? (cloneSource ? `Clone: ${cloneSource.name}` : 'New Product')
    : (productData?.name ?? 'Edit Product');

  return (
    <AdminLayout title={title}>
      <div className="max-w-3xl">

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
                ${activeTab === i
                  ? 'border-kb-teal text-kb-teal'
                  : 'border-transparent text-kb-muted hover:text-kb-charcoal'
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit(
          (data) => saveMutation.mutate(data),
          (errs) => {
            // Jump to the first tab that has an error so the user can see it
            const fieldTabMap: Record<string, number> = {
              name: 0, short_desc: 0, description: 0, care_instr: 0,
              mrp: 2, sale_price: 2, cost_price: 2, gst_rate: 2, hsn_code: 2,
              stock_qty: 3, low_stock_threshold: 3, oos_behavior: 3,
              meta_title: 5, meta_desc: 5, slug: 5,
            };
            const firstErrorField = Object.keys(errs)[0];
            const targetTab = fieldTabMap[firstErrorField] ?? 0;
            setActiveTab(targetTab);
            const messages = Object.values(errs).map((e) => (e as { message?: string }).message).filter(Boolean);
            toast.error(messages[0] ?? 'Please fill in all required fields');
          }
        )}>
          {/* ── Tab 1: Basic Info ─────────────────────────────────────── */}
          <div className={activeTab === 0 ? '' : 'hidden'}>
            <div className="card p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-kb-charcoal mb-1">
                  Product Name <span className="text-kb-error">*</span>
                </label>
                <input type="text" {...register('name')} placeholder="e.g. Maheshwari Silk Unstitched Suit Set" />
                {errors.name && <p className="mt-1 text-xs text-kb-error">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-kb-charcoal mb-1">
                  SKU
                  <span className="text-xs font-normal text-kb-muted ml-2">Leave blank to auto-generate</span>
                </label>
                <input type="text" {...register('sku')} placeholder="KB-MS-001" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-kb-charcoal">
                    Short Description
                  </label>
                  <CharCount value={shortDesc} max={150} />
                </div>
                <textarea
                  {...register('short_desc')}
                  rows={2}
                  maxLength={150}
                  placeholder="One-line product summary shown on listing pages…"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-kb-charcoal mb-1">
                  Full Description
                </label>
                <textarea
                  {...register('description')}
                  rows={6}
                  placeholder="Detailed product description — fabric origin, weave technique, what's included…"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-kb-charcoal mb-1">
                  Care Instructions
                </label>
                <textarea
                  {...register('care_instr')}
                  rows={2}
                  placeholder="e.g. Dry clean only. Store in a muslin bag."
                />
              </div>
            </div>
          </div>

          {/* ── Tab 2: Media ─────────────────────────────────────────── */}
          <div className={activeTab === 1 ? '' : 'hidden'}>
            <div className="card p-6 space-y-4">
              {isNew && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
                  <svg className="w-5 h-5 text-kb-amber flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-kb-charcoal">
                    Drop images to save the product as a draft and start uploading. Name and MRP are required first.
                  </p>
                </div>
              )}
              <ImageGrid
                productId={effectiveProductId}
                ensureProductId={ensureProductId}
                images={productData?.images ?? []}
                onRefresh={() => queryClient.invalidateQueries({ queryKey: ['admin-product', effectiveProductId] })}
              />

              <div>
                <label className="block text-sm font-medium text-kb-charcoal mb-1">
                  Video URL
                  <span className="text-xs font-normal text-kb-muted ml-2">YouTube or Vimeo</span>
                </label>
                <input type="text" {...register('video_url')} placeholder="https://youtube.com/watch?v=..." />
              </div>
            </div>
          </div>

          {/* ── Tab 3: Pricing ───────────────────────────────────────── */}
          <div className={activeTab === 2 ? '' : 'hidden'}>
            <div className="card p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-kb-charcoal mb-1">
                    MRP (₹) <span className="text-kb-error">*</span>
                  </label>
                  <input type="number" {...register('mrp')} min="0" step="0.01" placeholder="7500" />
                  {errors.mrp && <p className="mt-1 text-xs text-kb-error">{errors.mrp.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-kb-charcoal mb-1">
                    Sale Price (₹)
                    <span className="text-xs font-normal text-kb-muted ml-2">optional</span>
                  </label>
                  <input type="number" {...register('sale_price')} min="0" step="0.01" placeholder="6750" />
                  {salePrice > 0 && mrp > 0 && discount > 0 && (
                    <p className="mt-1 text-xs text-kb-success font-medium">
                      Showing {discount}% off to customers
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-kb-charcoal mb-1">
                    Cost Price (₹)
                    <span className="text-xs font-normal text-kb-muted ml-2">internal only</span>
                  </label>
                  <input type="number" {...register('cost_price')} min="0" step="0.01" placeholder="3200" />
                  <p className="mt-1 text-xs text-kb-muted">Not shown to customers</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-kb-charcoal mb-1">GST Rate</label>
                  <select {...register('gst_rate')}>
                    <option value={5}>5%</option>
                    <option value={12}>12%</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-kb-charcoal mb-1">
                  HSN Code <span className="text-xs font-normal text-kb-muted">(optional)</span>
                </label>
                <input type="text" {...register('hsn_code')} placeholder="5007" className="max-w-[200px]" />
              </div>

              {/* Price preview */}
              {mrp > 0 && (
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-kb-muted mb-1">Customer will see</p>
                  <div className="flex items-baseline gap-2">
                    {salePrice > 0 && salePrice < mrp ? (
                      <>
                        <span className="text-lg font-bold text-kb-gold">{formatINR(salePrice)}</span>
                        <span className="text-sm text-kb-muted line-through">{formatINR(mrp)}</span>
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(200,151,26,0.12)', color: 'var(--kb-gold)' }}>
                          {discount}% off
                        </span>
                      </>
                    ) : (
                      <span className="text-lg font-bold text-kb-charcoal">{formatINR(mrp)}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Tab 4: Inventory ─────────────────────────────────────── */}
          <div className={activeTab === 3 ? '' : 'hidden'}>
            <div className="card p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-kb-charcoal mb-1">
                    Stock Quantity
                  </label>
                  <input type="number" {...register('stock_qty')} min="0" placeholder="3" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-kb-charcoal mb-1">
                    Low Stock Threshold
                  </label>
                  <input type="number" {...register('low_stock_threshold')} min="0" placeholder="2" />
                  <p className="mt-1 text-xs text-kb-muted">"Only N left!" shown when stock ≤ this value</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-kb-charcoal mb-2">
                  When Out of Stock
                </label>
                <div className="space-y-2">
                  {([
                    { value: 'show_sold_out', label: 'Show as Sold Out (recommended)' },
                    { value: 'hide',          label: 'Hide from store' },
                  ] as const).map(({ value, label }) => (
                    <label key={value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value={value}
                        {...register('oos_behavior')}
                        className="text-kb-teal"
                      />
                      <span className="text-sm text-kb-charcoal">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Tab 5: Organisation ──────────────────────────────────── */}
          <div className={activeTab === 4 ? '' : 'hidden'}>
            <div className="card p-6 space-y-6">

              {/* Categories — recursive renderer (Department -> Family -> Type) */}
              <div>
                <h3 className="text-sm font-semibold text-kb-charcoal mb-2">Categories</h3>
                {!Array.isArray(categoriesData) || categoriesData.length === 0 ? (
                  <p className="text-sm text-kb-muted">No categories configured.</p>
                ) : (
                  <div className="space-y-1.5">
                    {(function renderCategoryTree(
                      nodes: Array<{ id: string; name: string; children?: typeof nodes }>,
                      depth: number,
                    ): React.ReactNode {
                      return nodes.map((node) => (
                        <div key={node.id} style={{ paddingLeft: depth * 16 }}>
                          <button
                            type="button"
                            onClick={() => setSelCategories((prev) =>
                              prev.includes(node.id) ? prev.filter((x) => x !== node.id) : [...prev, node.id]
                            )}
                            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                              depth === 0 ? 'font-medium' : ''
                            } ${
                              selCategories.includes(node.id)
                                ? 'bg-kb-teal text-white border-kb-teal'
                                : 'bg-white text-kb-muted border-gray-200 hover:border-kb-teal hover:text-kb-teal'
                            }`}
                          >
                            {depth > 0 ? '↳ ' : ''}{node.name}
                          </button>
                          {node.children && node.children.length > 0 && (
                            <div className="mt-1 space-y-1">
                              {renderCategoryTree(node.children, depth + 1)}
                            </div>
                          )}
                        </div>
                      ));
                    })(categoriesData as Array<{ id: string; name: string; children?: typeof categoriesData }>, 0)}
                  </div>
                )}
              </div>

              {/* Tag groups */}
              {tagGroupEntries.map((group) => (
                <div key={group.key}>
                  <h3 className="text-sm font-semibold text-kb-charcoal mb-2">{group.label}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {group.tags.map((t: { id: string; value: string }) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelTags((prev) =>
                          prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]
                        )}
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

              {/* Collections */}
              <div>
                <h3 className="text-sm font-semibold text-kb-charcoal mb-2">Collections</h3>
                {(Array.isArray(collectionsData) ? collectionsData : []).length === 0 ? (
                  <p className="text-sm text-kb-muted">No collections configured.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(Array.isArray(collectionsData) ? collectionsData : []).map((c: { id: string; name: string }) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelCollections((prev) =>
                          prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                        )}
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

              {/* Badges */}
              <div>
                <h3 className="text-sm font-semibold text-kb-charcoal mb-2">Badges</h3>
                {badgesData.length === 0 ? (
                  <p className="text-sm text-kb-muted">No badges configured. <a href="/badges" className="text-kb-teal hover:underline">Create one →</a></p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {badgesData.map((b) => {
                      const active = selBadges.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelBadges((prev) =>
                            prev.includes(b.id) ? prev.filter((x) => x !== b.id) : [...prev, b.id]
                          )}
                          className="px-2.5 py-1 rounded-full text-xs border transition-all"
                          style={active
                            ? { backgroundColor: b.hex_color, color: b.text_color, borderColor: b.hex_color }
                            : { backgroundColor: 'white', color: '#6B7280', borderColor: '#E5E7EB' }
                          }
                        >
                          {b.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* ── Tab 6: SEO ───────────────────────────────────────────── */}
          <div className={activeTab === 5 ? '' : 'hidden'}>
            <div className="card p-6 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-kb-charcoal">Meta Title</label>
                  <CharCount value={metaTitle} max={60} />
                </div>
                <input
                  type="text"
                  {...register('meta_title')}
                  maxLength={60}
                  placeholder={watch('name') ?? 'Product title for search engines'}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-kb-charcoal">Meta Description</label>
                  <CharCount value={metaDesc} max={160} />
                </div>
                <textarea
                  {...register('meta_desc')}
                  rows={3}
                  maxLength={160}
                  placeholder={shortDesc || 'Description for search engine results…'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-kb-charcoal mb-1">URL Slug</label>
                <input type="text" {...register('slug')} placeholder="product-url-slug" />
                <div className="mt-1 text-xs text-kb-muted font-mono bg-gray-50 px-2 py-1.5 rounded border border-gray-100">
                  krishnabyrr.com/product/{currentSlug || '…'}
                </div>
                {!isNew && (
                  <p className="mt-1 text-xs text-kb-amber">
                    ⚠ Changing the slug will break existing links to this product.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Tab 7: Related Products ───────────────────────────────── */}
          <div className={activeTab === 6 ? '' : 'hidden'}>
            <div className="card p-6">
              <div className="text-center py-8 text-kb-muted">
                <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <p className="text-sm font-medium text-kb-charcoal mb-1">Related Products</p>
                <p className="text-xs">
                  Manually curated "You May Also Like" and "Complete The Look" associations
                  will be available in Session 3 (requires a new DB migration for the
                  relationship table).
                </p>
              </div>
            </div>
          </div>

          {/* ── Sticky footer ────────────────────────────────────────────── */}
          <div className="sticky bottom-0 flex items-center justify-between mt-6 px-6 py-3 bg-white rounded-lg border border-gray-100 shadow-sm gap-4">
            <button
              type="button"
              onClick={() => navigate('/products')}
              className="btn-secondary flex-shrink-0"
            >
              ← Back
            </button>

            {/* Status pills */}
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-0.5 bg-gray-50">
              {(['draft', 'active', 'archived'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setValue('status', s, { shouldDirty: true })}
                  className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                    currentStatus === s
                      ? s === 'active'
                        ? 'bg-green-600 text-white shadow-sm'
                        : s === 'archived'
                          ? 'bg-gray-500 text-white shadow-sm'
                          : 'bg-amber-500 text-white shadow-sm'
                      : 'text-kb-muted hover:text-kb-charcoal'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              {isDirty && !saveMutation.isPending && (
                <span className="text-xs text-kb-amber">Unsaved changes</span>
              )}
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="btn-primary"
              >
                {saveMutation.isPending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving…
                  </>
                ) : (
                  isNew ? 'Create Product' : 'Save Changes'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

    </AdminLayout>
  );
}
