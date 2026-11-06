'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [['/admin/settings', 'Mise en service'], ['/admin/settings/delivery', 'Livraison et lieux'], ['/admin/settings/options', 'Options et remises'], ['/admin/settings/messages', 'Messages'], ['/admin/settings/users', 'Utilisateurs'], ['/admin/settings/privacy', 'RGPD'], ['/admin/settings/audit', 'Journal']];
export function Tabs() {
  const p = usePathname();
  return <nav className="tabs" aria-label="Paramètres">{TABS.map(([h, l]) => <Link key={h} href={h} aria-current={p === h ? 'page' : undefined}>{l}</Link>)}</nav>;
}
