-- Add unique constraint on title for upsert in refresh-schemes
ALTER TABLE public.govt_schemes ADD CONSTRAINT govt_schemes_title_key UNIQUE (title);