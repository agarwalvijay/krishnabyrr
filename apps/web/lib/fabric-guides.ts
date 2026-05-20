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
  /**
   * Optional hero image — close-up of the fabric / weave. Path is relative to
   * /apps/web/public, e.g. '/fabrics/banarasi.jpg'. Renders as a banner on the
   * guide page and as the card cover on the /fabrics index. When absent, both
   * surfaces fall back cleanly to text-only.
   *
   * Suggested specs: 1200x800 (3:2), JPEG, ~150KB, sharp focus on the weave.
   */
  image?: string;
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
  {
    slug: 'pure-chanderi',
    name: 'Pure Chanderi',
    tagline: 'All-silk Chanderi — fuller, more lustrous, with a quiet richness for evening occasions.',
    origin: 'Chanderi, Madhya Pradesh',
    feel: 'Smoother and more substantial than cotton-silk Chanderi, with a softer hand and a subtle sheen.',
    drape: 'A slightly fuller fall than its cotton-silk counterpart, holding pleats with more definition.',
    bestFor: ['Evening gatherings', 'Engagement and reception edges', 'Festive dressing with a refined touch'],
    whyItStandsOut:
      'Where standard Chanderi leans light and breezy, Pure Chanderi turns up the luminosity. The all-silk weave catches light beautifully and gives the fabric a quieter elegance suited to occasions that lean dressier.',
    care: ['Dry clean only', 'Fold and store with muslin rather than hanging', 'Steam from the reverse on low heat if needed'],
    stylingNotes: ['Pairs well with statement gold or pearl jewelry', 'Works equally for day-into-evening and dedicated evening events'],
  },
  {
    slug: 'linen-silk',
    name: 'Linen Silk',
    tagline: 'The breezy nonchalance of linen with a silk-kissed glow — modern, polished, and easy to wear.',
    origin: 'Woven across Bengal and South India',
    feel: 'Cool and breathable with a soft slubby texture and a discreet shimmer from the silk weft.',
    drape: 'Casual but composed, with a slight crispness that gives shape without stiffness.',
    bestFor: ['Daytime events', 'Brunches and engagement lunches', 'Travel-friendly festive wear'],
    whyItStandsOut:
      'Linen silk is the answer when you want richness without the weight or fuss of pure silk. The silk content adds subtle luminosity and refined drape, while the linen keeps it light, breathable, and forgiving in warm weather.',
    care: ['Dry clean recommended', 'Iron on the reverse with steam', 'Embrace the gentle wrinkles — they are part of the character'],
    stylingNotes: ['Looks effortless with minimal jewelry', 'Layers beautifully under structured blouses or jackets'],
  },
  {
    slug: 'linen-cotton',
    name: 'Linen Cotton',
    tagline: 'Breathable, textured, and confidently understated — everyday luxury for warm-weather living.',
    origin: 'Woven across India, with strong traditions in Bengal and Bhagalpur',
    feel: 'Crisp yet soft, with linen\'s characteristic slub softened by cotton\'s warmth.',
    drape: 'Light and casual with an easy, lived-in fall.',
    bestFor: ['Office wear with a festive touch', 'Casual day events', 'Summer travel and everyday elegance'],
    whyItStandsOut:
      'Linen cotton brings together the best of both worlds — cotton\'s gentle softness with linen\'s breathable crispness. It\'s the kind of fabric that gets better with each wash and works as easily with sandals as with statement earrings.',
    care: ['Hand wash cold or gentle machine wash', 'Line dry away from direct sun', 'Iron while slightly damp for the smoothest finish'],
    stylingNotes: ['Perfect for relaxed daywear with bold accessories', 'Pairs well with leather sandals and woven bags'],
  },
  {
    slug: 'kota',
    name: 'Kota',
    tagline: 'Featherlight check-weave from Rajasthan — sheer, graceful, and made for summer celebrations.',
    origin: 'Kota, Rajasthan',
    feel: 'Ultra-light and sheer, with the signature square khat weave creating a fine grid texture.',
    drape: 'Floaty and translucent, with a delicate fall that moves with you.',
    bestFor: ['Hot-weather festivities', 'Daytime gatherings', 'Pooja and home celebrations'],
    whyItStandsOut:
      'Kota Doria\'s distinctive checkered weave isn\'t just decorative — it\'s what makes the fabric feel like you\'re wearing air. Originally developed for Rajasthani summers, it remains the go-to for staying cool while still looking dressed up.',
    care: ['Hand wash gently, avoid wringing', 'Dry flat in shade', 'Iron on low heat with a cloth in between'],
    stylingNotes: ['Wear a fitted, structured blouse to balance the sheerness', 'Looks beautiful with kundan or temple jewelry'],
  },
  {
    slug: 'pure-mul',
    name: 'Pure Mul',
    tagline: 'Whisper-soft muslin cotton — the gentlest weave, made for the warmest days.',
    origin: 'Bengal, with a long Mughal-era tradition',
    feel: 'Impossibly soft and barely-there light, almost like a second skin.',
    drape: 'Fluid and yielding, with a delicate, gathering fall.',
    bestFor: ['Peak summer wear', 'Casual day events', 'Travel and comfortable elegance'],
    whyItStandsOut:
      'Mul cotton was historically prized as the finest muslin in the world. It remains unmatched for sheer comfort — breathable enough for the hottest days, soft enough to wear from morning to evening without a thought.',
    care: ['Hand wash with mild detergent', 'Line dry away from harsh sun', 'A light starch helps keep the drape crisp'],
    stylingNotes: ['Beautiful in solid colors with embroidered borders', 'Pairs well with silver jewelry and natural textures'],
  },
  {
    slug: 'pure-organza',
    name: 'Pure Organza',
    tagline: 'Sheer, structured, and quietly dramatic — the fabric that holds its own without trying.',
    origin: 'Strong traditions in Bangalore, Mysore, and Varanasi',
    feel: 'Crisp and papery with a delicate translucence, woven from tightly twisted silk yarn.',
    drape: 'Holds shape beautifully, creating sculptural folds and a slightly flared silhouette.',
    bestFor: ['Cocktail evenings', 'Sangeet and pre-wedding events', 'Modern festive looks'],
    whyItStandsOut:
      'Organza is one of those rare fabrics that feels both delicate and confident. Its inherent structure lets it stand away from the body, which is why it photographs beautifully and feels elevated without needing heavy embellishment.',
    care: ['Dry clean only', 'Store flat or rolled — avoid repeated folds along the same lines', 'Steam carefully to maintain crispness'],
    stylingNotes: ['Stunning with minimal but striking jewelry', 'Often features hand-painted or zardozi work that becomes the focal point'],
  },
  {
    slug: 'pure-tissue',
    name: 'Pure Tissue',
    tagline: 'A shimmering, gossamer weave — pure occasion fabric for moments that deserve a little magic.',
    origin: 'Varanasi, with regional variants from Chanderi and South India',
    feel: 'Sheer, lightweight, and luminous, woven with fine silk yarn often interlaced with zari.',
    drape: 'Airy with a subtle structure, letting pleats fall softly while still catching light.',
    bestFor: ['Weddings and receptions', 'Festive evenings', 'Photoshoot-worthy occasions'],
    whyItStandsOut:
      'Tissue\'s defining trait is its glow — the gold or silver zari woven through a sheer silk base gives it a near-magical luminosity. It\'s the fabric for moments when you want to feel quietly radiant rather than overtly heavy.',
    care: ['Dry clean only', 'Store carefully — zari can snag on rough surfaces', 'Refold along different lines every few months'],
    stylingNotes: ['Best when the fabric itself does the talking — keep jewelry restrained', 'Photographs beautifully under warm indoor lighting'],
  },
  {
    slug: 'pure-cotton',
    name: 'Pure Cotton',
    tagline: 'Honest, breathable, and quietly luxurious — the everyday weave that never goes out of style.',
    origin: 'Handloom traditions across India, from Bengal to Andhra Pradesh and Tamil Nadu',
    feel: 'Soft and breathable with a comfortable, natural weight that becomes even nicer with wear.',
    drape: 'Easy and grounded, with a relaxed fall that feels lived-in from day one.',
    bestFor: ['Daily wear', 'Office and travel', 'Pooja and intimate gatherings'],
    whyItStandsOut:
      'Pure cotton is the fabric Indian summers were made for. It breathes when nothing else will, takes natural dyes beautifully, and ages gracefully — softer with every wash, stronger in character with every year.',
    care: ['Hand wash or gentle machine wash in cold water', 'Line dry away from harsh sun', 'A light starch revives the crispness'],
    stylingNotes: ['Looks effortless with silver or beaded jewelry', 'Solid colors with hand-printed borders are particularly striking'],
  },
  {
    slug: 'pure-silk',
    name: 'Pure Silk',
    tagline: 'The timeless choice — rich, lustrous, and forever the language of celebration.',
    origin: 'Mulberry silk traditions span Karnataka, Tamil Nadu, Bengal, and beyond',
    feel: 'Substantial and smooth, with a deep, characteristic sheen.',
    drape: 'Full and graceful, with a weighted fall that makes pleats look effortless.',
    bestFor: ['Weddings and major celebrations', 'Family festivities', 'Heirloom moments'],
    whyItStandsOut:
      'Pure silk has been the fabric of celebration in India for centuries — and for good reason. The depth of color silk can hold, the way it catches and softens light, and the sense of occasion it brings are difficult to replicate in any other material.',
    care: ['Dry clean only', 'Store in muslin or cotton wrap so the fabric can breathe', 'Avoid prolonged sunlight which can fade dyes'],
    stylingNotes: ['Holds beautifully against heritage jewelry', 'Pairs well with both classic and contemporary blouses'],
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
