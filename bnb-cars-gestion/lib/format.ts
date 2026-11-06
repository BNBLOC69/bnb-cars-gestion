const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const moneyRound = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const eur = (c: number | null | undefined) => (c == null ? '—' : money.format(c / 100));
export const eur0 = (c: number | null | undefined) => (c == null ? '—' : moneyRound.format(c / 100));
const TZ = 'Europe/Paris';
export const dateTime = (d: string | null | undefined) => d ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: TZ }).format(new Date(d)) : '—';
export const date = (d: string | null | undefined) => d ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: TZ }).format(new Date(d)) : '—';
export const fullName = (p: { first_name?: string | null; last_name?: string | null }) => `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Sans nom';

/** Valeur d'un champ datetime-local (heure de Paris) depuis une date ISO. */
export function toParisInput(iso: string | null | undefined) {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
  return parts.replace(' ', 'T');
}
/** Convertit un datetime-local saisi en heure de Paris vers ISO, heure d'été comprise. */
export function fromParisInput(local: string) {
  const guess = new Date(local + 'Z');
  const asParis = new Date(guess.toLocaleString('en-US', { timeZone: TZ }));
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() - (asParis.getTime() - asUtc.getTime())).toISOString();
}

export const BOOKING_STATUS: Record<string, string> = {
  requested: 'Demandée', pending_payment: 'En attente de paiement', confirmed: 'Confirmée', paid: 'Payée',
  active: 'En cours', completed: 'Terminée', cancelled: 'Annulée', refused: 'Refusée', expired: 'Expirée',
};
export const VEHICLE_STATUS: Record<string, string> = {
  available: 'Disponible', reserved: 'Réservé', on_rent: 'En location', preparation: 'En préparation', maintenance: 'En entretien', unavailable: 'Indisponible',
};
export const DEPOSIT_STATUS: Record<string, string> = {
  pending: 'À constituer', authorized: 'Préautorisée', captured: 'Encaissée', partially_captured: 'Retenue partielle', released: 'Libérée', refunded: 'Remboursée', expired: 'Autorisation expirée',
};
export const PAYMENT_METHOD: Record<string, string> = { stripe: 'Carte en ligne', card_terminal: 'Terminal carte', cash: 'Espèces', bank_transfer: 'Virement', gift_card: 'Carte cadeau', other: 'Autre' };
export const PAYMENT_KIND: Record<string, string> = { rental: 'Location', balance: 'Solde', extra_fees: 'Frais', vip_subscription: 'Abonnement VIP', gift_card: 'Carte cadeau vendue' };
export const VERIFICATION: Record<string, string> = { none: 'Aucun document', pending: 'À vérifier', verified: 'Vérifié', rejected: 'Refusé' };
export const VIP_STATUS: Record<string, string> = { active: 'Actif', past_due: 'Paiement en échec', canceled: 'Résilié', expired: 'Expiré', suspended: 'Suspendu' };
export const DOC_TYPE: Record<string, string> = { license_front: 'Permis (recto)', license_back: 'Permis (verso)', identity_front: 'Identité (recto)', identity_back: 'Identité (verso)', proof_of_address: 'Justificatif de domicile', other: 'Autre' };
export const FUEL: Record<string, string> = { petrol: 'Essence', diesel: 'Diesel', hybrid: 'Hybride', plugin_hybrid: 'Hybride rechargeable', electric: 'Électrique' };
