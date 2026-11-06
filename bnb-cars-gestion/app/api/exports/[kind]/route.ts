import { NextResponse, type NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { db } from '@/lib/supabase/server';
import { BOOKING_STATUS, DEPOSIT_STATUS, PAYMENT_KIND, PAYMENT_METHOD } from '@/lib/format';

const euro = (c: number | null | undefined) => (c == null ? null : Number(c) / 100);
type Col = [string, (r: any) => unknown]; // eslint-disable-line

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const q = req.nextUrl.searchParams;
  const from = q.get('from') ?? '2000-01-01';
  const to = q.get('to') ?? new Date().toISOString().slice(0, 10);
  const fromTs = new Date(from + 'T00:00:00+01:00').toISOString();
  const toTs = new Date(new Date(to + 'T00:00:00+01:00').getTime() + 864e5).toISOString();
  const s = await db();
  const { error: denied } = await s.rpc('require_perm', { perm: 'finance' });
  if (denied) return NextResponse.json({ error: denied.message }, { status: 403 });
  let rows: unknown[] = [];
  let cols: Col[] = [];
  let err: { message: string } | null = null;
  if (kind === 'payments') {
    const r = await s.from('finance_payments').select('*').gte('created_at', fromTs).lt('created_at', toTs).order('created_at');
    rows = r.data ?? []; err = r.error;
    cols = [['Date', (x) => x.paid_at ?? x.created_at], ['Client', (x) => x.customer_name], ['Réservation', (x) => x.booking_reference], ['Nature', (x) => PAYMENT_KIND[x.kind]], ['Moyen', (x) => PAYMENT_METHOD[x.method]], ['État', (x) => x.status], ['Montant (€)', (x) => euro(x.amount_cents)], ['Remboursé (€)', (x) => euro(x.refunded_cents)]];
  } else if (kind === 'deposits') {
    const r = await s.from('finance_deposits').select('*').gte('created_at', fromTs).lt('created_at', toTs).order('created_at');
    rows = r.data ?? []; err = r.error;
    cols = [['Réservation', (x) => x.booking_reference], ['Client', (x) => x.customer_name], ['Statut réservation', (x) => BOOKING_STATUS[x.booking_status]], ['État caution', (x) => DEPOSIT_STATUS[x.status]], ['Montant (€)', (x) => euro(x.amount_cents)], ['Retenu (€)', (x) => euro(x.captured_cents)], ['Libérée le', (x) => x.released_at]];
  } else if (kind === 'invoices') {
    const r = await s.from('invoices').select('*').gte('issued_at', fromTs).lt('issued_at', toTs).order('issued_at');
    rows = r.data ?? []; err = r.error;
    cols = [['Numéro', (x) => x.number], ['Type', (x) => x.type === 'credit_note' ? 'Avoir' : 'Facture'], ['Date', (x) => x.issued_at], ['Client', (x) => x.customer?.name], ['TTC (€)', (x) => euro(x.type === 'credit_note' ? -x.total_cents : x.total_cents)], ['TVA (€)', (x) => euro(x.type === 'credit_note' ? -x.vat_cents : x.vat_cents)]];
  } else if (kind === 'expenses') {
    const r = await s.from('vehicle_expenses').select('*').gte('spent_on', from).lte('spent_on', to).order('spent_on');
    rows = r.data ?? []; err = r.error;
    cols = [['Date', (x) => x.spent_on], ['Libellé', (x) => x.label], ['Catégorie', (x) => x.category], ['Véhicule', (x) => x.vehicle_id], ['Montant (€)', (x) => euro(x.amount_cents)]];
  } else if (kind === 'performance') {
    const r = await s.rpc('admin_vehicle_performance', { from_ts: fromTs, to_ts: toTs });
    rows = (r.data as unknown[]) ?? []; err = r.error;
    cols = [['Véhicule', (x) => x.vehicle], ['Locations', (x) => Number(x.rentals)], ['Jours', (x) => Number(x.rented_days)], ['Occupation (%)', (x) => Number(x.occupancy_percent)], ['Revenus (€)', (x) => euro(x.revenue_cents)], ['Dépenses (€)', (x) => euro(x.expenses_cents)], ['Résultat (€)', (x) => euro(x.profit_cents)]];
  } else return NextResponse.json({ error: 'Export inconnu' }, { status: 404 });
  if (err) return NextResponse.json({ error: err.message }, { status: 403 });

  const name = `bnb-${kind}-${from}-${to}`;
  if (q.get('format') === 'csv') {
    const esc = (v: unknown) => {
      let t = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
      if (/^[=+\-@]/.test(t) && typeof v !== 'number') t = `'${t}`; // neutralise les formules dans Excel
      return `"${t.replace(/"/g, '""')}"`;
    };
    const lines = [cols.map(([h]) => esc(h)).join(';'), ...rows.map((r) => cols.map(([, f]) => esc(f(r))).join(';'))];
    return new NextResponse('﻿' + lines.join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"` } });
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(kind);
  ws.addRow(cols.map(([h]) => h)).font = { bold: true };
  rows.forEach((r) => ws.addRow(cols.map(([, f]) => f(r))));
  ws.columns.forEach((c) => { c.width = 20; });
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${name}.xlsx"` } });
}
