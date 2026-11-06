import { NextResponse, type NextRequest } from 'next/server';
import { db, dbForToken } from '@/lib/supabase/server';
import { Doc } from '@/lib/pdf';
import { dateTime } from '@/lib/format';

export async function GET(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const s = token ? dbForToken(token) : await db();
  const { data: c } = await s.from('contracts').select('*').eq('booking_id', bookingId).maybeSingle();
  if (!c) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 });
  const d = await Doc.create();
  d.text(c.body, { size: 10, gap: 14 });
  if (c.customer_signed_at) {
    d.rule();
    d.text(`Signé électroniquement le ${dateTime(c.customer_signed_at)}. Empreinte SHA-256 du texte : ${c.body_sha256}`, { size: 8, color: 0.35, gap: 8 });
    for (const [label, path] of [['Le locataire', c.customer_signature_path], ['Le loueur', c.agency_signature_path]] as const) {
      if (!path) continue;
      const { data } = await s.storage.from('inspection-files').download(path);
      if (!data) continue;
      const img = await d.image(await data.arrayBuffer(), 'image/png', 180, 70);
      d.text(label, { bold: true });
      if (img) d.y -= d.drawImage(img, 180) + 8;
    }
  }
  return new NextResponse(new Uint8Array(await d.done()), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="contrat-${bookingId.slice(0, 8)}.pdf"` } });
}
