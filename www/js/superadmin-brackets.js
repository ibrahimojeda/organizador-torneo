(function(){
  const panel = document.getElementById('panel-brackets');
  if (!panel) return;
  panel.innerHTML = `
    <div class="page-header"><h1 class="page-title">Llaves</h1><p class="page-subtitle">Generar y exportar llaves</p></div>
    <div class="card" style="padding:12px;display:flex;gap:8px;align-items:center;">
      <select id="brackets-tournament" class="form-control"></select>
      <button id="btn-generate-all" class="btn btn-primary">Armar todas las llaves</button>
      <button id="btn-export-all" class="btn btn-outline">Exportar todas (HTML)</button>
    </div>
    <div id="brackets-result" style="margin-top:12px;"></div>
  `;

  async function init() {
    const sel = document.getElementById('brackets-tournament');
    sel.innerHTML = '<option>Cargando...</option>';
    try {
      const list = await (Auth.isSuperAdmin() ? Tournament.listAll() : Tournament.listMine());
      sel.innerHTML = list.map(t => `<option value="${t.id}">${t.name} — ${t.date_start || ''}</option>`).join('');
    } catch (e) { sel.innerHTML = '<option>Error cargando torneos</option>'; }

    document.getElementById('btn-generate-all').onclick = async () => {
      const tid = sel.value; if (!tid) return Display.toast('Selecciona un torneo', 'warning');
      const out = document.getElementById('brackets-result'); out.innerHTML = 'Generando...';
      try {
        const res = await Bracket.generateAll(tid);
        out.innerHTML = '<pre style="white-space:pre-wrap">' + JSON.stringify(res, null, 2) + '</pre>';
        Display.toast('Generación completada', 'success');
      } catch (e) { out.innerHTML = 'Error: ' + e.message; Display.toast('Error generando llaves', 'error'); }
    };

    document.getElementById('btn-export-all').onclick = async () => {
      const tid = sel.value; if (!tid) return Display.toast('Selecciona un torneo', 'warning');
      Display.toast('Exportando llaves...', 'info');
      try {
        const matches = await Bracket.getByTournamentId(tid);
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Llaves</title><style>body{font-family:Arial,Helvetica,sans-serif} .match{border-bottom:1px solid #eee;padding:6px}</style></head><body><h2>Llaves del torneo</h2>${matches.map(m=>`<div class="match">Cat:${m.category_id} R${m.round} P${m.position} — A:${m.competitor_a_id||'—'} vs B:${m.competitor_b_id||'—'}</div>`).join('')}</body></html>`;
        const w = window.open('', '_blank','width=1000,height=800'); if (!w) return; w.document.write(html); w.document.close();
      } catch (e) { Display.toast('Error exportando', 'error'); }
    };
  }
  init();
})();
