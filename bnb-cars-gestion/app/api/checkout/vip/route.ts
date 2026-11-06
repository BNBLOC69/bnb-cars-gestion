import type { NextRequest } from 'next/server';
import { caller, clientUrl, json, preflight } from '@/lib/api';
import { getStripe } from '@/lib/stripe';
import { dbService } from '@/lib/supabase/server';

export const OPTIONS = preflight;

/** Le prix se règle dans l'administration. Si le tarif a changé, une nouvelle Price Stripe est créée automatiquement. */
async function priceFor(plan: { id: string; code: string; name: string; price_cents: number; stripe_price_id: string | null; stripe_price_for_cents: number | null }) {
  const stripe = getStripe()!;
  if (plan.stripe_price_id && plan.stripe_price_for_cents === plan.price_cents) return plan.stripe_price_id;
  const price = await stripe.prices.create({
    currency: 'eur', unit_amount: plan.price_cents,
    recurring: { interval: plan.code === 'annual' ? 'year' : 'month' },
    product_data: { name: plan.name },
  });
  await dbService().from('vip_plans').update({ stripe_price_id: price.id, stripe_price_for_cents: plan.price_cents }).eq('id', plan.id);
  return price.id;
}

export async function POST(req: NextRequest) {
  const c = await caller(req);
  if (!c) return json(req, { error: 'Connectez-vous pour devenir membre.' }, 401);
  const stripe = getStripe();
  if (!stripe) return json(req, { error: 'L\'abonnement en ligne n\'est pas encore activé.' }, 503);
  const { plan: code } = await req.json();
  const sv = dbService();
  const { data: plan } = await sv.from('vip_plans').select('*').eq('code', code).eq('is_active', true).maybeSingle();
  if (!plan) return json(req, { error: 'Cette formule n\'est pas disponible.' }, 404);
  const { data: isVip } = await sv.rpc('user_is_vip', { uid: c.user.id });
  if (isVip) return json(req, { error: 'Vous êtes déjà membre du Club VIP.' }, 409);

  const { data: prof } = await sv.from('profiles').select('stripe_customer_id,email,first_name,last_name').eq('id', c.user.id).single();
  let customer = prof?.stripe_customer_id as string | null;
  if (!customer) {
    const created = await stripe.customers.create({ email: prof?.email ?? c.user.email, name: `${prof?.first_name ?? ''} ${prof?.last_name ?? ''}`.trim(), metadata: { user_id: c.user.id } });
    customer = created.id;
    await sv.from('profiles').update({ stripe_customer_id: customer }).eq('id', c.user.id);
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    locale: 'fr',
    line_items: [{ price: await priceFor(plan), quantity: 1 }],
    metadata: { type: 'vip', user_id: c.user.id, plan: plan.code },
    subscription_data: { metadata: { user_id: c.user.id, plan: plan.code } },
    success_url: `${clientUrl()}/paiement?status=ok&vip=1`,
    cancel_url: `${clientUrl()}/paiement?status=cancel&vip=1`,
  });
  return json(req, { url: session.url });
}
