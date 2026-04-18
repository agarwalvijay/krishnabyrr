-- Individual refund transaction log for orders.
-- Replaces relying solely on orders.refunded_amount for refund history.

CREATE TABLE IF NOT EXISTS order_refunds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount              NUMERIC(10,2) NOT NULL,
  razorpay_refund_id  TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_refunds_order_id ON order_refunds(order_id);

-- Backfill: create a synthetic refund record for any orders that already
-- have a non-zero refunded_amount but no rows in order_refunds.
-- We can't recover the exact timestamp so we use updated_at as a proxy.
INSERT INTO order_refunds (order_id, amount, razorpay_refund_id, notes, created_at)
SELECT
  id,
  refunded_amount::NUMERIC,
  razorpay_refund_id,
  'Migrated from orders.refunded_amount',
  COALESCE(updated_at, NOW())
FROM orders
WHERE refunded_amount IS NOT NULL
  AND refunded_amount::NUMERIC > 0
  AND id NOT IN (SELECT order_id FROM order_refunds);
