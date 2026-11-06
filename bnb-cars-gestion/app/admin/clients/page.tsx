import Link from 'next/link';
import { db } from '@/lib/supabase/server';
import { VERIFICATION, date, eur } from '@/lib/format';

const SORTS: Record<string, [string, boolean]> = { recent: ['created_at', false], name: ['last_name', true], spent: ['spent_cents', false], last: ['last_booking_at', false] };

export default async function Clients({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const s = await db();
  const [col, asc] = SORTS[q.sort ?? 'recent'] ?? SORTS.recent;
  let query = s.from('client_directory').select('*').eq('role', 'client').is('anonymized_at', null).order(col, { ascending: asc, nullsFirst: false }).limit(300);
  if (q.q) {
    const t = q.q.replace(/[,()"*]/g, ' ').trim();
    query = query.or(`last_name.ilike.*${t}*,first_name.ilike.*${t}*,email.ilike.*${t}*,phone.ilike.*${t}*`);
  }
  if (q.vip === '1') query = query.eq('is_vip', true);
  if (q.verification) query = query.eq('verification', q.verification);
  const { data, error } = await query;
  if (error) return <p className="notice error">{error.message}</p>;
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Clients</h1>
        <div className="row"><Link className="btn ghost" href="/admin/clients/reviews">Modérer les avis</Link><Link className="btn" href="/admin/clients/new">Créer un client</Link></div>
      </div>
      <form className="grid" method="get">
        <label className="field">Recherche<input name="q" defaultValue={q.q} placeholder="Nom, email, téléphone" /></label>
        <label className="field">Dossier
          <select name="verification" defaultValue={q.verification ?? ''}><option value="">Tous</option>{Object.entries(VERIFICATION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="field">Trier par
          <select name="sort" defaultValue={q.sort ?? 'recent'}><option value="recent">Inscription récente</option><option value="name">Nom</option><option value="spent">Total dépensé</option><option value="last">Dernière location</option></select>
        </label>
        <label className="check"><input type="checkbox" name="vip" value="1" defaultChecked={q.vip === '1'} />VIP seulement</label>
        <button className="ghost">Filtrer</button>
      </form>
      {!data?.length ? <p className="empty">Aucun client ne correspond à cette recherche.</p> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Client</th><th>Contact</th><th>Dossier</th><th className="num">Locations</th><th className="num">Dépensé</th><th>Dernière location</th></tr></thead>
          <tbody>{data.map((c) => (
            <tr key={c.id} className="link-row">
              <td><Link className="strong" href={`/admin/clients/${c.id}`}>{c.first_name} {c.last_name}</Link> {c.is_vip && <span className="tag vip">VIP</span>} {c.is_blocked && <span className="tag failed">Bloqué</span>}</td>
              <td className="small">{c.email}<br />{c.phone}</td>
              <td><span className={`tag ${c.verification}`}>{VERIFICATION[c.verification]}</span></td>
              <td className="num">{c.bookings_count}</td>
              <td className="num">{eur(Number(c.spent_cents))}</td>
              <td>{date(c.last_booking_at)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
