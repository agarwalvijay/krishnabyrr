-- Store PhonePe's own transaction ID (distinct from our merchantTransactionId)
-- Needed for refund lookups, reconciliation, and support queries.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS phonepe_payment_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_orders_phonepe_payment ON orders(phonepe_payment_id)
  WHERE phonepe_payment_id IS NOT NULL;
