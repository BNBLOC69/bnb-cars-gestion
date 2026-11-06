'use server';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { headers } from 'next/headers';
import { db, dbService } from '@/lib/supabase/server';
import { fromParisInput } from '@/lib/format';
import { getStripe } from '@/lib/stripe';

type R = { error?: string; ok?: string } | undefined;
const S = (fd: FormData, k: string) => { const v = fd.get(k); return v == null ? '' : String(v).trim(); };
const N = (fd: FormData, k: string) => { const v = S(fd, k); return v === '' ? null : v; };
const I = (fd: FormData, k: string) => { const v = S(fd, k); return v === '' ? null : Number(v); };
const cents = (fd: FormData, k: string) => { const v = S(fd, k).replace(',', '.').replace(/\s/g, ''); return v === '' ? null : Math.round(Number(v) * 100); };
const B = (fd: FormData, k: string) => fd.get(k) === 'on';
const list = (fd: FormData, k: string) => S(fd, k).split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

function must<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
async function act(fn: () => Promise<string | void>, paths: string[] = []): Promise<R> {
  try {
    const ok = await fn();
    paths.forEach((p) => revalidatePath(p));
    return ok ? { ok } : { ok: 'Enregistré.' };
  } catch (e) {
    unstable_rethrow(e);
    return { error: e instanceof Error ? e.message : 'Une erreur est survenue.' };
  }
}
async function upload(bucket: string, path: string, file: Blob | Buffer, contentType: string) {
  const s = await db();
  const { error } = await s.storage.from(bucket).upload(path, file, { contentType, upsert: true });
  if (error) throw new Error(`Envoi du fichier impossible : ${error.message}`);
  return path;
}
const safeName = (n: string) => n.normalize('NFD').replace(/[^\w.-]+/g, '-').slice(-60);

export async function signOut() {
  const s = await db();
  await s.auth.signOut();
  redirect('/login');
}

export async function changePassword(_: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const { error } = await s.auth.updateUser({ password: S(fd, 'password') });
    if (error) throw new Error(error.message);
    return 'Mot de passe modifié.';
  });
}

// ---------------- Réservations ----------------
export async function setBookingStatus(id: string, status: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    must(await s.rpc('admin_set_booking_status', { booking: id, new_status: status, reason: N(fd, 'reason') }));
    return 'Réservation mise à jour.';
  }, [`/admin/bookings/${id}`, '/admin/bookings', '/admin']);
}
export async function updateBooking(id: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    must(await s.rpc('admin_update_booking', { booking: id, new_vehicle: S(fd, 'vehicle_id'), new_starts: fromParisInput(S(fd, 'starts_at')), new_ends: fromParisInput(S(fd, 'ends_at')), reason: S(fd, 'reason') }));
    return 'Réservation modifiée, prix recalculé.';
  }, [`/admin/bookings/${id}`]);
}
export async function overridePrice(id: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    must(await s.rpc('admin_override_price', { booking: id, new_total_cents: cents(fd, 'total'), reason: S(fd, 'reason') }));
    return 'Tarif modifié.';
  }, [`/admin/bookings/${id}`]);
}
export async function recordPayment(id: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    must(await s.rpc('admin_record_payment', { booking: id, amount: cents(fd, 'amount'), how: S(fd, 'method'), pay_kind: S(fd, 'kind'), memo: N(fd, 'note') }));
    return 'Paiement enregistré.';
  }, [`/admin/bookings/${id}`]);
}
export async function addComment(id: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const { data: { user } } = await s.auth.getUser();
    must(await s.from('booking_comments').insert({ booking_id: id, author_id: user!.id, body: S(fd, 'body') }));
    return 'Commentaire ajouté.';
  }, [`/admin/bookings/${id}`]);
}
export async function handleChangeRequest(id: string, bookingId: string, status: 'approved' | 'declined', _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const { data: { user } } = await s.auth.getUser();
    must(await s.from('booking_change_requests').update({ status, response: N(fd, 'response'), handled_by: user!.id, handled_at: new Date().toISOString() }).eq('id', id));
    return status === 'approved' ? 'Demande acceptée. Appliquez le changement sur la réservation.' : 'Demande refusée.';
  }, [`/admin/bookings/${bookingId}`]);
}
export async function createManualBooking(_: unknown, fd: FormData) {
  let id = '';
  const r = await act(async () => {
    const s = await db();
    const mode = S(fd, 'pickup_mode') || 'agency';
    const res = must(await s.rpc('admin_create_booking', { p: {
      customer_id: S(fd, 'customer_id'), vehicle_id: S(fd, 'vehicle_id'),
      starts_at: fromParisInput(S(fd, 'starts_at')), ends_at: fromParisInput(S(fd, 'ends_at')),
      pickup_mode: mode, return_mode: 'agency',
      pickup_location_id: mode === 'agency' ? S(fd, 'pickup_location_id') : null,
      return_location_id: S(fd, 'return_location_id') || S(fd, 'pickup_location_id') || null,
      delivery_address: N(fd, 'delivery_address'), delivery_postal_code: N(fd, 'delivery_postal_code'), delivery_city: N(fd, 'delivery_city'),
      options: fd.getAll('options').map((code) => ({ code })),
      promo_code: N(fd, 'promo_code'), source: S(fd, 'source') || 'phone', terms_accepted: true,
    } })) as { id: string };
    id = res.id;
  });
  if (r?.error) return r;
  redirect(`/admin/bookings/${id}`);
}
export async function createClient(_: unknown, fd: FormData) {
  let id = '';
  const r = await act(async () => {
    const s = await db();
    must(await s.rpc('require_perm', { perm: 'clients' }));
    const sv = dbService();
    const { data, error } = await sv.auth.admin.createUser({
      email: S(fd, 'email'), email_confirm: true,
      user_metadata: { first_name: S(fd, 'first_name'), last_name: S(fd, 'last_name'), phone: S(fd, 'phone') },
    });
    if (error) throw new Error(error.message.includes('already') ? 'Un compte existe déjà avec cet email.' : error.message);
    id = data.user.id;
    must(await sv.from('profiles').update({ birth_date: N(fd, 'birth_date'), license_issued_at: N(fd, 'license_issued_at'), license_number: N(fd, 'license_number') }).eq('id', id));
  });
  if (r?.error) return r;
  redirect(`/admin/clients/${id}`);
}

