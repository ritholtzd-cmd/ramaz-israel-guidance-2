-- Reminder tracking + advisor assignment per booking
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS advisor_name TEXT,
  ADD COLUMN IF NOT EXISTS advisor_phone TEXT,
  ADD COLUMN IF NOT EXISTS week_reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS day_reminder_sent_at TIMESTAMPTZ;

-- Security instructions stored in settings (update via SQL when ready)
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS security_instructions TEXT;
