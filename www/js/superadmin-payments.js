// superadmin-payments.js — Presupuesto, ingresos y cotización visual

(function () {
  const paymentsCalc = document.getElementById('payments-calc');
  if (!paymentsCalc) return;

  const DEFAULT_ITEMS = [
    { concepto: 'Alquiler de local', tipo: 'gasto', monto: 250 },
    { concepto: 'Tatamis y montaje', tipo: 'gasto', monto: 180 },
    { concepto: 'Medallas y trofeos', tipo: 'gasto', monto: 140 },
    { concepto: 'Árbitros y jueces', tipo: 'gasto', monto: 220 },
    { concepto: 'Sonido y mesa técnica', tipo: 'gasto', monto: 90 },
    { concepto: 'Hidratación y logística', tipo: 'gasto', monto: 70 },
    { concepto: 'Publicidad y diseño', tipo: 'gasto', monto: 55 },
    { concepto: 'Patrocinios confirmados', tipo: 'ingreso', monto: 0 },
  ];

  let items = DEFAULT_ITEMS.map(item => ({ ...item }));
  let tournaments = [];
  let athletes = 0;

  init();

  async function init() {
    paymentsCalc.innerHTML = '<span class="spinner"></span> Cargando calculadora financiera...';
    try {
      tournaments = await Tournament.listAll();
    } catch (_) {
      tournaments = [];
    }
    render();
    await refreshTournamentData();
  }

  function render() {
    paymentsCalc.innerHTML = `
      <div class="card mb-3" style="padding:16px;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;">
          <div>
            <label>Cotización</label>
            <select id="pay-tournament" class="form-control">
              <option value="custom">Nueva cotización manual</option>
              <option value="all">Todos los torneos</option>
              ${tournaments.map(t => `<option value="${t.id}">${escapeHtml(t.name || 'Torneo')}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>Nombre del torneo</label>
            <input id="quote-tournament-name" class="form-control" placeholder="Ej: Copa Nacional 2026">
          </div>
          <div>
            <label>Nombre del sensei</label>
            <input id="quote-sensei-name" class="form-control" placeholder="Sensei responsable">
          </div>
          <div>
            <label>Atletas estimados</label>
            <input id="manual-athletes" class="form-control" type="number" min="0" step="1" value="0">
          </div>
          <div>
            <label>Inscripción por atleta ($)</label>
            <input id="fee-per-athlete" class="form-control" type="number" min="0" step="0.01" value="20">
          </div>
          <div style="display:flex;gap:8px;">
            <button id="refresh-payments" class="btn btn-primary" type="button">Buscar</button>
            <button id="new-quote-btn" class="btn btn-outline" type="button">Nueva</button>
          </div>
        </div>
      </div>

      <div class="card mb-3" style="padding:16px;">
        <h3 style="margin-top:0;">Servicios y elementos del torneo</h3>
        <p class="text-muted">Incluye los rubros comunes de organización, operación, patrocinios y extras.</p>
        <table class="table table-sm">
          <thead><tr><th>Concepto</th><th>Tipo</th><th>Monto ($)</th><th></th></tr></thead>
          <tbody>
            ${items.map((item, i) => `
              <tr>
                <td><input class="form-control pay-concept" data-i="${i}" value="${escapeHtml(item.concepto)}"></td>
                <td>
                  <select class="form-control pay-type" data-i="${i}">
                    <option value="gasto" ${item.tipo === 'gasto' ? 'selected' : ''}>Gasto</option>
                    <option value="ingreso" ${item.tipo === 'ingreso' ? 'selected' : ''}>Ingreso</option>
                  </select>
                </td>
                <td><input class="form-control pay-amount" data-i="${i}" type="number" min="0" step="0.01" value="${item.monto}"></td>
                <td><button class="btn btn-xs btn-danger pay-del" data-i="${i}">✕</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <button id="add-payment-item" class="btn btn-outline" type="button">+ Agregar rubro</button>
      </div>

      <div class="grid-4 mb-3" id="payments-summary"></div>
      <div class="card mb-3" style="padding:16px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="export-quote" class="btn btn-primary" type="button">Generar cotización</button>
          <button id="print-quote" class="btn btn-outline" type="button">Imprimir</button>
        </div>
        <div id="quote-preview" style="margin-top:12px;"></div>
      </div>
    `;
    attachEvents();
    renderSummary();
  }

  function attachEvents() {
    const refreshBtn = document.getElementById('refresh-payments');
    if (refreshBtn) refreshBtn.onclick = refreshTournamentData;

    const newQuoteBtn = document.getElementById('new-quote-btn');
    if (newQuoteBtn) {
      newQuoteBtn.onclick = () => {
        document.getElementById('pay-tournament').value = 'custom';
        document.getElementById('quote-tournament-name').value = '';
        document.getElementById('quote-sensei-name').value = '';
        document.getElementById('manual-athletes').value = '0';
        athletes = 0;
        document.getElementById('quote-preview').innerHTML = '';
        renderSummary();
      };
    }

    const addBtn = document.getElementById('add-payment-item');
    if (addBtn) addBtn.onclick = () => {
      items.push({ concepto: 'Nuevo rubro', tipo: 'gasto', monto: 0 });
      render();
    };

    document.querySelectorAll('.pay-concept').forEach(input => {
      input.oninput = () => { items[+input.dataset.i].concepto = input.value; };
    });
    document.querySelectorAll('.pay-type').forEach(select => {
      select.onchange = () => { items[+select.dataset.i].tipo = select.value; renderSummary(); };
    });
    document.querySelectorAll('.pay-amount').forEach(input => {
      input.oninput = () => { items[+input.dataset.i].monto = Number(input.value) || 0; renderSummary(); };
    });
    document.querySelectorAll('.pay-del').forEach(btn => {
      btn.onclick = () => { items.splice(+btn.dataset.i, 1); render(); };
    });

    const feeInput = document.getElementById('fee-per-athlete');
    const athleteInput = document.getElementById('manual-athletes');
    if (feeInput) feeInput.oninput = renderSummary;
    if (athleteInput) athleteInput.oninput = refreshTournamentData;

    const quoteBtn = document.getElementById('export-quote');
    if (quoteBtn) quoteBtn.onclick = renderQuote;

    const printBtn = document.getElementById('print-quote');
    if (printBtn) printBtn.onclick = printQuote;
  }

  async function refreshTournamentData() {
    const select = document.getElementById('pay-tournament');
    const manualAthletes = document.getElementById('manual-athletes');
    if (!select) return;
    const selected = select.value;
    athletes = 0;

    try {
      if (selected === 'custom') {
        athletes = Number(manualAthletes?.value || 0);
      } else if (selected === 'all') {
        for (const tournament of tournaments) {
          const list = await safeCompetitorsList(tournament.id);
          athletes += list.length;
        }
      } else {
        const list = await safeCompetitorsList(selected);
        athletes = list.length;
      }
    } catch (_) {
      athletes = Number(manualAthletes?.value || 0);
    }

    const tournament = tournaments.find(t => t.id === selected);
    const nameInput = document.getElementById('quote-tournament-name');
    if (nameInput && !nameInput.value) {
      if (selected === 'custom') nameInput.value = 'Nueva cotización';
      else nameInput.value = tournament?.name || 'Resumen global de torneos';
    }

    renderSummary();
  }

  function renderSummary() {
    const summary = document.getElementById('payments-summary');
    if (!summary) return;

    const fee = Number(document.getElementById('fee-per-athlete')?.value || 20);
    const inscriptionIncome = athletes * fee;
    const sponsorships = items.filter(item => item.tipo === 'ingreso').reduce((sum, item) => sum + (Number(item.monto) || 0), 0);
    const operatingCosts = items.filter(item => item.tipo === 'gasto').reduce((sum, item) => sum + (Number(item.monto) || 0), 0);
    const systemCost = Math.max(athletes * 0.5, athletes > 0 ? 0.5 : 0);
    const totalIncome = inscriptionIncome + sponsorships;
    const totalExpenses = operatingCosts + systemCost;
    const balance = totalIncome - totalExpenses;

    summary.innerHTML = `
      ${metricCard('Atletas estimados', athletes)}
      ${metricCard('Ingresos por inscripción', money(inscriptionIncome), '#1d4ed8')}
      ${metricCard('Patrocinios y extras', money(sponsorships), '#0f766e')}
      ${metricCard('Gastos operativos', money(operatingCosts), '#b45309')}
      ${metricCard('Costo del sistema', money(systemCost), '#7c3aed')}
      ${metricCard('Balance proyectado', money(balance), balance >= 0 ? '#0f766e' : '#b91c1c')}
    `;
  }

  function renderQuote() {
    const preview = document.getElementById('quote-preview');
    if (!preview) return;

    const tournamentName = document.getElementById('quote-tournament-name')?.value || 'Torneo';
    const senseiName = document.getElementById('quote-sensei-name')?.value || 'Pendiente';
    const fee = Number(document.getElementById('fee-per-athlete')?.value || 20);
    const inscriptionIncome = athletes * fee;
    const sponsorships = items.filter(item => item.tipo === 'ingreso').reduce((sum, item) => sum + (Number(item.monto) || 0), 0);
    const operatingCosts = items.filter(item => item.tipo === 'gasto').reduce((sum, item) => sum + (Number(item.monto) || 0), 0);
    const systemCost = Math.max(athletes * 0.5, athletes > 0 ? 0.5 : 0);
    const totalIncome = inscriptionIncome + sponsorships;
    const totalExpenses = operatingCosts + systemCost;
    const balance = totalIncome - totalExpenses;

    preview.innerHTML = `
      <div id="quote-print-area" class="card" style="padding:18px;border:1px solid #d1d5db;background:#fff;color:#000;">
        <h3 style="margin-top:0;color:#000;">Cotización operativa del torneo</h3>
        <p style="color:#000;"><strong>Torneo:</strong> ${escapeHtml(tournamentName)}</p>
        <p style="color:#000;"><strong>Sensei responsable:</strong> ${escapeHtml(senseiName)}</p>
        <p style="color:#000;"><strong>Atletas proyectados:</strong> ${athletes}</p>

        <h4>Gastos estimados</h4>
        <table class="table table-sm">
          <thead><tr><th>Rubro</th><th>Monto</th></tr></thead>
          <tbody>
            ${items.filter(item => item.tipo === 'gasto').map(item => `<tr><td>${escapeHtml(item.concepto)}</td><td>${money(item.monto)}</td></tr>`).join('')}
            <tr><td>Uso del sistema</td><td>${money(systemCost)}</td></tr>
            <tr><th>Total gastos</th><th>${money(totalExpenses)}</th></tr>
          </tbody>
        </table>

        <h4>Ingresos estimados</h4>
        <table class="table table-sm">
          <thead><tr><th>Rubro</th><th>Monto</th></tr></thead>
          <tbody>
            <tr><td>Inscripciones (${athletes} × ${money(fee)})</td><td>${money(inscriptionIncome)}</td></tr>
            ${items.filter(item => item.tipo === 'ingreso').map(item => `<tr><td>${escapeHtml(item.concepto)}</td><td>${money(item.monto)}</td></tr>`).join('')}
            <tr><th>Total ingresos</th><th>${money(totalIncome)}</th></tr>
          </tbody>
        </table>

        <div class="alert ${balance >= 0 ? 'alert-success' : 'alert-danger'}" style="margin-top:12px;">
          <strong>Resultado proyectado:</strong> ${money(balance)}
        </div>
      </div>
    `;
  }

  function printQuote() {
    const area = document.getElementById('quote-print-area');
    if (!area) {
      renderQuote();
    }
    const content = document.getElementById('quote-print-area')?.outerHTML;
    if (!content) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Cotización</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #000; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; color: #000; }
            h3, h4, p, strong { color: #000; }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  async function safeCompetitorsList(tournamentId) {
    if (typeof Competitors?.listByTournament === 'function') {
      return await Competitors.listByTournament(tournamentId);
    }
    return [];
  }

  function money(value) {
    return '$' + Number(value || 0).toFixed(2);
  }

  function metricCard(label, value, color = '#1d4ed8') {
    return `<div class="card" style="padding:14px;border-left:4px solid ${color};"><div class="text-muted text-sm">${label}</div><div style="font-size:1.3rem;font-weight:700;">${value}</div></div>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
})();
