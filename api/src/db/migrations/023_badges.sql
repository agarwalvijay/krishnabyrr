-- 023_badges.sql
-- Custom admin badges that can be attached to products and shown in filters / nav.

CREATE TABLE IF NOT EXISTS badges (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL UNIQUE,
  hex_color     VARCHAR(7)  NOT NULL DEFAULT '#1A6B6B',
  text_color    VARCHAR(7)  NOT NULL DEFAULT '#FFFFFF',
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  is_filter     BOOLEAN     NOT NULL DEFAULT false,
  is_nav        BOOLEAN     NOT NULL DEFAULT false,
  display_order INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_badges (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  badge_id   UUID NOT NULL REFERENCES badges(id)   ON DELETE CASCADE,
  PRIMARY KEY (product_id, badge_id)
);

CREATE INDEX IF NOT EXISTS product_badges_badge_idx ON product_badges (badge_id);
