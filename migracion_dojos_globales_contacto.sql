-- ============================================================
--  MIGRACIÓN: DOJOS ÚNICOS GLOBALES + DATOS DE CONTACTO
--  + VISIBILIDAD POR TORNEO (tournament_dojos)
--
--  - dojos pasa a ser global: 1 registro por nombre (único).
--  - Se agregan datos de contacto para invitaciones.
--  - Los organizadores solo ven los dojos autorizados por el
--    super admin para su torneo (tabla tournament_dojos) o los
--    de sus propias inscripciones.
--  Ejecutar en: Supabase Dashboard → SQL Editor (idempotente)
-- ============================================================

-- 0) Garantizar función is_super_admin() (requerida por las políticas)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

-- 1) Columna tournament_id de dojos pasa a ser OPCIONAL (global)
ALTER TABLE dojos ALTER COLUMN tournament_id DROP NOT NULL;

-- 2) Agregar columnas de contacto / información para invitaciones
ALTER TABLE dojos
  ADD COLUMN IF NOT EXISTS email            TEXT;
ALTER TABLE dojos
  ADD COLUMN IF NOT EXISTS phone            TEXT;
ALTER TABLE dojos
  ADD COLUMN IF NOT EXISTS whatsapp         TEXT;
ALTER TABLE dojos
  ADD COLUMN IF NOT EXISTS address          TEXT;
ALTER TABLE dojos
  ADD COLUMN IF NOT EXISTS city             TEXT;
ALTER TABLE dojos
  ADD COLUMN IF NOT EXISTS country_name     TEXT;
ALTER TABLE dojos
  ADD COLUMN IF NOT EXISTS instagram        TEXT;
ALTER TABLE dojos
  ADD COLUMN IF NOT EXISTS facebook         TEXT;
ALTER TABLE dojos
  ADD COLUMN IF NOT EXISTS tiktok           TEXT;
ALTER TABLE dojos
  ADD COLUMN IF NOT EXISTS youtube          TEXT;
ALTER TABLE dojos
  ADD COLUMN IF NOT EXISTS contact_name     TEXT;   -- Nombre del sensei / representante
ALTER TABLE dojos
  ADD COLUMN IF NOT EXISTS open_registration BOOLEAN NOT NULL DEFAULT true; -- Recibe inscripciones libremente

-- 3) Devuelve índices previos (para permitir re-ejecución)
-- dojos_name_key puede ser una CONSTRAINT UNIQUE (creada por `name UNIQUE`)
-- o un índice suelto según la versión del esquema. Se manejan ambos casos.
DROP INDEX IF EXISTS idx_dojos_name_per_tournament;
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
DROP INDEX IF EXISTS idx_dojos_name_global;

-- 4) DEDUPLICAR dojos existentes (mismo nombre → conservar uno, reasignar referencias)
--    IMPORTANTE: la deduplicación va ANTES de crear el índice único global,
--    para no fallar cuando ya existan duplicados.
-- 4a) Reasignar competitors.dojo_id hacia la fila canónica (la más antigua) por nombre
WITH canonical AS (
  SELECT DISTINCT ON (lower(name)) id, lower(name) AS lname
  FROM dojos
  ORDER BY lower(name), created_at
)
UPDATE competitors comp
SET dojo_id = c.id
FROM dojos d
JOIN canonical c ON c.lname = lower(d.name)
WHERE comp.dojo_id = d.id
  AND d.id <> c.id;

-- 4b) Eliminar las filas duplicadas (las que no son canónicas)
--     La reasignación de tournament_dojos se hace al final (después de crear la tabla).
DELETE FROM dojos d
WHERE NOT EXISTS (
  SELECT 1 FROM (
    SELECT DISTINCT ON (lower(name)) id
    FROM dojos
    ORDER BY lower(name), created_at
  ) c
  WHERE c.id = d.id
);

-- 4c) Ahora SÍ: crear el índice único global por nombre
CREATE UNIQUE INDEX IF NOT EXISTS idx_dojos_name_global ON dojos(lower(name));


-- 5) TABLA tournament_dojos (visibilidad por torneo)
CREATE TABLE IF NOT EXISTS tournament_dojos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  dojo_id       UUID NOT NULL REFERENCES dojos(id) ON DELETE CASCADE,
  granted_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, dojo_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_dojos_tournament ON tournament_dojos(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_dojos_dojo ON tournament_dojos(dojo_id);

-- 5b) Reasignar tournament_dojos hacia la fila canónica de dojos (si quedaron referencias
--     a dojos eliminados por deduplicación) — se ejecuta tras crear la tabla.
WITH canonical AS (
  SELECT DISTINCT ON (lower(name)) id, lower(name) AS lname
  FROM dojos
  ORDER BY lower(name), created_at
)
UPDATE tournament_dojos td
SET dojo_id = c.id
FROM dojos d
JOIN canonical c ON c.lname = lower(d.name)
WHERE td.dojo_id = d.id
  AND d.id <> c.id;



-- 6) RLS de tournament_dojos: super_admin gestiona; organizador lee los de su torneo
ALTER TABLE tournament_dojos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tournament_dojos_select" ON tournament_dojos;
CREATE POLICY "tournament_dojos_select" ON tournament_dojos
  FOR SELECT USING (
    tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "tournament_dojos_write" ON tournament_dojos;
CREATE POLICY "tournament_dojos_write" ON tournament_dojos
  FOR ALL USING (
    public.is_super_admin()
    OR tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  )
  WITH CHECK (
    public.is_super_admin()
    OR tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  );

-- 7) RLS dojos: SELECT solo super_admin (global) u organizador con acceso
--    IMPORTANTE: NO se hace SELECT sobre la propia tabla dojos dentro de la
--    política (eso provoca "infinite recursion detected in policy").
--    Se delega la comprobación a una función SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.can_view_dojo(p_dojo_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM tournament_dojos td
      WHERE td.dojo_id = p_dojo_id
        AND td.tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM registrations r
      JOIN competitors comp ON comp.id = r.competitor_id
      WHERE comp.dojo_id = p_dojo_id
        AND r.tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
    );
$$;

DROP POLICY IF EXISTS "dojos_select_public" ON dojos;
CREATE POLICY "dojos_select_public" ON dojos
  FOR SELECT USING (public.can_view_dojo(id));

DROP POLICY IF EXISTS "dojos_write_authenticated" ON dojos;
DROP POLICY IF EXISTS "dojos_insert" ON dojos;
CREATE POLICY "dojos_insert" ON dojos
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      auth.uid() IS NOT NULL
      AND tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "dojos_update" ON dojos;
CREATE POLICY "dojos_update" ON dojos
  FOR UPDATE USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "dojos_delete" ON dojos;
CREATE POLICY "dojos_delete" ON dojos
  FOR DELETE USING (public.is_super_admin());

NOTIFY pgrst, 'reload schema';