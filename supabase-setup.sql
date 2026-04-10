-- ============================================================
--  ORGANIZADOR DE TORNEO — Configuración RLS de Supabase
--  Ejecutar COMPLETO en: Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
--  0. COLUMNAS FALTANTES
-- ============================================================

-- num_tatamis en tournaments
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS num_tatamis smallint NOT NULL DEFAULT 1;

-- discipline en competitors (preferencia del competidor: kata / kumite / both)
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS discipline text NOT NULL DEFAULT 'kumite';

-- time_start en tournaments (hora de inicio del evento, ej: '09:00:00')
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS time_start time DEFAULT '09:00:00';

-- Corregir CHECK constraint de status (open/closed/ongoing/cancelled son valores válidos)
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_status_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_status_check
  CHECK (status IN ('draft','open','closed','ongoing','finished','cancelled'));

-- Recargar schema cache de PostgREST (necesario después de ALTER TABLE)
NOTIFY pgrst, 'reload schema';

-- ============================================================
--  1. TABLA tournaments
--     SELECT público · INSERT/UPDATE/DELETE solo autenticados
--     UPDATE/DELETE restringido al organizador dueño del torneo
-- ============================================================
DROP POLICY IF EXISTS "tournaments_select" ON tournaments;
DROP POLICY IF EXISTS "tournaments_insert" ON tournaments;
DROP POLICY IF EXISTS "tournaments_update" ON tournaments;
DROP POLICY IF EXISTS "tournaments_delete" ON tournaments;

CREATE POLICY "tournaments_select" ON tournaments
  FOR SELECT USING (true);

CREATE POLICY "tournaments_insert" ON tournaments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "tournaments_update" ON tournaments
  FOR UPDATE USING (auth.uid() = organizer_id);

CREATE POLICY "tournaments_delete" ON tournaments
  FOR DELETE USING (auth.uid() = organizer_id);


-- ============================================================
--  2. TABLA categories
-- ============================================================
DROP POLICY IF EXISTS "categories_select" ON categories;
DROP POLICY IF EXISTS "categories_write" ON categories;

CREATE POLICY "categories_select" ON categories
  FOR SELECT USING (true);

CREATE POLICY "categories_write" ON categories
  FOR ALL USING (auth.uid() IS NOT NULL);


-- ============================================================
--  3. TABLA competitors
-- ============================================================
DROP POLICY IF EXISTS "competitors_select" ON competitors;
DROP POLICY IF EXISTS "competitors_write" ON competitors;

CREATE POLICY "competitors_select" ON competitors
  FOR SELECT USING (true);

CREATE POLICY "competitors_write" ON competitors
  FOR ALL USING (auth.uid() IS NOT NULL);


-- ============================================================
--  4. TABLA registrations
-- ============================================================
DROP POLICY IF EXISTS "registrations_select" ON registrations;
DROP POLICY IF EXISTS "registrations_write" ON registrations;

CREATE POLICY "registrations_select" ON registrations
  FOR SELECT USING (true);

CREATE POLICY "registrations_write" ON registrations
  FOR ALL USING (auth.uid() IS NOT NULL);


-- ============================================================
--  5. TABLA matches
--     INSERT: solo autenticados (organizador genera llaves)
--     UPDATE: también anónimos (árbitros usan código, no Supabase Auth)
--     DELETE: solo autenticados
-- ============================================================
DROP POLICY IF EXISTS "matches_select" ON matches;
DROP POLICY IF EXISTS "matches_insert" ON matches;
DROP POLICY IF EXISTS "matches_update" ON matches;
DROP POLICY IF EXISTS "matches_delete" ON matches;

CREATE POLICY "matches_select" ON matches
  FOR SELECT USING (true);

CREATE POLICY "matches_insert" ON matches
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "matches_update" ON matches
  FOR UPDATE USING (true);   -- árbitros actualizan sin Supabase Auth

CREATE POLICY "matches_delete" ON matches
  FOR DELETE USING (auth.uid() IS NOT NULL);


-- ============================================================
--  6. TABLA tournament_codes
--     SELECT público (árbitros validan código sin estar logueados)
--     INSERT/UPDATE/DELETE solo autenticados (organizador)
-- ============================================================
DROP POLICY IF EXISTS "codes_select" ON tournament_codes;
DROP POLICY IF EXISTS "codes_insert" ON tournament_codes;
DROP POLICY IF EXISTS "codes_update" ON tournament_codes;
DROP POLICY IF EXISTS "codes_delete" ON tournament_codes;

