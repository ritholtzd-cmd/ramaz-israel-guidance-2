// Push sync → Ramaz US Systems (the school-ops app, a separate Supabase project).
//
// After any booking change we push a SANITIZED snapshot of bookings into the
// ops app's ig_visits table: program, presenter name, slot times, AV needs —
// never contact emails or phone numbers. The ops app owns everything school-
// facing from there (room, which seniors attend, My Day, notifications).
//
// Auth: signs in as a minimal bot user (igbot) with the ops app's anon key —
// same pattern as its sheet-sync bot. RLS on ig_visits only lets the bot
// write the mirror columns' rows; local columns are never sent, and a
// PostgREST merge upsert leaves unsent columns untouched.
//
// Secrets: US_SYS_URL, US_SYS_ANON_KEY, US_SYS_BOT_EMAIL, US_SYS_BOT_PW.
// If they're not configured, sync is a silent no-op (returns a warning).
//
// Full reconcile every time (bookings volume is tiny): self-heals missed
// pushes. Rows stay 'cancelled' in the mirror even if later hard-deleted
// here, so the school side can see a published visit fell through.

type Supa = ReturnType<typeof import('jsr:@supabase/supabase-js@2').createClient>

const URL_ = Deno.env.get('US_SYS_URL')
const ANON = Deno.env.get('US_SYS_ANON_KEY')
const BOT_EMAIL = Deno.env.get('US_SYS_BOT_EMAIL')
const BOT_PW = Deno.env.get('US_SYS_BOT_PW')

export async function syncUsSystems(supabase: Supa): Promise<string[]> {
  if (!URL_ || !ANON || !BOT_EMAIL || !BOT_PW) return ['us_sync: not configured, skipped']
  try {
    // Everything from a week back, so same-day edits/cancellations still land.
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const { data: rows, error } = await supabase
      .from('bookings')
      .select('id, status, program_name, program_types, presenter_name, contact_name, bringing_alum, av_needs, advisor_name, slots!inner(starts_at, ends_at)')
      .gte('slots.starts_at', since)
    if (error) return [`us_sync: read failed — ${error.message}`]
    if (!rows?.length) return []

    const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: BOT_EMAIL, password: BOT_PW }),
    })
    const { access_token } = await auth.json().catch(() => ({}))
    if (!access_token) return ['us_sync: bot login failed']

    const payload = rows.map((b: any) => ({
      id: b.id,
      slot_starts_at: b.slots.starts_at,
      slot_ends_at: b.slots.ends_at,
      program_name: b.program_name,
      program_type: b.program_types ?? null,
      presenter_name: b.presenter_name ?? b.contact_name ?? null,
      bringing_alum: b.bringing_alum ?? false,
      av_needs: b.av_needs ?? null,
      advisor_name: b.advisor_name ?? null,
      source_status: b.status === 'cancelled' ? 'cancelled' : 'booked',
      synced_at: new Date().toISOString(),
    }))

    const res = await fetch(`${URL_}/rest/v1/ig_visits?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return [`us_sync: upsert failed — ${res.status} ${(await res.text()).slice(0, 200)}`]
    return []
  } catch (e) {
    return [`us_sync: ${(e as Error).message}`]
  }
}
