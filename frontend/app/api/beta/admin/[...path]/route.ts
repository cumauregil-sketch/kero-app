import { NextRequest, NextResponse } from 'next/server';

type Params = { params: Promise<{ path: string[] }> };

const GET_ALLOWED = new Set(['status', 'invitations']);
const POST_ALLOWED = new Set(['invitations']);

async function proxy(request: NextRequest, { params }: Params, method: 'GET' | 'POST') {
  const { path } = await params;
  const route = path.join('/');
  const allowed = method === 'GET'
    ? GET_ALLOWED.has(route)
    : (POST_ALLOWED.has(route) || /^invitations\/[1-9]\d*\/revoke$/.test(route));

  if (!allowed) return NextResponse.json({ detail: 'İşlem bulunamadı.' }, { status: 404 });

  const raw = process.env.RAILWAY_SERVICE_KERO_API_URL ?? 'kero-api-production.up.railway.app';
  const backend = (raw.startsWith('https://') || raw.startsWith('http://') ? raw : `https://${raw}`).replace(/\/$/, '');
  const ownerToken = request.headers.get('x-kero-beta-admin-token') || '';
  if (!ownerToken) return NextResponse.json({ detail: 'Yönetici doğrulaması gerekli.' }, { status: 401 });

  try {
    const payload = method === 'POST' && route === 'invitations'
      ? JSON.stringify(await request.json())
      : undefined;

    const response = await fetch(`${backend}/api/beta/admin/${route}`, {
      method,
      headers: {
        'X-Kero-Beta-Admin-Token': ownerToken,
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
      },
      body: payload,
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ detail: 'Yönetici servisine ulaşılamadı.' }, {
      status: 502, headers: { 'Cache-Control': 'no-store' },
    });
  }
}

export async function GET(request: NextRequest, context: Params) {
  return proxy(request, context, 'GET');
}

export async function POST(request: NextRequest, context: Params) {
  return proxy(request, context, 'POST');
}
