import { db } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';
import { ActionButton, ActionForm, Field, Submit } from '@/components/forms';
import * as A from '../actions';

const NUMERIC: [string, string, 'number' | 'money'][] = [
  ['upfront_percent', 'Part du prix à régler à la réservation (%)', 'number'],
  ['min_notice_hours', 'Délai minimum avant un départ (heures)', 'number'],
  ['max_advance_days', 'Réservation possible jusqu\'à (jours)', 'number'],
  ['min_rental_days', 'Durée minimale de location (jours)', 'number'],
  ['late_grace_minutes', 'Tolérance de retard (minutes)', 'number'],
  ['payment_hold_minutes', 'Blocage pendant le paiement (minutes)', 'number'],
  ['vat_rate', 'TVA (%)', 'number'],
  ['energy_fee_per_percent_cents', 'Frais par % de carburant manquant (€)', 'money'],
  ['min_inspection_photos', 'Photos minimum par état des lieux', 'number'],
  ['vip_default_discount_percent', 'Réduction VIP générale sur la location (%)', 'number'],
  ['vip_default_deposit_discount_percent', 'Réduction VIP générale sur la caution (%)', 'number'],
  ['waitlist_vip_head_start_hours', 'Avance des VIP sur la liste d\'attente (heures)', 'number'],
  ['referral_reward_cents', 'Récompense de parrainage (€)', 'money'],
  ['document_alert_days', 'Alerte avant échéance d\'un document (jours)', 'number'],
  ['document_retention_months', 'Conservation des justificatifs (mois)', 'number'],
];

