(function(){
  const panel = document.getElementById('panel-medals');
  if (!panel) return;
  panel.innerHTML = `
    <div class="page-header"><h1 class="page-title">Medallero</h1><p class="page-subtitle">Imprimir medallero por torneo</p></div>
    <div class="card" style="padding:12px;">
      <div style="display:flex;gap:8px;align-items:center;">
        <select id="report-tournament" class="form-control"></select>
        <button id="btn-print-medals" class="btn btn-primary">Imprimir Medallero</button>
      </div>
    </div>
  `;

  async function init() {
    const sel = document.getElementById('report-tournament');
    sel.innerHTML = '<option>Cargando...</option>';
    try {
      const list = await (Auth.isSuperAdmin() ? Tournament.listAll() : Tournament.listMine());
      sel.innerHTML = list.map(t => `<option value="${t.id}">${t.name} — ${t.date_start || ''}</option>`).join('');
    } catch (e) { sel.innerHTML = '<option>Error cargando torneos</option>'; }
    document.getElementById('btn-print-medals').onclick = async () => {
      const tid = sel.value; if (!tid) return Display.toast('Selecciona un torneo', 'warning');
      Display.toast('Generando medallero...', 'info');
      try { await Reports.printMedallero(tid); } catch (e) { Display.toast('Error generando medallero', 'error'); }
    };
  }
  init();
})();
