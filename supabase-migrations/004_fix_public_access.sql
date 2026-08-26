-- =====================================================
-- MIGRACIÓN 004: Fix acceso público a torneos
-- =====================================================
-- Agrega la columna is_public si no existe y
-- corrige las políticas RLS para permitir SELECT
-- de usuarios anónimos (sin autenticación).
-- =====================================================

-- 1. Agregar columna is_public si no existe
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Asegurar que los torneos existentes sean públicos
UPDATE tournaments SET is_public = TRUE WHERE is_public IS NULL OR is_public = FALSE;

-- 3. Política SELECT para torneos públicos (acceso anónimo)
DROP POLICY IF EXISTS "tournaments: ver públicos o propios" ON tournaments;
CREATE POLICY "tournaments: ver públicos o propios" ON tournaments
  FOR SELECT USING (is_public = TRUE OR organizer_id = auth.uid());

-- 4. Política SELECT para torneos (acceso anónimo simple)
DROP POLICY IF EXISTS "tournaments_select" ON tournaments;
CREATE POLICY "tournaments_select" ON tournaments
  FOR SELECT USING (true);

-- 5. Políticas para categorías: acceso público
DROP POLICY IF EXISTS "categories: ver públicas" ON categories;
CREATE POLICY "categories: ver públicas" ON categories
  FOR SELECT USING (
    tournament_id IN (SELECT id FROM tournaments WHERE is_public = TRUE)
    OR tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  );

-- 6. Políticas para matches: acceso público
DROP POLICY IF EXISTS "matches: ver públicos" ON matches;
CREATE POLICY "matches: ver públicos" ON matches
  FOR SELECT USING (
    tournament_id IN (SELECT id FROM tournaments WHERE is_public = TRUE)
    OR tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  );

-- Recargar schema cache
NOTIFY pgrst, 'reload schema';