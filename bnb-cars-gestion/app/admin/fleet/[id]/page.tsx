import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth';
import { VehicleForm } from '@/components/vehicle-form';
import { ActionButton, ActionForm, Field, Submit } from '@/components/forms';
import { VEHICLE_STATUS, date, dateTime, eur } from '@/lib/format';
import * as A from '../../actions';

const DOC: Record<string, string> = { technical_control: 'Contrôle technique', insurance: 'Assurance', registration: 'Carte grise', other: 'Autre' };

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await db();
  const me = await requireStaff();
  const { data: v } = await s.from('vehicles').select('*').eq('id', id).maybeSingle();
  if (!v) notFound();
  const now = new Date();
  const yearAgo = new Date(now.getTime() - 365 * 864e5).toISOString();
  const [priv, cats, ags, photos, maint, exp, docs, blocks, status, perf] = await Promise.all([
    s.from('vehicle_private').select('*').eq('vehicle_id', id).maybeSingle(),
    s.from('vehicle_categories').select('id,name').order('sort_order'),
    s.from('agencies').select('id,name'),
    s.from('vehicle_photos').select('*').eq('vehicle_id', id).order('sort_order'),
    s.from('vehicle_maintenance').select('*').eq('vehicle_id', id).order('performed_on', { ascending: false }),
    s.from('vehicle_expenses').select('*').eq('vehicle_id', id).order('spent_on', { ascending: false }),
    s.from('vehicle_documents').select('*').eq('vehicle_id', id).order('expires_on'),
    s.from('fleet_calendar').select('*').eq('vehicle_id', id).eq('kind', 'block').gte('ends_at', now.toISOString()).order('starts_at'),
    s.rpc('vehicle_current_status', { vid: id }),
    me.perms.has('finance') ? s.rpc('admin_vehicle_performance', { from_ts: yearAgo, to_ts: now.toISOString() }) : Promise.resolve({ data: null }),
  ]);
  const p = (perf.data as { vehicle_id: string; revenue_cents: number; expenses_cents: number; profit_cents: number; rentals: number; occupancy_percent: number }[] | null)?.find((x) => x.vehicle_id === id);
  const url = (path: string) => s.storage.from('vehicle-photos').getPublicUrl(path).data.publicUrl;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="small muted"><Link href="/admin/fleet">Flotte</Link></p>
          <h1>{v.make} {v.model}</h1>
          <p style={{ marginTop: 6 }}><span className={`tag ${status.data}`}>{VEHICLE_STATUS[status.data as string]}</span> {v.is_demo && <span className="tag requested">Démonstration</span>}</p>
        </div>
        <div className="row">
          <Link className="btn ghost" href={`/admin/calendar?vehicle=${id}`}>Voir le calendrier</Link>
          <ActionButton action={A.announceVehicle.bind(null, id)} label="Annoncer ce véhicule" className="ghost" confirm="Prévenir les clients ayant accepté les communications, en commençant par les VIP ?" />
        </div>
      </div>

      {p && (
        <section aria-label="Rentabilité sur 12 mois">
          <h2>Rentabilité sur 12 mois</h2>
          <div className="figures">
            <div className="figure"><b>{eur(Number(p.revenue_cents))}</b><span>Revenus encaissés</span></div>
            <div className="figure"><b>{eur(Number(p.expenses_cents))}</b><span>Dépenses et entretien</span></div>
            <div className="figure"><b>{eur(Number(p.profit_cents))}</b><span>Résultat</span></div>
            <div className="figure"><b>{Number(p.rentals)}</b><span>Locations</span></div>
            <div className="figure"><b>{Number(p.occupancy_percent)} %</b><span>Occupation</span></div>
          </div>
        </section>
      )}

      <section>
        <h2>Photos</h2>
        <p className="small muted" style={{ marginBottom: 10 }}>La première photo sert de visuel principal.</p>
        {photos.data && photos.data.length > 0 && (
          <div className="photos" style={{ marginBottom: 14 }}>
            {photos.data.map((ph, i) => (
              <figure key={ph.id}>
                <img src={url(ph.storage_path)} alt={ph.alt ?? `${v.make} ${v.model}`} />
                <div className="row">
                  {i > 0 && <ActionButton action={A.makeCoverPhoto.bind(null, id, ph.id)} label="Principale" className="ghost" />}
                  <ActionButton action={A.deleteVehiclePhoto.bind(null, id, ph.id, ph.storage_path)} label="Supprimer" className="ghost" confirm="Supprimer cette photo ?" />
                </div>
              </figure>
            ))}
          </div>
        )}
        <ActionForm action={A.uploadVehiclePhotos.bind(null, id)} className="row" resetOnOk>
          <input type="file" name="photos" accept="image/*" multiple aria-label="Photos" style={{ flex: 1, minWidth: 220 }} />
          <Submit>Importer</Submit>
        </ActionForm>
      </section>

      <VehicleForm action={A.saveVehicle.bind(null, id)} v={v} priv={priv.data ?? {}} categories={cats.data ?? []} agencies={ags.data ?? []} />

      <section id="blocages">
        <h2>Dates bloquées</h2>
        <div className="stack-s">
          {blocks.data?.map((b) => (
            <div className="row between" key={b.id}>
              <span>{dateTime(b.starts_at)} au {dateTime(b.ends_at)} : {b.reason}</span>
              <ActionButton action={A.unblockDates.bind(null, id, b.id)} label="Retirer" className="ghost" />
            </div>
          ))}
          <ActionForm action={A.blockDates.bind(null, id)} resetOnOk>
            <Field label="Du"><input type="datetime-local" name="starts_at" required /></Field>
            <Field label="Au"><input type="datetime-local" name="ends_at" required /></Field>
            <Field label="Motif"><input name="reason" required placeholder="Immobilisation, carrosserie…" /></Field>
            <div><Submit>Bloquer ces dates</Submit></div>
          </ActionForm>
        </div>
      </section>

      <section>
        <h2>Contrôle technique, assurance, documents</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Type</th><th>Référence</th><th>Échéance</th><th /></tr></thead>
          <tbody>
            {docs.data?.map((d) => (
              <tr key={d.id}>
                <td>{DOC[d.kind]} {d.label}</td>
                <td>{d.issuer} {d.reference}</td>
                <td className={d.expires_on && d.expires_on < today ? 'bad' : ''}>{date(d.expires_on)}</td>
                <td className="num"><ActionButton action={A.deleteVehicleRow.bind(null, 'vehicle_documents', d.id, id)} label="Supprimer" className="ghost" /></td>
              </tr>
            ))}
            {!docs.data?.length && <tr><td colSpan={4} className="muted">Aucun document. Ajoutez-les pour recevoir les alertes d&apos;échéance.</td></tr>}
          </tbody>
        </table></div>
        <details style={{ marginTop: 8 }}>
          <summary>Ajouter un document</summary>
          <ActionForm action={A.addVehicleDocument.bind(null, id)} resetOnOk>
            <Field label="Type"><select name="kind">{Object.entries(DOC).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Intitulé"><input name="label" /></Field>
            <Field label="Organisme"><input name="issuer" /></Field>
            <Field label="Référence"><input name="reference" /></Field>
            <Field label="Valable du"><input type="date" name="valid_from" /></Field>
            <Field label="Échéance"><input type="date" name="expires_on" /></Field>
            <Field label="Fichier"><input type="file" name="file" /></Field>
            <div><Submit>Ajouter</Submit></div>
          </ActionForm>
        </details>
      </section>

      <section>
        <h2>Entretien</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Date</th><th>Intervention</th><th className="num">Km</th><th className="num">Coût</th><th>Prochaine échéance</th><th /></tr></thead>
          <tbody>
            {maint.data?.map((m) => (
              <tr key={m.id}><td>{date(m.performed_on)}</td><td>{m.kind} <span className="muted small">{m.provider}</span></td><td className="num">{m.odometer_km?.toLocaleString('fr-FR')}</td><td className="num">{eur(m.cost_cents)}</td><td>{m.next_due_on ? date(m.next_due_on) : ''} {m.next_due_km ? `${m.next_due_km.toLocaleString('fr-FR')} km` : ''}</td>
                <td className="num"><ActionButton action={A.deleteVehicleRow.bind(null, 'vehicle_maintenance', m.id, id)} label="Supprimer" className="ghost" /></td></tr>
            ))}
            {!maint.data?.length && <tr><td colSpan={6} className="muted">Aucun entretien enregistré.</td></tr>}
          </tbody>
        </table></div>
        <details style={{ marginTop: 8 }}>
          <summary>Ajouter un entretien</summary>
          <ActionForm action={A.addMaintenance.bind(null, id)} resetOnOk>
            <Field label="Intervention"><input name="kind" required placeholder="Vidange, pneus…" /></Field>
            <Field label="Date"><input type="date" name="performed_on" required defaultValue={today} /></Field>
            <Field label="Kilométrage"><input type="number" name="odometer_km" defaultValue={v.mileage_km} /></Field>
            <Field label="Coût (€)"><input name="cost" inputMode="decimal" /></Field>
            <Field label="Prestataire"><input name="provider" /></Field>
            <Field label="Prochaine date"><input type="date" name="next_due_on" /></Field>
            <Field label="Prochain kilométrage"><input type="number" name="next_due_km" /></Field>
            <Field label="Notes"><input name="notes" /></Field>
            <div><Submit>Ajouter</Submit></div>
          </ActionForm>
        </details>
      </section>

      <section>
        <h2>Dépenses</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Date</th><th>Dépense</th><th>Catégorie</th><th className="num">Montant</th><th /></tr></thead>
          <tbody>
            {exp.data?.map((x) => <tr key={x.id}><td>{date(x.spent_on)}</td><td>{x.label}</td><td>{x.category}</td><td className="num">{eur(x.amount_cents)}</td><td className="num"><ActionButton action={A.deleteVehicleRow.bind(null, 'vehicle_expenses', x.id, id)} label="Supprimer" className="ghost" /></td></tr>)}
            {!exp.data?.length && <tr><td colSpan={5} className="muted">Aucune dépense enregistrée.</td></tr>}
          </tbody>
        </table></div>
        <details style={{ marginTop: 8 }}>
          <summary>Ajouter une dépense</summary>
          <ActionForm action={A.addExpense} resetOnOk>
            <input type="hidden" name="vehicle_id" value={id} />
            <Field label="Libellé"><input name="label" required /></Field>
            <Field label="Catégorie"><select name="category"><option>Assurance</option><option>Carburant</option><option>Lavage</option><option>Réparation</option><option>Crédit ou leasing</option><option>Autre</option></select></Field>
            <Field label="Montant (€)"><input name="amount" inputMode="decimal" required /></Field>
            <Field label="Date"><input type="date" name="spent_on" required defaultValue={today} /></Field>
            <div><Submit>Ajouter</Submit></div>
          </ActionForm>
        </details>
      </section>
    </div>
  );
}
