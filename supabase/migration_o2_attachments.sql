-- O2: bijlagen bij beschrijving situatie en teamopvolging
-- Storage bucket + metadata-tabel (optioneel naast JSON in o2_incidenten)

ALTER TABLE public.o2_incidenten
  ADD COLUMN IF NOT EXISTS beschrijving_bijlagen JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.o2_incidenten.beschrijving_bijlagen IS
  'Bijlagen bij beschrijving situatie: [{ id, name, url, size, mimeType }]';

CREATE TABLE IF NOT EXISTS public.o2_attachments (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  section TEXT NOT NULL CHECK (section IN ('beschrijving', 'opvolging')),
  opvolging_nr INTEGER,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT DEFAULT '',
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_o2_attachments_incident
  ON public.o2_attachments(incident_id);

ALTER TABLE public.o2_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all on o2_attachments" ON public.o2_attachments;
CREATE POLICY "Allow anon all on o2_attachments"
  ON public.o2_attachments FOR ALL TO anon USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('o2_attachments', 'o2_attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "o2_attachments_public_read" ON storage.objects;
CREATE POLICY "o2_attachments_public_read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'o2_attachments');

DROP POLICY IF EXISTS "o2_attachments_anon_insert" ON storage.objects;
CREATE POLICY "o2_attachments_anon_insert"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'o2_attachments');

DROP POLICY IF EXISTS "o2_attachments_anon_delete" ON storage.objects;
CREATE POLICY "o2_attachments_anon_delete"
  ON storage.objects FOR DELETE TO anon
  USING (bucket_id = 'o2_attachments');
