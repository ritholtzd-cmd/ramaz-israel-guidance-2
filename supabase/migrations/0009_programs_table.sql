-- 0009_programs_table.sql — move the program dropdown list into the DB so admins
-- can add / archive / restore programs. Archived programs stay in the table but
-- drop off the public dropdown (RLS hides them from anon).

create table if not exists public.programs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  type       text not null check (type in ('Seminary', 'Yeshiva', 'Other')),
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.programs enable row level security;

-- Public site sees only ACTIVE programs.
drop policy if exists "anon reads active programs" on public.programs;
create policy "anon reads active programs"
  on public.programs for select to anon using (archived = false);

-- Seed the current list (idempotent). Admin can edit/add/archive afterward.
insert into public.programs (name, type) values
  ('Aish HaTorah','Yeshiva'), ('Ashreinu','Yeshiva'), ('Atzmona - Otzem','Yeshiva'),
  ('Birkat Moshe Maaleh Adumim','Yeshiva'), ('Eretz HaTzvi','Yeshiva'), ('Hakotel','Yeshiva'),
  ('Har Etzion - The Gush','Yeshiva'), ('Kerem B''Yavneh','Yeshiva'), ('Lev HaTorah','Yeshiva'),
  ('Maale Gilboa','Yeshiva'), ('Mevaseret','Yeshiva'), ('Migdal HaTorah','Yeshiva'),
  ('Mitzpe Yericho','Yeshiva'), ('Moreshet Yerushalayim','Yeshiva'), ('Netiv Aryeh','Yeshiva'),
  ('Ohr David','Yeshiva'), ('Orayta','Yeshiva'), ('Otniel','Yeshiva'), ('Reishit','Yeshiva'),
  ('Sderot','Yeshiva'), ('Sha''alvim','Yeshiva'), ('Torah V''avodah (TVA)','Yeshiva'),
  ('Torah Tech','Yeshiva'), ('Torat Shraga','Yeshiva'), ('Yeshiva Tiferet (TJ)','Yeshiva'),
  ('Yishrei Lev','Yeshiva'),
  ('Aish EFG','Seminary'), ('Amudim','Seminary'), ('Baer Miriam','Seminary'),
  ('Bnot Torah/Sharfman''s','Seminary'), ('Maayanot','Seminary'), ('Machon Maayan','Seminary'),
  ('Michlelet Mevaseret Yerushalayim','Seminary'), ('Midreshet AMIT','Seminary'),
  ('Midreshet Ein Hanatziv','Seminary'), ('Midreshet Eshel','Seminary'), ('Midreshet HaRova','Seminary'),
  ('Midreshet Lev','Seminary'), ('Midreshet Lindenbaum','Seminary'), ('Midreshet Moriah','Seminary'),
  ('Midreshet Tehillah','Seminary'), ('Midreshet Torat Chessed','Seminary'),
  ('Midreshet Torah V''Avodah (MTVA)','Seminary'), ('Migdal Oz','Seminary'), ('Nishmat','Seminary'),
  ('Sha''alvim for Women','Seminary'), ('Tiferet','Seminary'), ('Tomer Devorah Seminary','Seminary'),
  ('Hevruta (Hartman)','Other'), ('Kadima','Other'), ('Bar Ilan Israel Experience','Other'),
  ('IDC / Reichman Herzliya','Other')
on conflict (name) do nothing;

notify pgrst, 'reload schema';
