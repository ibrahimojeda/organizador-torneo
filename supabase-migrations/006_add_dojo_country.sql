-- País del dojo: los competidores pueden heredar este país al registrarse.
ALTER TABLE dojos
  ADD COLUMN IF NOT EXISTS country_code TEXT;

CREATE INDEX IF NOT EXISTS idx_dojos_country_code ON dojos(country_code);

ALTER TABLE dojos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dojos_select_public" ON dojos;
DROP POLICY IF EXISTS "dojos_select" ON dojos;
CREATE POLICY "dojos_select_public" ON dojos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "dojos_write_authenticated" ON dojos;
DROP POLICY IF EXISTS "dojos_insert" ON dojos;
DROP POLICY IF EXISTS "dojos_update" ON dojos;
DROP POLICY IF EXISTS "dojos_delete" ON dojos;
CREATE POLICY "dojos_insert" ON dojos
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
  ));
CREATE POLICY "dojos_update" ON dojos
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
  ));
CREATE POLICY "dojos_delete" ON dojos
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
  ));