// ---------------- Caution ----------------
export async function updateDeposit(bookingId: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    must(await s.rpc('admin_update_deposit', { booking: bookingId, new_status: S(fd, 'status'), how: N(fd, 'method'), retained: cents(fd, 'retained'), memo: N(fd, 'note') }));
    return 'Caution mise à jour.';
  }, [`/admin/bookings/${bookingId}`, '/admin/finance']);
}
/** Libère ou encaisse une préautorisation Stripe, puis consigne l'opération. */
export async function settleStripeDeposit(bookingId: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const stripe = getStripe();
    if (!stripe) throw new Error('Stripe n\'est pas encore connecté.');
    const d = must(await s.from('deposits').select('*').eq('booking_id', bookingId).single()) as { stripe_payment_intent_id: string | null; amount_cents: number };
    if (!d.stripe_payment_intent_id) throw new Error('Cette caution n\'a pas été préautorisée en ligne.');
    const retained = cents(fd, 'retained') ?? 0;
    must(await s.rpc('require_perm', { perm: 'bookings' }));
    if (retained > d.amount_cents) throw new Error('Le montant retenu dépasse la caution.');
    if (retained > 0) await stripe.paymentIntents.capture(d.stripe_payment_intent_id, { amount_to_capture: retained });
    else await stripe.paymentIntents.cancel(d.stripe_payment_intent_id);
    must(await s.rpc('admin_update_deposit', { booking: bookingId, new_status: retained > 0 ? 'partially_captured' : 'released', how: 'stripe', retained: retained || null, memo: N(fd, 'note') }));
    return retained > 0 ? 'Retenue encaissée, le reste est libéré.' : 'Caution libérée.';
  }, [`/admin/bookings/${bookingId}`, '/admin/finance']);
}
export async function refundPayment(paymentId: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    must(await s.rpc('require_perm', { perm: 'finance' }));
    const p = must(await s.from('payments').select('*').eq('id', paymentId).single()) as { amount_cents: number; refunded_cents: number; method: string; stripe_payment_intent_id: string | null; booking_id: string | null };
    const amount = cents(fd, 'amount');
    if (!amount || amount <= 0 || amount > p.amount_cents - p.refunded_cents) throw new Error('Montant de remboursement invalide.');
    if (p.method === 'stripe') {
      const stripe = getStripe();
      if (!stripe) throw new Error('Stripe n\'est pas encore connecté.');
      if (!p.stripe_payment_intent_id) throw new Error('Ce paiement se rembourse depuis votre tableau de bord Stripe (abonnement VIP). Le remboursement sera ensuite enregistré automatiquement.');
      await stripe.refunds.create({ payment_intent: p.stripe_payment_intent_id, amount });
    }
    const refunded = p.refunded_cents + amount;
    must(await dbService().from('payments').update({ refunded_cents: refunded, status: refunded >= p.amount_cents ? 'refunded' : 'partially_refunded', note: N(fd, 'note') }).eq('id', paymentId));
    return 'Remboursement enregistré. Émettez l\'avoir correspondant si la facture a déjà été émise.';
  }, ['/admin/finance']);
}
export async function issueCreditNote(invoiceId: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    must(await s.rpc('admin_issue_credit_note', { invoice: invoiceId, amount: cents(fd, 'amount'), why: S(fd, 'reason') }));
    return 'Avoir émis.';
  }, ['/admin/finance']);
}
export async function addExpense(_: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    must(await s.from('vehicle_expenses').insert({ vehicle_id: N(fd, 'vehicle_id'), category: S(fd, 'category'), label: S(fd, 'label'), amount_cents: cents(fd, 'amount'), spent_on: S(fd, 'spent_on') }));
    return 'Dépense enregistrée.';
  }, ['/admin/finance', `/admin/fleet/${S(fd, 'vehicle_id')}`]);
}
export async function createGiftCard(_: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const code = 'CADEAU' + crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
    const amount = cents(fd, 'amount');
    if (!amount) throw new Error('Indiquez un montant.');
    must(await s.from('gift_cards').insert({ code, initial_cents: amount, balance_cents: amount, recipient_email: N(fd, 'recipient_email'), message: N(fd, 'message'), expires_at: N(fd, 'expires_at') }));
    return `Carte créée : ${code}`;
  }, ['/admin/finance']);
}

