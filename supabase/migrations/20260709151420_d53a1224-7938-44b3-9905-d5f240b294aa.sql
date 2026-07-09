
-- 1. Extend govt_schemes
ALTER TABLE public.govt_schemes
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'api',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS govt_schemes_updated_at ON public.govt_schemes;
CREATE TRIGGER govt_schemes_updated_at
BEFORE UPDATE ON public.govt_schemes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SuperAdmin can write to govt_schemes
DROP POLICY IF EXISTS "Superadmin can insert schemes" ON public.govt_schemes;
CREATE POLICY "Superadmin can insert schemes" ON public.govt_schemes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

DROP POLICY IF EXISTS "Superadmin can update schemes" ON public.govt_schemes;
CREATE POLICY "Superadmin can update schemes" ON public.govt_schemes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

DROP POLICY IF EXISTS "Superadmin can delete schemes" ON public.govt_schemes;
CREATE POLICY "Superadmin can delete schemes" ON public.govt_schemes
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.govt_schemes TO authenticated;
GRANT ALL ON public.govt_schemes TO service_role;

-- 2. App settings table (single-row key/value)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read app settings" ON public.app_settings;
CREATE POLICY "Anyone can read app settings" ON public.app_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Superadmin can insert app settings" ON public.app_settings;
CREATE POLICY "Superadmin can insert app settings" ON public.app_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

DROP POLICY IF EXISTS "Superadmin can update app settings" ON public.app_settings;
CREATE POLICY "Superadmin can update app settings" ON public.app_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

DROP TRIGGER IF EXISTS app_settings_updated_at ON public.app_settings;
CREATE TRIGGER app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default scheme_source_mode
INSERT INTO public.app_settings (key, value) VALUES
  ('scheme_source_mode', '"both"'::jsonb)
ON CONFLICT (key) DO NOTHING;
