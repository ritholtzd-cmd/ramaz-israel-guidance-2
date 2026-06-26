// Edge Function: calendar-feed
// Returns all active bookings as a public iCal feed (.ics).
// Subscribe to this URL in Outlook or Schoology for automatic updates.
// Deploy with --no-verify-jwt.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = { 'Access-Control-Allow-Origin': '*' }

function toICSDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function esc(text: string): string {
  return (text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

// iCal spec requires lines wrapped at 75 chars
function fold(line: string): string {
  if (line.length <= 75) return line
  let out = ''
  while (line.length > 75) {
    out += line.slice(0, 75) + '\r\n '
    line = line.slice(75)
  }
  return out + line
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

  const [{ data: bookings }, { data: settings }] = await Promise.all([
    supabase
      .from('bookings')
      .select('*, slots(starts_at, ends_at)')
      .eq('status', 'booked')
      .order('created_at', { ascending: false }),
    supabase.from('settings').select('location, contact_email, what_to_expect').eq('id', 1).single(),
  ])

  const location = settings?.location ?? 'Ramaz Upper School, 60 East 78th Street, New York, NY 10075'
  const organizerEmail = settings?.contact_email ?? 'israelguidance@ramaz.org'
  const description = settings?.what_to_expect ?? ''
  const now = toICSDate(new Date().toISOString())

  const events = (bookings ?? [])
    .filter((b) => b.slots)
    .map((b) => {
      const presenter = b.presenter_name
        ? `${b.presenter_name}${b.presenter_email ? ' (' + b.presenter_email + ')' : ''}`
        : b.contact_name
      const fullDesc = [
        description,
        `Program: ${b.program_name}`,
        `Contact: ${b.contact_name} (${b.contact_email})`,
        `Presenter: ${presenter}`,
        b.av_needs ? `AV: ${b.av_needs}` : '',
        b.bringing_alum ? 'Bringing an alum: Yes' : '',
      ].filter(Boolean).join('\\n')

      return [
        'BEGIN:VEVENT',
        fold(`UID:${b.id}@ramaz-israel-guidance`),
        `DTSTAMP:${now}`,
        `DTSTART:${toICSDate(b.slots.starts_at)}`,
        `DTEND:${toICSDate(b.slots.ends_at)}`,
        fold(`SUMMARY:Israel Guidance Presentation — ${esc(b.program_name)}`),
        fold(`DESCRIPTION:${esc(fullDesc)}`),
        fold(`LOCATION:${esc(location)}`),
        `ORGANIZER:mailto:${organizerEmail}`,
        'END:VEVENT',
      ].join('\r\n')
    })

  const cal = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ramaz Israel Guidance//Booking Feed//EN',
    'X-WR-CALNAME:Ramaz Israel Guidance Presentations',
    'X-WR-CALDESC:Upcoming Israel Guidance presentations at Ramaz Upper School',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')

  return new Response(cal, {
    headers: {
      ...CORS,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="israel-guidance.ics"',
      'Cache-Control': 'no-cache',
    },
  })
})
