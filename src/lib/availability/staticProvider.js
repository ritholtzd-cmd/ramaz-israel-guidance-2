import { supabase } from '../supabase'

// STATIC availability provider.
//
// Bookable slots live in the Supabase `slots` table — seeded by hand today
// (see supabase/seed.sql). A slot is bookable when it is `open` and in the
// future. Slot inventory is read with the anon key (RLS allows SELECT on slots);
// the booked/blocked status lives on the slot itself, so we never need to read
// the private `bookings` table from the browser.
export async function listAvailableSlots() {
  if (!supabase) return []
  const nowIso = new Date().toISOString()

  // Supabase caps each response at 1,000 rows (not overridable via limit), and a
  // full school year is ~1,600 slots — so page through with .range() until done.
  const pageSize = 1000
  const all = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('slots')
      .select('id, starts_at, ends_at')
      .eq('status', 'open')
      .gt('starts_at', nowIso)
      .order('starts_at', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < pageSize) break
  }
  return all
}
