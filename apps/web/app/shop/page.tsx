import { Suspense } from 'react';
import { serverFetchList, serverFetch, type ProductListItem, type CategoryItem, type TagItem } from '@/lib/api';
import ShopClient from './ShopClient';

export const revalidate = 3600;

export const metadata = {
  title: 'Shop — Handcrafted Indian Ethnic Wear',
  description: 'Browse our full collection of handcrafted Indian ethnic wear.',
};

interface SearchParams {
  q?: string;
  category?: string;
  fabric?: string;
  weave?: string;
  occasion?: string;
  color?: string;
  price_min?: string;
  price_max?: string;
  in_stock?: string;
  sort?: string;
  page?: string;
}

interface PageProps {
  searchParams: SearchParams;
}

function buildQuery(sp: SearchParams): string {
  const params = new URLSearchParams();
  if (sp.q)         params.set('q', sp.q);
  if (sp.category)  params.set('category', sp.category);
  if (sp.fabric)    params.set('fabric', sp.fabric);
  if (sp.weave)     params.set('weave', sp.weave);
  if (sp.occasion)  params.set('occasion', sp.occasion);
  if (sp.color)     params.set('color', sp.color);
  if (sp.price_min) params.set('price_min', sp.price_min);
  if (sp.price_max) params.set('price_max', sp.price_max);
  if (sp.in_stock)  params.set('in_stock', sp.in_stock);
  if (sp.sort)      params.set('sort', sp.sort);
  params.set('page',  sp.page ?? '1');
  params.set('limit', '24');
  return params.toString();
}

export default async function ShopPage({ searchParams }: PageProps) {
  const query = buildQuery(searchParams);

  const [productsResult, categoriesResult, tagsResult] = await Promise.all([
    serverFetchList<ProductListItem>(`/api/products?${query}`, { noStore: true }),
    serverFetch<CategoryItem[]>('/api/categories', { revalidate: 3600 }).catch(() => []),
    serverFetch<Record<string, TagItem[]>>('/api/tags', { revalidate: 3600 }).catch(() => ({})),
  ]);

  // Flatten categories for filter sidebar (top-level only for simplicity)
  const flatCategories = Array.isArray(categoriesResult) ? categoriesResult : [];

  return (
    <Suspense>
      <ShopClient
        initialProducts={productsResult.data}
        initialMeta={productsResult.meta}
        categories={flatCategories}
        tags={tagsResult as Record<string, TagItem[]>}
        currentFilters={searchParams}
      />
    </Suspense>
  );
}
