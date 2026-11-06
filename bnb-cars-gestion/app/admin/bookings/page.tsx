import Link from 'next/link';
import { db } from '@/lib/supabase/server';
import { BOOKING_STATUS, dateTime, eur } from '@/lib/format';

type B = { id: string; reference: string; status: string; is_vip: boolean; starts_at: string; ends_at: string; vehicle_name: string; customer_first_name: string | null; customer_last_name: string | null; total_cents: number; paid_cents: number; source: string; open_change_requests: number };

export default async function Bookings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const s = await db();
  let query = s.from('booking_details').select('*').order('starts_at', { ascending: q.status !== 'completed' }).limit(200);
  if (q.status) query = query.eq('status', q.status);
  else query = query.not('status', 'in', '(expired)');
  if (q.vip === '1') query = query.eq('is_vip', true);
  if (q.from) query = query.gte('starts_at', q.from);
  if (q.to) query = query.lte('starts_at', q.to + 'T23:59:59');
  if (q.requests === 'open') query = query.gt('open_change_requests', 0);
  if (q.q) {
    const t = q.q.replace(/[,()"*]/g, ' ').trim();
    query = query.or(`reference.ilike.*${t}*,vehicle_name.ilike.*${t}*,customer_last_name.ilike.*${t}*,customer_email.ilike.*${t}*`);
  }
  const { data, error } = await query;
  if (error) return <p className="notice error">{error.message}</p>;
  let rows = (data ?? []) as B[];
  // Les demandes des membres VIP sont traitées en premier
  if (q.status === 'requested') rows = [...rows].sort((a, b) => Number(b.is_vip) - Number(a.is_vip) || a.starts_at.localeCompare(b.starts_at));
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Réservations</h1>
        <Link className="btn" href="/admin/bookings/new">Ajouter une réservation</Link>
      </div>
      <form className="grid" method="get">
        <label className="field">Recherche<input name="q" defaultValue={q.q} placeholder="Référence, client, véhicule" /></label>
        <label className="field">Statut
          <select name="status" defaultValue={q.status ?? ''}>
            <option value="">Tous</option>
            {Object.entries(BOOKING_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field">Départ à partir du<input type="date" name="from" defaultValue={q.from} /></label>
        <label className="field">Jusqu&apos;au<input type="date" name="to" defaultValue={q.to} /></label>
        <label className="check"><input type="checkbox" name="vip" value="1" defaultChecked={q.vip === '1'} />VIP seulement</label>
        <button type="submit" className="ghost">Filtrer</button>
      </form>
      {rows.length === 0 ? <p className="empty">Aucune réservation ne correspond à ces filtres.</p> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Référence</th><th>Client</th><th>Véhicule</th><th>Départ</th><th>Retour</th><th>Statut</th><th className="num">Total</th><th className="num">Réglé</th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="link-row">
                <td><Link className="strong" href={`/admin/bookings/${b.id}`}>{b.reference}</Link>{b.source !== 'app' && <div className="small muted">Par téléphone</div>}</td>
                <td>{b.customer_first_name} {b.customer_last_name} {b.is_vip && <span className="tag vip">VIP</span>}</td>
                <td>{b.vehicle_name}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{dateTime(b.starts_at)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{dateTime(b.ends_at)}</td>
                <td><span className={`tag ${b.status}`}>{BOOKING_STATUS[b.status]}</span>{b.open_change_requests > 0 && <div className="small warn">Demande à traiter</div>}</td>
                <td className="num">{eur(b.total_cents)}</td>
                <td className="num">{eur(b.paid_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
