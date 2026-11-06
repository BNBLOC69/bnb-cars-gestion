import { NextResponse, type NextRequest } from 'next/server';
import { dbService } from '@/lib/supabase/server';

async function sendEmail(to: string, subject: string, text: string) {
  const res = await fetch(process.env.RESEND_BASE_URL || 'https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
async function sendPush(tokens: string[], title: string, body: string, data: unknown) {
  const res = await fetch(process.env.EXPO_PUSH_URL || 'https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tokens.map((to) => ({ to, title, body, data }))),
  });
  if (!res.ok) throw new Error(`Expo ${res.status}`);
}

/** À déclencher toutes les 5 minutes par un planificateur (Vercel Cron, Supabase pg_cron...). */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  const sv = dbService();
  const { data: jobs, error } = await sv.rpc('run_scheduled_jobs');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: queue } = await sv.from('notifications').select('*')
    .or('email_status.eq.queued,push_status.eq.queued').lte('scheduled_at', new Date().toISOString()).lt('attempts', 5).order('scheduled_at').limit(100);
  let emails = 0, pushes = 0, failed = 0;
  const emailOn = !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  for (const n of queue ?? []) {
    const patch: Record<string, unknown> = { attempts: n.attempts + 1 };
    const { data: p } = await sv.from('profiles').select('email').eq('id', n.user_id).single();
    try {
      if (n.email_status === 'queued') {
        if (!p?.email) patch.email_status = 'skipped';
        else if (emailOn) { await sendEmail(p.email, n.title, n.body); patch.email_status = 'sent'; emails++; }
        // Sans clé email, le message reste en file et partira une fois le service connecté.
      }
      if (n.push_status === 'queued') {
        const { data: tokens } = await sv.from('push_tokens').select('token').eq('user_id', n.user_id);
        if (!tokens?.length) patch.push_status = 'skipped';
        else { await sendPush(tokens.map((t) => t.token), n.title, n.body, n.data); patch.push_status = 'sent'; pushes++; }
      }
    } catch (e) {
      failed++;
      patch.delivery_error = e instanceof Error ? e.message : String(e);
    }
    if (!emailOn && n.email_status === 'queued' && patch.email_status !== 'skipped') delete patch.attempts;
    await sv.from('notifications').update(patch).eq('id', n.id);
  }

  // Justificatifs arrivés au terme de leur durée de conservation
  const { data: paths } = await sv.rpc('purge_expired_documents');
  if (paths?.length) await sv.storage.from('customer-documents').remove(paths);

  return NextResponse.json({ jobs, emails, pushes, failed, email_configured: emailOn, purged_documents: paths?.length ?? 0 });
}
