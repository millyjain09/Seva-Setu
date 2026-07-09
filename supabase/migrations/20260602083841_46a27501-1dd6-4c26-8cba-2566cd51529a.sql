-- Add full_name column
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS full_name text;

-- Backfill from profiles
UPDATE public.user_roles ur
SET full_name = p.full_name
FROM public.profiles p
WHERE p.id = ur.user_id;

-- Trigger: populate full_name on insert/update of user_roles
CREATE OR REPLACE FUNCTION public.user_roles_set_full_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.full_name IS NULL OR NEW.full_name = '' THEN
    SELECT full_name INTO NEW.full_name FROM public.profiles WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_roles_set_full_name ON public.user_roles;
CREATE TRIGGER trg_user_roles_set_full_name
BEFORE INSERT OR UPDATE OF user_id ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.user_roles_set_full_name();

-- Trigger: when profiles.full_name changes, propagate to user_roles
CREATE OR REPLACE FUNCTION public.sync_user_roles_full_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_roles SET full_name = NEW.full_name WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_roles_full_name ON public.profiles;
CREATE TRIGGER trg_sync_user_roles_full_name
AFTER INSERT OR UPDATE OF full_name ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_user_roles_full_name();