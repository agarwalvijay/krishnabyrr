-- Migration 006: Related Products
-- Stores curated "similar" and "complete the look" product pairings.

CREATE TABLE IF NOT EXISTS related_products (
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  related_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type          VARCHAR(20) NOT NULL DEFAULT 'similar',
    -- 'similar'  → "You May Also Like"
    -- 'look'     → "Complete The Look"
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, related_id),
  CONSTRAINT related_products_no_self
    CHECK (product_id != related_id),
  CONSTRAINT related_products_valid_type
    CHECK (type IN ('similar', 'look'))
);

CREATE INDEX IF NOT EXISTS idx_related_products_product_id ON related_products(product_id);
CREATE INDEX IF NOT EXISTS idx_related_products_type ON related_products(product_id, type);
