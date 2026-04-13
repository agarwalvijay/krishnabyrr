export const SHIPPING_ZONES = {
  ZONE_A: 'zone_a', // Delhi NCR
  ZONE_B: 'zone_b', // Rest of India
} as const;

export const DELHI_NCR_STATES = ['Delhi'] as const;

export const DELHI_NCR_PINCODES_PREFIX = [
  '110', '111', '112', // Delhi
  '122', '123', '124', // Gurugram/Faridabad (Haryana, NCR)
  '201', '202', '203', '204', '205', '206', '207', '208', // Noida/Ghaziabad (UP, NCR)
] as const;
