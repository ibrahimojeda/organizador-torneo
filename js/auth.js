/* ============================================================
   AUTH.JS — Autenticación y manejo de roles
   ============================================================ */

const Auth = (() => {

  const SESSION_KEY = 'ot_session';

  /* ---- Estado interno ---- */
  let _session = null;

  /* ---- Inicializa Supabase si las credenciales están disponibles ---- */
  function _initSupabase() {
    if (supabase && typeof supabase.from === 'function') return true;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
    try {
      window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return true;
    } catch (e) {
      console.error('[Auth] Error al inicializar Supabase:', e);
      return false;
    }
  }

  /* ---- Carga la sesión guardada del localStorage ---- */
  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) _session = JSON.parse(raw);
    } catch (_) {
      _session = null;
    }
    return _session;
  }

  /* ---- Guarda la sesión en localStorage ---- */
  function _saveSession(session) {
    _session = session;
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }

  const ERR_NETWORK = 'No se pudo conectar al servidor. Verifica tu conexión a internet o que el proyecto Supabase esté activo.';

  function _getJudgeTournamentToken(tournamentId) {
    return String(tournamentId || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(-8) || 'TORNEO';
  }

  function _isJudgeCodeAllowedForStatus(status) {
    return [
      TOURNAMENT_STATUS.DRAFT.id,
      TOURNAMENT_STATUS.OPEN.id,
      TOURNAMENT_STATUS.ONGOING.id,
    ].includes(status || '');
  }

  function buildJudgeAccessCode(tournamentId, tatami, discipline, seat) {
    const tournamentToken = _getJudgeTournamentToken(tournamentId);
    const judgeTag = discipline === 'kata' ? 'K' : 'U';
    const normalizedSeat = String(seat || 'J1').toUpperCase();
    return `JZ-${tournamentToken}-T${String(tatami || 1)}-${judgeTag}-${normalizedSeat}`;
  }

  function _parseJudgeAccessCode(code) {
    const normalized = String(code || '').toUpperCase().trim();
    const scoped = normalized.match(/^JZ-([A-Z0-9]{4,12})-T?(\d+)-([KU])-(J[1-5])$/);
    if (scoped) {
      return {
        tournamentToken: scoped[1],
        tatami: scoped[2],
        discipline: scoped[3] === 'K' ? 'kata' : 'kumite',
        seat: scoped[4],
        access: normalized,
      };
    }

    const legacy = normalized.match(/^JZ-(\d+)-([KU])-([A-Z0-9]+)$/)
      || normalized.match(/^JZ-(\d+)([KU])-([A-Z0-9]+)$/);
    if (!legacy) return null;
    return {
      tournamentToken: null,
      tatami: legacy[1],
      discipline: legacy[2] === 'K' ? 'kata' : 'kumite',
      seat: /^J[1-5]$/.test(legacy[3]) ? legacy[3] : null,
      access: normalized,
    };
  }

  async function _getTournamentState(tournamentId) {
    if (!tournamentId) return null;
    if (isDevMode() || !_initSupabase()) {
      const tournaments = JSON.parse(localStorage.getItem('ot_dev_tournaments') || '[]');
      return tournaments.find(item => item.id === tournamentId) || null;
    }
    const { data, error } = await supabase
      .from('tournaments')
      .select('id, name, status')
      .eq('id', tournamentId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function _findTournamentByJudgeToken(tournamentToken) {
    if (!tournamentToken) return null;

    if (isDevMode() || !_initSupabase()) {
      const tournaments = JSON.parse(localStorage.getItem('ot_dev_tournaments') || '[]');
      return tournaments.find(item => _getJudgeTournamentToken(item.id) === tournamentToken) || null;
    }

    const { data, error } = await supabase
      .from('tournaments')
      .select('id, name, status')
      .in('status', [
        TOURNAMENT_STATUS.DRAFT.id,
        TOURNAMENT_STATUS.OPEN.id,
        TOURNAMENT_STATUS.ONGOING.id,
        TOURNAMENT_STATUS.CLOSED.id,
        TOURNAMENT_STATUS.FINISHED.id,
        TOURNAMENT_STATUS.CANCELLED.id,
      ]);
    if (error) throw error;
    if (!Array.isArray(data)) return null;
    const matches = data.filter(item => _getJudgeTournamentToken(item.id) === tournamentToken);
    if (matches.length !== 1) return null;
    return matches[0];
  }

  function _saveLocalCodeEntry(tournamentId, role, code, options = {}) {
    const storageRole = role === USER_ROLES.JUDGE ? USER_ROLES.REFEREE : role;
    const devCodes = JSON.parse(localStorage.getItem('ot_dev_codes') || '[]');
    const existing = devCodes.find(entry => entry.code === code && entry.tournament_id === tournamentId);
    if (existing) return existing;
    const entry = {
      id:            generateId(),
      tournament_id: tournamentId,
      role:          storageRole,
      code,
      tatami:        options.tatami || null,
      discipline:    options.discipline || null,
      active:        true,
      created_at:    new Date().toISOString(),
    };
    devCodes.push(entry);
    localStorage.setItem('ot_dev_codes', JSON.stringify(devCodes));
    return entry;
  }

  function _findLocalJudgeAccess(code) {
    const parsed = _parseJudgeAccessCode(code);
    if (!parsed) return null;
    try {
      const tournaments = JSON.parse(localStorage.getItem('ot_dev_tournaments') || '[]');
      for (let i = 0; i < (localStorage.length || 0); i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('ot_judge_access_')) continue;
        const match = key.match(/^ot_judge_access_(.+)_(.+)$/);
        if (!match) continue;
        const tournamentId = match[1];
        const tatami = match[2];
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        const tournament = tournaments.find(t => t.id === tournamentId);
        if (!_isJudgeCodeAllowedForStatus(tournament?.status)) continue;
        if (parsed.tournamentToken && parsed.tournamentToken !== _getJudgeTournamentToken(tournamentId)) continue;
        for (const discipline of ['kata', 'kumite']) {
          const entries = Array.isArray(data?.[discipline]) ? data[discipline] : [];
          const entry = entries.find(item => String(item?.code || '').toUpperCase() === code);
          if (!entry) continue;
          return {
            tournamentId,
            tournamentName: tournament?.name || 'Torneo',
            judgeTatami: tatami,
            judgeDiscipline: discipline,
            judgeAccessCode: code,
          };
        }
      }
    } catch (_) {}
    return null;
  }

  /* ---- Login con email y contraseña (Supabase Auth) ---- */
  async function login(email, password) {
    if (!_initSupabase()) {
      throw new Error('Supabase no está configurado. Agrega las credenciales en config.js');
    }
    let data, error;
    try {
      ({ data, error } = await supabase.auth.signInWithPassword({ email, password }));
    } catch (fetchErr) {
      throw new Error(ERR_NETWORK);
    }
    if (error) throw error;

    const role = await _fetchRole(data.user.id);
    const session = {
      userId: data.user.id,
      email:  data.user.email,
      role,
      token:  data.session.access_token,
    };
    _saveSession(session);
    return session;
  }

  /* ---- Login con código de árbitro (acceso simplificado) ---- */
  async function loginWithCode(code) {
    const normalizedCode = (code || '').toUpperCase().trim();
    const parsedJudgeCode = _parseJudgeAccessCode(normalizedCode);

    const localJudge = _findLocalJudgeAccess(normalizedCode);
    if (localJudge) {
      const session = {
        userId: null,
        email: null,
        role: USER_ROLES.JUDGE,
        codeId: null,
        tournamentId: localJudge.tournamentId,
        tournamentName: localJudge.tournamentName,
        token: null,
        judgeTatami: localJudge.judgeTatami,
        judgeDiscipline: localJudge.judgeDiscipline,
        judgeAccessCode: localJudge.judgeAccessCode,
      };
      _saveSession(session);
      return session;
    }

    if (parsedJudgeCode?.tournamentToken) {
      const tournament = await _findTournamentByJudgeToken(parsedJudgeCode.tournamentToken).catch(() => null);
      if (!tournament) {
        throw new Error('Código de juez inválido o torneo no encontrado.');
      }
      if (!_isJudgeCodeAllowedForStatus(tournament.status)) {
        await deleteJudgeCodesForTournament(tournament.id).catch(() => {});
        throw new Error('El torneo ya no admite accesos de jueces. Genera nuevos códigos desde Mesa Técnica.');
      }
      const session = {
        userId: null,
        email: null,
        role: USER_ROLES.JUDGE,
        codeId: null,
        tournamentId: tournament.id,
        tournamentName: tournament.name || 'Torneo',
        token: null,
        judgeTatami: parsedJudgeCode.tatami,
        judgeDiscipline: parsedJudgeCode.discipline || 'kumite',
        judgeAccessCode: normalizedCode,
      };
      _saveSession(session);
      return session;
    }

    // Primero: buscar en códigos de desarrollo (localStorage)
    const devCodes = JSON.parse(localStorage.getItem('ot_dev_codes') || '[]');
    const devFound = devCodes.find(c => c.code === normalizedCode && c.active !== false);
    if (devFound) {
      const tournaments = JSON.parse(localStorage.getItem('ot_dev_tournaments') || '[]');
      const tournament  = tournaments.find(t => t.id === devFound.tournament_id);
      if (parsedJudgeCode && !_isJudgeCodeAllowedForStatus(tournament?.status)) {
        await deleteJudgeCodesForTournament(devFound.tournament_id).catch(() => {});
        throw new Error('El torneo ya no admite accesos de jueces. Genera nuevos códigos desde Mesa Técnica.');
      }
      const effectiveRole = parsedJudgeCode ? USER_ROLES.JUDGE : devFound.role;
      const judgeMeta = effectiveRole === USER_ROLES.JUDGE ? {
        judgeTatami: devFound.tatami || parsedJudgeCode?.tatami || null,
        judgeDiscipline: devFound.discipline || parsedJudgeCode?.discipline || 'kumite',
        judgeAccessCode: normalizedCode,
      } : {};
      const session = {
        userId:         null,
        email:          null,
        role:           effectiveRole,
        codeId:         devFound.id,
        tournamentId:   devFound.tournament_id,
        tournamentName: tournament?.name || 'Torneo',
        token:          null,
        ...judgeMeta,
      };
      _saveSession(session);
      return session;
    }

    if (!_initSupabase()) {
      throw new Error('Código inválido o Supabase no configurado.');
    }
    let data, error;
    try {
      // Try server-side RPC first (works for anon users without exposing table rows)
      const response = await supabase
        .rpc('validate_tournament_code', { p_code: normalizedCode });
      data = Array.isArray(response.data) ? response.data[0] : null;
      error = response.error;
      // Fallback: if RPC is not deployed yet, try direct query (works for authenticated users)
      if (error || !data) {
        const fallback = await supabase
          .from('tournament_codes')
          .select('id, tournament_id, role, tournaments(id, name, status)')
          .eq('code', normalizedCode)
          .eq('active', true)
          .order('created_at', { ascending: false })
          .limit(1);
        const row = Array.isArray(fallback.data) ? fallback.data[0] : null;
        if (row) {
          data = {
            code_id: row.id,
            tournament_id: row.tournament_id,
            code_role: row.role,
            tournament_name: row.tournaments?.name,
            tournament_status: row.tournaments?.status,
          };
          error = null;
        } else {
          error = fallback.error || error;
        }
      }
    } catch (fetchErr) {
      throw new Error(ERR_NETWORK);
    }

    if (error || !data) throw new Error('Código inválido o expirado.');

    if (parsedJudgeCode && !_isJudgeCodeAllowedForStatus(data.tournament_status)) {
      await deleteJudgeCodesForTournament(data.tournament_id).catch(() => {});
      throw new Error('El torneo ya no admite accesos de jueces. Los códigos fueron desactivados.');
    }

    const effectiveRole = parsedJudgeCode ? USER_ROLES.JUDGE : data.code_role;
    const judgeMeta = effectiveRole === USER_ROLES.JUDGE ? {
      judgeTatami: parsedJudgeCode?.tatami || null,
      judgeDiscipline: parsedJudgeCode?.discipline || 'kumite',
      judgeAccessCode: normalizedCode,
    } : {};

    const session = {
      userId:         null,
      email:          null,
      role:           effectiveRole,
      codeId:         data.code_id,
      tournamentId:   data.tournament_id,
      tournamentName: data.tournament_name,
      token:          null,
      ...judgeMeta,
    };
    _saveSession(session);
    return session;
  }

  /* ---- Generar código de acceso para un torneo ---- */
  async function generateCode(tournamentId, role, options = {}) {
    const normalizedRole = role === USER_ROLES.JUDGE ? USER_ROLES.JUDGE : role;
    const storageRole = normalizedRole === USER_ROLES.JUDGE ? USER_ROLES.REFEREE : normalizedRole;
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const judgeTag = (options.discipline === 'kata' ? 'K' : 'U');
    const prefix = normalizedRole === USER_ROLES.REFEREE ? 'MES'
      : normalizedRole === USER_ROLES.JUDGE ? 'JZ'
      : 'PUB';
    const code = String(options.customCode || (
      normalizedRole === USER_ROLES.JUDGE
        ? buildJudgeAccessCode(tournamentId, options.tatami || 1, options.discipline || 'kumite', options.seat || 'J1')
        : `${prefix}-${suffix}`
    )).toUpperCase();

    if (normalizedRole === USER_ROLES.JUDGE) {
      const tournament = await _getTournamentState(tournamentId).catch(() => null);
      if (!_isJudgeCodeAllowedForStatus(tournament?.status)) {
        await deleteJudgeCodesForTournament(tournamentId).catch(() => {});
        throw new Error('Los códigos de jueces solo están disponibles mientras el torneo está operativo.');
      }
      return _saveLocalCodeEntry(tournamentId, normalizedRole, code, options);
    }

    if (isDevMode() || !_initSupabase()) {
      return _saveLocalCodeEntry(tournamentId, normalizedRole, code, options);
    }

    try {
      const { data: existing } = await supabase
        .from('tournament_codes')
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('code', code)
        .order('created_at', { ascending: false })
        .limit(1);
      if (Array.isArray(existing) && existing[0]) return existing[0];
    } catch (_) {}

    const payload = {
      tournament_id: tournamentId,
      role: storageRole,
      code,
      active: true,
    };

    const { data, error } = await supabase
      .from('tournament_codes')
      .insert(payload)
      .select()
      .single();
    if (error) {
      console.warn('[Auth] Código guardado en respaldo local por error de Supabase:', error.message || error);
      return _saveLocalCodeEntry(tournamentId, normalizedRole, code, options);
    }
    return data;
  }

  async function deleteJudgeCodesForTournament(tournamentId) {
    if (!tournamentId) return;
    try {
      const staleKeys = [];
      for (let i = 0; i < (localStorage.length || 0); i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('ot_judge_access_' + tournamentId + '_')) staleKeys.push(key);
      }
      staleKeys.forEach(key => localStorage.removeItem(key));
    } catch (_) {}

    const canUseSupabase = _initSupabase() && supabase && typeof supabase.from === 'function';
    if (isDevMode() || !canUseSupabase) {
      const codes = JSON.parse(localStorage.getItem('ot_dev_codes') || '[]');
      const filtered = codes.filter(entry => !(entry.tournament_id === tournamentId && String(entry.code || '').toUpperCase().startsWith('JZ-')));
      localStorage.setItem('ot_dev_codes', JSON.stringify(filtered));
      return;
    }
    const { error } = await supabase
      .from('tournament_codes')
      .delete()
      .eq('tournament_id', tournamentId)
      .ilike('code', 'JZ-%');
    if (error) throw error;
  }

  /* ---- Obtener códigos de un torneo ---- */
  async function getCodesForTournament(tournamentId) {
    const tournament = await _getTournamentState(tournamentId).catch(() => null);
    if (tournament && !_isJudgeCodeAllowedForStatus(tournament.status)) {
      await deleteJudgeCodesForTournament(tournamentId).catch(() => {});
    }

    if (isDevMode() || !_initSupabase()) {
      const codes = JSON.parse(localStorage.getItem('ot_dev_codes') || '[]');
      return codes.filter(c => c.tournament_id === tournamentId)
                  .sort((a, b) => a.created_at > b.created_at ? -1 : 1);
    }
    const { data, error } = await supabase
      .from('tournament_codes')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  /* ---- Desactivar un código ---- */
  async function deactivateCode(codeId) {
    if (isDevMode() || !_initSupabase()) {
      const codes = JSON.parse(localStorage.getItem('ot_dev_codes') || '[]');
      const idx   = codes.findIndex(c => c.id === codeId);
      if (idx !== -1) codes[idx].active = false;
      localStorage.setItem('ot_dev_codes', JSON.stringify(codes));
      return;
    }
    const { error } = await supabase.from('tournament_codes').update({ active: false }).eq('id', codeId);
    if (error) throw error;
  }

  /* ---- Acceso público sin autenticación ---- */
  function loginAsPublic(tournamentId) {
    const session = {
      userId: null,
      email:  null,
      role:   USER_ROLES.PUBLIC,
      tournamentId,
    };
    _saveSession(session);
    return session;
  }

  /* ---- Obtiene el rol del usuario desde la tabla profiles ---- */
  async function _fetchRole(userId) {
    if (!supabase) return USER_ROLES.PUBLIC;
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    return data?.role || USER_ROLES.PUBLIC;
  }

  /* ---- Crear nuevo usuario con rol seleccionado (solo super_admin) ---- */
  async function createUser(email, password, role, fullName = '') {
    if (!_initSupabase()) throw new Error('Supabase no está configurado.');
    if (!isSuperAdmin()) throw new Error('Solo el super administrador puede crear usuarios.');

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    const targetRole = [USER_ROLES.ORGANIZER, USER_ROLES.REFEREE, USER_ROLES.SUPER_ADMIN].includes(role)
      ? role
      : USER_ROLES.ORGANIZER;

    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;

    if (data.user?.id) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          role: targetRole,
          full_name: (fullName || email).trim(),
          active: true,
        })
        .eq('id', data.user.id);
      if (profileError) throw profileError;
    }
    return data.user;
  }

  /* ---- Listar perfiles creados (tabla profiles) ---- */
  async function listProfiles() {
    if (!_initSupabase()) throw new Error('Supabase no está configurado.');
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, full_name, created_at, active')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  /* ---- Editar perfil de usuario (solo super_admin) ---- */
  async function updateProfile(userId, payload) {
    if (!_initSupabase()) throw new Error('Supabase no está configurado.');
    if (!isSuperAdmin()) throw new Error('Solo el super administrador puede editar usuarios.');
    const safePayload = {};
    if (typeof payload.full_name === 'string') safePayload.full_name = payload.full_name.trim();
    if (payload.role) safePayload.role = payload.role;
    if (typeof payload.active === 'boolean') safePayload.active = payload.active;

    const { data, error } = await supabase
      .from('profiles')
      .update(safePayload)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /* ---- Eliminar usuario del panel (solo super_admin) ---- */
  async function deleteUser(userId) {
    if (!_initSupabase()) throw new Error('Supabase no está configurado.');
    if (!isSuperAdmin()) throw new Error('Solo el super administrador puede eliminar usuarios.');
    if (userId === getUserId()) throw new Error('No puedes eliminar tu propio usuario desde este panel.');
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    if (error) throw error;
    return true;
  }

  /* ---- Cambiar rol de un usuario (solo super_admin) ---- */
  async function updateRole(userId, newRole) {
    await updateProfile(userId, { role: newRole });
  }

  /* ---- Cambiar contraseña del usuario autenticado ---- */
  async function changePassword(newPassword) {
    if (!_initSupabase()) throw new Error('Supabase no está configurado.');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  /* ---- Cierre de sesión ---- */
  let isSigningOut = false;
  async function logout() {
    if (isSigningOut) return;
    isSigningOut = true;
    try {
      if (supabase) {
        try { await supabase.auth.signOut(); } catch (_) {}
      }
      _saveSession(null);
      const isLocalHost = /localhost|127\.0\.0\.1/.test(window.location.hostname);
      window.location.href = isLocalHost ? '/index.html' : '/organizador-torneo/index.html';
    } finally {
      isSigningOut = false;
    }
  }

  /* ---- Getters ---- */
  function getSession()    { return _session || loadSession(); }
  function getRole()       { return getSession()?.role || null; }
  function getUserId()     { return getSession()?.userId || null; }
  function isOrganizer()   { return getRole() === USER_ROLES.ORGANIZER; }
  function isReferee()     { return getRole() === USER_ROLES.REFEREE; }
  function isJudge()       { return getRole() === USER_ROLES.JUDGE; }
  function isCompetitor()  { return getRole() === USER_ROLES.COMPETITOR; }
  function isSuperAdmin()  { return getRole() === USER_ROLES.SUPER_ADMIN; }
  function canManage()     { return isOrganizer() || isSuperAdmin() || isDevMode(); }
  function isAuthenticated() { return !!getSession(); }
  function getTournamentId() { return getSession()?.tournamentId || null; }
  function isDevMode()       { return getSession()?.userId === '00000000-0000-0000-0000-000000000001'; }

  /* ---- Redirige si no tiene el rol correcto ---- */
  function requireRole(requiredRole) {
    const role = getRole();
    if (!role || role === USER_ROLES.PUBLIC) {
      window.location.href = '/organizador-torneo/';
      return false;
    }
    if (requiredRole && role !== requiredRole) {
      window.location.href = '/organizador-torneo/';
      return false;
    }
    return true;
  }

  /* ---- Activar/desactivar usuario (solo super_admin) ---- */
  async function updateActive(userId, isActive) {
    if (!_initSupabase()) throw new Error('Supabase no está configurado.');
    if (!isSuperAdmin()) throw new Error('Solo el super administrador puede cambiar el estado.');
    const { error } = await supabase
      .from('profiles')
      .update({ active: isActive })
      .eq('id', userId);
    if (error) throw error;
  }

  async function toggleActive(userId) {
    if (!_initSupabase()) throw new Error('Supabase no está configurado.');
    if (!isSuperAdmin()) throw new Error('Solo el super administrador puede cambiar el estado.');
    const { data, error } = await supabase
      .from('profiles')
      .select('active')
      .eq('id', userId)
      .single();
    if (error) throw error;
    const newActive = !data.active;
    await updateActive(userId, newActive);
    return newActive;
  }

  return {
    login,
    loginWithCode,
    loginAsPublic,
    logout,
    loadSession,
    getSession,
    getRole,
    getUserId,
    getTournamentId,
    isOrganizer,
    isReferee,
    isJudge,
    isCompetitor,
    isSuperAdmin,
    canManage,
    isAuthenticated,
    isDevMode,
    requireRole,
    buildJudgeAccessCode,
    generateCode,
    getCodesForTournament,
    deactivateCode,
    deleteJudgeCodesForTournament,
    createUser,
    listProfiles,
    updateProfile,
    updateRole,
    deleteUser,
    changePassword,
    updateActive,
    toggleActive,
    _saveDevSession: _saveSession,
  };
})();