-- Bucket público para logos de dojos y otros recursos del torneo.
INSERT INTO storage.buckets (id, name, public)
VALUES ('tournament-assets', 'tournament-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "tournament_assets_public_read" ON storage.objects;
CREATE POLICY "tournament_assets_public_read"
  ON storage.objects FOR SELECT USING (bucket_id = 'tournament-assets');

DROP POLICY IF EXISTS "tournament_assets_auth_insert" ON storage.objects;
CREATE POLICY "tournament_assets_auth_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tournament-assets');

DROP POLICY IF EXISTS "tournament_assets_auth_update" ON storage.objects;
CREATE POLICY "tournament_assets_auth_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'tournament-assets')
  WITH CHECK (bucket_id = 'tournament-assets');