-- 010_tag_groups_is_nav.sql
-- Add is_nav flag to tag_groups: controls whether a group appears in the
-- site header navigation as a flyout menu (independent of is_filter).

ALTER TABLE tag_groups
  ADD COLUMN IF NOT EXISTS is_nav BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed: existing filter groups default to also showing in nav
UPDATE tag_groups SET is_nav = TRUE WHERE name IN ('fabric', 'weave', 'occasion', 'color');
