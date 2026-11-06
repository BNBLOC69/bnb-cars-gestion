import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { dbService } from '@/lib/supabase/server';

const iso = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);
const must = <T,>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };

function vipStatus(sub: Stripe.Subscription) {
  switch (sub.status) {
    case 'active': case 'trialing': return 'active';
    case 'past_due': case 'unpaid': case 'incomplete': return 'past_due';
    default: return 'canceled';
  }
}
function periodEnd(sub: Stripe.Subscription) {
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  return iso(sub.items?.data?.[0]?.current_period_end ?? legacy);
}

async function syncSubscription(sub: Stripe.Subscription) {
  const sv = dbService();
  let uid = sub.metadata?.user_id;
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  if (!uid) {
    const { data } = await sv.from('profiles').select('id').eq('stripe_customer_id', customer).maybeSingle();
    uid = data?.id;
  }
  if (!uid) throw new Error(`Abonné introuvable pour ${sub.id}`);
  must(await sv.rpc('stripe_activate_vip', {
    uid, plan: sub.metadata?.plan ?? null, sub_id: sub.id, cust_id: customer,
    period_end: periodEnd(sub), st: vipStatus(sub), cancel_at_end: sub.cancel_at_period_end || !!sub.cancel_at,
  }));
}

async function handle(event: Stripe.Event) {
  const sv = dbService();
  const stripe = getStripe()!;
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const s = event.data.object as Stripe.Checkout.Session;
      const type = s.metadata?.type;
      const pi = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null;
      if (s.mode !== 'subscription' && s.payment_status === 'unpaid' && type !== 'deposit') return;
      if (type === 'booking') {
        must(await sv.rpc('stripe_record_booking_payment', { booking: s.metadata!.booking_id, session_id: s.id, intent_id: pi, amount: s.amount_total }));
      } else if (type === 'deposit') {
        // La date limite réelle dépend de la carte : Stripe la donne dans capture_before.
        let expires = new Date(Date.now() + 7 * 864e5).toISOString();
        if (pi) {
          const intent = await stripe.paymentIntents.retrieve(pi, { expand: ['latest_charge'] });
          const before = (intent.latest_charge as Stripe.Charge | null)?.payment_method_details?.card?.capture_before;
          if (before) expires = new Date(before * 1000).toISOString();
        }
        must(await sv.from('deposits').update({ status: 'authorized', method: 'stripe', stripe_payment_intent_id: pi, stripe_checkout_session_id: s.id, authorized_at: new Date().toISOString(), expires_at: expires }).eq('booking_id', s.metadata!.booking_id).eq('status', 'pending'));
      } else if (type === 'gift_card') {
        const code = 'CADEAU' + crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
        const { data: dup } = await sv.from('gift_cards').select('id').eq('stripe_session_id', s.id).maybeSingle();
        if (dup) return;
        must(await sv.from('gift_cards').insert({ code, initial_cents: s.amount_total, balance_cents: s.amount_total, purchaser_id: s.metadata!.user_id, recipient_email: s.metadata!.recipient_email || null, message: s.metadata!.message || null, stripe_session_id: s.id, status: 'active', expires_at: new Date(Date.now() + 365 * 864e5).toISOString() }));
        must(await sv.from('payments').insert({ customer_id: s.metadata!.user_id, kind: 'gift_card', method: 'stripe', status: 'succeeded', amount_cents: s.amount_total, stripe_checkout_session_id: s.id, stripe_payment_intent_id: pi, paid_at: new Date().toISOString() }));
        must(await sv.rpc('enqueue_notification', { uid: s.metadata!.user_id, tpl_code: 'gift_card_purchased', vars: { code, amount: `${(s.amount_total! / 100).toFixed(2)} €` } }));
      } else if (s.mode === 'subscription' && s.subscription) {
        const id = typeof s.subscription === 'string' ? s.subscription : s.subscription.id;
        await syncSubscription(await stripe.subscriptions.retrieve(id));
      }
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return syncSubscription(event.data.object as Stripe.Subscription);
    case 'invoice.paid': {
      const inv = event.data.object as Stripe.Invoice;
      const customer = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
      const { data: p } = await sv.from('profiles').select('id').eq('stripe_customer_id', customer!).maybeSingle();
      if (!p || !inv.amount_paid) return;
      must(await sv.from('payments').upsert({
        customer_id: p.id, kind: 'vip_subscription', method: 'stripe', status: 'succeeded', amount_cents: inv.amount_paid,
        stripe_invoice_id: inv.id, paid_at: iso(inv.status_transitions?.paid_at) ?? new Date().toISOString(), note: inv.hosted_invoice_url ?? null,
      }, { onConflict: 'stripe_invoice_id' }));
      return;
    }
    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      const customer = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
      const { data: p } = await sv.from('profiles').select('id').eq('stripe_customer_id', customer!).maybeSingle();
      if (p) must(await sv.rpc('enqueue_notification', { uid: p.id, tpl_code: 'vip_payment_failed', vars: {}, dedupe: `vipfail:${inv.id}` }));
      return;
    }
    case 'charge.refunded': {
      const ch = event.data.object as Stripe.Charge;
      const pi = typeof ch.payment_intent === 'string' ? ch.payment_intent : ch.payment_intent?.id;
      if (!pi) return;
      must(await sv.from('payments').update({ refunded_cents: ch.amount_refunded, status: ch.refunded ? 'refunded' : 'partially_refunded' }).eq('stripe_payment_intent_id', pi));
      return;
    }
    case 'payment_intent.canceled': {
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.type === 'deposit') must(await sv.from('deposits').update({ status: 'released', released_at: new Date().toISOString() }).eq('stripe_payment_intent_id', pi.id).eq('status', 'authorized'));
      return;
    }
    default:
  }
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: 'Stripe non configuré' }, { status: 503 });
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, req.headers.get('stripe-signature') ?? '', secret);
  } catch {
    return NextResponse.json({ error: 'Signature invalide' }, { status: 400 });
  }
  const sv = dbService();
  // Stripe peut renvoyer un même événement : on ne le traite qu'une fois.
  const { data: seen } = await sv.from('stripe_events').select('id').eq('id', event.id).maybeSingle();
  if (seen) return NextResponse.json({ received: true, duplicate: true });
  try {
    await handle(event);
  } catch (e) {
    console.error('Webhook Stripe', event.type, e);
    return NextResponse.json({ error: 'Traitement impossible' }, { status: 500 }); // Stripe réessaiera
  }
  await sv.from('stripe_events').insert({ id: event.id, type: event.type });
  return NextResponse.json({ received: true });
}
