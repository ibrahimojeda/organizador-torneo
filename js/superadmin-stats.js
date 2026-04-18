// superadmin-stats.js — Estadísticas globales

(async function () {
  const statsPanel = document.getElementById('stats-panel');
  if (!statsPanel) return;
  statsPanel.innerHTML = '<span class="spinner"></span> Cargando estadísticas...';
  try {
    const [users, tournaments] = await Promise.all([
      Auth.listProfiles(),
      Tournament.listAll()
    ]);
    // Simulación: sumar inscripciones y pagos si existen métodos
    let inscripciones = 0, pagos = 0;
    if (typeof Tournament.countRegistrations === 'function') {
      for (const t of tournaments) {
        inscripciones += await Tournament.countRegistrations(t.id);
      }
    }
    if (typeof Tournament.sumPayments === 'function') {
      for (const t of tournaments) {
        pagos += await Tournament.sumPayments(t.id);
      }
    }
    statsPanel.innerHTML = `<ul>
      <li><b>Usuarios:</b> ${users.length}</li>
      <li><b>Torneos:</b> ${tournaments.length}</li>
      <li><b>Inscripciones:</b> ${inscripciones || 'N/D'}</li>
      <li><b>Total Pagos:</b> $${pagos || 'N/D'}</li>
    </ul>`;
  } catch (err) {
    statsPanel.innerHTML = `<div class="alert alert-danger">Error al cargar estadísticas: ${err.message}</div>`;
  }
})();
// superadmin-stats.js — Estadísticas globales

async function loadStatsPanel() {
  const panel = document.getElementById('stats-panel');
  panel.innerHTML = '<span class="spinner"></span> Cargando...';
  try {
    // Simulación de estadísticas
    panel.innerHTML = `<ul>
      <li><b>Usuarios totales:</b> <span id='stat-users'>-</span></li>
      <li><b>Torneos totales:</b> <span id='stat-tournaments'>-</span></li>
      <li><b>Inscripciones totales:</b> <span id='stat-registrations'>-</span></li>
    </ul>`;
    // Aquí deberías cargar los datos reales
  } catch (err) {
    panel.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
  }
}
