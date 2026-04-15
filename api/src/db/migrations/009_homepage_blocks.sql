-- 009_homepage_blocks.sql
-- Homepage block configuration persisted in DB, served via /api/homepage/blocks.
-- Redis TTL 300 s applied at the API layer, not here.

CREATE TABLE IF NOT EXISTS homepage_blocks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type          VARCHAR(30) NOT NULL CHECK (type IN ('banner', 'product_section')),
  display_order INTEGER     NOT NULL DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  payload       JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- payload shapes (documentation, not enforced):
--   banner:          { heading, subheading, cta_label, cta_href, image_url, bg_color }
--   product_section: { heading, collection_slug, limit (default 8) }

-- Starter banner block
INSERT INTO homepage_blocks (type, display_order, is_active, payload)
VALUES (
  'banner',
  1,
  TRUE,
  '{
    "heading":     "Handcrafted Indian Ethnic Wear",
    "subheading":  "Silks, Handlooms & Heritage Fabrics — direct from the weaver",
    "cta_label":   "Shop Now",
    "cta_href":    "/shop",
    "image_url":   "",
    "bg_color":    "#f5f0e8"
  }'::jsonb
)
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_homepage_blocks_order
  ON homepage_blocks(display_order)
  WHERE is_active = TRUE;
