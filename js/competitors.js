/* ============================================================
   COMPETITORS.JS — Registro y gestión de competidores
   ============================================================ */

const Competitors = (() => {

  const TABLE_COMP  = 'competitors';
  const TABLE_REG   = 'registrations';
  const DEV_KEY_C   = 'ot_dev_competitors';
  const DEV_KEY_R   = 'ot_dev_registrations';

  /* ---- localStorage helpers (modo dev) ---- */
  function _devCompList()   { try { return JSON.parse(localStorage.getItem(DEV_KEY_C) || '[]'); } catch { return []; } }
  function _devRegList()    { try { return JSON.parse(localStorage.getItem(DEV_KEY_R) || '[]'); } catch { return []; } }
  function _devSaveC(l)     { localStorage.setItem(DEV_KEY_C, JSON.stringify(l)); }
  function _devSaveR(l)     { localStorage.setItem(DEV_KEY_R, JSON.stringify(l)); }

  function _devFindByDoc(docId) {
    if (!docId) return null;
    return _devCompList().find(c => c.document_id === docId) || null;
  }
  function _devCreateComp(payload) {
    const c = { ...payload, id: generateId(), created_at: new Date().toISOString() };
    const list = _devCompList(); list.push(c); _devSaveC(list); return c;
  }
  function _devUpdateComp(id, payload) {
    const list = _devCompList().map(c => c.id === id ? { ...c, ...payload } : c);
    _devSaveC(list);
    return list.find(c => c.id === id);
  }
  function _devIsRegistered(competitorId, tournamentId) {
    return _devRegList().some(r => r.competitor_id === competitorId && r.tournament_id === tournamentId);
  }
  function _devCreateReg(competitorId, tournamentId, categoryId) {
    const r = { id: generateId(), competitor_id: competitorId, tournament_id: tournamentId, category_id: categoryId, seed: null, registered_at: new Date().toISOString() };
    const list = _devRegList(); list.push(r); _devSaveR(list); return r;
  }
  function _devListByTournament(tournamentId) {
    const comps = _devCompList();
    return _devRegList()
      .filter(r => r.tournament_id === tournamentId)
      .map(r => {
        const comp = comps.find(c => c.id === r.competitor_id) || {};
        return { ...comp, registration_id: r.id, category_id: r.category_id, seed: r.seed };
      });
  }
  function _devListByCategory(categoryId) {
    const comps = _devCompList();
    return _devRegList()
      .filter(r => r.category_id === categoryId)
      .sort((a, b) => (a.seed || 999) - (b.seed || 999))
      .map(r => {
        const comp = comps.find(c => c.id === r.competitor_id) || {};
        return { ...comp, registration_id: r.id, category_id: r.category_id, seed: r.seed };
      });
  }

  /* --------------------------------------------------------
     REGISTRAR COMPETIDOR EN UN TORNEO
     Crea el perfil del competidor (si no existe) y lo
     inscribe en el torneo. Asigna categorías automáticamente.
     @param {object} data - Datos del competidor
     @param {string} tournamentId
     @returns {object} Registro creado
  -------------------------------------------------------- */
  async function register(data, tournamentId) {
    _validate(data);

    if (Auth.isDevMode()) {
      let competitor = _devFindByDoc(data.document_id);
      if (!competitor) competitor = _devCreateComp(_buildPayload(data));
      else competitor = _devUpdateComp(competitor.id, _buildPayload(data));
      if (_devIsRegistered(competitor.id, tournamentId))
        throw new Error(`${competitor.full_name} ya está inscrito en este torneo.`);
      // Asigna categorías reales (categories.js ya tiene guardas dev)
      const categoryIds = await Categories.assignCompetitor(competitor, tournamentId);
      const registrations = categoryIds.map(categoryId =>
        _devCreateReg(competitor.id, tournamentId, categoryId)
      );
      return { competitor, registrations };
    }

    // 1. Busca o crea el competidor por DNI/pasaporte
    let competitor = await _findByDocument(data.document_id);
    if (!competitor) {
      competitor = await _createCompetitor(data);
    } else {
      // Actualiza datos si cambiaron
      competitor = await _updateCompetitor(competitor.id, data);
    }

    // 2. Verifica que no esté ya inscrito en este torneo
    const alreadyRegistered = await _isRegistered(competitor.id, tournamentId);
    if (alreadyRegistered) {
      throw new Error(`${competitor.full_name} ya está inscrito en este torneo.`);
    }

    // 3. Determina categorías y crea la inscripción
    const categoryIds = await Categories.assignCompetitor(competitor, tournamentId);

    // Sequential (not parallel) to avoid race-condition 409 on UNIQUE (category_id, competitor_id)
    const registrations = [];
    for (const categoryId of categoryIds) {
      registrations.push(await _createRegistration(competitor.id, tournamentId, categoryId));
    }

    return { competitor, registrations };
  }

  /* --------------------------------------------------------
     REGISTRAR MÚLTIPLES COMPETIDORES (importación por lote)
     @param {object[]} rows - Array de datos de competidores
     @param {string} tournamentId
     @returns {object} { success: [], errors: [] }
  -------------------------------------------------------- */
  async function registerBatch(rows, tournamentId) {
    const success = [];
    const errors  = [];
    for (const row of rows) {
      try {
        const result = await register(row, tournamentId);
        success.push(result);
      } catch (e) {
        errors.push({ row, message: e.message });
      }
    }
    return { success, errors };
  }

  /* --------------------------------------------------------
     LISTAR COMPETIDORES DE UN TORNEO
  -------------------------------------------------------- */
  async function listByTournament(tournamentId) {
    if (Auth.isDevMode()) return _devListByTournament(tournamentId);
    const { data, error } = await supabase
      .from(TABLE_REG)
      .select(`
        id,
        category_id,
        seed,
        competitors (
          id, full_name, document_id, gender, dob, weight,
          belt_id, club, country, photo_url, discipline
        )
      `)
      .eq('tournament_id', tournamentId)
      .order('registered_at');
    if (error) throw error;
    return (data || []).map(r => ({ ...r.competitors, registration_id: r.id, category_id: r.category_id, seed: r.seed }));
  }

  /* --------------------------------------------------------
     LISTAR COMPETIDORES DE UNA CATEGORÍA
  -------------------------------------------------------- */
  async function listByCategory(categoryId) {
    if (Auth.isDevMode()) return _devListByCategory(categoryId);
    const { data, error } = await supabase
      .from(TABLE_REG)
      .select(`
        id, seed,
        competitors (
          id, full_name, document_id, gender, dob, weight, belt_id, club, country, photo_url
        )
      `)
      .eq('category_id', categoryId)
      .order('seed', { nullsFirst: true });
    if (error) throw error;
    return (data || []).map(r => ({
      ...r.competitors,
      registration_id: r.id,
      category_id:     categoryId,
      seed:            r.seed,
    }));
  }

  /* --------------------------------------------------------
     OBTENER COMPETIDOR POR ID
  -------------------------------------------------------- */
  async function getById(id) {
    const { data, error } = await supabase
      .from(TABLE_COMP)
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  /* --------------------------------------------------------
     ACTUALIZAR DATOS DEL COMPETIDOR
  -------------------------------------------------------- */
  async function update(competitorId, data) {
    const payload = _buildPayload(data);
    const { data: updated, error } = await supabase
      .from(TABLE_COMP)
      .update(payload)
      .eq('id', competitorId)
      .select()
      .single();
    if (error) throw error;
    return updated;
  }

  /* --------------------------------------------------------
     ASIGNAR SEED (número de cabeza de serie)
     @param {string} registrationId
     @param {number|null} seed
  -------------------------------------------------------- */
  async function setSeed(registrationId, seed) {
    const { data, error } = await supabase
      .from(TABLE_REG)
      .update({ seed })
      .eq('id', registrationId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /* --------------------------------------------------------
     ELIMINAR INSCRIPCIÓN
     Solo si no tiene combates asignados.
  -------------------------------------------------------- */
  async function unregister(registrationId) {
    if (Auth.isDevMode()) {
      const regs = _devRegList().filter(r => r.id !== registrationId);
      _devSaveR(regs);
      return;
    }
    const { count } = await supabase
      .from('matches')
      .select('id', { count: 'exact' })
      .or(`competitor_a_id.eq.${registrationId},competitor_b_id.eq.${registrationId}`)
      .neq('status', 'bye');
    if (count > 0) throw new Error('No se puede eliminar: el competidor ya tiene combates generados.');

    const { error } = await supabase.from(TABLE_REG).delete().eq('id', registrationId);
    if (error) throw error;
  }

  /* --------------------------------------------------------
     CAMBIAR CATEGORÍA DE UNA INSCRIPCIÓN
     Mueve al competidor a otra categoría del mismo torneo.
  -------------------------------------------------------- */
  async function moveCategory(registrationId, newCategoryId) {
    if (Auth.isDevMode()) {
      const regs = _devRegList().map(r =>
        r.id === registrationId ? { ...r, category_id: newCategoryId } : r
      );
      _devSaveR(regs);
      return;
    }
    const { error } = await supabase
      .from(TABLE_REG)
      .update({ category_id: newCategoryId })
      .eq('id', registrationId);
    if (error) throw error;
  }

  /* --------------------------------------------------------
     BUSCAR COMPETIDORES (para autocompletado)
  -------------------------------------------------------- */
  async function search(query) {
    const { data, error } = await supabase
      .from(TABLE_COMP)
      .select('id, full_name, document_id, club, country, belt_id')
      .or(`full_name.ilike.%${query}%,document_id.ilike.%${query}%`)
      .limit(10);
    if (error) throw error;
    return data || [];
  }

  /* ---- Helpers privados ---- */

  async function _findByDocument(documentId) {
    if (!documentId) return null;
    if (Auth.isDevMode()) return _devFindByDoc(documentId);
    const { data } = await supabase
      .from(TABLE_COMP)
      .select('*')
      .eq('document_id', documentId)
      .maybeSingle();
    return data || null;
  }

  async function _createCompetitor(data) {
    if (Auth.isDevMode()) return _devCreateComp(_buildPayload(data));
    const payload = _buildPayload(data);
    const { data: created, error } = await supabase
      .from(TABLE_COMP)
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return created;
  }

  async function _updateCompetitor(id, data) {
    const payload = _buildPayload(data);
    const { data: updated, error } = await supabase
      .from(TABLE_COMP)
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return updated;
  }

  async function _isRegistered(competitorId, tournamentId) {
    if (Auth.isDevMode()) return _devIsRegistered(competitorId, tournamentId);
    const { count } = await supabase
      .from(TABLE_REG)
      .select('id', { count: 'exact', head: true })
      .eq('competitor_id', competitorId)
      .eq('tournament_id', tournamentId);
    return (count ?? 0) > 0;
  }

  async function _createRegistration(competitorId, tournamentId, categoryId) {
    if (Auth.isDevMode()) return _devCreateReg(competitorId, tournamentId, categoryId);
    // Check first to avoid 409 on UNIQUE (category_id, competitor_id)
    const { data: existing } = await supabase
      .from(TABLE_REG)
      .select('*')
      .eq('competitor_id', competitorId)
      .eq('category_id', categoryId)
      .maybeSingle();
    if (existing) return existing;
    const { data, error } = await supabase
      .from(TABLE_REG)
      .insert({ competitor_id: competitorId, tournament_id: tournamentId, category_id: categoryId })
      .select()
      .single();
    if (error) {
      // 23505 = unique_violation: already inserted by a concurrent call — fetch and return it
      if (error.code === '23505') {
        const { data: fetched } = await supabase
          .from(TABLE_REG).select('*')
          .eq('competitor_id', competitorId).eq('category_id', categoryId)
          .single();
        return fetched;
      }
      throw error;
    }
    return data;
  }

  function _buildPayload(data) {
    const payload = {};
    if (data.full_name)    payload.full_name    = data.full_name.trim();
    if (data.document_id)  payload.document_id  = data.document_id.trim();
    if (data.gender)       payload.gender       = data.gender;
    if (data.dob)          payload.dob          = data.dob;
    if (data.weight)       payload.weight       = parseFloat(data.weight);
    if (data.belt_id)      payload.belt_id      = data.belt_id;
    if (data.club)         payload.club         = data.club.trim();
    if (data.country)      payload.country      = data.country.trim();
    if (data.photo_url)    payload.photo_url    = data.photo_url;
    // 'kata' | 'kumite' | 'both' — default: 'kumite'
    payload.discipline = ['kata', 'kumite', 'both'].includes(data.discipline) ? data.discipline : 'kumite';
    return payload;
  }

  function _validate(data) {
    if (!data.full_name?.trim()) throw new Error('El nombre completo es obligatorio.');
    if (!data.gender)            throw new Error('El género es obligatorio.');
    if (!data.dob)               throw new Error('La fecha de nacimiento es obligatoria.');
    if (!data.belt_id)           throw new Error('El cinturón es obligatorio.');
    if (data.weight == null || isNaN(data.weight)) throw new Error('El peso es obligatorio.');
  }

  return {
    register,
    registerBatch,
    listByTournament,
    listByCategory,
    getById,
    update,
    setSeed,
    unregister,
    moveCategory,
    search,
  };
})();
