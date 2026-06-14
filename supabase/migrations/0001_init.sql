-- 0001_init.sql — Israel Guidance booking schema
-- Apply by pasting into the Supabase SQL Editor (or `supabase db push` once the
-- CLI is set up). Safe to re-run: every statement is guarded.

-- ============================== slots ==============================
-- The bookable inventory. One school per slot. Seeded by hand for now
-- (see seed.sql); later a generator can upsert daily slots from a times config
-- — that is an isolated change to how rows get INTO this table, not its shape.
create table if not exists public.slots (
  id          uuid primary key default gen_random_uuid(),
  starts_at   timestamptz not null unique,   -- unique => seed is re-runnable
  ends_at     timestamptz not null,
  status      text not null default 'open'
              check (status in ('open', 'booked', 'blocked')),
  created_at  timestamptz not null default now()
);

create index if not exists slots_starts_at_idx on public.slots (starts_at);

-- ============================ bookings =============================
create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  slot_id        uuid not null references public.slots(id),
  school_name    text not null,
  contact_name   text not null,
  contact_email  text not null,
  phone          text,
  num_attendees  integer,
  grade          text,
  status         text not null default 'booked'
                 check (status in ('booked', 'cancelled')),
  created_at     timestamptz not null default now(),
  cancelled_at   timestamptz
);

-- DB-level double-booking guarantee: at most one ACTIVE booking per slot.
-- A cancelled booking frees the slot, so this is a PARTIAL unique index.
create unique index if not exists one_active_booking_per_slot
  on public.bookings (slot_id) where (status = 'booked');

-- ============================ settings =============================
-- Single-row table for public-facing display copy. The STAFF calendar
-- recipient is intentionally NOT here — it is an Edge Function secret (Phase 4)
-- so it never ships to the browser.
create table if not exists public.settings (
  id             integer primary key default 1 check (id = 1),
  location       text not null,
  contact_name   text not null,
  contact_email  text not null,
  what_to_expect text not null,
  updated_at     timestamptz not null default now()
);

-- ========================= Row Level Security ======================
alter table public.slots    enable row level security;
alter table public.bookings enable row level security;
alter table public.settings enable row level security;

-- Public (anon / publishable key) may READ slots and settings to render
-- availability. There is deliberately NO anon policy on bookings, so contact
-- details are never exposed to the browser. All WRITES happen server-side via
-- the service_role key, which bypasses RLS entirely.
drop policy if exists "anon can read slots" on public.slots;
create policy "anon can read slots"
  on public.slots for select to anon using (true);

drop policy if exists "anon can read settings" on public.settings;
create policy "anon can read settings"
  on public.settings for select to anon using (true);
