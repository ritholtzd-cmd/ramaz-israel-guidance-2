// Minimal iCalendar (.ics) builder, shared by the booking + admin functions.
// METHOD:PUBLISH = a plain event the recipient adds to any calendar app.

function toICSDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function esc(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

export function buildICS(opts: {
  uid: string
  startsAt: string
  endsAt: string
  summary: string
  description: string
  location: string
  organizerEmail: string
}): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ramaz Israel Guidance//Booking//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `DTSTAMP:${toICSDate(new Date().toISOString())}`,
    `DTSTART:${toICSDate(opts.startsAt)}`,
    `DTEND:${toICSDate(opts.endsAt)}`,
    `SUMMARY:${esc(opts.summary)}`,
    `DESCRIPTION:${esc(opts.description)}`,
    `LOCATION:${esc(opts.location)}`,
    `ORGANIZER:mailto:${opts.organizerEmail}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}
