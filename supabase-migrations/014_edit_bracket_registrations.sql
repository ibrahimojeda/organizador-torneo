-- Permite quitar/mover inscripciones o reiniciar llaves con confirmación explícita.
CREATE OR REPLACE FUNCTION public.edit_bracket_registration(
  p_action text, p_registration_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL, p_reset boolean DEFAULT false
) RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  reg public.registrations%ROWTYPE;
  source public.categories%ROWTYPE;
  target public.categories%ROWTYPE;
  affected uuid[];
BEGIN
  IF p_action NOT IN ('remove','move','reset') OR p_action IS NULL THEN
    RAISE EXCEPTION 'Acción inválida';
  END IF;
  LOCK TABLE matches IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE registrations IN SHARE ROW EXCLUSIVE MODE;
  IF p_action = 'reset' THEN
    SELECT * INTO STRICT source FROM categories WHERE id = p_category_id;
  ELSE
    SELECT * INTO STRICT reg FROM registrations WHERE id = p_registration_id;
    SELECT * INTO STRICT source FROM categories WHERE id = reg.category_id;
  END IF;
  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM tournaments WHERE id = source.tournament_id AND organizer_id = auth.uid()
  ) THEN RAISE EXCEPTION 'No tienes permiso para modificar estas llaves'; END IF;
  affected := ARRAY[source.id];
  IF p_action = 'move' THEN
    SELECT * INTO STRICT target FROM categories WHERE id = p_category_id;
    IF target.tournament_id <> source.tournament_id THEN
      RAISE EXCEPTION 'El destino debe pertenecer al mismo torneo';
    END IF;
    IF target.id = source.id THEN RETURN ARRAY[]::uuid[]; END IF;
    IF EXISTS (SELECT 1 FROM registrations WHERE category_id = target.id AND competitor_id = reg.competitor_id) THEN
      RAISE EXCEPTION 'El competidor ya está inscrito en la categoría destino';
    END IF;
    affected := array_append(affected, target.id);
  END IF;
  IF EXISTS (SELECT 1 FROM matches WHERE category_id = ANY(affected)) THEN
    IF NOT p_reset THEN
      RAISE EXCEPTION 'BRACKET_RESET_REQUIRED: existen combates en las categorías afectadas';
    END IF;
    DELETE FROM matches WHERE category_id = ANY(affected);
  END IF;
  IF p_action = 'remove' THEN
    DELETE FROM registrations WHERE id = reg.id;
  ELSIF p_action = 'move' THEN
    UPDATE registrations SET category_id = target.id WHERE id = reg.id;
  END IF;
  RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION public.edit_bracket_registration(text,uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_bracket_registration(text,uuid,uuid,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';