// ---------------- Flotte ----------------
function vehicleFromForm(fd: FormData) {
  return {
    category_id: S(fd, 'category_id'), slug: S(fd, 'slug') || `${S(fd, 'make')}-${S(fd, 'model')}-${S(fd, 'year')}`.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-'),
    make: S(fd, 'make'), model: S(fd, 'model'), trim_level: N(fd, 'trim_level'), year: I(fd, 'year'), engine: N(fd, 'engine'), power_hp: I(fd, 'power_hp'),
    fuel: S(fd, 'fuel'), transmission: S(fd, 'transmission'), seats: I(fd, 'seats'), doors: I(fd, 'doors'), mileage_km: I(fd, 'mileage_km') ?? 0, description: N(fd, 'description'),
    daily_price_cents: cents(fd, 'daily_price'), weekend_price_cents: cents(fd, 'weekend_price'), weekly_price_cents: cents(fd, 'weekly_price'), monthly_price_cents: cents(fd, 'monthly_price'),
    deposit_cents: cents(fd, 'deposit') ?? 0, included_km_per_day: I(fd, 'included_km_per_day') ?? 0, extra_km_cents: cents(fd, 'extra_km') ?? 0,
    min_age: I(fd, 'min_age') ?? 21, min_license_years: I(fd, 'min_license_years') ?? 2,
    vip_price_mode: S(fd, 'vip_price_mode'), vip_discount_percent: I(fd, 'vip_discount_percent'),
    vip_daily_price_cents: cents(fd, 'vip_daily_price'), vip_weekend_price_cents: cents(fd, 'vip_weekend_price'), vip_weekly_price_cents: cents(fd, 'vip_weekly_price'), vip_monthly_price_cents: cents(fd, 'vip_monthly_price'),
    vip_deposit_mode: S(fd, 'vip_deposit_mode'),
    vip_deposit_value: S(fd, 'vip_deposit_mode') === 'amount' ? cents(fd, 'vip_deposit_value') : I(fd, 'vip_deposit_value'),
    vip_early_access_until: N(fd, 'vip_early_access_until') && fromParisInput(S(fd, 'vip_early_access_until')),
    vip_exclusive_until: N(fd, 'vip_exclusive_until') && fromParisInput(S(fd, 'vip_exclusive_until')),
    status: S(fd, 'status'), booking_mode: N(fd, 'booking_mode'), prep_buffer_minutes: I(fd, 'prep_buffer_minutes') ?? 0,
    is_published: B(fd, 'is_published'), is_featured: B(fd, 'is_featured'),
    agency_id: N(fd, 'agency_id'),
  };
}
export async function saveVehicle(id: string | null, _: unknown, fd: FormData) {
  let newId = id;
  const r = await act(async () => {
    const s = await db();
    const v = vehicleFromForm(fd);
    if (id) must(await s.from('vehicles').update(v).eq('id', id));
    else newId = (must(await s.from('vehicles').insert(v).select('id').single()) as { id: string }).id;
    must(await s.from('vehicle_private').upsert({ vehicle_id: newId, registration: N(fd, 'registration'), vin: N(fd, 'vin'), purchase_date: N(fd, 'purchase_date'), purchase_price_cents: cents(fd, 'purchase_price'), notes: N(fd, 'private_notes') }));
    return 'Véhicule enregistré.';
  }, ['/admin/fleet', `/admin/fleet/${id}`]);
  if (!r?.error && !id) redirect(`/admin/fleet/${newId}`);
  return r;
}
export async function uploadVehiclePhotos(id: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const files = fd.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new Error('Choisissez au moins une photo.');
    const existing = must(await s.from('vehicle_photos').select('sort_order').eq('vehicle_id', id).order('sort_order', { ascending: false }).limit(1)) as { sort_order: number }[];
    let order = (existing[0]?.sort_order ?? -1) + 1;
    for (const f of files) {
      const path = `${id}/${crypto.randomUUID()}-${safeName(f.name)}`;
      await upload('vehicle-photos', path, f, f.type || 'image/jpeg');
      must(await s.from('vehicle_photos').insert({ vehicle_id: id, storage_path: path, sort_order: order++ }));
    }
    return `${files.length} photo(s) ajoutée(s).`;
  }, [`/admin/fleet/${id}`]);
}
export async function deleteVehiclePhoto(id: string, photoId: string, path: string, _: unknown) {
  return act(async () => {
    const s = await db();
    must(await s.from('vehicle_photos').delete().eq('id', photoId));
    await s.storage.from('vehicle-photos').remove([path]);
    return 'Photo supprimée.';
  }, [`/admin/fleet/${id}`]);
}
export async function makeCoverPhoto(id: string, photoId: string, _: unknown) {
  return act(async () => {
    const s = await db();
    const min = must(await s.from('vehicle_photos').select('sort_order').eq('vehicle_id', id).order('sort_order').limit(1)) as { sort_order: number }[];
    must(await s.from('vehicle_photos').update({ sort_order: (min[0]?.sort_order ?? 0) - 1 }).eq('id', photoId));
    return 'Photo principale modifiée.';
  }, [`/admin/fleet/${id}`]);
}
export async function blockDates(id: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    must(await s.rpc('admin_block_dates', { vehicle: id, starts: fromParisInput(S(fd, 'starts_at')), ends: fromParisInput(S(fd, 'ends_at')), why: S(fd, 'reason') }));
    return 'Dates bloquées.';
  }, [`/admin/fleet/${id}`, '/admin/calendar']);
}
export async function unblockDates(id: string, slot: string, _: unknown) {
  return act(async () => {
    const s = await db();
    must(await s.rpc('admin_unblock', { slot }));
    return 'Blocage retiré.';
  }, [`/admin/fleet/${id}`, '/admin/calendar']);
}
export async function addMaintenance(id: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    must(await s.from('vehicle_maintenance').insert({ vehicle_id: id, kind: S(fd, 'kind'), performed_on: S(fd, 'performed_on'), odometer_km: I(fd, 'odometer_km'), cost_cents: cents(fd, 'cost') ?? 0, provider: N(fd, 'provider'), notes: N(fd, 'notes'), next_due_on: N(fd, 'next_due_on'), next_due_km: I(fd, 'next_due_km') }));
    return 'Entretien enregistré.';
  }, [`/admin/fleet/${id}`]);
}
export async function addVehicleDocument(id: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    let path: string | null = null;
    const f = fd.get('file');
    if (f instanceof File && f.size > 0) path = await upload('fleet-documents', `${id}/${crypto.randomUUID()}-${safeName(f.name)}`, f, f.type || 'application/pdf');
    must(await s.from('vehicle_documents').insert({ vehicle_id: id, kind: S(fd, 'kind'), label: N(fd, 'label'), issuer: N(fd, 'issuer'), reference: N(fd, 'reference'), valid_from: N(fd, 'valid_from'), expires_on: N(fd, 'expires_on'), storage_path: path }));
    return 'Document enregistré.';
  }, [`/admin/fleet/${id}`]);
}
export async function deleteVehicleRow(table: 'vehicle_documents' | 'vehicle_maintenance' | 'vehicle_expenses', rowId: string, id: string, _: unknown) {
  return act(async () => {
    const s = await db();
    must(await s.from(table).delete().eq('id', rowId));
    return 'Supprimé.';
  }, [`/admin/fleet/${id}`]);
}
export async function announceVehicle(id: string, _: unknown) {
  return act(async () => {
    const s = await db();
    const n = must(await s.rpc('admin_announce_vehicle', { vehicle: id })) as number;
    return `${n} client(s) prévenu(s), les membres VIP en premier.`;
  });
}

