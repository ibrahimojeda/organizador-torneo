-- =====================================================
-- Modo de kata en categorías + reglas adicionales
-- - kata_mode: 'flag' para votación por banderas (opcional)
-- - rules: JSON opcional con ajustes por categoría
-- =====================================================
ALTER TABLE categories ADD COLUMN IF NOT EXISTS kata_mode TEXT;

ALTER TABLE categories ADD COLUMN IF NOT EXISTS rules JSONB;
