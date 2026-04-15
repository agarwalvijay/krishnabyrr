-- 008_tag_groups.sql
-- Introduce tag_groups table to replace hardcoded group_name strings.
-- Adds FK from tags.group_name → tag_groups.name with CASCADE UPDATE / RESTRICT DELETE.

CREATE TABLE IF NOT EXISTS tag_groups (
  name          VARCHAR(50)  PRIMARY KEY,
  label         VARCHAR(100) NOT NULL,
  display_order INTEGER      NOT NULL DEFAULT 0,
  is_filter     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed the four groups that already exist in the tags table
INSERT INTO tag_groups (name, label, display_order, is_filter)
VALUES
  ('fabric',   'Fabric',   1, TRUE),
  ('weave',    'Weave',    2, TRUE),
  ('occasion', 'Occasion', 3, TRUE),
  ('color',    'Color',    4, TRUE)
ON CONFLICT (name) DO NOTHING;

-- Add FK on tags.group_name (alter existing table, idempotent guard via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_tags_group_name'
      AND table_name = 'tags'
  ) THEN
    ALTER TABLE tags
      ADD CONSTRAINT fk_tags_group_name
      FOREIGN KEY (group_name)
      REFERENCES tag_groups(name)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tag_groups_order ON tag_groups(display_order);
