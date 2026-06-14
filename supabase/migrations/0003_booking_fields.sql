-- 0003_booking_fields.sql — reshape bookings to capture presenter details.
-- Drops attendees/grade, renames school_name -> program_name, adds presenter
-- and logistics fields. Re-runnable.

alter table public.bookings rename column school_name to program_name;

alter table public.bookings drop column if exists num_attendees;
alter table public.bookings drop column if exists grade;

alter table public.bookings add column if not exists presenter_name  text;
alter table public.bookings add column if not exists presenter_email text;
alter table public.bookings add column if not exists presenter_phone text;
alter table public.bookings add column if not exists bringing_alum   boolean not null default false;
alter table public.bookings add column if not exists av_needs        text;

-- Replace create_booking with the new signature. Drop the old one first so we
-- don't leave two overloads around.
drop function if exists public.create_booking(uuid, text, text, text, text, integer, text);

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
  p_av_needs        text default null
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
    (slot_id, program_name, contact_name, contact_email, phone,
     presenter_name, presenter_email, presenter_phone, bringing_alum, av_needs)
  values
    (p_slot_id,
     btrim(p_program_name),
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
  uuid, text, text, text, text, text, text, text, boolean, text
) to anon;
