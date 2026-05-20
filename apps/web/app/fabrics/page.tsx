import type { Metadata } from 'next';
import Link from 'next/link';
import { listFabricGuides } from '@/lib/fabric-guides';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Know Your Fabric — Fabric Guides',
  description:
    'Explore the fabrics behind every Krishna\'s Bliss saree — origin, feel, drape, and care, written plainly so you can choose what fits the occasion.',
};

export default function FabricsIndexPage() {
  const guides = listFabricGuides();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-kb-teal">
          Know Your Fabric
        </p>
        <h1 className="mt-3 font-display text-4xl sm:text-5xl font-semibold text-kb-charcoal">
          Fabric Guides
        </h1>
        <p className="mt-4 text-lg text-kb-muted max-w-3xl">
          The weaves behind every Krishna's Bliss saree — origins, how they feel,
          how they drape, and how to care for them. Pick a fabric to read the
          full guide.
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {guides.map((guide) => (
          <li key={guide.slug}>
            <Link
              href={`/fabrics/${guide.slug}`}
              className="block h-full bg-white rounded-2xl border border-gray-100 p-6 shadow-sm transition-all hover:shadow-md hover:border-kb-teal/40"
            >
              <h2 className="font-display text-xl font-semibold text-kb-charcoal">
                {guide.name}
              </h2>
              <p className="mt-2 text-sm leading-6 text-kb-muted">
                {guide.tagline}
              </p>
              <p className="mt-3 text-xs text-kb-muted">
                <span className="font-semibold uppercase tracking-wide">Origin</span> · {guide.origin}
              </p>
              <p className="mt-4 text-sm font-medium text-kb-teal">
                Read the guide →
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
