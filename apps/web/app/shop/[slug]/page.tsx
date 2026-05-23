import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { serverFetch, serverFetchList, imageUrl, BANNER_HEIGHT_PX, type BannerHeight, type ProductListItem, type CategoryItem, type TagItem, type BadgeItem } from '@/lib/api';
import Breadcrumb from '@/components/ui/Breadcrumb';
import ShopClient from '../ShopClient';

// Filters + pagination make this page inherently per-request dynamic.
// Matches the /shop sibling page. Individual /api/* fetches inside still
// get their own revalidate caching.
export const dynamic = 'force-dynamic';

interface CategoryDetail extends CategoryItem {
  product_count: number;
}

interface TagGroupData {
  label: string;
  is_filter: boolean;
  tags: TagItem[];
}

interface Params { slug: string }
interface SearchParams {
  price_min?: string;
  price_max?: string;
  in_stock?: string;
  sort?: string;
  page?: string;
  [key: string]: string | undefined;
}

export async function generateStaticParams(): Promise<Params[]> {
  try {
    const cats = await serverFetch<CategoryItem[]>('/api/categories', { revalidate: 3600 });
    // Walk the tree recursively so grandchildren (Department -> Family ->
    // Type, e.g. Fabrics > Cottons > Kota) also get pre-rendered.
    const all: CategoryItem[] = [];
    const walk = (nodes: CategoryItem[]) => {
      for (const n of nodes) {
        all.push(n);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(Array.isArray(cats) ? cats : []);
    return all.map(c => ({ slug: c.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  try {
    const cat = await serverFetch<CategoryDetail>(`/api/categories/${params.slug}`);
    return {
      title: cat.name,
      description: cat.description ?? `Shop ${cat.name}.`,
    };
  } catch {
    return { title: 'Category' };
  }
}

const RESERVED_PARAMS = new Set(['price_min', 'price_max', 'in_stock', 'sort', 'page', 'q', 'category', 'collection', 'badge']);

function buildQuery(slug: string, sp: SearchParams, tagGroupNames: string[]): string {
  const params = new URLSearchParams();
  params.set('category', slug);
  if (sp.price_min) params.set('price_min', sp.price_min);
  if (sp.price_max) params.set('price_max', sp.price_max);
  if (sp.in_stock)  params.set('in_stock', sp.in_stock);
  if (sp.sort)      params.set('sort', sp.sort);
  for (const group of tagGroupNames) {
    if (sp[group]) params.set(group, sp[group]!);
  }
  params.set('page',  sp.page ?? '1');
  params.set('limit', '24');
  return params.toString();
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  // Fetch tag groups first to know which URL params to forward
  const tagsResult = await serverFetch<Record<string, TagGroupData>>('/api/tags', { revalidate: 3600 }).catch(() => ({} as Record<string, TagGroupData>));
  const tagGroupNames = Object.keys(tagsResult ?? {});

  const badgesRaw = await serverFetch<BadgeItem[]>('/api/badges', { revalidate: 3600 }).catch(() => []);
  const filterBadges = (Array.isArray(badgesRaw) ? badgesRaw : []).filter(
    (b) => (b as BadgeItem & { is_filter: boolean }).is_filter
  ) as (BadgeItem & { is_filter: boolean })[];

  const [category, productsResult] = await Promise.all([
    serverFetch<CategoryDetail>(`/api/categories/${params.slug}`, { revalidate: 3600 }).catch(() => null),
    serverFetchList<ProductListItem>(
      `/api/products?${buildQuery(params.slug, searchParams, tagGroupNames)}`,
      { noStore: true }
    ).catch(() => ({ data: [] as ProductListItem[], meta: { total: 0, page: 1, limit: 24, pages: 0 } })),
  ]);

  if (!category) notFound();

  const bannerUrl   = category.banner_img ? imageUrl(category.banner_img) : null;
  const minHeight   = BANNER_HEIGHT_PX[(category.banner_height as BannerHeight) ?? 'md'];

  return (
    <>
      {/* Category header */}
      <div
        className="relative flex flex-col items-center justify-center text-center px-4 py-16"
        style={
          bannerUrl
            ? { minHeight, background: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url('${bannerUrl}') center/cover no-repeat` }
            : { minHeight, backgroundColor: 'var(--kb-teal)' }
        }
      >
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white mb-2">
          {category.name}
        </h1>
        {category.description && (
          <p className="text-white/80 text-sm max-w-xl">{category.description}</p>
        )}
        <p className="text-white/60 text-xs mt-2">{category.product_count} products</p>
      </div>

      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-5">
        <Breadcrumb items={[{ label: category.name }]} />
      </div>

      {/* Products */}
      <Suspense>
        <ShopClient
          initialProducts={productsResult.data}
          initialMeta={productsResult.meta}
          categories={[]}
          tags={tagsResult}
          filterBadges={filterBadges}
          currentFilters={{ ...searchParams, category: params.slug }}
          lockedCategory={{ name: category.name, slug: params.slug }}
        />
      </Suspense>
    </>
  );
}