export default async function Settings() {
  const s = await db();
  const { data, error } = await s.from('app_settings').select('*');
  if (error) return <p className="notice error">{error.message}</p>;
  const map = Object.fromEntries((data ?? []).map((x) => [x.key, x.value]));
  const company = (map.company ?? {}) as Record<string, string>;
  const demo = await s.from('vehicles').select('id', { count: 'exact', head: true }).eq('is_demo', true);
  const real = await s.from('vehicles').select('id', { count: 'exact', head: true }).eq('is_demo', false).eq('is_published', true);
  const checks: [boolean, string, string][] = [
    [!!(company.legal_name && company.siret && company.address), 'Informations légales de la société', 'Raison sociale, SIRET et adresse apparaissent sur les contrats et factures.'],
    [!String(map.terms_text ?? '').includes('doivent être renseignées'), 'Conditions générales de location', 'À rédiger avec un professionnel du droit.'],
    [!String(map.contract_template ?? '').includes('MODÈLE À FAIRE VALIDER'), 'Modèle de contrat validé', 'Retirez la mention du modèle une fois le texte validé.'],
    [!!getStripe() && !!process.env.STRIPE_WEBHOOK_SECRET, 'Stripe connecté', 'Clé secrète et secret de webhook à renseigner sur le serveur.'],
    [!!process.env.RESEND_API_KEY, 'Envoi d\'emails connecté', 'Clé Resend et domaine vérifié.'],
    [!!process.env.CRON_SECRET, 'Tâches planifiées actives', 'Rappels, expirations et envoi des notifications.'],
    [(real.count ?? 0) > 0, 'Au moins un vrai véhicule publié', 'Importez vos véhicules et leurs photos.'],
    [(demo.count ?? 0) === 0, 'Véhicules de démonstration retirés', 'Supprimez-les avant l\'ouverture.'],
  ];
  return (
    <div className="stack">
      <section>
        <h2>Avant l&apos;ouverture</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} className="stack-s">
          {checks.map(([ok, label, help]) => (
            <li key={label} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <span className={ok ? 'good' : 'warn'} style={{ fontWeight: 700, width: 74, flexShrink: 0 }}>{ok ? 'Fait' : 'À faire'}</span>
              <span><b style={{ fontWeight: 600 }}>{label}</b><br /><span className="small muted">{help}</span></span>
            </li>
          ))}
        </ul>
        {(demo.count ?? 0) > 0 && <div style={{ marginTop: 14 }}><ActionButton action={A.purgeDemo} label={`Supprimer les ${demo.count} véhicules de démonstration`} className="danger" confirm="Supprimer les véhicules de démonstration ?" /></div>}
      </section>

      <section>
        <h2>Mode de réservation</h2>
        <ActionForm action={A.saveSetting.bind(null, 'booking_mode', 'text')} className="row">
          <select name="value" defaultValue={String(map.booking_mode)} aria-label="Mode de réservation" style={{ maxWidth: 380 }}>
            <option value="request">Demande à valider par l&apos;agence</option>
            <option value="payment">Paiement en ligne immédiat</option>
          </select>
          <Submit>Enregistrer</Submit>
        </ActionForm>
        <p className="small muted" style={{ marginTop: 6 }}>Modifiable véhicule par véhicule. Le paiement en ligne nécessite Stripe.</p>
      </section>

      <section>
        <h2>Société</h2>
        <ActionForm action={A.saveCompany}>
          <Field label="Nom commercial"><input name="trade_name" defaultValue={company.trade_name} /></Field>
          <Field label="Raison sociale"><input name="legal_name" defaultValue={company.legal_name} /></Field>
          <Field label="Forme juridique"><input name="legal_form" defaultValue={company.legal_form} /></Field>
          <Field label="Capital"><input name="capital" defaultValue={company.capital} /></Field>
          <Field label="SIRET"><input name="siret" defaultValue={company.siret} /></Field>
          <Field label="N° de TVA"><input name="vat_number" defaultValue={company.vat_number} /></Field>
          <Field label="RCS"><input name="rcs" defaultValue={company.rcs} /></Field>
          <Field label="Assureur et n° de contrat"><input name="insurance" defaultValue={company.insurance} /></Field>
          <Field label="Adresse du siège social" wide><input name="address" defaultValue={company.address} /></Field>
          <Field label="Téléphone"><input name="phone" defaultValue={company.phone} /></Field>
          <Field label="Email"><input name="email" type="email" defaultValue={company.email} /></Field>
          <Field label="WhatsApp (ex. 33612345678)"><input name="whatsapp" defaultValue={company.whatsapp} /></Field>
          <div className="span-all"><Submit>Enregistrer la société</Submit></div>
        </ActionForm>
      </section>

      <section>
        <h2>Règles et avantages</h2>
        <div className="form-grid">
          {NUMERIC.map(([key, label, kind]) => (
            <ActionForm key={key} action={A.saveSetting.bind(null, key, kind)} className="stack-s">
              <Field label={label}><input name="value" inputMode="decimal" defaultValue={kind === 'money' ? (Number(map[key]) / 100).toFixed(2) : String(map[key] ?? '')} required /></Field>
              <Submit className="ghost">Enregistrer</Submit>
            </ActionForm>
          ))}
        </div>
      </section>

      <section>
        <h2>Conditions générales de location</h2>
        <ActionForm action={A.saveSetting.bind(null, 'terms_text', 'text')} className="stack-s">
          <textarea name="value" rows={8} defaultValue={String(map.terms_text ?? '')} aria-label="Conditions générales" />
          <div><Submit>Enregistrer</Submit></div>
        </ActionForm>
      </section>
      <section>
        <h2>Modèle de contrat</h2>
        <p className="small muted" style={{ marginBottom: 8 }}>{'Les champs entre {{ }} sont remplis automatiquement à chaque contrat.'}</p>
        <ActionForm action={A.saveSetting.bind(null, 'contract_template', 'text')} className="stack-s">
          <textarea name="value" rows={16} defaultValue={String(map.contract_template ?? '')} aria-label="Modèle de contrat" />
          <div><Submit>Enregistrer</Submit></div>
        </ActionForm>
      </section>
    </div>
  );
}
