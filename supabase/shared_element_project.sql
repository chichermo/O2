-- ============================================================
-- Element — proyecto Supabase compartido (Chill Outs)
-- Ejecutar UNA vez en el SQL Editor del proyecto de Chill Outs.
--
-- Prefijos:
--   nablijven_*  → app Detentions
--   o2_*         → app O2
--   (sin prefijo) → Chill Outs (ya existentes: students, users, …)
--
-- app_settings se REUTILIZA (Chill Outs). Detentions usa la key
-- 'nablijven_calendar_days' — no choca con Chill Outs.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- NABLIJVEN (Detentions)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nablijven_students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  grade TEXT,
  day TEXT NOT NULL CHECK (day IN ('MAANDAG', 'DINSDAG', 'DONDERDAG')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.nablijven_detentions (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  date TEXT NOT NULL,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('MAANDAG', 'DINSDAG', 'DONDERDAG')),
  student TEXT NOT NULL,
  teacher TEXT,
  reason TEXT,
  task TEXT,
  lvs_date TEXT,
  should_print BOOLEAN DEFAULT FALSE,
  can_use_chromebook BOOLEAN DEFAULT FALSE,
  extra_notes TEXT,
  is_double_period BOOLEAN DEFAULT FALSE,
  time_period TEXT,
  nablijven_geweigerd BOOLEAN DEFAULT FALSE,
  did_not_attend BOOLEAN DEFAULT FALSE,
  source_detention_id TEXT REFERENCES public.nablijven_detentions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.nablijven_calendar_day_settings (
  date TEXT PRIMARY KEY,
  blocked BOOLEAN DEFAULT FALSE,
  allow_detentions BOOLEAN DEFAULT TRUE,
  notice_title TEXT,
  notice TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.nablijven_attachments (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('detention', 'student')),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.nablijven_audit_logs (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data JSONB,
  new_data JSONB,
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_nablijven_students_day ON public.nablijven_students(day);
CREATE INDEX IF NOT EXISTS idx_nablijven_detentions_date ON public.nablijven_detentions(date);
CREATE INDEX IF NOT EXISTS idx_nablijven_detentions_day ON public.nablijven_detentions(day_of_week);
CREATE INDEX IF NOT EXISTS idx_nablijven_detentions_number ON public.nablijven_detentions(number);
CREATE INDEX IF NOT EXISTS idx_nablijven_calendar_blocked ON public.nablijven_calendar_day_settings(blocked);
CREATE INDEX IF NOT EXISTS idx_nablijven_attachments_record ON public.nablijven_attachments(record_id, record_type);
CREATE INDEX IF NOT EXISTS idx_nablijven_audit_table_record ON public.nablijven_audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_nablijven_audit_changed_at ON public.nablijven_audit_logs(changed_at DESC);

DROP TRIGGER IF EXISTS update_nablijven_students_updated_at ON public.nablijven_students;
CREATE TRIGGER update_nablijven_students_updated_at
  BEFORE UPDATE ON public.nablijven_students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_nablijven_detentions_updated_at ON public.nablijven_detentions;
CREATE TRIGGER update_nablijven_detentions_updated_at
  BEFORE UPDATE ON public.nablijven_detentions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_nablijven_calendar_updated_at ON public.nablijven_calendar_day_settings;
CREATE TRIGGER update_nablijven_calendar_updated_at
  BEFORE UPDATE ON public.nablijven_calendar_day_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SECURITY DEFINER: el trigger debe poder escribir en audit_logs aunque
-- anon solo tenga SELECT (si no, INSERT/UPDATE en students falla por RLS).
CREATE OR REPLACE FUNCTION public.nablijven_create_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.nablijven_audit_logs (id, table_name, record_id, action, new_data, changed_at)
    VALUES ('audit-' || gen_random_uuid()::text, TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), NOW());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.nablijven_audit_logs (id, table_name, record_id, action, old_data, new_data, changed_at)
    VALUES ('audit-' || gen_random_uuid()::text, TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), NOW());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.nablijven_audit_logs (id, table_name, record_id, action, old_data, changed_at)
    VALUES ('audit-' || gen_random_uuid()::text, TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), NOW());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_nablijven_students ON public.nablijven_students;
