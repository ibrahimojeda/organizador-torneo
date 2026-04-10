/* ============================================================
   CATEGORIES.JS — Generación y gestión de categorías
   ============================================================ */

const Categories = (() => {

  const TABLE   = 'categories';
  const DEV_KEY = 'ot_dev_categories';

  /* ---- localStorage helpers (modo dev) ---- */
  function _devList()       { try { return JSON.parse(localStorage.getItem(DEV_KEY) || '[]'); } catch { return []; } }
  function _devSave(l)      { localStorage.setItem(DEV_KEY, JSON.stringify(l)); }
  function _devGetById(id)  { return _devList().find(c => c.id === id) || null; }
  function _devFindKey(tournamentId, key) {
    return _devList().find(c =>
      c.tournament_id   === tournamentId &&
      c.discipline      === key.discipline &&
      c.gender          === key.gender &&
      (c.age_group_id   || null) === (key.age_group_id   || null) &&
      (c.weight_class_id|| null) === (key.weight_class_id|| null) &&
      (c.belt_group_id  || null) === (key.belt_group_id  || null)
    ) || null;
  }
  function _devCreate(payload) {
    const c = { ...payload, id: generateId(), created_at: new Date().toISOString() };
    const list = _devList(); list.push(c); _devSave(list); return c;
  }
  function _devListByTournament(tournamentId) {
    return _devList().filter(c => c.tournament_id === tournamentId);
  }

  /* --------------------------------------------------------
     GENERAR CATEGORÍAS AUTOMÁTICAMENTE
     Analiza los competidores inscritos y crea las categorías
     únicas que corresponden. Evita duplicados.
     @param {string} tournamentId
     @returns {object[]} Categorías creadas
  -------------------------------------------------------- */
  async function autoGenerate(tournamentId) {
    const tournament  = await Tournament.getById(tournamentId);
    const competitors = await Competitors.listByTournament(tournamentId);

    if (!competitors.length) {
      throw new Error('No hay competidores inscritos para generar categorías.');
    }

    const generated = [];

    for (const comp of competitors) {
      const groups = _resolveCategoryKeys(comp, tournament);
      for (const key of groups) {
        const existing = generated.find(c => c._key === key._key) ||
                         (Auth.isDevMode() ? _devFindKey(tournamentId, key) : await _findExisting(tournamentId, key));
        if (!existing) {
          generated.push({ ...key, tournament_id: tournamentId, _isNew: true });
        }
      }
    }

    const toInsert = generated.filter(c => c._isNew).map(({ _key, _isNew, ...rest }) => rest);
    if (!toInsert.length) return _devListByTournament(tournamentId);

    // Intercalar kata y kumite, luego distribuir en tatamis en round-robin
    const kumiteCats  = toInsert.filter(c => c.discipline === 'kumite');
    const kataCats    = toInsert.filter(c => c.discipline === 'kata');
    const otherCats   = toInsert.filter(c => c.discipline !== 'kumite' && c.discipline !== 'kata');
    const interleaved = [];
    const maxLen = Math.max(kumiteCats.length, kataCats.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < kumiteCats.length) interleaved.push(kumiteCats[i]);
      if (i < kataCats.length)   interleaved.push(kataCats[i]);
    }
    interleaved.push(...otherCats);

    const numTatamis = parseInt(tournament.num_tatamis, 10) || 1;
    const withTatami = interleaved.map((cat, i) => ({
      ...cat,
      tatami: numTatamis > 1 ? (i % numTatamis) + 1 : 1,
    }));

    if (Auth.isDevMode()) {
      return withTatami.map(payload => _devCreate(payload));
    }
    const { data, error } = await supabase.from(TABLE).insert(withTatami).select();
    if (error) throw error;
    return data;
  }

  /* --------------------------------------------------------
     CREAR CATEGORÍA MANUAL
     @param {object} data
  -------------------------------------------------------- */
  async function create(data) {
    _validate(data);
    const payload = {
      tournament_id:   data.tournament_id,
      discipline:      data.discipline,
      gender:          data.gender,
      age_group_id:    data.age_group_id    || null,
      weight_class_id: data.weight_class_id || null,
      belt_group_id:   data.belt_group_id   || null,
      bracket_system:  data.bracket_system  || 'auto',
      name:            data.name || _buildName(data),
    };
    if (Auth.isDevMode()) return _devCreate(payload);
    const { data: created, error } = await supabase.from(TABLE).insert(payload).select().single();
    if (error) throw error;
    return created;
  }

  /* --------------------------------------------------------
     LISTAR CATEGORÍAS DE UN TORNEO
  -------------------------------------------------------- */
  async function listByTournament(tournamentId) {
    if (Auth.isDevMode()) return _devListByTournament(tournamentId);
    const { data, error } = await supabase
      .from(TABLE)
      .select('*, registrations(count), matches(status)')
      .eq('tournament_id', tournamentId)
      .order('discipline')
      .order('gender')
      .order('name');
    if (error) throw error;
    return data || [];
  }

  /* --------------------------------------------------------
     OBTENER CATEGORÍA POR ID
  -------------------------------------------------------- */
  async function getById(id) {
    if (Auth.isDevMode()) {
      const c = _devGetById(id);
      if (!c) throw new Error('Categoría no encontrada.');
      return c;
    }
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  /* --------------------------------------------------------
     ACTUALIZAR CATEGORÍA
  -------------------------------------------------------- */
  async function update(id, data) {
    const payload = {};
    if (data.bracket_system) payload.bracket_system = data.bracket_system;
    if (data.name)           payload.name           = data.name;
    if (data.tatami != null) payload.tatami         = data.tatami;

    if (Auth.isDevMode()) {
      const list = _devList();
      const idx  = list.findIndex(c => c.id === id);
      if (idx === -1) throw new Error('Categoría no encontrada.');
      list[idx] = { ...list[idx], ...payload };
      _devSave(list);
      return list[idx];
    }

    const { data: updated, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return updated;
  }

  /* --------------------------------------------------------
     ELIMINAR CATEGORÍA (solo si no tiene combates generados)
  -------------------------------------------------------- */
  async function remove(id) {
    if (Auth.isDevMode()) {
      const list = _devList();
      const idx  = list.findIndex(c => c.id === id);
      if (idx === -1) throw new Error('Categoría no encontrada.');
      list.splice(idx, 1);
      _devSave(list);
      return;
    }

    const { count } = await supabase
      .from('matches')
      .select('id', { count: 'exact' })
      .eq('category_id', id);
    if (count > 0) throw new Error('No se puede eliminar: la categoría ya tiene combates generados.');

    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  }

  /* --------------------------------------------------------
     ASIGNAR COMPETIDOR A SUS CATEGORÍAS CORRESPONDIENTES
     Se llama automáticamente al registrar un competidor.
     @param {object} competitor
     @param {string} tournamentId
  -------------------------------------------------------- */
  async function assignCompetitor(competitor, tournamentId) {
    const tournament = await Tournament.getById(tournamentId);
    const keys = _resolveCategoryKeys(competitor, tournament);
    const categoryIds = [];

    for (const key of keys) {
      let cat = await _findExisting(tournamentId, key);
      if (!cat) {
        const { _key, ...payload } = key;
        try {
          cat = await create({ ...payload, tournament_id: tournamentId });
        } catch (e) {
          // Race condition or duplicate — try to fetch the existing one
          cat = await _findExisting(tournamentId, key);
          if (!cat) throw e;
        }
      }
      categoryIds.push(cat.id);
    }
    return categoryIds;
  }

  /* --------------------------------------------------------
     OBTENER NOMBRE LEGIBLE DE UNA CATEGORÍA
  -------------------------------------------------------- */
  function buildLabel(category) {
    const parts = [];
    const disc = DISCIPLINES.find(d => d.id === category.discipline);
    if (disc)  parts.push(disc.label);

    const gender = GENDERS.find(g => g.id === category.gender);
    if (gender) parts.push(gender.label);

    const ageGroup = AGE_GROUPS.find(a => a.id === category.age_group_id);
    if (ageGroup)  parts.push(ageGroup.label);
    else if (category.age_min != null) parts.push(`${category.age_min}-${category.age_max} años`);

    // Show weight only if age_weight mode (weight_class_id populated)
    if (category.weight_class_id) {
      const wClasses = WEIGHT_CLASSES[category.gender] || [];
      const wc = wClasses.find(w => w.id === category.weight_class_id);
      if (wc) parts.push(wc.label);
    }

    // Show belt group only if age_belt mode (belt_group_id populated)
    if (category.belt_group_id) {
      const bg = BELT_GROUPS.find(b => b.id === category.belt_group_id);
      if (bg) parts.push(bg.label);
    }

    return parts.join(' · ');
  }

  /* ---- Helpers privados ---- */

  /**
   * Calcula todas las claves de categoría a las que corresponde un competidor.
   * Genera una combinación por cada disciplina inscrita.
   */
  function _resolveCategoryKeys(competitor, tournament) {
    const keys = [];
    const tournamentDisciplines = tournament.disciplines || ['kumite'];
    const ageGroup  = getAgeGroup(competitor.dob, tournament.date_start);
    const beltGroup = getBeltGroup(competitor.belt_id);

    // Filter disciplines by competitor's own preference
    const compDiscipline = competitor.discipline || 'kumite';
    const disciplines = tournamentDisciplines.filter(d => {
      if (compDiscipline === 'both') return true;
      return d === compDiscipline;
    });
    // Fallback: if none match, use tournament disciplines
    const effective = disciplines.length ? disciplines : tournamentDisciplines;

    const mode = tournament.category_mode || 'age_belt';

    for (const discipline of effective) {
      let weightClassId = null;
      let beltGroupId   = null;

      if (mode === 'age_weight') {
        // WKF estándar: categoriza por peso (solo kumite), sin cinturón
        if (discipline === 'kumite') {
          const wc = getWeightClass(competitor.gender, competitor.weight);
          weightClassId = wc?.id || null;
        }
      } else {
        // age_belt (default): categoriza por cinturón, sin peso
        beltGroupId = beltGroup?.id || null;
      }

      const base = {
        discipline,
        gender:          competitor.gender,
        age_group_id:    ageGroup?.id || null,
        weight_class_id: weightClassId,
        belt_group_id:   beltGroupId,
      };
      const key = _buildKey(base);
      keys.push({ ...base, name: null, _key: key });
    }
    return keys;
  }

  function _buildKey(data) {
    return [
      data.discipline,
      data.gender,
      data.age_group_id    || 'noage',
      data.weight_class_id || 'noweight',
      data.belt_group_id   || 'nobelt',
    ].join('|');
  }

  async function _findExisting(tournamentId, key) {
    if (Auth.isDevMode()) return _devFindKey(tournamentId, key);
    let q = supabase
      .from(TABLE)
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('discipline', key.discipline)
      .eq('gender', key.gender);

    if (key.age_group_id    != null) q = q.eq('age_group_id',    key.age_group_id);
    else                             q = q.is('age_group_id',    null);

    if (key.weight_class_id != null) q = q.eq('weight_class_id', key.weight_class_id);
    else                             q = q.is('weight_class_id', null);

    if (key.belt_group_id   != null) q = q.eq('belt_group_id',   key.belt_group_id);
    else                             q = q.is('belt_group_id',   null);

    const { data } = await q.maybeSingle();
    return data || null;
  }

  function _buildName(data) {
    return buildLabel(data);
  }

  function _validate(data) {
    if (!data.tournament_id) throw new Error('tournament_id es requerido.');
    if (!data.discipline)    throw new Error('La disciplina es requerida.');
    if (!data.gender)        throw new Error('El género es requerido.');
  }

  return {
    autoGenerate,
    create,
    listByTournament,
    getById,
    update,
    remove,
    assignCompetitor,
    buildLabel,
  };
})();
