
-- 1. Add missing UPDATE policy on storage.objects for health-reports bucket
DROP POLICY IF EXISTS "Users can update own health report files" ON storage.objects;
CREATE POLICY "Users can update own health report files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'health-reports'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'health-reports'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 2. Restrict user_roles INSERT to prevent superadmin proliferation
DROP POLICY IF EXISTS "Superadmin can insert roles" ON public.user_roles;
CREATE POLICY "Superadmin can insert non-superadmin roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'superadmin')
  AND role <> 'superadmin'
);
