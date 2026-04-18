-- Track the amount actually captured from a Razorpay authorization.
-- Partial capture is supported: admin can capture less than order.total,
-- and Razorpay auto-releases the remainder. Refund math uses this column
-- as the ceiling instead of total.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS captured_amount NUMERIC(10,2);
