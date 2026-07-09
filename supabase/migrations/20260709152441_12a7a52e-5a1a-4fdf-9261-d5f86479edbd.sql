
-- 1) Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  target_email text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_type_idx ON public.audit_logs (entity_type);

-- 2) Grants (superadmin reads via RLS; triggers use service role via SECURITY DEFINER)
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- 3) RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmin can view audit logs" ON public.audit_logs;
CREATE POLICY "Superadmin can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'superadmin'));

-- 4) Helper: resolve actor email from auth.uid() via profiles
CREATE OR REPLACE FUNCTION public.audit_actor_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE id = auth.uid()
$$;

-- 5) Trigger: user_roles changes
CREATE OR REPLACE FUNCTION public.audit_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_email text;
BEGIN
  SELECT email INTO target_email FROM public.profiles WHERE id = COALESCE(NEW.user_id, OLD.user_id);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(actor_id, actor_email, action, entity_type, entity_id, target_email, metadata)
    VALUES (auth.uid(), public.audit_actor_email(),
            'Assigned role ' || NEW.role, 'user_role', NEW.user_id::text, target_email,
            jsonb_build_object('role', NEW.role));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      INSERT INTO public.audit_logs(actor_id, actor_email, action, entity_type, entity_id, target_email, metadata)
      VALUES (auth.uid(), public.audit_actor_email(),
              'Changed role from ' || OLD.role || ' to ' || NEW.role, 'user_role', NEW.user_id::text, target_email,
              jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role));
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.audit_logs(actor_id, actor_email, action, entity_type, entity_id, target_email, metadata)
      VALUES (auth.uid(), public.audit_actor_email(),
              CASE WHEN NEW.status = 'banned' THEN 'Banned user' ELSE 'Reactivated user' END,
              'user_status', NEW.user_id::text, target_email,
              jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status));
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs(actor_id, actor_email, action, entity_type, entity_id, target_email, metadata)
    VALUES (auth.uid(), public.audit_actor_email(),
            'Removed role ' || OLD.role, 'user_role', OLD.user_id::text, target_email,
            jsonb_build_object('role', OLD.role));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles();

-- 6) Trigger: govt_schemes changes
CREATE OR REPLACE FUNCTION public.audit_govt_schemes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(actor_id, actor_email, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), public.audit_actor_email(),
            'Added scheme: ' || NEW.title, 'scheme', NEW.id::text,
            jsonb_build_object('source', NEW.source));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs(actor_id, actor_email, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), public.audit_actor_email(),
            'Updated scheme: ' || NEW.title, 'scheme', NEW.id::text,
            jsonb_build_object('is_active', NEW.is_active, 'source', NEW.source));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs(actor_id, actor_email, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), public.audit_actor_email(),
            'Deleted scheme: ' || OLD.title, 'scheme', OLD.id::text,
            jsonb_build_object('source', OLD.source));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_govt_schemes ON public.govt_schemes;
CREATE TRIGGER trg_audit_govt_schemes
AFTER INSERT OR UPDATE OR DELETE ON public.govt_schemes
FOR EACH ROW EXECUTE FUNCTION public.audit_govt_schemes();

-- 7) Trigger: health_records inserts (AI summary created)
CREATE OR REPLACE FUNCTION public.audit_health_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_email text;
BEGIN
  SELECT email INTO owner_email FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.audit_logs(actor_id, actor_email, action, entity_type, entity_id, target_email, metadata)
  VALUES (NEW.user_id, owner_email,
          'AI health summary generated (' || COALESCE(NEW.risk_level, 'unknown') || ')',
          'health_record', NEW.id::text, owner_email,
          jsonb_build_object('risk_level', NEW.risk_level));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_health_records ON public.health_records;
CREATE TRIGGER trg_audit_health_records
AFTER INSERT ON public.health_records
FOR EACH ROW EXECUTE FUNCTION public.audit_health_records();

-- 8) Enable realtime
ALTER TABLE public.audit_logs REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'audit_logs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs';
  END IF;
END $$;
