import { db } from '@/lib/supabase/server';
import { VehicleForm } from '@/components/vehicle-form';
import { saveVehicle } from '../../actions';

export default async function NewVehicle() {
  const s = await db();
  const [c, a] = await Promise.all([s.from('vehicle_categories').select('id,name').order('sort_order'), s.from('agencies').select('id,name')]);
  return <div className="stack"><h1>Ajouter un véhicule</h1><VehicleForm action={saveVehicle.bind(null, null)} categories={c.data ?? []} agencies={a.data ?? []} /></div>;
}
