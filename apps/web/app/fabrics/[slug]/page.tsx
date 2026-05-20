import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFabricGuideBySlug } from '@/lib/fabric-guides';

export const dynamic = 'force-dynamic';

interface Params {
  slug: string;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const guide = getFabricGuideBySlug(params.slug);
  if (!guide) {
    return { title: 'Know Your Fabric' };
  }

  return {
    title: `${guide.name} | Know Your Fabric`,
    description: guide.tagline,
  };
}

export default function FabricGuidePage({ params }: { params: Params }) {
  const guide = getFabricGuideBySlug(params.slug);
  if (!guide) notFound();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-kb-teal">Know Your Fabric</p>
        <h1 className="mt-3 font-display text-4xl sm:text-5xl font-semibold text-kb-charcoal">
          {guide.name}
        </h1>
        <p className="mt-4 text-lg text-kb-muted max-w-3xl">{guide.tagline}</p>
      </div>

      {guide.image && (
        <div className="mb-8 overflow-hidden rounded-2xl bg-gray-100 aspect-[3/2] shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={guide.image}
            alt={`${guide.name} fabric close-up`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8 shadow-sm">
          <div className="grid gap-6 sm:grid-cols-2">
            <InfoBlock label="Origin" value={guide.origin} />
            <InfoBlock label="Feel" value={guide.feel} />
            <InfoBlock label="Drape" value={guide.drape} />
            <InfoBlock label="Best For" value={guide.bestFor.join(' · ')} />
          </div>

          <div className="mt-8">
            <h2 className="font-semibold text-kb-charcoal">Why it stands out</h2>
            <p className="mt-2 text-sm leading-7 text-kb-muted">{guide.whyItStandsOut}</p>
          </div>
        </section>

        <aside className="space-y-6">
          <Panel title="Care">
            <ul className="space-y-2 text-sm text-kb-muted">
              {guide.care.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-kb-teal flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Styling Notes">
            <ul className="space-y-2 text-sm text-kb-muted">
              {guide.stylingNotes.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-kb-gold flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="rounded-2xl bg-kb-teal text-white p-6">
            <p className="text-sm uppercase tracking-[0.18em] text-white/70">Ready to explore?</p>
            <h3 className="mt-2 font-display text-2xl">Shop {guide.name}</h3>
            <p className="mt-2 text-sm text-white/80">
              Browse pieces tagged with {guide.name} and see how the fabric shows up across the collection.
            </p>
            <Link
              href={`/shop?fabric=${encodeURIComponent(guide.name)}`}
              className="inline-flex items-center gap-2 mt-5 rounded-full bg-white px-5 py-3 text-sm font-semibold text-kb-teal"
            >
              View Products
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-kb-muted">{label}</p>
      <p className="mt-2 text-sm leading-7 text-kb-charcoal">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
      <h2 className="font-semibold text-kb-charcoal">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
