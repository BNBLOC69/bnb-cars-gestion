import { db } from '@/lib/supabase/server';
import { dateTime } from '@/lib/format';

const TABLES: Record<string, string> = { bookings: 'Réservation', vehicles: 'Véhicule', payments: 'Paiement', deposits: 'Caution', invoices: 'Facture', contracts: 'Contrat', inspections: 'État des lieux', profiles: 'Profil', app_settings: 'Paramètre', vip_plans: 'Tarif VIP', vip_memberships: 'Abonnement VIP', delivery_zones: 'Zone', rental_options: 'Option', promo_codes: 'Code promo', gift_cards: 'Carte cadeau', vehicle_expenses: 'Dépense', customer_documents: 'Document' };
const ACTION: Record<string, string> = { insert: 'Création', update: 'Modification', delete: 'Suppression' };

export default async function Audit() {
  const s = await db();
  const { data, error } = await s.from('audit_log').select('*').order('occurred_at', { ascending: false }).limit(200);
  if (error) return <p className="notice error">{error.message}</p>;
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Date</th><th>Élément</th><th>Action</th><th>Détail</th></tr></thead>
      <tbody>{data?.map((a) => (
        <tr key={a.id}>
          <td style={{ whiteSpace: 'nowrap' }}>{dateTime(a.occurred_at)}</td>
          <td>{TABLES[a.table_name] ?? a.table_name}</td>
          <td>{ACTION[a.action]}</td>
          <td className="small muted">{a.action === 'update' ? Object.keys(a.changes ?? {}).join(', ') : ''}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}
