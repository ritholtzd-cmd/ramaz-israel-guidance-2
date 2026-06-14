// Edge Function: admin-bookings
// -----------------------------------------------------------------------------
// Password-protected admin endpoint. The bookings table has RLS with no anon
// access (it holds contact info), so reads/cancels go through here with the
// service role. The shared password is an Edge Function secret (ADMIN_PASSWORD)
// — it never ships to the browser.
//
// Actions (POST body): { password, action: 'list' | 'cancel', bookingId? }
// Deploy with --no-verify-jwt (it does its own password check + CORS).

import { createClient } from 'jsr:@supabase/supabase-js@2'

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

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ ok: false, error: 'BAD_REQUEST' }, 400) }

  if (!ADMIN_PASSWORD || body.password !== ADMIN_PASSWORD) {
    return json({ ok: false, error: 'UNAUTHORIZED' })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const action = body.action ?? 'list'

  if (action === 'list') {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, slots(starts_at, ends_at)')
      .order('created_at', { ascending: false })
    if (error) return json({ ok: false, error: error.message })
    return json({ ok: true, bookings: data })
  }

  if (action === 'cancel') {
    const id = body.bookingId
    if (!id) return json({ ok: false, error: 'MISSING_BOOKING_ID' })
    const { data: b } = await supabase.from('bookings').select('slot_id').eq('id', id).single()
    const { error: cancelErr } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', id)
    if (cancelErr) return json({ ok: false, error: cancelErr.message })
    // Free the slot so it can be booked again.
    if (b?.slot_id) {
      await supabase.from('slots').update({ status: 'open' }).eq('id', b.slot_id)
    }
    return json({ ok: true })
  }

  return json({ ok: false, error: 'UNKNOWN_ACTION' })
})
