// GST rates applicable to textiles/ethnic wear in India
export const GST_RATES = {
  FIVE_PERCENT: 5.00,    // Fabrics ≤ ₹1000/piece
  TWELVE_PERCENT: 12.00, // Fabrics > ₹1000/piece
} as const;

export const DEFAULT_HSN_CODE = '5208'; // Cotton woven fabrics
