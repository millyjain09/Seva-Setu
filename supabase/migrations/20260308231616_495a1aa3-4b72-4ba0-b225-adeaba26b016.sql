
-- Drop ALL existing health_records policies
DROP POLICY IF EXISTS "Users can view own health records" ON health_records;
DROP POLICY IF EXISTS "Users can insert own health records" ON health_records;
DROP POLICY IF EXISTS "Users can update own health records" ON health_records;
DROP POLICY IF EXISTS "Users can delete own health records" ON health_records;

-- Recreate as explicitly PERMISSIVE
CREATE POLICY "Users can view own health records"
  ON health_records AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own health records"
  ON health_records AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own health records"
  ON health_records AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own health records"
  ON health_records AS PERMISSIVE FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Also fix govt_schemes to be permissive
DROP POLICY IF EXISTS "Anyone can view govt schemes" ON govt_schemes;
CREATE POLICY "Anyone can view govt schemes"
  ON govt_schemes AS PERMISSIVE FOR SELECT
  TO public
  USING (true);
