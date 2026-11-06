import Link from 'next/link';
import { db } from '@/lib/supabase/server';
import { dateTime } from '@/lib/format';

const DAY = 86400000;
export default async function Calendar({ searchParams }: { searchParams: Promise<{ start?: string; vehicle?: string }> }) {
  const q = await searchParams;
  const startDate = q.start ? new Date(q.start + 'T00:00:00Z') : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const span = 28;
  const end = new Date(startDate.getTime() + span * DAY);
  const s = await db();
  const [vehicles, slots] = await Promise.all([
    s.from('vehicles').select('id,make,model').order('sort_order'),
    s.from('fleet_calendar').select('*').lt('starts_at', end.toISOString()).gt('ends_at', startDate.toISOString()),
  ]);
  const days = Array.from({ length: span }, (_, i) => new Date(startDate.getTime() + i * DAY));
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - startDate.getTime()) / (span * DAY)) * 100));
  const prev = new Date(startDate.getTime() - 14 * DAY).toISOString().slice(0, 10);
  const next = new Date(startDate.getTime() + 14 * DAY).toISOString().slice(0, 10);
  const veh = q.vehicle ? vehicles.data?.filter((v) => v.id === q.vehicle) : vehicles.data;
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Calendrier de la flotte</h1>
        <div className="row">
          <Link className="btn ghost" href={`/admin/calendar?start=${prev}`}>Quinzaine précédente</Link>
          <Link className="btn ghost" href="/admin/calendar">Aujourd&apos;hui</Link>
          <Link className="btn ghost" href={`/admin/calendar?start=${next}`}>Quinzaine suivante</Link>
        </div>
      </div>
      <p className="small muted">Noir : réservation. Or : client VIP. Pointillés : paiement en cours. Hachures : dates bloquées. Le temps de préparation après chaque retour est inclus.</p>
      {!vehicles.data?.length ? <p className="empty">Ajoutez un véhicule pour voir son calendrier.</p> : (
        <div className="gantt">
          <div className="gantt-grid" style={{ gridTemplateColumns: `170px repeat(${span}, 1fr)` }}>
            <div className="gantt-head" />
            {days.map((d) => {
              const dow = d.getUTCDay();
              return <div key={d.toISOString()} className={`gantt-day${dow === 0 || dow === 6 ? ' we' : ''}`}>{['D', 'L', 'M', 'M', 'J', 'V', 'S'][dow]}<br />{d.getUTCDate()}</div>;
            })}
            {veh?.map((v) => (
              <div key={v.id} style={{ display: 'contents' }}>
                <div className="gantt-veh" title={`${v.make} ${v.model}`}>{v.make} {v.model}</div>
                <div className="gantt-track" style={{ gridColumn: `span ${span}`, backgroundSize: `${100 / span}% 100%` }}>
                  {slots.data?.filter((x) => x.vehicle_id === v.id).map((x) => {
                    const l = pct(new Date(x.starts_at).getTime());
                    const r = pct(new Date(x.ends_at).getTime());
                    const label = x.kind === 'block' ? (x.reason ?? 'Bloqué') : x.customer_name;
                    const cls = x.kind === 'block' ? 'block' : x.kind === 'hold' ? 'hold' : x.is_vip ? 'vip' : '';
                    const style = { left: `${l}%`, width: `${Math.max(r - l, 1)}%` };
                    const title = `${label} : ${dateTime(x.starts_at)} au ${dateTime(x.ends_at)}`;
                    return x.booking_id
                      ? <Link key={x.id} href={`/admin/bookings/${x.booking_id}`} className={`gantt-bar ${cls}`} style={style} title={title}>{label}</Link>
                      : <Link key={x.id} href={`/admin/fleet/${v.id}#blocages`} className={`gantt-bar ${cls}`} style={style} title={title}>{label}</Link>;
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
