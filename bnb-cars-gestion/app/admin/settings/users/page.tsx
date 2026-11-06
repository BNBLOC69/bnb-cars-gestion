import { db } from '@/lib/supabase/server';
import { ActionForm, Field, Submit } from '@/components/forms';
import { inviteStaff, setRole } from '../../actions';
import { fullName } from '@/lib/format';

const ROLES: Record<string, string> = { super_admin: 'Super administrateur', agency_admin: 'Administrateur d\'agence', employee: 'Employé', client: 'Client' };
const PERMS: [string, string][] = [['fleet', 'Flotte'], ['bookings', 'Réservations'], ['bookings.read', 'Voir les réservations'], ['clients', 'Clients'], ['clients.read', 'Voir les clients'], ['vip', 'Club VIP'], ['finance', 'Finances'], ['inspections', 'États des lieux'], ['settings', 'Paramètres'], ['users', 'Utilisateurs']];
const DEFAULTS: Record<string, string[]> = { agency_admin: ['fleet', 'bookings', 'bookings.read', 'clients', 'clients.read', 'vip', 'inspections'], employee: ['bookings.read', 'clients.read', 'inspections'] };

export default async function Users() {
  const s = await db();
  const { data, error } = await s.from('profiles').select('id,role,first_name,last_name,email,staff_permissions').neq('role', 'client').order('role');
  if (error) return <p className="notice error">{error.message}</p>;
  return (
    <div className="stack">
      <section className="stack-s">
        <h2>Équipe</h2>
        {data?.map((u) => (
          <details key={u.id}>
            <summary>{fullName(u)}, {ROLES[u.role]}<span className="small muted" style={{ marginLeft: 8 }}>{u.email}</span></summary>
            <ActionForm action={setRole.bind(null, u.id)} className="stack-s">
              <Field label="Rôle"><select name="role" defaultValue={u.role} style={{ maxWidth: 320 }}>{Object.entries(ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              {u.role !== 'super_admin' && (
                <fieldset>
                  <legend className="small muted">Permissions (vérifiées par le serveur)</legend>
                  <div className="row">{PERMS.map(([k, l]) => <label key={k} className="check" style={{ marginRight: 10 }}><input type="checkbox" name="perms" value={k} defaultChecked={(u.staff_permissions ?? DEFAULTS[u.role] ?? []).includes(k)} />{l}</label>)}</div>
                </fieldset>
              )}
              <div><Submit>Enregistrer</Submit></div>
            </ActionForm>
          </details>
        ))}
      </section>
      <section>
        <h2>Ajouter un membre de l&apos;équipe</h2>
        <ActionForm action={inviteStaff} resetOnOk>
          <Field label="Prénom"><input name="first_name" required /></Field>
          <Field label="Nom"><input name="last_name" required /></Field>
          <Field label="Email"><input name="email" type="email" required /></Field>
          <Field label="Mot de passe provisoire"><input name="password" required minLength={10} autoComplete="new-password" /></Field>
          <Field label="Rôle"><select name="role" defaultValue="employee"><option value="employee">Employé</option><option value="agency_admin">Administrateur d&apos;agence</option><option value="super_admin">Super administrateur</option></select></Field>
          <div><Submit>Créer le compte</Submit></div>
        </ActionForm>
        <p className="small muted" style={{ marginTop: 8 }}>La personne change son mot de passe provisoire dès sa première connexion, depuis « Mon mot de passe ».</p>
      </section>
    </div>
  );
}
