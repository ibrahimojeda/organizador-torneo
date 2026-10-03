-- Ejecutar después de 009 y 012. No modifica torneos automáticamente.
BEGIN;
ALTER TABLE public.competitors ADD COLUMN IF NOT EXISTS country_manual boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION public.competitor_country_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.country_manual := NULLIF(btrim(NEW.country), '') IS NOT NULL;
  ELSIF NEW.country IS DISTINCT FROM OLD.country THEN
    NEW.country_manual := NULLIF(btrim(NEW.country), '') IS NOT NULL;
  END IF;
  IF NOT NEW.country_manual THEN
    SELECT COALESCE(country_code, country_name) INTO NEW.country FROM dojos WHERE id = NEW.dojo_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS competitor_country_source ON public.competitors;
CREATE TRIGGER competitor_country_source BEFORE INSERT OR UPDATE OF country, dojo_id ON public.competitors
FOR EACH ROW EXECUTE FUNCTION public.competitor_country_source();
CREATE OR REPLACE FUNCTION public.sync_dojo_country()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE competitors SET country = COALESCE(NEW.country_code, NEW.country_name)
    WHERE dojo_id = NEW.id AND NOT country_manual;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sync_dojo_country ON public.dojos;
CREATE TRIGGER sync_dojo_country AFTER UPDATE OF country_code, country_name ON public.dojos
FOR EACH ROW EXECUTE FUNCTION public.sync_dojo_country();
UPDATE public.competitors SET country_manual = false, country = NULL
WHERE NULLIF(btrim(country), '') IS NULL;
DROP POLICY IF EXISTS "dojos_update" ON public.dojos;
CREATE POLICY "dojos_update" ON public.dojos FOR UPDATE
USING (public.can_view_dojo(id)) WITH CHECK (public.can_view_dojo(id));
DROP POLICY IF EXISTS "dojos_delete" ON public.dojos;
CREATE POLICY "dojos_delete" ON public.dojos FOR DELETE USING (public.can_view_dojo(id));

-- País NULL = heredar del dojo; cualquier país existente sigue siendo manual.
CREATE OR REPLACE FUNCTION public.update_category_ages(
  p_category_id uuid, p_moves jsonb, p_reset_matches boolean DEFAULT false
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  source public.categories%ROWTYPE;
  target public.categories%ROWTYPE;
  item jsonb;
  reg public.registrations%ROWTYPE;
  age_id text;
  target_id uuid;
  affected uuid[];
  moved integer := 0;
BEGIN
  SELECT * INTO STRICT source FROM categories WHERE id = p_category_id FOR UPDATE;
  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM tournaments WHERE id = source.tournament_id AND organizer_id = auth.uid()
  ) THEN RAISE EXCEPTION 'No tienes permiso para actualizar este torneo'; END IF;
  -- Serializa actualizaciones del torneo y bloquea cambios concurrentes de mesa.
  PERFORM 1 FROM tournaments WHERE id = source.tournament_id FOR UPDATE;
  LOCK TABLE matches IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE registrations IN SHARE ROW EXCLUSIVE MODE;
  affected := ARRAY[source.id];
  FOR item IN SELECT value FROM jsonb_array_elements(p_moves) LOOP
    SELECT * INTO STRICT reg FROM registrations
      WHERE id = (item->>'registration_id')::uuid AND category_id = source.id FOR UPDATE;
    age_id := item->>'age_group_id';
    IF age_id NOT IN ('mini','benjamines','alevines','infantil','cadete_menor','cadete_mayor','junior','sub21','senior','veteranos') OR age_id IS NULL THEN
      RAISE EXCEPTION 'Grupo de edad inválido';
    END IF;
    SELECT id INTO target_id FROM categories
      WHERE tournament_id = source.tournament_id AND discipline = source.discipline
        AND gender = source.gender AND age_group_id = age_id
        AND belt_group_id IS NOT DISTINCT FROM source.belt_group_id
        AND weight_class_id IS NOT DISTINCT FROM source.weight_class_id
        AND NOT COALESCE(is_manual, false) AND id <> source.id
      ORDER BY id LIMIT 1;
    IF target_id IS NULL THEN
      -- Copia ajustes de origen, pero no su nombre personalizado ni sus inscripciones.
      target := source;
      target.id := gen_random_uuid();
      target.age_group_id := age_id;
      target.name := NULL;
      target.is_manual := false;
      INSERT INTO categories SELECT (target).*;
      target_id := target.id;
    END IF;
    affected := array_append(affected, target_id);
    IF EXISTS (SELECT 1 FROM registrations WHERE category_id = target_id AND competitor_id = reg.competitor_id) THEN
      RAISE EXCEPTION 'El competidor ya está inscrito en destino; revisa el duplicado antes de actualizar';
    END IF;
    UPDATE registrations SET category_id = target_id WHERE id = reg.id;
    moved := moved + 1;
  END LOOP;
  IF EXISTS (SELECT 1 FROM matches WHERE category_id = ANY(affected)) THEN
    IF NOT p_reset_matches THEN
      RAISE EXCEPTION 'Hay llaves afectadas. Confirma explícitamente su eliminación o conserva la categoría';
    END IF;
    DELETE FROM matches WHERE category_id = ANY(affected);
  END IF;
  RETURN moved;
END;
$$;
REVOKE ALL ON FUNCTION public.update_category_ages(uuid,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_category_ages(uuid,jsonb,boolean) TO authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';