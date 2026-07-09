
-- Drop restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Users can view own health records" ON health_records;
DROP POLICY IF EXISTS "Users can insert own health records" ON health_records;
DROP POLICY IF EXISTS "Users can update own health records" ON health_records;
DROP POLICY IF EXISTS "Users can delete own health records" ON health_records;

CREATE POLICY "Users can view own health records"
  ON health_records FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own health records"
  ON health_records FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own health records"
  ON health_records FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own health records"
  ON health_records FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
