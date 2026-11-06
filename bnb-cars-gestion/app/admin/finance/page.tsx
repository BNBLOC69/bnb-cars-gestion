import Link from 'next/link';
import { db } from '@/lib/supabase/server';
import { ActionForm, Field, Submit } from '@/components/forms';
import { DEPOSIT_STATUS, PAYMENT_KIND, PAYMENT_METHOD, date, dateTime, eur } from '@/lib/format';
import * as A from '../actions';

const monthStart = () => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)).toISOString().slice(0, 10); };

export default async function Finance({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const q = await searchParams;
  const from = q.from || monthStart();
  const to = q.to || new Date().toISOString().slice(0, 10);
  const fromTs = new Date(from + 'T00:00:00+01:00').toISOString();
  const toTs = new Date(new Date(to + 'T00:00:00+01:00').getTime() + 86400000).toISOString();
  const s = await db();
  const [sum, payments, deposits, invoices, perf, gifts, vehicles] = await Promise.all([
    s.rpc('admin_finance_summary', { from_ts: fromTs, to_ts: toTs }),
    s.from('finance_payments').select('*').order('created_at', { ascending: false }).gte('created_at', fromTs).lt('created_at', toTs).limit(200),
    s.from('finance_deposits').select('*').in('status', ['pending', 'authorized', 'captured', 'partially_captured', 'released', 'refunded']).order('ends_at', { ascending: false }).limit(100),
    s.from('invoices').select('*').order('issued_at', { ascending: false }).limit(100),
    s.rpc('admin_vehicle_performance', { from_ts: fromTs, to_ts: toTs }),
    s.from('gift_cards').select('*').order('created_at', { ascending: false }).limit(50),
    s.from('vehicles').select('id,make,model').order('sort_order'),
  ]);
  if (sum.error) return <p className="notice error">{sum.error.message}</p>;
  const f = sum.data as Record<string, number>;
  const range = `from=${from}&to=${to}`;
  const today = new Date().toISOString().slice(0, 10);
  const toRelease = deposits.data?.filter((d) => d.booking_status === 'completed' && ['authorized', 'captured'].includes(d.status)) ?? [];
  return (
    <div className="stack">
      <div className="page-head"><h1>Finances</h1></div>
      <form className="grid" method="get">
        <label className="field">Du<input type="date" name="from" defaultValue={from} /></label>
        <label className="field">Au<input type="date" name="to" defaultValue={to} /></label>
        <button className="ghost">Appliquer</button>
      </form>

      <div className="figures">
        <div className="figure lead"><b>{eur(f.rental_revenue_cents)}</b><span>Revenus des locations</span></div>
        <div className="figure lead"><b className="gold">{eur(f.vip_revenue_cents)}</b><span>Revenus des abonnements</span></div>
        <div className="figure lead"><b>{eur(f.expenses_cents)}</b><span>Dépenses véhicules</span></div>
        <div className="figure"><b>{eur(f.pending_cents)}</b><span>Paiements en attente</span></div>
        <div className="figure"><b>{eur(f.refunds_cents)}</b><span>Remboursements</span></div>
        <div className="figure"><b>{eur(f.gift_cards_sold_cents)}</b><span>Cartes cadeaux vendues</span></div>
      </div>
      <div className="figures" aria-label="Cautions, hors chiffre d'affaires">
        <div className="figure"><b>{eur(f.deposits_held_cents)}</b><span>Cautions détenues, hors chiffre d&apos;affaires</span></div>
        <div className="figure"><b>{eur(f.deposits_released_cents)}</b><span>Cautions libérées sur la période</span></div>
      </div>

      <section>
        <h2>Exports</h2>
        <div className="row">
          {[['payments', 'Paiements'], ['deposits', 'Cautions'], ['invoices', 'Factures'], ['expenses', 'Dépenses'], ['performance', 'Performance']].map(([k, l]) => (
            <span key={k} className="row" style={{ gap: 4 }}>
              <a className="btn ghost" href={`/api/exports/${k}?format=xlsx&${range}`}>{l} Excel</a>
              <a className="btn ghost" href={`/api/exports/${k}?format=csv&${range}`}>CSV</a>
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2>Paiements</h2>
        {!payments.data?.length ? <p className="empty">Aucun paiement sur cette période.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Client</th><th>Réservation</th><th>Nature</th><th>Moyen</th><th>État</th><th className="num">Montant</th><th className="num">Remboursé</th><th>Rembourser</th></tr></thead>
            <tbody>{payments.data.map((p) => (
              <tr key={p.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{dateTime(p.paid_at ?? p.created_at)}</td>
                <td>{p.customer_name}</td>
                <td>{p.booking_id ? <Link href={`/admin/bookings/${p.booking_id}`}>{p.booking_reference}</Link> : ''}</td>
                <td>{PAYMENT_KIND[p.kind]}</td><td>{PAYMENT_METHOD[p.method]}</td>
                <td><span className={`tag ${p.status}`}>{({ succeeded: 'Encaissé', pending: 'En attente', failed: 'Échec', refunded: 'Remboursé', partially_refunded: 'Remb. partiel' } as Record<string, string>)[p.status]}</span></td>
                <td className="num">{eur(p.amount_cents)}</td><td className="num">{p.refunded_cents ? eur(p.refunded_cents) : ''}</td>
                <td>{['succeeded', 'partially_refunded'].includes(p.status) && p.amount_cents > p.refunded_cents && (
                  <ActionForm action={A.refundPayment.bind(null, p.id)} className="row">
                    <input name="amount" inputMode="decimal" placeholder="€" aria-label="Montant à rembourser" style={{ width: 80 }} required />
                    <Submit className="ghost">Rembourser</Submit>
                  </ActionForm>
                )}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section id="cautions">
        <h2>Cautions à libérer</h2>
        {!toRelease.length ? <p className="empty">Aucune caution à libérer.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Réservation</th><th>Client</th><th>Retour</th><th>État</th><th className="num">Montant</th></tr></thead>
            <tbody>{toRelease.map((d) => <tr key={d.id}><td><Link className="strong" href={`/admin/bookings/${d.booking_id}#caution`}>{d.booking_reference}</Link></td><td>{d.customer_name}</td><td>{date(d.ends_at)}</td><td>{DEPOSIT_STATUS[d.status]}</td><td className="num">{eur(d.amount_cents)}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>

      <section>
        <h2>Rentabilité par véhicule</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Véhicule</th><th className="num">Locations</th><th className="num">Jours</th><th className="num">Occupation</th><th className="num">Revenus</th><th className="num">Dépenses</th><th className="num">Résultat</th></tr></thead>
          <tbody>{(perf.data as { vehicle_id: string; vehicle: string; rentals: number; rented_days: number; occupancy_percent: number; revenue_cents: number; expenses_cents: number; profit_cents: number }[] | null)?.map((p) => (
            <tr key={p.vehicle_id}><td><Link href={`/admin/fleet/${p.vehicle_id}`}>{p.vehicle}</Link></td><td className="num">{p.rentals}</td><td className="num">{p.rented_days}</td><td className="num">{p.occupancy_percent} %</td><td className="num">{eur(Number(p.revenue_cents))}</td><td className="num">{eur(Number(p.expenses_cents))}</td><td className="num">{eur(Number(p.profit_cents))}</td></tr>
          ))}</tbody>
        </table></div>
      </section>

      <section>
        <h2>Factures et avoirs</h2>
        {!invoices.data?.length ? <p className="empty">Aucune facture émise. Elles sont créées à la clôture de chaque location.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Numéro</th><th>Date</th><th>Client</th><th className="num">TTC</th><th className="num">TVA</th><th>Avoir</th></tr></thead>
            <tbody>{invoices.data.map((i) => (
              <tr key={i.id}>
                <td><a className="strong" href={`/api/pdf/invoice/${i.id}`}>{i.number}</a></td>
                <td>{date(i.issued_at)}</td><td>{(i.customer as { name?: string })?.name}</td>
                <td className="num">{i.type === 'credit_note' ? '−' : ''}{eur(i.total_cents)}</td><td className="num">{eur(i.vat_cents)}</td>
                <td>{i.type === 'invoice' && (
                  <ActionForm action={A.issueCreditNote.bind(null, i.id)} className="row">
                    <input name="amount" inputMode="decimal" placeholder="€" aria-label="Montant de l'avoir" required style={{ width: 80 }} />
                    <input name="reason" placeholder="Motif" aria-label="Motif" required style={{ width: 140 }} />
                    <Submit className="ghost">Émettre</Submit>
                  </ActionForm>
                )}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <div className="cols">
        <section>
          <h2>Enregistrer une dépense</h2>
          <ActionForm action={A.addExpense} resetOnOk>
            <Field label="Véhicule"><select name="vehicle_id"><option value="">Général</option>{vehicles.data?.map((v) => <option key={v.id} value={v.id}>{v.make} {v.model}</option>)}</select></Field>
            <Field label="Libellé"><input name="label" required /></Field>
            <Field label="Catégorie"><select name="category"><option>Assurance</option><option>Carburant</option><option>Lavage</option><option>Réparation</option><option>Crédit ou leasing</option><option>Autre</option></select></Field>
            <Field label="Montant (€)"><input name="amount" inputMode="decimal" required /></Field>
            <Field label="Date"><input type="date" name="spent_on" defaultValue={today} required /></Field>
            <div><Submit>Enregistrer</Submit></div>
          </ActionForm>
        </section>
        <section>
          <h2>Cartes cadeaux</h2>
          <div className="stack-s">
            {gifts.data?.map((g) => <p key={g.id} className="small"><b>{g.code}</b> {eur(g.balance_cents)} restants sur {eur(g.initial_cents)} {g.recipient_email}</p>)}
            <ActionForm action={A.createGiftCard} resetOnOk>
              <Field label="Montant (€)"><input name="amount" inputMode="decimal" required /></Field>
              <Field label="Destinataire"><input name="recipient_email" type="email" /></Field>
              <Field label="Expire le"><input name="expires_at" type="date" /></Field>
              <div><Submit>Créer une carte</Submit></div>
            </ActionForm>
          </div>
        </section>
      </div>
    </div>
  );
}
