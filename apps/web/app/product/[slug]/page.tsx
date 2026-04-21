import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { serverFetch, imageUrl, getStockStatus, formatINR, discountPct, type ProductDetail, type ProductListItem, type PublicSettings } from '@/lib/api';
import Breadcrumb from '@/components/ui/Breadcrumb';
import ProductCard from '@/components/ui/ProductCard';
import ProductGallery from './ProductGallery';
import ProductActions from './ProductActions';
import PincodeChecker from './PincodeChecker';
import RecentlyViewed from './RecentlyViewed';

export const revalidate = 3600;

interface Params { slug: string }

export async function generateStaticParams(): Promise<Params[]> {
  const base = process.env.API_ORIGIN ?? 'http://localhost:3001';
  try {
    const res = await fetch(`${base}/api/products?limit=200&sort=newest`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data ?? []).map((p: { slug: string }) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  try {
    const product = await serverFetch<ProductDetail>(`/api/products/${params.slug}`);
    const primaryImg = product.images?.find(i => i.is_primary) ?? product.images?.[0];
    return {
      title: `${product.name} | ${product.tags?.fabric?.[0]?.value ?? 'Ethnic Wear'}`,
      description: product.short_desc ?? undefined,
      openGraph: primaryImg
        ? { images: [{ url: imageUrl(primaryImg.gcs_path), alt: product.name }] }
        : undefined,
    };
  } catch {
    return { title: 'Product' };
  }
}

export default async function ProductDetailPage({ params }: { params: Params }) {
  // Fetch product and settings in parallel.
  // notFound() is called directly inside the try-catch so Next.js's special
  // NEXT_NOT_FOUND signal is thrown at the top level, not inside a .catch()
  // callback — avoids the unhandledRejection / null.digest crash during ISR.
  let product: ProductDetail;
  const [productResult, settings] = await Promise.all([
    serverFetch<ProductDetail>(`/api/products/${params.slug}`, { revalidate: 3600 })
      .then((p) => ({ ok: true as const, data: p }))
      .catch(() => ({ ok: false as const })),
    serverFetch<PublicSettings>('/api/settings/public', { revalidate: 3600 }).catch(() => ({} as PublicSettings)),
  ]);

  if (!productResult.ok) notFound();
  product = productResult.data;

  const status        = getStockStatus(product.stock_qty);
  const hasSale       = product.sale_price != null && product.sale_price < product.mrp;
  const pct           = hasSale ? discountPct(product.mrp, product.sale_price!) : 0;
  const zoneARate     = parseFloat(settings.zone_a_rate ?? '80');
  const zoneBRate     = parseFloat(settings.zone_b_rate ?? '120');
  const freeThreshold = settings.zone_a_free_above ? parseFloat(settings.zone_a_free_above) : undefined;
  const exchangeDays  = settings.exchange_window_days ?? '7';

  // Tags
  const fabricTags   = product.tags?.fabric   ?? [];
  const weaveTags    = product.tags?.weave    ?? [];
  const occasionTags = product.tags?.occasion ?? [];
  const includesTags = product.tags?.includes ?? [];
  const careTags     = product.care_instr;

  // First category for breadcrumb
  const firstCategory = product.categories?.[0];

  // Primary image for ProductActions
  const primaryImage = product.images?.find(i => i.is_primary) ?? product.images?.[0];

  // Related products: cast to ProductListItem shape (tags as flat array)
  const castRelated = (items: ProductDetail['related_similar']): ProductListItem[] =>
    (items ?? []).map(p => ({
      ...p,
      second_image: null,
      tags: [],
    } as unknown as ProductListItem));

  const relatedSimilar = castRelated(product.related_similar);
  const relatedLook    = castRelated(product.related_look);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Breadcrumb
          items={[
            ...(firstCategory ? [{ label: firstCategory.name, href: `/shop/${firstCategory.slug}` }] : []),
            { label: product.name },
          ]}
        />
      </div>

      {/* Two-column layout */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-12">
        {/* Left — Gallery (sticky on desktop) */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <ProductGallery
            images={product.images ?? []}
            productName={product.name}
            videoUrl={product.video_url}
          />
        </div>

        {/* Right — Product info */}
        <div className="mt-8 lg:mt-0">
          {/* Name */}
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-kb-charcoal leading-tight mb-4">
            {product.name}
          </h1>

          {/* Price */}
          <div className="mb-4">
            {hasSale ? (
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-2xl font-semibold text-kb-gold">{formatINR(product.sale_price!)}</span>
                <span className="text-base text-kb-muted line-through">{formatINR(product.mrp)}</span>
                <span className="text-sm font-semibold px-2 py-0.5 rounded-full bg-kb-gold text-white">
                  SAVE {pct}%
                </span>
              </div>
            ) : (
              <span className="text-2xl font-semibold text-kb-charcoal">{formatINR(product.mrp)}</span>
            )}
            <p className="text-xs text-kb-muted mt-1">
              Inclusive of all taxes (GST {product.gst_rate}%)
            </p>
          </div>

          {/* Feature bullets */}
          <ul className="space-y-1.5 mb-5 text-sm text-kb-charcoal">
            {fabricTags.length > 0 && (
              <li className="flex gap-2">
                <span className="text-kb-muted min-w-[80px]">Fabric</span>
                <span>{fabricTags.map(t => t.value).join(', ')}</span>
              </li>
            )}
            {weaveTags.length > 0 && (
              <li className="flex gap-2">
                <span className="text-kb-muted min-w-[80px]">Weave</span>
                <span>{weaveTags.map(t => t.value).join(', ')}</span>
              </li>
            )}
            {occasionTags.length > 0 && (
              <li className="flex gap-2">
                <span className="text-kb-muted min-w-[80px]">Occasion</span>
                <span>{occasionTags.map(t => t.value).join(', ')}</span>
              </li>
            )}
            {includesTags.length > 0 && (
              <li className="flex gap-2">
                <span className="text-kb-muted min-w-[80px]">Includes</span>
                <span>{includesTags.map((t: { value: string }) => t.value).join(', ')}</span>
              </li>
            )}
            {careTags && (
              <li className="flex gap-2">
                <span className="text-kb-muted min-w-[80px]">Care</span>
                <span>{careTags.split('\n')[0]}</span>
              </li>
            )}
          </ul>

          {/* Stock status */}
          <div className="flex items-center gap-2 mb-5">
            {status === 'in_stock' && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-kb-success">
                <span className="w-2 h-2 rounded-full bg-kb-success" />
                In Stock
              </span>
            )}
            {status === 'low_stock' && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-kb-amber">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Only {product.stock_qty} left!
              </span>
            )}
            {status === 'out_of_stock' && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-kb-error">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Sold Out
              </span>
            )}
          </div>

          {/* Cart + Wishlist buttons (client) */}
          <ProductActions
            product={{
              id: product.id,
              name: product.name,
              slug: product.slug,
              stock_qty: product.stock_qty,
              mrp: product.mrp,
              sale_price: product.sale_price,
              primary_image: primaryImage ?? null,
            }}
            whatsappNumber={settings.whatsapp_number}
          />

          {/* Pincode checker */}
          <div className="mt-5">
            <PincodeChecker
              zoneARate={zoneARate}
              zoneBRate={zoneBRate}
              freeShippingThreshold={freeThreshold}
              productPrice={product.sale_price ?? product.mrp}
            />
          </div>

          {/* Accordion sections */}
          <div className="mt-6 space-y-0 divide-y divide-gray-100 border-t border-gray-100">
            {/* Description */}
            {product.description && (
              <details className="group">
                <summary className="flex items-center justify-between py-4 text-sm font-semibold text-kb-charcoal cursor-pointer">
                  Product Description
                  <svg
                    className="w-4 h-4 text-kb-muted transition-transform group-open:rotate-180"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div
                  className="pb-4 text-sm text-kb-muted leading-relaxed prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: product.description }}
                />
              </details>
            )}

            {/* Care instructions */}
            {product.care_instr && (
              <details className="group">
                <summary className="flex items-center justify-between py-4 text-sm font-semibold text-kb-charcoal cursor-pointer">
                  Fabric &amp; Care Instructions
                  <svg
                    className="w-4 h-4 text-kb-muted transition-transform group-open:rotate-180"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="pb-4 text-sm text-kb-muted leading-relaxed whitespace-pre-line">
                  {product.care_instr}
                </div>
              </details>
            )}

            {/* Shipping & Exchange */}
            <details className="group" open>
              <summary className="flex items-center justify-between py-4 text-sm font-semibold text-kb-charcoal cursor-pointer">
                Shipping &amp; Exchange
                <svg
                  className="w-4 h-4 text-kb-muted transition-transform group-open:rotate-180"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="pb-4 text-sm text-kb-muted leading-relaxed">
                <p>
                  We ship across India. Zone A (Delhi NCR): {formatINR(zoneARate)} · Zone B (Rest of India): {formatINR(zoneBRate)}.
                  {freeThreshold && ` Free shipping on orders above ${formatINR(freeThreshold)}.`}
                </p>
                <p className="mt-2">
                  Exchange within {exchangeDays} days of delivery. Please read our full{' '}
                  <a href="/exchange-policy" className="text-kb-teal underline">Exchange Policy</a>.
                </p>
              </div>
            </details>
          </div>
        </div>
      </div>

      {/* ── Below-the-fold sections ───────────────────────────────────────── */}

      {/* You May Also Like */}
      {relatedSimilar.length > 0 && (
        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold text-kb-charcoal mb-6">You May Also Like</h2>
          <div className="flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">
            {relatedSimilar.map(p => (
              <div key={p.id} className="min-w-[180px] lg:min-w-0 flex-shrink-0 lg:flex-shrink">
                <ProductCard product={p} showQuickView={false} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Complete The Look */}
      {relatedLook.length > 0 && (
        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold text-kb-charcoal mb-6">Complete The Look</h2>
          <div className="flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:overflow-visible">
            {relatedLook.map(p => (
              <div key={p.id} className="min-w-[180px] lg:min-w-0 flex-shrink-0 lg:flex-shrink">
                <ProductCard product={p} showQuickView={false} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recently Viewed (client) */}
      <RecentlyViewed currentProductId={product.id} />
    </div>
  );
}
