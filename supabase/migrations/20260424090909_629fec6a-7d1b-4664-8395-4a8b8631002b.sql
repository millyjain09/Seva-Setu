-- 1) Drop duplicate {public}-scoped storage policies on health-reports bucket
DROP POLICY IF EXISTS "Users can upload own reports" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own reports" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own reports" ON storage.objects;

-- 2) Lock down user_roles INSERT: only superadmin (via authenticated role)
DROP POLICY IF EXISTS "Superadmin can insert roles" ON public.user_roles;

CREATE POLICY "Superadmin can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'superadmin'));