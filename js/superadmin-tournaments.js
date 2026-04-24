// superadmin-tournaments.js — Visualización global de torneos

(async function () {
  const tournamentsTable = document.getElementById('tournaments-table');
  if (!tournamentsTable) return;

  let allTournaments = [];
  let allUsers = [];

  await loadTournaments();

  async function loadTournaments() {
    tournamentsTable.innerHTML = '<span class="spinner"></span> Cargando torneos...';
    try {
      [allUsers, allTournaments] = await Promise.all([
        Auth.listProfiles(),
        Tournament.listAll()
      ]);
      renderLayout();
      applyFilters();
    } catch (err) {
      tournamentsTable.innerHTML = `<div class="alert alert-danger">Error al cargar torneos: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderLayout() {
    tournamentsTable.innerHTML = `
      <form id="tournament-search-form" class="card mb-3" style="padding:16px;display:flex;gap:8px;flex-wrap:wrap;align-items:end;">
        <div>
          <label>Nombre del torneo</label>
          <input id="tournament-search" class="form-control" style="max-width:220px" placeholder="Buscar torneo...">
        </div>
        <div>
          <label>Organizador</label>
          <select id="tournament-org-filter" class="form-control">
            <option value="">Todos los organizadores</option>
            ${allUsers.map(u => `<option value="${u.id}">${escapeHtml(u.full_name || u.id)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Estado</label>
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
        <button id="tournament-search-btn" class="btn btn-primary" type="button">Buscar</button>
      </form>
      <div id="tournaments-table-inner"></div>
    `;
    const btn = document.getElementById('tournament-search-btn');
    const form = document.getElementById('tournament-search-form');
    if (btn) btn.onclick = applyFilters;
    if (form) form.onsubmit = function (e) {
      e.preventDefault();
      applyFilters();
      return false;
    };
  }

  function applyFilters() {
    const search = (document.getElementById('tournament-search')?.value || '').toLowerCase().trim();
    const organizer = document.getElementById('tournament-org-filter')?.value || '';
    const status = document.getElementById('tournament-status-filter')?.value || '';

    let filtered = [...allTournaments];
    if (search) filtered = filtered.filter(t => (t.name || '').toLowerCase().includes(search));
    if (organizer) filtered = filtered.filter(t => t.organizer_id === organizer);
    if (status) filtered = filtered.filter(t => t.status === status);

    renderTournamentsTable(filtered);
  }

  function renderTournamentsTable(tournaments) {
    const inner = document.getElementById('tournaments-table-inner');
    if (!inner) return;
    if (!tournaments.length) {
      inner.innerHTML = '<div class="alert alert-info">No hay torneos para este filtro.</div>';
      return;
    }

    inner.innerHTML = `
      <table class="table table-sm">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Organizador</th>
            <th>Estado</th>
            <th>Fechas</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${tournaments.map(t => {
            const organizer = allUsers.find(u => u.id === t.organizer_id);
            const dates = [t.date_start, t.date_end].filter(Boolean).map(formatDate).join(' → ') || 'Por definir';
            return `
              <tr data-id="${t.id}">
                <td>${escapeHtml(t.name || 'Torneo')}</td>
                <td>${escapeHtml(organizer?.full_name || t.organizer_id || '—')}</td>
                <td>${escapeHtml(t.status || 'draft')}</td>
                <td>${escapeHtml(dates)}</td>
                <td>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button class="btn btn-xs btn-outline tournament-enter" type="button">Entrar</button>
                    <button class="btn btn-xs" style="background:#b91c1c;color:#fff;border:none;" data-action="archive-delete" type="button">Archivar y borrar datos</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
    attachTournamentActions();
  }

  function attachTournamentActions() {
    document.querySelectorAll('.tournament-enter').forEach(btn => {
      btn.onclick = function () {
        const tr = btn.closest('tr');
        const id = tr?.dataset?.id;
        if (id) window.location.href = `admin.html?tournament=${id}`;
      };
    });

    document.querySelectorAll('[data-action="archive-delete"]').forEach(btn => {
      btn.onclick = async function () {
        const tr = btn.closest('tr');
        const id = tr?.dataset?.id;
        const tournament = allTournaments.find(item => item.id === id);
        if (!id || !tournament) return;

        const firstConfirm = confirm(`Se archivará el torneo "${tournament.name || 'Torneo'}" y luego se borrarán sus datos operativos. Los usuarios no serán eliminados. ¿Deseas continuar?`);
        if (!firstConfirm) return;

        const phrase = prompt('Escribe ARCHIVAR para confirmar la limpieza manual de este torneo.');
        if ((phrase || '').trim().toUpperCase() !== 'ARCHIVAR') {
          alert('Operación cancelada.');
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Archivando...';
        try {
          await Tournament.archiveAndDelete(id);
          alert('Torneo archivado y datos operativos eliminados correctamente.');
          await loadTournaments();
        } catch (err) {
          alert('No se pudo archivar el torneo: ' + (err.message || err));
          btn.disabled = false;
          btn.textContent = 'Archivar y borrar datos';
        }
      };
    });
  }

  function formatDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
})();
