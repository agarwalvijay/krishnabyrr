import { serverFetch, type BadgeItem } from '@/lib/api';
import HeaderClient, { type HeaderNavData } from './HeaderClient';

interface CollectionRow {
  id: string;
  name: string;
  slug: string;
  is_nav?: boolean;
}

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  is_nav?: boolean;
  children?: Array<{ id: string; name: string; slug: string; is_nav?: boolean }>;
}

interface TagGroupData {
  label: string;
  is_filter: boolean;
  is_nav: boolean;
  tags: Array<{ id: string; value: string; hex_color: string | null }>;
}

export default async function Header() {
  const [collections, tagGroups, categories, badgesRaw] = await Promise.all([
    serverFetch<CollectionRow[]>('/api/collections', { revalidate: 300 }).catch(() => []),
    serverFetch<Record<string, TagGroupData>>('/api/tags', { revalidate: 300 }).catch(() => ({})),
    serverFetch<CategoryRow[]>('/api/categories', { revalidate: 300 }).catch(() => []),
    serverFetch<BadgeItem[]>('/api/badges', { revalidate: 300 }).catch(() => []),
  ]);

  // is_nav defaults to true server-side, so absent/undefined is treated as opt-in.
  const collectionsList = Array.isArray(collections) ? collections : [];
  const categoriesList  = Array.isArray(categories)  ? categories  : [];

  const navData: HeaderNavData = {
    collections: collectionsList.filter((c) => c.is_nav !== false),
    tagGroups:   tagGroups ?? {},
    categories:  categoriesList
      .filter((c) => c.is_nav !== false)
      .map((c) => ({
        ...c,
        children: c.children?.filter((ch) => ch.is_nav !== false),
      })),
    navBadges:   (Array.isArray(badgesRaw) ? badgesRaw : []).filter(
      (b) => (b as BadgeItem & { is_nav: boolean }).is_nav
    ) as (BadgeItem & { is_nav: boolean })[],
  };

  return <HeaderClient {...navData} />;
}
