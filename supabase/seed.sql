-- seed.sql — EDIT FREELY. Safe to re-run (idempotent via on conflict).
-- This is the ONE place you change daily slot inventory and display copy today.

-- ---- Settings (single row) ----
insert into public.settings (id, location, contact_name, contact_email, what_to_expect)
values (
  1,
  'Ramaz Upper School, 60 East 78th Street, New York, NY 10075',
  'Israel Guidance Department',
  'PLACEHOLDER@ramaz.org',                       -- public-facing contact
  'A 45-minute presentation from the Ramaz Israel Guidance department about our Israel programming, followed by time for questions.'
)
on conflict (id) do update set
  location       = excluded.location,
  contact_name   = excluded.contact_name,
  contact_email  = excluded.contact_email,
  what_to_expect = excluded.what_to_expect,
  updated_at     = now();

-- ---- Slots ----
-- Times are America/New_York. In June that is EDT = UTC-04:00.
-- Edit / add / remove rows freely; on conflict (starts_at) keeps this re-runnable.
insert into public.slots (starts_at, ends_at) values
  ('2026-06-16 10:00:00-04:00', '2026-06-16 10:45:00-04:00'),
  ('2026-06-16 13:00:00-04:00', '2026-06-16 13:45:00-04:00'),
  ('2026-06-17 10:00:00-04:00', '2026-06-17 10:45:00-04:00'),
  ('2026-06-18 13:00:00-04:00', '2026-06-18 13:45:00-04:00')
on conflict (starts_at) do nothing;
