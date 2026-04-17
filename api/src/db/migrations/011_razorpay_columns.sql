-- 011_razorpay_columns.sql
-- Add Razorpay payment tracking columns to orders

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS razorpay_order_id  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order ON orders(razorpay_order_id);
