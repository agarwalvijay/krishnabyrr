import { type Metadata } from 'next';
import PolicyPage from '@/app/components/PolicyPage';

export const metadata: Metadata = {
  title:       'Privacy Policy',
  description: "How Krishna's Bliss collects, uses, and protects your personal information.",
};

export default function PrivacyPage() {
  return (
    <PolicyPage slug="privacy" defaultTitle="Privacy Policy">
      <p className="text-xs text-gray-400 mb-6">Last updated: April 2025</p>

      <p>
        Krishna&apos;s Bliss (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) is committed to protecting
        your personal information. This policy explains what we collect, why we collect it, and how we use it.
      </p>

      <h2>1. Information We Collect</h2>
      <ul>
        <li>
          <strong>Account information:</strong> Name, email address, and password when you create an account.
        </li>
        <li>
          <strong>Order information:</strong> Shipping address, phone number, and GSTIN (if provided) when you
          place an order.
        </li>
        <li>
          <strong>Payment information:</strong> Payments are processed by Razorpay or PhonePe. We do not receive
          or store your card number, UPI ID, or other sensitive payment credentials.
        </li>
        <li>
          <strong>Usage data:</strong> Browser type, pages visited, and time spent on our site via analytics
          tools (e.g., Google Analytics) to improve our service.
        </li>
        <li>
          <strong>Communications:</strong> Messages you send us via email or WhatsApp.
        </li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <ul>
        <li>To process and fulfil your orders</li>
        <li>To send order confirmations and shipping updates</li>
        <li>To respond to your enquiries and provide customer support</li>
        <li>To send promotional communications if you have opted in</li>
        <li>To improve our website and product offerings</li>
        <li>To comply with legal obligations</li>
      </ul>

      <h2>3. Sharing Your Information</h2>
      <p>We do not sell or rent your personal information. We share it only with:</p>
      <ul>
        <li>
          <strong>Payment processors</strong> (Razorpay, PhonePe) to facilitate secure payments
        </li>
        <li>
          <strong>Courier partners</strong> to deliver your orders
        </li>
        <li>
          <strong>Analytics providers</strong> (e.g., Google Analytics) in anonymised or aggregated form
        </li>
        <li>
          <strong>Law enforcement or regulators</strong> where required by law
        </li>
      </ul>

      <h2>4. Data Retention</h2>
      <p>
        We retain your order and account information for as long as necessary to fulfil our contractual and
        legal obligations, typically up to 7 years for financial records as required under Indian tax law.
      </p>

      <h2>5. Your Rights</h2>
      <p>You may at any time:</p>
      <ul>
        <li>Request a copy of the personal data we hold about you</li>
        <li>Ask us to correct inaccurate information</li>
        <li>Opt out of marketing communications by emailing us or clicking the unsubscribe link</li>
        <li>Request deletion of your account (subject to legal retention obligations)</li>
      </ul>

      <h2>6. Cookies</h2>
      <p>
        We use cookies to maintain your session, remember your cart, and analyse site traffic. You can disable
        cookies in your browser settings, though some features may not function correctly.
      </p>

      <h2>7. Security</h2>
      <p>
        We use industry-standard security measures to protect your information. All payment transactions are
        encrypted using TLS. However, no transmission over the internet is 100% secure.
      </p>

      <h2>8. Third-Party Links</h2>
      <p>
        Our website may contain links to third-party sites. We are not responsible for their privacy practices
        and encourage you to read their policies separately.
      </p>

      <h2>9. Changes to This Policy</h2>
      <p>
        We may update this policy from time to time. The latest version will always be available on this page
        with the date of last revision.
      </p>

      <h2>10. Contact Us</h2>
      <p>
        For any privacy-related queries, please contact:{' '}
        <strong>care@krishnabyrr.com</strong> or call <strong>+91 80766 64500</strong>.
      </p>
    </PolicyPage>
  );
}
