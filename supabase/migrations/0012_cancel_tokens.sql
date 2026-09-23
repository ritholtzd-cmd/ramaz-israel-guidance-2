-- 0012_cancel_tokens.sql
-- Self-service cancellation: every booking gets an unguessable token that goes
-- into the confirmation email as a "cancel this booking" link. Knowing the
-- booking id alone is not enough — the token must match too.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancel_token uuid NOT NULL DEFAULT gen_random_uuid();
