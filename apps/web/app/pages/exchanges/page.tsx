import { type Metadata } from 'next';
import PolicyPage from '@/app/components/PolicyPage';
import ExchangePolicyContent from '@/components/ui/ExchangePolicyContent';

export const metadata: Metadata = {
  title:       'Exchange Policy',
  description: "Krishna's Bliss exchange policy for Indian ethnic wear — what we accept, how to start an exchange, and shipping.",
};

export default function ExchangesPolicyPage() {
  return (
    <PolicyPage slug="exchanges" defaultTitle="Exchange Policy">
      <ExchangePolicyContent />
    </PolicyPage>
  );
}
