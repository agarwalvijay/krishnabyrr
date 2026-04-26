-- 022_otp_purpose.sql
-- Add purpose column to phone_otps so login and phone-verification tokens
-- cannot be used interchangeably across the two auth flows.

ALTER TABLE phone_otps
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(20) NOT NULL DEFAULT 'verify';

CREATE INDEX IF NOT EXISTS phone_otps_purpose_idx ON phone_otps (phone, purpose);
