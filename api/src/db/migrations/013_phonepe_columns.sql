-- Add PhonePe transaction ID to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS phonepe_transaction_id VARCHAR(100);

-- Default payment gateway setting
INSERT INTO settings (key, value)
VALUES ('payment_gateway', '"razorpay"')
ON CONFLICT (key) DO NOTHING;
