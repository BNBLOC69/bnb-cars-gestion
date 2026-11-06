import { NextResponse, type NextRequest } from 'next/server';
import { caller, clientUrl, json, preflight } from '@/lib/api';
import { getStripe } from '@/lib/stripe';
import { db } from '@/lib/supabase/server';

export const OPTIONS = preflight;

async function session(bookingId: string, email: string | null | undefined, s: Awaited<ReturnType<typeof db>> | ReturnType<typeof Object>) {
  const stripe = getStripe();
  if (!stripe) return { error: 'Le paiement en ligne n\'est pas encore activé.', status: 503 } as const;
  const { data: d } = await s.from('finance_deposits').select('*').eq('booking_id', bookingId).maybeSingle();
  if (!d) return { error: 'Caution introuvable.', status: 404 } as const;
  if (d.status !== 'pending' || d.amount_cents <= 0) return { error: 'Cette caution n\'attend pas de préautorisation.', status: 409 } as const;
  const cs = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: email ?? undefined,
    locale: 'fr',
    // Préautorisation : la carte est réservée, pas débitée, 7 jours par défaut chez Stripe.
    // STRIPE_EXTENDED_AUTH=1 demande jusqu'à 30 jours : fonction réservée aux comptes Stripe éligibles.
    payment_intent_data: { capture_method: 'manual', metadata: { type: 'deposit', booking_id: bookingId } },
    ...(process.env.STRIPE_EXTENDED_AUTH === '1' ? { payment_method_options: { card: { request_extended_authorization: 'if_available' as const } } } : {}),
    line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: d.amount_cents, product_data: { name: `Caution, réservation ${d.booking_reference}` } } }],
    metadata: { type: 'deposit', booking_id: bookingId },
    success_url: `${clientUrl()}/paiement?status=ok&deposit=1&booking=${bookingId}`,
    cancel_url: `${clientUrl()}/paiement?status=cancel&deposit=1&booking=${bookingId}`,
  });
  return { url: cs.url } as const;
}

/** Client depuis l'application. */
export async function POST(req: NextRequest) {
  const c = await caller(req);
  if (!c) return json(req, { error: 'Connectez-vous pour continuer.' }, 401);
  const { booking_id } = await req.json();
  const r = await session(booking_id, c.user.email, c.s);
  return 'error' in r ? json(req, { error: r.error }, r.status) : json(req, { url: r.url });
}

/** Agent depuis la fiche réservation, sur la tablette présentée au client. */
export async function GET(req: NextRequest) {
  const s = await db();
  const id = req.nextUrl.searchParams.get('booking');
  const { data: b } = await s.from('booking_details').select('customer_email').eq('id', id).maybeSingle();
  if (!b) return NextResponse.json({ error: 'Réservation introuvable.' }, { status: 404 });
  const r = await session(id!, b.customer_email, s);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.redirect(r.url!, 303);
}
