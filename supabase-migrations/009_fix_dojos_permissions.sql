-- =====================================================
-- MIGRACIÓN 009: Dojos completos + permisos por rol
--   - Agrega columnas de contacto y la tabla tournament_dojos
--     (por si aún no existen en la base).
--   - Super admin: crear, modificar y borrar dojos.
--   - Organizador: solo crear y ver dojos.
-- Idempotente. Ejecutar en Supabase → SQL Editor.
-- =====================================================

-- Columnas de contacto (por si aún no existen)
ALTER TABLE dojos ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE dojos ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE dojos ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE dojos ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE dojos ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE dojos ADD COLUMN IF NOT EXISTS country_name TEXT;
ALTER TABLE dojos ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE dojos ADD COLUMN IF NOT EXISTS facebook TEXT;
ALTER TABLE dojos ADD COLUMN IF NOT EXISTS tiktok TEXT;
ALTER TABLE dojos ADD COLUMN IF NOT EXISTS youtube TEXT;
ALTER TABLE dojos ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE dojos ADD COLUMN IF NOT EXISTS open_registration BOOLEAN NOT NULL DEFAULT true;

-- Dojos globales: tournament_id opcional
ALTER TABLE dojos ALTER COLUMN tournament_id DROP NOT NULL;

-- Tabla de visibilidad por torneo
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
