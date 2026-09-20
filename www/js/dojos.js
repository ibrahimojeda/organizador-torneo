/* ============================================================
   DOJOS.JS — Gestión de Dojos con logos
   ============================================================ */

const Dojos = (() => {
  const TABLE_DOJOS = 'dojos';
  const STORAGE_KEY = 'ot_dev_dojos';

  /* ---- Dev helpers ---- */
  function _devList() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
  function _devSave(list) { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }

  /* --------------------------------------------------------
     LISTAR DOJOS VISIBLES PARA UN TORNEO
     = autorizados (tournament_dojos) ∪ dojos de inscripciones
       del torneo ∪ (si super_admin) todos los globales.
     @param {string} tournamentId
  -------------------------------------------------------- */
  async function list(tournamentId) {
    if (Auth.isDevMode()) {
      const all = _devList();
      if (Auth.isSuperAdmin() && !tournamentId) return all;
      if (tournamentId) {
        const authorized = (JSON.parse(localStorage.getItem('ot_dev_tournament_dojos') || '[]'))
          .filter(td => String(td.tournament_id) === String(tournamentId))
          .map(td => td.dojo_id);
        return all.filter(d => authorized.includes(d.id) || String(d.tournament_id) === String(tournamentId));
      }
      return all;
    }
    let query = supabase
      .from(TABLE_DOJOS)
      .select('id, name, logo_url, country_code, country_name, email, phone, whatsapp, address, city, instagram, facebook, tiktok, youtube, contact_name, website, notes, tournament_id, open_registration')
      .order('name');
    if (Auth.isSuperAdmin() && !tournamentId) {
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }
    // Organizador: dojos autorizados para su torneo O con inscripciones en él.
    if (tournamentId) {
      const authed = await _getAuthorizedIds(tournamentId);
      const inscritos = await _getInscribedIds(tournamentId);
      const allowed = new Set([...authed, ...inscritos]);
      query = query.in('id', [...allowed]);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /* ---- Auxiliares de visibilidad ---- */
  async function _getAuthorizedIds(tournamentId) {
    try {
      const { data } = await supabase
        .from('tournament_dojos')
        .select('dojo_id')
        .eq('tournament_id', tournamentId);
      return (data || []).map(r => r.dojo_id);
    } catch (_) { return []; }
  }

  async function _getInscribedIds(tournamentId) {
    try {
      const { data } = await supabase
        .from('registrations')
        .select('competitors!inner(dojo_id)')
        .eq('tournament_id', tournamentId)
        .not('competitors.dojo_id', 'is', null);
      const ids = new Set();
      (data || []).forEach(r => {
        const dojoId = r?.competitors?.dojo_id;
        if (dojoId) ids.add(dojoId);
      });
      return [...ids];
    } catch (_) { return []; }
  }

  /* --------------------------------------------------------
     OBTENER DOJO POR ID
  -------------------------------------------------------- */
  async function getById(id) {
    if (!id) return null;
    if (Auth.isDevMode()) return _devList().find(d => d.id === id) || null;
    const { data, error } = await supabase
      .from(TABLE_DOJOS)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  /* --------------------------------------------------------
     CREAR DOJO (GLOBAL ÚNICO por nombre)
     Si ya existe un dojo con ese nombre, NO se duplica:
     se reutiliza y (si viene tournamentId) se otorga visibilidad
     al torneo. El super admin es quien administra los datos
     maestros. Si un organizador aporta datos nuevos al coincidir,
     se avisa al super admin (se guardan como solicitud).
  -------------------------------------------------------- */
  async function create(name, payload = {}, tournamentId) {
    if (!name?.trim()) throw new Error('El nombre del dojo es obligatorio.');

    const existing = await _findByNameGlobal(name.trim());
    if (existing) {
      // No duplicar. Otorgar visibilidad al torneo si aplica.
      if (tournamentId) {
        try { await grantAccess(existing.id, tournamentId); } catch (_) {}
      }
      // Si el organizador aporta datos (y no es super admin), NO sobrescribir:
      // se registra como "solicitud de actualización" para el super admin.
      const cleanPayload = _cleanContact(payload);
      const hasNewData = Object.keys(cleanPayload).length > 0;
      if (hasNewData && existing && !Auth.isSuperAdmin()) {
        _notifyUpdateRequest(existing, cleanPayload);
        return existing;
      }
      if (hasNewData && Auth.isSuperAdmin()) {
        return await update(existing.id, cleanPayload);
      }
      return existing;
    }

    if (Auth.isDevMode()) {
      const list = _devList();
      const dojo = { id: generateId(), name: name.trim(), logo_url: null, tournament_id: tournamentId || null, ...cleanContact(payload) };
      list.push(dojo);
      _devSave(list);
      if (tournamentId) {
        const tds = JSON.parse(localStorage.getItem('ot_dev_tournament_dojos') || '[]');
        tds.push({ id: generateId(), tournament_id: tournamentId, dojo_id: dojo.id });
        localStorage.setItem('ot_dev_tournament_dojos', JSON.stringify(tds));
      }
      invalidateCache();
      return dojo;
    }

    const insertPayload = {
      name: name.trim(),
      ...cleanContact(payload),
      tournament_id: tournamentId || null,
    };
    const { data, error } = await supabase
      .from(TABLE_DOJOS)
      .insert(insertPayload)
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        const existing2 = await _findByNameGlobal(name.trim());
        if (tournamentId) { try { await grantAccess(existing2.id, tournamentId); } catch (_) {} }
        return existing2 || null;
      }
      throw error;
    }
    if (tournamentId) { try { await grantAccess(data.id, tournamentId); } catch (_) {} }
    invalidateCache();
    return data;
  }

  /* ---- Buscar dojo global por nombre (case-insensitive) ---- */
  async function _findByNameGlobal(name) {
    if (Auth.isDevMode()) {
      return _devList().find(d => d.name.toLowerCase() === name.toLowerCase()) || null;
    }
    const { data } = await supabase
      .from(TABLE_DOJOS)
      .select('*')
      .ilike('name', name)   // PostgREST ilike: coincidencia sin importar mayúsculas
      .maybeSingle();
    return data || null;
  }

  /* ---- Limpiar payload de contacto ---- */
  function _cleanContact(payload = {}) {
    const out = {};
    ['email', 'phone', 'whatsapp', 'address', 'city', 'country_code', 'country_name',
     'instagram', 'facebook', 'tiktok', 'youtube', 'contact_name', 'website', 'notes',
     'open_registration'].forEach(k => {
      if (payload[k] !== undefined) out[k] = payload[k] === '' ? null : payload[k];
    });
    return out;
  }

  /* ---- Notificar al super admin de datos aportados por un organizador ---- */
  function _notifyUpdateRequest(dojo, payload) {
    // Por ahora se guarda en localStorage como pendiente (el superadmin lo ve al abrir su panel).
    try {
      const reqs = JSON.parse(localStorage.getItem('ot_dojo_update_requests') || '[]');
      reqs.push({
        dojoId: dojo.id,
        dojoName: dojo.name,
        payload,
        by: Auth.getUserId(),
        at: new Date().toISOString(),
      });
      localStorage.setItem('ot_dojo_update_requests', JSON.stringify(reqs));
    } catch (_) {}
    console.warn('[Dojos] Se solicitó actualizar datos del dojo (pendiente aprobación super admin):', dojo.name, payload);
  }
/* --------------------------------------------------------
     ACTUALIZAR DOJO
  -------------------------------------------------------- */
  async function update(id, payload) {
    if (Auth.isDevMode()) {
      const list = _devList().map(d => d.id === id ? { ...d, ...payload } : d);
      _devSave(list);
      return list.find(d => d.id === id);
    }
    const { data, error } = await supabase
      .from(TABLE_DOJOS)
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /* --------------------------------------------------------
     SUBIR LOGO A SUPABASE STORAGE
  -------------------------------------------------------- */
  async function uploadLogo(dojoId, file) {
    if (!dojoId || !file) throw new Error('Dojo ID y archivo requeridos.');
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)) throw new Error('El logo debe ser PNG, JPG, SVG o WEBP.');
    if (file.size > 2 * 1024 * 1024) throw new Error('La imagen supera los 2MB.');
    if (Auth.isDevMode()) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          const list = _devList().map(d => d.id === dojoId ? { ...d, logo_url: dataUrl } : d);
          _devSave(list);
          resolve(dataUrl);
        };
        reader.onerror = () => reject(new Error('Error al leer archivo'));
        reader.readAsDataURL(file);
      });
    }
    const ext = file.name.split('.').pop().toLowerCase();
    const fileName = `dojo_logos/${dojoId}_${Date.now()}.${ext}`;
    const { data: _up, error: uploadError } = await supabase.storage
      .from('tournament-assets')
      .upload(fileName, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
    if (uploadError) throw new Error(`No se pudo subir el logo. Verifica el bucket tournament-assets y sus políticas en Supabase. ${uploadError.message || ''}`.trim());
    const { data: { publicUrl } } = supabase.storage
      .from('tournament-assets')
      .getPublicUrl(fileName);
    const { error: updateError } = await supabase
      .from(TABLE_DOJOS)
      .update({ logo_url: publicUrl })
      .eq('id', dojoId);
    if (updateError) throw new Error(`El logo se subió, pero no se pudo guardar en el dojo: ${updateError.message || updateError}`);
    return publicUrl;
  }

  /* --------------------------------------------------------
     HELPERS DE RENDERIZADO
  -------------------------------------------------------- */
  function renderDojoBadge(dojoInfo, size = 24) {
    if (!dojoInfo) return '';
    const logoHtml = dojoInfo.logo_url
      ? `<img src="${dojoInfo.logo_url}" alt="${dojoInfo.name}" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:4px;display:inline-block;vertical-align:middle;" />`
      : `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;background:rgba(255,255,255,.1);border-radius:4px;font-size:${Math.round(size * 0.5)}px;">🥋</span>`;
    return `<span style="display:inline-flex;align-items:center;gap:4px;">${logoHtml}<span>${dojoInfo.name || ''}</span></span>`;
  }

  function renderCountryBadge(countryName, size = 16) {
    if (!countryName) return '';
    const info = getCountryInfo(countryName);
    const url = getCountryFlagUrl(info.code, size * 2.5);
    return url ? `<img src="${url}" alt="" title="${info.name}" style="width:${Math.round(size * 1.5)}px;height:${Math.round(size)}px;object-fit:cover;border-radius:2px;vertical-align:middle;" />` : '';
  }

  function renderCompetitorIdentity(competitor, size = 18) {
    const c = competitor?.competitors || competitor || {};
    const dojo = c.dojo_id ? getFromCache(c.dojo_id) : null;
    const country = c.country || dojo?.country_code;
    return `${renderDojoBadge(dojo, size)} ${renderCountryBadge(country, size)}`;
  }

  /* --------------------------------------------------------
     CACHÉ DE DOJOS (evita consultas repetidas)
  -------------------------------------------------------- */
  let _cachedDojos = null;

  function _getCachedMap() {
    return _cachedDojos || new Map();
  }

  /**
   * Carga la lista de dojos en caché (para renderizado rápido).
   * Si se pasa tournamentId, solo carga los dojos del torneo;
   * si no, carga todos (compatibilidad con referee/judge/public).
   */
  async function ensureCache(tournamentId) {
    if (_cachedDojos && _cachedDojos.size) return _cachedDojos;
    const dojos = await list(tournamentId);
    const map = new Map();
    dojos.forEach(d => map.set(d.id, d));
    _cachedDojos = map;
    return map;
  }

  function getFromCache(dojoId) {
    if (!dojoId || !_cachedDojos) return null;
    return _cachedDojos.get(dojoId) || null;
  }

  function invalidateCache() {
    _cachedDojos = null;
  }

  /* --------------------------------------------------------
     OTORGAR VISIBILIDAD de un dojo a un torneo (tournament_dojos)
     Solo super_admin (RLS). Si el organizador lo necesita, el
     sistema registra el dojo y llama a esto (falla silenciosa).
  -------------------------------------------------------- */
  async function grantAccess(dojoId, tournamentId) {
    if (!dojoId || !tournamentId) return null;
    if (Auth.isDevMode()) {
      const tds = JSON.parse(localStorage.getItem('ot_dev_tournament_dojos') || '[]');
      if (!tds.some(t => String(t.tournament_id) === String(tournamentId) && String(t.dojo_id) === String(dojoId))) {
        tds.push({ id: generateId(), tournament_id: tournamentId, dojo_id: dojoId });
        localStorage.setItem('ot_dev_tournament_dojos', JSON.stringify(tds));
      }
      return { dojo_id: dojoId, tournament_id: tournamentId };
    }
    const { data, error } = await supabase
      .from('tournament_dojos')
      .insert({ tournament_id: tournamentId, dojo_id: dojoId, granted_by: Auth.getUserId() })
      .select()
      .single();
    if (error) {
      // 23505 = ya otorgado
      if (error.code === '23505') return { dojo_id: dojoId, tournament_id: tournamentId };
      throw error;
    }
    return data;
  }

  /* --------------------------------------------------------
     QUITAR VISIBILIDAD de un dojo a un torneo
  -------------------------------------------------------- */
  async function revokeAccess(dojoId, tournamentId) {
    if (Auth.isDevMode()) {
      const tds = JSON.parse(localStorage.getItem('ot_dev_tournament_dojos') || '[]');
      localStorage.setItem('ot_dev_tournament_dojos', JSON.stringify(
        tds.filter(t => !(String(t.tournament_id) === String(tournamentId) && String(t.dojo_id) === String(dojoId)))
      ));
      return true;
    }
    const { error } = await supabase
      .from('tournament_dojos')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('dojo_id', dojoId);
    if (error) throw error;
    return true;
  }

  /* --------------------------------------------------------
     LISTAR IDS DE DOJOS AUTORIZADOS a un torneo
     @returns {string[]} ids de dojos con acceso
  -------------------------------------------------------- */
  async function listAuthorized(tournamentId) {
    if (!tournamentId) return [];
    if (Auth.isDevMode()) {
      return (JSON.parse(localStorage.getItem('ot_dev_tournament_dojos') || '[]'))
        .filter(t => String(t.tournament_id) === String(tournamentId))
        .map(t => t.dojo_id);
    }
    const { data, error } = await supabase
      .from('tournament_dojos')
      .select('dojo_id')
      .eq('tournament_id', tournamentId);
    if (error) throw error;
    return (data || []).map(r => r.dojo_id);
  }

  /* --------------------------------------------------------
     LISTAR DOJOS VISIBLES PARA SUPER ADMIN (todos los globales)
     Con datos de contacto completos.
  -------------------------------------------------------- */
  async function listAllForSuperAdmin() {
    if (Auth.isDevMode()) return _devList();
    const { data, error } = await supabase
      .from(TABLE_DOJOS)
      .select('*')
      .order('name');
    if (error) throw error;
    return data || [];
  }

  return {
    list,
    getById,
    create,
    update,
    uploadLogo,
    ensureCache,
    getFromCache,
    invalidateCache,
    grantAccess,
    revokeAccess,
    listAuthorized,
    listAllForSuperAdmin,
    renderDojoBadge,
    renderCountryBadge,
    renderCompetitorIdentity,
  };
})();