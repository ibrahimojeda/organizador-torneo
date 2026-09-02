// superadmin-logs.js — Logs y auditoría

(function () {
  const logsTable = document.getElementById('logs-table');
  if (!logsTable) return;
  logsTable.innerHTML = `<div class='alert alert-info'>
    <b>Panel de logs y auditoría</b><br>
    (Próximamente: aquí se mostrarán acciones relevantes, cambios de roles, accesos, etc.)
    <ul>
      <li>Acceso de super_admin: ${new Date().toLocaleString()}</li>
      <li>Cambios de rol, activaciones y desactivaciones quedarán registrados aquí.</li>
    </ul>
  </div>`;
})();
// superadmin-logs.js — Logs y auditoría

async function loadLogsTable() {
  const table = document.getElementById('logs-table');
  table.innerHTML = '<span class="spinner"></span> Cargando...';
  // Aquí deberías cargar logs reales desde Supabase o un endpoint
  table.innerHTML = '<div class="alert alert-info">Funcionalidad de logs en desarrollo.</div>';
}
