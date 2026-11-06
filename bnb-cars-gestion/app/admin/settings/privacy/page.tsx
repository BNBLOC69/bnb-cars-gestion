import { db } from '@/lib/supabase/server';
import { ActionButton, ActionForm, Submit } from '@/components/forms';
import { decideDataRequest, handleDeletion } from '../../actions';
import { date } from '@/lib/format';

export default async function Privacy() {
  const s = await db();
  const { data, error } = await s.from('data_requests').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return <p className="notice error">{error.message}</p>;
  const ids = (data ?? []).map((d) => d.user_id).filter(Boolean);
  const { data: people } = ids.length ? await s.from('profiles').select('id,first_name,last_name,email').in('id', ids) : { data: [] };
  const who = Object.fromEntries((people ?? []).map((p) => [p.id, `${p.first_name ?? ''} ${p.last_name ?? ''} ${p.email ?? ''}`]));
  return (
    <div className="stack">
      <section>
        <h2>Demandes de suppression de compte</h2>
        <p className="small muted" style={{ marginBottom: 10 }}>La suppression efface le profil, les justificatifs et les notifications. Les factures restent archivées au titre de l&apos;obligation comptable. Les clients exportent eux-mêmes leurs données depuis leur compte.</p>
        {!data?.length ? <p className="empty">Aucune demande en cours.</p> : (
          <div className="stack-s">
            {data.map((d) => (
              <div key={d.id} className="row between" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
                <div>{who[d.user_id] ?? 'Compte supprimé'}<div className="small muted">{date(d.created_at)}, {d.status === 'open' ? 'à traiter' : d.status === 'done' ? 'traitée' : `refusée : ${d.note ?? ''}`}</div></div>
                {d.status === 'open' && d.user_id && (
                  <div className="row">
                    <ActionButton action={handleDeletion.bind(null, d.id, d.user_id)} label="Supprimer le compte" className="danger" confirm="Anonymiser ce compte ? Action définitive." />
                    <ActionForm action={decideDataRequest.bind(null, d.id)} className="row"><input name="note" required placeholder="Motif du refus" aria-label="Motif" /><Submit className="ghost">Refuser</Submit></ActionForm>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
