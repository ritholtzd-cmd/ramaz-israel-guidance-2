// Date helpers for the calendar picker. Slots are stored as UTC timestamps but
// presented/grouped in NY time, so an out-of-state school sees the same calendar
// day Ramaz means.
const TZ = 'America/New_York'

// 'YYYY-MM-DD' in NY time (en-CA formats in that order).
const keyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function nyDateKey(iso) {
  return keyFmt.format(new Date(iso))
}

// Build a 'YYYY-MM-DD' key from plain calendar parts (month is 0-based).
export function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// '2026-06-16' -> { year: 2026, month: 5 }  (month 0-based)
export function parseKey(key) {
  const [y, m] = key.split('-').map(Number)
  return { year: y, month: m - 1 }
}

// Group available slots by their NY calendar day. Returns a Map of key -> slots[].
export function groupSlotsByDate(slots) {
  const map = new Map()
  for (const slot of slots) {
    const key = nyDateKey(slot.starts_at)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(slot)
  }
  return map
}

// Minutes between two ISO timestamps (slot duration).
export function durationMinutes(startIso, endIso) {
  return Math.round((new Date(endIso) - new Date(startIso)) / 60000)
}
