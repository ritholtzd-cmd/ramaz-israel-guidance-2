// Edge Function: create-booking
// -----------------------------------------------------------------------------
// The booking submit goes through HERE (not a direct browser RPC) so the email
// API key stays server-side. Flow:
//   1. Atomically claim the slot + insert the booking via the create_booking
//      SQL function (one transaction — see migration 0002). Service role key.
//   2. Look up slot times + public settings for the email/.ics content.
//   3. Email the school a confirmation, and email staff a calendar invite.
//      Email is best-effort: the booking is already committed, so an email
//      failure returns ok:true with a warning rather than losing the booking.
//
// Deploy with `--no-verify-jwt`: this is a PUBLIC endpoint (schools have no
// login), so we do our own CORS and don't require a Supabase JWT.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import { buildICS } from './ics.ts'

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

// Supabase auto-injects these into the function runtime.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// These you set yourself (see deploy steps).
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
// STAFF_EMAIL may hold one or several comma-separated addresses — all get the
// staff calendar invite.
const STAFF_EMAILS = (Deno.env.get('STAFF_EMAIL') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const STAFF_PRIMARY = STAFF_EMAILS[0] ?? ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'onboarding@resend.dev'

const TZ = 'America/New_York'
const fmtDate = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
})
const fmtTime = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
})

async function sendEmail(to: string | string[], subject: string, html: string, ics: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Ramaz Israel Guidance <${FROM_EMAIL}>`,
      to,
      subject,
      html,
      // encodeBase64 handles UTF-8 (em-dashes etc.); btoa would throw on them.
      attachments: [{ filename: 'invite.ics', content: encodeBase64(ics) }],
    }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let form: Record<string, unknown>
  try {
    form = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

  // 1. Atomic claim + insert.
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
    // Return 200 with a discriminated body so the client reads `data` directly
    // (functions.invoke makes reading the body of a non-2xx response awkward).
    const taken = bookingErr.message?.includes('SLOT_UNAVAILABLE')
    return json({ ok: false, error: taken ? 'SLOT_UNAVAILABLE' : 'BOOKING_FAILED' })
  }

  // 2. Pull slot times + public settings for the email body / .ics.
  const [{ data: slot }, { data: settings }] = await Promise.all([
    supabase.from('slots').select('starts_at, ends_at').eq('id', booking.slot_id).single(),
    supabase.from('settings').select('location, contact_name, contact_email, what_to_expect').eq('id', 1).single(),
  ])

  const dateStr = fmtDate.format(new Date(slot!.starts_at))
  const timeStr = `${fmtTime.format(new Date(slot!.starts_at))} – ${fmtTime.format(new Date(slot!.ends_at))}`
  const location = settings?.location ?? 'Ramaz Upper School'

  const ics = buildICS({
    uid: `${booking.id}@ramaz-israel-guidance`,
    startsAt: slot!.starts_at,
    endsAt: slot!.ends_at,
    summary: `Israel Guidance Presentation — ${booking.program_name}`,
    description: settings?.what_to_expect ?? '',
    location,
    organizerEmail: settings?.contact_email ?? STAFF_PRIMARY,
  })

  // 3. Best-effort emails.
  const warnings: string[] = []

  const presenter = booking.presenter_name
    ? `${booking.presenter_name}${booking.presenter_email ? ', ' + booking.presenter_email : ''}${booking.presenter_phone ? ', ' + booking.presenter_phone : ''}`
    : `${booking.contact_name} (booking contact)`

  const confirmHtml = `
    <h2>Your Israel Guidance presentation is booked</h2>
    <p>Hi ${booking.contact_name},</p>
    <p>Here are the details:</p>
    <ul>
      <li><strong>Program:</strong> ${booking.program_name}</li>
      <li><strong>Date:</strong> ${dateStr}</li>
      <li><strong>Time:</strong> ${timeStr}</li>
      <li><strong>Location:</strong> ${location}</li>
      <li><strong>Presenter:</strong> ${presenter}</li>
    </ul>
    <p><strong>What to expect:</strong> ${settings?.what_to_expect ?? ''}</p>
    <p>A calendar invite is attached. To cancel or reschedule, reply to this email or contact ${settings?.contact_name ?? 'us'} at ${settings?.contact_email ?? STAFF_PRIMARY}.</p>`

  const staffHtml = `
    <h2>New presentation booking</h2>
    <ul>
      <li><strong>Program:</strong> ${booking.program_name}</li>
      ${booking.program_types ? `<li><strong>Type:</strong> ${booking.program_types}</li>` : ''}
      <li><strong>Booked by:</strong> ${booking.contact_name} (${booking.contact_email}${booking.phone ? ', ' + booking.phone : ''})</li>
      <li><strong>Date:</strong> ${dateStr}</li>
      <li><strong>Time:</strong> ${timeStr}</li>
      <li><strong>Presenter:</strong> ${presenter}</li>
      <li><strong>Bringing an alum:</strong> ${booking.bringing_alum ? 'Yes' : 'No'}</li>
      ${booking.av_needs ? `<li><strong>AV needs:</strong> ${booking.av_needs}</li>` : ''}
    </ul>
    <p>A calendar invite is attached.</p>`

  try {
    await sendEmail(booking.contact_email, 'Your Israel Guidance presentation is booked', confirmHtml, ics)
  } catch (e) {
    warnings.push(`confirmation email failed: ${(e as Error).message}`)
  }
  try {
    await sendEmail(STAFF_EMAILS, `New booking: ${booking.program_name} — ${dateStr}`, staffHtml, ics)
  } catch (e) {
    warnings.push(`staff email failed: ${(e as Error).message}`)
  }

  return json({ ok: true, booking, warnings })
})
