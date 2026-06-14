// Edge Function: create-booking (public)
// Atomically claims the slot + inserts the booking (one transaction via the
// create_booking SQL function), then sends the program confirmation + staff
// calendar invite. Email is best-effort. Deploy with --no-verify-jwt.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let form: Record<string, unknown>
  try { form = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

  const { data: booking, error: bookingErr } = await supabase.rpc('create_booking', {
    p_slot_id: form.slotId,
    p_program_name: form.programName,
    p_program_types: form.programTypes || null,
    p_contact_name: form.contactName,
    p_contact_email: form.contactEmail,
    p_phone: form.phone || null,
    p_presenter_name: form.presenterName || null,
    p_presenter_email: form.presenterEmail || null,
    p_presenter_phone: form.presenterPhone || null,
    p_bringing_alum: form.bringingAlum ?? false,
    p_av_needs: form.avNeeds || null,
  })

  if (bookingErr) {
    const taken = bookingErr.message?.includes('SLOT_UNAVAILABLE')
    return json({ ok: false, error: taken ? 'SLOT_UNAVAILABLE' : 'BOOKING_FAILED' })
  }

  const warnings = await notifyBooking(supabase, booking, { confirm: true, staff: true })
  return json({ ok: true, booking, warnings })
})
