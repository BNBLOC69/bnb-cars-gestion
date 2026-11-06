import { NextResponse, type NextRequest } from 'next/server';
import { dbForToken } from './supabase/server';

const allowed = () => (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
export function cors(req: NextRequest) {
  const origin = req.headers.get('origin');
  const h: Record<string, string> = { 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', Vary: 'Origin' };
  if (origin && allowed().includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
export const preflight = (req: NextRequest) => new NextResponse(null, { status: 204, headers: cors(req) });
export const json = (req: NextRequest, body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors(req) });

/** Identifie l'appelant par son jeton Supabase. */
export async function caller(req: NextRequest) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const s = dbForToken(token);
  const { data: { user } } = await s.auth.getUser(token);
  return user ? { user, s } : null;
}
export const clientUrl = () => process.env.CLIENT_APP_URL || process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:8081';
