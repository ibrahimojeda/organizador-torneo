// superadmin.js — Panel exclusivo para super_admin
// Estructura base, lógica modular y placeholders para cada sección

(function () {
  // --- Helpers ---
  const $ = id => document.getElementById(id);
  const content = document.getElementById('superadmin-content');

  // --- Navegación ---
  const views = {
    users: renderUsersView,
    tournaments: renderTournamentsView,
    payments: renderPaymentsView,
    stats: renderStatsView,
    logs: renderLogsView,
    settings: renderSettingsView
  };

  function showView(view) {
    content.innerHTML = '';
    if (views[view]) views[view]();
  }

  // --- Renderizadores de cada sección ---
  function renderUsersView() {
    content.innerHTML = `<h2>Gestión de Usuarios</h2><div id="users-table">Cargando usuarios...</div>`;
    // Aquí irá la lógica para listar, activar/desactivar, cambiar roles, etc.
  }

  function renderTournamentsView() {
    content.innerHTML = `<h2>Torneos por Organizador</h2><div id="tournaments-table">Cargando torneos...</div>`;
    // Aquí irá la lógica para ver todos los torneos y entrar a ellos
  }

  function renderPaymentsView() {
    content.innerHTML = `<h2>Calculadora de Pagos</h2><div id="payments-calc">Herramienta editable próximamente...</div>`;
    // Aquí irá la calculadora/tabulador de pagos
  }

  function renderStatsView() {
    content.innerHTML = `<h2>Estadísticas Globales</h2><div id="stats-panel">Cargando estadísticas...</div>`;
    // Aquí irá el dashboard de estadísticas
  }

  function renderLogsView() {
    content.innerHTML = `<h2>Logs y Auditoría</h2><div id="logs-table">Cargando logs...</div>`;
    // Aquí irá el panel de logs y auditoría
  }

  function renderSettingsView() {
    content.innerHTML = `<h2>Configuración Avanzada</h2><div id="settings-panel">Opciones avanzadas próximamente...</div>`;
    // Aquí irá la configuración avanzada
  }

  // --- Eventos de navegación ---
  document.getElementById('nav-users').onclick = () => showView('users');
  document.getElementById('nav-tournaments').onclick = () => showView('tournaments');
  document.getElementById('nav-payments').onclick = () => showView('payments');
  document.getElementById('nav-stats').onclick = () => showView('stats');
  document.getElementById('nav-logs').onclick = () => showView('logs');
  document.getElementById('nav-settings').onclick = () => showView('settings');
  document.getElementById('btn-logout').onclick = () => Auth.logout();

  // --- Redirección si no es super_admin ---
  if (!Auth.isSuperAdmin()) {
    window.location.href = 'admin.html';
  }

  // --- Vista inicial ---
  showView('users');
})();
