// Shared server component for all policy pages.
// Tries to load content from the CMS (pages table); falls back to the provided children.

import { type ReactNode } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

interface PageData {
  title:   string;
  content: string;
}

async function fetchPage(slug: string): Promise<PageData | null> {
  try {
    const res = await fetch(`${API_BASE}/pages/${slug}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data as PageData;
  } catch {
    return null;
  }
}

export default async function PolicyPage({
  slug,
  defaultTitle,
  children,
}: {
  slug:         string;
  defaultTitle: string;
  children:     ReactNode;
}) {
  const page = await fetchPage(slug);

  return (
    <main className="min-h-screen" style={{ background: 'var(--kb-cream)' }}>
      <div className="max-w-2xl mx-auto px-4 py-16">
        <h1
          className="font-display text-3xl md:text-4xl font-semibold mb-8"
          style={{ color: 'var(--kb-charcoal)' }}
        >
          {page?.title ?? defaultTitle}
        </h1>

        {page ? (
          <div
            className="bg-white rounded-2xl p-8 shadow-sm prose prose-sm max-w-none"
            style={{ color: 'var(--kb-charcoal)' }}
            dangerouslySetInnerHTML={{ __html: page.content }}
          />
        ) : (
          <div
            className="bg-white rounded-2xl p-8 shadow-sm prose prose-sm max-w-none"
            style={{ color: 'var(--kb-charcoal)' }}
          >
            {children}
          </div>
        )}
      </div>
    </main>
  );
}
