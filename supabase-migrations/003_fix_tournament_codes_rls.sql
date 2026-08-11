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

-- SELECT: cualquier usuario autenticado puede ver códigos
CREATE POLICY "codes_sel_auth" ON tournament_codes
  FOR SELECT USING (auth.role() = 'authenticated');

-- INSERT: cualquier usuario autenticado puede crear códigos
CREATE POLICY "codes_ins_auth" ON tournament_codes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

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