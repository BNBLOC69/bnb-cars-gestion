import { ActionForm, Field, Submit } from './forms';
import { FUEL, toParisInput, VEHICLE_STATUS } from '@/lib/format';

type V = Record<string, any>; // eslint-disable-line
const e = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2));

export function VehicleForm({ action, v = {}, priv = {}, categories, agencies }: { action: (p: unknown, fd: FormData) => Promise<any>; v?: V; priv?: V; categories: { id: string; name: string }[]; agencies: { id: string; name: string }[] }) {
  const depositValue = v.vip_deposit_mode === 'amount' ? e(v.vip_deposit_value) : v.vip_deposit_value ?? '';
  return (
    <ActionForm action={action} className="stack">
      <section>
        <h2>Identité</h2>
        <div className="form-grid">
          <Field label="Marque"><input name="make" required defaultValue={v.make} /></Field>
          <Field label="Modèle"><input name="model" required defaultValue={v.model} /></Field>
          <Field label="Finition"><input name="trim_level" defaultValue={v.trim_level ?? ''} /></Field>
          <Field label="Année"><input name="year" type="number" required defaultValue={v.year ?? new Date().getFullYear()} /></Field>
          <Field label="Catégorie"><select name="category_id" required defaultValue={v.category_id ?? categories[0]?.id}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Agence"><select name="agency_id" defaultValue={v.agency_id ?? agencies[0]?.id ?? ''}><option value="">Aucune</option>{agencies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Motorisation"><input name="engine" defaultValue={v.engine ?? ''} /></Field>
          <Field label="Puissance (ch)"><input name="power_hp" type="number" defaultValue={v.power_hp ?? ''} /></Field>
          <Field label="Carburant"><select name="fuel" defaultValue={v.fuel ?? 'petrol'}>{Object.entries(FUEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Boîte"><select name="transmission" defaultValue={v.transmission ?? 'automatic'}><option value="automatic">Automatique</option><option value="manual">Manuelle</option></select></Field>
          <Field label="Places"><input name="seats" type="number" defaultValue={v.seats ?? 5} /></Field>
          <Field label="Portes"><input name="doors" type="number" defaultValue={v.doors ?? ''} /></Field>
          <Field label="Kilométrage"><input name="mileage_km" type="number" defaultValue={v.mileage_km ?? 0} /></Field>
          <Field label="Description" wide><textarea name="description" defaultValue={v.description ?? ''} /></Field>
        </div>
      </section>
      <section>
        <h2>Tarifs et caution</h2>
        <div className="form-grid">
          <Field label="Jour (€)"><input name="daily_price" inputMode="decimal" required defaultValue={e(v.daily_price_cents)} /></Field>
          <Field label="Week-end (€)"><input name="weekend_price" inputMode="decimal" defaultValue={e(v.weekend_price_cents)} /></Field>
          <Field label="Semaine (€)"><input name="weekly_price" inputMode="decimal" defaultValue={e(v.weekly_price_cents)} /></Field>
          <Field label="Mois (€)"><input name="monthly_price" inputMode="decimal" defaultValue={e(v.monthly_price_cents)} /></Field>
          <Field label="Caution (€)"><input name="deposit" inputMode="decimal" defaultValue={e(v.deposit_cents)} /></Field>
          <Field label="Km inclus par jour"><input name="included_km_per_day" type="number" defaultValue={v.included_km_per_day ?? 200} /></Field>
          <Field label="Km supplémentaire (€)"><input name="extra_km" inputMode="decimal" defaultValue={e(v.extra_km_cents)} /></Field>
          <Field label="Âge minimum"><input name="min_age" type="number" defaultValue={v.min_age ?? 21} /></Field>
          <Field label="Années de permis"><input name="min_license_years" type="number" defaultValue={v.min_license_years ?? 2} /></Field>
        </div>
      </section>
      <section>
        <h2 className="gold">Avantages VIP</h2>
        <div className="form-grid">
          <Field label="Tarif VIP">
            <select name="vip_price_mode" defaultValue={v.vip_price_mode ?? 'default'}>
              <option value="default">Réduction générale du Club</option>
              <option value="percent">Pourcentage propre au véhicule</option>
              <option value="custom">Prix personnalisés</option>
              <option value="none">Pas de tarif VIP</option>
            </select>
          </Field>
          <Field label="Réduction (%)"><input name="vip_discount_percent" type="number" min={0} max={100} defaultValue={v.vip_discount_percent ?? ''} /></Field>
          <Field label="VIP jour (€)"><input name="vip_daily_price" inputMode="decimal" defaultValue={e(v.vip_daily_price_cents)} /></Field>
          <Field label="VIP week-end (€)"><input name="vip_weekend_price" inputMode="decimal" defaultValue={e(v.vip_weekend_price_cents)} /></Field>
          <Field label="VIP semaine (€)"><input name="vip_weekly_price" inputMode="decimal" defaultValue={e(v.vip_weekly_price_cents)} /></Field>
          <Field label="VIP mois (€)"><input name="vip_monthly_price" inputMode="decimal" defaultValue={e(v.vip_monthly_price_cents)} /></Field>
          <Field label="Caution VIP">
            <select name="vip_deposit_mode" defaultValue={v.vip_deposit_mode ?? 'default'}>
              <option value="default">Réduction générale du Club</option>
              <option value="percent">Pourcentage</option>
              <option value="amount">Montant fixe</option>
              <option value="none">Pas de réduction</option>
            </select>
          </Field>
          <Field label="Valeur (% ou €)"><input name="vip_deposit_value" inputMode="decimal" defaultValue={depositValue} /></Field>
          <Field label="Avant-première VIP jusqu'au"><input name="vip_early_access_until" type="datetime-local" defaultValue={toParisInput(v.vip_early_access_until)} /></Field>
          <Field label="Exclusivité VIP jusqu'au"><input name="vip_exclusive_until" type="datetime-local" defaultValue={toParisInput(v.vip_exclusive_until)} /></Field>
        </div>
      </section>
      <section>
        <h2>Exploitation</h2>
        <div className="form-grid">
          <Field label="État du véhicule">
            <select name="status" defaultValue={v.status ?? 'available'}>
              {['available', 'preparation', 'maintenance', 'unavailable'].map((k) => <option key={k} value={k}>{VEHICLE_STATUS[k]}</option>)}
            </select>
          </Field>
          <Field label="Réservation">
            <select name="booking_mode" defaultValue={v.booking_mode ?? ''}>
              <option value="">Paramètre général</option>
              <option value="request">Demande à valider</option>
              <option value="payment">Paiement en ligne</option>
            </select>
          </Field>
          <Field label="Préparation après retour (min)"><input name="prep_buffer_minutes" type="number" defaultValue={v.prep_buffer_minutes ?? 120} /></Field>
          <label className="check"><input type="checkbox" name="is_published" defaultChecked={v.is_published} />Visible par les clients</label>
          <label className="check"><input type="checkbox" name="is_featured" defaultChecked={v.is_featured} />Mis en avant à l&apos;accueil</label>
        </div>
      </section>
      <section>
        <h2>Données internes</h2>
        <div className="form-grid">
          <Field label="Immatriculation"><input name="registration" defaultValue={priv.registration ?? ''} /></Field>
          <Field label="N° de série (VIN)"><input name="vin" defaultValue={priv.vin ?? ''} /></Field>
          <Field label="Date d'achat"><input name="purchase_date" type="date" defaultValue={priv.purchase_date ?? ''} /></Field>
          <Field label="Prix d'achat (€)"><input name="purchase_price" inputMode="decimal" defaultValue={e(priv.purchase_price_cents)} /></Field>
          <Field label="Notes" wide><textarea name="private_notes" defaultValue={priv.notes ?? ''} /></Field>
        </div>
      </section>
      <div><Submit>Enregistrer le véhicule</Submit></div>
    </ActionForm>
  );
}
