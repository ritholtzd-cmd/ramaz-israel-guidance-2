-- 0002_create_booking.sql — the double-booking-safe write path.
--
-- Why a SECURITY DEFINER function instead of a plain client INSERT:
--   * The whole body runs in ONE transaction. The conditional UPDATE claims the
--     slot only if it is still 'open'; if zero rows match, someone beat us to it
--     and we raise SLOT_UNAVAILABLE — the insert never happens.
--   * Anon can EXECUTE this function but has no direct INSERT on bookings, so the
--     only way to create a booking is through this validated, atomic path.
--   * `set search_path = public` hardens the definer function against
--     search-path hijacking.
--
-- In Phase 4 the email Edge Function will call this same function, then send the
-- confirmation + calendar invite. The transactional core does not change.

create or replace function public.create_booking(
  p_slot_id       uuid,
  p_school_name   text,
  p_contact_name  text,
  p_contact_email text,
  p_phone         text default null,
  p_num_attendees integer default null,
  p_grade         text default null
) returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot    public.slots;
  v_booking public.bookings;
begin
  -- Validate required fields up front.
  if coalesce(btrim(p_school_name), '') = ''
     or coalesce(btrim(p_contact_name), '') = ''
     or coalesce(btrim(p_contact_email), '') = '' then
    raise exception 'MISSING_FIELDS' using errcode = 'P0001';
  end if;

  -- Atomic claim: succeeds only if the slot is currently open.
  update public.slots
     set status = 'booked'
   where id = p_slot_id
     and status = 'open'
  returning * into v_slot;

  if not found then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  insert into public.bookings
    (slot_id, school_name, contact_name, contact_email, phone, num_attendees, grade)
  values
    (p_slot_id,
     btrim(p_school_name),
     btrim(p_contact_name),
     lower(btrim(p_contact_email)),
     nullif(btrim(p_phone), ''),
     p_num_attendees,
     nullif(btrim(p_grade), ''))
  returning * into v_booking;

  return v_booking;
end;
$$;

-- Anon may call the function, but cannot read/write the tables directly.
grant execute on function
  public.create_booking(uuid, text, text, text, text, integer, text) to anon;
