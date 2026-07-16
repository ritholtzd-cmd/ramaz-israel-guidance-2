// Edge Function: send-reminders
// Runs daily (via external cron) to send 1-week and 24-hour reminder emails.
// Password-protected with the same ADMIN_PASSWORD secret.
// Safe to re-run — tracks sent_at timestamps to avoid duplicates.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { notifyBooking } from '../_shared/notify.ts'
import { syncUsSystems } from '../_shared/usSync.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ADMIN_PASSWORD = Deno.env.get('ADMIN_PASSWORD') ?? ''

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405)

  let body: Record<string, any>
  try { body = await req.json() } catch { return json({ ok: false, error: 'BAD_REQUEST' }, 400) }

  if (!ADMIN_PASSWORD || body.password !== ADMIN_PASSWORD) {
    return json({ ok: false, error: 'UNAUTHORIZED' })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const now = new Date()

  // 1-week window: 6d 20h → 7d 4h from now
  const weekLo = new Date(now.getTime() + (6 * 24 + 20) * 3600_000).toISOString()
  const weekHi = new Date(now.getTime() + (7 * 24 + 4) * 3600_000).toISOString()

  // 24-hour window: 20h → 28h from now
  const dayLo = new Date(now.getTime() + 20 * 3600_000).toISOString()
  const dayHi = new Date(now.getTime() + 28 * 3600_000).toISOString()

  // Query via slots table, then fetch bookings for matching slot IDs
  const [{ data: weekSlots }, { data: daySlots }] = await Promise.all([
    supabase.from('slots').select('id').gte('starts_at', weekLo).lte('starts_at', weekHi),
    supabase.from('slots').select('id').gte('starts_at', dayLo).lte('starts_at', dayHi),
  ])

  const weekSlotIds = (weekSlots ?? []).map((s: any) => s.id)
  const daySlotIds = (daySlots ?? []).map((s: any) => s.id)

  const [{ data: weekBookings }, { data: dayBookings }] = await Promise.all([
    weekSlotIds.length
      ? supabase.from('bookings').select('*, slots(starts_at, ends_at)')
          .eq('status', 'booked').is('week_reminder_sent_at', null).in('slot_id', weekSlotIds)
      : Promise.resolve({ data: [] }),
    daySlotIds.length
      ? supabase.from('bookings').select('*, slots(starts_at, ends_at)')
          .eq('status', 'booked').is('day_reminder_sent_at', null).in('slot_id', daySlotIds)
      : Promise.resolve({ data: [] }),
  ])

  const results = { week: { sent: 0, warnings: [] as string[] }, day: { sent: 0, warnings: [] as string[] } }

  for (const booking of weekBookings ?? []) {
    const warnings = await notifyBooking(supabase, booking, { weekReminder: true })
    if (warnings.length === 0) {
      await supabase.from('bookings').update({ week_reminder_sent_at: now.toISOString() }).eq('id', booking.id)
      results.week.sent++
    }
    results.week.warnings.push(...warnings)
  }

  for (const booking of dayBookings ?? []) {
    const warnings = await notifyBooking(supabase, booking, { dayReminder: true })
    if (warnings.length === 0) {
      await supabase.from('bookings').update({ day_reminder_sent_at: now.toISOString() }).eq('id', booking.id)
      results.day.sent++
    }
    results.day.warnings.push(...warnings)
  }

  // Daily self-heal: reconcile the US Systems mirror even if a live push failed.
  const usSync = await syncUsSystems(supabase)

  return json({ ok: true, results, usSync })
})
