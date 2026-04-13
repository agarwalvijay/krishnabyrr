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

interface Params { slug: string }
interface SearchParams {
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

function buildQuery(slug: string, sp: SearchParams): string {
  const params = new URLSearchParams();
  params.set('category', slug);
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

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [category, productsResult, tagsResult] = await Promise.all([
    serverFetch<CategoryDetail>(`/api/categories/${params.slug}`, { revalidate: 3600 }).catch(() => null),
    serverFetchList<ProductListItem>(
      `/api/products?${buildQuery(params.slug, searchParams)}`,
      { noStore: true }
    ),
    serverFetch<Record<string, TagItem[]>>('/api/tags', { revalidate: 3600 }).catch(() => ({})),
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
          tags={tagsResult as Record<string, TagItem[]>}
          currentFilters={{ ...searchParams, category: params.slug }}
          lockedCategory={{ name: category.name, slug: params.slug }}
        />
      </Suspense>
    </>
  );
}
