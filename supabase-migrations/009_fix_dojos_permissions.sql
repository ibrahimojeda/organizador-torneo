-- =====================================================
-- MIGRACIÓN 009: Permisos de Dojos por rol
--   - Super admin: crear, modificar y borrar dojos.
--   - Organizador: solo crear y ver dojos.
-- Idempotente. Ejecutar en Supabase → SQL Editor.
-- =====================================================

-- Función helper: ¿es super admin?
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

-- Función helper: ¿puede el usuario ver este dojo?
CREATE OR REPLACE FUNCTION public.can_view_dojo(p_dojo_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
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

ALTER TABLE dojos ENABLE ROW LEVEL SECURITY;

-- Quitar políticas anteriores
DROP POLICY IF EXISTS "dojos_select_public" ON dojos;
DROP POLICY IF EXISTS "dojos_write_authenticated" ON dojos;
DROP POLICY IF EXISTS "dojos_insert" ON dojos;
DROP POLICY IF EXISTS "dojos_update" ON dojos;
DROP POLICY IF EXISTS "dojos_delete" ON dojos;

-- SELECT (ver): super admin u organizador con acceso/inscripciones/torneo propio
CREATE POLICY "dojos_select_public" ON dojos
  FOR SELECT USING (public.can_view_dojo(id));

-- INSERT (crear): super admin u organizador para su propio torneo
CREATE POLICY "dojos_insert" ON dojos
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      auth.uid() IS NOT NULL
      AND tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
    )
  );

-- UPDATE (modificar): solo super admin
CREATE POLICY "dojos_update" ON dojos
  FOR UPDATE USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- DELETE (borrar): solo super admin
CREATE POLICY "dojos_delete" ON dojos
  FOR DELETE USING (public.is_super_admin());

-- tournament_dojos (visibilidad): super admin o el organizador del torneo
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

NOTIFY pgrst, 'reload schema';
