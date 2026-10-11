import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const rawBackend =
    process.env.RAILWAY_SERVICE_KERO_API_URL ??
    'kero-api-production.up.railway.app';

  const normalizedBackend =
    rawBackend.startsWith('http://') || rawBackend.startsWith('https://')
      ? rawBackend
      : `https://${rawBackend}`;

  const base = normalizedBackend.replace(/\/$/, '');

  try {
    const body = await request.json();
    const accessCode = typeof body.accessCode === 'string' ? body.accessCode : '';
    const response = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(accessCode ? { 'X-Kero-Access-Code': accessCode } : {}) },
      body: JSON.stringify({ message: body.message, history: body.history || [] }),
      cache: 'no-store',
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('KERO chat proxy error', error);
    return NextResponse.json(
      { detail: 'Backend bağlantısı kurulamadı.' },
      { status: 502 },
    );
  }
}
