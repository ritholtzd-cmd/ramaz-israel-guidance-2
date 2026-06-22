-- 0008_blocking.sql — admin availability blocking.
-- Blocking flips slot status open<->blocked. The public availability query shows
-- only 'open' slots and create_booking only claims 'open' ones, so blocked times
-- disappear from the site and can't be booked. 'booked' slots are never touched.
-- Date matching is done in America/New_York so a calendar day lines up with NY.

create or replace function public.set_day_status(p_date date, p_from text, p_to text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.slots set status = p_to
   where status = p_from
     and (starts_at at time zone 'America/New_York')::date = p_date;
  get diagnostics n = row_count;
  return n;
end; $$;

create or replace function public.get_day_slots(p_date date)
returns setof public.slots language sql security definer set search_path = public as $$
  select * from public.slots
   where (starts_at at time zone 'America/New_York')::date = p_date
   order by starts_at;
$$;

-- Admin-only (called by the service role via the admin Edge Function); never anon.
revoke execute on function public.set_day_status(date, text, text) from public;
revoke execute on function public.get_day_slots(date) from public;
grant execute on function public.set_day_status(date, text, text) to service_role;
grant execute on function public.get_day_slots(date) to service_role;

notify pgrst, 'reload schema';
