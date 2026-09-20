-- ============================================================
--  MIGRACIÓN: AISLAMIENTO TOTAL POR TORNEO
--  Competidores y Dojos independientes por torneo.
--  Categorías vacías no manuales se eliminan al asignar.
--
--  Ejecutar en: Supabase Dashboard → SQL Editor
--  (Es idempotente: se puede ejecutar más de una vez)
-- ============================================================

-- 1) AGREGAR tournament_id a competitors y dojos
ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE;

ALTER TABLE dojos
  ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE;

-- 2) BACKFILL: asignar torneo a registros existentes
UPDATE competitors c
SET tournament_id = r.tournament_id
FROM registrations r
WHERE c.tournament_id IS NULL
  AND r.competitor_id = c.id;

UPDATE dojos d
SET tournament_id = comp.tournament_id
FROM competitors comp
WHERE d.tournament_id IS NULL
  AND comp.dojo_id = d.id;

-- Nota: los dojos/competidores huérfanos (sin torneo) quedan con NULL.
-- La app siempre crea los nuevos con tournament_id, por lo que
-- a partir de ahora todo queda aislado.

-- 3) ÍNDICES de aislamiento
CREATE INDEX IF NOT EXISTS idx_competitors_tournament ON competitors(tournament_id);
CREATE INDEX IF NOT EXISTS idx_dojos_tournament ON dojos(tournament_id);
CREATE INDEX IF NOT EXISTS idx_competitors_doc_tournament ON competitors(tournament_id, document_id);

-- 4) DOJOS: nombre único por torneo (no global)
-- dojos_name_key es una CONSTRAINT UNIQUE (no un índice suelto).
-- Se elimina con ALTER TABLE DROP CONSTRAINT. Se cubre también el
-- caso edge de que exista como índice suelto.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dojos_name_key'
      AND conrelid = 'dojos'::regclass
      AND contype IN ('u', 'p', 'x')
  ) THEN
    ALTER TABLE dojos DROP CONSTRAINT dojos_name_key;
  ELSIF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'dojos' AND indexname = 'dojos_name_key'
  ) THEN
    DROP INDEX dojos_name_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dojos_name_per_tournament ON dojos(tournament_id, lower(name));

-- 5) CATEGORÍAS: columna is_manual para conservar las creadas por el admin
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;

-- 6) RLS COMPETITORS (aislado por torneo del organizador o público)
DROP POLICY IF EXISTS "competitors: ver todos (autenticados)" ON competitors;
DROP POLICY IF EXISTS "competitors: ver del torneo (autenticados)" ON competitors;
CREATE POLICY "competitors: ver del torneo (autenticados)" ON competitors
  FOR SELECT USING (
    tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
    OR tournament_id IN (SELECT id FROM tournaments WHERE is_public = TRUE)
  );

DROP POLICY IF EXISTS "competitors: crear autenticados" ON competitors;
DROP POLICY IF EXISTS "competitors: crear en torneo propio" ON competitors;
CREATE POLICY "competitors: crear en torneo propio" ON competitors
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  );

DROP POLICY IF EXISTS "competitors: editar autenticados" ON competitors;
DROP POLICY IF EXISTS "competitors: editar en torneo propio" ON competitors;
CREATE POLICY "competitors: editar en torneo propio" ON competitors
  FOR UPDATE USING (
    tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  );

DROP POLICY IF EXISTS "competitors: eliminar en torneo propio" ON competitors;
CREATE POLICY "competitors: eliminar en torneo propio" ON competitors
  FOR DELETE USING (
    tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  );

-- 7) RLS DOJOS (aislado por torneo del organizador o público)
DROP POLICY IF EXISTS "dojos_select_public" ON dojos;
CREATE POLICY "dojos_select_public" ON dojos
  FOR SELECT USING (
    tournament_id IN (SELECT id FROM tournaments WHERE is_public = TRUE)
    OR tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  );

DROP POLICY IF EXISTS "dojos_write_authenticated" ON dojos;
CREATE POLICY "dojos_write_authenticated" ON dojos
  FOR ALL USING (
    auth.uid() IS NOT NULL
    AND tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  ) WITH CHECK (
    tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  );

-- 8) Recargar schema cache de PostgREST
NOTIFY pgrst, 'reload schema';

-- ============================================================
--  VERIFICACIÓN (opcional): cuántos quedaron sin torneo
-- ============================================================
-- SELECT 'competitors sin torneo' AS item, count(*) FROM competitors WHERE tournament_id IS NULL
-- UNION ALL SELECT 'dojos sin torneo', count(*) FROM dojos WHERE tournament_id IS NULL;
