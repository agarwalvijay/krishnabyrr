-- 012_refund_columns.sql
-- Track Razorpay refund details on orders

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refunded_amount    DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS razorpay_refund_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_orders_razorpay_refund ON orders(razorpay_refund_id)
  WHERE razorpay_refund_id IS NOT NULL;
