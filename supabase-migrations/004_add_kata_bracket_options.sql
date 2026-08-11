-- =====================================================
-- MIGRACIÓN 004: Agregar kata_individual y kata_duels
-- a los CHECK constraints de bracket_system
-- =====================================================

-- Soltar constraint de tournaments
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_bracket_system_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_bracket_system_check
  CHECK (bracket_system IN ('auto','single_elimination','repechage','round_robin','double_elimination','kata_individual','kata_duels'));

-- Soltar constraint de categories
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_bracket_system_check;
ALTER TABLE categories ADD CONSTRAINT categories_bracket_system_check
  CHECK (bracket_system IN ('auto','single_elimination','repechage','round_robin','double_elimination','kata_individual','kata_duels'));