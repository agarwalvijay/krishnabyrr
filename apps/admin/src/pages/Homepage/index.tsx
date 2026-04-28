import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/Layout/AdminLayout';
import { api, imageUrl } from '../../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type BlockType = 'banner' | 'product_section';
type CtaType = 'shop_all' | 'category' | 'collection' | 'sale' | 'custom';

type BannerHeight = 'sm' | 'md' | 'lg' | 'xl';

const HEIGHT_OPTIONS: Array<{ value: BannerHeight; label: string; hint: string }> = [
  { value: 'sm', label: 'Small',  hint: '180px — compact strip' },
  { value: 'md', label: 'Medium', hint: '360px — standard' },
  { value: 'lg', label: 'Large',  hint: '500px — hero' },
  { value: 'xl', label: 'XL',     hint: '650px — full hero' },
];

interface BannerPayload {
  heading: string;
  subheading?: string;
  cta_label?: string;
  cta_href?: string;
  image_desktop?: string;
  image_mobile?: string;
  bg_color?: string;
  height?: BannerHeight;
}

interface ProductSectionPayload {
  heading: string;
  source_type?: 'collection' | 'tag_filter' | 'latest';
  source_id?: string;
  collection_slug?: string;   // kept for backward compat / web app
  tag_group?: string;
  tag_value?: string;
  editorial_text?: string;
  limit?: number;
  view_all_url?: string;
  show_view_all?: boolean;
  layout?: 'grid' | 'asymmetric';
}

interface CollectionItem {
  id: string;
  name: string;
  slug: string;
  product_count: number;
}

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  parent_id?: string | null;
}

interface TagItem {
  id: string;
  value: string;
  group_name: string;
}

interface TagGroupData {
  label: string;
  is_filter: boolean;
  tags: TagItem[];
}

