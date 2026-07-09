-- Server-side OTP throttle: tracks failed attempts and resends per email+scope.
CREATE TABLE public.otp_throttle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('signup','recovery')),
  email text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  resend_count integer NOT NULL DEFAULT 0,
  resend_window_start timestamptz NOT NULL DEFAULT now(),
  next_resend_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, email)
);

-- This table is only ever read/written by the edge function via the service role.
GRANT ALL ON public.otp_throttle TO service_role;

ALTER TABLE public.otp_throttle ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies on purpose: clients must go through the edge function.
CREATE POLICY "Service role full access"
ON public.otp_throttle
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_otp_throttle_lookup ON public.otp_throttle (scope, email);