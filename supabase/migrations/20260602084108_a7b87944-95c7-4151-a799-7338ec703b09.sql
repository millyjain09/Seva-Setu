-- Sequence for short display IDs
CREATE SEQUENCE IF NOT EXISTS public.user_roles_display_seq START 1;

-- Add display_id column
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS display_id text UNIQUE;

-- Backfill existing rows in stable order
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at NULLS LAST, id) AS rn
  FROM public.user_roles
  WHERE display_id IS NULL
)
UPDATE public.user_roles ur
SET display_id = 'USR-' || lpad(ordered.rn::text, 6, '0')
FROM ordered
WHERE ur.id = ordered.id;

-- Advance sequence past backfilled values
SELECT setval('public.user_roles_display_seq', GREATEST((SELECT count(*) FROM public.user_roles), 1));

-- Auto-assign on insert
CREATE OR REPLACE FUNCTION public.user_roles_set_display_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    NEW.display_id := 'USR-' || lpad(nextval('public.user_roles_display_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_roles_set_display_id ON public.user_roles;
CREATE TRIGGER trg_user_roles_set_display_id
BEFORE INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.user_roles_set_display_id();