import type { NextRequest } from 'next/server';
import { caller, clientUrl, json, preflight } from '@/lib/api';
import { getStripe } from '@/lib/stripe';

export const OPTIONS = preflight;

// Le montant vient de la base, jamais de la requête.
export async function POST(req: NextRequest) {
  const c = await caller(req);
  if (!c) return json(req, { error: 'Connectez-vous pour continuer.' }, 401);
  const stripe = getStripe();
  if (!stripe) return json(req, { error: 'Le paiement en ligne n\'est pas encore activé. L\'agence vous contactera.' }, 503);
  const { booking_id } = await req.json();
  const { data: b } = await c.s.from('booking_details').select('*').eq('id', booking_id).eq('customer_id', c.user.id).maybeSingle();
  if (!b) return json(req, { error: 'Réservation introuvable.' }, 404);
  if (!['pending_payment', 'confirmed'].includes(b.status)) return json(req, { error: 'Cette réservation ne peut pas être réglée.' }, 409);
  const due = b.upfront_cents - b.paid_cents;
  if (due <= 0) return json(req, { error: 'Rien à régler pour le moment.' }, 409);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: c.user.email,
    locale: 'fr',
    line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: due, product_data: { name: `Location ${b.vehicle_name}`, description: `Réservation ${b.reference}` } } }],
    metadata: { type: 'booking', booking_id: b.id },
    payment_intent_data: { metadata: { type: 'booking', booking_id: b.id } },
    success_url: `${clientUrl()}/paiement?status=ok&booking=${b.id}`,
    cancel_url: `${clientUrl()}/paiement?status=cancel&booking=${b.id}`,
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
  }, { idempotencyKey: `booking-${b.id}-${due}-${Math.floor(Date.now() / 600000)}` });
  return json(req, { url: session.url });
}
