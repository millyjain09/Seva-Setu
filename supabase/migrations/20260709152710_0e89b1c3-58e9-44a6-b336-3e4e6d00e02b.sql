
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
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs(actor_id, actor_email, action, entity_type, entity_id, target_email, metadata)
    VALUES (auth.uid(), public.audit_actor_email(),
            'Removed role ' || OLD.role, 'user_role', OLD.user_id::text, target_email,
            jsonb_build_object('role', OLD.role));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_user_roles() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_profile_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs(actor_id, actor_email, action, entity_type, entity_id, target_email, metadata)
    VALUES (auth.uid(), public.audit_actor_email(),
            CASE WHEN NEW.status = 'banned' THEN 'Banned user' ELSE 'Reactivated user' END,
            'user_status', NEW.id::text, NEW.email,
            jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_profile_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_profile_status ON public.profiles;
CREATE TRIGGER trg_audit_profile_status
AFTER UPDATE OF status ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_profile_status();
