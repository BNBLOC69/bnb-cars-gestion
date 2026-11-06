import Link from 'next/link';
import { db } from '@/lib/supabase/server';
import { VEHICLE_STATUS, eur } from '@/lib/format';

export default async function Fleet() {
  const s = await db();
  const [{ data, error }, docs] = await Promise.all([
    s.from('vehicle_catalog').select('*').order('sort_order'),
    s.from('vehicle_documents').select('vehicle_id,kind,label,expires_on').not('expires_on', 'is', null).lte('expires_on', new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)),
  ]);
  if (error) return <p className="notice error">{error.message}</p>;
  return (
    <div className="stack">
      <div className="page-head"><h1>Flotte</h1><Link className="btn" href="/admin/fleet/new">Ajouter un véhicule</Link></div>
      {docs.data && docs.data.length > 0 && (
        <p className="notice warn">{docs.data.length} document(s) de véhicule arrivent à échéance dans moins de 30 jours.</p>
      )}
      {!data?.length ? <p className="empty">Votre flotte est vide. Ajoutez votre premier véhicule.</p> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Véhicule</th><th>Catégorie</th><th>État</th><th>En ligne</th><th className="num">Km</th><th className="num">Jour</th><th className="num">Jour VIP</th><th className="num">Caution</th></tr></thead>
          <tbody>{data.map((v) => (
            <tr key={v.id} className="link-row">
              <td><Link className="strong" href={`/admin/fleet/${v.id}`}>{v.make} {v.model}</Link> <span className="muted small">{v.year}</span>{v.is_demo && <div className="small warn">Démonstration</div>}</td>
              <td>{v.category_name}</td>
              <td><span className={`tag ${v.current_status}`}>{VEHICLE_STATUS[v.current_status]}</span></td>
              <td>{v.is_published ? 'Oui' : <span className="muted">Non</span>}</td>
              <td className="num">{v.mileage_km.toLocaleString('fr-FR')}</td>
              <td className="num">{eur(v.daily_price_cents)}</td>
              <td className="num gold">{eur(v.vip_daily_display_cents)}</td>
              <td className="num">{eur(v.deposit_cents)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
