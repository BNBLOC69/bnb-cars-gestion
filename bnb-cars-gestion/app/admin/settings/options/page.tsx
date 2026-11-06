import { db } from '@/lib/supabase/server';
import { ActionButton, ActionForm, Field, Submit } from '@/components/forms';
import { eur } from '@/lib/format';
import * as A from '../../actions';

type O = Record<string, any>; // eslint-disable-line
function OptionForm({ o = {} }: { o?: O }) {
  return (
    <ActionForm action={A.saveOption.bind(null, o.id ?? null)}>
      <input type="hidden" name="code" value={o.code ?? ''} />
      <Field label="Nom"><input name="name" required defaultValue={o.name} /></Field>
      <Field label="Tarification"><select name="pricing" defaultValue={o.pricing ?? 'per_day'}><option value="per_day">Par jour</option><option value="per_rental">Par location</option></select></Field>
      <Field label="Prix (€)"><input name="price" inputMode="decimal" defaultValue={o.price_cents != null ? (o.price_cents / 100).toFixed(2) : ''} /></Field>
      <Field label="Quantité maximum"><input type="number" name="max_quantity" defaultValue={o.max_quantity ?? 1} /></Field>
      <Field label="Km ajoutés"><input type="number" name="adds_km" defaultValue={o.adds_km ?? 0} /></Field>
      <Field label="Réduction VIP (%)"><input type="number" name="vip_discount_percent" defaultValue={o.vip_discount_percent ?? 0} /></Field>
      <Field label="Description" wide><input name="description" defaultValue={o.description ?? ''} /></Field>
      <label className="check"><input type="checkbox" name="is_insurance" defaultChecked={o.is_insurance} />Option d&apos;assurance</label>
      <label className="check"><input type="checkbox" name="is_active" defaultChecked={o.is_active ?? true} />Proposée</label>
      <div><Submit>Enregistrer</Submit></div>
    </ActionForm>
  );
}
export default async function Options() {
  const s = await db();
  const [opts, disc] = await Promise.all([s.from('rental_options').select('*').order('sort_order'), s.from('long_term_discounts').select('*').order('min_days')]);
  return (
    <div className="stack">
      <section className="stack-s">
        <h2>Options de location</h2>
        <p className="small muted">Les options d&apos;assurance dépendent de vos contrats : ajoutez-les ici avec votre assureur. La livraison et le retour dans un autre lieu se règlent dans « Livraison et lieux ».</p>
        {opts.data?.map((o) => (
          <details key={o.id}>
            <summary>{o.name}, {eur(o.price_cents)}{o.pricing === 'per_day' ? '/jour' : ''}{o.is_active ? '' : ' (inactive)'}</summary>
            <OptionForm o={o} />
            <div style={{ marginTop: 8 }}><ActionButton action={A.deleteRow.bind(null, 'rental_options', o.id, '/admin/settings/options')} label="Supprimer" className="danger" confirm="Supprimer cette option ?" /></div>
          </details>
        ))}
        <details><summary>Ajouter une option</summary><OptionForm /></details>
      </section>
      <section className="stack-s">
        <h2>Réductions longue durée</h2>
        {disc.data?.map((d) => (
          <div key={d.id} className="row between"><span>À partir de {d.min_days} jours : −{d.percent} %</span><ActionButton action={A.deleteRow.bind(null, 'long_term_discounts', d.id, '/admin/settings/options')} label="Supprimer" className="ghost" /></div>
        ))}
        <ActionForm action={A.saveDiscount} resetOnOk>
          <Field label="À partir de (jours)"><input type="number" name="min_days" required min={2} /></Field>
          <Field label="Réduction (%)"><input type="number" name="percent" required min={0} max={100} /></Field>
          <div><Submit>Ajouter</Submit></div>
        </ActionForm>
      </section>
    </div>
  );
}
