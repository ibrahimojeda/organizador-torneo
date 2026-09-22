-- =====================================================
-- MIGRACIÓN 008: Sistemas de llave por disciplina + negros
-- Agrega a la tabla tournaments:
--   - kumite_bracket_system  (sistema de llaves para kumite)
--   - kata_bracket_system    (sistema de llaves para kata)
--   - blacks_in_advanced     (¿incluir cinturones negros en Avanzado?)
-- =====================================================

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS kumite_bracket_system TEXT NOT NULL DEFAULT 'single_elimination';

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS kata_bracket_system TEXT NOT NULL DEFAULT 'kata_individual';

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS blacks_in_advanced BOOLEAN NOT NULL DEFAULT TRUE;

-- Restricciones de valores permitidos
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_kumite_bracket_system_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_kumite_bracket_system_check
  CHECK (kumite_bracket_system IN ('auto','single_elimination','repechage','round_robin','double_elimination','kata_individual','kata_duels'));

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_kata_bracket_system_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_kata_bracket_system_check
  CHECK (kata_bracket_system IN ('auto','single_elimination','repechage','round_robin','double_elimination','kata_individual','kata_duels'));
