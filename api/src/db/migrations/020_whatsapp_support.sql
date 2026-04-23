-- 020_whatsapp_support.sql
-- WhatsApp integration: OTP verification + notification audit log

-- 1. Track whether a customer's phone has been verified via OTP
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false;

-- 2. OTP codes — hashed, expire in 10 min, max 1 active per phone
CREATE TABLE IF NOT EXISTS phone_otps (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      VARCHAR(15) NOT NULL,
  otp_hash   TEXT        NOT NULL,           -- SHA-256 of the 6-digit code
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS phone_otps_phone_idx ON phone_otps (phone);
CREATE INDEX IF NOT EXISTS phone_otps_expires_idx ON phone_otps (expires_at);

-- 3. WhatsApp notification audit log — tracks every message we attempt to send
CREATE TABLE IF NOT EXISTS whatsapp_notifications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         VARCHAR(15) NOT NULL,
  template_name VARCHAR(100) NOT NULL,
  wa_message_id TEXT,                        -- Meta message ID from API response
  status        VARCHAR(20) NOT NULL DEFAULT 'queued', -- queued|sent|delivered|read|failed
  error_msg     TEXT,
  metadata      JSONB,                       -- optional extra context (order_number, etc.)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_notifications_phone_idx ON whatsapp_notifications (phone);
CREATE INDEX IF NOT EXISTS whatsapp_notifications_status_idx ON whatsapp_notifications (status);
