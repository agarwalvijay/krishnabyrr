import { serverFetch } from '@/lib/api';
import HeaderClient, { type HeaderNavData } from './HeaderClient';

interface CollectionRow {
  id: string;
  name: string;
  slug: string;
}

interface TagGroupData {
  label: string;
  is_filter: boolean;
  is_nav: boolean;
  tags: Array<{ id: string; value: string; hex_color: string | null }>;
}

export default async function Header() {
  const [collections, tagGroups] = await Promise.all([
    serverFetch<CollectionRow[]>('/api/collections', { revalidate: 300 }).catch(() => []),
    serverFetch<Record<string, TagGroupData>>('/api/tags', { revalidate: 300 }).catch(() => ({})),
  ]);

  const navData: HeaderNavData = {
    collections: Array.isArray(collections) ? collections : [],
    tagGroups:   tagGroups ?? {},
  };

  return <HeaderClient {...navData} />;
}
