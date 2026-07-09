
-- Fix RLS policies: drop RESTRICTIVE policies and recreate as PERMISSIVE

-- govt_schemes: drop restrictive, add permissive public read
DROP POLICY IF EXISTS "Anyone can view govt schemes" ON public.govt_schemes;
CREATE POLICY "Anyone can view govt schemes" ON public.govt_schemes FOR SELECT USING (true);

-- health_records: drop all restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Users can view own health records" ON public.health_records;
DROP POLICY IF EXISTS "Users can insert own health records" ON public.health_records;
DROP POLICY IF EXISTS "Users can update own health records" ON public.health_records;
DROP POLICY IF EXISTS "Users can delete own health records" ON public.health_records;

CREATE POLICY "Users can view own health records" ON public.health_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own health records" ON public.health_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own health records" ON public.health_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own health records" ON public.health_records FOR DELETE USING (auth.uid() = user_id);
