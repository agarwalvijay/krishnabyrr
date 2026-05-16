-- 025: account_claim_tokens
-- One-time tokens that let a guest customer "claim" an order via a WhatsApp
-- magic link, converting them into a registered account without an OTP gate.
-- See whatsapp.ts and routes/auth.ts (claim-order endpoint).

CREATE TABLE IF NOT EXISTS account_claim_tokens (
  token       TEXT        PRIMARY KEY,
  order_id    UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  phone       VARCHAR(15) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS account_claim_tokens_order_idx ON account_claim_tokens (order_id);
CREATE INDEX IF NOT EXISTS account_claim_tokens_phone_idx ON account_claim_tokens (phone);