// ---------------- Clients ----------------
export async function reviewDocument(docId: string, clientId: string, approve: boolean, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    must(await s.rpc('admin_review_document', { doc: docId, approve, why: N(fd, 'reason') }));
    return approve ? 'Document validé.' : 'Document refusé, le client est prévenu.';
  }, [`/admin/clients/${clientId}`]);
}
export async function addClientNote(clientId: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const { data: { user } } = await s.auth.getUser();
    must(await s.from('client_notes').insert({ client_id: clientId, author_id: user!.id, body: S(fd, 'body') }));
    return 'Note ajoutée.';
  }, [`/admin/clients/${clientId}`]);
}
export async function addIncident(clientId: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const { data: { user } } = await s.auth.getUser();
    must(await s.from('incidents').insert({ client_id: clientId, severity: S(fd, 'severity'), description: S(fd, 'description'), cost_cents: cents(fd, 'cost') ?? 0, created_by: user!.id }));
    return 'Incident enregistré.';
  }, [`/admin/clients/${clientId}`]);
}
export async function updateClient(clientId: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    must(await s.from('profiles').update({
      first_name: N(fd, 'first_name'), last_name: N(fd, 'last_name'), phone: N(fd, 'phone'), birth_date: N(fd, 'birth_date'),
      address_line: N(fd, 'address_line'), postal_code: N(fd, 'postal_code'), city: N(fd, 'city'),
      license_number: N(fd, 'license_number'), license_issued_at: N(fd, 'license_issued_at'), license_expires_at: N(fd, 'license_expires_at'),
    }).eq('id', clientId));
    return 'Fiche enregistrée.';
  }, [`/admin/clients/${clientId}`]);
}
export async function setClientBlocked(clientId: string, blocked: boolean, _: unknown) {
  return act(async () => {
    const s = await db();
    must(await s.rpc('require_perm', { perm: 'clients' }));
    must(await dbService().from('profiles').update({ is_blocked: blocked }).eq('id', clientId));
    return blocked ? 'Compte bloqué.' : 'Compte débloqué.';
  }, [`/admin/clients/${clientId}`]);
}

