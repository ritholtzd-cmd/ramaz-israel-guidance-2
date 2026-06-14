// Shared booking-notification logic used by both create-booking (public) and
// admin-bookings (manual add / edit). Sends the program confirmation and/or the
// staff calendar invite for a booking row. Email is best-effort — it returns a
// list of warnings rather than throwing, so a send failure never loses a booking.
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import { buildICS } from './ics.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const STAFF_EMAILS = (Deno.env.get('STAFF_EMAIL') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean)
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
      attachments: [{ filename: 'invite.ics', content: encodeBase64(ics) }],
    }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function notifyBooking(
  supabase: any,
  booking: any,
  opts: { confirm?: boolean; staff?: boolean },
): Promise<string[]> {
  const warnings: string[] = []
  if (!opts.confirm && !opts.staff) return warnings

  const [{ data: slot }, { data: settings }] = await Promise.all([
    supabase.from('slots').select('starts_at, ends_at').eq('id', booking.slot_id).single(),
    supabase.from('settings').select('location, contact_name, contact_email, what_to_expect').eq('id', 1).single(),
  ])
  if (!slot) { warnings.push('slot not found for email'); return warnings }

  const dateStr = fmtDate.format(new Date(slot.starts_at))
  const timeStr = `${fmtTime.format(new Date(slot.starts_at))} – ${fmtTime.format(new Date(slot.ends_at))}`
  const location = settings?.location ?? 'Ramaz Upper School'
  const presenter = booking.presenter_name
    ? `${booking.presenter_name}${booking.presenter_email ? ', ' + booking.presenter_email : ''}${booking.presenter_phone ? ', ' + booking.presenter_phone : ''}`
    : `${booking.contact_name} (booking contact)`

  const ics = buildICS({
    uid: `${booking.id}@ramaz-israel-guidance`,
    startsAt: slot.starts_at,
    endsAt: slot.ends_at,
    summary: `Israel Guidance Presentation — ${booking.program_name}`,
    description: settings?.what_to_expect ?? '',
    location,
    organizerEmail: settings?.contact_email ?? STAFF_PRIMARY,
  })

  if (opts.confirm) {
    const html = `
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
    try {
      await sendEmail(booking.contact_email, 'Your Israel Guidance presentation is booked', html, ics)
    } catch (e) {
      warnings.push(`confirmation email failed: ${(e as Error).message}`)
    }
  }

  if (opts.staff && STAFF_EMAILS.length) {
    const html = `
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
      await sendEmail(STAFF_EMAILS, `New booking: ${booking.program_name} — ${dateStr}`, html, ics)
    } catch (e) {
      warnings.push(`staff email failed: ${(e as Error).message}`)
    }
  }

  return warnings
}