CREATE TRIGGER audit_nablijven_students
  AFTER INSERT OR UPDATE OR DELETE ON public.nablijven_students
  FOR EACH ROW EXECUTE FUNCTION public.nablijven_create_audit_log();

DROP TRIGGER IF EXISTS audit_nablijven_detentions ON public.nablijven_detentions;
CREATE TRIGGER audit_nablijven_detentions
  AFTER INSERT OR UPDATE OR DELETE ON public.nablijven_detentions
  FOR EACH ROW EXECUTE FUNCTION public.nablijven_create_audit_log();

ALTER TABLE public.nablijven_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nablijven_detentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nablijven_calendar_day_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nablijven_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nablijven_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all on nablijven_students" ON public.nablijven_students;
CREATE POLICY "Allow anon all on nablijven_students"
  ON public.nablijven_students FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on nablijven_detentions" ON public.nablijven_detentions;
CREATE POLICY "Allow anon all on nablijven_detentions"
  ON public.nablijven_detentions FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on nablijven_calendar_day_settings" ON public.nablijven_calendar_day_settings;
CREATE POLICY "Allow anon all on nablijven_calendar_day_settings"
  ON public.nablijven_calendar_day_settings FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on nablijven_attachments" ON public.nablijven_attachments;
CREATE POLICY "Allow anon all on nablijven_attachments"
  ON public.nablijven_attachments FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read nablijven_audit_logs" ON public.nablijven_audit_logs;
CREATE POLICY "Allow anon read nablijven_audit_logs"
  ON public.nablijven_audit_logs FOR SELECT TO anon USING (true);

-- Storage bucket aparte (no pisa attachments de otros usos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('nablijven_attachments', 'nablijven_attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "nablijven_attachments_public_read" ON storage.objects;
CREATE POLICY "nablijven_attachments_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'nablijven_attachments');

DROP POLICY IF EXISTS "nablijven_attachments_anon_insert" ON storage.objects;
CREATE POLICY "nablijven_attachments_anon_insert"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'nablijven_attachments');

DROP POLICY IF EXISTS "nablijven_attachments_anon_delete" ON storage.objects;
CREATE POLICY "nablijven_attachments_anon_delete"
  ON storage.objects FOR DELETE TO anon
  USING (bucket_id = 'nablijven_attachments');

-- ────────────────────────────────────────────────────────────
-- O2 (Incident met Impact)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.o2_incidenten (
  id TEXT PRIMARY KEY,
  datum_incident DATE,
  verbale_agressie BOOLEAN DEFAULT FALSE,
  fysieke_agressie BOOLEAN DEFAULT FALSE,
  beschrijving TEXT DEFAULT '',
  leerlingen JSONB NOT NULL DEFAULT '[]'::jsonb,
  personeel JSONB NOT NULL DEFAULT '[]'::jsonb,
  opvolgingen JSONB NOT NULL DEFAULT '[]'::jsonb,
  andere_data TEXT DEFAULT '',
  opgeslagen_op TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_o2_incidenten_datum ON public.o2_incidenten(datum_incident);
CREATE INDEX IF NOT EXISTS idx_o2_incidenten_opgeslagen ON public.o2_incidenten(opgeslagen_op DESC);

DROP TRIGGER IF EXISTS update_o2_incidenten_updated_at ON public.o2_incidenten;
CREATE TRIGGER update_o2_incidenten_updated_at
  BEFORE UPDATE ON public.o2_incidenten
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.o2_incidenten ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all on o2_incidenten" ON public.o2_incidenten;
CREATE POLICY "Allow anon all on o2_incidenten"
  ON public.o2_incidenten FOR ALL TO anon USING (true) WITH CHECK (true);

-- Asegurar app_settings (Chill Outs) por si aún no existe
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on app_settings" ON public.app_settings;
CREATE POLICY "Allow all operations on app_settings"
  ON public.app_settings FOR ALL USING (true) WITH CHECK (true);
