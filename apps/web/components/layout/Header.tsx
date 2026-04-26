import { serverFetch, type BadgeItem } from '@/lib/api';
import HeaderClient, { type HeaderNavData } from './HeaderClient';

interface CollectionRow {
  id: string;
  name: string;
  slug: string;
}

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  children?: Array<{ id: string; name: string; slug: string }>;
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

  const navData: HeaderNavData = {
    collections: Array.isArray(collections) ? collections : [],
    tagGroups:   tagGroups ?? {},
    categories:  Array.isArray(categories) ? categories : [],
    navBadges:   (Array.isArray(badgesRaw) ? badgesRaw : []).filter(
      (b) => (b as BadgeItem & { is_nav: boolean }).is_nav
    ) as (BadgeItem & { is_nav: boolean })[],
  };

  return <HeaderClient {...navData} />;
}
