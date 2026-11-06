import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth';
import { ActionButton, ActionForm, Field, Submit } from '@/components/forms';
import { BOOKING_STATUS, DEPOSIT_STATUS, PAYMENT_KIND, PAYMENT_METHOD, VERIFICATION, dateTime, eur, toParisInput } from '@/lib/format';
import * as A from '../../actions';
import { getStripe } from '@/lib/stripe';

export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await db();
  const me = await requireStaff();
  const { data: b } = await s.from('booking_details').select('*').eq('id', id).maybeSingle();
  if (!b) notFound();
  const [options, history, comments, payments, requests, deposit, vehicles, contract, invoice] = await Promise.all([
    s.from('booking_options').select('*').eq('booking_id', id),
    s.from('booking_status_history').select('*').eq('booking_id', id).order('occurred_at'),
    s.from('booking_comments').select('*').eq('booking_id', id).order('created_at'),
    s.from('payments').select('*').eq('booking_id', id).order('created_at'),
    s.from('booking_change_requests').select('*').eq('booking_id', id).order('created_at', { ascending: false }),
    s.from('deposits').select('*').eq('booking_id', id).maybeSingle(),
    s.from('vehicles').select('id,make,model').order('sort_order'),
    s.from('contracts').select('id,customer_signed_at').eq('booking_id', id).maybeSingle(),
    s.from('invoices').select('id,number').eq('booking_id', id).eq('type', 'invoice').maybeSingle(),
  ]);
  const can = me.perms.has('bookings');
  const open = !['completed', 'cancelled', 'refused', 'expired'].includes(b.status);
  const d = deposit.data;
  const balance = b.total_cents - b.paid_cents - (b.gift_card_id ? 0 : 0);
  const stripeOn = !!getStripe();
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="small muted"><Link href="/admin/bookings">Réservations</Link></p>
          <h1>{b.reference}</h1>
          <div className="row" style={{ marginTop: 8 }}>
            <span className={`tag ${b.status}`}>{BOOKING_STATUS[b.status]}</span>
            {b.is_vip && <span className="tag vip">Client VIP, prioritaire</span>}
            {b.delivery_needs_review && <span className="tag requested">Distance à vérifier</span>}
          </div>
        </div>
        <div className="row">
          {['confirmed', 'paid'].includes(b.status) && <Link className="btn" href={`/admin/inspections/${id}/departure`}>Faire le départ</Link>}
          {b.status === 'active' && <Link className="btn" href={`/admin/inspections/${id}/return`}>Faire le retour</Link>}
          {contract.data && <a className="btn ghost" href={`/api/pdf/contract/${id}`}>Contrat PDF</a>}
          {invoice.data && <a className="btn ghost" href={`/api/pdf/invoice/${invoice.data.id}`}>Facture {invoice.data.number}</a>}
          {['active', 'completed'].includes(b.status) && <a className="btn ghost" href={`/api/pdf/inspection/${id}`}>États des lieux PDF</a>}
        </div>
      </div>

      {can && b.status === 'requested' && (
        <section className="cols">
          <ActionButton action={A.setBookingStatus.bind(null, id, 'confirmed')} label="Accepter la demande" />
          <ActionForm action={A.setBookingStatus.bind(null, id, 'refused')} className="row">
            <input name="reason" placeholder="Motif du refus" required aria-label="Motif du refus" style={{ flex: 1, minWidth: 200 }} />
            <Submit className="danger">Refuser</Submit>
          </ActionForm>
        </section>
      )}

      <div className="cols-2-1">
        <div className="stack">
          <section>
            <h2>Location</h2>
            <dl className="kv">
              <dt>Véhicule</dt><dd>{b.vehicle_name}</dd>
              <dt>Départ</dt><dd>{dateTime(b.starts_at)}</dd>
              <dt>Retour</dt><dd>{dateTime(b.ends_at)}</dd>
              <dt>Remise</dt><dd>{b.pickup_mode === 'delivery' ? `Livraison : ${b.delivery_address ?? ''} ${b.delivery_postal_code ?? ''} ${b.delivery_city ?? ''}` : b.pickup_location_name}</dd>
              <dt>Restitution</dt><dd>{b.return_mode === 'delivery' ? 'Reprise à l\'adresse de livraison' : b.return_location_name}</dd>
              <dt>Kilométrage inclus</dt><dd>{b.included_km} km, puis {eur(b.extra_km_cents)}/km</dd>
              {b.customer_note && <><dt>Note du client</dt><dd>{b.customer_note}</dd></>}
            </dl>
          </section>

          {requests.data && requests.data.length > 0 && (
            <section>
              <h2>Demandes du client</h2>
              <div className="stack-s">
                {requests.data.map((r) => (
                  <div key={r.id} className="notice">
                    <b>{r.kind === 'cancellation' ? 'Annulation' : 'Modification'}</b> <span className="small muted">{dateTime(r.created_at)}</span>
                    <p>{r.message}</p>
                    {r.requested_starts_at && <p className="small">Dates souhaitées : {dateTime(r.requested_starts_at)} au {dateTime(r.requested_ends_at)}</p>}
                    {r.status === 'open' && can ? (
                      <div className="row" style={{ marginTop: 8 }}>
                        <ActionForm action={A.handleChangeRequest.bind(null, r.id, id, 'approved')} className="row"><input name="response" placeholder="Réponse (facultatif)" aria-label="Réponse" /><Submit>Accepter</Submit></ActionForm>
                        <ActionButton action={A.handleChangeRequest.bind(null, r.id, id, 'declined')} label="Refuser" className="ghost" />
                      </div>
                    ) : <p className="small muted">{r.status === 'approved' ? 'Acceptée' : r.status === 'declined' ? 'Refusée' : 'En attente'} {r.response}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {can && open && (
            <section className="stack-s">
              <h2>Modifier</h2>
              <details>
                <summary>Changer les dates ou le véhicule</summary>
                <ActionForm action={A.updateBooking.bind(null, id)}>
                  <Field label="Véhicule"><select name="vehicle_id" defaultValue={b.vehicle_id}>{vehicles.data?.map((v) => <option key={v.id} value={v.id}>{v.make} {v.model}</option>)}</select></Field>
                  <Field label="Départ"><input type="datetime-local" name="starts_at" defaultValue={toParisInput(b.starts_at)} required /></Field>
                  <Field label="Retour"><input type="datetime-local" name="ends_at" defaultValue={toParisInput(b.ends_at)} required /></Field>
                  <Field label="Motif" wide><input name="reason" required /></Field>
                  <div><Submit>Enregistrer et recalculer</Submit></div>
                </ActionForm>
              </details>
              <details>
                <summary>Modifier le tarif</summary>
                <ActionForm action={A.overridePrice.bind(null, id)}>
                  <Field label="Nouveau total TTC (€)"><input name="total" inputMode="decimal" required defaultValue={(b.total_cents / 100).toFixed(2)} /></Field>
                  <Field label="Justification" wide><input name="reason" required /></Field>
                  <div><Submit>Modifier le tarif</Submit></div>
                </ActionForm>
                {b.price_override_reason && <p className="small muted">Dernier motif : {b.price_override_reason}</p>}
              </details>
              <details>
                <summary>Annuler la réservation</summary>
                <ActionForm action={A.setBookingStatus.bind(null, id, 'cancelled')}>
                  <Field label="Motif" wide><input name="reason" required /></Field>
                  <div><Submit className="danger" confirm="Annuler cette réservation ?">Annuler la réservation</Submit></div>
                </ActionForm>
              </details>
            </section>
          )}

          <section>
            <h2>Commentaires internes</h2>
            <div className="stack-s">
              {comments.data?.map((c) => <p key={c.id}><span className="small muted">{dateTime(c.created_at)}</span><br />{c.body}</p>)}
              <ActionForm action={A.addComment.bind(null, id)} resetOnOk className="row">
                <input name="body" required placeholder="Ajouter un commentaire" aria-label="Commentaire" style={{ flex: 1, minWidth: 200 }} />
                <Submit className="ghost">Ajouter</Submit>
              </ActionForm>
            </div>
          </section>

          <section>
            <h2>Historique</h2>
            <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
              {history.data?.map((h) => <li key={h.id}>{dateTime(h.occurred_at)} : {BOOKING_STATUS[h.to_status]}{h.reason ? ` (${h.reason})` : ''}</li>)}
            </ol>
          </section>
        </div>

        <aside className="stack">
          <section>
            <h2>Client</h2>
            <p><Link className="strong" href={`/admin/clients/${b.customer_id}`} style={{ fontWeight: 600 }}>{b.customer_first_name} {b.customer_last_name}</Link></p>
            <p className="small">{b.customer_phone && <a href={`tel:${b.customer_phone}`}>{b.customer_phone}</a>}<br />{b.customer_email}</p>
            <p className="small" style={{ marginTop: 6 }}>Dossier : <span className={`tag ${b.customer_verification}`}>{VERIFICATION[b.customer_verification]}</span></p>
          </section>

          <section>
            <h2>Montants</h2>
            <dl className="kv">
              <dt>{b.rate_label}</dt><dd>{eur(b.rental_cents)}</dd>
              {options.data?.map((o) => <><dt key={o.id}>{o.name}{o.quantity > 1 ? ` x${o.quantity}` : ''}</dt><dd>{eur(o.total_cents)}</dd></>)}
              {b.delivery_cents > 0 && <><dt>Livraison</dt><dd>{eur(b.delivery_cents)}</dd></>}
              {b.one_way_cents > 0 && <><dt>Retour autre lieu</dt><dd>{eur(b.one_way_cents)}</dd></>}
              {b.promo_discount_cents > 0 && <><dt>Code promo</dt><dd>−{eur(b.promo_discount_cents)}</dd></>}
              <dt className="total">Total TTC</dt><dd className="total">{eur(b.total_cents)}</dd>
              <dt>Déjà réglé</dt><dd>{eur(b.paid_cents)}</dd>
              <dt>Reste à régler</dt><dd>{eur(Math.max(0, balance))}</dd>
              {b.vip_savings_cents > 0 && <><dt className="gold">Économie VIP</dt><dd className="gold">{eur(b.vip_savings_cents)}</dd></>}
            </dl>
          </section>

          <section className="stack-s">
            <h2>Paiements</h2>
            {payments.data?.length ? payments.data.map((p) => (
              <p key={p.id} className="small"><b>{eur(p.amount_cents)}</b> {PAYMENT_KIND[p.kind]}, {PAYMENT_METHOD[p.method]} <span className={`tag ${p.status}`}>{p.status === 'succeeded' ? 'Encaissé' : p.status === 'pending' ? 'En attente' : p.status === 'refunded' ? 'Remboursé' : p.status}</span><br /><span className="muted">{dateTime(p.paid_at ?? p.created_at)}</span></p>
            )) : <p className="small muted">Aucun paiement.</p>}
            {can && open && (
              <details>
                <summary>Enregistrer un paiement</summary>
                <ActionForm action={A.recordPayment.bind(null, id)} className="stack-s">
                  <Field label="Montant (€)"><input name="amount" inputMode="decimal" required /></Field>
                  <Field label="Moyen"><select name="method"><option value="card_terminal">Terminal carte</option><option value="bank_transfer">Virement</option><option value="cash">Espèces</option><option value="other">Autre</option></select></Field>
                  <Field label="Nature"><select name="kind"><option value="rental">Location</option><option value="balance">Solde</option><option value="extra_fees">Frais</option></select></Field>
                  <Field label="Note"><input name="note" /></Field>
                  <Submit>Enregistrer</Submit>
                </ActionForm>
              </details>
            )}
          </section>

          {d && (
            <section className="stack-s" id="caution">
              <h2>Caution</h2>
              <dl className="kv">
                <dt>Montant</dt><dd>{eur(d.amount_cents)}</dd>
                {b.deposit_saved_cents > 0 && <><dt className="gold">Réduction VIP</dt><dd className="gold">{eur(b.deposit_saved_cents)}</dd></>}
                <dt>État</dt><dd><span className={`tag ${d.status}`}>{DEPOSIT_STATUS[d.status]}</span></dd>
                {d.captured_cents > 0 && <><dt>Retenu</dt><dd>{eur(d.captured_cents)}</dd></>}
                {d.expires_at && d.status === 'authorized' && <><dt>Autorisation jusqu&apos;au</dt><dd>{dateTime(d.expires_at)}</dd></>}
              </dl>
              <p className="small muted">La caution ne compte pas dans le chiffre d&apos;affaires. Seule une retenue justifiée devient un revenu.</p>
              {can && d.amount_cents > 0 && d.stripe_payment_intent_id && d.status === 'authorized' && (
                <ActionForm action={A.settleStripeDeposit.bind(null, id)} className="stack-s">
                  <Field label="Montant à retenir (€, 0 pour tout libérer)"><input name="retained" inputMode="decimal" defaultValue="0" /></Field>
                  <Field label="Motif"><input name="note" /></Field>
                  <Submit>Solder la caution en ligne</Submit>
                </ActionForm>
              )}
              {can && d.amount_cents > 0 && d.status === 'pending' && stripeOn && <a className="btn ghost" href={`/api/checkout/deposit?booking=${id}`}>Lien de préautorisation carte</a>}
              {can && d.amount_cents > 0 && !d.stripe_payment_intent_id && !['released', 'refunded'].includes(d.status) && (
                <details>
                  <summary>Enregistrer une opération hors ligne</summary>
                  <ActionForm action={A.updateDeposit.bind(null, id)} className="stack-s">
                    <Field label="État"><select name="status" defaultValue={d.status}><option value="authorized">Préautorisée</option><option value="captured">Encaissée</option><option value="released">Libérée</option><option value="refunded">Remboursée</option></select></Field>
                    <Field label="Moyen"><select name="method"><option value="card_terminal">Terminal carte</option><option value="bank_transfer">Virement</option><option value="cash">Espèces</option></select></Field>
                    <Field label="Retenue (€)"><input name="retained" inputMode="decimal" /></Field>
                    <Field label="Note"><input name="note" /></Field>
                    <Submit>Enregistrer</Submit>
                  </ActionForm>
                </details>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
