import type { MetadataRoute } from 'next';
import { serverFetch, serverFetchList, type ProductListItem, type CategoryItem } from '@/lib/api';
import { listFabricGuides } from '@/lib/fabric-guides';

const SITE = 'https://krishnasbliss.com';

// Refresh hourly. Cheap because most underlying API calls are Redis-cached.
export const revalidate = 3600;

const PAGES_SLUGS = ['terms', 'privacy', 'refund', 'shipping', 'exchanges', 'returns'];

function walkCategoryTree(roots: CategoryItem[]): CategoryItem[] {
  const out: CategoryItem[] = [];
  const walk = (nodes: CategoryItem[]) => {
    for (const n of nodes) {
      out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(roots);
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // ── Static pages ─────────────────────────────────────────────────────────
  const staticUrls: MetadataRoute.Sitemap = [
    { url: `${SITE}/`,        lastModified: now, changeFrequency: 'daily',  priority: 1.0 },
    { url: `${SITE}/shop`,    lastModified: now, changeFrequency: 'daily',  priority: 0.9 },
    { url: `${SITE}/fabrics`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    ...PAGES_SLUGS.map((s) => ({
      url:              `${SITE}/pages/${s}`,
      lastModified:     now,
      changeFrequency:  'yearly' as const,
      priority:         0.3,
    })),
  ];

  // ── Fabric guides (static data, no API) ──────────────────────────────────
  const fabricUrls: MetadataRoute.Sitemap = listFabricGuides().map((f) => ({
    url:             `${SITE}/fabrics/${f.slug}`,
    lastModified:    now,
    changeFrequency: 'monthly' as const,
    priority:        0.7,
  }));

  // ── Categories (recursive walk, all depths) ──────────────────────────────
  const categoriesRaw = await serverFetch<CategoryItem[]>('/api/categories', { revalidate: 3600 })
    .catch(() => [] as CategoryItem[]);
  const categories = walkCategoryTree(Array.isArray(categoriesRaw) ? categoriesRaw : []);
  const categoryUrls: MetadataRoute.Sitemap = categories.map((c) => ({
    url:             `${SITE}/shop/${c.slug}`,
    lastModified:    now,
    changeFrequency: 'daily' as const,
    priority:        0.8,
  }));

  // ── Products ─────────────────────────────────────────────────────────────
  // Up to 10k in a single sitemap; if catalog ever grows past that we'll
  // need to split via sitemap index.
  const productsResult = await serverFetchList<ProductListItem>('/api/products?limit=10000')
    .catch(() => ({ data: [] as ProductListItem[], meta: { total: 0, page: 1, limit: 10000, pages: 0 } }));
  const productUrls: MetadataRoute.Sitemap = productsResult.data.map((p) => ({
    url:             `${SITE}/product/${p.slug}`,
    lastModified:    now,
    changeFrequency: 'weekly' as const,
    priority:        0.6,
  }));

  return [...staticUrls, ...fabricUrls, ...categoryUrls, ...productUrls];
}
