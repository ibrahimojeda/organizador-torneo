/* ============================================================
   MATCHES.JS — Ingreso y gestión de resultados
   ============================================================ */

const Matches = (() => {

  const TABLE   = 'matches';
  const DEV_KEY = 'ot_dev_matches'; // Shared with bracket.js

  /* ---- localStorage helpers (modo dev) ---- */
  function _devList()    { try { return JSON.parse(localStorage.getItem(DEV_KEY) || '[]'); } catch { return []; } }
  function _devSave(l)   { localStorage.setItem(DEV_KEY, JSON.stringify(l)); }
  function _devGetById(id) { return _devList().find(m => m.id === id) || null; }
  function _devUpdate(id, payload) {
    const list = _devList();
    const idx  = list.findIndex(m => m.id === id);
    if (idx === -1) throw new Error('Combate no encontrado.');
    list[idx] = { ...list[idx], ...payload };
    _devSave(list);
    return list[idx];
  }

  /* --------------------------------------------------------
     REGISTRAR RESULTADO DE UN COMBATE
     Actualiza el ganador, score y estado.
     Avanza el ganador al siguiente combate automáticamente.
     @param {string} matchId
     @param {object} result - { winner_id, score_a, score_b, notes }
  -------------------------------------------------------- */
  async function recordResult(matchId, result) {
    _validateResult(result);

    const match = await getById(matchId);
    if (match.status === MATCH_STATUS.FINISHED) {
      throw new Error('Este combate ya fue finalizado. Edita el resultado si necesitas corregirlo.');
    }

    const payload = {
      winner_id:   result.winner_id,
      score_a:     result.score_a ?? null,
      score_b:     result.score_b ?? null,
      notes:       result.notes   || null,
      status:      MATCH_STATUS.FINISHED,
      finished_at: new Date().toISOString(),
    };

    let updated;
    if (Auth.isDevMode()) {
      updated = _devUpdate(matchId, payload);
      // Notificar a otras pestañas (admin, public) en tiempo real
      try {
        const ch = new BroadcastChannel('ot_matches_' + (updated.tournament_id || match.tournament_id));
        ch.postMessage({ type: 'result', matchId });
        setTimeout(() => ch.close(), 500);
      } catch (_) {}
    } else {
      const { data, error } = await supabase
        .from(TABLE)
        .update(payload)
        .eq('id', matchId)
        .select()
        .single();
      if (error) throw error;
      updated = data;
    }

    await Bracket.advanceWinner(updated, result.winner_id);

    // Detectar si la categoría terminó y calcular podio
    if (updated.category_id) {
      Bracket.checkAndSavePodio(updated.category_id).catch(() => {});
    }

    return updated;
  }

  /* --------------------------------------------------------
     CORREGIR RESULTADO (solo organizador)
     Permite cambiar el resultado de un combate ya finalizado.
     Advierte si ya hay rondas posteriores afectadas.
  -------------------------------------------------------- */
  async function correctResult(matchId, result) {
    _validateResult(result);

    const match = await getById(matchId);
    const affected = await _checkSubsequentMatches(match);
    if (affected.length > 0) {
      throw new Error(
        `Corrección bloqueada: hay ${affected.length} combate(s) posterior(es) que ya usaron este resultado. ` +
        'Debes anular esos combates primero.'
      );
    }

    return recordResult(matchId, result);
  }

  /* --------------------------------------------------------
     OBTENER COMBATE POR ID
  -------------------------------------------------------- */
  async function getById(id) {
    if (Auth.isDevMode()) {
      const m = _devGetById(id);
      if (!m) throw new Error('Combate no encontrado.');
      return m;
    }
    const { data, error } = await supabase
      .from(TABLE)
      .select(`
        *,
        category:categories(id, name, discipline, bracket_system, tournament_id),
        competitor_a:registrations!matches_competitor_a_id_fkey(
          id, seed, competitors(id, full_name, club, photo_url)
        ),
        competitor_b:registrations!matches_competitor_b_id_fkey(
          id, seed, competitors(id, full_name, club, photo_url)
        ),
        winner:registrations!matches_winner_id_fkey(
          id, competitors(id, full_name)
        )
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  /* --------------------------------------------------------
     LISTAR COMBATES PENDIENTES DE UN TATAMI
     Útil para que el árbitro vea su cola de combates.
     Incluye combates de kata (solo tienen competitor_a).
     @param {string} tournamentId
     @param {string|number} tatami
  -------------------------------------------------------- */
  async function listPendingByTatami(tournamentId, tatami) {
    if (Auth.isDevMode()) {
      return _devList().filter(m =>
        m.tournament_id === tournamentId &&
        (m.status === MATCH_STATUS.PENDING || m.status === MATCH_STATUS.ONGOING) &&
        m.competitor_a_id &&
        (m.tatami == tatami || (m.bracket_type === 'kata_round' && !m.tatami))
      );
    }
    const { data, error } = await supabase
      .from(TABLE)
      .select(`
        id, round, round_label, position, status, scheduled_time, tatami, bracket_type,
        competitor_a:registrations!matches_competitor_a_id_fkey(
          competitors(full_name, club)
        ),
        competitor_b:registrations!matches_competitor_b_id_fkey(
          competitors(full_name, club)
        ),
        category:categories(name, discipline)
      `)
      .eq('tournament_id', tournamentId)
      .in('status', [MATCH_STATUS.PENDING, MATCH_STATUS.ONGOING])
      .not('competitor_a_id', 'is', null)
      .or(`tatami.eq.${tatami},bracket_type.eq.kata_round`)
      .order('scheduled_time', { nullsFirst: true })
      .order('round');
    if (error) throw error;
    return data || [];
  }

  /* --------------------------------------------------------
     LISTAR TODOS LOS COMBATES DE UN TORNEO
  -------------------------------------------------------- */
  async function listByTournament(tournamentId) {
    if (Auth.isDevMode()) {
      return _devList().filter(m => m.tournament_id === tournamentId);
    }
    const { data, error } = await supabase
      .from(TABLE)
      .select(`
        id, round, round_label, position, status, score_a, score_b, tatami, scheduled_time,
        competitor_a:registrations!matches_competitor_a_id_fkey(
          competitors(full_name, club)
        ),
        competitor_b:registrations!matches_competitor_b_id_fkey(
          competitors(full_name, club)
        ),
        winner:registrations!matches_winner_id_fkey(
          competitors(full_name)
        ),
        category:categories(name, discipline)
      `)
      .eq('tournament_id', tournamentId)
      .order('category_id')
      .order('round')
      .order('position');
    if (error) throw error;
    return data || [];
  }

  /* --------------------------------------------------------
     ASIGNAR TATAMI Y HORA A UN COMBATE
  -------------------------------------------------------- */
  async function assignSchedule(matchId, tatami, scheduledTime) {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ tatami, scheduled_time: scheduledTime || null })
      .eq('id', matchId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /* --------------------------------------------------------
     MARCAR COMBATE COMO "EN PROGRESO"
  -------------------------------------------------------- */
  async function startMatch(matchId) {
    if (Auth.isDevMode()) {
      return _devUpdate(matchId, { status: MATCH_STATUS.ONGOING, started_at: new Date().toISOString() });
    }
    const { data, error } = await supabase
      .from(TABLE)
      .update({ status: MATCH_STATUS.ONGOING, started_at: new Date().toISOString() })
      .eq('id', matchId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /* --------------------------------------------------------
     SUSCRIPCIÓN EN TIEMPO REAL (Supabase Realtime)
     Llama a callback cada vez que cambia un combate del torneo.
     @param {string} tournamentId
     @param {function} callback
     @returns {object} Subscription (para poder cancelarla)
  -------------------------------------------------------- */
  function subscribeToTournament(tournamentId, callback) {
    if (Auth.isDevMode()) {
      // En modo dev usamos BroadcastChannel para notificar a otras pestañas
      let channel = null;
      try {
        channel = new BroadcastChannel('ot_matches_' + tournamentId);
        channel.onmessage = () => callback({ type: 'dev' });
      } catch (_) {}
      return {
        unsubscribe: () => { try { channel?.close(); } catch(_){} }
      };
    }
    return supabase
      .channel(`matches:tournament_id=eq.${tournamentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE, filter: `tournament_id=eq.${tournamentId}` },
        payload => callback(payload)
      )
      .subscribe();
  }

  /* --------------------------------------------------------
     CALCULAR RESULTADOS FINALES DE ROUND-ROBIN
     Genera la tabla de posiciones a partir de los combates cargados.
     @param {object[]} matches - Combates de la categoría (ya cargados)
     @returns {object[]} Clasificación ordenada
  -------------------------------------------------------- */

  /* --------------------------------------------------------
     LISTAR COMBATES DE UNA CATEGORÍA
  -------------------------------------------------------- */
  async function listByCategory(categoryId) {
    if (Auth.isDevMode()) {
      return _devList()
        .filter(m => m.category_id === categoryId)
        .sort((a, b) => (a.round - b.round) || (a.position - b.position));
    }
    const { data, error } = await supabase
      .from(TABLE)
      .select(`
        *,
        competitor_a:registrations!matches_competitor_a_id_fkey(
          id, seed, competitors(id, full_name, club, photo_url)
        ),
        competitor_b:registrations!matches_competitor_b_id_fkey(
          id, seed, competitors(id, full_name, club, photo_url)
        ),
        winner:registrations!matches_winner_id_fkey(
          id, competitors(id, full_name)
        )
      `)
      .eq('category_id', categoryId)
      .order('round')
      .order('position');
    if (error) throw error;
    return data || [];
  }

  /* --------------------------------------------------------
     LISTAR COMBATES CON HORARIO ASIGNADO (PROGRAMA DEL DÍA)
  -------------------------------------------------------- */
  async function listScheduled(tournamentId) {
    if (Auth.isDevMode()) {
      return _devList()
        .filter(m => m.tournament_id === tournamentId && m.scheduled_time)
        .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
    }
    const { data, error } = await supabase
      .from(TABLE)
      .select(`
        id, round, status, scheduled_time, tatami,
        competitor_a:registrations!matches_competitor_a_id_fkey(
          competitors(full_name, club)
        ),
        competitor_b:registrations!matches_competitor_b_id_fkey(
          competitors(full_name, club)
        ),
        category:categories(name, discipline)
      `)
      .eq('tournament_id', tournamentId)
      .not('scheduled_time', 'is', null)
      .order('scheduled_time');
    if (error) throw error;
    return data || [];
  }

  /* --------------------------------------------------------
     CALCULAR RESULTADOS FINALES DE ROUND-ROBIN
     Genera la tabla de posiciones a partir de los combates cargados.
     @param {object[]} matches - Combates de la categoría (ya cargados)
     @returns {object[]} Clasificación ordenada
  -------------------------------------------------------- */
  function getRoundRobinStandings(matches) {
    const standings = {};

    for (const m of (matches || [])) {
      if (!standings[m.competitor_a_id]) standings[m.competitor_a_id] = { wins: 0, losses: 0, played: 0 };
      if (m.competitor_b_id && !standings[m.competitor_b_id]) standings[m.competitor_b_id] = { wins: 0, losses: 0, played: 0 };

      if (m.status === MATCH_STATUS.FINISHED && m.winner_id) {
        const loserId = m.winner_id === m.competitor_a_id ? m.competitor_b_id : m.competitor_a_id;
        if (standings[m.winner_id])  { standings[m.winner_id].wins++;  standings[m.winner_id].played++;  }
        if (loserId && standings[loserId]) { standings[loserId].losses++; standings[loserId].played++; }
      }
    }

    return Object.entries(standings)
      .map(([regId, stats]) => ({ registration_id: regId, ...stats }))
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  }

  /* ---- Helpers privados ---- */

  function _validateResult(result) {
    if (!result.winner_id) throw new Error('Debes indicar el ganador del combate.');
  }

  async function _checkSubsequentMatches(match) {
    // Busca si el ganador ya está asignado en combates de rondas posteriores
    const { data } = await supabase
      .from(TABLE)
      .select('id, status')
      .eq('category_id', match.category_id)
      .gt('round', match.round)
      .eq('status', MATCH_STATUS.FINISHED);
    return data || [];
  }

  return {
    recordResult,
    correctResult,
    getById,
    listPendingByTatami,
    listByTournament,
    listByCategory,
    listScheduled,
    assignSchedule,
    startMatch,
    subscribeToTournament,
    getRoundRobinStandings,
  };
})();
