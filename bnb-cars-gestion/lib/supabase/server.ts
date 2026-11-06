import { createServerClient } from '@supabase/ssr';
import { createClient as createPlain } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function db() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* lecture seule en rendu serveur */ }
      },
    },
  });
}

/** Client lié au jeton de l'appelant : la RLS s'applique. Pour les API appelées par l'application mobile. */
export function dbForToken(token: string) {
  return createPlain(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Clé serveur : contourne la RLS. Réservé aux webhooks, tâches planifiées et opérations contrôlées. */
export function dbService() {
  return createPlain(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
