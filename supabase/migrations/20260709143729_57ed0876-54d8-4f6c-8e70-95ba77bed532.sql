
CREATE TABLE public.function_errors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  method TEXT,
  path TEXT,
  status INTEGER,
  user_id UUID,
  request_id TEXT,
  headers JSONB,
  body_preview TEXT,
  extra JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.function_errors TO authenticated;
GRANT ALL ON public.function_errors TO service_role;

ALTER TABLE public.function_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read function errors"
ON public.function_errors FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE INDEX function_errors_created_at_idx ON public.function_errors (created_at DESC);
CREATE INDEX function_errors_function_name_idx ON public.function_errors (function_name, created_at DESC);
