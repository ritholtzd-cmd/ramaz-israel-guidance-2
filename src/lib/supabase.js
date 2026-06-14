// Supabase browser client.
//
// Uses the ANON key only — this client is for reading public availability and
// invoking the booking Edge Function. The privileged service_role key never
// lives in the browser; it stays as an Edge Function secret (added in Phase 3/4).
//
// We construct the client lazily and tolerate missing env vars so the app still
// boots (and Vercel still builds) before Supabase is wired up. `isConfigured`
// lets the UI show a clear "not connected yet" state instead of crashing.

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && anonKey)

export const supabase = isConfigured ? createClient(url, anonKey) : null
