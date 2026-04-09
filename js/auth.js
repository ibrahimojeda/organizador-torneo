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

  /* ---- Login con email y contraseña (Supabase Auth) ---- */
  async function login(email, password) {
    if (!_initSupabase()) {
      throw new Error('Supabase no está configurado. Agrega las credenciales en config.js');
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
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

    // Primero: buscar en códigos de desarrollo (localStorage)
    const devCodes = JSON.parse(localStorage.getItem('ot_dev_codes') || '[]');
    const devFound = devCodes.find(c => c.code === normalizedCode && c.active !== false);
    if (devFound) {
      const tournaments = JSON.parse(localStorage.getItem('ot_dev_tournaments') || '[]');
      const tournament  = tournaments.find(t => t.id === devFound.tournament_id);
      const session = {
        userId:         null,
        email:          null,
        role:           devFound.role,
        codeId:         devFound.id,
        tournamentId:   devFound.tournament_id,
        tournamentName: tournament?.name || 'Torneo',
        token:          null,
      };
      _saveSession(session);
      return session;
    }

    if (!_initSupabase()) {
      throw new Error('Código inválido o Supabase no configurado.');
    }
    // El código se valida contra la tabla tournament_codes en Supabase
    const { data, error } = await supabase
      .from('tournament_codes')
      .select('*, tournaments(id, name)')
      .eq('code', normalizedCode)
      .eq('active', true)
      .single();

    if (error || !data) throw new Error('Código inválido o expirado.');

    const session = {
      userId:         null,
      email:          null,
      role:           data.role,   // 'referee' o 'public'
      codeId:         data.id,
      tournamentId:   data.tournament_id,
      tournamentName: data.tournaments?.name,
      token:          null,
    };
    _saveSession(session);
    return session;
  }

  /* ---- Generar código de acceso para un torneo ---- */
  async function generateCode(tournamentId, role) {
    const prefix = role === 'referee' ? 'ARB' : 'PUB';
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code   = prefix + '-' + suffix;

    if (isDevMode() || !_initSupabase()) {
      const devCodes = JSON.parse(localStorage.getItem('ot_dev_codes') || '[]');
      const entry = {
        id:            generateId(),
        tournament_id: tournamentId,
        role,
        code,
        active:        true,
        created_at:    new Date().toISOString(),
      };
      devCodes.push(entry);
      localStorage.setItem('ot_dev_codes', JSON.stringify(devCodes));
      return entry;
    }

    const { data, error } = await supabase
      .from('tournament_codes')
      .insert({ tournament_id: tournamentId, role, code, active: true })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /* ---- Obtener códigos de un torneo ---- */
  async function getCodesForTournament(tournamentId) {
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

  /* ---- Crear nuevo usuario organizador (signUp) ---- */
  async function createUser(email, password) {
    if (!_initSupabase()) throw new Error('Supabase no está configurado.');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    // El trigger handle_new_user inserta automáticamente en profiles con role='organizer'
    return data.user;
  }

  /* ---- Listar perfiles creados (tabla profiles) ---- */
  async function listProfiles() {
    if (!_initSupabase()) throw new Error('Supabase no está configurado.');
    // Nota: la política RLS de profiles filtra por auth.uid() = id
    // Para poder leer todos los perfiles siendo organizador necesitamos ampliar la política
    // Por ahora devuelve solo el perfil propio
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, created_at');
    if (error) throw error;
    return data || [];
  }

  /* ---- Cambiar contraseña del usuario autenticado ---- */
  async function changePassword(newPassword) {
    if (!_initSupabase()) throw new Error('Supabase no está configurado.');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  /* ---- Cierre de sesión ---- */
  async function logout() {
    if (supabase) {
      try { await supabase.auth.signOut(); } catch (_) {}
    }
    _saveSession(null);
    window.location.href = '/index.html';
  }

  /* ---- Getters ---- */
  function getSession()    { return _session || loadSession(); }
  function getRole()       { return getSession()?.role || null; }
  function getUserId()     { return getSession()?.userId || null; }
  function isOrganizer()   { return getRole() === USER_ROLES.ORGANIZER; }
  function isReferee()     { return getRole() === USER_ROLES.REFEREE; }
  function isCompetitor()  { return getRole() === USER_ROLES.COMPETITOR; }
  function isAuthenticated() { return !!getSession(); }
  function getTournamentId() { return getSession()?.tournamentId || null; }
  function isDevMode()       { return getSession()?.userId === '00000000-0000-0000-0000-000000000001'; }

  /* ---- Redirige si no tiene el rol correcto ---- */
  function requireRole(requiredRole) {
    const role = getRole();
    if (!role || role === USER_ROLES.PUBLIC) {
      window.location.href = '/index.html';
      return false;
    }
    if (requiredRole && role !== requiredRole) {
      window.location.href = '/index.html';
      return false;
    }
    return true;
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
    isCompetitor,
    isAuthenticated,
    isDevMode,
    requireRole,
    generateCode,
    getCodesForTournament,
    deactivateCode,
    createUser,
    listProfiles,
    changePassword,
    _saveDevSession: _saveSession,
  };
})();
