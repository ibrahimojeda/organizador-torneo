// superadmin-users.js — Gestión avanzada de usuarios para superadmin

(async function () {
  const usersTable = document.getElementById('users-table');
  if (!usersTable) return;

  let allUsers = [];
  await loadUsers();

  async function loadUsers() {
    usersTable.innerHTML = '<span class="spinner"></span> Cargando usuarios...';
    try {
      allUsers = await Auth.listProfiles();
      renderLayout();
      applyFilters();
    } catch (err) {
      usersTable.innerHTML = `<div class="alert alert-danger">Error al cargar usuarios: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderLayout() {
    usersTable.innerHTML = `
      <div class="card mb-3" style="padding:16px;">
        <h3 style="margin-top:0;">Crear usuario</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;">
          <input id="new-user-name" class="form-control" style="min-width:180px;" placeholder="Nombre completo">
          <input id="new-user-email" class="form-control" style="min-width:220px;" type="email" placeholder="correo@dominio.com">
          <input id="new-user-password" class="form-control" style="min-width:160px;" type="password" placeholder="Contraseña">
          <select id="new-user-role" class="form-control" style="min-width:150px;">
            <option value="organizer">Organizador</option>
            <option value="referee">Mesa Técnica</option>
            <option value="super_admin">Super Admin</option>
          </select>
          <button id="create-user-btn" class="btn btn-primary" type="button">Crear</button>
        </div>
      </div>

      <form id="user-search-form" class="card mb-3" style="padding:16px;display:flex;gap:8px;flex-wrap:wrap;align-items:end;">
        <div>
          <label>Buscar</label>
          <input id="user-search" class="form-control" style="max-width:220px" placeholder="Nombre o ID...">
        </div>
        <div>
          <label>Rol</label>
          <select id="user-role-filter" class="form-control">
            <option value="">Todos los roles</option>
            <option value="organizer">Organizador</option>
            <option value="referee">Mesa Técnica</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>
        <div>
          <label>Estado</label>
          <select id="user-active-filter" class="form-control">
            <option value="">Todos</option>
            <option value="1">Activos</option>
            <option value="0">Inactivos</option>
          </select>
        </div>
        <button id="user-search-btn" class="btn btn-primary" type="button">Buscar</button>
      </form>

      <div id="users-table-inner"></div>
    `;
    attachCreateUser();
    attachFilterEvents();
  }

  function renderUsersTable(users) {
    const inner = document.getElementById('users-table-inner');
    if (!inner) return;
    if (!users.length) {
      inner.innerHTML = '<div class="alert alert-info">No hay usuarios para este filtro.</div>';
      return;
    }

    inner.innerHTML = `
      <table class="table table-sm">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>ID / referencia</th>
            <th>Rol</th>
            <th>Activo</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr data-id="${u.id}">
              <td><input class="form-control user-name" value="${escapeHtml(u.full_name || '')}" placeholder="Nombre"></td>
              <td><small>${escapeHtml(u.id)}</small></td>
              <td><select class="form-control user-role">${renderRoleOptions(u.role)}</select></td>
              <td style="text-align:center;"><input type="checkbox" class="user-active" ${u.active !== false ? 'checked' : ''}></td>
              <td>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  <button class="btn btn-xs btn-outline user-save" type="button">Guardar</button>
                  <button class="btn btn-xs btn-danger user-delete" type="button">Eliminar</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    attachRowActions();
  }

  function attachCreateUser() {
    const btn = document.getElementById('create-user-btn');
    if (!btn) return;
    btn.onclick = async () => {
      const fullName = document.getElementById('new-user-name')?.value?.trim() || '';
      const email = document.getElementById('new-user-email')?.value?.trim() || '';
      const password = document.getElementById('new-user-password')?.value || '';
      const role = document.getElementById('new-user-role')?.value || 'organizer';

      if (!email || !password) {
        alert('Debes indicar correo y contraseña.');
        return;
      }
      if (password.length < 6) {
        alert('La contraseña debe tener al menos 6 caracteres.');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Creando...';
      try {
        await Auth.createUser(email, password, role, fullName);
        document.getElementById('new-user-name').value = '';
        document.getElementById('new-user-email').value = '';
        document.getElementById('new-user-password').value = '';
        await loadUsers();
        alert('Usuario creado correctamente.');
      } catch (err) {
        alert('No se pudo crear el usuario: ' + (err.message || err));
      } finally {
        btn.disabled = false;
        btn.textContent = 'Crear';
      }
    };
  }

  function attachFilterEvents() {
    const btn = document.getElementById('user-search-btn');
    const form = document.getElementById('user-search-form');
    if (btn) btn.onclick = applyFilters;
    if (form) form.onsubmit = function (e) {
      e.preventDefault();
      applyFilters();
      return false;
    };
  }

  function applyFilters() {
    const search = document.getElementById('user-search');
    const roleFilter = document.getElementById('user-role-filter');
    const activeFilter = document.getElementById('user-active-filter');

    let filtered = [...allUsers];
    const q = (search?.value || '').toLowerCase().trim();
    if (q) {
      filtered = filtered.filter(u =>
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.id || '').toLowerCase().includes(q)
      );
    }
    if (roleFilter?.value) filtered = filtered.filter(u => u.role === roleFilter.value);
    if (activeFilter?.value) filtered = filtered.filter(u => (!!u.active) === (activeFilter.value === '1'));

    renderUsersTable(filtered);
  }

  function attachRowActions() {
    document.querySelectorAll('.user-save').forEach(btn => {
      btn.onclick = async () => {
        const tr = btn.closest('tr');
        const id = tr.dataset.id;
        const full_name = tr.querySelector('.user-name').value;
        const role = tr.querySelector('.user-role').value;
        const active = tr.querySelector('.user-active').checked;
        btn.disabled = true;
        btn.textContent = 'Guardando...';
        try {
          await Auth.updateProfile(id, { full_name, role, active });
          const row = allUsers.find(u => u.id === id);
          if (row) Object.assign(row, { full_name, role, active });
          btn.textContent = '✔';
        } catch (err) {
          alert('Error al guardar: ' + (err.message || err));
          btn.textContent = 'Error';
        } finally {
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = 'Guardar';
          }, 800);
        }
      };
    });

    document.querySelectorAll('.user-active').forEach(chk => {
      chk.onchange = async () => {
        const tr = chk.closest('tr');
        const id = tr.dataset.id;
        const active = chk.checked;
        try {
          await Auth.updateActive(id, active);
          const row = allUsers.find(u => u.id === id);
          if (row) row.active = active;
        } catch (err) {
          chk.checked = !active;
          alert('Error al cambiar estado: ' + (err.message || err));
        }
      };
    });

    document.querySelectorAll('.user-delete').forEach(btn => {
      btn.onclick = async () => {
        const tr = btn.closest('tr');
        const id = tr.dataset.id;
        if (!confirm('¿Deseas eliminar este usuario del panel?')) return;
        btn.disabled = true;
        try {
          await Auth.deleteUser(id);
          allUsers = allUsers.filter(u => u.id !== id);
          applyFilters();
        } catch (err) {
          btn.disabled = false;
          alert('No se pudo eliminar: ' + (err.message || err));
        }
      };
    });
  }

  function renderRoleOptions(selected) {
    const roles = ['organizer', 'referee', 'super_admin'];
    return roles.map(role => `<option value="${role}" ${role === selected ? 'selected' : ''}>${role}</option>`).join('');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
})();
