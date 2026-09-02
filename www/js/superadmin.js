// superadmin.js — Panel exclusivo para super_admin
// Estructura base, lógica modular y placeholders para cada sección


// superadmin.js — Panel exclusivo para super_admin
(function () {
  // --- Helpers ---
  function showPanel(panel) {
    // Oculta todos los paneles
    document.querySelectorAll('.panel').forEach(p => p.style.display = 'none');
    // Quita 'active' de todos los botones
    document.querySelectorAll('.sidebar-item').forEach(btn => btn.classList.remove('active'));
    // Muestra el panel seleccionado
    const section = document.getElementById('panel-' + panel);
    if (section) section.style.display = '';
    // Marca el botón como activo
    const btn = document.querySelector('.sidebar-item[data-panel="' + panel + '"]');
    if (btn) btn.classList.add('active');
  }

  // Asigna eventos a los botones del sidebar
  document.querySelectorAll('.sidebar-item').forEach(btn => {
    btn.addEventListener('click', function () {
      const panel = btn.getAttribute('data-panel');
      if (panel) showPanel(panel);
    });
  });

  // Botón logout
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) btnLogout.onclick = () => Auth.logout();

  // Redirección si no es super_admin
  if (typeof Auth !== 'undefined' && !Auth.isSuperAdmin()) {
    window.location.href = 'admin.html';
  }

  // Vista inicial: dashboard
  showPanel('dashboard');
})();
