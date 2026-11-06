import { db } from '@/lib/supabase/server';
import { ActionButton, ActionForm, Field, Submit } from '@/components/forms';
import { eur } from '@/lib/format';
import * as A from '../../actions';

type Z = Record<string, any>; // eslint-disable-line
const e = (c?: number) => (c == null ? '' : (c / 100).toFixed(2));
function ZoneForm({ z = {} }: { z?: Z }) {
  return (
    <ActionForm action={A.saveZone.bind(null, z.id ?? null)}>
      <Field label="Nom de la zone"><input name="name" required defaultValue={z.name} /></Field>
      <Field label="Départements"><input name="department_codes" defaultValue={z.department_codes?.join(', ')} placeholder="69, 38, 73" /></Field>
      <Field label="Codes postaux"><input name="postal_codes" defaultValue={z.postal_codes?.join(', ')} /></Field>
      <Field label="Villes"><input name="cities" defaultValue={z.cities?.join(', ')} /></Field>
      <Field label="Codes postaux exclus"><input name="excluded_postal_codes" defaultValue={z.excluded_postal_codes?.join(', ')} /></Field>
      <Field label="Villes exclues"><input name="excluded_cities" defaultValue={z.excluded_cities?.join(', ')} /></Field>
      <Field label="Distance maximale (km)"><input type="number" name="max_distance_km" defaultValue={z.max_distance_km ?? ''} /></Field>
      <Field label="De"><input type="time" name="hours_start" defaultValue={(z.hours_start ?? '08:00').slice(0, 5)} /></Field>
      <Field label="À"><input type="time" name="hours_end" defaultValue={(z.hours_end ?? '20:00').slice(0, 5)} /></Field>
      <Field label="Frais client classique (€)"><input name="base_fee" inputMode="decimal" defaultValue={e(z.base_fee_cents)} /></Field>
      <Field label="Par km (€)"><input name="fee_per_km" inputMode="decimal" defaultValue={e(z.fee_per_km_cents)} /></Field>
      <label className="check"><input type="checkbox" name="vip_free" defaultChecked={z.vip_free ?? true} />Offerte aux VIP</label>
      <label className="check"><input type="checkbox" name="is_active" defaultChecked={z.is_active ?? true} />Active</label>
      <div><Submit>Enregistrer la zone</Submit></div>
    </ActionForm>
  );
}
function LocForm({ l = {} }: { l?: Z }) {
  return (
    <ActionForm action={A.saveLocation.bind(null, l.id ?? null)}>
      <Field label="Nom"><input name="name" required defaultValue={l.name} /></Field>
      <Field label="Adresse"><input name="address" defaultValue={l.address ?? ''} /></Field>
      <Field label="Code postal"><input name="postal_code" defaultValue={l.postal_code ?? ''} /></Field>
      <Field label="Ville"><input name="city" defaultValue={l.city ?? ''} /></Field>
      <Field label="Frais de retour dans ce lieu (€)"><input name="one_way_fee" inputMode="decimal" defaultValue={e(l.one_way_fee_cents)} /></Field>
      <input type="hidden" name="agency_id" value={l.agency_id ?? ''} />
      <label className="check"><input type="checkbox" name="allows_pickup" defaultChecked={l.allows_pickup ?? true} />Départ</label>
      <label className="check"><input type="checkbox" name="allows_return" defaultChecked={l.allows_return ?? true} />Retour</label>
      <label className="check"><input type="checkbox" name="is_active" defaultChecked={l.is_active ?? true} />Actif</label>
      <div><Submit>Enregistrer le lieu</Submit></div>
    </ActionForm>
  );
}
export default async function Delivery() {
  const s = await db();
  const [zones, locs] = await Promise.all([s.from('delivery_zones').select('*').order('sort_order'), s.from('locations').select('*').order('sort_order')]);
  return (
    <div className="stack">
      <section className="stack-s">
        <h2>Zones de livraison</h2>
        <p className="small muted">Une adresse est éligible si son département, son code postal ou sa ville figure dans une zone active et n&apos;est pas exclu. Séparez les valeurs par des virgules.</p>
        {zones.data?.map((z) => (
          <details key={z.id}>
            <summary>{z.name}, {eur(z.base_fee_cents)}{z.vip_free ? ', offerte aux VIP' : ''}{z.is_active ? '' : ' (inactive)'}</summary>
            <ZoneForm z={z} />
            <div style={{ marginTop: 8 }}><ActionButton action={A.deleteRow.bind(null, 'delivery_zones', z.id, '/admin/settings/delivery')} label="Supprimer la zone" className="danger" confirm="Supprimer cette zone ?" /></div>
          </details>
        ))}
        <details><summary>Ajouter une zone</summary><ZoneForm /></details>
      </section>
      <section className="stack-s">
        <h2>Lieux de départ et de retour</h2>
        {!locs.data?.length && <p className="notice warn">Ajoutez au moins un lieu pour que les clients puissent réserver.</p>}
        {locs.data?.map((l) => <details key={l.id}><summary>{l.name}{l.is_active ? '' : ' (inactif)'}</summary><LocForm l={l} /></details>)}
        <details><summary>Ajouter un lieu</summary><LocForm /></details>
      </section>
    </div>
  );
}
