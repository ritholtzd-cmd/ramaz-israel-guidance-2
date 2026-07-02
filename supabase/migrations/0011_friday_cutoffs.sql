-- 0011_friday_cutoffs.sql
-- Fridays have an early dismissal. Remove open slots that run past:
--   1:10 PM start (ends ~1:50 PM) during DST  → last slot ends ~1:10 PM, school done by 1:30 PM
--   12:30 PM start (ends ~1:10 PM) during EST  → last slot ends ~12:30 PM, school done by 1:00 PM
-- DST ends first Sunday of November: Nov 1, 2026.
-- Only deletes 'open' slots — booked Friday slots are untouched.

DELETE FROM public.slots
WHERE status = 'open'
  AND EXTRACT(DOW FROM starts_at AT TIME ZONE 'America/New_York') = 5
  AND (
    -- DST period: before Nov 1 2026 — cut at 1:10 PM
    (
      (starts_at AT TIME ZONE 'America/New_York')::date < '2026-11-01'
      AND (starts_at AT TIME ZONE 'America/New_York')::time >= '13:10:00'
    )
    OR
    -- Standard time: Nov 1 2026 onward — cut at 12:30 PM
    (
      (starts_at AT TIME ZONE 'America/New_York')::date >= '2026-11-01'
      AND (starts_at AT TIME ZONE 'America/New_York')::time >= '12:30:00'
    )
  );