interface HomepageBlock {
  id: string;
  type: BlockType;
  display_order: number;
  is_active: boolean;
  payload: BannerPayload | ProductSectionPayload;
  source_collection?: CollectionItem | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLOR_PRESETS = [
  { label: 'Peacock Teal',  hex: '#1A6B6B' },
  { label: 'Peacock Blue',  hex: '#1E3F8B' },
  { label: 'Deep Navy',     hex: '#12192E' },
  { label: 'Ivory Cream',   hex: '#FAF6EF' },
  { label: 'Charcoal',      hex: '#1C1C1C' },
] as const;

const CTA_OPTIONS: { value: CtaType; label: string }[] = [
  { value: 'shop_all',   label: 'Shop All' },
  { value: 'category',   label: 'Category' },
  { value: 'collection', label: 'Collection' },
  { value: 'sale',       label: 'Sale' },
  { value: 'custom',     label: 'Custom' },
];

const inputCls = 'w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-kb-teal/30 focus:border-kb-teal outline-none';

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectCtaType(href?: string): CtaType {
  if (!href) return 'shop_all';
  if (href === '/shop' || href === '/shop/') return 'shop_all';
  if (href.includes('on_sale') || href.includes('sale')) return 'sale';
  if (href.startsWith('/shop/')) return 'category';
  if (href.startsWith('/collections/') || href.startsWith('/shop?collection=')) return 'collection';
  if (!href || href === '/shop') return 'shop_all';
  return 'custom';
}

// ── FIX 1: Image Dropzone ─────────────────────────────────────────────────────

interface ImageDropzoneProps {
  label: string;
  currentPath?: string;
  blockId: string | null;
  field: 'image_desktop' | 'image_mobile';
  onFileReady: (file: File) => void;
  onUploaded?: (path: string) => void;
  onRemoved?: () => void;
}

function ImageDropzone({ label, currentPath, blockId, field, onFileReady, onUploaded, onRemoved }: ImageDropzoneProps) {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<string | null>(() =>
    currentPath ? imageUrl(currentPath) : null
  );
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const originalPreview = currentPath ? imageUrl(currentPath) : null;

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      setPreview(URL.createObjectURL(file));
      if (blockId) {
        // Existing block: upload immediately
        setUploading(true);
        try {
          const fd = new FormData();
          fd.append('image', file);
          const res = await api.post<{ path: string }>(
            `/admin/homepage/blocks/${blockId}/image?field=${field}`,
            fd
          );
          toast.success('Image uploaded');
          queryClient.invalidateQueries({ queryKey: ['admin-homepage-blocks'] });
          onUploaded?.(res.data.path);
        } catch {
          toast.error('Image upload failed');
          setPreview(originalPreview);
        } finally {
          setUploading(false);
        }
      } else {
        // New block: stage the file for two-phase upload after save
        onFileReady(file);
      }
    },
    [blockId, field, originalPreview, queryClient, onFileReady]
  );

  const handleRemove = useCallback(async () => {
    if (!blockId) {
      setPreview(null);
      onRemoved?.();
      return;
    }
    setRemoving(true);
    try {
      await api.delete(`/admin/homepage/blocks/${blockId}/image?field=${field}`);
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ['admin-homepage-blocks'] });
      onRemoved?.();
      toast.success('Image removed');
    } catch {
      toast.error('Failed to remove image');
    } finally {
      setRemoving(false);
    }
  }, [blockId, field, queryClient, onRemoved]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxSize: 5 * 1024 * 1024,
    multiple: false,
    disabled: uploading,
  });

  return (
    <div>
      <label className="block text-xs text-kb-muted mb-1">{label}</label>
      {preview ? (
        <div className="space-y-1">
          <div className="relative group">
            <img
              src={preview}
              alt=""
              className="w-full h-28 object-cover rounded-md border border-gray-200"
            />
            <div
              {...getRootProps()}
              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-md cursor-pointer"
            >
              <input {...getInputProps()} />
              {uploading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="text-white text-xs font-medium">Replace image</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
          >
            {removing ? 'Removing…' : 'Remove image'}
          </button>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={[
            'border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors',
            isDragActive ? 'border-kb-teal bg-teal-50' : 'border-gray-200 hover:border-gray-300',
            uploading ? 'opacity-50 cursor-not-allowed' : '',
          ].join(' ')}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <p className="text-xs text-kb-muted">Uploading…</p>
          ) : (
            <>
              <p className="text-xs text-kb-muted">
                {isDragActive ? 'Drop here' : 'Drop image or click to upload'}
              </p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP · max 5MB</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── FIX 2 + 3: Banner Form ────────────────────────────────────────────────────

interface BannerFormValues {
  heading: string;
  subheading: string;
  cta_label: string;
}

function BannerForm({
  defaultValues,
  blockId,
  onSave,
  isSaving,
  collections,
  categories,
}: {
  defaultValues: Partial<BannerPayload>;
  blockId: string | null;
  onSave: (payload: BannerPayload, pendingDesktop?: File) => void;
  isSaving: boolean;
  collections: CollectionItem[];
  categories: CategoryItem[];
}) {
  const { register, handleSubmit } = useForm<BannerFormValues>({
    defaultValues: {
      heading:    defaultValues.heading    ?? '',
      subheading: defaultValues.subheading ?? '',
      cta_label:  defaultValues.cta_label  ?? '',
    },
  });

  // FIX 2: CTA state
  const existingCtaType = detectCtaType(defaultValues.cta_href);
  const [ctaType, setCtaType]             = useState<CtaType>(existingCtaType);
  const [ctaCategory, setCtaCategory]     = useState<string>(
    existingCtaType === 'category'   ? (defaultValues.cta_href?.replace('/shop/', '') ?? '')   : ''
  );
  const [ctaCollection, setCtaCollection] = useState<string>(
    existingCtaType === 'collection'
      ? (defaultValues.cta_href?.replace('/shop?collection=', '').replace('/collections/', '') ?? '')
      : ''
  );
  const [ctaCustom, setCtaCustom]         = useState<string>(
    existingCtaType === 'custom' ? (defaultValues.cta_href ?? '') : ''
  );

  // Height state
  const [height, setHeight] = useState<BannerHeight>(defaultValues.height ?? 'lg');

  // FIX 3: Color state
  const isPreset = COLOR_PRESETS.some(p => p.hex === defaultValues.bg_color);
  const [bgColor, setBgColor]             = useState<string>(defaultValues.bg_color ?? COLOR_PRESETS[0].hex);
  const [showCustomColor, setShowCustomColor] = useState(!isPreset && !!defaultValues.bg_color);

  // FIX 1: Pending image state (new block only) + current paths (existing block)
  const [pendingDesktop, setPendingDesktop] = useState<File | undefined>(undefined);
  const [desktopPath, setDesktopPath]       = useState<string | undefined>(defaultValues.image_desktop);
  const [mobilePath,  setMobilePath]        = useState<string | undefined>(defaultValues.image_mobile);
  const [showMobile, setShowMobile]         = useState(!!defaultValues.image_mobile);

  const handleDesktopReady   = useCallback((file: File) => setPendingDesktop(file), []);
  const handleMobileReady    = useCallback((_file: File) => { /* mobile pending not yet supported for new blocks */ }, []);
  const handleDesktopUploaded = useCallback((path: string) => setDesktopPath(path), []);
  const handleMobileUploaded  = useCallback((path: string) => setMobilePath(path), []);

  const buildCtaHref = (): string => {
    if (ctaType === 'shop_all')   return '/shop';
    if (ctaType === 'sale')       return '/shop?on_sale=true';
    if (ctaType === 'category')   return ctaCategory   ? `/shop/${ctaCategory}` : '/shop';
    if (ctaType === 'collection') return ctaCollection ? `/shop?collection=${ctaCollection}` : '/shop';
    return ctaCustom;
  };

  const onSubmit = (values: BannerFormValues) => {
    const payload: BannerPayload = {
      heading:        values.heading,
      subheading:     values.subheading || undefined,
      cta_label:      values.cta_label  || undefined,
      cta_href:       buildCtaHref()    || undefined,
      bg_color:       bgColor           || undefined,
      image_desktop:  desktopPath,
      image_mobile:   mobilePath,
      height,
    };
    onSave(payload, pendingDesktop);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Heading */}
      <div>
        <label className="block text-xs text-kb-muted mb-1">Heading *</label>
        <input {...register('heading', { required: true })} className={inputCls} placeholder="Headline text" />
      </div>

      {/* Subheading */}
      <div>
        <label className="block text-xs text-kb-muted mb-1">Subheading</label>
        <input {...register('subheading')} className={inputCls} placeholder="Supporting text" />
      </div>

      {/* CTA Label */}
      <div>
        <label className="block text-xs text-kb-muted mb-1">CTA Label</label>
        <input {...register('cta_label')} className={inputCls} placeholder="Shop Now" />
      </div>

      {/* FIX 2: CTA Link Picker */}
      <div>
        <label className="block text-xs text-kb-muted mb-2">CTA Link</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {CTA_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setCtaType(opt.value)}
              className={[
                'px-2.5 py-1 text-xs rounded-md border transition-colors',
                ctaType === opt.value
                  ? 'border-kb-teal bg-teal-50 text-kb-teal font-medium'
                  : 'border-gray-200 text-kb-muted hover:border-gray-300',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {(ctaType === 'shop_all' || ctaType === 'sale') && (
          <p className="text-xs text-kb-muted bg-gray-50 px-2 py-1.5 rounded-md">
            {ctaType === 'shop_all' ? '/shop' : '/shop?on_sale=true'}
          </p>
        )}
        {ctaType === 'category' && (
          <select
            value={ctaCategory}
            onChange={(e) => setCtaCategory(e.target.value)}
            className={inputCls}
          >
            <option value="">Select category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>{c.name}</option>
            ))}
          </select>
        )}
        {ctaType === 'collection' && (
          <select
            value={ctaCollection}
            onChange={(e) => setCtaCollection(e.target.value)}
            className={inputCls}
          >
            <option value="">Select collection…</option>
            {collections.map((c) => (
              <option key={c.id} value={c.slug}>{c.name}</option>
            ))}
          </select>
        )}
        {ctaType === 'custom' && (
          <input
            value={ctaCustom}
            onChange={(e) => setCtaCustom(e.target.value)}
            className={inputCls}
            placeholder="https://… or /path"
          />
        )}
      </div>

      {/* FIX 1: Desktop image dropzone */}
      <ImageDropzone
        label="Desktop Image"
        currentPath={defaultValues.image_desktop}
        blockId={blockId}
        field="image_desktop"
        onFileReady={handleDesktopReady}
        onUploaded={handleDesktopUploaded}
      />

      {/* Mobile image (collapsed by default) */}
      <div>
        <button
          type="button"
          onClick={() => setShowMobile((v) => !v)}
          className="text-xs text-kb-teal hover:underline"
        >
          {showMobile ? '− Hide mobile image' : '+ Add mobile image (optional)'}
        </button>
        {showMobile && (
          <div className="mt-2">
            <ImageDropzone
              label="Mobile Image"
              currentPath={defaultValues.image_mobile}
              blockId={blockId}
              field="image_mobile"
              onFileReady={handleMobileReady}
              onUploaded={handleMobileUploaded}
            />
          </div>
        )}
      </div>

      {/* Banner height */}
      <div>
        <label className="block text-xs text-kb-muted mb-2">Banner Height</label>
        <div className="flex gap-2">
          {HEIGHT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              title={opt.hint}
              onClick={() => setHeight(opt.value)}
              className={[
                'flex-1 py-1.5 text-xs rounded-md border transition-colors',
                height === opt.value
                  ? 'border-kb-teal bg-teal-50 text-kb-teal font-semibold'
                  : 'border-gray-200 text-kb-muted hover:border-gray-300',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* FIX 3: Background color swatches */}
      <div>
        <label className="block text-xs text-kb-muted mb-2">Background Color</label>
        <div className="flex items-center gap-2 flex-wrap">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset.hex}
              type="button"
              title={preset.label}
              onClick={() => { setBgColor(preset.hex); setShowCustomColor(false); }}
              className={[
                'w-7 h-7 rounded-full border-2 transition-transform',
                bgColor === preset.hex && !showCustomColor
                  ? 'border-kb-gold scale-110'
                  : 'border-transparent hover:scale-105',
              ].join(' ')}
              style={{ backgroundColor: preset.hex }}
            />
          ))}
          <button
            type="button"
            onClick={() => setShowCustomColor((v) => !v)}
            className={[
              'text-xs px-2 py-1 rounded-md border transition-colors',
              showCustomColor
                ? 'border-kb-gold text-amber-700 bg-amber-50'
                : 'border-gray-200 text-kb-muted hover:border-gray-300',
            ].join(' ')}
          >
            Custom…
          </button>
        </div>
        {showCustomColor && (
          <input
            type="text"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            className={`${inputCls} mt-2`}
            placeholder="#f5f0e8"
          />
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="w-5 h-5 rounded border border-gray-200" style={{ backgroundColor: bgColor }} />
          <span className="text-xs text-kb-muted">{bgColor}</span>
        </div>
      </div>

      <button
        type="submit"
        disabled={isSaving}
        className="w-full px-4 py-2.5 bg-kb-teal text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
      >
        {isSaving ? 'Saving…' : 'Save Block'}
      </button>
    </form>
  );
}

// ── FIX 4: Product Section Form ───────────────────────────────────────────────

interface ProductSectionFormValues {
  heading: string;
  editorial_text: string;
  view_all_url: string;
}

function ProductSectionForm({
  defaultValues,
  onSave,
  isSaving,
  collections,
  tagsData,
}: {
  defaultValues: Partial<ProductSectionPayload>;
  onSave: (payload: ProductSectionPayload) => void;
  isSaving: boolean;
  collections: CollectionItem[];
  tagsData: Record<string, TagGroupData>;
}) {
  const { register, handleSubmit, setValue } = useForm<ProductSectionFormValues>({
    defaultValues: {
      heading:        defaultValues.heading        ?? '',
      editorial_text: defaultValues.editorial_text ?? '',
      view_all_url:   defaultValues.view_all_url   ?? '',
    },
  });

  const [sourceType, setSourceType] = useState<'collection' | 'tag_filter' | 'latest'>(
    defaultValues.source_type ?? 'collection'
  );
  const [sourceId, setSourceId]   = useState<string>(defaultValues.source_id ?? '');
  const [tagGroup, setTagGroup]   = useState<string>(defaultValues.tag_group ?? '');
  const [tagValue, setTagValue]   = useState<string>(defaultValues.tag_value ?? '');
  const [limit, setLimit]         = useState<number>(defaultValues.limit ?? 8);
  const [showViewAll, setShowViewAll] = useState<boolean>(defaultValues.show_view_all ?? true);
  const [layout, setLayout]       = useState<'grid' | 'asymmetric'>(defaultValues.layout ?? 'grid');

  // Auto-populate view_all_url when source selection changes
  useEffect(() => {
    if (sourceType === 'latest') {
      setValue('view_all_url', '/shop?sort=newest');
    } else if (sourceType === 'collection' && sourceId) {
      const col = collections.find((c) => c.id === sourceId);
      if (col) setValue('view_all_url', `/shop?collection=${col.slug}`);
    } else if (sourceType === 'tag_filter' && tagGroup && tagValue) {
      setValue('view_all_url', `/shop?${tagGroup}=${encodeURIComponent(tagValue)}`);
    }
  }, [sourceType, sourceId, tagGroup, tagValue, collections, setValue]);

  const handleLayoutChange = (next: 'grid' | 'asymmetric') => {
    setLayout(next);
    if (next === 'asymmetric') setLimit(5);
  };

  const filterGroups = Object.entries(tagsData).filter(([, g]) => g.is_filter);
  const selectedGroupTags = tagGroup ? (tagsData[tagGroup]?.tags ?? []) : [];

  const onSubmit = (values: ProductSectionFormValues) => {
    const selectedCollection = sourceType === 'collection'
      ? collections.find((c) => c.id === sourceId)
      : undefined;

    const payload: ProductSectionPayload = {
      heading:         values.heading,
      source_type:     sourceType,
      source_id:       sourceType === 'collection' ? sourceId : undefined,
      collection_slug: selectedCollection?.slug,
      tag_group:       sourceType === 'tag_filter' ? tagGroup : undefined,
      tag_value:       sourceType === 'tag_filter' ? tagValue : undefined,
      editorial_text:  values.editorial_text || undefined,
      limit,
      view_all_url:    showViewAll ? (values.view_all_url || undefined) : undefined,
      show_view_all:   showViewAll,
      layout,
    };
    onSave(payload);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Heading */}
      <div>
        <label className="block text-xs text-kb-muted mb-1">Section Heading *</label>
        <input
          {...register('heading', { required: true })}
          className={inputCls}
          placeholder="Featured Silks"
        />
      </div>

      {/* Source type toggle */}
      <div>
        <label className="block text-xs text-kb-muted mb-2">Products Source</label>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: 'collection',  label: 'Collection',       desc: 'Curated list'    },
            { value: 'tag_filter',  label: 'Tag Filter',       desc: 'Dynamic filter'  },
            { value: 'latest',      label: 'Latest Arrivals',  desc: 'Newest products' },
          ] as const).map((st) => (
            <button
              key={st.value}
              type="button"
              onClick={() => setSourceType(st.value)}
              className={[
                'py-3 px-3 rounded-lg border text-left transition-colors',
                sourceType === st.value
                  ? 'border-kb-teal bg-teal-50 text-kb-teal'
                  : 'border-gray-200 text-kb-muted hover:border-gray-300',
              ].join(' ')}
            >
              <div className="text-sm font-medium">{st.label}</div>
              <div className="text-xs mt-0.5 opacity-70">{st.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Collection dropdown */}
      {sourceType === 'collection' && (
        <div>
          <label className="block text-xs text-kb-muted mb-1">Collection *</label>
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className={inputCls}
          >
            <option value="">Select collection…</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.product_count} products)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tag filter cascading selects */}
      {sourceType === 'tag_filter' && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-kb-muted mb-1">Tag Group *</label>
            <select
              value={tagGroup}
              onChange={(e) => { setTagGroup(e.target.value); setTagValue(''); }}
              className={inputCls}
            >
              <option value="">Select group…</option>
              {filterGroups.map(([name, g]) => (
                <option key={name} value={name}>{g.label}</option>
              ))}
            </select>
          </div>
          {tagGroup && (
            <div>
              <label className="block text-xs text-kb-muted mb-1">Tag Value *</label>
              <select
                value={tagValue}
                onChange={(e) => setTagValue(e.target.value)}
                className={inputCls}
              >
                <option value="">Select value…</option>
                {selectedGroupTags.map((t) => (
                  <option key={t.id} value={t.value}>{t.value}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Editorial text */}
      <div>
        <label className="block text-xs text-kb-muted mb-1">Editorial Text (optional)</label>
        <textarea
          {...register('editorial_text')}
          rows={2}
          className={inputCls}
          placeholder="A short description shown above the products…"
        />
      </div>

      {/* Layout picker */}
      <div>
        <label className="block text-xs text-kb-muted mb-2">Layout</label>
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: 'grid',       label: 'Grid',       desc: '2–4 col product grid' },
            { value: 'asymmetric', label: 'Asymmetric', desc: 'Hero + sidebar + 3 items' },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleLayoutChange(opt.value)}
              className={[
                'py-3 px-3 rounded-lg border text-left transition-colors',
                layout === opt.value
                  ? 'border-kb-teal bg-teal-50 text-kb-teal'
                  : 'border-gray-200 text-kb-muted hover:border-gray-300',
              ].join(' ')}
            >
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-xs mt-0.5 opacity-70">{opt.desc}</div>
            </button>
          ))}
        </div>
        {layout === 'asymmetric' && (
          <p className="text-xs text-kb-muted mt-1.5">Asymmetric layout always shows 5 products.</p>
        )}
      </div>

      {/* Max products — hidden for asymmetric (fixed at 5) */}
      {layout === 'grid' && (
      <div>
        <label className="block text-xs text-kb-muted mb-2">Max Products</label>
        <div className="flex gap-4">
          {[4, 8].map((n) => (
            <label key={n} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                checked={limit === n}
                onChange={() => setLimit(n)}
                className="accent-kb-teal"
              />
              <span className="text-sm text-kb-charcoal">{n}</span>
            </label>
          ))}
        </div>
      </div>
      )}

      {/* View All URL */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-kb-muted">View All URL</label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showViewAll}
              onChange={(e) => setShowViewAll(e.target.checked)}
              className="accent-kb-teal"
            />
            <span className="text-xs text-kb-muted">Show link</span>
          </label>
        </div>
        {showViewAll && (
          <input
            {...register('view_all_url')}
            className={inputCls}
            placeholder="/shop?fabric=Silk"
          />
        )}
      </div>

      <button
        type="submit"
        disabled={isSaving}
        className="w-full px-4 py-2.5 bg-kb-teal text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
      >
        {isSaving ? 'Saving…' : 'Save Block'}
      </button>
    </form>
  );
}

