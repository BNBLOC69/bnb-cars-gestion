import Link from 'next/link';
import { db } from '@/lib/supabase/server';
import { ActionButton, ActionForm, Field, Submit } from '@/components/forms';
import { VIP_STATUS, date, eur } from '@/lib/format';
import * as A from '../actions';

export default async function Vip({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams;
  const s = await db();
  const [stats, members, plans, offers, promos, vehicles] = await Promise.all([
    s.rpc('admin_vip_stats'),
    s.from('vip_member_directory').select('*').order('created_at', { ascending: false }).limit(300),
    s.from('vip_plans').select('*').order('code', { ascending: false }),
    s.from('vip_offers').select('*').order('created_at', { ascending: false }),
    s.from('promo_codes').select('*').is('restricted_user_id', null).order('created_at', { ascending: false }),
    s.from('vehicles').select('id,make,model').order('sort_order'),
  ]);
  if (stats.error) return <p className="notice error">{stats.error.message}</p>;
  const st = stats.data as Record<string, number>;
  const list = (members.data ?? []).filter((m) => filter === 'expired' ? !m.is_currently_vip && m.status !== 'suspended' : filter === 'suspended' ? m.status === 'suspended' : filter === 'past_due' ? m.status === 'past_due' : filter === 'all' ? true : m.is_currently_vip);
  return (
    <div className="stack">
      <div className="page-head"><h1>Club VIP</h1></div>
      <div className="figures">
        <Link className="figure" href="/admin/vip"><b className="gold">{st.active}</b><span>Membres actifs</span></Link>
        <Link className="figure" href="/admin/vip?filter=expired"><b>{st.expired}</b><span>Expirés</span></Link>
        <Link className="figure" href="/admin/vip?filter=past_due"><b>{st.past_due}</b><span>Paiement en échec</span></Link>
        <Link className="figure" href="/admin/vip?filter=suspended"><b>{st.suspended}</b><span>Suspendus</span></Link>
        <div className="figure"><b>{eur(st.revenue_cents)}</b><span>Revenus des abonnements</span></div>
        <div className="figure"><b>{eur(st.savings_granted_cents)}</b><span>Économies accordées</span></div>
        <div className="figure"><b>{eur(st.deposit_reduction_cents)}</b><span>Cautions réduites</span></div>
      </div>

      <section>
        <h2>Membres</h2>
        {!list.length ? <p className="empty">Aucun membre dans cette vue.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Membre</th><th>État</th><th>Formule</th><th>Échéance</th><th className="num">Payé</th><th className="num">Économies</th></tr></thead>
            <tbody>{list.map((m) => (
              <tr key={m.id}>
                <td><Link className="strong" href={`/admin/clients/${m.user_id}`}>{m.first_name} {m.last_name}</Link><div className="small muted">{m.email}</div></td>
                <td><span className={`tag ${m.status}`}>{VIP_STATUS[m.status]}</span>{m.cancel_at_period_end && <div className="small warn">Résiliation prévue</div>}</td>
                <td>{m.source === 'manual' ? 'Accordé' : m.plan_code === 'annual' ? 'Annuel' : 'Mensuel'}</td>
                <td>{date(m.bonus_until && (!m.current_period_end || m.bonus_until > m.current_period_end) ? m.bonus_until : m.current_period_end)}</td>
                <td className="num">{eur(Number(m.paid_cents))}</td>
                <td className="num">{eur(Number(m.savings_cents))}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="small muted" style={{ marginTop: 8 }}>Pour accorder un statut, offrir un mois ou suspendre un accès, ouvrez la fiche du client.</p>
      </section>

      <section>
        <h2>Tarif de l&apos;abonnement</h2>
        <div className="stack-s">
          {plans.data?.map((p) => (
            <ActionForm key={p.id} action={A.savePlan.bind(null, p.id)}>
              <Field label="Nom"><input name="name" defaultValue={p.name} required /></Field>
              <Field label={p.code === 'annual' ? 'Prix par an (€)' : 'Prix par mois (€)'}><input name="price" inputMode="decimal" defaultValue={(p.price_cents / 100).toFixed(2)} required /></Field>
              <label className="check"><input type="checkbox" name="is_active" defaultChecked={p.is_active} />Proposé à la vente</label>
              <div><Submit>Enregistrer</Submit></div>
            </ActionForm>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>Un changement de prix s&apos;applique aux nouveaux abonnements. Les abonnés en cours gardent leur tarif. Les avantages généraux se règlent dans <Link href="/admin/settings">Paramètres</Link>, et véhicule par véhicule dans <Link href="/admin/fleet">Flotte</Link>.</p>
      </section>

      <section>
        <h2>Offres privées</h2>
        <div className="stack-s">
          {offers.data?.map((o) => (
            <div key={o.id} className="row between" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
              <div><b>{o.title}</b> {o.is_published ? <span className="tag verified">Publiée</span> : <span className="tag">Brouillon</span>}<div className="small muted">{o.body}</div>{o.notified_at && <div className="small muted">Membres prévenus le {date(o.notified_at)}</div>}</div>
              <div className="row">
                {o.is_published && !o.notified_at && <ActionButton action={A.notifyOffer.bind(null, o.id)} label="Prévenir les membres" className="gold-btn" />}
                <ActionButton action={A.deleteRow.bind(null, 'vip_offers', o.id, '/admin/vip')} label="Supprimer" className="ghost" confirm="Supprimer cette offre ?" />
              </div>
            </div>
          ))}
          <details>
            <summary>Créer une offre</summary>
            <ActionForm action={A.saveOffer.bind(null, null)} resetOnOk>
              <Field label="Titre"><input name="title" required /></Field>
              <Field label="Type"><select name="kind"><option value="promotion">Promotion</option><option value="weekend">Offre week-end</option><option value="preview">Avant-première</option><option value="event">Événement</option></select></Field>
              <Field label="Véhicule"><select name="vehicle_id"><option value="">Aucun</option>{vehicles.data?.map((v) => <option key={v.id} value={v.id}>{v.make} {v.model}</option>)}</select></Field>
              <Field label="Code promotionnel associé"><select name="promo_code_id"><option value="">Aucun</option>{promos.data?.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select></Field>
              <Field label="Valable jusqu'au"><input type="date" name="valid_until" /></Field>
              <Field label="Texte" wide><textarea name="body" /></Field>
              <label className="check"><input type="checkbox" name="is_published" />Publier maintenant</label>
              <div><Submit>Créer l&apos;offre</Submit></div>
            </ActionForm>
          </details>
        </div>
      </section>

      <section>
        <h2>Codes promotionnels</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Code</th><th>Remise</th><th>Conditions</th><th className="num">Utilisations</th><th /></tr></thead>
          <tbody>
            {promos.data?.map((p) => (
              <tr key={p.id}>
                <td><b>{p.code}</b> {!p.is_active && <span className="tag">Inactif</span>}<div className="small muted">{p.description}</div></td>
                <td>{p.discount_type === 'percent' ? `${p.discount_value} %` : eur(p.discount_value)}</td>
                <td className="small">{p.vip_only && <span className="tag vip">VIP</span>} {p.min_days > 1 && `${p.min_days} jours min.`} {p.valid_until && `Jusqu'au ${date(p.valid_until)}`}</td>
                <td className="num">{p.uses_count}{p.max_uses ? ` / ${p.max_uses}` : ''}</td>
                <td className="num"><ActionButton action={A.deleteRow.bind(null, 'promo_codes', p.id, '/admin/vip')} label="Supprimer" className="ghost" confirm="Supprimer ce code ?" /></td>
              </tr>
            ))}
            {!promos.data?.length && <tr><td colSpan={5} className="muted">Aucun code.</td></tr>}
          </tbody>
        </table></div>
        <details style={{ marginTop: 8 }}>
          <summary>Créer un code</summary>
          <ActionForm action={A.savePromo.bind(null, null)} resetOnOk>
            <Field label="Code"><input name="code" required style={{ textTransform: 'uppercase' }} /></Field>
            <Field label="Type"><select name="discount_type"><option value="percent">Pourcentage</option><option value="amount">Montant (€)</option></select></Field>
            <Field label="Valeur"><input name="discount_value" inputMode="decimal" required /></Field>
            <Field label="Durée minimum (jours)"><input name="min_days" type="number" defaultValue={1} /></Field>
            <Field label="Valable jusqu'au"><input name="valid_until" type="date" /></Field>
            <Field label="Utilisations totales"><input name="max_uses" type="number" /></Field>
            <Field label="Par client"><input name="max_uses_per_user" type="number" defaultValue={1} /></Field>
            <Field label="Véhicule"><select name="vehicle_id"><option value="">Tous</option>{vehicles.data?.map((v) => <option key={v.id} value={v.id}>{v.make} {v.model}</option>)}</select></Field>
            <Field label="Description" wide><input name="description" /></Field>
            <label className="check"><input type="checkbox" name="vip_only" />Réservé aux VIP</label>
            <label className="check"><input type="checkbox" name="is_active" defaultChecked />Actif</label>
            <div><Submit>Créer le code</Submit></div>
          </ActionForm>
        </details>
      </section>
    </div>
  );
}
