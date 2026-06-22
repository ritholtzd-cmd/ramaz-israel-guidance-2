// Edge Function: create-booking (public)
// Hardened per Ramaz IT requirements: Turnstile (CAPTCHA), per-IP rate limiting,
// server-side validation, an audit log, and an email kill switch.
//
// Flow: verify CAPTCHA -> rate-limit by IP -> validate -> atomic claim+insert
// (create_booking RPC) -> send email unless disabled -> log outcome.
// Deploy with --no-verify-jwt.
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
const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET_KEY') // dormant until set

// Per-IP rate limits (low-volume tool, so tight).
const MAX_PER_HOUR = 5
const MAX_PER_DAY = 20

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TYPES = ['Seminary', 'Yeshiva', 'Other']

function validate(f: Record<string, unknown>): string | null {
  for (const k of ['slotId', 'programName', 'contactName', 'contactEmail']) {
    if (!f[k] || String(f[k]).trim() === '') return `missing ${k}`
  }
  if (!EMAIL_RE.test(String(f.contactEmail))) return 'bad contact email'
  if (f.presenterEmail && !EMAIL_RE.test(String(f.presenterEmail))) return 'bad presenter email'
  const tooLong = (v: unknown, n: number) => v != null && String(v).length > n
  if (tooLong(f.programName, 200) || tooLong(f.contactName, 200) || tooLong(f.contactEmail, 200) ||
      tooLong(f.presenterName, 200) || tooLong(f.phone, 50) || tooLong(f.avNeeds, 1000)) return 'field too long'
  if (f.programTypes && !TYPES.includes(String(f.programTypes))) return 'bad program type'
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405)

  let form: Record<string, unknown>
  try { form = await req.json() } catch { return json({ ok: false, error: 'INVALID' }) }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const log = (result: string, email_status: string | null = null, detail: string | null = null) =>
    supabase.from('request_log').insert({ ip, action: 'create_booking', result, email_status, detail })

  // 1. CAPTCHA (only enforced once the secret is configured).
  if (TURNSTILE_SECRET) {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: TURNSTILE_SECRET,
        response: String(form.captchaToken ?? ''),
        ...(ip ? { remoteip: ip } : {}),
      }),
    })
    const out = await res.json().catch(() => ({ success: false }))
    if (!out.success) { await log('captcha_failed'); return json({ ok: false, error: 'CAPTCHA_FAILED' }) }
  }

  // 2. Rate limit by IP.
  if (ip) {
    const hourAgo = new Date(Date.now() - 3600_000).toISOString()
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
    const [{ count: h }, { count: d }] = await Promise.all([
      supabase.from('request_log').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', hourAgo),
      supabase.from('request_log').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', dayAgo),
    ])
    if ((h ?? 0) >= MAX_PER_HOUR || (d ?? 0) >= MAX_PER_DAY) {
      await log('rate_limited'); return json({ ok: false, error: 'RATE_LIMITED' })
    }
  }

  // 3. Validate.
  const invalid = validate(form)
  if (invalid) { await log('invalid', null, invalid); return json({ ok: false, error: 'INVALID' }) }

  // 4. Atomic claim + insert.
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
    await log(taken ? 'slot_taken' : 'error', null, taken ? null : bookingErr.message)
    return json({ ok: false, error: taken ? 'SLOT_UNAVAILABLE' : 'BOOKING_FAILED' })
  }

  // 5. Email (unless the kill switch is off).
  const { data: s } = await supabase.from('settings').select('email_enabled').eq('id', 1).single()
  const emailOn = s?.email_enabled !== false
  const warnings = emailOn ? await notifyBooking(supabase, booking, { confirm: true, staff: true }) : []
  await log('booked', emailOn ? (warnings.length ? 'failed' : 'sent') : 'skipped')

  return json({ ok: true, booking, warnings })
})
