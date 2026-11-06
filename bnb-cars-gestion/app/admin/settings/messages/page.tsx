import { db } from '@/lib/supabase/server';
import { ActionForm, Field, Submit } from '@/components/forms';
import { saveTemplate } from '../../actions';

export default async function Messages() {
  const s = await db();
  const { data, error } = await s.from('notification_templates').select('*').order('name');
  if (error) return <p className="notice error">{error.message}</p>;
  return (
    <div className="stack-s">
      <p className="small muted">{'Les champs entre {{ }} sont remplacés à l\'envoi, par exemple {{first_name}}, {{vehicle}}, {{start_date}}, {{total}}.'}</p>
      {data?.map((t) => (
        <details key={t.code}>
          <summary>{t.name}{t.is_active ? '' : ' (désactivé)'}{t.is_marketing ? ', communication commerciale' : ''}</summary>
          <ActionForm action={saveTemplate.bind(null, t.code)} className="stack-s">
            <Field label="Objet"><input name="subject" defaultValue={t.subject} required /></Field>
            <Field label="Message"><textarea name="body" defaultValue={t.body} required /></Field>
            <div className="row">
              <label className="check"><input type="checkbox" name="send_email" defaultChecked={t.send_email} />Email</label>
              <label className="check"><input type="checkbox" name="send_push" defaultChecked={t.send_push} />Notification push</label>
              <label className="check"><input type="checkbox" name="is_active" defaultChecked={t.is_active} />Actif</label>
            </div>
            <div><Submit>Enregistrer</Submit></div>
          </ActionForm>
        </details>
      ))}
    </div>
  );
}
