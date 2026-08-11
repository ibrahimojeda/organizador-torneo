/**
 * fix-associations.js
 * Verifica y crea la tabla associations en Supabase
 * Ejecutar: node fix-associations.js
 */

const SUPABASE_URL = 'https://ubhmahzqakgqhcvvnpzv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViaG1haHpxYWtncWhjdnZucHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MDIwNDAsImV4cCI6MjA5MTI3ODA0MH0.cX0HB_3zQLRS8w1MCxedc53EN1OZSf1itSCJoJco_TA';

async function checkAndFixAssociations() {
  try {
    console.log('📡 Verificando tabla associations en Supabase...\n');
    
    // Intentar leer de la tabla associations
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/associations?select=*&limit=1`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.status === 404) {
      console.log('❌ Tabla associations NO EXISTE');
      console.log('\n🔧 SOLUCIÓN: Ejecuta manualmente este SQL en Supabase → SQL Editor:\n');
      
      const sql = `-- =====================================================
-- CREAR TABLA ASSOCIATIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS associations (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT         NOT NULL UNIQUE,
  logo        TEXT,
  website     TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Índice para búsqueda
CREATE INDEX IF NOT EXISTS idx_associations_name ON associations(name);

-- Habilitar RLS
ALTER TABLE associations ENABLE ROW LEVEL SECURITY;

-- Políticas
DROP POLICY IF EXISTS "associations: ver todos" ON associations;
DROP POLICY IF EXISTS "associations: crear" ON associations;
DROP POLICY IF EXISTS "associations: editar" ON associations;
DROP POLICY IF EXISTS "associations: eliminar" ON associations;

CREATE POLICY "associations: ver todos" ON associations
  FOR SELECT USING (TRUE);
CREATE POLICY "associations: crear" ON associations
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "associations: editar" ON associations
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "associations: eliminar" ON associations
  FOR DELETE USING (auth.role() = 'authenticated');

-- Insertar datos de ejemplo
INSERT INTO associations (name, website, notes) VALUES
  ('Federación Nacional de Karate', 'https://fnkarate.org', 'Federación principal'),
  ('Asociación Regional Sur', 'https://karate-sur.org', 'Región sur'),
  ('Asociación Regional Norte', 'https://karate-norte.org', 'Región norte')
ON CONFLICT (name) DO NOTHING;`;
      
      console.log(sql);
      console.log('\n📋 Pasos:');
      console.log('   1. Ve a https://app.supabase.com/project/ubhmahzqakgqhcvvnpzv/sql');
      console.log('   2. Copia y pega el SQL arriba');
      console.log('   3. Haz clic en "RUN"');
      console.log('   4. Recarga la app en el navegador\n');
      
      return;
    }
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Error (${response.status}): ${error}`);
    }
    
    const data = await response.json();
    console.log('✅ Tabla associations YA EXISTE');
    console.log(`📋 Registros encontrados: ${data.length}`);
    
    if (data.length > 0) {
      console.log('\n   Asociaciones:');
      data.forEach(a => console.log(`   - ${a.name}`));
    } else {
      console.log('\n   ⚠️  La tabla está vacía. Necesitas insertar datos.');
    }
    
  } catch (err) {
    console.error('🔥 Error:', err.message);
  }
}

checkAndFixAssociations();

