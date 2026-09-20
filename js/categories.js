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

    // Orden de programa: Kata primero, luego Kumite, luego otros.
    // Dentro de cada disciplina mantener el orden generado.
    const kataCats    = toInsert.filter(c => c.discipline === 'kata');
    const kumiteCats  = toInsert.filter(c => c.discipline === 'kumite');
    const otherCats   = toInsert.filter(c => c.discipline !== 'kumite' && c.discipline !== 'kata');
    const interleaved = [...kataCats, ...kumiteCats, ...otherCats];

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
      is_manual:       data.is_manual === undefined ? !!data.manual : !!data.is_manual,
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
    if (data.ruleset)        payload.ruleset        = data.ruleset;

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

  /* --------------------------------------------------------
     ELIMINAR CATEGORÍAS VACÍAS DE UN TORNEO
     Borra las categorías del torneo que no tienen
     inscripciones, EXCEPTO las creadas manualmente
     por el administrador (is_manual = true).
     @param {string} tournamentId
     @returns {number} Cantidad eliminada
  -------------------------------------------------------- */
  async function removeEmpty(tournamentId) {
    if (!tournamentId) return 0;
    if (Auth.isDevMode()) {
      const list = _devList();
      const regs = JSON.parse(localStorage.getItem('ot_dev_registrations') || '[]');
      const withReg = new Set(regs.filter(r => r.tournament_id === tournamentId).map(r => r.category_id));
      const remaining = list.filter(c =>
        c.tournament_id !== tournamentId || withReg.has(c.id) || c.is_manual
      );
      const removed = list.length - remaining.length;
      _devSave(remaining);
      return removed;
    }
    // Obtener categorías del torneo
    const { data: cats, error: catError } = await supabase
      .from(TABLE)
      .select('id, is_manual')
      .eq('tournament_id', tournamentId);
    if (catError) throw catError;

    // Obtener categorías con inscripciones en ese torneo
    const { data: regs, error: regError } = await supabase
      .from('registrations')
      .select('category_id')
      .eq('tournament_id', tournamentId);
    if (regError) throw regError;

    const used = new Set((regs || []).map(r => r.category_id));

    const toDelete = (cats || [])
      .filter(c => !used.has(c.id) && !c.is_manual)
      .map(c => c.id);

    if (!toDelete.length) return 0;

    // Solo borrar si no tienen combates generados
    const { data: matches, error: mError } = await supabase
      .from('matches')
      .select('id')
      .in('category_id', toDelete)
      .limit(1);
    if (mError) throw mError;
    if (matches && matches.length) return 0;

    const { error: delError } = await supabase.from(TABLE).delete().in('id', toDelete);
    if (delError) throw delError;
    return toDelete.length;
  }

  /* --------------------------------------------------------
     OBTENER CATEGORÍAS COMPATIBLES PARA FUSIÓN
     Devuelve las categorías del mismo torneo que podrían
     recibir competidores de `sourceCategoryId`:
       - Misma disciplina
       - Mismo género
       - Mismo grupo de cinturón (si age_belt) o clase de peso
         contigua (si age_weight), o edad consecutiva (±1)
     @param {string} sourceCategoryId
     @returns {object[]} Categorías candidatas (sin la propia)
  -------------------------------------------------------- */
  async function getCompatibleCategories(sourceCategoryId) {
    const source = await getById(sourceCategoryId);
    if (!source) return [];
    const all = await listByTournament(source.tournament_id);
    const tournament = await Tournament.getById(source.tournament_id);
    const mode = tournament.category_mode || 'age_belt';

    const ageOrder = ['mini', 'benjamines', 'alevines', 'infantil', 'cadete', 'junior', 'sub21', 'senior', 'veteranos'];
    const idxFrom = ageOrder.indexOf(source.age_group_id);

    return all.filter(c =>
      c.id !== source.id &&
      c.discipline === source.discipline &&
      c.gender === source.gender
    ).filter(c => {
      if (mode === 'age_weight') {
        // Clases de peso: contiguas (mismo gender). age_group igual o consecutivo.
        const ageOk = !source.age_group_id || !c.age_group_id ||
          c.age_group_id === source.age_group_id ||
          (idxFrom >= 0 && Math.abs(ageOrder.indexOf(c.age_group_id) - idxFrom) <= 1);
        if (!ageOk) return false;
        if (!source.weight_class_id || !c.weight_class_id) return true;
        // Mismo torneo, misma disciplina y género: comparar contiguas por label numérico
        return true; // Dejamos la decisión fina al admin en el dropdown
      }
      // age_belt: mismo grupo de cinturón O edad consecutiva
      if (source.belt_group_id && c.belt_group_id && source.belt_group_id === c.belt_group_id) return true;
      if (idxFrom >= 0 && c.age_group_id && Math.abs(ageOrder.indexOf(c.age_group_id) - idxFrom) <= 1) return true;
      return false;
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  /* --------------------------------------------------------
     FUSIONAR categorías: mover competidores de una a otra
     Mueve todas las inscripciones de `sourceCategoryId` hacia
     `destCategoryId`. Luego elimina la categoría origen si
     queda vacía (excepto si es manual).
     @param {string} sourceCategoryId
     @param {string} destCategoryId
     @returns {object} { moved, sourceRemoved }
  -------------------------------------------------------- */
  async function fuseCompetitors(sourceCategoryId, destCategoryId) {
    if (sourceCategoryId === destCategoryId) throw new Error('La categoría de origen y destino son iguales.');

    if (Auth.isDevMode()) {
      const regs = JSON.parse(localStorage.getItem('ot_dev_registrations') || '[]');
      let moved = 0;
      const updated = regs.map(r => {
        if (r.category_id === sourceCategoryId) {
          moved++;
          return { ...r, category_id: destCategoryId };
        }
        return r;
      });
      localStorage.setItem('ot_dev_registrations', JSON.stringify(updated));
      const catList = _devList();
      const source = catList.find(c => c.id === sourceCategoryId);
      const stillHas = updated.filter(r => r.category_id === sourceCategoryId).length;
      let sourceRemoved = false;
      if (!stillHas && source && !source.is_manual) {
        _devSave(catList.filter(c => c.id !== sourceCategoryId));
        sourceRemoved = true;
      }
      return { moved, sourceRemoved };
    }

    // Supabase: mover registrations
    const { data: movedRows, error: moveError } = await supabase
      .from('registrations')
      .select('id')
      .eq('category_id', sourceCategoryId);
    if (moveError) throw moveError;
    const moved = (movedRows || []).length;

    if (moved) {
      const { error: updError } = await supabase
        .from('registrations')
        .update({ category_id: destCategoryId })
        .eq('category_id', sourceCategoryId);
      if (updError) throw updError;
    }

    // Eliminar la categoría origen si quedó vacía (y no es manual)
    const { data: cat } = await supabase
      .from(TABLE).select('is_manual').eq('id', sourceCategoryId).maybeSingle();
    let sourceRemoved = false;
    if (cat && !cat.is_manual) {
      const { count } = await supabase
        .from('registrations')
        .select('id', { count: 'exact' })
        .eq('category_id', sourceCategoryId);
      if ((count || 0) === 0) {
        const { error: delError } = await supabase
          .from(TABLE).delete().eq('id', sourceCategoryId);
        if (!delError) sourceRemoved = true;
      }
    }
    return { moved, sourceRemoved };
  }

  /* --------------------------------------------------------
     ¿LA CATEGORÍA ES DE EDAD MIXTA PERMITIDA?
     Para menores de 7 años (mini y benjamines) se permite
     fusionar géneros en una categoría mixta (MF).
  -------------------------------------------------------- */
  function isMixedAllowed(ageGroupId) {
    return ['mini', 'benjamines'].includes(ageGroupId || '');
  }

  /* --------------------------------------------------------
     OBTENER CATEGORÍAS COMPATIBLES PARA FUSIÓN MIXTA
     Devuelve categorías del gender opuesto (M<->F) de la
     misma disciplina y grupo etario (o consecutivo), solo
     si la categoría fuente es de menores de 7 años.
     @param {string} sourceCategoryId
     @returns {object[]} Categorías candidatas mixtas
  -------------------------------------------------------- */
  async function getCompatibleMixtaCategories(sourceCategoryId) {
    const source = await getById(sourceCategoryId);
    if (!source || !isMixedAllowed(source.age_group_id)) return [];

    const all = await listByTournament(source.tournament_id);
    const ageOrder = ['mini', 'benjamines', 'alevines', 'infantil', 'cadete', 'junior', 'sub21', 'senior', 'veteranos'];
    const idxFrom = ageOrder.indexOf(source.age_group_id);
    const oppositeGender = source.gender === 'M' ? 'F' : (source.gender === 'F' ? 'M' : null);
    if (!oppositeGender) return [];

    return all.filter(c =>
      c.id !== source.id &&
      c.discipline === source.discipline &&
      c.gender === oppositeGender
    ).filter(c => {
      if (!source.age_group_id || !c.age_group_id) return true;
      return c.age_group_id === source.age_group_id ||
        (idxFrom >= 0 && Math.abs(ageOrder.indexOf(c.age_group_id) - idxFrom) <= 1);
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }
  /* --------------------------------------------------------
     FUSIONAR COMO MIXTO (M+F) para menores de 7 años
     Crea (o reutiliza) una categoría con gender 'MF',
     mueve las inscripciones de las categorías indicadas y
     elimina las fuentes (excepto manuales).
     @param {string[]} sourceIds - Categorías a mezclar (2+)
     @param {string} tournamentId
     @returns {object} { category, moved, removed }
  -------------------------------------------------------- */
  async function fuseMixed(sourceIds, tournamentId) {
    if (!Array.isArray(sourceIds) || sourceIds.length < 2) {
      throw new Error('Se necesitan al menos 2 categorías para crear una categoría mixta.');
    }
    const ids = [...new Set(sourceIds)];
    if (!tournamentId) throw new Error('tournament_id es requerido.');

    /* ---- Dev mode ---- */
    if (Auth.isDevMode()) {
      const catList = _devList();
      const regs = JSON.parse(localStorage.getItem('ot_dev_registrations') || '[]');
      const sources = catList.filter(c => ids.includes(c.id));
      if (sources.length < 2) throw new Error('No se encontraron las categorías origen.');

      const first = sources[0];
      const ageGroupId = first.age_group_id || null;

      let destCat = catList.find(c =>
        c.tournament_id === tournamentId &&
        c.discipline === first.discipline &&
        c.gender === 'MF' &&
        (c.age_group_id || null) === ageGroupId
      ) || null;

      if (!destCat) {
        destCat = {
          id: generateId(),
          tournament_id: tournamentId,
          discipline: first.discipline,
          gender: 'MF',
          age_group_id: ageGroupId,
          weight_class_id: null,
          belt_group_id: null,
          bracket_system: 'auto',
          name: `Mixto · ${first.name || buildLabel(first) || 'Categoría'}`,
          is_manual: false,
          created_at: new Date().toISOString(),
        };
        catList.push(destCat);
      }

      let moved = 0;
      const updatedRegs = regs.map(r => {
        if (ids.includes(r.category_id)) {
          moved++;
          return { ...r, category_id: destCat.id };
        }
        return r;
      });
      localStorage.setItem('ot_dev_registrations', JSON.stringify(updatedRegs));

      let removed = 0;
      const filteredCats = catList.filter(c => {
        if (!ids.includes(c.id)) return true;
        const stillHas = updatedRegs.filter(r => r.category_id === c.id).length;
        if (stillHas > 0 || c.is_manual) return true;
        removed++;
        return false;
      });
      _devSave(filteredCats);

      return { category: destCat, moved, removed };
    }

    /* ---- Supabase ---- */
    const sources = [];
    for (const id of ids) {
      const { data } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
      if (data) sources.push(data);
    }
    if (sources.length < 2) throw new Error('No se encontraron las categorías origen.');

    const first = sources[0];
    const ageGroupId = first.age_group_id || null;

    let qSearch = supabase.from(TABLE)
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('discipline', first.discipline)
      .eq('gender', 'MF');
    if (ageGroupId) qSearch = qSearch.eq('age_group_id', ageGroupId);
    const { data: existing } = await qSearch.maybeSingle();
    let destCat = existing || null;

    if (!destCat) {
      const payload = {
        tournament_id: tournamentId,
        discipline: first.discipline,
        gender: 'MF',
        age_group_id: ageGroupId,
        weight_class_id: null,
        belt_group_id: null,
        bracket_system: 'auto',
        name: `Mixto · ${first.name || buildLabel(first) || 'Categoría'}`,
        is_manual: false,
      };
      const { data: created, error: createError } = await supabase.from(TABLE).insert(payload).select().single();
      if (createError) throw createError;
      destCat = created;
    }

    // Mover inscripciones
    const { error: updError } = await supabase
      .from('registrations')
      .update({ category_id: destCat.id })
      .in('category_id', ids);
    if (updError) throw updError;

    // Eliminar fuentes vacías no manuales
    let removed = 0;
    for (const source of sources) {
      if (source.is_manual) continue;
      const { count } = await supabase
        .from('registrations')
        .select('id', { count: 'exact' })
        .eq('category_id', source.id);
      if ((count || 0) === 0) {
        const { error: delError } = await supabase.from(TABLE).delete().eq('id', source.id);
        if (!delError) removed++;
      }
    }

    const { count: movedCount } = await supabase
      .from('registrations')
      .select('id', { count: 'exact' })
      .eq('category_id', destCat.id);
    return { category: destCat, moved: movedCount || 0, removed };
  }



  return {
    autoGenerate,
    create,
    listByTournament,
    getById,
    update,
    remove,
    removeEmpty,
    assignCompetitor,
    getCompatibleCategories,
    getCompatibleMixtaCategories,
    fuseCompetitors,
    fuseMixed,
    isMixedAllowed,
    buildLabel,
  };
})();
