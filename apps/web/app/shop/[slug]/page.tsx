import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { serverFetch, serverFetchList, imageUrl, type ProductListItem, type CategoryItem, type TagItem } from '@/lib/api';
import Breadcrumb from '@/components/ui/Breadcrumb';
import ShopClient from '../ShopClient';

export const revalidate = 3600;

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
    const all: CategoryItem[] = [];
    (Array.isArray(cats) ? cats : []).forEach(c => {
      all.push(c);
      (c.children ?? []).forEach(ch => all.push(ch));
    });
    return all.map(c => ({ slug: c.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  try {
    const cat = await serverFetch<CategoryDetail>(`/api/categories/${params.slug}`);
    return {
      title: `${cat.name} — KrishnaByrr`,
      description: cat.description ?? `Shop ${cat.name} at KrishnaByrr.`,
    };
  } catch {
    return { title: 'Category — KrishnaByrr' };
  }
}

const RESERVED_PARAMS = new Set(['price_min', 'price_max', 'in_stock', 'sort', 'page', 'q', 'category', 'collection']);

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

  const [category, productsResult] = await Promise.all([
    serverFetch<CategoryDetail>(`/api/categories/${params.slug}`, { revalidate: 3600 }).catch(() => null),
    serverFetchList<ProductListItem>(
      `/api/products?${buildQuery(params.slug, searchParams, tagGroupNames)}`,
      { noStore: true }
    ),
  ]);

  if (!category) notFound();

  const bannerUrl = category.banner_img ? imageUrl(category.banner_img) : null;

  return (
    <>
      {/* Category header */}
      <div
        className="relative flex flex-col items-center justify-center text-center px-4 py-16 min-h-[200px]"
        style={
          bannerUrl
            ? { background: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url('${bannerUrl}') center/cover no-repeat` }
            : { backgroundColor: 'var(--kb-teal)' }
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
          currentFilters={{ ...searchParams, category: params.slug }}
          lockedCategory={{ name: category.name, slug: params.slug }}
        />
      </Suspense>
    </>
  );
}
