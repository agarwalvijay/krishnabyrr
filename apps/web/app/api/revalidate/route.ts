import crypto from 'crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET;

if (!REVALIDATE_SECRET) {
  console.warn('[revalidate] REVALIDATE_SECRET not set — all revalidation requests will return 401');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  const { secret } = await req.json().catch(() => ({})) as { secret?: string };

  if (!REVALIDATE_SECRET || !secret || !safeEqual(secret, REVALIDATE_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Purge all key storefront paths
  revalidatePath('/', 'layout');           // home + all nested layouts
  revalidatePath('/shop', 'page');
  revalidatePath('/shop/[slug]', 'page');
  revalidateTag('products');
  revalidateTag('collections');
  revalidateTag('categories');
  revalidateTag('homepage');

  return NextResponse.json({ revalidated: true, at: new Date().toISOString() });
}
