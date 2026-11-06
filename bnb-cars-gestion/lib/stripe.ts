import Stripe from 'stripe';

let client: Stripe | null = null;
/** null tant que la clé n'est pas renseignée : les écrans l'indiquent clairement au lieu de simuler un paiement. */
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) {
    const host = process.env.STRIPE_API_HOST; // serveur de test local uniquement
    client = new Stripe(key, host ? { host, port: Number(process.env.STRIPE_API_PORT || 443), protocol: (process.env.STRIPE_API_PROTOCOL as 'http' | 'https') || 'https' } : {});
  }
  return client;
}
