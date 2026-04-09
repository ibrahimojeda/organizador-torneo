/* ============================================================
   TOURNAMENT.JS — CRUD de torneos
   ============================================================ */

const Tournament = (() => {

  const TABLE   = 'tournaments';
  const DEV_KEY = 'ot_dev_tournaments';

  /* ---- Helpers de almacenamiento local (modo dev) ---- */
  function _devList() {
    try { return JSON.parse(localStorage.getItem(DEV_KEY) || '[]'); } catch { return []; }
  }
  function _devSave(list) { localStorage.setItem(DEV_KEY, JSON.stringify(list)); }
  function _devCreate(payload) {
    const t = { ...payload, id: generateId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const list = _devList(); list.unshift(t); _devSave(list);
    return t;
  }
  function _devGetById(id) { return _devList().find(t => t.id === id) || null; }
  function _devUpdate(id, payload) {
    const list = _devList().map(t => t.id === id ? { ...t, ...payload, updated_at: new Date().toISOString() } : t);
    _devSave(list);
    return list.find(t => t.id === id);
  }
  function _devRemove(id) { _devSave(_devList().filter(t => t.id !== id)); }

  /* --------------------------------------------------------
     CREAR TORNEO
     Inserta un nuevo torneo en Supabase.
     @param {object} data - Campos del torneo
     @returns {object} Torneo creado
  -------------------------------------------------------- */
  async function create(data) {
    _validate(data);
    const payload = {
      name:           data.name.trim(),
      location:       data.location?.trim() || null,
      date_start:     data.date_start,
      date_end:       data.date_end || data.date_start,
      description:    data.description?.trim() || null,
      bracket_system: data.bracket_system || 'auto',
      disciplines:    data.disciplines || ['kumite'],
      num_tatamis:    parseInt(data.num_tatamis, 10) || 1,
      status:         TOURNAMENT_STATUS.DRAFT.id,
      organizer_id:   Auth.getUserId(),
    };
    if (Auth.isDevMode()) return _devCreate(payload);
    const { data: created, error } = await supabase.from(TABLE).insert(payload).select().single();
    if (error) throw error;
    return created;
  }

  /* --------------------------------------------------------
     OBTENER TORNEO POR ID
  -------------------------------------------------------- */
  async function getById(id) {
    if (Auth.isDevMode()) {
      const t = _devGetById(id);
      if (!t) throw new Error('Torneo no encontrado.');
      return t;
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
     LISTAR TORNEOS DEL ORGANIZADOR
  -------------------------------------------------------- */
  async function listMine() {
    if (Auth.isDevMode()) return _devList();
    const userId = Auth.getUserId();
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('organizer_id', userId)
      .order('date_start', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  /* --------------------------------------------------------
     LISTAR TORNEOS PÚBLICOS (acceso sin login)
  -------------------------------------------------------- */
  async function listPublic() {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, name, location, date_start, date_end, status, disciplines')
      .in('status', [
        TOURNAMENT_STATUS.OPEN.id,
        TOURNAMENT_STATUS.ONGOING.id,
        TOURNAMENT_STATUS.FINISHED.id,
      ])
      .order('date_start', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  /* --------------------------------------------------------
     ACTUALIZAR TORNEO
  -------------------------------------------------------- */
  async function update(id, data) {
    const payload = {};
    if (data.name)           payload.name           = data.name.trim();
    if (data.location)       payload.location       = data.location.trim();
    if (data.date_start)     payload.date_start     = data.date_start;
    if (data.date_end)       payload.date_end       = data.date_end;
    if (data.description)    payload.description    = data.description.trim();
    if (data.bracket_system) payload.bracket_system = data.bracket_system;
    if (data.disciplines)    payload.disciplines    = data.disciplines;
    if (data.status)         payload.status         = data.status;
    if (Auth.isDevMode()) return _devUpdate(id, payload);
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
     CAMBIAR ESTADO DEL TORNEO
  -------------------------------------------------------- */
  async function setStatus(id, statusId) {
    return update(id, { status: statusId });
  }

  /* --------------------------------------------------------
     GENERAR CÓDIGO DE ACCESO (para árbitros)
  -------------------------------------------------------- */
  async function generateAccessCode(tournamentId, role = 'referee') {
    const code = _randomCode();
    const { data, error } = await supabase
      .from('tournament_codes')
      .insert({
        tournament_id: tournamentId,
        code,
        role,
        active: true,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /* --------------------------------------------------------
     OBTENER ESTADÍSTICAS RÁPIDAS DEL TORNEO
  -------------------------------------------------------- */
  async function getStats(tournamentId) {
    if (Auth.isDevMode()) {
      try {
        const cats      = JSON.parse(localStorage.getItem('ot_dev_categories')     || '[]').filter(c => c.tournament_id === tournamentId);
        const regs      = JSON.parse(localStorage.getItem('ot_dev_registrations')  || '[]').filter(r => r.tournament_id === tournamentId);
        const allMatches= JSON.parse(localStorage.getItem('ot_dev_matches')        || '[]').filter(m => m.tournament_id === tournamentId);
        const finished  = allMatches.filter(m => m.status === 'finished').length;
        const total     = allMatches.length;
        return { categories: cats.length, competitors: regs.length, totalMatches: total, finishedMatches: finished,
                 progress: total > 0 ? Math.round((finished / total) * 100) : 0 };
      } catch { return { categories: 0, competitors: 0, totalMatches: 0, finishedMatches: 0, progress: 0 }; }
    }
    const [categories, competitors, matches] = await Promise.all([
      supabase.from('categories').select('id', { count: 'exact' }).eq('tournament_id', tournamentId),
      supabase.from('registrations').select('id', { count: 'exact' }).eq('tournament_id', tournamentId),
      supabase.from('matches').select('id, status', { count: 'exact' }).eq('tournament_id', tournamentId),
    ]);
    const totalMatches    = matches.count || 0;
    const finishedMatches = (matches.data || []).filter(m => m.status === MATCH_STATUS.FINISHED).length;
    return {
      categories:    categories.count  || 0,
      competitors:   competitors.count || 0,
      totalMatches,
      finishedMatches,
      progress: totalMatches > 0 ? Math.round((finishedMatches / totalMatches) * 100) : 0,
    };
  }

  /* --------------------------------------------------------
     ELIMINAR TORNEO (solo en estado borrador)
  -------------------------------------------------------- */
  async function remove(id) {
    if (Auth.isDevMode()) { _devRemove(id); return; }
    const tournament = await getById(id);
    if (tournament.status !== TOURNAMENT_STATUS.DRAFT.id) {
      throw new Error('Solo se pueden eliminar torneos en estado Borrador.');
    }
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  }

  /* ---- Helpers privados ---- */

  function _validate(data) {
    if (!data.name?.trim())   throw new Error('El nombre del torneo es obligatorio.');
    if (!data.date_start)     throw new Error('La fecha de inicio es obligatoria.');
    if (!data.disciplines?.length) throw new Error('Selecciona al menos una disciplina.');
  }

  function _randomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  return {
    create,
    getById,
    listMine,
    listPublic,
    update,
    setStatus,
    generateAccessCode,
    getStats,
    remove,
  };
})();