// ── FIX 7: Slide-Over with parallel data loading ──────────────────────────────

function BlockSlideOver({
  block,
  onClose,
}: {
  block: HomepageBlock | { type: BlockType; display_order: number } | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isNew = !block || !('id' in block);
  const existingBlock = isNew ? null : (block as HomepageBlock);
  const [blockType, setBlockType] = useState<BlockType>(block?.type ?? 'banner');
  const [isSaving, setIsSaving] = useState(false);

  // FIX 7: Pre-load all dropdown data in parallel, staleTime 5 min
  const { data: collectionsData, isLoading: loadingCols } = useQuery({
    queryKey: ['admin-collections'],
    queryFn: () =>
      api.get<{ data: CollectionItem[] }>('/admin/collections').then((r) => r.data.data),
    staleTime: 5 * 60 * 1000,
  });
  const { data: tagsData, isLoading: loadingTags } = useQuery({
    queryKey: ['tags-grouped'],
    queryFn: () =>
      api.get<{ data: Record<string, TagGroupData> }>('/tags').then((r) => r.data.data),
    staleTime: 5 * 60 * 1000,
  });
  const { data: categoriesData, isLoading: loadingCats } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () =>
      api.get<{ data: CategoryItem[] }>('/admin/categories').then((r) => r.data.data),
    staleTime: 5 * 60 * 1000,
  });

  const isLoadingFormData = loadingCols || loadingTags || loadingCats;
  const collections = collectionsData ?? [];
  const tags        = tagsData        ?? {};
  const categories  = categoriesData  ?? [];

  // Banner save: two-phase if new block + pending image file
  const handleBannerSave = async (payload: BannerPayload, pendingDesktop?: File) => {
    setIsSaving(true);
    try {
      const body = {
        type: 'banner',
        display_order: block?.display_order ?? 99,
        is_active: true,
        payload,
      };
      const res = isNew
        ? await api.post<{ data: HomepageBlock }>('/admin/homepage/blocks', body)
        : await api.put<{ data: HomepageBlock }>(`/admin/homepage/blocks/${existingBlock!.id}`, body);

      const savedId = res.data.data.id;
      if (pendingDesktop) {
        const fd = new FormData();
        fd.append('image', pendingDesktop);
        await api.post(
          `/admin/homepage/blocks/${savedId}/image?field=image_desktop`,
          fd,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
      }

      toast.success(isNew ? 'Block created' : 'Block updated');
      queryClient.invalidateQueries({ queryKey: ['admin-homepage-blocks'] });
      onClose();
    } catch {
      toast.error('Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleProductSectionSave = async (payload: ProductSectionPayload) => {
    setIsSaving(true);
    try {
      const body = {
        type: 'product_section',
        display_order: block?.display_order ?? 99,
        is_active: true,
        payload,
      };
      if (isNew) {
        await api.post('/admin/homepage/blocks', body);
      } else {
        await api.put(`/admin/homepage/blocks/${existingBlock!.id}`, body);
      }
      toast.success(isNew ? 'Block created' : 'Block updated');
      queryClient.invalidateQueries({ queryKey: ['admin-homepage-blocks'] });
      onClose();
    } catch {
      toast.error('Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const existingPayload = existingBlock?.payload ?? {};

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-50 w-full max-w-md bg-white shadow-xl flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-kb-charcoal text-base">
            {isNew ? 'Add Block' : 'Edit Block'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-50 text-kb-muted"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 px-5 py-5 space-y-5">
          {/* Block type selector — new blocks only */}
          {isNew && (
            <div>
              <label className="block text-sm font-semibold text-kb-charcoal mb-2">Block Type</label>
              <div className="flex gap-2">
                {(['banner', 'product_section'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setBlockType(t)}
                    className={[
                      'flex-1 py-2 text-sm rounded-md border transition-colors',
                      blockType === t
                        ? 'border-kb-teal bg-teal-50 text-kb-teal font-medium'
                        : 'border-gray-200 text-kb-muted hover:border-gray-300',
                    ].join(' ')}
                  >
                    {t === 'banner' ? 'Banner' : 'Product Section'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Single spinner while all form data loads */}
          {isLoadingFormData ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-4 border-kb-teal border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-kb-muted">Loading form data…</p>
            </div>
          ) : blockType === 'banner' ? (
            <BannerForm
              defaultValues={existingPayload as Partial<BannerPayload>}
              blockId={existingBlock?.id ?? null}
              onSave={handleBannerSave}
              isSaving={isSaving}
              collections={collections}
              categories={categories}
            />
          ) : (
            <ProductSectionForm
              defaultValues={existingPayload as Partial<ProductSectionPayload>}
              onSave={handleProductSectionSave}
              isSaving={isSaving}
              collections={collections}
              tagsData={tags}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── FIX 5: Richer Block Cards ─────────────────────────────────────────────────

function BlockCard({
  block,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  block: HomepageBlock;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  const bp = block.payload as BannerPayload;
  const pp = block.payload as ProductSectionPayload;

  const thumbnailUrl = block.type === 'banner' && bp.image_desktop
    ? imageUrl(bp.image_desktop)
    : null;

  const sourceLabel = block.type === 'product_section'
    ? block.source_collection
      ? block.source_collection.name
      : pp.tag_group && pp.tag_value
        ? `${pp.tag_group}: ${pp.tag_value}`
        : pp.collection_slug ?? '—'
    : null;

  return (
    <div className={[
      'flex items-center gap-3 bg-white border rounded-xl p-3 transition-opacity',
      block.is_active ? 'border-gray-100' : 'border-gray-100 opacity-60',
    ].join(' ')}>
      {/* Preview thumbnail / icon */}
      {block.type === 'banner' ? (
        thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            className="flex-shrink-0 w-20 h-12 object-cover rounded-md border border-gray-100"
          />
        ) : (
          <div
            className="flex-shrink-0 w-20 h-12 rounded-md border border-gray-100 flex items-center justify-center"
            style={{ backgroundColor: bp.bg_color ?? '#FAF6EF' }}
          >
            <span className="text-xs font-semibold text-white/80 drop-shadow">A</span>
          </div>
        )
      ) : (
        <div className="flex-shrink-0 w-20 h-12 rounded-md bg-teal-50 border border-teal-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-kb-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zm0 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
            />
          </svg>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-kb-charcoal truncate">
          {(block.payload as BannerPayload).heading}
        </p>
        {block.type === 'product_section' && (
          <p className="text-xs text-kb-muted mt-0.5 truncate">
            {sourceLabel} · {pp.limit ?? 8} items
            {pp.show_view_all && pp.view_all_url ? ` · ${pp.view_all_url}` : ''}
          </p>
        )}
        {block.type === 'banner' && bp.cta_href && (
          <p className="text-xs text-kb-muted mt-0.5 truncate">→ {bp.cta_href}</p>
        )}
      </div>

      {/* Display order */}
      <span className="flex-shrink-0 text-xs text-kb-muted w-5 text-center">{block.display_order}</span>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-2">
        <button
          onClick={onToggleActive}
          title={block.is_active ? 'Deactivate' : 'Activate'}
          className={`text-xs px-2 py-1 rounded-md border transition-colors ${
            block.is_active
              ? 'border-gray-200 text-kb-muted hover:text-kb-error hover:border-kb-error/30'
              : 'border-green-200 text-green-700 hover:bg-green-50'
          }`}
        >
          {block.is_active ? 'Hide' : 'Show'}
        </button>
        <button onClick={onEdit}   className="text-xs text-kb-teal hover:underline">Edit</button>
        <button onClick={onDelete} className="text-xs text-kb-error hover:underline">Del</button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HomepagePage() {
  const queryClient = useQueryClient();
  const [slideBlock, setSlideBlock] = useState<HomepageBlock | null | 'new'>(null);

  const { data, isLoading } = useQuery<{ data: HomepageBlock[] }>({
    queryKey: ['admin-homepage-blocks'],
    queryFn: () => api.get('/admin/homepage/blocks').then((r) => r.data),
  });

  const blocks = data?.data ?? [];

  const deleteMutation = {
    mutate: async (id: string) => {
      try {
        await api.delete(`/admin/homepage/blocks/${id}`);
        toast.success('Block deleted');
        queryClient.invalidateQueries({ queryKey: ['admin-homepage-blocks'] });
      } catch {
        toast.error('Delete failed');
      }
    },
  };

  const toggleActive = async (id: string, is_active: boolean) => {
    try {
      await api.put(`/admin/homepage/blocks/${id}`, { is_active });
      queryClient.invalidateQueries({ queryKey: ['admin-homepage-blocks'] });
    } catch {
      toast.error('Update failed');
    }
  };

  const reorder = async (reordered: HomepageBlock[]) => {
    try {
      await api.put('/admin/homepage/blocks/reorder', {
        blocks: reordered.map((b, i) => ({ id: b.id, display_order: i + 1 })),
      });
      queryClient.invalidateQueries({ queryKey: ['admin-homepage-blocks'] });
    } catch {
      toast.error('Reorder failed');
    }
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const newBlocks = [...blocks];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= newBlocks.length) return;
    [newBlocks[index], newBlocks[target]] = [newBlocks[target], newBlocks[index]];
    reorder(newBlocks);
  };

  return (
    <AdminLayout
      title="Homepage Builder"
      action={
        <button
          onClick={() => setSlideBlock('new')}
          className="flex items-center gap-2 px-4 py-2 bg-kb-teal text-white text-sm font-medium rounded-lg hover:opacity-90"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Block
        </button>
      }
    >
      <p className="text-sm text-kb-muted mb-5">
        Blocks are displayed in order on the homepage. Use ↑↓ to reorder.
        Changes are cached for 5 minutes on the storefront.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-kb-teal border-t-transparent rounded-full animate-spin" />
        </div>
      ) : blocks.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-xl">
          <p className="text-kb-muted text-sm mb-3">No blocks yet.</p>
          <button
            onClick={() => setSlideBlock('new')}
            className="text-sm text-kb-teal hover:underline"
          >
            Add your first block →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {blocks.map((block, index) => (
            <div key={block.id} className="flex items-center gap-2">
              {/* Up / down controls */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveBlock(index, 'up')}
                  disabled={index === 0}
                  className="p-1 rounded hover:bg-gray-100 text-kb-muted disabled:opacity-30"
                  title="Move up"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => moveBlock(index, 'down')}
                  disabled={index === blocks.length - 1}
                  className="p-1 rounded hover:bg-gray-100 text-kb-muted disabled:opacity-30"
                  title="Move down"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              <div className="flex-1">
                <BlockCard
                  block={block}
                  onEdit={() => setSlideBlock(block)}
                  onDelete={() => {
                    if (confirm('Delete this block?')) deleteMutation.mutate(block.id);
                  }}
                  onToggleActive={() => toggleActive(block.id, !block.is_active)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Slide-over */}
      {slideBlock !== null && (
        <BlockSlideOver
          block={slideBlock === 'new' ? null : (slideBlock as HomepageBlock)}
          onClose={() => setSlideBlock(null)}
        />
      )}
    </AdminLayout>
  );
}
