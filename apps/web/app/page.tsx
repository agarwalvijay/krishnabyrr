import { serverFetchList, serverFetch, type ProductListItem } from '@/lib/api';
import HomepageBanner, { type BannerPayload } from './components/HomepageBanner';
import HomepageProductSection, { type ProductSectionPayload } from './components/HomepageProductSection';

// Cache homepage for 5 minutes (matches Redis TTL on API side)
// ISR: render once, cache for 5 minutes. Redis caches the underlying API
// calls so revalidation is fast. The deploy script removes the build-time
// pre-render (which has no data) before pushing so the first real render
// is triggered by the warming step with live API data.
export const revalidate = 300;

export const metadata = {
  title: "Krishna's Bliss — Handcrafted Indian Ethnic Wear",
  description: "Timeless weaves and authentic craftsmanship. Shop handwoven silks, handlooms, and heritage fabrics.",
};

interface HomepageBlock {
  id: string;
  type: 'banner' | 'product_section';
  display_order: number;
  is_active: boolean;
  payload: BannerPayload | ProductSectionPayload;
}

export default async function HomePage() {
  // Fetch homepage blocks (cached at API layer via Redis)
  const blocks = await serverFetch<HomepageBlock[]>('/api/homepage/blocks', { revalidate: 300 })
    .catch(() => [] as HomepageBlock[]);

  const activeBlocks = Array.isArray(blocks) ? blocks.filter((b) => b.is_active) : [];

  // Fetch products for all product sections in parallel (keyed by block ID)
  const productsByBlockId: Record<string, ProductListItem[]> = {};
  const productSectionBlocks = activeBlocks.filter((b) => b.type === 'product_section');

  if (productSectionBlocks.length > 0) {
    await Promise.all(
      productSectionBlocks.map(async (block) => {
        const p = block.payload as ProductSectionPayload;
        const limit = p.limit ?? 8;

        // Build products URL based on source type
        let productUrl: string;
        if (p.source_type === 'latest') {
          productUrl = `/api/products?sort=newest&limit=${limit}`;
        } else if (p.source_type === 'tag_filter' && p.tag_group && p.tag_value) {
          productUrl = `/api/products?${p.tag_group}=${encodeURIComponent(p.tag_value)}&limit=${limit}&sort=newest`;
        } else {
          const slug = p.collection_slug ?? '';
          productUrl = `/api/products?collection=${slug}&limit=${limit}&sort=newest`;
        }

        const result = await serverFetchList<ProductListItem>(productUrl, { revalidate: 300 })
          .catch(() => ({ data: [] as ProductListItem[], meta: { total: 0, page: 1, limit, pages: 0 } }));

        productsByBlockId[block.id] = result.data;
      })
    );
  }

  // Fallback: if no blocks configured, show static hero + new arrivals
  if (activeBlocks.length === 0) {
    const { data: products } = await serverFetchList<ProductListItem>(
      '/api/products?sort=newest&limit=8',
      { revalidate: 300 }
    ).catch(() => ({ data: [] as ProductListItem[], meta: { total: 0, page: 1, limit: 8, pages: 0 } }));

    return (
      <>
        <HomepageBanner
          priority
          payload={{
            heading: "Krishna's Bliss",
            subheading: 'Handcrafted Indian Ethnic Wear',
            cta_label: 'Shop Now',
            cta_href: '/shop',
            bg_color: '#1a6b6b',
          }}
        />
        <HomepageProductSection
          payload={{ heading: 'New Arrivals', collection_slug: 'new-arrivals', limit: 8 }}
          products={products}
        />
        <ValueProps />
      </>
    );
  }

  return (
    <>
      {activeBlocks.map((block, i) => {
        if (block.type === 'banner') {
          return (
            <HomepageBanner
              key={block.id}
              payload={block.payload as BannerPayload}
              priority={i === 0}
            />
          );
        }
        if (block.type === 'product_section') {
          const p = block.payload as ProductSectionPayload;
          return (
            <HomepageProductSection
              key={block.id}
              payload={p}
              products={productsByBlockId[block.id] ?? []}
            />
          );
        }
        return null;
      })}
      <ValueProps />
    </>
  );
}

function ValueProps() {
  return (
    <section className="bg-white border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          {[
            {
              icon: '🪡',
              title: 'Handwoven Fabrics',
              desc: 'Every piece woven by skilled artisans using traditional techniques',
            },
            {
              icon: '🇮🇳',
              title: 'Ships Across India',
              desc: 'Delhi NCR in 2–3 days · Rest of India in 5–7 days',
            },
            {
              icon: '🔄',
              title: 'Easy Exchange',
              desc: 'Not satisfied? Exchange within 7 days of delivery',
            },
          ].map((item) => (
            <div key={item.title} className="space-y-2">
              <div className="text-3xl">{item.icon}</div>
              <h3 className="font-semibold text-kb-charcoal">{item.title}</h3>
              <p className="text-sm text-kb-muted">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
