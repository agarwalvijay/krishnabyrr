-- 003_orders.sql
-- Tables: orders, exchange_requests, inventory_log

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(20) UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id),
  guest_email VARCHAR(255),
  guest_phone VARCHAR(20),
  line_items JSONB NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  coupon_code VARCHAR(50),
  shipping_amount DECIMAL(10,2) DEFAULT 0,
  gst_amount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  shipping_address JSONB NOT NULL,
  billing_gstin VARCHAR(20),
  payment_status VARCHAR(20) DEFAULT 'pending_confirmation',
  payment_method VARCHAR(50),
  fulfillment_status VARCHAR(20) DEFAULT 'unfulfilled',
  courier_name VARCHAR(100),
  tracking_number VARCHAR(100),
  tracking_url VARCHAR(500),
  fulfilled_at TIMESTAMPTZ,
  exchange_eligible_until TIMESTAMPTZ,
  policy_snapshot JSONB NOT NULL DEFAULT '{}',
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exchange_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_number VARCHAR(20) UNIQUE NOT NULL,
  order_id UUID REFERENCES orders(id),
  customer_id UUID REFERENCES customers(id),
  items JSONB NOT NULL,
  reason VARCHAR(50) NOT NULL,
  customer_notes TEXT,
  status VARCHAR(30) DEFAULT 'requested',
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id),
  change_type VARCHAR(30) NOT NULL,
  qty_before INTEGER NOT NULL,
  qty_change INTEGER NOT NULL,
  qty_after INTEGER NOT NULL,
  reason TEXT,
  order_id UUID REFERENCES orders(id),
  admin_user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment ON orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_requests_order ON exchange_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_exchange_requests_customer ON exchange_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_inventory_log_product ON inventory_log(product_id);
