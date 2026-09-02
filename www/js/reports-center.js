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

    // 1. Imprimir Llaves (A4)
    const btnBrackets = document.getElementById('btn-report-brackets');
    if (btnBrackets) {
      btnBrackets.onclick = async () => {
        try {
          const tournamentId = await getCurrentTournamentId();
          if (!tournamentId) return _toast('Selecciona un torneo primero', 'warning');
          _toast('Generando llaves profesionales...', 'info');
          await Reports.printBrackets(tournamentId);
        } catch (e) {
          console.error(e);
          _toast('Error al generar llaves: ' + e.message, 'error');
        }
      };
    }

    // 2. Imprimir Medallero
    const btnMedals = document.getElementById('btn-report-medals');
    if (btnMedals) {
      btnMedals.onclick = async () => {
        try {
          const tournamentId = await getCurrentTournamentId();
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
          const tournamentId = await getCurrentTournamentId();
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
    return String(text || '').replace(/[&<>"']/g, c => ({ '&':'&', '<':'<', '>':'>', '"':'"', "'":'&#39;' }[c]));
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
