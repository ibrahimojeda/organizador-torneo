-- =====================================================
-- ORGANIZADOR DE TORNEO DE KARATE
-- Esquema de base de datos para Supabase (PostgreSQL)
-- Ejecutar en: SQL Editor de tu proyecto Supabase
-- =====================================================

-- Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. PERFILES DE USUARIO
-- =====================================================
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT         NOT NULL,
  role        TEXT         NOT NULL DEFAULT 'organizer'
                           CHECK (role IN ('organizer', 'referee', 'public')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Trigger: crear perfil automáticamente al registrar usuario
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'organizer')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- 2. ASOCIACIONES (Federaciones / Clubes Matriz)
-- =====================================================
CREATE TABLE IF NOT EXISTS associations (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT         NOT NULL UNIQUE,
  logo        TEXT,               -- URL del logo
  website     TEXT,               -- Sitio web
  notes       TEXT,               -- Información adicional
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Índice para búsqueda por nombre
CREATE INDEX IF NOT EXISTS idx_associations_name ON associations(name);

-- =====================================================
-- 3. TORNEOS
-- =====================================================
CREATE TABLE IF NOT EXISTS tournaments (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT         NOT NULL,
  location        TEXT,
  date_start      DATE,
  date_end        DATE,
  description     TEXT,
  bracket_system  TEXT         NOT NULL DEFAULT 'auto'
                               CHECK (bracket_system IN ('auto','single_elimination','repechage','round_robin','double_elimination')),
  disciplines     JSONB        NOT NULL DEFAULT '["kumite","kata"]',
  status          TEXT         NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft','open','closed','ongoing','finished','cancelled')),
  is_public       BOOLEAN      NOT NULL DEFAULT TRUE,
  organizer_id    UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Índice para búsqueda por organizador
CREATE INDEX IF NOT EXISTS idx_tournaments_organizer ON tournaments(organizer_id);

-- =====================================================
-- 3. CÓDIGOS DE ACCESO (árbitros y acceso público)
-- =====================================================
CREATE TABLE IF NOT EXISTS tournament_codes (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  UUID         NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  code           TEXT         NOT NULL UNIQUE,
  role           TEXT         NOT NULL DEFAULT 'referee'
                              CHECK (role IN ('referee','public')),
  description    TEXT,
  active         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codes_tournament ON tournament_codes(tournament_id);

-- =====================================================
-- 4. COMPETIDORES (maestro global)
-- =====================================================
CREATE TABLE IF NOT EXISTS competitors (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     TEXT         NOT NULL,
  document_id   TEXT,               -- DNI / cédula / pasaporte
  gender        TEXT         NOT NULL CHECK (gender IN ('M','F')),
  dob           DATE,               -- Fecha de nacimiento
  weight        NUMERIC(5,2),       -- kg
  belt_id       TEXT,               -- ID del cinturón (blanco, amarillo, etc.)
  club          TEXT,
  country       TEXT         DEFAULT 'Argentina',
  photo_url     TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Índice para búsqueda por documento
CREATE INDEX IF NOT EXISTS idx_competitors_doc ON competitors(document_id);

-- =====================================================
-- 5. CATEGORÍAS
-- =====================================================
CREATE TABLE IF NOT EXISTS categories (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   UUID         NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name            TEXT,               -- Etiqueta legible (generada o manual)
  discipline      TEXT         NOT NULL CHECK (discipline IN ('kumite','kata')),
  gender          TEXT         NOT NULL CHECK (gender IN ('M','F','MF')),
  age_group_id    TEXT,               -- ID del grupo etario (ej: 'cadete')
  weight_class_id TEXT,               -- ID de la clase de peso (ej: 'm67')
  belt_group_id   TEXT,               -- ID del grupo de cinturón (ej: 'principiante')
  bracket_system  TEXT         NOT NULL DEFAULT 'auto'
                               CHECK (bracket_system IN ('auto','single_elimination','repechage','round_robin','double_elimination')),
  tatami          TEXT,               -- Tatami/área asignada a esta categoría
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_tournament ON categories(tournament_id);

-- =====================================================
-- 6. INSCRIPCIONES (competidor en categoría)
-- =====================================================
CREATE TABLE IF NOT EXISTS registrations (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  UUID         NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  category_id    UUID         NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  competitor_id  UUID         NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  seed           INTEGER,            -- Posición de cabeza de serie (NULL = sin sembrar)
  status         TEXT         NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'accepted', 'denied')),
  registered_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, competitor_id)
);

CREATE INDEX IF NOT EXISTS idx_registrations_category    ON registrations(category_id);
CREATE INDEX IF NOT EXISTS idx_registrations_competitor  ON registrations(competitor_id);
CREATE INDEX IF NOT EXISTS idx_registrations_tournament  ON registrations(tournament_id);

-- =====================================================
-- 7. COMBATES
-- =====================================================
CREATE TABLE IF NOT EXISTS matches (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id     UUID         NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  category_id       UUID         NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  round             INTEGER      NOT NULL,          -- Número de ronda (1=cuartos, 2=semis, etc.)
  round_label       TEXT,                          -- Etiqueta legible ('Cuartos de Final', 'Semifinal', etc.)
  position          INTEGER      NOT NULL,          -- Posición dentro de la ronda (1-based)
  bracket_type      TEXT         DEFAULT 'winner'
                                 CHECK (bracket_type IN ('winner','loser','grand_final','repechage_bronze','round_robin')),
  competitor_a_id   UUID         REFERENCES registrations(id) ON DELETE SET NULL,
  competitor_b_id   UUID         REFERENCES registrations(id) ON DELETE SET NULL,
  winner_id         UUID         REFERENCES registrations(id) ON DELETE SET NULL,
  score_a           INTEGER,
  score_b           INTEGER,
  status            TEXT         NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','in_progress','finished','bye')),
  tatami            TEXT,                          -- Tatami donde se disputa
  scheduled_time    TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_category   ON matches(category_id);
CREATE INDEX IF NOT EXISTS idx_matches_status     ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_tatami     ON matches(tatami);

-- Trigger: actualizar updated_at automáticamente en matches
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_updated_at ON matches;
CREATE TRIGGER matches_updated_at
  BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS tournaments_updated_at ON tournaments;
CREATE TRIGGER tournaments_updated_at
  BEFORE UPDATE ON tournaments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 8. VISTAS ÚTILES
-- =====================================================

-- Vista: combates con nombres de competidores expandidos
DROP VIEW IF EXISTS matches_full;
CREATE VIEW matches_full AS
SELECT
  m.*,
  ca.name                              AS category_name,
  ca.discipline,
  ca.gender                            AS category_gender,
  ra.id                                AS reg_a_id,
  compa.full_name                      AS competitor_a_name,
  compa.club                           AS competitor_a_club,
  rb.id                                AS reg_b_id,
  compb.full_name                      AS competitor_b_name,
  compb.club                           AS competitor_b_club,
  compw.full_name                      AS winner_name
FROM  matches m
JOIN  categories    ca    ON ca.id = m.category_id
LEFT JOIN registrations  ra    ON ra.id = m.competitor_a_id
LEFT JOIN competitors    compa ON compa.id = ra.competitor_id
LEFT JOIN registrations  rb    ON rb.id = m.competitor_b_id
LEFT JOIN competitors    compb ON compb.id = rb.competitor_id
LEFT JOIN registrations  rw    ON rw.id = m.winner_id
LEFT JOIN competitors    compw ON compw.id = rw.competitor_id;

-- Vista: estadísticas por torneo
DROP VIEW IF EXISTS tournament_stats;
CREATE VIEW tournament_stats AS
SELECT
  t.id,
  t.name,
  t.status,
  COUNT(DISTINCT c.id)        AS category_count,
  COUNT(DISTINCT r.id)        AS competitor_count,
  COUNT(DISTINCT m.id)        AS match_count,
  COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'finished') AS matches_done
FROM  tournaments t
LEFT JOIN categories    c ON c.tournament_id = t.id
LEFT JOIN registrations r ON r.tournament_id = t.id
LEFT JOIN matches       m ON m.tournament_id = t.id
GROUP BY t.id, t.name, t.status;

-- =====================================================
-- 9. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE associations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches           ENABLE ROW LEVEL SECURITY;

-- ---- profiles ----
DROP POLICY IF EXISTS "profiles: ver propio" ON profiles;
CREATE POLICY "profiles: ver propio" ON profiles
  FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles: actualizar propio" ON profiles;
CREATE POLICY "profiles: actualizar propio" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- ---- tournaments ----
DROP POLICY IF EXISTS "tournaments: ver públicos o propios" ON tournaments;
CREATE POLICY "tournaments: ver públicos o propios" ON tournaments
  FOR SELECT USING (is_public = TRUE OR organizer_id = auth.uid());
DROP POLICY IF EXISTS "tournaments: crear como organizador" ON tournaments;
CREATE POLICY "tournaments: crear como organizador" ON tournaments
  FOR INSERT WITH CHECK (organizer_id = auth.uid());
DROP POLICY IF EXISTS "tournaments: editar propios" ON tournaments;
CREATE POLICY "tournaments: editar propios" ON tournaments
  FOR UPDATE USING (organizer_id = auth.uid());
DROP POLICY IF EXISTS "tournaments: eliminar propios" ON tournaments;
CREATE POLICY "tournaments: eliminar propios" ON tournaments
  FOR DELETE USING (organizer_id = auth.uid());

-- ---- tournament_codes ----
DROP POLICY IF EXISTS "codes: ver por organizador" ON tournament_codes;
CREATE POLICY "codes: ver por organizador" ON tournament_codes
  FOR SELECT USING (
    tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
    OR auth.role() = 'anon'   -- lectura anónima para validar código
  );
DROP POLICY IF EXISTS "codes: gestionar por organizador" ON tournament_codes;
CREATE POLICY "codes: gestionar por organizador" ON tournament_codes
  FOR ALL USING (
    tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  );

-- ---- competitors ----
DROP POLICY IF EXISTS "competitors: ver todos (autenticados)" ON competitors;
CREATE POLICY "competitors: ver todos (autenticados)" ON competitors
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "competitors: crear autenticados" ON competitors;
CREATE POLICY "competitors: crear autenticados" ON competitors
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "competitors: editar autenticados" ON competitors;
CREATE POLICY "competitors: editar autenticados" ON competitors
  FOR UPDATE USING (auth.role() = 'authenticated');

-- ---- categories ----
DROP POLICY IF EXISTS "categories: ver públicas" ON categories;
CREATE POLICY "categories: ver públicas" ON categories
  FOR SELECT USING (
    tournament_id IN (SELECT id FROM tournaments WHERE is_public = TRUE)
    OR tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  );
DROP POLICY IF EXISTS "categories: gestionar por organizador" ON categories;
CREATE POLICY "categories: gestionar por organizador" ON categories
  FOR ALL USING (
    tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  );

-- ---- associations ----
DROP POLICY IF EXISTS "associations: ver todos" ON associations;
CREATE POLICY "associations: ver todos" ON associations
  FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "associations: crear super_admin" ON associations;
CREATE POLICY "associations: crear super_admin" ON associations
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "associations: editar super_admin" ON associations;
CREATE POLICY "associations: editar super_admin" ON associations
  FOR UPDATE USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "associations: eliminar super_admin" ON associations;
CREATE POLICY "associations: eliminar super_admin" ON associations
  FOR DELETE USING (auth.role() = 'authenticated');

-- ---- registrations ----
DROP POLICY IF EXISTS "registrations: ver autenticados" ON registrations;
CREATE POLICY "registrations: ver autenticados" ON registrations
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "registrations: gestionar por organizador" ON registrations;
CREATE POLICY "registrations: gestionar por organizador" ON registrations
  FOR ALL USING (
    tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  );

-- ---- matches ----
DROP POLICY IF EXISTS "matches: ver públicos" ON matches;
CREATE POLICY "matches: ver públicos" ON matches
  FOR SELECT USING (
    tournament_id IN (SELECT id FROM tournaments WHERE is_public = TRUE)
    OR tournament_id IN (SELECT id FROM tournaments WHERE organizer_id = auth.uid())
  );
DROP POLICY IF EXISTS "matches: gestionar por organizador o árbitro" ON matches;
CREATE POLICY "matches: gestionar por organizador o árbitro" ON matches
  FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- 10. REALTIME
-- Habilitar Realtime en la tabla de combates para
-- actualizar llaves en tiempo real en todas las vistas
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE matches;
  END IF;
END $$;

-- =====================================================
-- DATOS SEMINALES DE PRUEBA (opcional — comentar en producción)
-- =====================================================
/*
-- Usuario de prueba: debe crear via Supabase Auth > Users en el dashboard
-- Luego su perfil se crea automáticamente por el trigger.

-- Torneo de prueba (reemplazar <ORGANIZER_UUID> con el UUID del usuario creado):
INSERT INTO tournaments (name, location, date_start, date_end, disciplines, status, organizer_id, is_public)
VALUES (
  'Torneo Provincial 2025',
  'Gimnasio Municipal San Martín',
  '2025-09-15',
  '2025-09-15',
  '["kumite","kata"]',
  'registration',
  '<ORGANIZER_UUID>',
  TRUE
);
*/

-- =====================================================
-- VERIFICACIÓN: listar tablas creadas
-- =====================================================
SELECT table_name, table_type
FROM   information_schema.tables
WHERE  table_schema = 'public'
ORDER  BY table_name;

-- =====================================================
-- MIGRACIÓN: Agregar columna status a registrations
-- (Solo si ya creaste la tabla sin status)
-- =====================================================
ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
CHECK (status IN ('pending', 'accepted', 'denied'));

CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
