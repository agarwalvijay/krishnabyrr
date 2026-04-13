/** Format a number as Indian Rupees */
export function formatINR(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(n)) return '—';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Discount percentage: (mrp - sale_price) / mrp * 100 */
export function discountPct(mrp: number, salePrice: number): number {
  if (!mrp || !salePrice || salePrice >= mrp) return 0;
  return Math.round(((mrp - salePrice) / mrp) * 100);
}

/** Stock colour class */
export function stockColorClass(qty: number): 'stock-high' | 'stock-low' | 'stock-zero' {
  if (qty === 0) return 'stock-zero';
  if (qty <= 3) return 'stock-low';
  return 'stock-high';
}

/** Stock display label */
export function stockLabel(qty: number): string {
  if (qty === 0) return 'Sold Out';
  if (qty <= 3) return `Only ${qty} left!`;
  return String(qty);
}

/** Role display names */
export const ROLE_LABELS: Record<string, string> = {
  super_admin:      'Super Admin',
  catalog_manager:  'Catalog',
  order_manager:    'Orders',
};
