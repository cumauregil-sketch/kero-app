import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const rawBackend = process.env.RAILWAY_SERVICE_KERO_API_URL ?? 'kero-api-production.up.railway.app';
  const base = (rawBackend.startsWith('http') ? rawBackend : `https://${rawBackend}`).replace(/\/$/, '');
  try {
    const body = await request.json();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (typeof body.accessCode === 'string' && body.accessCode) headers['X-Kero-Access-Code'] = body.accessCode;
    const payload = JSON.stringify({ message: body.message, history: body.history || [] });

    let upstream = await fetch(`${base}/api/chat/stream`, {
      method: 'POST', headers, body: payload, cache: 'no-store', signal: request.signal,
    });
    // Safe rolling deploy: older API revisions only have the non-streaming endpoint.
    if (upstream.status === 404) {
      upstream = await fetch(`${base}/api/chat`, {
        method: 'POST', headers, body: payload, cache: 'no-store', signal: request.signal,
      });
    }
    if (!upstream.ok) {
      const data = await upstream.json().catch(() => ({ detail: 'Yapay zekâ yanıtı alınamadı.' }));
      return NextResponse.json(data, { status: upstream.status });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch {
    return NextResponse.json({ detail: 'Backend bağlantısı kurulamadı.' }, { status: 502 });
  }
}
