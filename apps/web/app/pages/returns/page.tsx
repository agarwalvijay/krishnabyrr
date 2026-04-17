import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Return Policy',
};

// Return policy redirects to refund policy — they are the same document.
export default function ReturnsPage() {
  redirect('/pages/refund');
}
