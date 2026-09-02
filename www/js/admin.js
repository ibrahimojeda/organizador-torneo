(function () {
  if (!Auth.isAuthenticated()) window.location.href = '../index.html';
  const STATUS_LABELS = {
    draft: 'Borrador', open: 'Inscripcion Abierta', closed: 'Inscripcion Cerrada',
    ongoing: 'En Progreso', finished: 'Finalizado', cancelled: 'Cancelado'
  };
  const state = {
    activeTournament: null, activeCategory: null, selectedWinnerId: null,
    pollingInterval: null, bracketSub: null, bracketDebounceTimer: null
  };
  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof supabase.from !== 'function') {
    window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  function switchPanel(panelId) {
    if (state.pollingInterval) { clearInterval(state.pollingInterval); state.pollingInterval = null; }
    if (state.bracketSub) { try { state.bracketSub.unsubscribe(); } catch (_) {} state.bracketSub = null; }
    document.querySelectorAll('.panel').forEach(function(p) { p.style.display = 'none'; });
    document.querySelectorAll('.sidebar-item').forEach(function(i) { i.classList.remove('active'); });
    var panel = document.getElementById('panel-' + panelId);
    if (panel) panel.style.display = 'block';
    var sidebar = document.querySelector('[data-panel="' + panelId + '"]');
    if (sidebar) sidebar.classList.add('active');
    _onPanelLoad(panelId);
  }
  window.switchPanel = switchPanel;
  document.querySelectorAll('.sidebar-item').forEach(function(item) {
    item.addEventListener('click', function() { switchPanel(item.dataset.panel); });
  });
  async function init() {
    if (!supabase || typeof supabase.from !== 'function') {
      Display.toast('Error de conexion con Supabase.', 'error'); return;
    }
    if (!Auth.isDevMode()) {
      try { await supabase.auth.getSession(); } catch (_) {}
      var isHandlingSignOut = false;
      supabase.auth.onAuthStateChange(function(event, session) {
        if (event === 'SIGNED_OUT' && !isHandlingSignOut) { isHandlingSignOut = true; Auth.logout(); }
      });
    }
    _applyRoleUI();
    await _loadLastTournament();
    switchPanel('dashboard');
  }
  function _applyRoleUI() {
    if (Auth.isSuperAdmin()) {
      document.getElementById('nav-role-badge').textContent = 'Super Admin';
      document.getElementById('nav-role-badge').className = 'badge badge-purple text-xs mr-2';
      document.getElementById('sidebar-tournaments-label').textContent = 'Todos los Torneos';
      document.getElementById('sidebar-section-system').style.display = '';
      document.getElementById('section-create-user').style.display = '';
    } else if (Auth.isDevMode()) {
      document.getElementById('nav-role-badge').textContent = 'Dev Mode';
      document.getElementById('nav-role-badge').className = 'badge badge-muted text-xs mr-2';
    }
  }

async function _loadLastTournament() {
    try {
      var tournaments = Auth.isSuperAdmin() ? await Tournament.listAll() : await Tournament.listMine();
      if (tournaments.length) {
        state.activeTournament = tournaments[0];
        _updateNavTournamentName(state.activeTournament.name);
        await _refreshDashboard();
      }
    } catch (e) { Display.toast(e.message, 'error'); }
  }
  function _updateNavTournamentName(name) {
    document.getElementById('nav-tournament-name').textContent = name || 'Torneo Karate';
    document.getElementById('dash-tournament-name').textContent = name || '---';
  }
  async function _refreshDashboard() {
    if (!state.activeTournament) return;
    var t = state.activeTournament;
    document.getElementById('dash-tournament-info').textContent =
      '' + formatDate(t.date_start) + (t.location ? ' - ' + t.location : '') + ' - ' + t.status;
    document.getElementById('dash-info-card').style.display = 'block';
    document.getElementById('dinfo-name').textContent = t.name || '---';
    document.getElementById('dinfo-date').textContent = t.date_start ? formatDate(t.date_start) : '---';
    document.getElementById('dinfo-location').textContent = t.location || '---';
    document.getElementById('dinfo-status').innerHTML = '<span class="status-dot ' + t.status + '"></span> ' + (STATUS_LABELS[t.status] || t.status);
    document.getElementById('dinfo-disciplines').textContent = (t.disciplines || ['kumite']).join(' + ');
    document.getElementById('dinfo-tatamis').textContent = (t.num_tatamis || 1) + ' tatami(s)';
    var pubBtn = document.getElementById('btn-public-link');
    pubBtn.style.display = 'inline-flex';
    pubBtn.dataset.tid = t.id;
    try {
      var stats = await Tournament.getStats(t.id);
      document.getElementById('stat-categories').textContent = stats.categories;
      document.getElementById('stat-competitors').textContent = stats.competitors;
      document.getElementById('stat-matches').textContent = stats.totalMatches;
      document.getElementById('stat-progress').textContent = stats.progress + '%';
    } catch (_) {}
    await _loadTournamentBitacora();
  }
  var _dashboardBitacoraCache = [];
  async function _loadTournamentBitacora() {
    var listEl = document.getElementById('dashboard-bitacora-list');
    if (!listEl || !state.activeTournament || !state.activeTournament.id) return;
    try {
      var matches = await Matches.listByTournament(state.activeTournament.id);
      var tatamiFilter = document.getElementById('dashboard-tatami-filter');
      if (tatamiFilter && tatamiFilter.options.length <= 1) {
        var tatamis = [...new Set(matches.map(function(m) { return String(m.tatami ?? m.category?.tatami ?? ''); }))].filter(function(t) { return t; }).sort(function(a, b) { return Number(a) - Number(b); });
        tatamis.forEach(function(t) { var opt = document.createElement('option'); opt.value = t; opt.textContent = 'Tatami ' + t; tatamiFilter.appendChild(opt); });
      }
      var selectedTatami = tatamiFilter?.value || '';
      var filteredMatches = selectedTatami ? matches.filter(function(m) { return String(m.tatami ?? m.category?.tatami ?? '') === selectedTatami; }) : matches;
      _dashboardBitacoraCache = Matches.buildTournamentBitacora(filteredMatches);
      var entries = _dashboardBitacoraCache.slice(0, 20);
      if (!entries.length) { listEl.innerHTML = '<div class="text-center text-muted p-3">Sin eventos registrados todavia.</div>'; return; }
      listEl.innerHTML = entries.map(function(entry) {
        var time = entry.at ? new Date(entry.at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '---';
        var tatamiLabel = entry.tatami ? ' - Tatami ' + entry.tatami : '';
        return '<div style="padding:.75rem 1rem;border-bottom:1px solid var(--border);"><div style="font-size:.9rem;font-weight:700;">' + (entry.label || 'Evento') + '</div><div style="font-size:.88rem;margin-top:.15rem;">' + (entry.message || 'Actualizacion registrada.') + '</div><div class="text-xs text-muted" style="margin-top:.2rem;">' + time + tatamiLabel + ' - ' + (entry.category_name || 'Categoria') + (entry.match_label ? ' - ' + entry.match_label : '') + '</div></div>';
      }).join('');
    } catch (e) { listEl.innerHTML = '<div class="alert alert-danger">' + e.message + '</div>'; }
  }
async function _exportDashboardCSV() {
    if (!_dashboardBitacoraCache.length) { await _loadTournamentBitacora(); }
    if (!_dashboardBitacoraCache.length) { Display.toast('No hay eventos.', 'warning'); return; }
    var csv = Matches.exportBitacoraCSV(_dashboardBitacoraCache);
    var ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    Matches.downloadBlob(csv, 'bitacora_torneo_' + ts + '.csv', 'text/csv;charset=utf-8');
    Display.toast('Bitacora exportada como CSV.', 'success');
  }
  async function _exportDashboardPDF() {
    if (!_dashboardBitacoraCache.length) { await _loadTournamentBitacora(); }
    if (!_dashboardBitacoraCache.length) { Display.toast('No hay eventos.', 'warning'); return; }
    var orderedEntries = Matches.buildTournamentBitacoraOrdered(
      await Matches.listByTournament(state.activeTournament.id).catch(function() { return []; })
    );
    var title = state.activeTournament?.name ? 'Bitacora - ' + state.activeTournament.name : 'Bitacora del Torneo';
    var html = Matches.exportBitacoraPDF(orderedEntries.length ? orderedEntries : _dashboardBitacoraCache, title);
    var ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    Matches.downloadBlob(html, 'bitacora_torneo_' + ts + '.html', 'text/html;charset=utf-8');
    Display.toast('Bitacora exportada.', 'success');
  }
  function _addEventSafe(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('click', fn); }
  _addEventSafe('btn-dash-export-csv', _exportDashboardCSV);
async function _onPanelLoad(panelId) {
    if (!state.activeTournament && panelId !== 'tournaments' && panelId !== 'settings' && panelId !== 'system') {
      Display.toast('Primero selecciona un torneo.', 'warning');
      switchPanel('tournaments');
      return;
    }
    if (panelId === 'dashboard')    await _refreshDashboard();
    if (panelId === 'tournaments')  await _loadTournamentList();
    if (panelId === 'competitors')  await _loadCompetitors();
    if (panelId === 'categories')   await _loadCategories();
    if (panelId === 'brackets')     { await _loadBracketPanel(); _startBracketPolling(); }
    if (panelId === 'schedule')     await _loadSchedule();
    if (panelId === 'medals')       { await _loadMedals(); _startBracketPolling(); }
    if (panelId === 'codes')        await _loadCodes();
    if (panelId === 'settings')     { if (Auth.isSuperAdmin()) _loadUsersList(); }
    if (panelId === 'system')       await _loadSystemPanel();
    if (panelId === 'reports-center') { /* handled by reports-center.js */ }
  }

  /* ---- TORNEOS ---- */
  async function _loadTournamentList() {
    var el = document.getElementById('tournaments-list');
    var titleEl = document.getElementById('tournaments-panel-title');
    var subtitleEl = document.getElementById('tournaments-panel-subtitle');
    try {
      var list;
      if (Auth.isSuperAdmin()) {
        list = await Tournament.listAll();
        titleEl.textContent = 'Todos los Torneos';
        subtitleEl.textContent = list.length + ' torneo(s) en el sistema';
      } else {
        list = await Tournament.listMine();
        titleEl.textContent = 'Mis Torneos';
        subtitleEl.textContent = 'Gestiona todos tus torneos';
      }
      if (!list.length) {
        el.innerHTML = '<div class="empty-state"><div class="empty-icon"></div><h3>Sin torneos</h3><p>Crea tu primer torneo para comenzar.</p></div>';
        return;
      }
      el.innerHTML = list.map(function(t) {
        var orgLabel = Auth.isSuperAdmin() && t.organizer_id ? '<span class="badge badge-muted text-xs">' + (t.profiles?.full_name || t.organizer_id.slice(0,8)) + '</span>' : '';
        return '<div class="card mb-2"><div class="flex justify-between items-center"><div style="flex:1;cursor:pointer;" onclick="selectTournament(\'' + t.id + '\')"><div class="flex items-center gap-2 mb-1"><span class="status-dot ' + t.status + '"></span><strong>' + t.name + '</strong>' + orgLabel + '</div><div class="text-muted text-sm">' + formatDate(t.date_start) + ' - ' + (t.location || 'Sin ubicacion') + ' - ' + (STATUS_LABELS[t.status] || t.status) + '</div></div><div class="flex gap-2 items-center">' + (t.disciplines || []).map(function(d) { return '<span class="badge badge-' + (d === 'kumite' ? 'red' : 'gold') + '">' + d + '</span>'; }).join('') + '<button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation();removeTournament(\'' + t.id + '\',\'' + t.name.replace(/'/g, '') + '\')">X</button></div></div></div>';
      }).join('');
    } catch (e) { el.innerHTML = '<div class="alert alert-danger">' + e.message + '</div>'; }
  }
  _addEventSafe('btn-dash-export-pdf', _exportDashboardPDF);