// All slot times are presented in the school's local NY time, regardless of the
// viewer's own timezone, so dates never drift for out-of-state schools.
const TZ = 'America/New_York'

const dateFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

const startTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit',
})

const endTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

export function formatSlotDate(iso) {
  return dateFmt.format(new Date(iso))
}

export function formatSlotTimeRange(startIso, endIso) {
  return `${startTimeFmt.format(new Date(startIso))} – ${endTimeFmt.format(new Date(endIso))}`
}
