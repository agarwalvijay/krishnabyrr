-- 026: per-collection / per-category "show in top nav" toggle.
-- Default true preserves existing behavior — every existing collection and
-- category continues to appear in the storefront top menu until an admin
-- unticks the checkbox.

ALTER TABLE collections ADD COLUMN IF NOT EXISTS is_nav BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE categories  ADD COLUMN IF NOT EXISTS is_nav BOOLEAN NOT NULL DEFAULT true;
