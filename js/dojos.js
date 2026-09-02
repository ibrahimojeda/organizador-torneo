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
     LISTAR DOJOS
  -------------------------------------------------------- */
  async function list() {
    if (Auth.isDevMode()) return _devList();
    const { data, error } = await supabase
      .from(TABLE_DOJOS)
      .select('id, name, logo_url, website, notes')
      .order('name');
    if (error) throw error;
    return data || [];
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
     CREAR DOJO
  -------------------------------------------------------- */
  async function create(name) {
    if (!name?.trim()) throw new Error('El nombre del dojo es obligatorio.');
    if (Auth.isDevMode()) {
      const list = _devList();
      const exists = list.find(d => d.name.toLowerCase() === name.trim().toLowerCase());
      if (exists) return exists;
      const dojo = { id: generateId(), name: name.trim(), logo_url: null };
      list.push(dojo);
      _devSave(list);
      return dojo;
    }
    const { data, error } = await supabase
      .from(TABLE_DOJOS)
      .insert({ name: name.trim() })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        const { data: existing } = await supabase
          .from(TABLE_DOJOS).select('*').eq('name', name.trim()).maybeSingle();
        return existing || null;
      }
      throw error;
    }
    return data;
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
      .upload(fileName, file, { upsert: true });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage
      .from('tournament-assets')
      .getPublicUrl(fileName);
    const { error: updateError } = await supabase
      .from(TABLE_DOJOS)
      .update({ logo_url: publicUrl })
      .eq('id', dojoId);
    if (updateError) throw updateError;
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
    const flag = info.flag || '';
    const name = info.name || countryName;
    return `<span style="display:inline-flex;align-items:center;gap:4px;"><span style="font-size:${size}px;line-height:1;">${flag}</span><span>${name}</span></span>`;
  }

  /* --------------------------------------------------------
     CACHÉ DE DOJOS (evita consultas repetidas)
  -------------------------------------------------------- */
  let _cachedDojos = null;

  function _getCachedMap() {
    return _cachedDojos || new Map();
  }

  /**
   * Carga la lista de dojos en caché (para renderizado rápido)
   */
  async function ensureCache() {
    if (_cachedDojos && _cachedDojos.size) return _cachedDojos;
    const dojos = await list();
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

  return {
    list,
    getById,
    create,
    update,
    uploadLogo,
    ensureCache,
    getFromCache,
    invalidateCache,
    renderDojoBadge,
    renderCountryBadge,
  };
})();