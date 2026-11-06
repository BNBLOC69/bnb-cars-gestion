import type { NextRequest } from 'next/server';
import { caller, clientUrl, json, preflight } from '@/lib/api';
import { getStripe } from '@/lib/stripe';
import { dbService } from '@/lib/supabase/server';

export const OPTIONS = preflight;

// Résiliation, moyen de paiement, factures : portail Stripe sécurisé.
export async function POST(req: NextRequest) {
  const c = await caller(req);
  if (!c) return json(req, { error: 'Connectez-vous pour continuer.' }, 401);
  const stripe = getStripe();
  if (!stripe) return json(req, { error: 'La gestion en ligne n\'est pas encore activée. Contactez l\'agence.' }, 503);
  const { data: m } = await dbService().from('vip_memberships').select('stripe_customer_id').eq('user_id', c.user.id).maybeSingle();
  if (!m?.stripe_customer_id) return json(req, { error: 'Votre statut a été accordé par l\'agence : contactez-la pour le modifier.' }, 404);
  const portal = await stripe.billingPortal.sessions.create({ customer: m.stripe_customer_id, return_url: `${clientUrl()}/club` });
  return json(req, { url: portal.url });
}
