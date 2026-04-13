// Delhi NCR pincode prefixes (3-digit)
export const DELHI_NCR_PINCODE_PREFIXES: readonly string[] = [
  '110', '111', '112', // Delhi
  '122', '123', '124', // Gurugram / Faridabad (Haryana, NCR)
  '201', '202', '203', '204', '205', '206', '207', '208', // Noida / Ghaziabad (UP, NCR)
];

/** Returns true if the given pincode belongs to Delhi NCR */
export function isDelNcrPincode(pincode: string): boolean {
  const cleaned = pincode.replace(/\D/g, '');
  if (cleaned.length !== 6) return false;
  return DELHI_NCR_PINCODE_PREFIXES.some((prefix) => cleaned.startsWith(prefix));
}

export type ShippingZone = 'A' | 'B';

/** Zone A = Delhi NCR, Zone B = rest of India */
export function getShippingZone(pincode: string): ShippingZone {
  return isDelNcrPincode(pincode) ? 'A' : 'B';
}
