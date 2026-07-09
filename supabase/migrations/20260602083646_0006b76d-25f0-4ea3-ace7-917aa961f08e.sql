ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check CHECK (role = ANY (ARRAY['user'::text, 'admin'::text, 'superadmin'::text]));
UPDATE public.user_roles SET role = 'superadmin' WHERE user_id = '66ac27ab-e71f-4d18-8274-36e2ba91b625';