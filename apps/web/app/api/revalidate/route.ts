import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET;

export async function POST(req: NextRequest) {
  const { secret } = await req.json().catch(() => ({})) as { secret?: string };

  if (!REVALIDATE_SECRET || secret !== REVALIDATE_SECRET) {
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
