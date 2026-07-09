ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tip_notify_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tip_notify_time TIME NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_lon DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS tip_last_sent_on DATE;

CREATE INDEX IF NOT EXISTS idx_profiles_tip_notify_enabled
  ON public.profiles (tip_notify_enabled)
  WHERE tip_notify_enabled = true;