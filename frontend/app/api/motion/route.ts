import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const motionUrl = process.env.NEXT_PUBLIC_KERO_MOTION_URL;

  if (!motionUrl) {
    return new NextResponse('KERO motion asset is not configured.', { status: 404 });
  }

  return NextResponse.redirect(motionUrl, 307);
}
