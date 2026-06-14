// Edge Function: admin-bookings
// -----------------------------------------------------------------------------
// Password-protected admin endpoint. Bookings hold contact info and RLS gives
// anon no access, so all reads/writes go through here with the service role.
// The shared password is the ADMIN_PASSWORD secret — never shipped to browsers.
//
// Actions (POST body): { password, action, ... }
//   list                            -> all bookings (+ slot times)
//   cancel { bookingId }            -> cancel + reopen the slot
//   create { fields, sendEmail }    -> manual booking on an open slot
//   update { bookingId, fields, sendEmail } -> edit a booking's details
// Deploy with --no-verify-jwt.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { notifyBooking } from '../_shared/notify.ts'

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

const clean = (v: unknown) => {
  const s = (v ?? '').toString().trim()
  return s === '' ? null : s
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405)

  let body: Record<string, any>
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
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return json({ ok: false, error: error.message })
    if (b?.slot_id) await supabase.from('slots').update({ status: 'open' }).eq('id', b.slot_id)
    return json({ ok: true })
  }

  if (action === 'create') {
    const f = body.fields ?? {}
    const { data: booking, error } = await supabase.rpc('create_booking', {
      p_slot_id: f.slotId,
      p_program_name: f.programName,
      p_program_types: clean(f.programTypes),
      p_contact_name: f.contactName,
      p_contact_email: f.contactEmail,
      p_phone: clean(f.phone),
      p_presenter_name: clean(f.presenterName),
      p_presenter_email: clean(f.presenterEmail),
      p_presenter_phone: clean(f.presenterPhone),
      p_bringing_alum: !!f.bringingAlum,
      p_av_needs: clean(f.avNeeds),
    })
    if (error) {
      const taken = error.message?.includes('SLOT_UNAVAILABLE')
      return json({ ok: false, error: taken ? 'SLOT_UNAVAILABLE' : error.message })
    }
    const warnings = await notifyBooking(supabase, booking, { confirm: !!body.sendEmail, staff: false })
    return json({ ok: true, booking, warnings })
  }

  if (action === 'update') {
    const id = body.bookingId
    const f = body.fields ?? {}
    if (!id) return json({ ok: false, error: 'MISSING_BOOKING_ID' })
    const { data: booking, error } = await supabase
      .from('bookings')
      .update({
        program_name: clean(f.programName),
        program_types: clean(f.programTypes),
        contact_name: clean(f.contactName),
        contact_email: clean(f.contactEmail)?.toLowerCase() ?? null,
        phone: clean(f.phone),
        presenter_name: clean(f.presenterName),
        presenter_email: clean(f.presenterEmail)?.toLowerCase() ?? null,
        presenter_phone: clean(f.presenterPhone),
        bringing_alum: !!f.bringingAlum,
        av_needs: clean(f.avNeeds),
      })
      .eq('id', id)
      .select('*')
      .single()
    if (error) return json({ ok: false, error: error.message })
    const warnings = await notifyBooking(supabase, booking, { confirm: !!body.sendEmail, staff: false })
    return json({ ok: true, booking, warnings })
  }

  return json({ ok: false, error: 'UNKNOWN_ACTION' })
})