CREATE POLICY "codes_select" ON tournament_codes
  FOR SELECT USING (true);

CREATE POLICY "codes_insert" ON tournament_codes
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "codes_update" ON tournament_codes
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "codes_delete" ON tournament_codes
  FOR DELETE USING (auth.uid() IS NOT NULL);


-- ============================================================
--  7. TABLA profiles
--     Cada usuario ve y modifica su propio perfil.
--     Los organizadores autenticados pueden leer todos los perfiles
--     (necesario para mostrar la lista de usuarios en Configuración).
-- ============================================================
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);   -- cualquier usuario autenticado puede listar

CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (auth.uid() = id);


-- ============================================================
--  8. TRIGGER: auto-crear perfil de organizador al registrarse
--     Cada vez que alguien se crea en Supabase Auth,
--     se inserta automáticamente en profiles con role='organizer'
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name)
  VALUES (new.id, 'organizer', '')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
--  9. CATEGORÍAS DUPLICADAS — limpieza y constraint
-- ============================================================

-- Identificar duplicados con ROW_NUMBER (id es UUID, MIN no aplica)
-- Conservar la fila con created_at más antiguo; eliminar el resto.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY tournament_id, discipline, gender,
                        COALESCE(age_group_id::text,    '__null__'),
                        COALESCE(weight_class_id::text, '__null__'),
                        COALESCE(belt_group_id::text,   '__null__')
           ORDER BY created_at ASC
         ) AS rn
  FROM categories
),
keepers AS (
  -- Para cada grupo, la fila rn=1 se conserva; el resto son duplicados
  SELECT d.id AS dup_id, k.id AS keep_id
  FROM ranked d
  JOIN ranked k
    ON  k.rn = 1
  JOIN categories dc ON dc.id = d.id
  JOIN categories kc ON kc.id = k.id
  WHERE d.rn > 1
    AND dc.tournament_id   = kc.tournament_id
    AND dc.discipline      = kc.discipline
    AND dc.gender          = kc.gender
    AND (dc.age_group_id    IS NOT DISTINCT FROM kc.age_group_id)
    AND (dc.weight_class_id IS NOT DISTINCT FROM kc.weight_class_id)
    AND (dc.belt_group_id   IS NOT DISTINCT FROM kc.belt_group_id)
)
-- Reasignar registrations al keeper antes de borrar
UPDATE registrations
SET category_id = keepers.keep_id
FROM keepers
WHERE registrations.category_id = keepers.dup_id;

-- Ahora eliminar los duplicados
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY tournament_id, discipline, gender,
                        COALESCE(age_group_id::text,    '__null__'),
                        COALESCE(weight_class_id::text, '__null__'),
                        COALESCE(belt_group_id::text,   '__null__')
           ORDER BY created_at ASC
         ) AS rn
  FROM categories
)
DELETE FROM categories
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Añadir constraint UNIQUE para que no puedan volver a crearse
-- NULLS NOT DISTINCT requiere Postgres 15+ (disponible en Supabase)
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_unique_combo;
ALTER TABLE categories ADD CONSTRAINT categories_unique_combo
  UNIQUE NULLS NOT DISTINCT (tournament_id, discipline, gender, age_group_id, weight_class_id, belt_group_id);


-- ============================================================
--  10. MATCHES bracket_type CHECK — ampliar valores permitidos
--      El schema original solo tenía: winner/loser/grand_final/repechage_bronze/round_robin
--      El código usa además: single_elimination/repechage_main/double_winner/double_loser/double_final/kata_round
-- ============================================================
-- ============================================================
--  11. TOURNAMENTS category_mode — modo de categorización
--      age_belt: Edad + Cinturón (default, para torneos locales)
--      age_weight: Edad + Peso (WKF estándar)
-- ============================================================
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS category_mode text NOT NULL DEFAULT 'age_belt'
  CHECK (category_mode IN ('age_belt', 'age_weight'));

-- Recargar schema cache para que PostgREST reconozca la nueva columna
NOTIFY pgrst, 'reload schema';


-- ============================================================
--  10. MATCHES bracket_type CHECK — ampliar valores permitidos (ya aplicado arriba, idempotente)
-- ============================================================
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_bracket_type_check;
ALTER TABLE matches ADD CONSTRAINT matches_bracket_type_check
  CHECK (bracket_type IN (
    'single_elimination',
    'repechage_main',
    'repechage_bronze',
    'double_winner',
    'double_loser',
    'double_final',
    'round_robin',
    'kata_round'
  ));
