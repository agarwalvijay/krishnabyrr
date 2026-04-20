-- Stores FCM device tokens for push notifications.
-- One customer can have multiple tokens (multiple devices / reinstalls).
-- Tokens are upserted on login and removed on logout or when FCM invalidates them.

CREATE TABLE IF NOT EXISTS device_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  fcm_token   TEXT        NOT NULL,
  platform    VARCHAR(10) NOT NULL DEFAULT 'android', -- android | ios
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT device_tokens_customer_token_unique UNIQUE (customer_id, fcm_token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_customer ON device_tokens(customer_id);
