// Edge Function: cancel-booking (public)
// Self-service cancellation from the link in the confirmation email.
// Auth is the pairing of booking id + unguessable cancel_token, so only someone
// holding the email can cancel. Two actions:
//   lookup -> booking summary for the confirmation page
//   cancel -> mark cancelled, reopen the slot, email school + staff
// Deploy with --no-verify-jwt.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { notifyCancellation } from '../_shared/notify.ts'

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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ ok: false, error: 'NOT_FOUND' }) }

  const bookingId = String(body.bookingId ?? '')
  const token = String(body.token ?? '')
  const action = body.action === 'cancel' ? 'cancel' : 'lookup'
  if (!UUID_RE.test(bookingId) || !UUID_RE.test(token)) {
    return json({ ok: false, error: 'NOT_FOUND' })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  const { data: b } = await supabase
    .from('bookings')
    .select('*, slots(starts_at, ends_at)')
    .eq('id', bookingId)
    .eq('cancel_token', token)
    .single()
  if (!b) return json({ ok: false, error: 'NOT_FOUND' })

  if (action === 'lookup') {
    return json({
      ok: true,
      booking: {
        program_name: b.program_name,
        contact_name: b.contact_name,
        status: b.status,
        starts_at: b.slots?.starts_at ?? null,
        ends_at: b.slots?.ends_at ?? null,
      },
    })
  }

  // action === 'cancel'
  if (b.status !== 'booked') return json({ ok: false, error: 'ALREADY_CANCELLED' })
  if (b.slots && new Date(b.slots.starts_at) < new Date()) {
    return json({ ok: false, error: 'PAST' })
  }

  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', b.id)
    .eq('status', 'booked')
  if (error) return json({ ok: false, error: 'CANCEL_FAILED' })
  if (b.slot_id) await supabase.from('slots').update({ status: 'open' }).eq('id', b.slot_id)

  const warnings = await notifyCancellation(supabase, b)
  await supabase.from('request_log').insert({
    ip, action: 'cancel_booking', result: 'cancelled',
    email_status: warnings.length ? 'failed' : 'sent', detail: null,
  })

  return json({ ok: true, warnings })
})
