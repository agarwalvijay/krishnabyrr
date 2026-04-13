// Core domain types for KrishnaByrr

export type ProductStatus = 'draft' | 'active' | 'archived';
export type OosBehavior = 'show_sold_out' | 'hide';
export type PaymentStatus = 'pending_confirmation' | 'confirmed' | 'failed' | 'refunded';
export type FulfillmentStatus = 'unfulfilled' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type ExchangeStatus = 'requested' | 'approved' | 'rejected' | 'completed';
export type CouponType = 'percentage' | 'fixed_amount' | 'free_shipping';
export type CouponAppliesTo = 'ALL' | 'CATEGORY' | 'COLLECTION';
export type CustomerEligibility = 'ALL' | 'SPECIFIC' | 'NEW_ONLY';
export type AdminRole = 'super_admin' | 'catalog_manager' | 'order_manager';
export type TagGroup = 'fabric' | 'weave' | 'occasion' | 'color';
export type InventoryChangeType =
  | 'order_placed'
  | 'order_cancelled'
  | 'manual_adjustment'
  | 'exchange_return'
  | 'exchange_dispatch';

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  short_desc?: string;
  description?: string;
  care_instr?: string;
  mrp: number;
  sale_price?: number;
  cost_price?: number;
  gst_rate: number;
  hsn_code?: string;
  track_inventory: boolean;
  stock_qty: number;
  low_stock_threshold: number;
  oos_behavior: OosBehavior;
  video_url?: string;
  meta_title?: string;
  meta_desc?: string;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  gcs_path?: string;
  alt_text?: string;
  display_order: number;
  is_primary: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id?: string;
  description?: string;
  banner_img?: string;
  meta_title?: string;
  meta_desc?: string;
  nav_order: number;
  is_active: boolean;
}

export interface Tag {
  id: string;
  group_name: TagGroup;
  value: string;
  hex_color?: string;
}

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description?: string;
  banner_img?: string;
  tagline?: string;
  is_homepage: boolean;
  homepage_order: number;
  is_active: boolean;
}

export interface Customer {
  id: string;
  email: string;
  phone?: string;
  name?: string;
  email_verified: boolean;
  default_address_id?: string;
  total_orders: number;
  lifetime_value: number;
  marketing_email: boolean;
  marketing_whatsapp: boolean;
  created_at: string;
  updated_at: string;
}

export interface Address {
  id: string;
  customer_id: string;
  name?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country: string;
  is_default: boolean;
}

export interface OrderLineItem {
  product_id: string;
  sku: string;
  name: string;
  mrp: number;
  sale_price: number;
  gst_rate: number;
  qty: number;
  line_total: number;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id?: string;
  guest_email?: string;
  guest_phone?: string;
  line_items: OrderLineItem[];
  subtotal: number;
  discount_amount: number;
  coupon_code?: string;
  shipping_amount: number;
  gst_amount: number;
  total: number;
  shipping_address: Address;
  billing_gstin?: string;
  payment_status: PaymentStatus;
  payment_method?: string;
  fulfillment_status: FulfillmentStatus;
  courier_name?: string;
  tracking_number?: string;
  tracking_url?: string;
  fulfilled_at?: string;
  exchange_eligible_until?: string;
  policy_snapshot: PolicySnapshot;
  admin_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PolicySnapshot {
  exchange_window_days: number;
  zone_a_rate: number;
  zone_a_free_above: number;
  zone_b_rate: number;
  zone_b_free_above: number;
}

export interface Coupon {
  id: string;
  code: string;
  description?: string;
  type: CouponType;
  value?: number;
  valid_from?: string;
  valid_until?: string;
  max_uses_total?: number;
  max_uses_per_customer: number;
  current_use_count: number;
  min_order_value?: number;
  max_discount_cap?: number;
  applies_to: CouponAppliesTo;
  category_ids?: string[];
  collection_ids?: string[];
  customer_eligibility: CustomerEligibility;
  customer_ids?: string[];
  is_public: boolean;
  auto_apply: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  is_active: boolean;
  last_login?: string;
  created_at: string;
}

export interface Setting {
  key: string;
  value: unknown;
  updated_at: string;
}
