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

-- 3) Unicidad global por nombre (sin tournament_id)
DROP INDEX IF EXISTS idx_dojos_name_per_tournament;
DROP INDEX IF EXISTS dojos_name_key;
DROP INDEX IF EXISTS idx_dojos_name_global;

-- Re-crear índice único global por nombre
CREATE UNIQUE INDEX IF NOT EXISTS idx_dojos_name_global ON dojos(lower(name));

-- 4) Deduplicar dojos existentes (mismo nombre → conservar uno, reasignar referencias)
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

-- 4b) Reasignar tournament_dojos (si existiera) hacia la fila canónica
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

-- 4c) Eliminar las filas duplicadas (las que no son canónicas)
DELETE FROM dojos d
WHERE NOT EXISTS (
  SELECT 1 FROM (
    SELECT DISTINCT ON (lower(name)) id
    FROM dojos
    ORDER BY lower(name), created_at
  ) c
  WHERE c.id = d.id
);


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
  FOR ALL USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- 7) RLS dojos: SELECT solo super_admin (global) u organizador con acceso
DROP POLICY IF EXISTS "dojos_select_public" ON dojos;
CREATE POLICY "dojos_select_public" ON dojos
  FOR SELECT USING (
    public.is_super_admin()
    OR id IN (
      SELECT d2.id FROM dojos d2
      JOIN tournament_dojos td ON td.dojo_id = d2.id
      WHERE td.tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
    )
    OR id IN (
      SELECT comp.dojo_id FROM competitors comp
      JOIN registrations r ON r.competitor_id = comp.id
      WHERE r.tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "dojos_write_authenticated" ON dojos;
CREATE POLICY "dojos_write_authenticated" ON dojos
  FOR ALL USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

NOTIFY pgrst, 'reload schema';