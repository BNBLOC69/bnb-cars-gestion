import type { NextRequest } from 'next/server';
import { caller, clientUrl, json, preflight } from '@/lib/api';
import { getStripe } from '@/lib/stripe';

export const OPTIONS = preflight;

export async function POST(req: NextRequest) {
  const c = await caller(req);
  if (!c) return json(req, { error: 'Connectez-vous pour offrir une carte.' }, 401);
  const stripe = getStripe();
  if (!stripe) return json(req, { error: 'L\'achat en ligne n\'est pas encore activé.' }, 503);
  const { amount_cents, recipient_email, message } = await req.json();
  const amount = Number(amount_cents);
  if (!Number.isInteger(amount) || amount < 2000 || amount > 500000) return json(req, { error: 'Choisissez un montant entre 20 € et 5 000 €.' }, 400);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: c.user.email,
    locale: 'fr',
    line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: amount, product_data: { name: 'Carte cadeau BNB Cars' } } }],
    metadata: { type: 'gift_card', user_id: c.user.id, recipient_email: String(recipient_email ?? '').slice(0, 200), message: String(message ?? '').slice(0, 400) },
    success_url: `${clientUrl()}/paiement?status=ok&gift=1`,
    cancel_url: `${clientUrl()}/paiement?status=cancel&gift=1`,
  });
  return json(req, { url: session.url });
}
