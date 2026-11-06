import Link from 'next/link';
import { db } from '@/lib/supabase/server';
import { DailyBars } from '@/components/charts';
import { eur, eur0, dateTime } from '@/lib/format';

type Row = { id: string; reference: string; starts_at?: string; ends_at?: string; is_vip: boolean; vehicle: string; customer: string };
const PERIODS = [[7, '7 jours'], [30, '30 jours'], [90, '90 jours'], [365, '12 mois']] as const;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const days = PERIODS.some(([d]) => String(d) === p) ? Number(p) : 30;
  const to = new Date(Date.now() + 86400000);
  const from = new Date(Date.now() - (days - 1) * 86400000);
  const s = await db();
  const { data, error } = await s.rpc('admin_dashboard', { from_ts: from.toISOString(), to_ts: to.toISOString() });
  if (error) return <p className="notice error">{error.message}</p>;
  const { operations: o, finance: f, upcoming_departures: dep, upcoming_returns: ret } = data as {
    operations: Record<string, number>; finance?: Record<string, number> & { series: { day: string; rentals: number; vip: number }[] };
    upcoming_departures: Row[]; upcoming_returns: Row[];
  };
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Tableau de bord</h1>
        <nav className="row" aria-label="Période">
          {PERIODS.map(([d, label]) => <Link key={d} href={`/admin?p=${d}`} className={`btn ${d === days ? '' : 'ghost'}`}>{label}</Link>)}
        </nav>
      </div>

      {f && (
        <section aria-label="Chiffre d'affaires">
          <div className="figures">
            <div className="figure lead"><b>{eur0(f.revenue_today)}</b><span>Chiffre d&apos;affaires du jour</span></div>
            <div className="figure lead"><b>{eur0(f.revenue_month)}</b><span>Ce mois-ci</span></div>
            <div className="figure lead"><b>{eur0(f.revenue_year)}</b><span>Cette année</span></div>
            <div className="figure lead"><b className="gold">{eur0(f.vip_revenue_month)}</b><span>Abonnements VIP ce mois-ci</span></div>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>Encaissements hors cautions. Les cartes cadeaux comptent à leur utilisation, pas à leur vente.</p>
        </section>
      )}

      <section aria-label="Activité">
        <div className="figures">
          <Link className="figure" href="/admin/bookings?status=requested"><b>{o.pending_requests}</b><span>Demandes à traiter</span></Link>
          <Link className="figure" href="/admin/bookings?status=active"><b>{o.active_rentals}</b><span>Locations en cours</span></Link>
          <Link className="figure" href="/admin/calendar"><b>{o.available_vehicles}</b><span>Véhicules disponibles</span></Link>
          <Link className="figure" href="/admin/fleet"><b>{o.maintenance_vehicles}</b><span>En entretien</span></Link>
          <div className="figure"><b>{o.occupancy_percent} %</b><span>Occupation sur la période</span></div>
          <Link className="figure" href="/admin/clients"><b>{o.customers}</b><span>Clients</span></Link>
          <Link className="figure" href="/admin/vip"><b className="gold">{o.active_vips}</b><span>Membres VIP actifs</span></Link>
          {f && <Link className="figure" href="/admin/finance"><b>{eur0(f.pending_payments_cents)}</b><span>Paiements en attente</span></Link>}
          {f && <Link className="figure" href="/admin/finance#cautions"><b>{f.deposits_to_release}</b><span>Cautions à libérer ({eur0(f.deposits_to_release_cents)})</span></Link>}
          <Link className="figure" href="/admin/clients?verification=pending"><b>{o.documents_to_review}</b><span>Documents à vérifier</span></Link>
          <Link className="figure" href="/admin/bookings?requests=open"><b>{o.open_change_requests}</b><span>Demandes de modification</span></Link>
        </div>
      </section>

      {f && (
        <section className="cols" aria-label="Évolution">
          <DailyBars title="Locations" color="var(--chart-a)" data={f.series.map((x) => ({ day: x.day, value: Number(x.rentals) }))} />
          <DailyBars title="Abonnements VIP" color="var(--chart-b)" data={f.series.map((x) => ({ day: x.day, value: Number(x.vip) }))} />
        </section>
      )}

      <div className="cols">
        <Moves title="Départs à venir" rows={dep} at="starts_at" empty="Aucun départ prévu." />
        <Moves title="Retours à venir" rows={ret} at="ends_at" empty="Aucune location en cours." />
      </div>
      {f && <p className="small muted">Période affichée : {eur(f.revenue_period)} de locations et {eur(f.vip_revenue_period)} d&apos;abonnements.</p>}
    </div>
  );
}

function Moves({ title, rows, at, empty }: { title: string; rows: Row[]; at: 'starts_at' | 'ends_at'; empty: string }) {
  return (
    <section>
      <h2>{title}</h2>
      {rows.length === 0 ? <p className="empty">{empty}</p> : (
        <div className="table-wrap"><table><tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{dateTime(r[at])}</td>
              <td><Link className="strong" href={`/admin/bookings/${r.id}`}>{r.vehicle}</Link><br /><span className="small muted">{r.customer}</span></td>
              <td className="num">{r.is_vip && <span className="tag vip">VIP</span>}</td>
            </tr>
          ))}
        </tbody></table></div>
      )}
    </section>
  );
}
