import { NextResponse } from 'next/server';
import { aiStatus, handleAnalyze } from '@/lib/ai/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BODY_BYTES = 64_000;

/** Whether AI analysis is available, and with which models. No secrets. */
export async function GET() {
  return NextResponse.json(aiStatus(process.env), { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request) {
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, code: 'bad_request', message: 'Request is too large.' }, { status: 413 });
  }
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, code: 'bad_request', message: 'Request is too large.' }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, code: 'bad_request', message: 'Body must be JSON.' }, { status: 400 });
  }
  const clientKey = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const res = await handleAnalyze(body, {
    env: process.env,
    clientKey,
    origin: req.headers.get('origin'),
    host: req.headers.get('x-forwarded-host') ?? req.headers.get('host'),
    log: (m) => console.warn(`[analyze] ${m}`),
  });
  return NextResponse.json(res.body, { status: res.status, headers: { 'cache-control': 'no-store' } });
}
