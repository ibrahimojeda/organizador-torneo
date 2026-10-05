/* ============================================================
   COMPETITORS.JS — Registro y gestión de competidores
   ============================================================ */

const Competitors = (() => {

  const TABLE_COMP  = 'competitors';
  const TABLE_REG   = 'registrations';
  const DEV_KEY_C   = 'ot_dev_competitors';
  const DEV_KEY_R   = 'ot_dev_registrations';
  const REG_STATUS  = { PENDING: 'pending', ACCEPTED: 'accepted', DENIED: 'denied' };

  /* ---- localStorage helpers (modo dev) ---- */
  function _devCompList()   { try { return JSON.parse(localStorage.getItem(DEV_KEY_C) || '[]'); } catch { return []; } }
  function _devRegList()    { try { return JSON.parse(localStorage.getItem(DEV_KEY_R) || '[]'); } catch { return []; } }
  function _devSaveC(l)     { localStorage.setItem(DEV_KEY_C, JSON.stringify(l)); }
  function _devSaveR(l)     { localStorage.setItem(DEV_KEY_R, JSON.stringify(l)); }

  function _devFindByDoc(docId, tournamentId) {
    if (!docId) return null;
    return _devCompList().find(c =>
      c.document_id === docId && String(c.tournament_id || '') === String(tournamentId || '')
    ) || null;
  }
  function _devFindByName(fullName, tournamentId) {
    if (!fullName) return null;
    const name = String(fullName).trim().toLowerCase();
    return _devCompList().find(c =>
      String(c.full_name || '').trim().toLowerCase() === name && String(c.tournament_id || '') === String(tournamentId || '')
    ) || null;
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
    return _devRegList().some(r => r.competitor_id === competitorId && r.tournament_id === tournamentId && r.status !== 'denied');
  }
  function _devCreateReg(competitorId, tournamentId, categoryId) {
    const r = { id: generateId(), competitor_id: competitorId, tournament_id: tournamentId, category_id: categoryId, status: 'accepted', seed: null, registered_at: new Date().toISOString() };
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
    // Normalizar documento: '0' o vacío se considera "sin documento"
    const cleanData = { ...data, document_id: _normalizeDocumentId(data.document_id) };
    // El dojo se determina siempre desde el texto libre del formulario/CSV.
    // Así todos los flujos conservan dojo_id y pueden mostrar su logo.
    const normalizedData = await _attachDojo(cleanData, tournamentId);

    if (Auth.isDevMode()) {
      let competitor = _devFindByDoc(normalizedData.document_id, tournamentId);
      if (!competitor && !normalizedData.document_id) {
        competitor = _devFindByName(normalizedData.full_name, tournamentId);
      }
      if (!competitor) competitor = _devCreateComp(_buildPayload(normalizedData, tournamentId));
      else {
        competitor = _devUpdateComp(competitor.id, _buildPayload(normalizedData, tournamentId));
        // Sincronizar copias del mismo documento en dev
        await _syncSiblingCompetitors(competitor.id, normalizedData.document_id, _buildPayload(normalizedData, tournamentId));
      }
      if (_devIsRegistered(competitor.id, tournamentId))
        throw new Error(`${competitor.full_name} ya está inscrito en este torneo.`);
      // Asigna categorías reales (categories.js ya tiene guardas dev)
      const categoryIds = await Categories.assignCompetitor(competitor, tournamentId);
      const registrations = categoryIds.map(categoryId =>
        _devCreateReg(competitor.id, tournamentId, categoryId)
      );
      return { competitor, registrations };
    }

    // 1. Busca o crea el competidor por DNI/pasaporte (SOLO en este torneo).
    //    Si no tiene documento, deduplica por nombre para no duplicar.
    let competitor = await _findByDocument(normalizedData.document_id, tournamentId);
    if (!competitor && !normalizedData.document_id) {
      competitor = await _findByName(normalizedData.full_name, tournamentId);
    }
    if (!competitor) {
      competitor = await _createCompetitor(normalizedData, tournamentId);
    } else {
      // Actualiza datos si cambiaron
      competitor = await _updateCompetitor(competitor.id, normalizedData);
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
    let query = supabase
      .from(TABLE_REG)
      .select(`
        id,
        category_id,
        seed,
        status,
        competitors (
          id, full_name, document_id, gender, dob, weight,
          belt_id, club, country, country_manual, photo_url, discipline, dojo_id
        )
      `)
      .eq('tournament_id', tournamentId)
      .order('registered_at');
    const { data, error } = await query;
    if (error) {
      // Si falla por la columna status, reintentar sin ella
      if (error.message && error.message.includes('status')) {
        const { data: d2, error: e2 } = await supabase
          .from(TABLE_REG)
          .select(`
            id,
            category_id,
            seed,
            competitors (
              id, full_name, document_id, gender, dob, weight,
              belt_id, club, country, country_manual, photo_url, discipline, dojo_id
            )
          `)
          .eq('tournament_id', tournamentId)
          .order('registered_at');
        if (e2) throw e2;
        return (d2 || []).map(r => ({
          ...r.competitors,
          registration_id: r.id,
          category_id: r.category_id,
          seed: r.seed,
          status: 'accepted',
        }));
      }
      throw error;
    }
    return (data || []).map(r => ({ ...r.competitors, registration_id: r.id, category_id: r.category_id, seed: r.seed, status: r.status || 'accepted' }));
  }

  /* --------------------------------------------------------
     LISTAR COMPETIDORES DE UNA CATEGORÍA
  -------------------------------------------------------- */
  async function listByCategory(categoryId) {
    if (Auth.isDevMode()) return _devListByCategory(categoryId);
    let query = supabase
      .from(TABLE_REG)
      .select(`
        id, seed, status,
        competitors (
          id, full_name, document_id, gender, dob, weight, belt_id, club, country, photo_url, dojo_id
        )
      `)
      .eq('category_id', categoryId)
      .order('seed', { nullsFirst: true });
    // Solo filtrar denied si la columna status existe (fallback si no existe)
    try { query = query.neq('status', 'denied'); } catch (_) {}
    const { data, error } = await query;
    if (error) {
      // Si falla por la columna status, reintentar sin el filtro
      if (error.message && error.message.includes('status')) {
        const { data: d2, error: e2 } = await supabase
          .from(TABLE_REG)
          .select(`
            id, seed,
            competitors (
              id, full_name, document_id, gender, dob, weight, belt_id, club, country, photo_url, dojo_id
            )
          `)
          .eq('category_id', categoryId)
          .order('seed', { nullsFirst: true });
        if (e2) throw e2;
        return (d2 || []).map(r => ({
          ...r.competitors,
          registration_id: r.id,
          category_id:     categoryId,
          seed:            r.seed,
          status:          'accepted',
        }));
      }
      throw error;
    }
    return (data || []).map(r => ({
      ...r.competitors,
      registration_id: r.id,
      category_id:     categoryId,
      seed:            r.seed,
      status:          r.status || 'accepted',
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
    return editBracketRegistration('remove', registrationId);
  }

  async function editBracketRegistration(action, registrationId = null, categoryId = null) {
    const entries = registrationId ? await listByTournamentForRegistration(registrationId) : null;
    if (registrationId && !entries) throw new Error('Inscripción no encontrada.');
    const sourceId = entries?.category_id || categoryId;
    const ids = [...new Set([sourceId, categoryId].filter(Boolean))];
    const cats = await Promise.all(ids.map(id => Categories.getById(id)));
    const label = cats.map(c => c.name || Categories.buildLabel(c)).join(' / ');
    const confirmReset = () => {
      if (!confirm(`Categorías afectadas: ${label}. Se borrarán TODAS sus llaves, combates y resultados, incluidos los de otros atletas. Las inscripciones restantes se conservan. Después puedes generar las llaves nuevamente. ¿Continuar?`)) return false;
      return prompt('Escribe REHACER para confirmar la pérdida de esos resultados:') === 'REHACER';
    };
    if (Auth.isDevMode()) {
      const regs = _devRegList();
      const reg = regs.find(r => r.id === registrationId);
      if (action !== 'reset' && !reg) throw new Error('Inscripción no encontrada.');
      if (action === 'move') {
        if (reg.category_id === categoryId) return [];
        if (cats.some(c => c.tournament_id !== reg.tournament_id)) throw new Error('El destino debe pertenecer al mismo torneo.');
        if (regs.some(r => r.category_id === categoryId && r.competitor_id === reg.competitor_id)) throw new Error('El competidor ya está inscrito en destino.');
      }
      const matches = JSON.parse(localStorage.getItem('ot_dev_matches') || '[]');
      if (matches.some(m => ids.includes(m.category_id)) && !confirmReset()) throw new Error('Operación cancelada; no se modificó ninguna llave.');
      localStorage.setItem('ot_dev_matches', JSON.stringify(matches.filter(m => !ids.includes(m.category_id))));
      const podio = JSON.parse(localStorage.getItem('ot_dev_podio') || '{}');
      ids.forEach(id => delete podio[id]);
      localStorage.setItem('ot_dev_podio', JSON.stringify(podio));
      if (action === 'remove') _devSaveR(regs.filter(r => r.id !== registrationId));
      if (action === 'move') _devSaveR(regs.map(r => r.id === registrationId ? { ...r, category_id: categoryId } : r));
      return ids;
    }
    const call = reset => supabase.rpc('edit_bracket_registration', {
      p_action: action, p_registration_id: registrationId, p_category_id: categoryId, p_reset: reset,
    });
    let result = await call(false);
    if (result.error?.message?.includes('BRACKET_RESET_REQUIRED')) {
      if (!confirmReset()) throw new Error('Operación cancelada; no se modificó ninguna llave.');
      result = await call(true);
    }
    if (result.error) throw result.error;
    return result.data;
  }

  async function listByTournamentForRegistration(id) {
    if (Auth.isDevMode()) return _devRegList().find(r => r.id === id);
    return _getRegistrationById(id);
  }

  /* --------------------------------------------------------
     CAMBIAR CATEGORÍA DE UNA INSCRIPCIÓN
     Mueve al competidor a otra categoría del mismo torneo.
  -------------------------------------------------------- */
  async function moveCategory(registrationId, newCategoryId) {
    return editBracketRegistration('move', registrationId, newCategoryId);
  }

  /* --------------------------------------------------------
     CAMBIAR ESTADO DE INSCRIPCIÓN (accepted/denied/pending)
     Si se niega, también elimina al competidor de las llaves
     de su categoría actual.
  -------------------------------------------------------- */
  async function setStatus(registrationId, newStatus, tournamentId) {
    if (Auth.isDevMode()) {
      const regs = _devRegList().map(r =>
        r.id === registrationId ? { ...r, status: newStatus } : r
      );
      _devSaveR(regs);
      if (newStatus === REG_STATUS.DENIED && tournamentId) {
        // En dev mode, remove from matches then re-generate brackets
        const reg = regs.find(r => r.id === registrationId);
        if (reg) {
          await _removeFromMatches(registrationId, reg.category_id);
          await Bracket.regenerate(reg.category_id).catch(() => {});
        }
      }
      return;
    }
    const reg = await _getRegistrationById(registrationId);
    if (!reg) throw new Error('Inscripción no encontrada.');

    const { error } = await supabase
      .from(TABLE_REG)
      .update({ status: newStatus })
      .eq('id', registrationId);
    if (error) throw error;

    if (newStatus === REG_STATUS.DENIED) {
      // Eliminar al competidor de los combates pendientes en su categoría
      await _removeFromMatches(registrationId, reg.category_id);
      // Regenerar llaves de la categoría automáticamente
      await Bracket.regenerate(reg.category_id).catch(() => {});
    }
  }

  async function _removeFromMatches(registrationId, categoryId) {
    if (Auth.isDevMode()) {
      const list = JSON.parse(localStorage.getItem('ot_dev_matches') || '[]');
      const updated = list.map(m => {
        if (m.category_id !== categoryId) return m;
        const upd = { ...m };
        if (m.competitor_a_id === registrationId) upd.competitor_a_id = null;
        if (m.competitor_b_id === registrationId) upd.competitor_b_id = null;
        if (m.winner_id === registrationId) upd.winner_id = null;
        return upd;
      });
      localStorage.setItem('ot_dev_matches', JSON.stringify(updated));
      return;
    }
    // Limpiar referencia en combates pendientes — actualizar cada columna por separado
    await supabase
      .from('matches')
      .update({ competitor_a_id: null })
      .eq('competitor_a_id', registrationId)
      .eq('category_id', categoryId)
      .in('status', ['pending', 'bye']);
    await supabase
      .from('matches')
      .update({ competitor_b_id: null })
      .eq('competitor_b_id', registrationId)
      .eq('category_id', categoryId)
      .in('status', ['pending', 'bye']);
    await supabase
      .from('matches')
      .update({ winner_id: null })
      .eq('winner_id', registrationId)
      .eq('category_id', categoryId)
      .in('status', ['pending', 'bye']);
  }

  async function _getRegistrationById(id) {
    if (Auth.isDevMode()) return _devRegList().find(r => r.id === id) || null;
    const { data } = await supabase
      .from(TABLE_REG)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return data || null;
  }

  /* --------------------------------------------------------
     BUSCAR COMPETIDORES (para autocompletado)
  -------------------------------------------------------- */
  async function search(query, tournamentId) {
    const safeQuery = String(query ?? '').replace(/["\\,()]/g, ' ').trim();
    if (!safeQuery) return [];
    let q = supabase
      .from(TABLE_COMP)
      .select('id, full_name, document_id, club, country, belt_id, dojo_id, tournament_id')
      .or(`full_name.ilike.%${safeQuery}%,document_id.ilike.%${safeQuery}%,club.ilike.%${safeQuery}%`)
      .limit(10);
    if (tournamentId) q = q.eq('tournament_id', tournamentId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  /* ---- Helpers privados ---- */

  async function _findByDocument(documentId, tournamentId) {
    if (!documentId) return null;
    if (Auth.isDevMode()) return _devFindByDoc(documentId, tournamentId);
    let q = supabase
      .from(TABLE_COMP)
      .select('*')
      .eq('document_id', documentId);
    if (tournamentId) q = q.eq('tournament_id', tournamentId);
    const { data } = await q.maybeSingle();
    return data || null;
  }

  async function _findByName(fullName, tournamentId) {
    if (!fullName) return null;
    const name = String(fullName).trim().toLowerCase();
    let q = supabase
      .from(TABLE_COMP)
      .select('*')
      .ilike('full_name', name)
      .limit(1);
    if (tournamentId) q = q.eq('tournament_id', tournamentId);
    const { data } = await q.maybeSingle();
    return data || null;
  }

  async function _attachDojo(data, tournamentId) {
    const club = data.club?.trim();
    if (!club || typeof Dojos === 'undefined' || !Dojos.create) return { ...data, dojo_id: data.dojo_id || null };
    const country = getCountryInfo(data.country);
    const dojo = await Dojos.create(club, country.code ? { country_code: country.code } : {}, tournamentId);
    return { ...data, country: data.country || null, dojo_id: dojo?.id || data.dojo_id || null };
  }

  async function _createCompetitor(data, tournamentId) {
    if (Auth.isDevMode()) return _devCreateComp(_buildPayload(data, tournamentId));
    const payload = _buildPayload(data, tournamentId);
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
    // Sincronizar copias del mismo documento en otros torneos (actualiza datos del perfil)
    if (updated && data.document_id) {
      await _syncSiblingCompetitors(id, data.document_id, payload);
    }
    return updated;
  }

  /* --------------------------------------------------------
     SINCRONIZAR COPIAS DEL MISMO DOCUMENTO EN OTROS TORNEOS
     Mantiene actualizada la misma persona (mismo DNI/pasaporte)
     en todas las copias por torneo. No toca tournament_id ni
     registrations.
     @param {string} excludeId - ID de la copia que se está editando
     @param {string} documentId - Documento del competidor
     @param {object} payload - Campos de perfil a propagar
  -------------------------------------------------------- */
  async function _syncSiblingCompetitors(excludeId, documentId, payload) {
    if (!documentId) return 0;
    if (Auth.isDevMode()) {
      const list = _devCompList();
      let synced = 0;
      const syncData = { ...payload };
      delete syncData.tournament_id;
      delete syncData.dojo_id;
      const updated = list.map(c => {
        if (c.document_id === documentId && c.id !== excludeId) {
          synced++;
          return { ...c, ...syncData };
        }
        return c;
      });
      _devSaveC(updated);
      return synced;
    }
    let q = supabase
      .from(TABLE_COMP)
      .select('id')
      .eq('document_id', documentId);
    if (excludeId) q = q.neq('id', excludeId);
    const { data: siblings } = await q;
    if (!siblings || !siblings.length) return 0;

    // No propagar campos de identidad que solo aplican al torneo actual
    const syncData = { ...payload };
    delete syncData.tournament_id;
    delete syncData.dojo_id;

    let synced = 0;
    for (const sibling of siblings) {
      try {
        const { error } = await supabase
          .from(TABLE_COMP)
          .update(syncData)
          .eq('id', sibling.id);
        if (!error) synced++;
      } catch (_) {}
    }
    return synced;
  }

  async function _isRegistered(competitorId, tournamentId) {
    if (Auth.isDevMode()) return _devIsRegistered(competitorId, tournamentId);
    let q = supabase
      .from(TABLE_REG)
      .select('id', { count: 'exact', head: true })
      .eq('competitor_id', competitorId)
      .eq('tournament_id', tournamentId);
    // No contar inscripciones "denegadas": no aparecen en la lista ni participan en llaves.
    try { q = q.neq('status', 'denied'); } catch (_) {}
    const { count } = await q;
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
    if (existing) {
      // Si estaba denegado, se reactiva como aceptado para asegurar la inscripción.
      if (existing.status === 'denied') {
        const { data: reactivated, error: reactErr } = await supabase
          .from(TABLE_REG)
          .update({ status: 'accepted' })
          .eq('id', existing.id)
          .select()
          .single();
        if (!reactErr && reactivated) return reactivated;
        return { ...existing, status: 'accepted' };
      }
      return existing;
    }
    const { data, error } = await supabase
      .from(TABLE_REG)
      .insert({ competitor_id: competitorId, tournament_id: tournamentId, category_id: categoryId, status: 'accepted' })
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

  function _normalizeDocumentId(doc) {
    if (doc == null) return '';
    const s = String(doc).trim();
    return s === '0' ? '' : s;
  }

  function _buildPayload(data, tournamentId) {
    const payload = {};
    if (data.full_name)    payload.full_name    = data.full_name.trim();
    const doc = _normalizeDocumentId(data.document_id);
    if (doc) payload.document_id = doc;
    if (data.gender)       payload.gender       = data.gender;
    if (data.dob)          payload.dob          = data.dob;
    if (data.weight)       payload.weight       = parseFloat(data.weight);
    if (data.belt_id)      payload.belt_id      = data.belt_id;
    if (data.club)         payload.club         = data.club.trim();
    if (data.country !== undefined) payload.country = data.country?.trim() || null;
    if (data.dojo_id)      payload.dojo_id      = data.dojo_id;
    if (data.photo_url)    payload.photo_url    = data.photo_url;
    // 'kata' | 'kumite' | 'both' — default: 'kumite'
    payload.discipline = ['kata', 'kumite', 'both'].includes(data.discipline) ? data.discipline : 'kumite';
    if (tournamentId)      payload.tournament_id = tournamentId;
    return payload;
  }

  function _validate(data) {
    if (!data.full_name?.trim()) throw new Error('El nombre completo es obligatorio.');
    if (!data.gender)            throw new Error('El género es obligatorio.');
    if (!data.dob)               throw new Error('La fecha de nacimiento es obligatoria.');
    if (!data.belt_id)           throw new Error('El cinturón es obligatorio.');
    if (data.weight == null || isNaN(data.weight)) throw new Error('El peso es obligatorio.');
  }

  /* ---- Detectar duplicados ---- */
  async function detectDuplicates(tournamentId) {
    const comps = await listByTournament(tournamentId);
    const byDoc = {};
    comps.forEach(c => {
      if (c.document_id) {
        if (!byDoc[c.document_id]) byDoc[c.document_id] = [];
        byDoc[c.document_id].push(c);
      }
    });
    const groups = Object.values(byDoc);
    return groups.filter(g => g.length >= 2).flat();
  }

  /* ---- Eliminar competidor ---- */
  async function remove(id) {
    if (Auth.isDevMode()) {
      const list = _devCompList().filter(c => c.id !== id);
      _devSaveC(list);
      const regs = _devRegList().filter(r => r.competitor_id !== id);
      _devSaveR(regs);
      return;
    }
    const { error: registrationError } = await supabase.from(TABLE_REG).delete().eq('competitor_id', id);
    if (registrationError) throw registrationError;
    const { error } = await supabase.from(TABLE_COMP).delete().eq('id', id);
    if (error) throw error;
  }

  /* --------------------------------------------------------
     SINCRONIZAR TODAS LAS COPIAS DE UN DOCUMENTO (acción pública)
     Útil para forzar la actualización de datos de una misma
     persona en todos los torneos donde tiene copia.
     @param {string} documentId
  -------------------------------------------------------- */
  async function syncByDocument(documentId) {
    const { data: copies } = await supabase
      .from(TABLE_COMP)
      .select('id')
      .eq('document_id', documentId);
    return (copies || []).length;
  }

  function countUnique(entries) {
    return new Set(entries.map(c => c.competitor_id || c.competitors?.id || c.id).filter(Boolean)).size;
  }

  async function countRegistered(tournamentId) {
    if (Auth.isDevMode()) {
      const regs = JSON.parse(localStorage.getItem('ot_dev_registrations') || '[]');
      return countUnique(regs.filter(r => !tournamentId || r.tournament_id === tournamentId));
    }
    const ids = new Set();
    for (let offset = 0; ; offset += 1000) {
      let query = supabase.from(TABLE_REG).select('id, competitor_id').order('id');
      if (tournamentId) query = query.eq('tournament_id', tournamentId);
      const { data, error } = await query.range(offset, offset + 999);
      if (error) throw error;
      (data || []).forEach(r => { if (r.competitor_id) ids.add(r.competitor_id); });
      if (!data || data.length < 1000) break;
    }
    return ids.size;
  }

  return {
    editBracketRegistration,
    countUnique,
    countRegistered,
    register,
    registerBatch,
    listByTournament,
    listByCategory,
    getById,
    update,
    setSeed,
    unregister,
    moveCategory,
    setStatus,
    search,
    detectDuplicates,
    remove,
    syncByDocument,
  };
})();
