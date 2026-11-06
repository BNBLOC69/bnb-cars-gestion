import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = { title: 'BNB Cars, gestion', robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fr"><body>{children}</body></html>;
}
