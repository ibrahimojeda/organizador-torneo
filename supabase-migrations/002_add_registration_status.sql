-- =====================================================
-- 002: Agregar estado a inscripciones (aceptado/negado)
-- =====================================================

-- Columna status en registrations para control de acceso
ALTER TABLE registrations 
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
CHECK (status IN ('pending', 'accepted', 'denied'));

-- Índice para filtrar por status
CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);