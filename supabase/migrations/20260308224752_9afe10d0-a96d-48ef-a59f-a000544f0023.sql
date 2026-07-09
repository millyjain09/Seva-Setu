-- Harden superadmin role policies
DROP POLICY IF EXISTS "Superadmin can update roles" ON user_roles;
DROP POLICY IF EXISTS "Superadmin can delete roles" ON user_roles;

CREATE POLICY "Superadmin can update user roles only"
  ON user_roles FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    AND user_id != auth.uid()
  )
  WITH CHECK (
    role != 'superadmin'
  );

CREATE POLICY "Superadmin can delete non-superadmin roles"
  ON user_roles FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    AND user_id != auth.uid()
    AND role != 'superadmin'
  );