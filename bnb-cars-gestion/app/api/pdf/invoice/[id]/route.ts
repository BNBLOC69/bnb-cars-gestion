import { NextResponse, type NextRequest } from 'next/server';
import { db, dbForToken } from '@/lib/supabase/server';
import { Doc } from '@/lib/pdf';
import { eur, date } from '@/lib/format';

// RLS : le client ne lit que ses factures, l'agence selon ses droits.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const s = token ? dbForToken(token) : await db();
  const { data: i } = await s.from('invoices').select('*').eq('id', id).maybeSingle();
  if (!i) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 });
  const d = await Doc.create();
  const c = i.company as Record<string, string>;
  const cu = i.customer as Record<string, string>;
  const credit = i.type === 'credit_note';
  d.text(c.trade_name || 'BNB Cars', { size: 16, bold: true });
  d.text([c.legal_name, c.legal_form, c.capital && `Capital ${c.capital}`].filter(Boolean).join(', '), { size: 9 });
  d.text(c.address, { size: 9 });
  d.text([c.siret && `SIRET ${c.siret}`, c.rcs && `RCS ${c.rcs}`, c.vat_number && `TVA ${c.vat_number}`].filter(Boolean).join(', '), { size: 9, gap: 16 });
  d.text(`${credit ? 'Avoir' : 'Facture'} ${i.number}`, { size: 14, bold: true });
  d.text(`Émise le ${date(i.issued_at)}`, { gap: 12 });
  d.text('Client', { bold: true });
  d.text(cu.name); d.text(cu.address ? `${cu.address} ${cu.postal_code ?? ''} ${cu.city ?? ''}` : ''); d.text(cu.email, { gap: 14 });
  d.row('Désignation', 'Montant TTC', { bold: true }); d.rule();
  for (const l of i.lines as { label: string; amount_cents: number }[]) d.row(l.label, eur(l.amount_cents));
  d.rule();
  const ht = i.total_cents - i.vat_cents;
  d.row('Total HT', eur(ht));
  d.row(`TVA ${Number(i.vat_rate)} %`, eur(i.vat_cents));
  d.row(credit ? 'Total de l\'avoir TTC' : 'Total TTC', eur(i.total_cents), { bold: true, size: 12 });
  if (i.reason) d.text(`Motif : ${i.reason}`, { gap: 8 });
  return new NextResponse(new Uint8Array(await d.done()), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${i.number}.pdf"` } });
}
