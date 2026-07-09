
-- Drop all existing RESTRICTIVE policies on profiles
DROP POLICY IF EXISTS "Superadmin can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Superadmin can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Superadmin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Recreate as PERMISSIVE policies (default)
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Superadmin can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmin can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmin can delete profiles"
  ON public.profiles FOR DELETE
  USING (public.has_role(auth.uid(), 'superadmin'));

-- Fix user_roles policies too (same issue)
DROP POLICY IF EXISTS "Superadmin can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Superadmin can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Superadmin can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Superadmin can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;

CREATE POLICY "Users can read own role"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Superadmin can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmin can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmin can update roles"
  ON public.user_roles FOR UPDATE
  USING (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmin can delete roles"
  ON public.user_roles FOR DELETE
  USING (public.has_role(auth.uid(), 'superadmin'));
