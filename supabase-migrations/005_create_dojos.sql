-- =====================================================
-- MIGRACIÓN: Crear tabla dojos y logo_url
-- =====================================================
-- Ejecutar en el SQL Editor de Supabase

-- 1. Crear la tabla dojos (si no existe)
CREATE TABLE IF NOT EXISTS dojos (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT         NOT NULL UNIQUE,
  logo_url    TEXT,
  website     TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. Agregar columna dojo_id a competitors
ALTER TABLE competitors
ADD COLUMN IF NOT EXISTS dojo_id UUID REFERENCES dojos(id) ON DELETE SET NULL;

-- 3. Índice para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_competitors_dojo_id ON competitors(dojo_id);

-- =====================================================
-- RLS: Permitir lectura/escritura de dojos a usuarios autenticados
-- =====================================================
ALTER TABLE dojos ENABLE ROW LEVEL SECURITY;

-- Política: cualquier usuario autenticado puede leer dojos
DROP POLICY IF EXISTS "dojos: lectura autenticada" ON dojos;
CREATE POLICY "dojos: lectura autenticada" ON dojos
  FOR SELECT USING (auth.role() = 'authenticated');

-- Política: organizadores y super_admin pueden insertar/actualizar dojos
DROP POLICY IF EXISTS "dojos: escritura organizador" ON dojos;
CREATE POLICY "dojos: escritura organizador" ON dojos
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "dojos: actualizar organizador" ON dojos;
CREATE POLICY "dojos: actualizar organizador" ON dojos
  FOR UPDATE USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "dojos: eliminar organizador" ON dojos;
CREATE POLICY "dojos: eliminar organizador" ON dojos
  FOR DELETE USING (auth.role() = 'authenticated');

-- =====================================================
-- Permitir acceso anónimo a dojos (para proyección pública)
-- =====================================================
DROP POLICY IF EXISTS "dojos: lectura publica" ON dojos;
CREATE POLICY "dojos: lectura publica" ON dojos
  FOR SELECT USING (true);