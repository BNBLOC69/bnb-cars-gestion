import { db } from '@/lib/supabase/server';
import { ActionButton } from '@/components/forms';
import { moderateReview } from '../../actions';
import { date } from '@/lib/format';

export default async function Reviews() {
  const s = await db();
  const { data } = await s.from('reviews').select('*').order('created_at', { ascending: false }).limit(100);
  return (
    <div className="stack">
      <h1>Avis clients</h1>
      <p className="muted">Un avis ne peut être déposé que par le client d&apos;une location terminée. Vous choisissez de le publier ou non.</p>
      {!data?.length ? <p className="empty">Aucun avis pour le moment. Les clients sont invités à en laisser un à la fin de leur location.</p> : data.map((r) => (
        <div key={r.id} className="stack-s" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 14 }}>
          <div className="row between"><b>{r.display_name}, {r.rating}/5</b><span className="small muted">{date(r.created_at)}</span></div>
          <p>{r.comment ?? <span className="muted">Sans commentaire</span>}</p>
          <div className="row">
            <span className={`tag ${r.status === 'published' ? 'verified' : r.status === 'rejected' ? 'rejected' : 'pending'}`}>{r.status === 'published' ? 'Publié' : r.status === 'rejected' ? 'Refusé' : 'À modérer'}</span>
            {r.status !== 'published' && <ActionButton action={moderateReview.bind(null, r.id, 'published')} label="Publier" />}
            {r.status !== 'rejected' && <ActionButton action={moderateReview.bind(null, r.id, 'rejected')} label="Refuser" className="ghost" />}
          </div>
        </div>
      ))}
    </div>
  );
}
