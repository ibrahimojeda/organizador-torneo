/* ============================================================
   SUPERADMIN-DOJOS.JS — Gestión de Dojos (Base Global)
   El super admin administra la base maestra de dojos con datos
   de contacto completos, asigna visibilidad por torneo y
   aprueba/rechaza solicitudes de actualización de datos.
   ============================================================ */
(function () {
  if (!Auth.isSuperAdmin()) return;

  const $ = (id) => document.getElementById(id);

  /* ---- Estado ---- */
  let _editingDojoId = null;
  let _allDojos = [];
  let _allTournaments = [];

  /* ---- Inicialización: cargar al entrar al panel ---- */
  async function loadDojos() {
    const el = $('sa-dojos-list');
    if (!el) return;
    el.innerHTML = '<div class="text-center p-4"><span class="spinner"></span></div>';
    try {
      _allDojos = await Dojos.listAllForSuperAdmin();
      _allTournaments = await Tournament.listAll().catch(() => []);
      el.innerHTML = _renderDojosTable(_allDojos);
      _renderRequests();
    } catch (e) {
      el.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
  }

  function _renderDojosTable(dojos) {
    if (!dojos.length) {
      return '<div class="empty-state"><div class="empty-icon">🥋</div><h3>Sin dojos</h3><p>Creá el primer dojo de la base global.</p></div>';
    }
    const rows = dojos.map(d => `
      <tr>
        <td>${d.logo_url ? `<img src="${d.logo_url}" alt="" style="width:38px;height:38px;object-fit:contain;border-radius:5px;" />` : '<span class="text-muted">—</span>'}</td>
        <td><strong>${d.name}</strong></td>
        <td class="text-sm">${d.country_name || d.country_code || '—'}</td>
        <td class="text-sm">${d.contact_name || '—'}</td>
        <td class="text-sm">${d.email || '—'}</td>
        <td class="text-sm">${d.phone || d.whatsapp || '—'}</td>
        <td class="text-sm">${d.city || '—'}</td>
        <td class="flex gap-1">
          <button class="btn btn-outline btn-sm" onclick="superadminDojos.edit('${d.id}')">✏️ Editar</button>
          <button class="btn btn-outline btn-sm" onclick="superadminDojos.openAccess('${d.id}')">👁 Visibilidad</button>
          <button class="btn btn-ghost btn-sm text-danger" onclick="superadminDojos.remove('${d.id}')">🗑</button>
        </td>
      </tr>
    `).join('');
    return `<div class="card p-0"><div class="table-wrapper"><table class="table"><thead><tr>
      <th>Logo</th><th>Dojo</th><th>País</th><th>Contacto</th><th>Email</th><th>Teléfono</th><th>Ciudad</th><th>Acciones</th>
    </tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  /* ---- Solicitudes de actualización pendientes (localStorage) ---- */
  function _renderRequests() {
    const wrap = $('sa-dojo-requests');
    if (!wrap) return;
    let reqs = [];
    try { reqs = JSON.parse(localStorage.getItem('ot_dojo_update_requests') || '[]'); } catch (_) {}
    if (!reqs.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    wrap.innerHTML = `
      <div class="card">
        <div class="flex items-center justify-between" style="padding:.75rem 1rem;border-bottom:1px solid var(--border);">
          <h3 class="card-title" style="margin:0;">🔔 Solicitudes de actualización de dojos</h3>
          <span class="badge badge-gold">${reqs.length}</span>
        </div>
        <div style="padding:.75rem 1rem;">
          ${reqs.map((r, i) => `
            <div class="flex items-center justify-between mb-2" style="border-bottom:1px solid var(--border);padding-bottom:.5rem;">
              <div>
                <strong class="text-sm">${r.dojoName}</strong>
                <div class="text-xs text-muted">Datos aportados: ${Object.keys(r.payload || {}).join(', ') || '—'}</div>
              </div>
              <div class="flex gap-2">
                <button class="btn btn-sm btn-outline" onclick="superadminDojos.approveRequest(${i})">✅ Aprobar</button>
                <button class="btn btn-sm btn-ghost" onclick="superadminDojos.rejectRequest(${i})">✕ Rechazar</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /* ---- Aplica el payload de contacto a un dojo (aprobación) ---- */
  async function _applyRequestPayload(dojoId, payload) {
    const dojo = _allDojos.find(d => d.id === dojoId);
    if (!dojo) return;
    const clean = {};
    Object.entries(payload || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') clean[k] = v;
    });
    if (Object.keys(clean).length) {
      await Dojos.update(dojoId, clean);
    }
  }


  /* ---- Métodos públicos del panel ---- */
  window.superadminDojos = {
    approveRequest: async function(idx) {
      let reqs = [];
      try { reqs = JSON.parse(localStorage.getItem('ot_dojo_update_requests') || '[]'); } catch (_) {}
      const req = reqs[idx];
      if (!req) return;
      try {
        await _applyRequestPayload(req.dojoId, req.payload);
        reqs.splice(idx, 1);
        localStorage.setItem('ot_dojo_update_requests', JSON.stringify(reqs));
        Display.toast('Datos del dojo actualizados.', 'success');
        loadDojos();
      } catch (e) { Display.toast(e.message, 'error'); }
    },
    rejectRequest: function(idx) {
      let reqs = [];
      try { reqs = JSON.parse(localStorage.getItem('ot_dojo_update_requests') || '[]'); } catch (_) {}
      if (!reqs[idx]) return;
      reqs.splice(idx, 1);
      localStorage.setItem('ot_dojo_update_requests', JSON.stringify(reqs));
      Display.toast('Solicitud rechazada.', 'info');
      loadDojos();
    },
    edit: async function(id) {
      const dojo = _allDojos.find(d => d.id === id) || await Dojos.getById(id);
      if (!dojo) return;
      _editingDojoId = id;
      $('sa-dojo-form-id').value = id;
      $('sa-dojo-form-title').textContent = 'Editar Dojo';
      $('sa-dojo-form-name').value = dojo.name || '';
      $('sa-dojo-form-country').value = dojo.country_name || dojo.country_code || '';
      $('sa-dojo-form-contact').value = dojo.contact_name || '';
      $('sa-dojo-form-email').value = dojo.email || '';
      $('sa-dojo-form-phone').value = dojo.phone || '';
      $('sa-dojo-form-whatsapp').value = dojo.whatsapp || '';
      $('sa-dojo-form-address').value = dojo.address || '';
      $('sa-dojo-form-city').value = dojo.city || '';
      $('sa-dojo-form-website').value = dojo.website || '';
      $('sa-dojo-form-instagram').value = dojo.instagram || '';
      $('sa-dojo-form-facebook').value = dojo.facebook || '';
      $('sa-dojo-form-tiktok').value = dojo.tiktok || '';
      $('sa-dojo-form-youtube').value = dojo.youtube || '';
      $('sa-dojo-form-notes').value = dojo.notes || '';
      $('sa-dojo-form-open').checked = dojo.open_registration !== false;
      $('sa-dojo-form-logo').value = '';
      $('sa-dojo-form-card').style.display = 'block';
    },
    remove: async function(id) {
      const dojo = _allDojos.find(d => d.id === id);
      if (!dojo) return;
      if (!confirm(`¿Eliminar el dojo "${dojo.name}" de la base global?`)) return;
      try {
        await Dojos.remove(id);
        Display.toast('Dojo eliminado.', 'success');
        loadDojos();
      } catch (e) { Display.toast(e.message, 'error'); }
    },

    openAccess: async function(id) {
      const dojo = _allDojos.find(d => d.id === id) || await Dojos.getById(id);
      if (!dojo) return;
      $('sa-dojo-access-name').textContent = `👁 ${dojo.name}`;
      const authSet = new Set(await _getAuthorizedByDojo(id));
      const tbody = $('sa-dojo-access-tbody');
      tbody.innerHTML = _allTournaments.map(t => `
        <tr>
          <td class="text-sm">${t.name}</td>
          <td><input type="checkbox" data-tid="${t.id}" ${authSet.has(t.id) ? 'checked' : ''} onchange="superadminDojos.toggleAccess('${id}','${t.id}',this.checked)" /></td>
        </tr>
      `).join('') || '<tr><td colspan="2" class="text-center text-muted">No hay torneos.</td></tr>';
      $('sa-dojo-access').style.display = 'block';
    },
    toggleAccess: async function(dojoId, tournamentId, checked) {
      try {
        if (checked) await Dojos.grantAccess(dojoId, tournamentId);
        else await Dojos.revokeAccess(dojoId, tournamentId);
        Display.toast(checked ? 'Dojo visible en el torneo.' : 'Dojo oculto en el torneo.', 'success');
      } catch (e) { Display.toast(e.message, 'error'); }
    },
    load: loadDojos,
  };

  async function _getAuthorizedByDojo(dojoId) {
    if (Auth.isDevMode()) {
      const tds = JSON.parse(localStorage.getItem('ot_dev_tournament_dojos') || '[]');
      return tds.filter(t => String(t.dojo_id) === String(dojoId)).map(t => t.tournament_id);
    }
    const { data } = await supabase.from('tournament_dojos').select('tournament_id').eq('dojo_id', dojoId);
    return (data || []).map(r => r.tournament_id);
  }

  /* ---- Formulario ---- */
  function _resetForm() {
    _editingDojoId = null;
    $('sa-dojo-form-card').style.display = 'none';
    $('sa-dojo-form-id').value = '';
    ['name','country','contact','email','phone','whatsapp','address','city','website','instagram','facebook','tiktok','youtube','notes'].forEach(k => $('sa-dojo-form-' + k).value = '');
    $('sa-dojo-form-open').checked = true;
  }

  $('btn-sa-new-dojo')?.addEventListener('click', () => {
    _resetForm();
    $('sa-dojo-form-title').textContent = 'Nuevo Dojo';
    $('sa-dojo-form-card').style.display = 'block';
  });
  $('btn-sa-cancel-dojo')?.addEventListener('click', _resetForm);
  $('btn-sa-close-access')?.addEventListener('click', () => { $('sa-dojo-access').style.display = 'none'; });

  $('btn-sa-save-dojo')?.addEventListener('click', async () => {
    const payload = {
      name: $('sa-dojo-form-name').value.trim(),
      country_name: $('sa-dojo-form-country').value.trim() || null,
      contact_name: $('sa-dojo-form-contact').value.trim() || null,
      email: $('sa-dojo-form-email').value.trim() || null,
      phone: $('sa-dojo-form-phone').value.trim() || null,
      whatsapp: $('sa-dojo-form-whatsapp').value.trim() || null,
      address: $('sa-dojo-form-address').value.trim() || null,
      city: $('sa-dojo-form-city').value.trim() || null,
      website: $('sa-dojo-form-website').value.trim() || null,
      instagram: $('sa-dojo-form-instagram').value.trim() || null,
      facebook: $('sa-dojo-form-facebook').value.trim() || null,
      tiktok: $('sa-dojo-form-tiktok').value.trim() || null,
      youtube: $('sa-dojo-form-youtube').value.trim() || null,
      notes: $('sa-dojo-form-notes').value.trim() || null,
      open_registration: $('sa-dojo-form-open').checked,
    };
    if (!payload.name) { Display.toast('El nombre del dojo es obligatorio.', 'warning'); return; }
    try {
      const file = $('sa-dojo-form-logo').files[0];
      if (_editingDojoId) {
        await Dojos.update(_editingDojoId, payload);
        if (file) await Dojos.uploadLogo(_editingDojoId, file);
        Display.toast('Dojo actualizado.', 'success');
      } else {
        const created = await Dojos.create(payload.name, payload, null);
        if (file) await Dojos.uploadLogo(created.id, file);
        Display.toast('Dojo creado.', 'success');
      }
      _resetForm();
      loadDojos();
    } catch (e) { Display.toast(e.message, 'error'); }
  });

  // Cargar al entrar al panel
  document.querySelector('.sidebar-item[data-panel="dojos"]')?.addEventListener('click', () => {
    loadDojos();
  });
})();
