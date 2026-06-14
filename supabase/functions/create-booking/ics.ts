// Minimal iCalendar (.ics) builder. We attach this to the emails so the school
// and staff can one-click "Add to calendar" in Google / Apple / Outlook — no
// Google OAuth or Calendar API required. METHOD:PUBLISH = a plain event the
// recipient adds; that's the broadest-compatibility option.

function toICSDate(iso: string): string {
  // 2026-06-16T14:00:00.000Z -> 20260616T140000Z
  return new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

// RFC 5545: escape commas, semicolons, backslashes, newlines in text values.
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
