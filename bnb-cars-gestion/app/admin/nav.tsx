'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Nav({ items }: { items: { href: string; label: string; vip?: boolean }[] }) {
  const path = usePathname();
  const close = () => { const t = document.getElementById('nav-toggle') as HTMLInputElement | null; if (t) t.checked = false; };
  return <>{items.map((i) => {
    const current = i.href === '/admin' ? path === '/admin' : path.startsWith(i.href);
    return <Link key={i.href} href={i.href} onClick={close} className={`nav${i.vip ? ' vip' : ''}`} aria-current={current ? 'page' : undefined}>{i.label}</Link>;
  })}</>;
}
