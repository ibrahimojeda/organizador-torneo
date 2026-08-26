-- =====================================================
-- MIGRACIÓN 005: Agregar columna status a registrations
-- =====================================================
-- La columna status permite que el organizador confirme
-- la asistencia de cada competidor (pending/accepted/denied).
-- Solo los competidores con status != 'denied' participan
-- en la generación de llaves.
-- =====================================================

-- 1. Agregar columna status si no existe
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'accepted', 'denied'));

-- 2. Actualizar registros existentes a 'accepted' para no romper torneos en curso
UPDATE registrations SET status = 'accepted' WHERE status IS NULL OR status = 'pending';

-- Recargar schema cache
NOTIFY pgrst, 'reload schema';