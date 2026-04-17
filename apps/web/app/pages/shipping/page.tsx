import { type Metadata } from 'next';
import PolicyPage from '@/app/components/PolicyPage';

export const metadata: Metadata = {
  title:       'Shipping Policy',
  description: "Shipping rates, delivery timelines, and coverage for Krishna's Bliss orders.",
};

export default function ShippingPage() {
  return (
    <PolicyPage slug="shipping" defaultTitle="Shipping Policy">
      <p className="text-xs text-gray-400 mb-6">Last updated: April 2025</p>

      <p>
        We ship all orders within India. Here is everything you need to know about how we deliver
        your Krishna&apos;s Bliss purchase.
      </p>

      <h2>Shipping Coverage</h2>
      <p>
        We currently ship to all serviceable PIN codes within India. We do not offer international shipping
        at this time.
      </p>

      <h2>Order Processing</h2>
      <p>
        Orders are processed on business days (Monday to Saturday, excluding national holidays). Orders
        placed before 12:00 PM are typically dispatched the same day; orders placed after 12:00 PM are
        dispatched the next business day.
      </p>

      <h2>Shipping Rates</h2>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Zone</th>
            <th style={{ textAlign: 'left' }}>Coverage</th>
            <th style={{ textAlign: 'left' }}>Rate</th>
            <th style={{ textAlign: 'left' }}>Free Above</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Zone A</td>
            <td>Delhi NCR (Delhi, Noida, Gurgaon, Faridabad, Ghaziabad)</td>
            <td>₹80</td>
            <td>₹999</td>
          </tr>
          <tr>
            <td>Zone B</td>
            <td>Rest of India</td>
            <td>₹120</td>
            <td>₹1,499</td>
          </tr>
        </tbody>
      </table>
      <p>Free shipping thresholds apply to the order value after any coupon discounts.</p>

      <h2>Estimated Delivery Time</h2>
      <ul>
        <li><strong>Zone A (Delhi NCR):</strong> 1–3 business days after dispatch</li>
        <li><strong>Zone B (Rest of India):</strong> 3–7 business days after dispatch</li>
      </ul>
      <p>
        Delivery timelines are estimates and may vary during peak seasons, public holidays, or due to
        courier partner delays beyond our control.
      </p>

      <h2>Order Tracking</h2>
      <p>
        Once your order is dispatched, you will receive an email or WhatsApp message with the courier
        name and tracking number. You can use this to track your shipment directly on the courier&apos;s website.
      </p>

      <h2>Damaged or Lost Shipments</h2>
      <p>
        If your order arrives damaged or is lost in transit, please contact us within <strong>48 hours</strong>{' '}
        of the expected delivery date at <strong>care@krishnasbliss.com</strong>. We will coordinate with
        the courier and, where applicable, arrange a replacement or refund as per our{' '}
        <a href="/pages/refund">Refund &amp; Exchange Policy</a>.
      </p>

      <h2>Address Accuracy</h2>
      <p>
        Please ensure your shipping address, PIN code, and phone number are correct at checkout. We are not
        responsible for delays or non-delivery caused by an incorrect or incomplete address.
      </p>

      <h2>Contact Us</h2>
      <p>
        For shipping queries, email <strong>care@krishnasbliss.com</strong> or WhatsApp us at{' '}
        <strong>+91 80766 64500</strong>.
      </p>
    </PolicyPage>
  );
}
