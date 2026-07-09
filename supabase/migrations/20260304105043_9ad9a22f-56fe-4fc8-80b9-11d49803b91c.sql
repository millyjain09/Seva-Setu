
-- Create health-reports storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('health-reports', 'health-reports', false);

-- Storage RLS: users can upload to their own folder
CREATE POLICY "Users can upload own reports" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'health-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own reports" ON storage.objects FOR SELECT USING (bucket_id = 'health-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own reports" ON storage.objects FOR DELETE USING (bucket_id = 'health-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS for health_records: users can CRUD own records
CREATE POLICY "Users can view own health records" ON public.health_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own health records" ON public.health_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own health records" ON public.health_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own health records" ON public.health_records FOR DELETE USING (auth.uid() = user_id);

-- RLS for govt_schemes: public read access
CREATE POLICY "Anyone can view govt schemes" ON public.govt_schemes FOR SELECT USING (true);

-- Seed govt_schemes with real Indian health schemes
INSERT INTO public.govt_schemes (title, description, link, eligibility_criteria) VALUES
('Ayushman Bharat - PMJAY', 'Provides health cover of ₹5 lakh per family per year for secondary and tertiary care hospitalization to over 12 crore poor and vulnerable families.', 'https://pmjay.gov.in', '{"income_limit": 250000, "category": "Central", "type": "Health Insurance", "target": "BPL families", "age": "All ages"}'),
('Janani Suraksha Yojana (JSY)', 'Cash assistance for institutional deliveries to reduce maternal and neonatal mortality among poor pregnant women.', 'https://nhm.gov.in/index1.php?lang=1&level=3&sublinkid=841&lid=309', '{"income_limit": 150000, "category": "Maternal", "type": "Cash Assistance", "target": "Pregnant women", "age": "15-49"}'),
('Rashtriya Bal Swasthya Karyakram (RBSK)', 'Free health screening and early intervention for children aged 0-18 years for 4Ds: Defects at birth, Diseases, Deficiencies, Development delays.', 'https://rbsk.gov.in', '{"income_limit": null, "category": "Child Health", "type": "Screening", "target": "Children", "age": "0-18"}'),
('Pradhan Mantri Surakshit Matritva Abhiyan (PMSMA)', 'Free antenatal care on the 9th of every month for pregnant women at government health facilities.', 'https://pmsma.nhp.gov.in', '{"income_limit": null, "category": "Maternal", "type": "Antenatal Care", "target": "Pregnant women", "age": "15-49"}'),
('National Health Mission (NHM)', 'Comprehensive healthcare delivery covering rural and urban areas with free OPD, diagnostics, and medicines at public health facilities.', 'https://nhm.gov.in', '{"income_limit": null, "category": "Central", "type": "Healthcare Delivery", "target": "All citizens", "age": "All ages"}'),
('Pradhan Mantri Jan Aushadhi Yojana (PMJAY)', 'Makes quality generic medicines available at affordable prices through dedicated Jan Aushadhi Kendras across India.', 'https://janaushadhi.gov.in', '{"income_limit": null, "category": "Central", "type": "Medicines", "target": "All citizens", "age": "All ages"}'),
('Nikshay Poshan Yojana', 'Direct benefit transfer of ₹500 per month to TB patients for nutritional support during treatment.', 'https://nikshay.in', '{"income_limit": null, "category": "Central", "type": "Nutrition Support", "target": "TB patients", "age": "All ages"}'),
('Ayushman Bharat Health & Wellness Centres', 'Provides comprehensive primary healthcare including free essential drugs, diagnostics, and teleconsultation at 1.5 lakh Health & Wellness Centres.', 'https://ab-hwc.nhp.gov.in', '{"income_limit": null, "category": "Central", "type": "Primary Care", "target": "All citizens", "age": "All ages"}');