// ---------------- VIP ----------------
export async function vipAction(uid: string, kind: 'gift' | 'grant' | 'suspend' | 'reactivate', _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    if (kind === 'gift') must(await s.rpc('admin_gift_vip_month', { uid }));
    if (kind === 'grant') must(await s.rpc('admin_grant_vip', { uid, until: new Date(S(fd, 'until') + 'T23:59:00+01:00').toISOString() }));
    if (kind === 'suspend') must(await s.rpc('admin_suspend_vip', { uid, why: S(fd, 'reason') }));
    if (kind === 'reactivate') must(await s.rpc('admin_reactivate_vip', { uid }));
    return 'Statut VIP mis à jour.';
  }, ['/admin/vip', `/admin/clients/${uid}`]);
}
export async function savePlan(id: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    must(await s.from('vip_plans').update({ price_cents: cents(fd, 'price'), name: S(fd, 'name'), is_active: B(fd, 'is_active') }).eq('id', id));
    return 'Tarif enregistré. Il s\'applique aux nouveaux abonnements.';
  }, ['/admin/vip']);
}
export async function saveOffer(id: string | null, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const row = { title: S(fd, 'title'), body: N(fd, 'body'), kind: S(fd, 'kind'), vehicle_id: N(fd, 'vehicle_id'), promo_code_id: N(fd, 'promo_code_id'), valid_until: N(fd, 'valid_until'), is_published: B(fd, 'is_published') };
    if (id) must(await s.from('vip_offers').update(row).eq('id', id));
    else must(await s.from('vip_offers').insert(row));
    return 'Offre enregistrée.';
  }, ['/admin/vip']);
}
export async function notifyOffer(id: string, _: unknown) {
  return act(async () => {
    const s = await db();
    const n = must(await s.rpc('admin_notify_vip_offer', { offer: id })) as number;
    return `${n} membre(s) prévenu(s).`;
  }, ['/admin/vip']);
}
export async function deleteRow(table: 'vip_offers' | 'promo_codes' | 'delivery_zones' | 'rental_options' | 'locations' | 'long_term_discounts', id: string, path: string, _: unknown) {
  return act(async () => {
    const s = await db();
    must(await s.from(table).delete().eq('id', id));
    return 'Supprimé.';
  }, [path]);
}
export async function savePromo(id: string | null, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const type = S(fd, 'discount_type');
    const row = {
      code: S(fd, 'code').toUpperCase(), description: N(fd, 'description'), discount_type: type,
      discount_value: type === 'amount' ? cents(fd, 'discount_value') : I(fd, 'discount_value'),
      vip_only: B(fd, 'vip_only'), vehicle_id: N(fd, 'vehicle_id'), min_days: I(fd, 'min_days') ?? 1, valid_until: N(fd, 'valid_until'),
      max_uses: I(fd, 'max_uses'), max_uses_per_user: I(fd, 'max_uses_per_user') ?? 1, is_active: B(fd, 'is_active'),
    };
    if (id) must(await s.from('promo_codes').update(row).eq('id', id));
    else must(await s.from('promo_codes').insert(row));
    return 'Code enregistré.';
  }, ['/admin/vip']);
}
export async function moderateReview(id: string, status: 'published' | 'rejected', _: unknown) {
  return act(async () => {
    const s = await db();
    const { data: { user } } = await s.auth.getUser();
    must(await s.from('reviews').update({ status, moderated_by: user!.id, moderated_at: new Date().toISOString() }).eq('id', id));
    return status === 'published' ? 'Avis publié.' : 'Avis refusé.';
  }, ['/admin/clients/reviews']);
}

