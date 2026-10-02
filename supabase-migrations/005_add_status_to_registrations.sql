-- =====================================================
-- MIGRACIÓN 005: Agregar columna status a registrations
-- =====================================================
-- La columna status permite que el organizador confirme
-- la asistencia de cada competidor (pending/accepted/denied).
-- Solo los competidores con status != 'denied' participan
-- en la generación de llaves.
-- =====================================================

-- Migration 002 creates the status column and initializes active registrations.
-- Preserve pending decisions except for existing tournaments already in progress.
UPDATE registrations AS r
SET status = 'accepted'
FROM tournaments AS t
WHERE r.tournament_id = t.id
  AND (r.status IS NULL OR r.status = 'pending')
  AND t.status IN ('ongoing', 'finished');

-- Recargar schema cache
NOTIFY pgrst, 'reload schema';