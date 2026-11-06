import type { NextRequest } from 'next/server';
import { json, preflight } from '@/lib/api';
import { dbService } from '@/lib/supabase/server';

export const OPTIONS = preflight;

// Géocodage côté serveur via la Base Adresse Nationale, mis en cache pour la vérification des distances de livraison.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^\d{5}$/.test(code)) return json(req, { error: 'Code postal invalide.' }, 400);
  const sv = dbService();
  const { data: cached } = await sv.from('postal_code_geo').select('postal_code,city').eq('postal_code', code).maybeSingle();
  if (cached) return json(req, cached);
  try {
    const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${code}&type=municipality&limit=1&postcode=${code}`, { signal: AbortSignal.timeout(4000) });
    const f = (await res.json()).features?.[0];
    if (!f) return json(req, { postal_code: code, city: null });
    const row = { postal_code: code, city: f.properties.city, longitude: f.geometry.coordinates[0], latitude: f.geometry.coordinates[1] };
    await sv.from('postal_code_geo').upsert(row);
    return json(req, { postal_code: code, city: row.city });
  } catch {
    // Service indisponible : la livraison sera signalée « à vérifier » à l'agence si la zone a une distance maximale.
    return json(req, { postal_code: code, city: null, unavailable: true });
  }
}
