-- 0006_round_slot_times.sql — round every slot's start/end to the nearest 5 min
-- (e.g. 9:26 -> 9:25, 8:44 -> 8:45). ET's offset is whole hours, so rounding the
-- minute component is timezone-safe. Safe to re-run (idempotent once rounded).
update public.slots set
  starts_at = starts_at
    + make_interval(mins => (round(extract(minute from starts_at) / 5.0) * 5 - extract(minute from starts_at))::int),
  ends_at = ends_at
    + make_interval(mins => (round(extract(minute from ends_at) / 5.0) * 5 - extract(minute from ends_at))::int);
