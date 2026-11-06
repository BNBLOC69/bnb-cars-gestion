import { redirect } from 'next/navigation';
import { db } from './supabase/server';

export type Staff = { id: string; role: string; first_name: string | null; last_name: string | null; email: string | null; perms: Set<string> };

const ALL = ['fleet', 'bookings', 'bookings.read', 'clients', 'clients.read', 'vip', 'finance', 'settings', 'users', 'inspections'];
const DEFAULTS: Record<string, string[]> = {
  super_admin: ALL,
  agency_admin: ['fleet', 'bookings', 'bookings.read', 'clients', 'clients.read', 'vip', 'inspections'],
  employee: ['bookings.read', 'clients.read', 'inspections'],
};

/** Sert uniquement à l'affichage du menu : les droits réels sont vérifiés par la base. */
export async function requireStaff(): Promise<Staff> {
  const s = await db();
  const { data: { user } } = await s.auth.getUser();
  if (!user) redirect('/login');
  const { data: p } = await s.from('profiles').select('id,role,first_name,last_name,email,staff_permissions,is_blocked').eq('id', user.id).single();
  if (!p || p.is_blocked || !DEFAULTS[p.role]) redirect('/login?denied=1');
  return { ...p, perms: new Set(p.role === 'super_admin' ? ALL : (p.staff_permissions ?? DEFAULTS[p.role])) };
}
