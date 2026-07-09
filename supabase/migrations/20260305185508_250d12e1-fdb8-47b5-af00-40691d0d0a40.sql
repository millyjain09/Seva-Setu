
-- Storage RLS: allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload own health reports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'health-reports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own health reports"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'health-reports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own health reports"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'health-reports' AND (storage.foldername(name))[1] = auth.uid()::text);
