import { z } from 'zod';

export const AddressSchema = z.object({
  name: z.string().min(1),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number'),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().regex(/^\d{6}$/, 'Invalid pincode'),
  country: z.string().default('India'),
});

export const CreateOrderSchema = z.object({
  line_items: z.array(z.object({
    product_id: z.string().uuid(),
    qty: z.number().int().min(1),
  })).min(1),
  shipping_address: AddressSchema,
  coupon_code: z.string().optional(),
  billing_gstin: z.string().optional(),
  guest_email: z.string().email().optional(),
  guest_phone: z.string().optional(),
});

export const CouponSchema = z.object({
  code: z.string().min(1).max(50).toUpperCase(),
  description: z.string().optional(),
  type: z.enum(['percentage', 'fixed_amount', 'free_shipping']),
  value: z.number().positive().optional(),
  valid_from: z.string().datetime().optional(),
  valid_until: z.string().datetime().optional(),
  max_uses_total: z.number().int().positive().optional(),
  max_uses_per_customer: z.number().int().positive().default(1),
  min_order_value: z.number().positive().optional(),
  max_discount_cap: z.number().positive().optional(),
  is_public: z.boolean().default(true),
  auto_apply: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

export const ProductSchema = z.object({
  name: z.string().min(1).max(255),
  // slug and sku are auto-generated server-side if not provided
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/).optional(),
  sku: z.string().min(1).max(100).optional(),
  short_desc: z.string().optional(),
  description: z.string().optional(),
  care_instr: z.string().optional(),
  mrp: z.number().positive(),
  sale_price: z.number().positive().optional(),
  cost_price: z.number().positive().optional(),
  gst_rate: z.number().min(0).max(28).default(5),
  hsn_code: z.string().optional(),
  stock_qty: z.number().int().min(0).max(4).default(0),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
});