// ---------------- Paramètres ----------------
export async function saveSetting(key: string, kind: 'number' | 'text' | 'money', _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const raw = S(fd, 'value');
    const value = kind === 'text' ? raw : kind === 'money' ? Math.round(Number(raw.replace(',', '.')) * 100) : Number(raw);
    if (kind !== 'text' && Number.isNaN(value)) throw new Error('Entrez un nombre.');
    must(await s.from('app_settings').update({ value }).eq('key', key));
  }, ['/admin/settings']);
}
export async function saveCompany(_: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const value: Record<string, string> = {};
    for (const k of ['trade_name', 'legal_name', 'legal_form', 'capital', 'siret', 'vat_number', 'rcs', 'address', 'phone', 'email', 'whatsapp', 'insurance']) value[k] = S(fd, k);
    must(await s.from('app_settings').update({ value }).eq('key', 'company'));
  }, ['/admin/settings']);
}
export async function saveZone(id: string | null, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const row = {
      name: S(fd, 'name'), department_codes: list(fd, 'department_codes'), postal_codes: list(fd, 'postal_codes'), cities: list(fd, 'cities'),
      excluded_postal_codes: list(fd, 'excluded_postal_codes'), excluded_cities: list(fd, 'excluded_cities'),
      max_distance_km: I(fd, 'max_distance_km'), hours_start: S(fd, 'hours_start'), hours_end: S(fd, 'hours_end'),
      base_fee_cents: cents(fd, 'base_fee') ?? 0, fee_per_km_cents: cents(fd, 'fee_per_km') ?? 0, vip_free: B(fd, 'vip_free'), is_active: B(fd, 'is_active'),
    };
    if (id) must(await s.from('delivery_zones').update(row).eq('id', id));
    else must(await s.from('delivery_zones').insert(row));
  }, ['/admin/settings/delivery']);
}
export async function saveOption(id: string | null, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const row = {
      code: S(fd, 'code') || S(fd, 'name').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_'), name: S(fd, 'name'), description: N(fd, 'description'),
      pricing: S(fd, 'pricing'), price_cents: cents(fd, 'price') ?? 0, max_quantity: I(fd, 'max_quantity') ?? 1, adds_km: I(fd, 'adds_km') ?? 0,
      vip_discount_percent: I(fd, 'vip_discount_percent') ?? 0, is_insurance: B(fd, 'is_insurance'), is_active: B(fd, 'is_active'),
    };
    if (id) must(await s.from('rental_options').update(row).eq('id', id));
    else must(await s.from('rental_options').insert(row));
  }, ['/admin/settings/options']);
}
export async function saveDiscount(_: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    must(await s.from('long_term_discounts').upsert({ min_days: I(fd, 'min_days'), percent: I(fd, 'percent'), is_active: true }, { onConflict: 'min_days' }));
  }, ['/admin/settings/options']);
}
export async function saveLocation(id: string | null, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const row = { name: S(fd, 'name'), address: N(fd, 'address'), postal_code: N(fd, 'postal_code'), city: N(fd, 'city'), one_way_fee_cents: cents(fd, 'one_way_fee') ?? 0, allows_pickup: B(fd, 'allows_pickup'), allows_return: B(fd, 'allows_return'), is_active: B(fd, 'is_active'), agency_id: N(fd, 'agency_id') };
    if (id) must(await s.from('locations').update(row).eq('id', id));
    else must(await s.from('locations').insert(row));
  }, ['/admin/settings/delivery']);
}
export async function saveTemplate(code: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    must(await s.from('notification_templates').update({ subject: S(fd, 'subject'), body: S(fd, 'body'), send_email: B(fd, 'send_email'), send_push: B(fd, 'send_push'), is_active: B(fd, 'is_active') }).eq('code', code));
  }, ['/admin/settings/messages']);
}
export async function setRole(uid: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const role = S(fd, 'role');
    const perms = fd.getAll('perms').map(String);
    must(await s.rpc('admin_set_user_role', { uid, new_role: role, perms: role === 'agency_admin' || role === 'employee' ? (perms.length ? perms : null) : null }));
    return 'Rôle mis à jour.';
  }, ['/admin/settings/users']);
}
export async function inviteStaff(_: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    must(await s.rpc('require_perm', { perm: 'users' }));
    const sv = dbService();
    const email = S(fd, 'email');
    const { data, error } = await sv.auth.admin.createUser({ email, password: S(fd, 'password'), email_confirm: true, user_metadata: { first_name: S(fd, 'first_name'), last_name: S(fd, 'last_name') } });
    if (error) throw new Error(error.message);
    must(await s.rpc('admin_set_user_role', { uid: data.user.id, new_role: S(fd, 'role'), perms: null }));
    return `Compte créé pour ${email}. Transmettez-lui le mot de passe provisoire.`;
  }, ['/admin/settings/users']);
}
export async function purgeDemo(_: unknown) {
  return act(async () => {
    const s = await db();
    const r = must(await s.rpc('admin_purge_demo')) as { deleted: number; kept_with_bookings: number };
    return `${r.deleted} véhicule(s) de démonstration supprimé(s).${r.kept_with_bookings ? ` ${r.kept_with_bookings} conservé(s) car ils ont des réservations.` : ''}`;
  }, ['/admin/settings', '/admin/fleet']);
}
export async function handleDeletion(requestId: string, uid: string, _: unknown) {
  return act(async () => {
    const s = await db();
    const res = must(await s.rpc('admin_anonymize_user', { uid })) as { document_paths: string[] };
    const sv = dbService();
    if (res.document_paths.length) await sv.storage.from('customer-documents').remove(res.document_paths);
    await sv.auth.admin.deleteUser(uid, true).catch(() => null);
    return 'Compte anonymisé, justificatifs supprimés. Les factures restent archivées.';
  }, ['/admin/settings/privacy']);
}
export async function decideDataRequest(requestId: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const { data: { user } } = await s.auth.getUser();
    must(await s.from('data_requests').update({ status: 'declined', note: S(fd, 'note'), handled_by: user!.id, handled_at: new Date().toISOString() }).eq('id', requestId));
    return 'Réponse enregistrée.';
  }, ['/admin/settings/privacy']);
}

