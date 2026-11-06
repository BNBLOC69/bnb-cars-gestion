import { ActionForm, Field, Submit } from '@/components/forms';
import { createClient } from '../../actions';

export default function NewClient() {
  return (
    <div className="stack">
      <h1>Créer un client</h1>
      <p className="muted">Pour une réservation prise par téléphone. Le client pourra récupérer l&apos;accès à son compte avec « Mot de passe oublié ».</p>
      <ActionForm action={createClient}>
        <Field label="Prénom"><input name="first_name" required /></Field>
        <Field label="Nom"><input name="last_name" required /></Field>
        <Field label="Email"><input name="email" type="email" required /></Field>
        <Field label="Téléphone"><input name="phone" type="tel" required /></Field>
        <Field label="Date de naissance"><input name="birth_date" type="date" /></Field>
        <Field label="Permis obtenu le"><input name="license_issued_at" type="date" /></Field>
        <Field label="N° de permis"><input name="license_number" /></Field>
        <div className="span-all"><Submit>Créer le client</Submit></div>
      </ActionForm>
    </div>
  );
}
