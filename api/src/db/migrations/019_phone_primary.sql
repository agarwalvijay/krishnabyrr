-- 019_phone_primary.sql
-- Phone number becomes a co-primary identifier alongside email.
-- • email is now optional (nullable)
-- • phone gets a partial unique index (unique when not null)
-- • email keeps uniqueness but via partial index so multiple NULLs are allowed
-- • at least one of email/phone must be present (check constraint)

-- 1. Make email nullable
ALTER TABLE customers ALTER COLUMN email DROP NOT NULL;

-- 2. Drop the old plain unique constraint on email (created in 002_customers)
--    The constraint may be named differently; drop both common variants safely.
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_email_key;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_email_unique;
DROP INDEX IF EXISTS customers_email_key;

-- 3. Partial unique index on email — unique among non-null values only
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique
  ON customers (email)
  WHERE email IS NOT NULL;

-- 4. Partial unique index on phone — unique among non-null values only
CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique
  ON customers (phone)
  WHERE phone IS NOT NULL;

-- 5. Require at least one contact method
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_contact_required;
ALTER TABLE customers ADD CONSTRAINT customers_contact_required
  CHECK (email IS NOT NULL OR phone IS NOT NULL);
