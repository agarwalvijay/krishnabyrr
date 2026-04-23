-- 021_customer_management.sql
-- Admin customer management: suspend, notes, labels

ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_suspended    BOOLEAN  NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS admin_notes     TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_labels TEXT[]   NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS customers_is_suspended_idx ON customers (is_suspended) WHERE is_suspended = true;
CREATE INDEX IF NOT EXISTS customers_labels_idx ON customers USING GIN (customer_labels);
