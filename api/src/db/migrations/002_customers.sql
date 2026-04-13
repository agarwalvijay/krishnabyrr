-- 002_customers.sql
-- Tables: customers, addresses, wishlist_items

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  name VARCHAR(255),
  password_hash VARCHAR(500),
  email_verified BOOLEAN DEFAULT FALSE,
  default_address_id UUID,
  total_orders INTEGER DEFAULT 0,
  lifetime_value DECIMAL(12,2) DEFAULT 0,
  marketing_email BOOLEAN DEFAULT FALSE,
  marketing_whatsapp BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  name VARCHAR(255),
  phone VARCHAR(20),
  line1 VARCHAR(255),
  line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(10),
  country VARCHAR(50) DEFAULT 'India',
  is_default BOOLEAN DEFAULT FALSE
);

-- Add FK from customers to addresses now that addresses table exists
ALTER TABLE customers
  ADD CONSTRAINT fk_customers_default_address
  FOREIGN KEY (default_address_id) REFERENCES addresses(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS wishlist_items (
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (customer_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_addresses_customer ON addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_customer ON wishlist_items(customer_id);
