import { ActionForm, Field, Submit } from '@/components/forms';
import { changePassword } from '../actions';

export default function Account() {
  return (
    <div className="stack" style={{ maxWidth: 420 }}>
      <h1>Mon mot de passe</h1>
      <ActionForm action={changePassword} className="stack-s" resetOnOk>
        <Field label="Nouveau mot de passe (10 caractères minimum)"><input type="password" name="password" required minLength={10} autoComplete="new-password" /></Field>
        <Submit>Changer mon mot de passe</Submit>
      </ActionForm>
    </div>
  );
}
