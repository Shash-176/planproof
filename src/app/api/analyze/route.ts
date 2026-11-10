import { NextResponse } from 'next/server';
import { handleAnalyze } from '@/lib/model/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: 'bad_request', message: 'Body must be JSON.' }, { status: 400 });
  }
  const clientKey = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
  const res = await handleAnalyze(body, { env: process.env, clientKey });
  return NextResponse.json(res.body, { status: res.status });
}
