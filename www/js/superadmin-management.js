// superadmin-management.js — Gestión global, programación y medallero

(function () {
  const panelCompetitors = document.getElementById('panel-competitors');
  const panelCategories = document.getElementById('panel-categories');
  const panelBrackets = document.getElementById('panel-brackets');
  const panelSchedule = document.getElementById('panel-schedule');
  const panelMedals = document.getElementById('panel-medals');

  if (!panelCompetitors && !panelCategories && !panelBrackets && !panelSchedule && !panelMedals) return;

  let tournaments = [];
  init();

  async function init() {
    try {
      tournaments = await Tournament.listAll();
    } catch (_) {
      tournaments = [];
    }

    renderCompetitorsPanel();
    renderCategoriesPanel();
    renderBracketsPanel();
    renderSchedulePanel();
    renderMedalsPanel();

    await Promise.all([
      loadCompetitors(),
      loadCategories(),
      loadBrackets(),
      loadSchedule(),
      loadMedals(),
    ]);
  }

  function renderCompetitorsPanel() {
    if (!panelCompetitors) return;
    panelCompetitors.innerHTML = `
      <div class="page-header"><h1 class="page-title">Competidores</h1></div>
      ${filterBar('competitors', 'Buscar atletas')}
      <div id="competitors-results"></div>
    `;
    bindFilter('competitors', loadCompetitors);
  }

  function renderCategoriesPanel() {
    if (!panelCategories) return;
    panelCategories.innerHTML = `
      <div class="page-header"><h1 class="page-title">Categorías</h1></div>
      ${filterBar('categories', 'Buscar categorías')}
      <div id="categories-results"></div>
    `;
    bindFilter('categories', loadCategories);
  }

  function renderBracketsPanel() {
    if (!panelBrackets) return;
    panelBrackets.innerHTML = `
      <div class="page-header"><h1 class="page-title">Llaves y combates</h1></div>
      ${filterBar('brackets', 'Buscar llaves')}
      <div id="brackets-results"></div>
    `;
    bindFilter('brackets', loadBrackets);
  }

  function renderSchedulePanel() {
    if (!panelSchedule) return;
    panelSchedule.innerHTML = `
      <div class="page-header"><h1 class="page-title">Programación</h1></div>
      ${filterBar('schedule', 'Ver calendario')}
      <div id="schedule-results"></div>
      <div class="card" style="padding:16px;margin-top:12px;">
        <h3 style="margin-top:0;">Ideas de visualización</h3>
        <ul>
          <li>Línea de tiempo mensual con torneos pasados, activos y próximos.</li>
          <li>Agenda por tatami con bloques horarios por categoría.</li>
          <li>Vista de calendario semanal para los eventos cercanos.</li>
          <li>Tablero en vivo con estado del torneo: inscripción, curso y finalizado.</li>
        </ul>
      </div>
    `;
    bindFilter('schedule', loadSchedule);
  }

  function renderMedalsPanel() {
    if (!panelMedals) return;
    panelMedals.innerHTML = `
      <div class="page-header"><h1 class="page-title">Medallero global</h1></div>
      <div class="card mb-3" style="padding:16px;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;">
          <div>
            <label>Torneo</label>
            <select id="medals-tournament" class="form-control">
              <option value="all">Todos los torneos</option>
              ${tournaments.map(t => `<option value="${t.id}">${escapeHtml(t.name || 'Torneo')}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>Filtrar por dojo / club</label>
            <input id="medals-dojo-filter" class="form-control" placeholder="Ej: Shito Ryu">
          </div>
          <div>
            <button id="medals-search" class="btn btn-primary" type="button">Buscar medallero</button>
          </div>
        </div>
      </div>
      <div id="medals-results"></div>
    `;
    bindFilter('medals', loadMedals);
    const dojoInput = document.getElementById('medals-dojo-filter');
    if (dojoInput) dojoInput.oninput = loadMedals;
  }

  function filterBar(prefix, buttonText) {
    return `
      <div class="card mb-3" style="padding:16px;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;">
          <div>
            <label>Torneo</label>
            <select id="${prefix}-tournament" class="form-control">
              <option value="all">Todos los torneos</option>
              ${tournaments.map(t => `<option value="${t.id}">${escapeHtml(t.name || 'Torneo')}</option>`).join('')}
            </select>
          </div>
          <div>
            <button id="${prefix}-search" class="btn btn-primary" type="button">${buttonText}</button>
          </div>
        </div>
      </div>
    `;
  }

  function bindFilter(prefix, callback) {
    const btn = document.getElementById(prefix + '-search');
    const select = document.getElementById(prefix + '-tournament');
    if (btn) btn.onclick = callback;
    if (select) select.onchange = callback;
  }

  async function loadCompetitors() {
    const target = document.getElementById('competitors-results');
    if (!target) return;
    target.innerHTML = '<span class="spinner"></span> Cargando competidores...';

    try {
      const selectedId = document.getElementById('competitors-tournament')?.value || 'all';
      const selectedTournaments = getSelectedTournaments(selectedId);
      const rows = [];

      for (const tournament of selectedTournaments) {
        const competitors = await safeList(() => Competitors.listByTournament(tournament.id));
        competitors.forEach(comp => rows.push({
          full_name: comp.full_name || '—',
          club: comp.club || '—',
          discipline: comp.discipline || '—',
          gender: comp.gender || '—',
          tournament: tournament.name || 'Torneo',
        }));
      }

      if (!rows.length) {
        target.innerHTML = '<div class="alert alert-info">No hay competidores registrados para el filtro seleccionado.</div>';
        return;
      }

      target.innerHTML = `
        <table class="table table-sm">
          <thead><tr><th>Atleta</th><th>Torneo</th><th>Escuela / club</th><th>Disciplina</th><th>Género</th></tr></thead>
          <tbody>
            ${rows.map(row => `<tr><td>${escapeHtml(row.full_name)}</td><td>${escapeHtml(row.tournament)}</td><td>${escapeHtml(row.club)}</td><td>${escapeHtml(row.discipline)}</td><td>${escapeHtml(row.gender)}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      target.innerHTML = `<div class="alert alert-danger">Error al cargar competidores: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadCategories() {
    const target = document.getElementById('categories-results');
    if (!target) return;
    target.innerHTML = '<span class="spinner"></span> Cargando categorías...';

    try {
      const selectedId = document.getElementById('categories-tournament')?.value || 'all';
      const selectedTournaments = getSelectedTournaments(selectedId);
      const rows = [];

      for (const tournament of selectedTournaments) {
        const categories = await safeList(() => Categories.listByTournament(tournament.id));
        categories.forEach(category => rows.push({
          name: category.name || 'Categoría',
          discipline: category.discipline || '—',
          gender: category.gender || '—',
          tatami: category.tatami || '—',
          tournament: tournament.name || 'Torneo',
          athletes: category.registrations?.[0]?.count || category.registrations?.count || 0,
        }));
      }

      if (!rows.length) {
        target.innerHTML = '<div class="alert alert-info">No hay categorías para el filtro seleccionado.</div>';
        return;
      }

      target.innerHTML = `
        <table class="table table-sm">
          <thead><tr><th>Categoría</th><th>Torneo</th><th>Disciplina</th><th>Género</th><th>Tatami</th><th>Inscritos</th></tr></thead>
          <tbody>
            ${rows.map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.tournament)}</td><td>${escapeHtml(row.discipline)}</td><td>${escapeHtml(row.gender)}</td><td>${escapeHtml(String(row.tatami))}</td><td>${row.athletes}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      target.innerHTML = `<div class="alert alert-danger">Error al cargar categorías: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadBrackets() {
    const target = document.getElementById('brackets-results');
    if (!target) return;
    target.innerHTML = '<span class="spinner"></span> Cargando llaves...';

    try {
      const selectedId = document.getElementById('brackets-tournament')?.value || 'all';
      const selectedTournaments = getSelectedTournaments(selectedId);
      const rows = [];

      for (const tournament of selectedTournaments) {
        const matches = await safeList(() => Bracket.getByTournamentId(tournament.id));
        matches.forEach(match => rows.push({
          tournament: tournament.name || 'Torneo',
          category: match.category_id || '—',
          round: match.round_label || `Ronda ${match.round || '—'}`,
          status: match.status || 'pending',
          tatami: match.tatami || '—',
        }));
      }

      if (!rows.length) {
        target.innerHTML = '<div class="alert alert-info">No hay llaves generadas para el filtro seleccionado.</div>';
        return;
      }

      target.innerHTML = `
        <table class="table table-sm">
          <thead><tr><th>Torneo</th><th>Categoría</th><th>Ronda</th><th>Estado</th><th>Tatami</th></tr></thead>
          <tbody>
            ${rows.map(row => `<tr><td>${escapeHtml(row.tournament)}</td><td>${escapeHtml(String(row.category))}</td><td>${escapeHtml(row.round)}</td><td>${escapeHtml(row.status)}</td><td>${escapeHtml(String(row.tatami))}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      target.innerHTML = `<div class="alert alert-danger">Error al cargar llaves: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadSchedule() {
    const target = document.getElementById('schedule-results');
    if (!target) return;

    const selectedId = document.getElementById('schedule-tournament')?.value || 'all';
    const selectedTournaments = getSelectedTournaments(selectedId);
    if (!selectedTournaments.length) {
      target.innerHTML = '<div class="alert alert-info">No hay torneos para mostrar en el calendario.</div>';
      return;
    }

    const today = new Date();
    const past = [];
    const present = [];
    const upcoming = [];

    selectedTournaments.forEach(tournament => {
      const start = new Date(tournament.date_start || tournament.date || Date.now());
      const end = new Date(tournament.date_end || tournament.date_start || tournament.date || Date.now());
      const item = { ...tournament, start, end };
      if (end < today) past.push(item);
      else if (start <= today && end >= today) present.push(item);
      else upcoming.push(item);
    });

    target.innerHTML = `
      <div class="grid-3" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
        ${timelineColumn('Pasados', past, '#64748b')}
        ${timelineColumn('En curso / actuales', present, '#059669')}
        ${timelineColumn('Próximos', upcoming, '#2563eb')}
      </div>
    `;
  }

  async function loadMedals() {
    const target = document.getElementById('medals-results');
    if (!target) return;
    target.innerHTML = '<span class="spinner"></span> Cargando medallero...';

    try {
      const selectedId = document.getElementById('medals-tournament')?.value || 'all';
      const dojoFilter = (document.getElementById('medals-dojo-filter')?.value || '').toLowerCase().trim();
      const selectedTournaments = getSelectedTournaments(selectedId);
      const groups = [];

      for (const tournament of selectedTournaments) {
        const clubs = {};
        const categories = await safeList(() => Categories.listByTournament(tournament.id));
        for (const category of categories) {
          const podio = await safeValue(() => Bracket.getPodio(category.id), null);
          const positions = podio?.positions || [];
          positions.forEach(pos => {
            const club = pos.club || 'Sin club';
            if (!clubs[club]) clubs[club] = { club, oro: 0, plata: 0, bronce: 0, total: 0 };
            if (pos.position === 1) clubs[club].oro += 1;
            else if (pos.position === 2) clubs[club].plata += 1;
            else if (pos.position === 3) clubs[club].bronce += 1;
            clubs[club].total += 1;
          });
        }

        let rows = Object.values(clubs).sort((a, b) => (b.oro - a.oro) || (b.plata - a.plata) || (b.bronce - a.bronce));
        if (dojoFilter) rows = rows.filter(row => row.club.toLowerCase().includes(dojoFilter));
        if (rows.length) groups.push({ tournamentName: tournament.name || 'Torneo', rows });
      }

      if (!groups.length) {
        target.innerHTML = '<div class="alert alert-info">No hay resultados de medallero para este filtro.</div>';
        return;
      }

      if (selectedId === 'all') {
        target.innerHTML = groups.map(group => `
          <div class="card mb-3" style="padding:16px;">
            <h3 style="margin-top:0;">${escapeHtml(group.tournamentName)}</h3>
            ${renderMedalTable(group.rows)}
          </div>
        `).join('');
      } else {
        target.innerHTML = renderMedalTable(groups[0].rows);
      }
    } catch (err) {
      target.innerHTML = `<div class="alert alert-danger">Error al cargar el medallero: ${escapeHtml(err.message)}</div>`;
    }
  }

  function getSelectedTournaments(selectedId) {
    return selectedId === 'all'
      ? tournaments
      : tournaments.filter(tournament => tournament.id === selectedId);
  }

  function renderMedalTable(rows) {
    return `
      <table class="table table-sm">
        <thead><tr><th>Dojo / club</th><th>🥇 Oro</th><th>🥈 Plata</th><th>🥉 Bronce</th><th>Total</th></tr></thead>
        <tbody>
          ${rows.map(row => `<tr><td>${escapeHtml(row.club)}</td><td>${row.oro}</td><td>${row.plata}</td><td>${row.bronce}</td><td><strong>${row.total}</strong></td></tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  function timelineColumn(title, items, color) {
    return `
      <div class="card" style="padding:16px;border-top:4px solid ${color};">
        <h3 style="margin-top:0;">${title}</h3>
        ${items.length ? items.map(item => `
          <div style="padding:10px 0;border-bottom:1px solid #eef2f7;">
            <strong>${escapeHtml(item.name || 'Torneo')}</strong>
            <div class="text-muted">${formatDate(item.date_start)}${item.date_end ? ' → ' + formatDate(item.date_end) : ''}</div>
            <div class="text-muted">Estado: ${escapeHtml(item.status || 'draft')}</div>
          </div>
        `).join('') : '<div class="text-muted">Sin eventos en esta sección.</div>'}
      </div>
    `;
  }

  async function safeList(fn) {
    try {
      const result = await fn();
      return Array.isArray(result) ? result : [];
    } catch (_) {
      return [];
    }
  }

  async function safeValue(fn, fallback) {
    try {
      return await fn();
    } catch (_) {
      return fallback;
    }
  }

  function formatDate(value) {
    if (!value) return 'Fecha por definir';
    return new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
})();