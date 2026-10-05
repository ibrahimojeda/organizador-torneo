/**
 * reports-center.js — Lógica para el Centro de Reportes
 * Vincula los botones de la UI con las funciones del módulo Reports.
 */
(function() {
  // Referencia segura a Display (puede no estar cargado aún)
  function _toast(message, type = 'info') {
    if (typeof Display !== 'undefined' && Display.toast) {
      Display.toast(message, type);
    } else {
      console.log(`[${type}] ${message}`);
    }
  }

  // Esperar a que el DOM esté listo
  function init() {
    // Inicializar solo si existen los botones
    if (!document.getElementById('btn-report-brackets')) {
      console.log('Centro de reportes: botones no encontrados aún, reintentando...');
      setTimeout(init, 500);
      return;
    }

    // Cargar selector de torneos
    _loadTournamentSelector();
    const btnCategories = document.getElementById('btn-report-categories');
    if (btnCategories) btnCategories.onclick = () => _openTatamiPrintModal('categories');

    // 1. Imprimir Llaves (A4)
    const btnBrackets = document.getElementById('btn-report-brackets');
    if (btnBrackets) btnBrackets.onclick = () => _openTatamiPrintModal('brackets');

    // 2. Imprimir Medallero
    const btnMedals = document.getElementById('btn-report-medals');
    if (btnMedals) {
      btnMedals.onclick = async () => {
        try {
          const tournamentId = document.getElementById('report-tournament-select')?.value;
          if (!tournamentId) return _toast('Selecciona un torneo primero', 'warning');
          _toast('Generando medallero...', 'info');
          await Reports.printMedallero(tournamentId);
        } catch (e) {
          console.error(e);
          _toast('Error al generar medallero: ' + e.message, 'error');
        }
      };
    }

    // 3. Imprimir Programación
    const btnSchedule = document.getElementById('btn-report-schedule');
    if (btnSchedule) {
      btnSchedule.onclick = async () => {
        try {
          const tournamentId = document.getElementById('report-tournament-select')?.value;
          if (!tournamentId) return _toast('Selecciona un torneo primero', 'warning');
          _toast('Generando programación...', 'info');
          await Reports.printSchedule(tournamentId);
        } catch (e) {
          console.error(e);
          _toast('Error al generar programación: ' + e.message, 'error');
        }
      };
    }

    // 4. Reporte de Pagos
    const btnInvoices = document.getElementById('btn-report-invoices');
    if (btnInvoices) {
      btnInvoices.onclick = async () => {
        try {
          const tournamentId = await getCurrentTournamentId();
          if (!tournamentId) return _toast('Selecciona un torneo primero', 'warning');
          _toast('Abriendo gestión de facturas...', 'info');
          if (window.switchPanel) {
            window.switchPanel('invoices');
          } else {
            _toast('Por favor, ve a la sección de Facturación', 'info');
          }
        } catch (e) {
          _toast('Error al acceder a facturas', 'error');
        }
      };
    }

    // 5. Lista de Competidores
    const btnCompetitors = document.getElementById('btn-report-competitors');
    if (btnCompetitors) {
      btnCompetitors.onclick = async () => {
        try {
          const tournamentId = await getCurrentTournamentId();
          if (!tournamentId) return _toast('Selecciona un torneo primero', 'warning');
          _toast('Generando lista de competidores...', 'info');
          await Reports.printCompetitorsList(tournamentId);
        } catch (e) {
          console.error(e);
          _toast('Error al generar lista: ' + e.message, 'error');
        }
      };
    }
  }

  let _printTatamiType = null;

  async function _openTatamiPrintModal(type) {
    const tournamentId = document.getElementById('report-tournament-select')?.value;
    if (!tournamentId) return _toast('Selecciona un torneo primero', 'warning');
    _printTatamiType = type;
    const body = document.getElementById('print-tatami-body');
    const title = document.getElementById('print-tatami-title');
    if (title) title.textContent = type === 'categories' ? '🖨️ Imprimir categorías' : '🖨️ Imprimir llaves';
    body.innerHTML = '<div class="text-center p-3"><span class="spinner"></span></div>';
    Display.openModal('print-tatami-modal');
    try {
      const cats = await Categories.listByTournament(tournamentId);
      const tatamis = [...new Set(cats.map(c => c.tatami).filter(t => t != null))].sort((a, b) => a - b);
      const sinLlaves = cats.filter(c => (c.registrations?.[0]?.count ?? 0) > 0 && !(c.matches || []).length);
      body.innerHTML = `
        <p class="text-sm text-muted mb-2">Selecciona los tatamis a imprimir. Marca "Todos" para imprimirlos juntos.</p>
        <label class="flex items-center gap-2 mb-2" style="cursor:pointer;">
          <input type="checkbox" id="tatami-all" checked onchange="_toggleAllTatamis(this)" />
          <strong>Todos los tatamis</strong>
        </label>
        <div class="flex flex-col gap-1 mb-3" id="tatami-options">
          ${tatamis.length ? tatamis.map(t => `<label class="flex items-center gap-2" style="cursor:pointer;"><input type="checkbox" class="tatami-chk" value="${t}" onchange="_syncAllTatamis()" /> Tatami ${t}</label>`).join('') : '<span class="text-muted text-sm">No hay tatamis asignados.</span>'}
        </div>
        ${sinLlaves.length ? `<div class="alert alert-warning text-sm">⚠️ ${sinLlaves.length} categoría(s) con competidores y sin llaves generadas: ${sinLlaves.slice(0, 6).map(c => escapeHtml(c.name || Categories.buildLabel(c))).join(', ')}${sinLlaves.length > 6 ? '…' : ''}.</div>` : ''}
      `;
      document.getElementById('btn-print-tatami-confirm').dataset.tournamentId = tournamentId;
    } catch (e) {
      body.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
    }
  }

  window._toggleAllTatamis = function(checkbox) {
    document.querySelectorAll('.tatami-chk').forEach(c => { c.checked = checkbox.checked; });
  };
  window._syncAllTatamis = function() {
    const all = [...document.querySelectorAll('.tatami-chk')];
    const master = document.getElementById('tatami-all');
    if (master) master.checked = all.length > 0 && all.every(c => c.checked);
  };

  document.getElementById('btn-print-tatami-confirm')?.addEventListener('click', async () => {
    const confirmBtn = document.getElementById('btn-print-tatami-confirm');
    const tournamentId = confirmBtn?.dataset.tournamentId;
    const master = document.getElementById('tatami-all');
    let tatamis = null;
    if (!master || !master.checked) {
      tatamis = [...document.querySelectorAll('.tatami-chk:checked')].map(c => c.value);
      if (!tatamis.length) return _toast('Selecciona al menos un tatami', 'warning');
    }
    Display.closeModal('print-tatami-modal');
    try {
      if (_printTatamiType === 'categories') await Reports.printCategories(tournamentId, tatamis);
      else await Reports.printBrackets(tournamentId, tatamis);
    } catch (e) { _toast('Error al imprimir: ' + e.message, 'error'); }
  });

  async function _loadTournamentSelector() {
    const sel = document.getElementById('report-tournament-select');
    if (!sel) return;
    try {
      const list = await (Auth.isSuperAdmin() ? Tournament.listAll() : Tournament.listMine());
      // Preseleccionar: primero lo que ya está en el selector (si existe), luego localStorage
      const saved = localStorage.getItem('ot_active_tournament_id');
      const current = sel.value || saved || '';
      sel.innerHTML = '<option value="">— Selecciona un torneo —</option>' +
        list.map(t => `<option value="${t.id}" ${t.id === current ? 'selected' : ''}>${escapeHtml(t.name || 'Torneo')}</option>`).join('');
      if (current) sel.value = current;
      sel.onchange = () => {
        if (sel.value) localStorage.setItem('ot_active_tournament_id', sel.value);
      };
    } catch (e) {
      console.error('Error cargando torneos en selector:', e);
    }
  }

  function escapeHtml(text) {
    return String(text || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  /**
   * Obtiene el ID del torneo activo basándose en el estado de la aplicación.
   */
  async function getCurrentTournamentId() {
    // 0. Si existe el selector de reportes, usarlo como primera opción
    const reportSel = document.getElementById('report-tournament-select');
    if (reportSel && reportSel.value) return reportSel.value;

    // 1. Intentar desde el estado global de admin.html (state.activeTournament)
    if (typeof state !== 'undefined' && state.activeTournament?.id) {
      return state.activeTournament.id;
    }
    // 2. Intentar desde el estado global de superadmin.html
    if (typeof window.__activeTournamentId !== 'undefined' && window.__activeTournamentId) {
      return window.__activeTournamentId;
    }
    // 3. Intentar desde localStorage
    const activeId = localStorage.getItem('ot_active_tournament_id');
    if (activeId) return activeId;
    // 4. Si no hay en localStorage, guardar el ID del torneo activo cuando se seleccione
    try {
      const tournaments = await Tournament.listMine();
      const active = tournaments.find(t => t.status === 'active' || t.status === 'open') || tournaments[0];
      if (active?.id) {
        localStorage.setItem('ot_active_tournament_id', active.id);
        return active.id;
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  // Ejecutar inicialización cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
