// superadmin-stats.js — Estadísticas globales con barras o línea de tiempo

(async function () {
  const dashboardStats = document.getElementById('superadmin-stats');
  const statsPanel = document.getElementById('stats-panel');
  if (!dashboardStats && !statsPanel) return;

  if (dashboardStats) dashboardStats.innerHTML = '<span class="spinner"></span> Cargando resumen...';
  if (statsPanel) statsPanel.innerHTML = '<span class="spinner"></span> Cargando estadísticas...';

  try {
    const [users, tournaments] = await Promise.all([
      Auth.listProfiles().catch(() => []),
      Tournament.listAll().catch(() => [])
    ]);

    const tournamentStats = [];
    const monthlyMap = {};
    let totalAthletes = 0;

    for (const tournament of tournaments) {
      let competitors = [];
      try {
        competitors = typeof Competitors?.listByTournament === 'function'
          ? await Competitors.listByTournament(tournament.id)
          : [];
      } catch (_) {
        competitors = [];
      }
      const athletes = competitors.length;
      const schools = new Set(competitors.map(c => c.club).filter(Boolean)).size;
      const systemIncome = athletes * 0.5;
      const date = tournament.date_start || tournament.created_at || new Date().toISOString();
      const monthKey = formatMonthKey(date);

      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = { month: monthKey, created: 0, cancelled: 0, athletes: 0, schools: 0, income: 0 };
      }
      monthlyMap[monthKey].created += 1;
      monthlyMap[monthKey].athletes += athletes;
      monthlyMap[monthKey].schools += schools;
      monthlyMap[monthKey].income += systemIncome;
      if ((tournament.status || '') === 'cancelled') monthlyMap[monthKey].cancelled += 1;

      totalAthletes += athletes;
      tournamentStats.push({
        id: tournament.id,
        name: tournament.name || 'Torneo',
        status: tournament.status || 'draft',
        athletes,
        schools,
        systemIncome,
        date,
      });
    }

    tournamentStats.sort((a, b) => new Date(a.date) - new Date(b.date));
    const monthlyStats = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));
    const totalSystemIncome = tournamentStats.reduce((sum, item) => sum + item.systemIncome, 0);
    const activeTournaments = tournaments.filter(t => ['draft', 'open', 'closed', 'ongoing'].includes(t.status)).length;

    if (dashboardStats) {
      dashboardStats.innerHTML = `
        ${card('Torneos modelados', tournaments.length, '#1d4ed8')}
        ${card('Usuarios en plataforma', users.length, '#0f766e')}
        ${card('Inscritos acumulados', totalAthletes, '#7c3aed')}
        ${card('Ingresos al sistema', money(totalSystemIncome), '#b45309')}
      `;
    }

    if (statsPanel) {
      const availableYears = [...new Set(monthlyStats.map(item => item.month.slice(0, 4)))].sort();
      statsPanel.innerHTML = `
        <div class="card mb-3" style="padding:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;">
          <div>
            <label>Tipo de gráfica</label>
            <select id="stats-view-mode" class="form-control">
              <option value="bars">Barras verticales</option>
              <option value="line">Línea de tiempo</option>
            </select>
          </div>
          <div>
            <label>Variable</label>
            <select id="stats-variable" class="form-control">
              <option value="all">Todas</option>
              <option value="income">Ingresos</option>
              <option value="created">Torneos creados</option>
              <option value="cancelled">Torneos cancelados</option>
              <option value="athletes">Estudiantes inscritos</option>
              <option value="schools">Escuelas inscritas</option>
            </select>
          </div>
          <div>
            <label>Año</label>
            <select id="stats-year" class="form-control">
              <option value="all">Todos</option>
              ${availableYears.map(year => `<option value="${year}">${year}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>Mes</label>
            <select id="stats-month" class="form-control">
              <option value="all">Todos</option>
              <option value="01">Enero</option>
              <option value="02">Febrero</option>
              <option value="03">Marzo</option>
              <option value="04">Abril</option>
              <option value="05">Mayo</option>
              <option value="06">Junio</option>
              <option value="07">Julio</option>
              <option value="08">Agosto</option>
              <option value="09">Septiembre</option>
              <option value="10">Octubre</option>
              <option value="11">Noviembre</option>
              <option value="12">Diciembre</option>
            </select>
          </div>
        </div>

        <div class="grid-4 mb-3">
          ${card('Torneos activos', activeTournaments, '#1d4ed8')}
          ${card('Torneos finalizados', tournaments.filter(t => t.status === 'finished').length, '#475569')}
          ${card('Total inscritos', totalAthletes, '#7c3aed')}
          ${card('Ingresos del sistema', money(totalSystemIncome), '#b45309')}
        </div>

        <div id="stats-visuals"></div>
      `;

      const renderSelected = () => {
        const mode = document.getElementById('stats-view-mode')?.value || 'bars';
        const variable = document.getElementById('stats-variable')?.value || 'all';
        const year = document.getElementById('stats-year')?.value || 'all';
        const month = document.getElementById('stats-month')?.value || 'all';
        const filteredMonthly = monthlyStats.filter(item => {
          const [y, m] = item.month.split('-');
          return (year === 'all' || y === year) && (month === 'all' || m === month);
        });
        renderVisuals(tournamentStats, filteredMonthly, tournaments, mode, variable);
      };

      ['stats-view-mode', 'stats-variable', 'stats-year', 'stats-month'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.onchange = renderSelected;
      });
      renderSelected();
    }
  } catch (err) {
    const html = `<div class="alert alert-danger">Error al cargar estadísticas: ${escapeHtml(err.message)}</div>`;
    if (dashboardStats) dashboardStats.innerHTML = html;
    if (statsPanel) statsPanel.innerHTML = html;
  }

  function renderVisuals(items, monthlyStats, tournaments, mode, variable) {
    const target = document.getElementById('stats-visuals');
    if (!target) return;

    const charts = [];
    const showAll = variable === 'all';

    if (showAll || variable === 'athletes') {
      charts.push(cardChart('Estudiantes inscritos mes a mes', mode === 'line'
        ? lineChart(monthlyStats, item => item.athletes, '#2563eb', 'Estudiantes inscritos mes a mes')
        : verticalBarChart(monthlyStats, item => item.month, item => item.athletes, '#2563eb', 'Sin inscritos aún.')));
    }
    if (showAll || variable === 'income') {
      charts.push(cardChart('Ingresos del sistema mes a mes', mode === 'line'
        ? lineChart(monthlyStats, item => item.income, '#059669', 'Ingresos del sistema mes a mes', true)
        : verticalBarChart(monthlyStats, item => item.month, item => item.income, '#059669', 'Sin ingresos registrados aún.', true)));
    }
    if (showAll || variable === 'created') {
      charts.push(cardChart('Torneos creados por mes', mode === 'line'
        ? lineChart(monthlyStats, item => item.created, '#7c3aed', 'Torneos creados por mes')
        : verticalBarChart(monthlyStats, item => item.month, item => item.created, '#7c3aed', 'Sin torneos registrados.')));
    }
    if (showAll || variable === 'cancelled') {
      charts.push(cardChart('Torneos cancelados por mes', mode === 'line'
        ? lineChart(monthlyStats, item => item.cancelled, '#dc2626', 'Torneos cancelados por mes')
        : verticalBarChart(monthlyStats, item => item.month, item => item.cancelled, '#dc2626', 'Sin torneos cancelados.')));
    }
    if (showAll || variable === 'schools') {
      charts.push(cardChart('Escuelas inscritas por mes', mode === 'line'
        ? lineChart(monthlyStats, item => item.schools, '#ea580c', 'Escuelas inscritas por mes')
        : verticalBarChart(monthlyStats, item => item.month, item => item.schools, '#ea580c', 'Sin escuelas registradas.')));
    }

    target.innerHTML = charts.join('') + `
      <div class="card" style="padding:16px;">
        <h3 style="margin-top:0;">Estado de los torneos</h3>
        ${statusSummary(tournaments)}
      </div>
    `;
  }

  function card(label, value, color) {
    return `<div class="card" style="padding:14px;border-left:4px solid ${color};"><div class="text-muted text-sm">${label}</div><div style="font-size:1.35rem;font-weight:700;">${value}</div></div>`;
  }

  function cardChart(title, content) {
    return `
      <div class="card mb-3" style="padding:16px;">
        <h3 style="margin-top:0;">${title}</h3>
        ${content}
      </div>
    `;
  }

  function verticalBarChart(items, labelFn, valueFn, color, emptyText, currency = false) {
    if (!items.length) return `<div class="text-muted">${emptyText}</div>`;
    const width = 700;
    const height = 280;
    const padLeft = 48;
    const padBottom = 42;
    const top = 20;
    const max = Math.max(...items.map(item => Number(valueFn(item)) || 0), 1);
    const chartWidth = width - padLeft - 20;
    const chartHeight = height - top - padBottom;
    const barWidth = Math.max(chartWidth / Math.max(items.length * 1.8, 1), 18);
    const gap = barWidth * 0.8;

    const bars = items.map((item, index) => {
      const value = Number(valueFn(item)) || 0;
      const x = padLeft + index * (barWidth + gap);
      const barHeight = max ? (value / max) * chartHeight : 0;
      const y = top + (chartHeight - barHeight);
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${color}" rx="4"></rect>
        <text x="${x + barWidth / 2}" y="${height - 18}" text-anchor="middle" font-size="10">${escapeHtml(labelFn(item))}</text>
        <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" font-size="10">${currency ? money(value) : value}</text>
      `;
    }).join('');

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
      const value = max * (1 - ratio);
      const y = top + chartHeight * ratio;
      return `
        <line x1="${padLeft}" y1="${y}" x2="${width - 10}" y2="${y}" stroke="#e5e7eb"></line>
        <text x="${padLeft - 8}" y="${y + 4}" text-anchor="end" font-size="10">${currency ? money(value) : Math.round(value)}</text>
      `;
    }).join('');

    return `
      <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto;background:#fff;border-radius:12px;">
        ${yTicks}
        <line x1="${padLeft}" y1="${top}" x2="${padLeft}" y2="${top + chartHeight}" stroke="#111827" stroke-width="1.5"></line>
        <line x1="${padLeft}" y1="${top + chartHeight}" x2="${width - 10}" y2="${top + chartHeight}" stroke="#111827" stroke-width="1.5"></line>
        ${bars}
      </svg>
    `;
  }

  function lineChart(items, valueFn, color, title, currency = false) {
    if (!items.length) return '<div class="text-muted">Sin datos suficientes.</div>';
    const width = 620;
    const height = 220;
    const pad = 30;
    const max = Math.max(...items.map(item => Number(valueFn(item)) || 0), 1);
    const points = items.map((item, index) => {
      const x = pad + (index * ((width - pad * 2) / Math.max(items.length - 1, 1)));
      const y = height - pad - (((Number(valueFn(item)) || 0) / max) * (height - pad * 2));
      return { x, y, label: item.name, value: Number(valueFn(item)) || 0 };
    });

    return `
      <div>
        <div class="text-muted" style="margin-bottom:8px;">${title}</div>
        <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto;background:#f8fafc;border-radius:12px;">
          <polyline fill="none" stroke="${color}" stroke-width="3" points="${points.map(p => `${p.x},${p.y}`).join(' ')}"></polyline>
          ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${color}"></circle>`).join('')}
        </svg>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-top:10px;">
          ${points.map(p => `<div class="card" style="padding:8px;"><strong>${escapeHtml(p.label)}</strong><div class="text-muted">${currency ? money(p.value) : p.value}</div></div>`).join('')}
        </div>
      </div>
    `;
  }

  function statusSummary(tournaments) {
    const labels = {
      draft: 'Borrador',
      open: 'Abierto',
      closed: 'Cerrado',
      ongoing: 'En curso',
      finished: 'Finalizado',
      cancelled: 'Cancelado',
    };
    const counts = {};
    tournaments.forEach(t => { counts[t.status || 'draft'] = (counts[t.status || 'draft'] || 0) + 1; });
    return Object.keys(labels).map(key => `
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eef2f7;">
        <span>${labels[key]}</span>
        <strong>${counts[key] || 0}</strong>
      </div>
    `).join('');
  }

  function formatMonthKey(value) {
    const date = new Date(value);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${date.getFullYear()}-${month}`;
  }

  function money(value) {
    return '$' + Number(value || 0).toFixed(2);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
})();