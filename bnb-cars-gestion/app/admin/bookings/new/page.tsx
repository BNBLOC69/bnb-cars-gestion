import Link from 'next/link';
import { db } from '@/lib/supabase/server';
import { ActionForm, Field, Submit } from '@/components/forms';
import { createManualBooking } from '../../actions';
import { eur, fullName } from '@/lib/format';

export default async function NewBooking({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
  const s = await db();
  const [clients, vehicles, locations, options] = await Promise.all([
    s.from('profiles').select('id,first_name,last_name,email,phone').eq('role', 'client').is('anonymized_at', null).order('last_name').limit(1000),
    s.from('vehicles').select('id,make,model,daily_price_cents').order('sort_order'),
    s.from('locations').select('id,name').eq('is_active', true).order('sort_order'),
    s.from('rental_options').select('code,name,price_cents,pricing').eq('is_active', true).order('sort_order'),
  ]);
  return (
    <div className="stack">
      <div className="page-head"><h1>Ajouter une réservation</h1><Link className="btn ghost" href="/admin/clients/new">Créer un client</Link></div>
      <p className="muted">Le prix et les avantages VIP sont calculés par le serveur. La réservation est confirmée immédiatement si le véhicule est libre.</p>
      <ActionForm action={createManualBooking}>
        <Field label="Client" wide>
          <select name="customer_id" required defaultValue={client ?? ''}>
            <option value="" disabled>Choisir un client</option>
            {clients.data?.map((c) => <option key={c.id} value={c.id}>{fullName(c)} {c.email ? `(${c.email})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Véhicule" wide>
          <select name="vehicle_id" required defaultValue="">
            <option value="" disabled>Choisir un véhicule</option>
            {vehicles.data?.map((v) => <option key={v.id} value={v.id}>{v.make} {v.model}, {eur(v.daily_price_cents)}/jour</option>)}
          </select>
        </Field>
        <Field label="Départ (heure de Paris)"><input type="datetime-local" name="starts_at" required /></Field>
        <Field label="Retour (heure de Paris)"><input type="datetime-local" name="ends_at" required /></Field>
        <Field label="Canal"><select name="source" defaultValue="phone"><option value="phone">Téléphone</option><option value="agency">Comptoir</option></select></Field>
        <Field label="Remise du véhicule"><select name="pickup_mode" defaultValue="agency"><option value="agency">En agence</option><option value="delivery">Livraison</option></select></Field>
        <Field label="Lieu de départ"><select name="pickup_location_id">{locations.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <Field label="Lieu de retour"><select name="return_location_id">{locations.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <Field label="Adresse de livraison"><input name="delivery_address" /></Field>
        <Field label="Code postal"><input name="delivery_postal_code" inputMode="numeric" /></Field>
        <Field label="Ville"><input name="delivery_city" /></Field>
        <Field label="Code promotionnel"><input name="promo_code" /></Field>
        <fieldset className="span-all">
          <legend className="small muted">Options</legend>
          <div className="row">
            {options.data?.map((o) => <label className="check" key={o.code} style={{ marginRight: 12 }}><input type="checkbox" name="options" value={o.code} />{o.name} ({eur(o.price_cents)}{o.pricing === 'per_day' ? '/jour' : ''})</label>)}
          </div>
        </fieldset>
        <div className="span-all"><Submit>Créer la réservation</Submit></div>
      </ActionForm>
    </div>
  );
}
