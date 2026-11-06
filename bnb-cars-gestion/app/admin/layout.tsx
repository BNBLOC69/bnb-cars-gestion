import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { signOut } from './actions';
import { Nav } from './nav';
import { fullName } from '@/lib/format';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  const items = [
    { href: '/admin', label: 'Tableau de bord', show: true },
    { href: '/admin/bookings', label: 'Réservations', show: me.perms.has('bookings.read') },
    { href: '/admin/calendar', label: 'Calendrier', show: me.perms.has('bookings.read') },
    { href: '/admin/fleet', label: 'Flotte', show: me.perms.has('fleet') },
    { href: '/admin/clients', label: 'Clients', show: me.perms.has('clients.read') },
    { href: '/admin/vip', label: 'Club VIP', show: me.perms.has('vip'), vip: true },
    { href: '/admin/finance', label: 'Finances', show: me.perms.has('finance') },
    { href: '/admin/settings', label: 'Paramètres', show: me.perms.has('settings') || me.perms.has('users') },
  ].filter((i) => i.show);
  return (
    <div className="app">
      <input type="checkbox" id="nav-toggle" className="sr" aria-label="Ouvrir le menu" />
      <div className="topbar">
        <img src="/logo-black.png" alt="BNB Cars" className="logo-light" />
        <img src="/logo-white.png" alt="BNB Cars" className="logo-dark" />
        <label htmlFor="nav-toggle">Menu</label>
      </div>
      <aside className="rail">
        <img src="/logo-black.png" alt="BNB Cars" className="logo logo-light" />
        <img src="/logo-white.png" alt="BNB Cars" className="logo logo-dark" />
        <Nav items={items} />
        <div className="who">
          <div style={{ color: 'var(--ink)' }}>{fullName(me)}</div>
          <Link href="/admin/account" className="small">Mon mot de passe</Link>
          <form action={signOut}><button className="ghost" style={{ marginTop: 8, width: '100%' }}>Se déconnecter</button></form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
