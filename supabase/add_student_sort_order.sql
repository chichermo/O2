-- Orden Excel/bulk bewaren voor nablijven_students
ALTER TABLE public.nablijven_students
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

CREATE INDEX IF NOT EXISTS idx_nablijven_students_sort
  ON public.nablijven_students(day, sort_order);
