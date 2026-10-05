import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const backend = process.env.RAILWAY_SERVICE_KERO_API_URL ?? process.env.NEXT_PUBLIC_API_URL;

  if (!backend) {
    return NextResponse.json({ reply: 'Backend adresi bulunamadı.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const base = backend.replace(/\/$/, '');
    const response = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ reply: 'Backend bağlantısı kurulamadı.' }, { status: 502 });
  }
}
