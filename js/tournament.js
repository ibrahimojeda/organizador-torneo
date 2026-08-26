/* ============================================================
   TOURNAMENT.JS — CRUD de torneos
   ============================================================ */

if (!window.Tournament) {
  window.Tournament = (() => {

    const TABLE   = 'tournaments';
  const DEV_KEY = 'ot_dev_tournaments';
  const ARCHIVE_KEY = 'ot_archived_tournaments';

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
  function _getArchivedList() {
    try { return JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]'); } catch { return []; }
  }
  function _saveArchivedList(list) { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list)); }

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
      time_start:     data.time_start || '09:00:00',
      category_mode:  data.category_mode || 'age_belt',
      status:         TOURNAMENT_STATUS.DRAFT.id,
      is_public:      true,
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
     LISTAR TODOS LOS TORNEOS (solo super_admin)
  -------------------------------------------------------- */
  async function listAll() {
    if (Auth.isDevMode()) return _devList();
    if (!Auth.isSuperAdmin()) throw new Error('Acceso denegado.');
    const { data, error } = await supabase
      .from(TABLE)
      .select('*, profiles!tournaments_organizer_id_fkey(id, full_name)')
      .order('date_start', { ascending: false });
    if (error) {
      // Fallback sin join si la FK no está nombrada exactamente
      const { data: d2, error: e2 } = await supabase
        .from(TABLE)
        .select('*')
        .order('date_start', { ascending: false });
      if (e2) throw e2;
      return d2 || [];
    }
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
    if (data.disciplines)      payload.disciplines    = data.disciplines;
    if (data.status)           payload.status         = data.status;
    if (data.time_start != null) payload.time_start   = data.time_start;
    if (data.category_mode)    payload.category_mode  = data.category_mode;
    if (Auth.isDevMode()) {
      const updated = _devUpdate(id, payload);
      if ([TOURNAMENT_STATUS.FINISHED.id, TOURNAMENT_STATUS.CANCELLED.id].includes(payload.status)) {
        try { await Auth.deleteJudgeCodesForTournament(id); } catch (_) {}
      }
      return updated;
    }
    const { data: updated, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    if ([TOURNAMENT_STATUS.FINISHED.id, TOURNAMENT_STATUS.CANCELLED.id].includes(payload.status)) {
      try { await Auth.deleteJudgeCodesForTournament(id); } catch (_) {}
    }
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

  async function _listCodesForArchive(tournamentId) {
    if (Auth.isDevMode()) {
      try {
        return JSON.parse(localStorage.getItem('ot_dev_codes') || '[]').filter(c => c.tournament_id === tournamentId);
      } catch {
        return [];
      }
    }
    const { data, error } = await supabase
      .from('tournament_codes')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function _listRegistrationsForArchive(tournamentId) {
    if (Auth.isDevMode()) {
      try {
        return JSON.parse(localStorage.getItem('ot_dev_registrations') || '[]').filter(r => r.tournament_id === tournamentId);
      } catch {
        return [];
      }
    }
    const { data, error } = await supabase
      .from('registrations')
      .select('*')
      .eq('tournament_id', tournamentId);
    if (error) throw error;
    return data || [];
  }

  function _slug(value) {
    return String(value || 'torneo')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'torneo';
  }

  function _downloadFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
    if (typeof document === 'undefined' || typeof Blob === 'undefined') return;
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function _buildArchiveText(archive) {
    const t = archive.tournament || {};
    const lines = [
      'RESUMEN GENERAL DEL TORNEO',
      '===========================',
      `Nombre: ${t.name || 'Torneo'}`,
      `Estado archivado: ${t.status || '—'}`,
      `Fecha inicio: ${t.date_start || '—'}`,
      `Fecha fin: ${t.date_end || '—'}`,
      `Lugar: ${t.location || '—'}`,
      `Disciplinas: ${(t.disciplines || []).join(', ') || '—'}`,
      `Tatamis: ${t.num_tatamis || 1}`,
      `Archivado el: ${archive.archived_at || new Date().toISOString()}`,
      '',
      'ESTADÍSTICAS',
      '============',
      `Categorías: ${archive.stats?.categories || 0}`,
      `Competidores inscritos: ${archive.stats?.competitors || 0}`,
      `Combates: ${archive.stats?.totalMatches || 0}`,
      `Combates finalizados: ${archive.stats?.finishedMatches || 0}`,
      `Progreso: ${archive.stats?.progress || 0}%`,
      '',
      'CATEGORÍAS',
      '==========',
      ...(archive.categories || []).map((cat, index) => `${index + 1}. ${cat.name || cat.discipline || 'Categoría'} · Tatami ${cat.tatami || '—'}`),
      '',
      'COMPETIDORES',
      '============',
      ...(archive.competitors || []).map((comp, index) => `${index + 1}. ${comp.full_name || 'Competidor'} · ${comp.club || 'Sin club'} · Registro ${comp.registration_id || '—'}`),
      '',
      'RESULTADOS',
      '==========',
      ...(archive.matches || []).map((match, index) => {
        const a = match.competitor_a?.competitors?.full_name || match.competitor_a?.full_name || 'Competidor A';
        const b = match.competitor_b?.competitors?.full_name || match.competitor_b?.full_name || '';
        const label = match.bracket_type === 'kata_round' || match.category?.discipline === 'kata' ? a : `${a} vs ${b || 'Competidor B'}`;
        const score = match.score_a != null ? `${match.score_a}${match.score_b != null ? ' - ' + match.score_b : ''}` : '—';
        return `${index + 1}. ${match.category?.name || 'Categoría'} · ${label} · ${score} · ${match.status || '—'}`;
      }),
      '',
      'BITÁCORA RESUMIDA',
      '=================',
      ...(archive.bitacora || []).map((entry, index) => `${index + 1}. [${entry.at || '—'}] ${entry.label || 'Evento'} · ${entry.message || ''}`),
    ];
    return lines.join('\n');
  }

  function _openArchivePdfView(archive, summaryText) {
    if (typeof window === 'undefined') return;
    const popup = window.open('', '_blank', 'width=960,height=720');
    if (!popup) return;
    const safeTitle = String(archive.tournament?.name || 'Torneo').replace(/[<>]/g, '');
    popup.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Archivo ${safeTitle}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111827} h1{margin-top:0} pre{white-space:pre-wrap;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:16px;font-size:12px;line-height:1.5}</style></head><body><h1>Archivo del torneo</h1><p>Usa la opción de imprimir del navegador para guardar este resumen como PDF.</p><pre>${String(summaryText).replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]))}</pre></body></html>`);
    popup.document.close();
  }

  async function buildArchivePackage(tournamentId) {
    const tournament = await getById(tournamentId);
    const [stats, categories, competitors, matches, codes, registrations] = await Promise.all([
      getStats(tournamentId),
      Categories.listByTournament(tournamentId).catch(() => []),
      Competitors.listByTournament(tournamentId).catch(() => []),
      Matches.listByTournament(tournamentId).catch(() => []),
      _listCodesForArchive(tournamentId).catch(() => []),
      _listRegistrationsForArchive(tournamentId).catch(() => []),
    ]);

    return {
      id: tournamentId,
      archived_at: new Date().toISOString(),
      tournament,
      stats,
      categories,
      competitors,
      matches,
      registrations,
      access_codes: codes,
      bitacora: typeof Matches?.buildTournamentBitacora === 'function'
        ? Matches.buildTournamentBitacora(matches)
        : [],
    };
  }

  async function archiveAndDelete(tournamentId) {
    if (!Auth.isSuperAdmin() && !Auth.isDevMode()) {
      throw new Error('Solo el super admin puede archivar y borrar datos.');
    }

    const archive = await buildArchivePackage(tournamentId);
    const archived = _getArchivedList().filter(item => item.id !== tournamentId);
    archived.unshift(archive);
    _saveArchivedList(archived);

    const slug = _slug(archive.tournament?.name || tournamentId);
    const summaryText = _buildArchiveText(archive);
    _downloadFile(`archivo-${slug}.txt`, summaryText);
    _downloadFile(`archivo-${slug}.json`, JSON.stringify(archive, null, 2), 'application/json;charset=utf-8');
    _openArchivePdfView(archive, summaryText);

    if (Auth.isDevMode()) {
      const remainingRegs = JSON.parse(localStorage.getItem('ot_dev_registrations') || '[]').filter(r => r.tournament_id !== tournamentId);
      const remainingMatches = JSON.parse(localStorage.getItem('ot_dev_matches') || '[]').filter(m => m.tournament_id !== tournamentId);
      const remainingCategories = JSON.parse(localStorage.getItem('ot_dev_categories') || '[]').filter(c => c.tournament_id !== tournamentId);
      const remainingCodes = JSON.parse(localStorage.getItem('ot_dev_codes') || '[]').filter(c => c.tournament_id !== tournamentId);
      const usedCompetitors = new Set(remainingRegs.map(r => r.competitor_id));
      const remainingCompetitors = JSON.parse(localStorage.getItem('ot_dev_competitors') || '[]').filter(c => usedCompetitors.has(c.id));
      localStorage.setItem('ot_dev_registrations', JSON.stringify(remainingRegs));
      localStorage.setItem('ot_dev_matches', JSON.stringify(remainingMatches));
      localStorage.setItem('ot_dev_categories', JSON.stringify(remainingCategories));
      localStorage.setItem('ot_dev_codes', JSON.stringify(remainingCodes));
      localStorage.setItem('ot_dev_competitors', JSON.stringify(remainingCompetitors));
      _devRemove(tournamentId);
      return archive;
    }

    const competitorIds = [...new Set((archive.registrations || []).map(r => r.competitor_id).filter(Boolean))];

    let error = null;
    ({ error } = await supabase.from('matches').delete().eq('tournament_id', tournamentId));
    if (error) throw error;

    ({ error } = await supabase.from('tournament_codes').delete().eq('tournament_id', tournamentId));
    if (error) throw error;

    ({ error } = await supabase.from('registrations').delete().eq('tournament_id', tournamentId));
    if (error) throw error;

    ({ error } = await supabase.from('categories').delete().eq('tournament_id', tournamentId));
    if (error) throw error;

    for (const competitorId of competitorIds) {
      const { count, error: countError } = await supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('competitor_id', competitorId);
      if (countError) throw countError;
      if ((count || 0) === 0) {
        const { error: competitorError } = await supabase.from('competitors').delete().eq('id', competitorId);
        if (competitorError) throw competitorError;
      }
    }

    ({ error } = await supabase.from(TABLE).delete().eq('id', tournamentId));
    if (error) throw error;

    return archive;
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
    listAll,
    listPublic,
    update,
    setStatus,
    generateAccessCode,
    getStats,
    buildArchivePackage,
    archiveAndDelete,
    remove,
  };
})();
}
