import { sendOwnerNewOrder } from './whatsapp';

interface OrderNotificationParams {
  orderNumber:     string;
  total:           number;
  itemCount:       number;
  itemNames:       string[];
  customerName:    string;
  customerContact: string; // email or phone
  pincode:         string;
  paymentMethod:   string; // 'razorpay' | 'phonepe' | 'manual'
}

export function notifyNewOrder(params: OrderNotificationParams): void {
  const paymentLabel =
    params.paymentMethod === 'razorpay' ? 'Paid (Razorpay)' :
    params.paymentMethod === 'phonepe'  ? 'Paid (PhonePe)'  :
    'Pending payment';

  const itemSummary =
    params.itemNames.slice(0, 3).join(', ') +
    (params.itemNames.length > 3 ? ` +${params.itemNames.length - 3} more` : '');

  sendOwnerNewOrder({
    orderNumber:     params.orderNumber,
    total:           params.total,
    itemCount:       params.itemCount,
    itemSummary,
    customerName:    params.customerName,
    customerContact: params.customerContact,
    pincode:         params.pincode,
    paymentLabel,
  });
}
