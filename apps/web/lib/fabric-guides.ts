export interface FabricGuide {
  slug: string;
  name: string;
  tagline: string;
  origin: string;
  feel: string;
  drape: string;
  bestFor: string[];
  whyItStandsOut: string;
  care: string[];
  stylingNotes: string[];
}

const FABRIC_GUIDES: FabricGuide[] = [
  {
    slug: 'maheshwari-silk',
    name: 'Maheshwari Silk',
    tagline: 'Light, lustrous, and easy to wear from day celebrations to elegant evenings.',
    origin: 'Maheshwar, Madhya Pradesh',
    feel: 'Soft with a light crispness and a smooth silk handfeel.',
    drape: 'Fluid without feeling heavy, making it comfortable for long wear.',
    bestFor: ['Festive daywear', 'Small celebrations', 'Elegant gifting'],
    whyItStandsOut:
      'Maheshwari is loved for its balance of refinement and wearability. It carries a subtle sheen, signature borders, and a graceful structure without the weight of heavier silks.',
    care: ['Dry clean preferred', 'Store folded in a muslin cloth', 'Avoid direct perfume on the fabric'],
    stylingNotes: ['Pairs beautifully with heritage jewelry', 'Works well for understated festive dressing'],
  },
  {
    slug: 'banarasi',
    name: 'Banarasi',
    tagline: 'Rich, ceremonial, and unmistakably luxurious with woven detail that catches the light.',
    origin: 'Varanasi, Uttar Pradesh',
    feel: 'Dense, smooth, and opulent, often with zari-rich texture.',
    drape: 'Structured and regal, with a fuller fall that feels occasion-worthy.',
    bestFor: ['Weddings', 'Grand festive occasions', 'Statement heirloom pieces'],
    whyItStandsOut:
      'Banarasi textiles are prized for their intricate brocades and celebratory presence. They bring depth, richness, and a strong visual identity to any silhouette.',
    care: ['Dry clean only', 'Refold periodically to protect zari lines', 'Keep away from moisture during storage'],
    stylingNotes: ['Ideal when you want a more formal look', 'Often needs very little styling because the fabric itself is the statement'],
  },
  {
    slug: 'chanderi',
    name: 'Chanderi',
    tagline: 'Airy, luminous, and refined for elegant daytime and transitional dressing.',
    origin: 'Chanderi, Madhya Pradesh',
    feel: 'Lightweight with a delicate, almost sheer texture and a soft glow.',
    drape: 'Floaty and graceful, with an easy, breathable fall.',
    bestFor: ['Summer festivities', 'Day events', 'Light occasion wear'],
    whyItStandsOut:
      'Chanderi is known for its featherlight character and polished finish. It gives you the richness of tradition with a much lighter, more breathable feel.',
    care: ['Dry clean for best longevity', 'Steam gently on low heat', 'Store away from rough surfaces to avoid pulls'],
    stylingNotes: ['Perfect for warm-weather celebrations', 'Looks especially elegant with minimal, refined accessories'],
  },
];

const NORMALIZED_LOOKUP = new Map<string, FabricGuide>(
  FABRIC_GUIDES.flatMap((guide) => [
    [guide.slug, guide],
    [normalizeFabricKey(guide.name), guide],
  ])
);

export function normalizeFabricKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getFabricGuideByValue(value: string | null | undefined): FabricGuide | null {
  if (!value) return null;
  return NORMALIZED_LOOKUP.get(normalizeFabricKey(value)) ?? null;
}

export function getFabricGuideBySlug(slug: string): FabricGuide | null {
  return NORMALIZED_LOOKUP.get(normalizeFabricKey(slug)) ?? null;
}

export function listFabricGuides(): FabricGuide[] {
  return FABRIC_GUIDES;
}
