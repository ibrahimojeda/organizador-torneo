-- País del dojo: los competidores pueden heredar este país al registrarse.
ALTER TABLE dojos
  ADD COLUMN IF NOT EXISTS country_code TEXT;

CREATE INDEX IF NOT EXISTS idx_dojos_country_code ON dojos(country_code);

ALTER TABLE dojos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dojos_select_public" ON dojos;
CREATE POLICY "dojos_select_public" ON dojos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "dojos_write_authenticated" ON dojos;
CREATE POLICY "dojos_write_authenticated" ON dojos
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);