// superadmin-settings.js — Configuración avanzada

(function () {
  const settingsPanel = document.getElementById('settings-panel');
  if (!settingsPanel) return;
  settingsPanel.innerHTML = `
    <h3>Configuración avanzada</h3>
    <ul>
      <li>Gestión de asociaciones y clubes (próximamente)</li>
      <li>Configuración de reglas de torneo (categorías, tatamis, horarios)</li>
      <li>Control de acceso rápido a cualquier vista</li>
      <li>Opciones de soporte y administración global</li>
    </ul>
    <div class='alert alert-info'>Próximamente más opciones avanzadas.</div>
  `;
})();
// superadmin-settings.js — Configuración avanzada

function renderSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  panel.innerHTML = '<div>Opciones avanzadas próximamente...</div>';
}
