import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/supabase/server';
import { ActionButton, ActionForm, Field, Submit } from '@/components/forms';
import { SignaturePad } from '@/components/signature';
import { dateTime, eur } from '@/lib/format';
import * as A from '../../../actions';

export default async function InspectionPage({ params }: { params: Promise<{ bookingId: string; type: string }> }) {
  const { bookingId, type } = await params;
  if (type !== 'departure' && type !== 'return') notFound();
  const s = await db();
  const { data: b } = await s.from('booking_details').select('*').eq('id', bookingId).maybeSingle();
  if (!b) notFound();
  const [insp, depart, contract, vehicle, photosMin] = await Promise.all([
    s.from('inspections').select('*').eq('booking_id', bookingId).eq('type', type).maybeSingle(),
    s.from('inspections').select('*').eq('booking_id', bookingId).eq('type', 'departure').maybeSingle(),
    s.from('contracts').select('*').eq('booking_id', bookingId).maybeSingle(),
    s.from('vehicles').select('mileage_km').eq('id', b.vehicle_id).single(),
    s.from('app_settings').select('value').eq('key', 'min_inspection_photos').maybeSingle(),
  ]);
  const i = insp.data;
  const [photos, damages] = i ? await Promise.all([
    s.from('inspection_photos').select('*').eq('inspection_id', i.id).order('taken_at'),
    s.from('inspection_damages').select('*').eq('inspection_id', i.id).order('created_at'),
  ]) : [{ data: [] }, { data: [] }];
  const urls: Record<string, string> = {};
  if (photos.data?.length) {
    const r = await s.storage.from('inspection-files').createSignedUrls(photos.data.map((p) => p.storage_path), 600);
    r.data?.forEach((u) => { if (u.path && u.signedUrl) urls[u.path] = u.signedUrl; });
  }
  const c = contract.data;
  const isDep = type === 'departure';
  const locked = !!i?.locked_at;
  const projectedExtra = !isDep && i && depart.data ? Math.max(0, i.odometer_km - depart.data.odometer_km - b.included_km) : 0;
  return (
    <div className="stack" style={{ maxWidth: 780 }}>
      <div>
        <p className="small muted"><Link href={`/admin/bookings/${bookingId}`}>{b.reference}</Link></p>
        <h1>{isDep ? 'Départ' : 'Retour'} : {b.vehicle_name}</h1>
        <p className="muted" style={{ marginTop: 6 }}>{b.customer_first_name} {b.customer_last_name}, {isDep ? `départ prévu le ${dateTime(b.starts_at)}` : `retour prévu le ${dateTime(b.ends_at)}`}</p>
      </div>

      {locked && <p className="notice ok">État des lieux signé et archivé le {dateTime(i!.signed_at)}. Il ne peut plus être modifié.</p>}

      {isDep && !locked && (
        <section className="stack-s">
          <h2>Contrat de location</h2>
          {!c && <ActionButton action={A.generateContract.bind(null, bookingId)} label="Générer le contrat" />}
          {c && <>
            <div className="contract-text">{c.body}</div>
            {c.customer_signed_at ? <p className="notice ok">Contrat signé le {dateTime(c.customer_signed_at)}.</p> : (
              <ActionForm action={A.signContract.bind(null, bookingId)} className="stack-s">
                <SignaturePad name="customer_signature" label="Signature du client" />
                <SignaturePad name="agent_signature" label="Signature de l'agence" />
                <Submit>Valider les signatures du contrat</Submit>
              </ActionForm>
            )}
          </>}
        </section>
      )}

      {!locked && (
        <section className="stack-s">
          <h2>Constat</h2>
          <ActionForm action={A.saveInspection.bind(null, bookingId, type)}>
            <Field label="Kilométrage"><input type="number" name="odometer_km" required inputMode="numeric" defaultValue={i?.odometer_km ?? vehicle.data?.mileage_km ?? ''} /></Field>
            <Field label="Carburant ou batterie (%)"><input type="number" name="energy_percent" required min={0} max={100} defaultValue={i?.energy_percent ?? (isDep ? 100 : '')} /></Field>
            {isDep ? <>
              <label className="check"><input type="checkbox" name="license_checked" defaultChecked={i?.license_checked} />Permis vérifié</label>
              <label className="check"><input type="checkbox" name="identity_checked" defaultChecked={i?.identity_checked} />Identité vérifiée</label>
            </> : <Field label="Autres frais (€)"><input name="other_fee" inputMode="decimal" defaultValue={i?.other_fee_cents ? (i.other_fee_cents / 100).toFixed(2) : ''} /></Field>}
            <Field label="Notes" wide><textarea name="notes" defaultValue={i?.notes ?? ''} /></Field>
            <Field label="Zone photographiée"><select name="photo_area"><option value="exterior">Extérieur</option><option value="interior">Intérieur</option><option value="odometer">Compteur</option><option value="damage">Dommage</option></select></Field>
            <Field label={`Photos (${photosMin.data?.value ?? 4} minimum au total)`}><input type="file" name="photos" accept="image/*" capture="environment" multiple /></Field>
            <div className="span-all"><Submit>{i ? 'Mettre à jour' : 'Enregistrer le constat'}</Submit></div>
          </ActionForm>
        </section>
      )}

      {photos.data && photos.data.length > 0 && (
        <section>
          <h2>Photos ({photos.data.length})</h2>
          <div className="photos">{photos.data.map((p) => <figure key={p.id}><a href={urls[p.storage_path]} target="_blank" rel="noreferrer"><img src={urls[p.storage_path]} alt={`Photo ${p.area}`} /></a><figcaption className="small muted">{dateTime(p.taken_at)}</figcaption></figure>)}</div>
        </section>
      )}

      {i && (
        <section className="stack-s">
          <h2>Dommages {isDep ? 'existants' : ''}</h2>
          {damages.data?.map((d) => (
            <div key={d.id} className="row between">
              <span><b>{d.location}</b> : {d.description} {d.is_new && <span className="tag failed">Nouveau, {eur(d.estimated_cost_cents)}</span>}</span>
              {!locked && <ActionButton action={A.removeDamage.bind(null, bookingId, type, d.id)} label="Retirer" className="ghost" />}
            </div>
          ))}
          {!damages.data?.length && <p className="muted small">Aucun dommage noté.</p>}
          {!locked && (
            <ActionForm action={A.addDamage.bind(null, bookingId, type, i.id)} resetOnOk>
              <Field label="Emplacement"><input name="location" required placeholder="Aile avant droite" /></Field>
              <Field label="Description"><input name="description" required /></Field>
              {!isDep && <>
                <label className="check"><input type="checkbox" name="is_new" defaultChecked />Nouveau dommage</label>
                <Field label="Coût estimé (€)"><input name="cost" inputMode="decimal" /></Field>
              </>}
              <div><Submit className="ghost">Noter ce dommage</Submit></div>
            </ActionForm>
          )}
        </section>
      )}

      {!isDep && i && !locked && depart.data && (
        <section>
          <h2>Calcul</h2>
          <dl className="kv">
            <dt>Parcourus</dt><dd>{i.odometer_km - depart.data.odometer_km} km</dd>
            <dt>Inclus</dt><dd>{b.included_km} km</dd>
            <dt>Supplémentaires</dt><dd>{projectedExtra} km, soit {eur(projectedExtra * b.extra_km_cents)}</dd>
            <dt>Carburant au départ</dt><dd>{depart.data.energy_percent} %</dd>
          </dl>
          <p className="small muted" style={{ marginTop: 6 }}>Le montant final, frais de carburant et dommages compris, est calculé par le serveur à la validation.</p>
        </section>
      )}
      {locked && !isDep && (
        <section>
          <h2>Frais</h2>
          <dl className="kv">
            <dt>Kilomètres supplémentaires ({i!.km_extra} km)</dt><dd>{eur(i!.extra_km_fee_cents)}</dd>
            <dt>Carburant</dt><dd>{eur(i!.energy_fee_cents)}</dd>
            <dt>Dommages</dt><dd>{eur(i!.damage_fee_cents)}</dd>
            <dt className="total">Total</dt><dd className="total">{eur(i!.fees_total_cents)}</dd>
          </dl>
        </section>
      )}

      {i && !locked && (
        <section className="stack-s">
          <h2>Validation {isDep ? 'du départ' : 'du retour'}</h2>
          <ActionForm action={A.finalizeInspection.bind(null, bookingId, type, i.id)} className="stack-s">
            <SignaturePad name="customer_signature" label="Signature du client" />
            <SignaturePad name="agent_signature" label="Signature de l'agent" />
            <Submit confirm="Une fois signé, cet état des lieux ne pourra plus être modifié. Continuer ?">{isDep ? 'Signer et remettre le véhicule' : 'Signer et clôturer la location'}</Submit>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
