import { redirect } from 'next/navigation';
import { db } from '@/lib/supabase/server';
import { ActionForm, Submit } from '@/components/forms';

async function signIn(_: unknown, fd: FormData) {
  'use server';
  const s = await db();
  const { error } = await s.auth.signInWithPassword({ email: String(fd.get('email')), password: String(fd.get('password')) });
  if (error) return { error: 'Email ou mot de passe incorrect.' };
  redirect('/admin');
}

export default async function Login({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  return (
    <main className="login">
      <div style={{ width: 'min(360px, 100%)' }}>
        <img src="/logo-white.png" alt="BNB Cars" width={200} />
        {denied && <p className="notice error" style={{ marginBottom: 14 }}>Ce compte n&apos;a pas accès à la gestion de l&apos;agence.</p>}
        <ActionForm action={signIn} className="">
          <label className="field">Email<input name="email" type="email" required autoComplete="username" /></label>
          <label className="field">Mot de passe<input name="password" type="password" required autoComplete="current-password" /></label>
          <Submit>Se connecter</Submit>
        </ActionForm>
      </div>
    </main>
  );
}
