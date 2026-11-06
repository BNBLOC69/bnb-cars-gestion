import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth';
import { ActionButton, ActionForm, Field, Submit } from '@/components/forms';
import { BOOKING_STATUS, DEPOSIT_STATUS, DOC_TYPE, VERIFICATION, VIP_STATUS, date, dateTime, eur } from '@/lib/format';
import * as A from '../../actions';

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await db();
  const me = await requireStaff();
  const { data: c } = await s.from('profiles').select('*').eq('id', id).maybeSingle();
  if (!c) notFound();
  const [dir, docs, bookings, notes, incidents, vip, deposits] = await Promise.all([
    s.from('client_directory').select('is_vip,spent_cents,bookings_count').eq('id', id).single(),
    s.from('customer_documents').select('*').eq('user_id', id).order('created_at', { ascending: false }),
    s.from('booking_details').select('id,reference,status,vehicle_name,starts_at,ends_at,total_cents,is_vip').eq('customer_id', id).order('starts_at', { ascending: false }),
    s.from('client_notes').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    s.from('incidents').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    s.from('vip_memberships').select('*').eq('user_id', id).maybeSingle(),
    s.from('finance_deposits').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
  ]);
  const signed: Record<string, string> = {};
  if (docs.data?.length) {
    const { data: urls } = await s.storage.from('customer-documents').createSignedUrls(docs.data.map((d) => d.storage_path), 300);
    urls?.forEach((u) => { if (u.signedUrl && u.path) signed[u.path] = u.signedUrl; });
  }
  const canEdit = me.perms.has('clients');
  const canVip = me.perms.has('vip');
  const canReview = canEdit || me.perms.has('inspections');
  const isVip = dir.data?.is_vip;
  const m = vip.data;
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="small muted"><Link href="/admin/clients">Clients</Link></p>
          <h1>{c.first_name} {c.last_name}</h1>
          <div className="row" style={{ marginTop: 8 }}>
            <span className={`tag ${c.verification}`}>Dossier : {VERIFICATION[c.verification]}</span>
            {isVip && <span className="tag vip">Membre VIP</span>}
            {c.is_blocked && <span className="tag failed">Compte bloqué</span>}
          </div>
        </div>
        <div className="row">
          {me.perms.has('bookings') && <Link className="btn" href={`/admin/bookings/new?client=${id}`}>Ajouter une réservation</Link>}
          {canEdit && <ActionButton action={A.setClientBlocked.bind(null, id, !c.is_blocked)} label={c.is_blocked ? 'Débloquer' : 'Bloquer le compte'} className="ghost" confirm={c.is_blocked ? undefined : 'Bloquer ce compte ? Il ne pourra plus réserver.'} />}
        </div>
      </div>

      <div className="figures">
        <div className="figure"><b>{eur(Number(dir.data?.spent_cents ?? 0))}</b><span>Total dépensé</span></div>
        <div className="figure"><b>{dir.data?.bookings_count ?? 0}</b><span>Réservations</span></div>
        <div className="figure"><b>{incidents.data?.length ?? 0}</b><span>Incidents</span></div>
        <div className="figure"><b>{date(c.created_at)}</b><span>Client depuis</span></div>
      </div>

      <div className="cols-2-1">
        <div className="stack">
          <section>
            <h2>Documents</h2>
            {!docs.data?.length ? <p className="empty">Aucun document déposé.</p> : (
              <div className="stack-s">
                {docs.data.map((d) => (
                  <div key={d.id} className="row between" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
                    <div>
                      <b>{DOC_TYPE[d.type]}</b> <span className={`tag ${d.status}`}>{VERIFICATION[d.status]}</span>
                      <div className="small muted">Déposé le {date(d.created_at)}{d.rejection_reason ? `. Motif : ${d.rejection_reason}` : ''}</div>
                      {signed[d.storage_path] && <a className="small" href={signed[d.storage_path]} target="_blank" rel="noreferrer">Ouvrir le document</a>}
                    </div>
                    {canReview && d.status === 'pending' && (
                      <div className="row">
                        <ActionButton action={A.reviewDocument.bind(null, d.id, id, true)} label="Valider" />
                        <ActionForm action={A.reviewDocument.bind(null, d.id, id, false)} className="row">
                          <input name="reason" required placeholder="Motif du refus" aria-label="Motif du refus" />
                          <Submit className="danger">Refuser</Submit>
                        </ActionForm>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2>Historique des locations</h2>
            {!bookings.data?.length ? <p className="empty">Aucune réservation.</p> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Référence</th><th>Véhicule</th><th>Dates</th><th>Statut</th><th className="num">Total</th></tr></thead>
                <tbody>{bookings.data.map((b) => (
                  <tr key={b.id}>
                    <td><Link className="strong" href={`/admin/bookings/${b.id}`}>{b.reference}</Link></td>
                    <td>{b.vehicle_name}</td>
                    <td className="small">{dateTime(b.starts_at)}<br />{dateTime(b.ends_at)}</td>
                    <td><span className={`tag ${b.status}`}>{BOOKING_STATUS[b.status]}</span></td>
                    <td className="num">{eur(b.total_cents)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>

          <section>
            <h2>Cautions</h2>
            {!deposits.data?.length ? <p className="empty">Aucune caution.</p> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Réservation</th><th>État</th><th className="num">Montant</th><th className="num">Retenu</th></tr></thead>
                <tbody>{deposits.data.map((d) => <tr key={d.id}><td><Link href={`/admin/bookings/${d.booking_id}`}>{d.booking_reference}</Link></td><td>{DEPOSIT_STATUS[d.status]}</td><td className="num">{eur(d.amount_cents)}</td><td className="num">{eur(d.captured_cents)}</td></tr>)}</tbody>
              </table></div>
            )}
          </section>

          <section>
            <h2>Incidents</h2>
            <div className="stack-s">
              {incidents.data?.map((i) => <p key={i.id}><b>{i.severity === 'critical' ? 'Critique' : i.severity === 'major' ? 'Important' : 'Mineur'}</b> <span className="small muted">{date(i.created_at)}</span> {i.description} {i.cost_cents > 0 && <span>({eur(i.cost_cents)})</span>}</p>)}
              {canEdit && (
                <details>
                  <summary>Signaler un incident</summary>
                  <ActionForm action={A.addIncident.bind(null, id)} resetOnOk>
                    <Field label="Gravité"><select name="severity"><option value="minor">Mineur</option><option value="major">Important</option><option value="critical">Critique</option></select></Field>
                    <Field label="Coût (€)"><input name="cost" inputMode="decimal" /></Field>
                    <Field label="Description" wide><input name="description" required /></Field>
                    <div><Submit>Enregistrer</Submit></div>
                  </ActionForm>
                </details>
              )}
            </div>
          </section>

          <section>
            <h2>Notes internes</h2>
            <div className="stack-s">
              {notes.data?.map((n) => <p key={n.id}><span className="small muted">{dateTime(n.created_at)}</span><br />{n.body}</p>)}
              {canEdit && (
                <ActionForm action={A.addClientNote.bind(null, id)} resetOnOk className="row">
                  <input name="body" required placeholder="Ajouter une note" aria-label="Note" style={{ flex: 1, minWidth: 220 }} />
                  <Submit className="ghost">Ajouter</Submit>
                </ActionForm>
              )}
            </div>
          </section>
        </div>

        <aside className="stack">
          <section>
            <h2>Coordonnées</h2>
            {canEdit ? (
              <ActionForm action={A.updateClient.bind(null, id)} className="stack-s">
                <Field label="Prénom"><input name="first_name" defaultValue={c.first_name ?? ''} /></Field>
                <Field label="Nom"><input name="last_name" defaultValue={c.last_name ?? ''} /></Field>
                <Field label="Email (compte)"><input value={c.email ?? ''} disabled /></Field>
                <Field label="Téléphone"><input name="phone" defaultValue={c.phone ?? ''} /></Field>
                <Field label="Naissance"><input type="date" name="birth_date" defaultValue={c.birth_date ?? ''} /></Field>
                <Field label="Adresse"><input name="address_line" defaultValue={c.address_line ?? ''} /></Field>
                <Field label="Code postal"><input name="postal_code" defaultValue={c.postal_code ?? ''} /></Field>
                <Field label="Ville"><input name="city" defaultValue={c.city ?? ''} /></Field>
                <Field label="N° de permis"><input name="license_number" defaultValue={c.license_number ?? ''} /></Field>
                <Field label="Permis obtenu le"><input type="date" name="license_issued_at" defaultValue={c.license_issued_at ?? ''} /></Field>
                <Field label="Permis valable jusqu'au"><input type="date" name="license_expires_at" defaultValue={c.license_expires_at ?? ''} /></Field>
                <Submit>Enregistrer</Submit>
              </ActionForm>
            ) : <p className="small">{c.email}<br />{c.phone}<br />{c.address_line} {c.postal_code} {c.city}</p>}
          </section>

          {canVip && (
            <section className="stack-s">
              <h2 className="gold">Club VIP</h2>
              {m ? (
                <dl className="kv">
                  <dt>État</dt><dd>{VIP_STATUS[m.status]}</dd>
                  <dt>Origine</dt><dd>{m.source === 'stripe' ? 'Abonnement' : 'Accordé par l\'agence'}</dd>
                  {m.current_period_end && <><dt>Échéance</dt><dd>{date(m.current_period_end)}</dd></>}
                  {m.bonus_until && <><dt>Offert jusqu&apos;au</dt><dd>{date(m.bonus_until)}</dd></>}
                  {m.suspended_reason && <><dt>Motif</dt><dd>{m.suspended_reason}</dd></>}
                </dl>
              ) : <p className="small muted">Pas encore membre.</p>}
              <ActionForm action={A.vipAction.bind(null, id, 'grant')} className="row">
                <input type="date" name="until" required aria-label="Jusqu'au" style={{ flex: 1 }} />
                <Submit className="gold-btn">Accorder le statut VIP</Submit>
              </ActionForm>
              <ActionButton action={A.vipAction.bind(null, id, 'gift')} label="Offrir un mois" className="ghost" />
              {m && m.status !== 'suspended' && (
                <ActionForm action={A.vipAction.bind(null, id, 'suspend')} className="row">
                  <input name="reason" required placeholder="Motif" aria-label="Motif de suspension" style={{ flex: 1 }} />
                  <Submit className="danger">Suspendre</Submit>
                </ActionForm>
              )}
              {m?.status === 'suspended' && <ActionButton action={A.vipAction.bind(null, id, 'reactivate')} label="Lever la suspension" />}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