// ---------------- Contrats et états des lieux ----------------
async function saveSignature(bookingId: string, name: string, dataUrl: string) {
  if (!dataUrl.startsWith('data:image/png;base64,')) throw new Error('La signature est manquante.');
  const bin = Buffer.from(dataUrl.split(',')[1], 'base64');
  return upload('inspection-files', `${bookingId}/signatures/${name}-${Date.now()}.png`, bin, 'image/png');
}
export async function generateContract(bookingId: string, _: unknown) {
  return act(async () => {
    const s = await db();
    must(await s.rpc('admin_generate_contract', { booking: bookingId }));
    return 'Contrat généré, le client est prévenu.';
  }, [`/admin/inspections/${bookingId}/departure`, `/admin/bookings/${bookingId}`]);
}
export async function signContract(bookingId: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const h = await headers();
    const c = await saveSignature(bookingId, 'contrat-client', S(fd, 'customer_signature'));
    const a = await saveSignature(bookingId, 'contrat-agence', S(fd, 'agent_signature'));
    must(await s.rpc('admin_sign_contract', { booking: bookingId, customer_sig: c, agency_sig: a, ip: h.get('x-forwarded-for')?.split(',')[0] ?? null, ua: h.get('user-agent') }));
    return 'Contrat signé.';
  }, [`/admin/inspections/${bookingId}/departure`, `/admin/bookings/${bookingId}`]);
}
export async function saveInspection(bookingId: string, type: 'departure' | 'return', _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    const insp = must(await s.rpc('save_inspection_draft', { booking: bookingId, inspection_kind: type, p: {
      odometer_km: I(fd, 'odometer_km'), energy_percent: I(fd, 'energy_percent'), license_checked: B(fd, 'license_checked'), identity_checked: B(fd, 'identity_checked'),
      notes: N(fd, 'notes'), other_fee_cents: cents(fd, 'other_fee') ?? 0,
    } })) as { id: string };
    const files = fd.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
    const area = S(fd, 'photo_area') || 'exterior';
    for (const f of files) {
      const path = `${bookingId}/${type}/${crypto.randomUUID()}-${safeName(f.name)}`;
      await upload('inspection-files', path, f, f.type || 'image/jpeg');
      must(await s.from('inspection_photos').insert({ inspection_id: insp.id, storage_path: path, area }));
    }
    return files.length ? `État des lieux enregistré, ${files.length} photo(s) ajoutée(s).` : 'État des lieux enregistré.';
  }, [`/admin/inspections/${bookingId}/${type}`]);
}
export async function addDamage(bookingId: string, type: string, inspectionId: string, _: unknown, fd: FormData) {
  return act(async () => {
    const s = await db();
    must(await s.from('inspection_damages').insert({ inspection_id: inspectionId, location: S(fd, 'location'), description: S(fd, 'description'), is_new: type === 'return' && B(fd, 'is_new'), estimated_cost_cents: cents(fd, 'cost') ?? 0 }));
    return 'Dommage noté.';
  }, [`/admin/inspections/${bookingId}/${type}`]);
}
export async function removeDamage(bookingId: string, type: string, id: string, _: unknown) {
  return act(async () => {
    const s = await db();
    must(await s.from('inspection_damages').delete().eq('id', id));
    return 'Retiré.';
  }, [`/admin/inspections/${bookingId}/${type}`]);
}
export async function finalizeInspection(bookingId: string, type: 'departure' | 'return', inspectionId: string, _: unknown, fd: FormData) {
  const r = await act(async () => {
    const s = await db();
    const c = await saveSignature(bookingId, `${type}-client`, S(fd, 'customer_signature'));
    const a = await saveSignature(bookingId, `${type}-agent`, S(fd, 'agent_signature'));
    must(await s.rpc(type === 'departure' ? 'finalize_departure' : 'finalize_return', { inspection: inspectionId, customer_sig: c, agent_sig: a }));
  }, [`/admin/bookings/${bookingId}`, '/admin']);
  if (r?.error) return r;
  redirect(`/admin/bookings/${bookingId}`);
}
