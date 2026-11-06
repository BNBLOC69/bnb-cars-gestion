import { Tabs } from './tabs';
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div><h1 style={{ marginBottom: 18 }}>Paramètres</h1><Tabs />{children}</div>;
}
