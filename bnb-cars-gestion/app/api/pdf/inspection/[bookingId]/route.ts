import { NextResponse, type NextRequest } from 'next/server';
import { db, dbForToken } from '@/lib/supabase/server';
import { Doc } from '@/lib/pdf';
import { dateTime, eur } from '@/lib/format';

export async function GET(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const s = token ? dbForToken(token) : await db();
  const { data: list } = await s.from('inspections').select('*').eq('booking_id', bookingId).order('occurred_at');
  const { data: b } = await s.from('bookings').select('reference').eq('id', bookingId).maybeSingle();
  if (!b || !list?.length) return NextResponse.json({ error: 'État des lieux introuvable' }, { status: 404 });
  const d = await Doc.create();
  d.text(`États des lieux, réservation ${b.reference}`, { size: 15, bold: true, gap: 12 });
  for (const i of list) {
    d.text(i.type === 'departure' ? 'Départ' : 'Retour', { size: 13, bold: true });
    d.text(`Horodatage : ${dateTime(i.occurred_at)}${i.locked_at ? `, signé et archivé le ${dateTime(i.locked_at)}` : ', non signé'}`);
    d.row('Kilométrage', `${i.odometer_km} km`);
    d.row('Carburant ou batterie', `${i.energy_percent} %`);
    if (i.type === 'departure') { d.row('Permis vérifié', i.license_checked ? 'Oui' : 'Non'); d.row('Identité vérifiée', i.identity_checked ? 'Oui' : 'Non'); }
    if (i.notes) d.text(`Notes : ${i.notes}`);
    const { data: dmg } = await s.from('inspection_damages').select('*').eq('inspection_id', i.id);
    if (dmg?.length) { d.text('Dommages', { bold: true }); dmg.forEach((x) => d.text(`${x.location} : ${x.description}${x.is_new ? `, nouveau, ${eur(x.estimated_cost_cents)}` : ', existant'}`, { indent: 8 })); }
    if (i.type === 'return' && i.locked_at) {
      d.row('Kilomètres parcourus', `${i.km_driven} km (${i.km_included} inclus)`);
      d.row(`Kilomètres supplémentaires (${i.km_extra})`, eur(i.extra_km_fee_cents));
      d.row('Carburant', eur(i.energy_fee_cents));
      d.row('Dommages', eur(i.damage_fee_cents));
      d.row('Autres frais', eur(i.other_fee_cents));
      d.row('Total des frais', eur(i.fees_total_cents), { bold: true });
    }
    const { data: photos } = await s.from('inspection_photos').select('*').eq('inspection_id', i.id).order('taken_at').limit(12);
    if (photos?.length) {
      d.text(`Photos (${photos.length})`, { bold: true });
      let x = 48; let rowH = 0;
      for (const p of photos) {
        const { data } = await s.storage.from('inspection-files').download(p.storage_path);
        if (!data) continue;
        const img = await d.image(await data.arrayBuffer(), data.type, 160, 120);
        if (!img) continue;
        const h = (img.height / img.width) * 160;
        d.ensure(h + 8);
        d.page.drawImage(img, { x, y: d.y - h, width: 160, height: h });
        rowH = Math.max(rowH, h);
        x += 168;
        if (x > 400) { d.y -= rowH + 8; x = 48; rowH = 0; }
      }
      if (rowH) d.y -= rowH + 8;
    }
    for (const [label, path] of [['Signature du client', i.customer_signature_path], ['Signature de l\'agent', i.agent_signature_path]] as const) {
      if (!path) continue;
      const { data } = await s.storage.from('inspection-files').download(path);
      if (!data) continue;
      const img = await d.image(await data.arrayBuffer(), 'image/png', 150, 60);
      d.text(label, { bold: true });
      if (img) d.y -= d.drawImage(img, 150) + 6;
    }
    d.rule();
  }
  return new NextResponse(new Uint8Array(await d.done()), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="etats-des-lieux-${b.reference}.pdf"` } });
}
