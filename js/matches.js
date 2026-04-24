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

  const _WARN_LABELS = ['', 'Chukoku', 'Keikoku', 'Hansoku-chui', 'Hansoku'];
  const _WARN_PTS    = [0, 0, 1, 2];

  function _ensureSupabaseClient() {
    if (Auth.isDevMode()) return true;
    if (typeof supabase !== 'undefined' && supabase && typeof supabase.from === 'function') return true;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
    if (typeof window === 'undefined' || !window.supabase || typeof window.supabase.createClient !== 'function') return false;
    try {
      window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return !!(window.supabase && typeof window.supabase.from === 'function');
    } catch (_) {
      return false;
    }
  }

  function _broadcastTournamentUpdate(tournamentId, type = 'sync', matchId = null) {
    try {
      const ch = new BroadcastChannel('ot_matches_' + tournamentId);
      ch.postMessage({ type, matchId, at: new Date().toISOString() });
      setTimeout(() => ch.close(), 500);
    } catch (_) {}
  }

  function _parseNotes(notes) {
    if (!notes) return {};
    if (typeof notes === 'object') return notes;
    try {
      return JSON.parse(notes);
    } catch {
      return { text: String(notes) };
    }
  }

  function _serializeNotes(notes) {
    if (notes == null) return null;
    return typeof notes === 'string' ? notes : JSON.stringify(notes);
  }

  function _pushBitacoraEntry(notes, entry = null) {
    if (!entry) return notes;
    const list = Array.isArray(notes?.bitacora) ? [...notes.bitacora] : [];
    const normalized = {
      id: entry.id || ('bit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)),
      type: entry.type || 'evento',
      label: entry.label || 'Evento',
      message: entry.message || '',
      actor: entry.actor || null,
      seat: entry.seat || null,
      side: entry.side || null,
      action: entry.action || null,
      at: entry.at || new Date().toISOString(),
    };
    const last = list[list.length - 1];
    if (last && last.type === normalized.type && last.message === normalized.message && last.seat === normalized.seat) {
      return { ...(notes || {}), bitacora: list };
    }
    list.push(normalized);
    return { ...(notes || {}), bitacora: list.slice(-120) };
  }

  function _emptyLiveState() {
    return {
      version: 1,
      updated_at: null,
      referee_sessions: {},
      judge_access: {},
      kata: { judges: {}, referees: {} },
      kumite: {
        events: [],
        pending_signals: [],
        last_decision: null,
        winner: null,
        senshu: null,
        clock_seconds: 180,
        clock_remaining: 180,
        clock_running: false,
        score_a: 0,
        score_b: 0,
        hist_a: [],
        hist_b: [],
        warn_a: { c1: 0, c2: 0 },
        warn_b: { c1: 0, c2: 0 },
        referees: {},
      },
    };
  }

  function _normalizeKataScore(rawScore) {
    if (rawScore == null || rawScore === '') return null;
    const normalizedText = String(rawScore).replace(',', '.').trim();
    if (!/^\d(?:\.\d{1,2})?$/.test(normalizedText)) {
      throw new Error('La nota de kata debe ser un numero entre 0.00 y 9.99.');
    }
    const numericScore = Number(normalizedText);
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 9.99) {
      throw new Error('La nota de kata debe estar entre 0.00 y 9.99.');
    }
    return Number(numericScore.toFixed(2));
  }

  function _buildKataSummaryFromScores(scoresBySeat = {}, options = {}) {
    const seats = ['J1', 'J2', 'J3', 'J4', 'J5'];
    const judges = seats.map((seat) => {
      const scoreValue = scoresBySeat?.[seat];
      return {
        seat,
        judge_name: options.judgeNameBySeat?.[seat] || options.judgeName || 'Pendiente',
        score: Number.isFinite(Number(scoreValue)) ? Number(scoreValue) : null,
        submitted_at: options.submittedAt || null,
      };
    });

    const validScores = judges.filter(j => Number.isFinite(j.score)).map(j => Number(j.score));
    const sorted  = [...validScores].sort((a, b) => a - b);
    const trimmed = sorted.length >= 5 ? sorted.slice(1, -1) : sorted;
    const total   = trimmed.length ? Number(trimmed.reduce((sum, value) => sum + value, 0).toFixed(2)) : null;

    return {
      judges,
      submitted: validScores.length,
      ready: validScores.length >= 5,
      total,
      dropped_low: sorted.length >= 5 ? sorted[0] : null,
      dropped_high: sorted.length >= 5 ? sorted[sorted.length - 1] : null,
    };
  }

  function _deriveKumiteBoardFromEvents(live) {
    const events = Array.isArray(live.kumite?.events) ? live.kumite.events : [];
    const board = {
      scoreA: 0,
      scoreB: 0,
      histA: [],
      histB: [],
      warnA: { c1: 0, c2: 0 },
      warnB: { c1: 0, c2: 0 },
    };

    for (const evt of events) {
      const side = evt.side === 'b' ? 'b' : 'a';
      const opp  = side === 'a' ? 'b' : 'a';
      const sideKey = side === 'a' ? 'A' : 'B';
      const oppKey  = opp === 'a' ? 'A' : 'B';
      const seatLbl = evt.seat ? ' · ' + evt.seat : '';

      if (evt.kind === 'point') {
        const pts = { yuko: 1, wazaari: 2, ippon: 3 }[evt.action] || 0;
        board['score' + sideKey] += pts;
        board['hist' + sideKey].push((evt.action || 'punto').toUpperCase() + seatLbl);
        continue;
      }

      if (evt.kind === 'penalty') {
        const warnBucket = board['warn' + sideKey];
        const penaltyCat = evt.category === 'c2' ? 'c2' : 'c1';
        const prev       = warnBucket[penaltyCat] || 0;
        const level      = Math.min(4, prev + 1);
        warnBucket[penaltyCat] = level;
        const label = _WARN_LABELS[level] || 'Hansoku';

        if (level !== 4) {
          const pts = _WARN_PTS[level] || 0;
          if (pts > 0) {
            board['score' + oppKey] += pts;
            board['hist' + oppKey].push('+' + pts + ' ' + label + seatLbl);
          }
        }
        board['hist' + sideKey].push(label + '(' + penaltyCat.toUpperCase() + ')' + seatLbl);
      }
    }

    return board;
  }

  function getLiveState(matchOrNotes) {
    const parsed = _parseNotes(matchOrNotes?.notes ?? matchOrNotes);
    const live   = parsed.live || {};
    return {
      ..._emptyLiveState(),
      ...live,
      referee_sessions: { ...(live.referee_sessions || {}) },
      kata: {
        ..._emptyLiveState().kata,
        ...(live.kata || {}),
        judges: { ...(live.kata?.judges || {}) },
        referees: { ...(live.kata?.referees || {}) },
      },
      judge_access: { ...(live.judge_access || {}) },
      kumite: {
        ..._emptyLiveState().kumite,
        ...(live.kumite || {}),
        events: Array.isArray(live.kumite?.events) ? [...live.kumite.events] : [],
        pending_signals: Array.isArray(live.kumite?.pending_signals) ? [...live.kumite.pending_signals] : [],
        referees: { ...(live.kumite?.referees || {}) },
      },
    };
  }

  function isJudgeActive(entry, maxAgeMs = 90000) {
    if (!entry) return false;
    const stamp = entry.updated_at || entry.submitted_at || entry.at || null;
    if (!stamp) return true;
    const age = Date.now() - new Date(stamp).getTime();
    return Number.isFinite(age) ? age <= maxAgeMs : true;
  }

  function getRefereePresence(matchOrNotes, discipline = 'kumite') {
    const live = getLiveState(matchOrNotes);
    const presence = {};

    Object.entries(live?.[discipline]?.referees || {}).forEach(([seat, entry]) => {
      presence[seat] = { ...entry, seat };
    });

    Object.values(live?.referee_sessions || {}).forEach(entry => {
      if (!entry?.seat) return;
      const sessionDiscipline = entry.discipline === 'kata' ? 'kata' : 'kumite';
      if (sessionDiscipline !== discipline) return;
      presence[entry.seat] = { ...(presence[entry.seat] || {}), ...entry, seat: entry.seat };
    });

    Object.values(presence).forEach(entry => {
      entry.active = isJudgeActive(entry);
    });

    return presence;
  }

  function _isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function _mergeNestedObjects(base, incoming) {
    if (!_isPlainObject(base)) return _isPlainObject(incoming) ? { ...incoming } : incoming;
    if (!_isPlainObject(incoming)) return incoming;

    const merged = { ...base };
    Object.entries(incoming).forEach(([key, value]) => {
      if (_isPlainObject(value) && _isPlainObject(merged[key])) {
        merged[key] = _mergeNestedObjects(merged[key], value);
        return;
      }
      merged[key] = value;
    });
    return merged;
  }

  function _mergeResultNotes(existingNotes, incomingNotes) {
    const base = _parseNotes(existingNotes);
    if (incomingNotes == null) return Object.keys(base).length ? _serializeNotes(base) : null;

    if (typeof incomingNotes === 'string') {
      const parsedIncoming = _parseNotes(incomingNotes);
      const isStructured = parsedIncoming && typeof parsedIncoming === 'object' &&
        (Object.keys(parsedIncoming).some(k => k !== 'text') || incomingNotes.trim().startsWith('{'));
      if (isStructured) {
        const merged = { ...base, ...parsedIncoming };
        if (_isPlainObject(base.live) || _isPlainObject(parsedIncoming.live)) {
          merged.live = _mergeNestedObjects(base.live || {}, parsedIncoming.live || {});
        }
        return _serializeNotes(merged);
      }
      return _serializeNotes({ ...base, text: incomingNotes });
    }

    const merged = { ...base, ...incomingNotes };
    if (_isPlainObject(base.live) || _isPlainObject(incomingNotes.live)) {
      merged.live = _mergeNestedObjects(base.live || {}, incomingNotes.live || {});
    }
    return _serializeNotes(merged);
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

    const normalizedScoreA = (result.score_a === '' || result.score_a == null)
      ? null
      : (Number.isFinite(Number(result.score_a)) ? Number(result.score_a) : null);
    const normalizedScoreB = (result.score_b === '' || result.score_b == null)
      ? null
      : (Number.isFinite(Number(result.score_b)) ? Number(result.score_b) : null);

    const match = await getById(matchId);
    if (match.status === MATCH_STATUS.FINISHED) {
      throw new Error('Este combate ya fue finalizado. Edita el resultado si necesitas corregirlo.');
    }

    const mergedNotes = _parseNotes(_mergeResultNotes(match.notes, result.notes));
    const winnerName = result.winner_id === match.competitor_a_id
      ? (match.competitor_a?.competitors?.full_name || match.competitor_a?.full_name || 'Competidor A')
      : (match.competitor_b?.competitors?.full_name || match.competitor_b?.full_name || 'Competidor B');
    const payload = {
      winner_id:   result.winner_id,
      score_a:     normalizedScoreA,
      score_b:     normalizedScoreB,
      notes:       _serializeNotes(_pushBitacoraEntry(mergedNotes, {
        type: 'resultado',
        label: 'Resultado confirmado',
        message: `Resultado oficial registrado. Ganador: ${winnerName}.`,
      })),
      status:      MATCH_STATUS.FINISHED,
      finished_at: new Date().toISOString(),
    };

    const _scoreEquals = (left, right) => {
      if (left == null && right == null) return true;
      if (left == null || right == null) return false;
      return Number(left) === Number(right);
    };

    const _isIntegerSyntaxError = (err) => {
      const code = String(err?.code || '');
      const msg = String(err?.message || '');
      return code === '22P02' || /invalid input syntax for type integer/i.test(msg);
    };

    let updated;
    if (Auth.isDevMode()) {
      updated = _devUpdate(matchId, payload);
      _broadcastTournamentUpdate(updated.tournament_id || match.tournament_id, 'result', matchId);
    } else {
      if (!_ensureSupabaseClient()) {
        throw new Error('No se pudo establecer conexión con Supabase para guardar el resultado.');
      }
      const { data, error } = await supabase
        .from(TABLE)
        .update(payload)
        .eq('id', matchId)
        .select();
      if (error) {
        const hasDecimalScore =
          (normalizedScoreA != null && !Number.isInteger(Number(normalizedScoreA))) ||
          (normalizedScoreB != null && !Number.isInteger(Number(normalizedScoreB)));
        if (_isIntegerSyntaxError(error) && hasDecimalScore) {
          throw new Error(
            'Tu BD tiene score_a/score_b como INTEGER y kata usa decimales. Migra ambas columnas a NUMERIC(6,2) en Supabase para registrar puntajes como 16.70.'
          );
        }
        throw error;
      }
      const updatedCount = Array.isArray(data) ? data.length : 0;
      const updatedRow = Array.isArray(data) ? data[0] : null;
      const { data: persistedRow, error: persistedErr } = await supabase
        .from(TABLE)
        .select('id, tournament_id, category_id, status, winner_id, score_a, score_b, finished_at, notes')
        .eq('id', matchId)
        .maybeSingle();
      // Si la política RLS permite UPDATE pero restringe SELECT tras finalizar,
      // no bloqueamos el flujo de mesa técnica por la verificación posterior.
      const readBlockedByRls = !!(
        persistedErr &&
        (String(persistedErr.code || '') === '42501'
          || /permission denied|not allowed|forbidden|rls/i.test(String(persistedErr.message || '')))
      );
      if (persistedErr && !readBlockedByRls) throw persistedErr;
      const persisted = persistedRow || null;
      const statusConfirmed = !!(persisted && persisted.status === MATCH_STATUS.FINISHED);
      const winnerConfirmed = !!(
        persisted && String(persisted.winner_id || '') === String(result.winner_id || '')
      );
      const scoreConfirmed = !!(
        persisted &&
        _scoreEquals(persisted.score_a, normalizedScoreA) &&
        _scoreEquals(persisted.score_b, normalizedScoreB)
      );
      const confirmed = !!(
        persisted &&
        statusConfirmed &&
        winnerConfirmed &&
        scoreConfirmed
      );

      if (!readBlockedByRls && updatedCount === 0 && (!persisted || persisted.status !== MATCH_STATUS.FINISHED)) {
        throw new Error(
          'Supabase rechazo el UPDATE del resultado final (0 filas afectadas). Revisa politicas RLS de UPDATE/USING/WITH CHECK en matches.'
        );
      }

      // Si podemos leer fila y no aparece en finished, no bloqueamos Mesa:
      // algunas instalaciones aplican reglas/triggers asincrónicos o réplicas con retraso.
      if (persisted && !statusConfirmed) {
        try {
          console.warn('[Matches.recordResult] Estado no confirmado como finished en post-lectura', {
            matchId,
            readStatus: persisted.status,
            expectedStatus: MATCH_STATUS.FINISHED,
          });
        } catch (_) {}
      }

      // Si queda en finished pero hay diferencias de winner/score, no bloqueamos:
      // algunas instalaciones normalizan campos con triggers o reglas de negocio.
      if (persisted && statusConfirmed && !confirmed) {
        try {
          console.warn('[Matches.recordResult] Resultado persistido con normalización distinta', {
            sent: { winner_id: result.winner_id, score_a: normalizedScoreA, score_b: normalizedScoreB },
            got: { winner_id: persisted.winner_id, score_a: persisted.score_a, score_b: persisted.score_b },
          });
        } catch (_) {}
      }

      // Caso B: no se pudo verificar por bloqueo de lectura (RLS) => continuar con snapshot optimista.
      if (!persisted && readBlockedByRls) {
        updated = { ...match, ...payload, id: matchId };
      } else {
        updated = persisted || updatedRow || { ...match, ...payload, id: matchId };
      }

      // Asegurar campos estructurales para lógica de avance de llaves.
      // Si la post-lectura devuelve columnas parciales por políticas RLS,
      // conservamos round/position/bracket_type del snapshot original.
      updated = {
        ...match,
        ...updated,
        id: matchId,
      };
    }

    // Sincronización inmediata entre pestañas (admin/public/mesa)
    // incluso cuando Supabase Realtime esté lento o no disponible.
    _broadcastTournamentUpdate(updated.tournament_id || match.tournament_id, 'result', matchId);

    const canAdvanceBracket = Number.isFinite(Number(updated?.round)) && Number.isFinite(Number(updated?.position));
    if (canAdvanceBracket) {
      await Bracket.advanceWinner(updated, result.winner_id);
    } else {
      try {
        console.warn('[Matches.recordResult] Se omite avance de llave por round/position inválidos', {
          matchId,
          round: updated?.round,
          position: updated?.position,
        });
      } catch (_) {}
    }

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
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Combate no encontrado o sin acceso disponible.');
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
    const tatamiStr = String(tatami);

    if (Auth.isDevMode()) {
      const categories = await Categories.listByTournament(tournamentId).catch(() => []);
      const categoryTatamiMap = Object.fromEntries((categories || []).map(c => [c.id, c.tatami]));
      return _devList().filter(m => {
        const assignedTatami = m.tatami ?? categoryTatamiMap[m.category_id] ?? null;
        return m.tournament_id === tournamentId &&
          (m.status === MATCH_STATUS.PENDING || m.status === MATCH_STATUS.ONGOING) &&
          m.competitor_a_id &&
          String(assignedTatami) === tatamiStr;
      });
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
        category:categories(id, name, discipline, tatami)
      `)
      .eq('tournament_id', tournamentId)
      .in('status', [MATCH_STATUS.PENDING, MATCH_STATUS.ONGOING])
      .not('competitor_a_id', 'is', null)
      .order('scheduled_time', { nullsFirst: true })
      .order('round');

    if (error) throw error;
    return (data || []).filter(m => String(m.tatami ?? m.category?.tatami ?? '') === tatamiStr);
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
        id, category_id, round, round_label, position, bracket_type, status, score_a, score_b, winner_id, competitor_a_id, competitor_b_id, tatami, scheduled_time, finished_at, notes,
        competitor_a:registrations!matches_competitor_a_id_fkey(
          competitors(full_name, club)
        ),
        competitor_b:registrations!matches_competitor_b_id_fkey(
          competitors(full_name, club)
        ),
        winner:registrations!matches_winner_id_fkey(
          competitors(full_name)
        ),
        category:categories(id, name, discipline, tatami)
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
    const payload = { tatami, scheduled_time: scheduledTime || null };
    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', matchId)
      .select();
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : null;
    return row || { id: matchId, ...payload };
  }

  /* --------------------------------------------------------
     MARCAR COMBATE COMO "EN PROGRESO"
  -------------------------------------------------------- */
  async function startMatch(matchId) {
    const payload = { status: MATCH_STATUS.ONGOING, started_at: new Date().toISOString() };
    if (Auth.isDevMode()) {
      const updated = _devUpdate(matchId, payload);
      _broadcastTournamentUpdate(updated.tournament_id, 'start', matchId);
      return updated;
    }
    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', matchId)
      .select();
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : null;
    return row || { id: matchId, ...payload };
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
        channel.onmessage = (event) => callback(event?.data || { type: 'dev' });
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
     ACTUALIZAR ESTADO DE JUECES EN VIVO
     Persiste notas y señales de kata/kumite por árbitro.
  -------------------------------------------------------- */
  async function updateLiveState(matchId, updater, options = {}) {
    let lastSnapshot = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const match = await getById(matchId);
      lastSnapshot = match;
      const live  = getLiveState(match);
      const clone = typeof structuredClone === 'function'
        ? structuredClone(live)
        : JSON.parse(JSON.stringify(live));
      const nextLive = typeof updater === 'function'
        ? (updater(clone, match) || clone)
        : { ...clone, ...(updater || {}) };

      const parsedBase = _parseNotes(match.notes);
      const nextEntry = typeof options.logEntry === 'function'
        ? options.logEntry(nextLive, match)
        : options.logEntry;
      const notesPayload = _pushBitacoraEntry({
        ...parsedBase,
        text: options.text ?? parsedBase.text ?? null,
        live: {
          ...nextLive,
          updated_at: new Date().toISOString(),
        },
      }, nextEntry);

      const payload = {
        notes: _serializeNotes(notesPayload),
        status: match.status === MATCH_STATUS.PENDING ? MATCH_STATUS.ONGOING : match.status,
        started_at: match.started_at || new Date().toISOString(),
      };

      if (Auth.isDevMode()) {
        const updated = _devUpdate(matchId, payload);
        _broadcastTournamentUpdate(updated.tournament_id || match.tournament_id, 'live', matchId);
        return updated;
      }

      let query = supabase
        .from(TABLE)
        .update(payload)
        .eq('id', matchId);

      if (match.notes == null) query = query.is('notes', null);
      else query = query.eq('notes', match.notes);

      const { data, error } = await query.select();
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (row) return row;
    }

    if (!Auth.isDevMode() && lastSnapshot) {
      const live = getLiveState(lastSnapshot);
      const clone = typeof structuredClone === 'function'
        ? structuredClone(live)
        : JSON.parse(JSON.stringify(live));
      const nextLive = typeof updater === 'function'
        ? (updater(clone, lastSnapshot) || clone)
        : { ...clone, ...(updater || {}) };
      const parsedBase = _parseNotes(lastSnapshot.notes);
      const nextEntry = typeof options.logEntry === 'function'
        ? options.logEntry(nextLive, lastSnapshot)
        : options.logEntry;
      const notesPayload = _pushBitacoraEntry({
        ...parsedBase,
        text: options.text ?? parsedBase.text ?? null,
        live: {
          ...nextLive,
          updated_at: new Date().toISOString(),
        },
      }, nextEntry);

      const payload = {
        notes: _serializeNotes(notesPayload),
        status: lastSnapshot.status === MATCH_STATUS.PENDING ? MATCH_STATUS.ONGOING : lastSnapshot.status,
        started_at: lastSnapshot.started_at || new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from(TABLE)
        .update(payload)
        .eq('id', matchId)
        .select();
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) {
        throw new Error('Supabase no permitio guardar el estado en vivo del combate (0 filas afectadas por RLS).');
      }
      return row;
    }

    throw new Error('No se pudo guardar el estado en vivo del combate.');
  }

  async function registerReferee(matchId, refereeInfo = {}) {
    const match = await getById(matchId);
    const live  = getLiveState(match);
    const discipline = refereeInfo.discipline === 'kata' ? 'kata' : 'kumite';
    const seat       = refereeInfo.seat || 'J1';
    const existingSeat = getRefereePresence(match, discipline)?.[seat];

    if (existingSeat && existingSeat.active) {
      const sameJudge = (existingSeat.code && existingSeat.code === refereeInfo.code)
        || (existingSeat.name && existingSeat.name === refereeInfo.name);
      if (!sameJudge) {
        throw new Error('Ese puesto ya fue seleccionado por otro juez.');
      }
    }

    return updateLiveState(matchId, (nextLive) => {
      const entry = {
        code: refereeInfo.code || null,
        name: refereeInfo.name || 'Juez',
        seat,
        tatami: refereeInfo.tatami || null,
        discipline,
        updated_at: new Date().toISOString(),
      };
      nextLive.referee_sessions[discipline + ':' + seat] = entry;
      nextLive[discipline].referees = { ...(nextLive[discipline].referees || {}), [seat]: entry };
      return nextLive;
    }, {
      logEntry: {
        type: 'conexion',
        label: 'Juez conectado',
        seat,
        actor: refereeInfo.name || 'Juez',
        message: `${refereeInfo.name || 'Juez'} se conectó en ${seat} para ${discipline}.`,
      },
    });
  }

  async function saveKataJudgeScore(matchId, judgeInfo = {}, score) {
    const normalizedScore = _normalizeKataScore(score);
    return updateLiveState(matchId, (live) => {
      const seat = judgeInfo.seat || 'J1';
      live.kata.judges = {
        ...(live.kata.judges || {}),
        [seat]: {
          seat,
          judge_name: judgeInfo.name || 'Árbitro',
          code: judgeInfo.code || null,
          tatami: judgeInfo.tatami || null,
          score: normalizedScore,
          submitted_at: new Date().toISOString(),
        },
      };
      return live;
    }, {
      logEntry: {
        type: 'kata_score',
        label: 'Nota de kata',
        seat: judgeInfo.seat || 'J1',
        actor: judgeInfo.name || 'Juez',
        message: `${judgeInfo.name || 'Juez'} registró ${normalizedScore.toFixed(2)} en ${(judgeInfo.seat || 'J1')}.`,
      },
    });
  }

  async function saveKataJudgeScores(matchId, scores = {}, judgeInfo = {}) {
    return applyMesaKataOverride(matchId, scores, judgeInfo);
  }

  async function applyMesaKataOverride(matchId, scores = {}, mesaInfo = {}) {
    const seats = ['J1', 'J2', 'J3', 'J4', 'J5'];
    const normalized = {};
    for (const seat of seats) {
      normalized[seat] = _normalizeKataScore(scores?.[seat]);
      if (!Number.isFinite(normalized[seat])) {
        throw new Error('La mesa debe completar las 5 notas de kata.');
      }
    }

    return updateLiveState(matchId, (live) => {
      const stamp = new Date().toISOString();
      const mesaJudgeName = mesaInfo.name || 'Mesa Tecnica';
      live.kata.mesa_override = {
        active: true,
        judge_name: mesaJudgeName,
        code: mesaInfo.code || null,
        tatami: mesaInfo.tatami || null,
        scores: { ...normalized },
        updated_at: stamp,
      };
      return live;
    }, {
      logEntry: {
        type: 'kata_score',
        label: 'Ajuste de Mesa en Kata',
        actor: mesaInfo.name || 'Mesa Tecnica',
        message: 'Mesa Tecnica actualizó manualmente las 5 notas de kata.',
      },
    });
  }

  async function pushKumiteSignal(matchId, signal = {}) {
    return updateLiveState(matchId, (live) => {
      const evt = {
        id: 'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        kind: signal.kind || 'point',
        side: signal.side === 'b' ? 'b' : 'a',
        action: signal.action || 'yuko',
        category: signal.category || null,
        seat: signal.seat || 'J1',
        judge_name: signal.judge_name || 'Mesa técnica',
        source: signal.source || 'referee-panel',
        at: new Date().toISOString(),
      };
      live.kumite.events = [...(live.kumite.events || []), evt];
      if (evt.kind === 'point' && !live.kumite.senshu) {
        live.kumite.senshu = evt.side;
      }
      if (signal.winner) {
        live.kumite.winner = signal.winner;
      }
      const board = _deriveKumiteBoardFromEvents(live);
      live.kumite.score_a = board.scoreA;
      live.kumite.score_b = board.scoreB;
      live.kumite.hist_a = board.histA;
      live.kumite.hist_b = board.histB;
      live.kumite.warn_a = board.warnA;
      live.kumite.warn_b = board.warnB;
      return live;
    });
  }

  async function setKumiteWinner(matchId, winnerSide = null) {
    return updateLiveState(matchId, (live) => {
      live.kumite.winner = winnerSide;
      return live;
    }, {
      logEntry: winnerSide ? {
        type: 'mesa_decision',
        label: 'Ganador definido por Mesa',
        actor: 'Mesa Tecnica',
        side: winnerSide === 'b' ? 'AKA' : 'AO',
        message: `Mesa Tecnica definió como ganador a ${winnerSide === 'b' ? 'AKA' : 'AO'}.`,
      } : null,
    });
  }

  async function setKumiteScoreboard(matchId, scoreboard = {}) {
    const scoreA = Math.max(0, Number.parseInt(scoreboard.scoreA, 10) || 0);
    const scoreB = Math.max(0, Number.parseInt(scoreboard.scoreB, 10) || 0);
    const warnA = {
      c1: Math.min(4, Math.max(0, Number.parseInt(scoreboard.warnA?.c1, 10) || 0)),
      c2: Math.min(4, Math.max(0, Number.parseInt(scoreboard.warnA?.c2, 10) || 0)),
    };
    const warnB = {
      c1: Math.min(4, Math.max(0, Number.parseInt(scoreboard.warnB?.c1, 10) || 0)),
      c2: Math.min(4, Math.max(0, Number.parseInt(scoreboard.warnB?.c2, 10) || 0)),
    };
    return updateLiveState(matchId, (live) => {
      live.kumite.score_a = scoreA;
      live.kumite.score_b = scoreB;
      live.kumite.hist_a = Array.isArray(scoreboard.histA) ? [...scoreboard.histA] : (live.kumite.hist_a || []);
      live.kumite.hist_b = Array.isArray(scoreboard.histB) ? [...scoreboard.histB] : (live.kumite.hist_b || []);
      live.kumite.warn_a = warnA;
      live.kumite.warn_b = warnB;
      if (typeof scoreboard.senshu !== 'undefined') live.kumite.senshu = scoreboard.senshu || null;
      if (typeof scoreboard.winner !== 'undefined') live.kumite.winner = scoreboard.winner || null;
      return live;
    }, {
      logEntry: {
        type: 'mesa_decision',
        label: 'Marcador corregido',
        actor: 'Mesa Tecnica',
        message: `Mesa Tecnica ajustó el marcador a ${scoreA}-${scoreB}.`,
      },
    });
  }

  async function setKumiteClock(matchId, clock = {}) {
    const seconds = Math.max(10, Number.parseInt(clock.seconds, 10) || 180);
    const remaining = Math.max(0, Number.parseInt(clock.remaining, 10) || 0);
    const running = !!clock.running;
    return updateLiveState(matchId, (live) => {
      live.kumite.clock_seconds = seconds;
      live.kumite.clock_remaining = remaining;
      live.kumite.clock_running = running;
      return live;
    });
  }

  async function submitJudgeSignal(matchId, signal = {}) {
    return updateLiveState(matchId, (live) => {
      const seat = signal.seat || 'J1';
      const key  = (signal.kind || 'point') + ':' + seat;
      const nextSignal = {
        id: 'sig-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        kind: signal.kind || 'point',
        side: signal.side === 'b' ? 'b' : 'a',
        action: signal.action || (signal.kind === 'penalty' ? 'c1' : 'yuko'),
        category: signal.category || null,
        seat,
        judge_name: signal.judge_name || 'Juez',
        code: signal.code || null,
        at: new Date().toISOString(),
      };
      const pending = Array.isArray(live.kumite.pending_signals) ? [...live.kumite.pending_signals] : [];
      const idx = pending.findIndex(item => ((item.kind || 'point') + ':' + (item.seat || 'J1')) === key);
      if (idx >= 0) pending[idx] = nextSignal;
      else pending.push(nextSignal);
      live.kumite.pending_signals = pending;
      return live;
    }, {
      logEntry: {
        type: signal.kind === 'penalty' ? 'falta' : 'senal',
        label: signal.kind === 'penalty' ? 'Falta informada' : 'Señal de juez',
        seat: signal.seat || 'J1',
        actor: signal.judge_name || 'Juez',
        side: signal.side === 'b' ? 'AKA' : 'AO',
        action: signal.category || signal.action || null,
        message: `${signal.judge_name || 'Juez'} marcó ${(signal.category || signal.action || '').toUpperCase()} para ${signal.side === 'b' ? 'AKA' : 'AO'}.`,
      },
    });
  }

  async function clearJudgeSignals(matchId, kind = null) {
    return updateLiveState(matchId, (live) => {
      const pending = Array.isArray(live.kumite.pending_signals) ? [...live.kumite.pending_signals] : [];
      live.kumite.pending_signals = kind ? pending.filter(item => item.kind !== kind) : [];
      return live;
    });
  }

  async function confirmKumiteDecision(matchId, decision = {}) {
    return updateLiveState(matchId, (live) => {
      const pending = Array.isArray(live.kumite.pending_signals) ? [...live.kumite.pending_signals] : [];
      const evt = {
        id: 'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        kind: decision.kind || 'point',
        side: decision.side === 'b' ? 'b' : 'a',
        action: decision.action || 'yuko',
        category: decision.category || null,
        seat: decision.seat || 'Mesa',
        judge_name: decision.judge_name || 'Mesa Técnica',
        source: decision.source || 'mesa-tecnica',
        at: new Date().toISOString(),
      };
      live.kumite.events = [...(live.kumite.events || []), evt];
      live.kumite.last_decision = evt;
      live.kumite.pending_signals = pending.filter(item => item.kind !== evt.kind);
      if (decision.winner) live.kumite.winner = decision.winner;
      if (evt.kind === 'point' && !live.kumite.senshu) live.kumite.senshu = evt.side;
      const board = _deriveKumiteBoardFromEvents(live);
      live.kumite.score_a = board.scoreA;
      live.kumite.score_b = board.scoreB;
      live.kumite.hist_a = board.histA;
      live.kumite.hist_b = board.histB;
      live.kumite.warn_a = board.warnA;
      live.kumite.warn_b = board.warnB;
      return live;
    }, {
      logEntry: {
        type: 'mesa_decision',
        label: 'Decisión de Mesa',
        seat: decision.seat || 'Mesa',
        actor: decision.judge_name || 'Mesa Técnica',
        side: decision.side === 'b' ? 'AKA' : 'AO',
        action: decision.category || decision.action || null,
        message: `Mesa confirmó ${(decision.category || decision.action || '').toUpperCase()} para ${decision.side === 'b' ? 'AKA' : 'AO'}.`,
      },
    });
  }

  function getKumiteCallDecision(matchOrNotes) {
    const live = getLiveState(matchOrNotes);
    const pending = Array.isArray(live.kumite?.pending_signals) ? live.kumite.pending_signals : [];
    const pointRank = { yuko: 1, wazaari: 2, ippon: 3 };
    const penaltyRank = { c1: 1, c2: 2 };
    const groups = {};

    pending.forEach(signal => {
      const kind = signal.kind || 'point';
      const action = kind === 'penalty' ? (signal.category || signal.action || 'c1') : (signal.action || 'yuko');
      const side = signal.side === 'b' ? 'b' : 'a';
      const key = [kind, side, action].join(':');
      if (!groups[key]) {
        groups[key] = { kind, side, action, count: 0, judges: [] };
      }
      groups[key].count += 1;
      groups[key].judges.push(signal);
    });

    const valid = Object.values(groups).filter(group => group.count >= 2);
    if (!valid.length) {
      return { status: 'waiting', pending, valid: [], message: 'Esperando coincidencia mínima de 2 jueces.' };
    }

    const scored = valid.map(group => ({
      ...group,
      rank: group.kind === 'penalty' ? (penaltyRank[group.action] || 0) : (pointRank[group.action] || 0),
    })).sort((a, b) => b.rank - a.rank || b.count - a.count);

    const best = scored[0];
    const oppositeTie = scored.find(group => group.side !== best.side && group.rank === best.rank && group.count === best.count && group.kind === best.kind);
    if (oppositeTie) {
      return {
        status: 'tie',
        pending,
        valid: scored,
        message: 'Empate 2 vs 2. Debe decidir la mesa con el juez principal.',
      };
    }

    return {
      status: 'ready',
      pending,
      valid: scored,
      decision: best,
      message: 'Hay mayoría válida para confirmar en mesa técnica.',
    };
  }

  function getKataSummary(matchOrNotes) {
    const live   = getLiveState(matchOrNotes);
    const override = live.kata?.mesa_override;
    if (override?.active && override?.scores && typeof override.scores === 'object') {
      return {
        ..._buildKataSummaryFromScores(override.scores, {
          judgeName: override.judge_name || 'Mesa Tecnica',
          submittedAt: override.updated_at || null,
        }),
        source: 'mesa_override',
        mesa_override_active: true,
      };
    }

    const judgesMap = Object.fromEntries(
      Object.entries(live.kata?.judges || {}).map(([seat, info]) => [seat, {
        score: Number.isFinite(Number(info?.score)) ? Number(info.score) : null,
        judge_name: info?.judge_name || 'Pendiente',
        submitted_at: info?.submitted_at || null,
      }])
    );

    const summary = _buildKataSummaryFromScores(
      Object.fromEntries(Object.entries(judgesMap).map(([seat, info]) => [seat, info.score])),
      {
        judgeNameBySeat: Object.fromEntries(Object.entries(judgesMap).map(([seat, info]) => [seat, info.judge_name])),
        submittedAt: null,
      }
    );

    summary.judges = summary.judges.map((judge) => ({
      ...judge,
      submitted_at: judgesMap?.[judge.seat]?.submitted_at || null,
      judge_name: judgesMap?.[judge.seat]?.judge_name || judge.judge_name,
    }));
    summary.source = 'judges';
    summary.mesa_override_active = false;
    return summary;
  }

  function getBitacora(matchOrNotes) {
    const parsed = _parseNotes(matchOrNotes?.notes ?? matchOrNotes);
    return Array.isArray(parsed.bitacora) ? parsed.bitacora : [];
  }

  function buildTournamentBitacora(matches = []) {
    return (matches || []).flatMap(match => {
      const nameA = match.competitor_a?.competitors?.full_name || match.competitor_a?.full_name || 'Competidor';
      const nameB = match.competitor_b?.competitors?.full_name || match.competitor_b?.full_name || null;
      const fightLabel = match.bracket_type === 'kata_round' || match.category?.discipline === 'kata'
        ? nameA
        : `${nameA}${nameB ? ' vs ' + nameB : ''}`;
      return getBitacora(match).map(entry => ({
        ...entry,
        match_id: match.id,
        category_id: match.category_id || match.category?.id || null,
        category_name: match.category?.name || 'Categoría',
        tatami: match.tatami || match.category?.tatami || null,
        match_label: fightLabel,
      }));
    }).sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  }

  function getKumiteSummary(matchOrNotes) {
    const live   = getLiveState(matchOrNotes);
    const events = Array.isArray(live.kumite?.events) ? live.kumite.events : [];
    const summary = {
      scoreA: Number.isFinite(Number(live.kumite?.score_a)) ? Number(live.kumite.score_a) : 0,
      scoreB: Number.isFinite(Number(live.kumite?.score_b)) ? Number(live.kumite.score_b) : 0,
      clockSeconds: Number.isFinite(Number(live.kumite?.clock_seconds)) ? Number(live.kumite.clock_seconds) : 180,
      clockRemaining: Number.isFinite(Number(live.kumite?.clock_remaining)) ? Number(live.kumite.clock_remaining) : 180,
      clockRunning: !!live.kumite?.clock_running,
      histA: Array.isArray(live.kumite?.hist_a) ? [...live.kumite.hist_a] : [],
      histB: Array.isArray(live.kumite?.hist_b) ? [...live.kumite.hist_b] : [],
      warnA: _isPlainObject(live.kumite?.warn_a) ? { ...live.kumite.warn_a } : { c1: 0, c2: 0 },
      warnB: _isPlainObject(live.kumite?.warn_b) ? { ...live.kumite.warn_b } : { c1: 0, c2: 0 },
      winner: live.kumite?.winner || null,
      senshu: live.kumite?.senshu || null,
      referees: live.kumite?.referees || {},
      events,
      pending: Array.isArray(live.kumite?.pending_signals) ? live.kumite.pending_signals : [],
      lastDecision: live.kumite?.last_decision || null,
    };

    return summary;
  }

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
    updateLiveState,
    registerReferee,
    saveKataJudgeScore,
    saveKataJudgeScores,
    applyMesaKataOverride,
    pushKumiteSignal,
    submitJudgeSignal,
    clearJudgeSignals,
    confirmKumiteDecision,
    setKumiteWinner,
    setKumiteScoreboard,
    setKumiteClock,
    getLiveState,
    getRefereePresence,
    isJudgeActive,
    getKataSummary,
    getKumiteCallDecision,
    getKumiteSummary,
    getBitacora,
    buildTournamentBitacora,
    getRoundRobinStandings,
  };
})();
