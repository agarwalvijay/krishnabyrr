import axios from 'axios';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProductImage {
  id: string;
  gcs_path: string;
  alt_text: string | null;
  display_order?: number;
  is_primary?: boolean;
}

export interface TagItem {
  id: string;
  group_name: string;
  value: string;
  hex_color: string | null;
}

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  description?: string | null;
  banner_img?: string | null;
  nav_order?: number;
  is_active?: boolean;
  children?: CategoryItem[];
  product_count?: number;
}

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  sku: string;
  short_desc: string | null;
  mrp: number;
  sale_price: number | null;
  gst_rate: number;
  stock_qty: number;
  status: string;
  primary_image: ProductImage | null;
  second_image:  ProductImage | null;
  tags: TagItem[];
  created_at: string;
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  sku: string;
  short_desc:  string | null;
  description: string | null;
  care_instr:  string | null;
  mrp:         number;
  sale_price:  number | null;
  gst_rate:    number;
  hsn_code:    string | null;
  stock_qty:   number;
  low_stock_threshold: number;
  oos_behavior: string;
  video_url:   string | null;
  meta_title:  string | null;
  meta_desc:   string | null;
  status:      string;
  images:      ProductImage[];
  tags:        Record<string, TagItem[]>;
  categories:  CategoryItem[];
  related_similar: ProductListItem[];
  related_look:    ProductListItem[];
}

export interface PublicSettings {
  store_name?: string;
  whatsapp_number?: string;
  exchange_window_days?: string;
  zone_a_rate?: string;
  zone_b_rate?: string;
  zone_a_free_above?: string;
  zone_b_free_above?: string;
  exchange_active?: string;
  support_email?: string;
  ga_tag?: string;
}

export interface CartItem {
  id:           string;
  productId:    string;
  name:         string;
  slug:         string;
  sku:          string;
  mrp:          number;
  salePrice:    number | null;
  primaryImage: string | null;
  stockQty:     number;
  quantity:     number;
  maxQty:       number;
}

export interface CouponSnapshot {
  code:            string;
  type:            string;
  discount_amount: number;
  description?:   string;
}

export interface CartData {
  sessionId:  string;
  customerId: string | null;
  items:      CartItem[];
  couponCode: string | null;
  couponData: CouponSnapshot | null;
  pincode:    string | null;
  zone:       'A' | 'B' | null;
  updatedAt:  string;
}

export interface CartTotals {
  subtotal:       number;
  discountAmount: number;
  shipping:       number;
  gst:            number;
  total:          number;
}

export interface ApiMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface Customer {
  id:             string;
  email:          string | null;
  name:           string;
  phone:          string | null;
  total_orders:   number;
  lifetime_value: string;
  created_at:     string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const DEFAULT_API_ORIGIN = 'http://localhost:3001';
const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_ORIGIN ??
  process.env.API_ORIGIN ??
  DEFAULT_API_ORIGIN;

/** Convert a DB gcs_path to a displayable URL. */
export function imageUrl(gcsPath: string | null | undefined): string {
  if (!gcsPath) return '';
  if (gcsPath.startsWith('http://') || gcsPath.startsWith('https://')) return gcsPath;
  if (gcsPath.startsWith('/uploads/')) return `${API_ORIGIN}${gcsPath}`;
  if (gcsPath.startsWith('uploads/')) return `${API_ORIGIN}/${gcsPath}`;
  // Local dev path like /tmp/kb_uploads/uuid.jpg
  const filename = gcsPath.split('/').pop() ?? '';
  return `${API_ORIGIN}/uploads/${filename}`;
}

/** Format a number as Indian rupees: ₹1,23,456 */
export function formatINR(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}

/** Discount percentage, rounded */
export function discountPct(mrp: number, salePrice: number): number {
  if (mrp <= 0) return 0;
  return Math.round(((mrp - salePrice) / mrp) * 100);
}

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export function getStockStatus(qty: number): StockStatus {
  if (qty === 0) return 'out_of_stock';
  if (qty <= 3)  return 'low_stock';
  return 'in_stock';
}

// ── Server-side fetch helpers ──────────────────────────────────────────────────

/** Fetch with ISR revalidation (default 1 hour) */
export async function serverFetch<T>(
  path: string,
  options: { revalidate?: number; noStore?: boolean } = {}
): Promise<T> {
  const url = `${API_ORIGIN}${path}`;
  const nextOpts = options.noStore
    ? { cache: 'no-store' as const }
    : { next: { revalidate: options.revalidate ?? 3600 } };

  const res = await fetch(url, nextOpts);
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${path}`);
  }
  const json = await res.json();
  return json.data ?? json;
}

/** Fetch a list (returns { data, meta }) */
export async function serverFetchList<T>(
  path: string,
  options: { revalidate?: number; noStore?: boolean } = {}
): Promise<{ data: T[]; meta: ApiMeta }> {
  const url = `${API_ORIGIN}${path}`;
  const nextOpts = options.noStore
    ? { cache: 'no-store' as const }
    : { next: { revalidate: options.revalidate ?? 3600 } };

  const res = await fetch(url, nextOpts);
  if (!res.ok) {
    return { data: [], meta: { total: 0, page: 1, limit: 24, pages: 0 } };
  }
  return res.json();
}

// ── Client-side axios instance ─────────────────────────────────────────────────

export const apiClient = axios.create({
  baseURL:         '/api',
  withCredentials: true,
});

// Attach customer JWT if present in localStorage
if (typeof window !== 'undefined') {
  apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('kb_customer_token');
    if (token) {
      config.headers = config.headers ?? {};
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  });
}
