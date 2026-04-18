// superadmin-tournaments.js — Visualización global de torneos


(async function () {
  const tournamentsTable = document.getElementById('tournaments-table');
  if (!tournamentsTable) return;
  tournamentsTable.innerHTML = '<span class="spinner"></span> Cargando torneos...';
  let allTournaments = [], allUsers = [];
  try {
    [allUsers, allTournaments] = await Promise.all([
      Auth.listProfiles(),
      Tournament.listAll()
    ]);
    renderAndAttach(allTournaments, allUsers);
  } catch (err) {
    tournamentsTable.innerHTML = `<div class="alert alert-danger">Error al cargar torneos: ${err.message}</div>`;
  }

  function renderAndAttach(tournaments, users) {
    tournamentsTable.innerHTML = `
      <div style="margin-bottom:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <input id="tournament-search" class="form-control" style="max-width:180px" placeholder="Buscar torneo...">
        <select id="tournament-org-filter" class="form-control">
          <option value="">Todos los organizadores</option>
          ${users.map(u => `<option value="${u.id}">${u.full_name||u.id}</option>`).join('')}
        </select>
        <select id="tournament-status-filter" class="form-control">
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="open">Abierto</option>
          <option value="closed">Cerrado</option>
          <option value="ongoing">En curso</option>
          <option value="finished">Finalizado</option>
          <option value="cancelled">Cancelado</option>
        </select>
      </div>
      <div id="tournaments-table-inner"></div>
    `;
    renderTournamentsTable(tournaments, users);
    attachTournamentActions();
    attachFilters();
  }

  function renderTournamentsTable(tournaments, users) {
    const inner = document.getElementById('tournaments-table-inner');
    if (!tournaments.length) {
      inner.innerHTML = '<div>No hay torneos registrados.</div>';
      return;
    }
    inner.innerHTML = `<table class="table table-sm"><thead><tr><th>Nombre</th><th>Organizador</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>` +
      tournaments.map(t => {
        const org = users.find(u => u.id === t.organizer_id);
        return `<tr data-id="${t.id}"><td>${t.name}</td><td>${org ? org.full_name : t.organizer_id}</td><td>${t.status}</td><td><button class="btn btn-xs btn-outline tournament-enter">Entrar</button></td></tr>`;
      }).join('') +
      '</tbody></table>';
  }

  function renderTournamentsTable(tournaments) {
    if (!tournaments.length) return '<div>No hay torneos registrados.</div>';
    return `<table class="table table-sm"><thead><tr><th>Nombre</th><th>Organizador</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>` +
      tournaments.map(t => `<tr data-id="${t.id}"><td>${t.name}</td><td>${t.organizer_id}</td><td>${t.status}</td><td><button class="btn btn-xs btn-outline tournament-enter">Entrar</button></td></tr>`).join('') +
      '</tbody></table>';
  }
  function attachTournamentActions() {
    document.querySelectorAll('.tournament-enter').forEach(btn => {
      btn.onclick = function () {
        const tr = btn.closest('tr');
        const id = tr.dataset.id;
        window.location.href = `admin.html?tournament=${id}`;
      };
    });
  }

  function attachFilters() {
    const search = document.getElementById('tournament-search');
    const orgFilter = document.getElementById('tournament-org-filter');
    const statusFilter = document.getElementById('tournament-status-filter');
    function filterTournaments() {
      let filtered = allTournaments;
      const q = (search.value || '').toLowerCase();
      if (q) filtered = filtered.filter(t => (t.name||'').toLowerCase().includes(q));
      const org = orgFilter.value;
      if (org) filtered = filtered.filter(t => t.organizer_id === org);
      const status = statusFilter.value;
      if (status) filtered = filtered.filter(t => t.status === status);
      renderTournamentsTable(filtered, allUsers);
      attachTournamentActions();
    }
    search.oninput = filterTournaments;
    orgFilter.onchange = filterTournaments;
    statusFilter.onchange = filterTournaments;
  }
})();
// superadmin-tournaments.js — Visualización global de torneos

async function loadTournamentsTable() {
  const table = document.getElementById('tournaments-table');
  table.innerHTML = '<span class="spinner"></span> Cargando...';
  try {
    // Suponiendo que Auth.listProfiles() y Tournament.listAll() existen
    const users = await Auth.listProfiles();
    const tournaments = await Tournament.listAll();
    let html = `<table class="table table-sm"><thead><tr><th>Organizador</th><th>Torneo</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead><tbody>`;
    for (const t of tournaments) {
      const org = users.find(u => u.id === t.organizer_id);
      html += `<tr>
        <td>${org ? org.full_name : t.organizer_id}</td>
        <td>${t.name}</td>
        <td>${t.status}</td>
        <td>${t.date || ''}</td>
        <td><button class="btn btn-xs btn-outline" onclick="enterTournament('${t.id}')">Entrar</button></td>
      </tr>`;
    }
    html += '</tbody></table>';
    table.innerHTML = html;
  } catch (err) {
    table.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
  }
}

window.enterTournament = function(tournamentId) {
  alert('Funcionalidad de acceso directo a torneo pendiente de integración.');
};
