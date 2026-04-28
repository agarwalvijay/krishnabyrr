import { Suspense } from 'react';
import { serverFetchList, serverFetch, type ProductListItem, type CategoryItem, type BadgeItem } from '@/lib/api';
import ShopClient from './ShopClient';

interface CollectionSummary { name: string; slug: string; description?: string | null; banner_img?: string | null; banner_height?: string }

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Shop — Handcrafted Indian Ethnic Wear',
  description: 'Browse our full collection of handcrafted Indian ethnic wear.',
};

// SearchParams can include any tag group name as a filter key
interface SearchParams {
  q?: string;
  category?: string;
  collection?: string;
  price_min?: string;
  price_max?: string;
  in_stock?: string;
  on_sale?: string;
  sort?: string;
  page?: string;
  [key: string]: string | undefined;
}

interface PageProps {
  searchParams: SearchParams;
}

// Tag group shape from new API
interface TagGroupData {
  label: string;
  is_filter: boolean;
  tags: Array<{ id: string; group_name: string; value: string; hex_color: string | null }>;
}

const RESERVED_PARAMS = new Set(['q', 'category', 'collection', 'badge', 'price_min', 'price_max', 'in_stock', 'on_sale', 'sort', 'page']);

function buildQuery(sp: SearchParams, tagGroupNames: string[]): string {
  const params = new URLSearchParams();
  if (sp.q)          params.set('q', sp.q);
  if (sp.category)   params.set('category', sp.category);
  if (sp.collection) params.set('collection', sp.collection);
  if (sp.badge)      params.set('badge', sp.badge);
  if (sp.price_min)  params.set('price_min', sp.price_min);
  if (sp.price_max)  params.set('price_max', sp.price_max);
  if (sp.in_stock)   params.set('in_stock', sp.in_stock);
  if (sp.on_sale)    params.set('on_sale', sp.on_sale);
  if (sp.sort)       params.set('sort', sp.sort);
  // Forward any active tag group filter params
  for (const group of tagGroupNames) {
    if (sp[group]) params.set(group, sp[group]!);
  }
  params.set('page',  sp.page ?? '1');
  params.set('limit', '24');
  return params.toString();
}

export default async function ShopPage({ searchParams }: PageProps) {
  // Fetch tag groups first so we know which URL params to forward
  const tagsResult = await serverFetch<Record<string, TagGroupData>>('/api/tags', { revalidate: 3600 }).catch(() => ({} as Record<string, TagGroupData>));
  const tagGroupNames = Object.keys(tagsResult ?? {});

  const query = buildQuery(searchParams, tagGroupNames);

  const badgesResult = await serverFetch<BadgeItem[]>('/api/badges', { revalidate: 3600 }).catch(() => []);
  const filterBadges = (Array.isArray(badgesResult) ? badgesResult : []).filter(b => (b as BadgeItem & { is_filter: boolean }).is_filter);

  const [productsResult, categoriesResult, activeCollection] = await Promise.all([
    serverFetchList<ProductListItem>(`/api/products?${query}`, { noStore: true }),
    serverFetch<CategoryItem[]>('/api/categories', { revalidate: 3600 }).catch(() => []),
    searchParams.collection
      ? serverFetch<CollectionSummary>(`/api/collections/${searchParams.collection}`, { revalidate: 3600 })
          .then((c) => ({ name: c.name, slug: c.slug, description: c.description, banner_img: c.banner_img, banner_height: c.banner_height }))
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  const flatCategories = Array.isArray(categoriesResult) ? categoriesResult : [];

  // Build currentFilters including any active tag group params
  const currentFilters: SearchParams = { ...searchParams };

  return (
    <Suspense>
      <ShopClient
        initialProducts={productsResult.data}
        initialMeta={productsResult.meta}
        categories={flatCategories}
        tags={tagsResult as Record<string, TagGroupData>}
        filterBadges={filterBadges as (BadgeItem & { is_filter: boolean })[]}
        currentFilters={currentFilters}
        lockedCollection={activeCollection ?? undefined}
      />
    </Suspense>
  );
}
