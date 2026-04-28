-- 024_banner_heights.sql
-- Add banner_height to categories and collections so admins can control
-- banner size independently per item. Values: sm | md | lg | xl.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS banner_height VARCHAR(4) NOT NULL DEFAULT 'md';

ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS banner_height VARCHAR(4) NOT NULL DEFAULT 'md';
