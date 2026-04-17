import { Metadata } from 'next';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

interface PageData {
  slug:       string;
  title:      string;
  content:    string;
  meta_title: string | null;
  meta_desc:  string | null;
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

export async function generateMetadata(): Promise<Metadata> {
  const page = await fetchPage('exchanges');
  return {
    title:       page?.meta_title  ?? 'Exchange Policy',
    description: page?.meta_desc   ?? 'Learn about our exchange policy for Indian ethnic wear.',
  };
}

export default async function ExchangesPolicyPage() {
  const page = await fetchPage('exchanges');

  return (
    <main className="min-h-screen" style={{ background: 'var(--kb-cream)' }}>
      <div className="max-w-2xl mx-auto px-4 py-16">
        <h1
          className="font-display text-3xl md:text-4xl font-semibold mb-8"
          style={{ color: 'var(--kb-charcoal)' }}
        >
          {page?.title ?? 'Exchange Policy'}
        </h1>

        {page ? (
          <div
            className="bg-white rounded-2xl p-8 shadow-sm prose prose-sm max-w-none"
            style={{ color: 'var(--kb-charcoal)' }}
            dangerouslySetInnerHTML={{ __html: page.content }}
          />
        ) : (
          <div className="bg-white rounded-2xl p-8 shadow-sm space-y-4 text-sm" style={{ color: 'var(--kb-muted)' }}>
            <p>We want you to love what you ordered. Here&apos;s our exchange policy:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Exchanges are accepted within <strong>7 days</strong> of delivery.</li>
              <li>Items must be unworn, unwashed, and in original packaging with tags intact.</li>
              <li>We accept exchanges for wrong size, fabric defect, or items different from description.</li>
              <li>To initiate an exchange, go to <strong>My Account → Orders → Request Exchange</strong>.</li>
              <li>Our team will reach out within 24 hours to coordinate the pickup and replacement.</li>
            </ul>
            <p>For any questions, write to us at <strong>care@krishnabyrr.com</strong>.</p>
          </div>
        )}
      </div>
    </main>
  );
}
