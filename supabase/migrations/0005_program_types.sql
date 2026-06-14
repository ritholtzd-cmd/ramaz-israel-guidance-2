-- 0005_program_types.sql — add multi-select Program type (Seminary/Yeshiva/Other).
-- Stored as a comma-separated text value. Re-runnable.

alter table public.bookings add column if not exists program_types text;

drop function if exists public.create_booking(
  uuid, text, text, text, text, text, text, text, boolean, text);

create or replace function public.create_booking(
  p_slot_id         uuid,
  p_program_name    text,
  p_contact_name    text,
  p_contact_email   text,
  p_phone           text default null,
  p_presenter_name  text default null,
  p_presenter_email text default null,
  p_presenter_phone text default null,
  p_bringing_alum   boolean default false,
  p_av_needs        text default null,
  p_program_types   text default null
) returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot    public.slots;
  v_booking public.bookings;
begin
  if coalesce(btrim(p_program_name), '') = ''
     or coalesce(btrim(p_contact_name), '') = ''
     or coalesce(btrim(p_contact_email), '') = '' then
    raise exception 'MISSING_FIELDS' using errcode = 'P0001';
  end if;

  update public.slots
     set status = 'booked'
   where id = p_slot_id
     and status = 'open'
  returning * into v_slot;

  if not found then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  insert into public.bookings
    (slot_id, program_name, program_types, contact_name, contact_email, phone,
     presenter_name, presenter_email, presenter_phone, bringing_alum, av_needs)
  values
    (p_slot_id,
     btrim(p_program_name),
     nullif(btrim(p_program_types), ''),
     btrim(p_contact_name),
     lower(btrim(p_contact_email)),
     nullif(btrim(p_phone), ''),
     nullif(btrim(p_presenter_name), ''),
     nullif(lower(btrim(p_presenter_email)), ''),
     nullif(btrim(p_presenter_phone), ''),
     coalesce(p_bringing_alum, false),
     nullif(btrim(p_av_needs), ''))
  returning * into v_booking;

  return v_booking;
end;
$$;

grant execute on function public.create_booking(
  uuid, text, text, text, text, text, text, text, boolean, text, text
) to anon;
