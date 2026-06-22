-- 0007_security_controls.sql — security hardening requested by Ramaz IT.
--   * email_enabled: kill switch for outbound email
--   * request_log: per-submission audit trail (also powers rate limiting)

-- Kill switch for outbound email (admin can toggle).
alter table public.settings add column if not exists email_enabled boolean not null default true;

-- Audit log of booking submissions + email activity. No anon access (RLS on,
-- no policies => only the service role, used by the Edge Functions, can touch it).
create table if not exists public.request_log (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  ip           text,
  action       text,         -- e.g. 'create_booking'
  result       text,         -- 'booked' | 'slot_taken' | 'invalid' | 'rate_limited' | 'captcha_failed' | 'error'
  email_status text,         -- 'sent' | 'skipped' | 'failed' | null
  detail       text
);
create index if not exists request_log_created_idx on public.request_log (created_at desc);
create index if not exists request_log_ip_time_idx on public.request_log (ip, created_at desc);

alter table public.request_log enable row level security;

notify pgrst, 'reload schema';
