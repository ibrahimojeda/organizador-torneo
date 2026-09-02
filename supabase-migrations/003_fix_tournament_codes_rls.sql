-- =====================================================
-- MIGRACIÓN 003: Corregir RLS de tournament_codes
-- Permite que cualquier usuario autenticado pueda
-- insertar y ver códigos de acceso (jueces, mesa, público)
-- =====================================================

-- Eliminar TODAS las políticas existentes en esta tabla
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tournament_codes'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON tournament_codes', pol.policyname);
  END LOOP;
END;
$$;

-- SELECT: solo el organizador autenticado del torneo puede ver los códigos
CREATE POLICY "codes_sel_auth" ON tournament_codes
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  );

-- INSERT: solo el organizador autenticado del torneo puede crear códigos
CREATE POLICY "codes_ins_auth" ON tournament_codes
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  );

-- Función de validación anónima para comprobar códigos públicos sin filtrar la tabla
CREATE OR REPLACE FUNCTION validate_tournament_code(p_code TEXT)
RETURNS TABLE (
  code_id       UUID,
  tournament_id UUID,
  code_role     TEXT,
  tournament_name TEXT,
  tournament_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tc.id            AS code_id,
    tc.tournament_id AS tournament_id,
    tc.role          AS code_role,
    t.name           AS tournament_name,
    t.status         AS tournament_status
  FROM tournament_codes tc
  JOIN tournaments t ON t.id = tc.tournament_id
  WHERE tc.code = p_code
    AND tc.active = TRUE
  ORDER BY tc.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_tournament_code(TEXT) TO anon, authenticated;

-- UPDATE: solo el organizador del torneo puede modificar/desactivar códigos
CREATE POLICY "codes_upd_org" ON tournament_codes
  FOR UPDATE USING (
    tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  );

-- DELETE: solo el organizador puede eliminar códigos
CREATE POLICY "codes_del_org" ON tournament_codes
  FOR DELETE USING (
    tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  );