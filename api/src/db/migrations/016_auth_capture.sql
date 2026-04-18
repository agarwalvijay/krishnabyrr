-- Track when a Razorpay payment was authorized (manual-capture flow).
-- Authorization holds last 5 days from this timestamp.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS razorpay_authorized_at TIMESTAMPTZ;
