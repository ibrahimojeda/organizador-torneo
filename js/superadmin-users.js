// superadmin-users.js — Gestión de usuarios para superadmin


(async function () {
  const usersTable = document.getElementById('users-table');
  if (!usersTable) return;
  usersTable.innerHTML = '<span class="spinner"></span> Cargando usuarios...';
  let allUsers = [];
  try {
    allUsers = await Auth.listProfiles();
    renderAndAttach(allUsers);
  } catch (err) {
    usersTable.innerHTML = `<div class="alert alert-danger">Error al cargar usuarios: ${err.message}</div>`;
  }

  // Renderiza barra de búsqueda y filtros
  function renderAndAttach(users) {
    usersTable.innerHTML = `
      <div style="margin-bottom:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <input id="user-search" class="form-control" style="max-width:180px" placeholder="Buscar nombre/email...">
        <select id="user-role-filter" class="form-control">
          <option value="">Todos los roles</option>
          <option value="organizer">Organizador</option>
          <option value="referee">Árbitro</option>
          <option value="super_admin">Super Admin</option>
        </select>
        <select id="user-active-filter" class="form-control">
          <option value="">Todos</option>
          <option value="1">Activos</option>
          <option value="0">Inactivos</option>
        </select>
      </div>
      <div id="users-table-inner"></div>
    `;
    renderUsersTable(users);
    attachUserActions();
    attachFilters();
  }

  function renderUsersTable(users) {
    const inner = document.getElementById('users-table-inner');
    if (!users.length) {
      inner.innerHTML = '<div>No hay usuarios registrados.</div>';
      return;
    }
    inner.innerHTML = `<table class="table table-sm"><thead><tr><th>Email/ID</th><th>Nombre</th><th>Rol</th><th>Activo</th><th>Acciones</th></tr></thead><tbody>` +
      users.map(u => `<tr data-id="${u.id}"><td>${u.id}</td><td>${u.full_name||''}</td><td><select class="user-role">${renderRoleOptions(u.role)}</select></td><td><input type="checkbox" class="user-active" ${u.active!==false?'checked':''}></td><td><button class="btn btn-xs btn-outline user-save">Guardar</button></td></tr>`).join('') +
      '</tbody></table>';
  }

  function renderUsersTable(users) {
    if (!users.length) return '<div>No hay usuarios registrados.</div>';
    return `<table class="table table-sm"><thead><tr><th>Email/ID</th><th>Nombre</th><th>Rol</th><th>Activo</th><th>Acciones</th></tr></thead><tbody>` +
      users.map(u => `<tr data-id="${u.id}"><td>${u.id}</td><td>${u.full_name||''}</td><td><select class="user-role">${renderRoleOptions(u.role)}</select></td><td><input type="checkbox" class="user-active" ${u.active!==false?'checked':''}></td><td><button class="btn btn-xs btn-outline user-save">Guardar</button></td></tr>`).join('') +
      '</tbody></table>';
  }
  function renderRoleOptions(selected) {
    const roles = ['organizer','referee','super_admin'];
    return roles.map(r => `<option value="${r}"${r===selected?' selected':''}>${r}</option>`).join('');
  }
  function attachUserActions() {
    document.querySelectorAll('.user-save').forEach(btn => {
      btn.onclick = async function () {
        const tr = btn.closest('tr');
        const id = tr.dataset.id;
        const role = tr.querySelector('.user-role').value;
        const active = tr.querySelector('.user-active').checked;
        btn.disabled = true;
        btn.textContent = '...';
        try {
          await Auth.updateRole(id, role);
          await Auth.updateActive(id, active);
          btn.textContent = '✔';
        } catch (e) {
          btn.textContent = 'Error';
        } finally {
          setTimeout(()=>{btn.textContent='Guardar';btn.disabled=false;},1000);
        }
      };
    });
    document.querySelectorAll('.user-active').forEach(chk => {
      chk.onchange = async function () {
        const tr = chk.closest('tr');
        const id = tr.dataset.id;
        const active = chk.checked;
        chk.disabled = true;
        try {
          await Auth.updateActive(id, active);
        } catch (e) {
          alert('Error al cambiar estado: ' + (e.message || e));
          chk.checked = !active;
        } finally {
          chk.disabled = false;
        }
      };
    });
  }

  function attachFilters() {
    const search = document.getElementById('user-search');
    const roleFilter = document.getElementById('user-role-filter');
    const activeFilter = document.getElementById('user-active-filter');
    function filterUsers() {
      let filtered = allUsers;
      const q = (search.value || '').toLowerCase();
      if (q) {
        filtered = filtered.filter(u => (u.full_name||'').toLowerCase().includes(q) || (u.id||'').toLowerCase().includes(q));
      }
      const role = roleFilter.value;
      if (role) filtered = filtered.filter(u => u.role === role);
      const act = activeFilter.value;
      if (act) filtered = filtered.filter(u => (!!u.active) === (act === '1'));
      renderUsersTable(filtered);
      attachUserActions();
    }
    search.oninput = filterUsers;
    roleFilter.onchange = filterUsers;
    activeFilter.onchange = filterUsers;
  }
})();
// superadmin-users.js — Gestión de usuarios para super_admin

async function loadUsersTable() {
  const table = document.getElementById('users-table');
  table.innerHTML = '<span class="spinner"></span> Cargando...';
  try {
    const users = await Auth.listProfiles();
    if (!users.length) {
      table.innerHTML = '<div class="alert alert-info">No hay usuarios registrados.</div>';
      return;
    }
    let html = `<table class="table table-sm"><thead><tr><th>Nombre</th><th>Email/ID</th><th>Rol</th><th>Activo</th><th>Acciones</th></tr></thead><tbody>`;
    for (const u of users) {
      html += `<tr>
        <td>${u.full_name || ''}</td>
        <td><small>${u.id}</small></td>
        <td><select data-id="${u.id}" class="role-select">
          <option value="organizer"${u.role==='organizer'?' selected':''}>Organizador</option>
          <option value="referee"${u.role==='referee'?' selected':''}>Árbitro</option>
          <option value="super_admin"${u.role==='super_admin'?' selected':''}>Super Admin</option>
        </select></td>
        <td><input type="checkbox" data-id="${u.id}" class="active-toggle" checked disabled></td>
        <td><button class="btn btn-xs btn-outline" data-id="${u.id}" onclick="resetPassword('${u.id}')">Reset Pass</button></td>
      </tr>`;
    }
    html += '</tbody></table>';
    table.innerHTML = html;
    // Eventos para cambiar rol
    document.querySelectorAll('.role-select').forEach(sel => {
      sel.onchange = async e => {
        const userId = sel.getAttribute('data-id');
        const newRole = sel.value;
        try {
          await Auth.updateRole(userId, newRole);
          alert('Rol actualizado');
        } catch (err) {
          alert('Error: ' + err.message);
        }
      };
    });
  } catch (err) {
    table.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
  }
}

window.resetPassword = async function(userId) {
  alert('Funcionalidad de reseteo de contraseña pendiente de integración.');
};
