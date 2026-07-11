const Reports = (() => {
  async function generateMedallero(tournamentId) {
    const cats = await Categories.listByTournament(tournamentId);
    const table = {}; // dojo/club -> { gold, silver, bronze }
    for (const c of cats) {
      const podio = await Bracket.getPodio(c.id).catch(() => null);
      if (!podio?.positions?.length) continue;
      for (const p of podio.positions) {
        const club = p.club || 'Sin Dojo';
        table[club] = table[club] || { gold:0, silver:0, bronze:0 };
        if (p.position === 1) table[club].gold++;
        else if (p.position === 2) table[club].silver++;
        else if (p.position === 3) table[club].bronze++;
      }
    }
    const rows = Object.entries(table).map(([club, counts]) => ({ club, ...counts, total: counts.gold + counts.silver + counts.bronze }));
    rows.sort((a,b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || b.total - a.total || a.club.localeCompare(b.club));
    return rows;
  }

  async function printMedallero(tournamentId) {
    const rows = await generateMedallero(tournamentId);
    const html = `
      <html><head><title>Medallero</title><style>body{font-family:Arial,Helvetica,sans-serif;color:#111}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f3f4f6}</style></head>
      <body>
        <h2>Medallero</h2>
        <table>
          <thead><tr><th>Dojo</th><th>Oros</th><th>Platas</th><th>Bronces</th><th>Total</th></tr></thead>
          <tbody>
            ${rows.map(r=>`<tr><td>${escape(r.club)}</td><td>${r.gold}</td><td>${r.silver}</td><td>${r.bronze}</td><td>${r.total}</td></tr>`).join('')}
          </tbody>
        </table>
      </body></html>
    `;
    const w = window.open('', '_blank', 'width=900,height=800'); if (!w) return; w.document.write(html); w.document.close(); w.print();
  }

  async function printBrackets(tournamentId) {
    const cats = await Categories.listByTournament(tournamentId);
    const matches = await Bracket.getByTournamentId(tournamentId);
    
    let fullHtml = `
      <html><head><title>Llaves del Torneo</title>
      <link rel="stylesheet" href="../css/print-styles.css">
      <style>
        body { font-family: sans-serif; padding: 20px; }
        .page-break { page-break-after: always; }
        .bracket-grid-print { display: flex; gap: 30px; }
        .bracket-round-print { display: flex; flex-direction: column; justify-content: space-around; }
        .bracket-match { border: 1px solid black; width: 180px; margin-bottom: 15px; font-size: 11px; background: white; }
        .bracket-competitor { padding: 3px; border-bottom: 1px solid #eee; color: black; }
        .bracket-winner { font-weight: bold; text-decoration: underline; }
        .print-header { text-align: center; margin-bottom: 20px; }
      </style>
      </head><body>`;

    for (const cat of cats) {
      const bracketHtml = await Bracket.renderPrintableBracket(cat.id, cat);
      fullHtml += `<div class="page-break">${bracketHtml}</div>`;
    }

    fullHtml += `</body></html>`;
    const w = window.open('', '_blank', 'width=1100,height=900');
    if (!w) return;
    w.document.write(fullHtml);
    w.document.close();
    w.print();
  }

  async function printSchedule(tournamentId) {
    const cats = await Categories.listByTournament(tournamentId);
    const tournament = await Tournament.getById(tournamentId);
    
    let html = `
      <html><head><title>Programación del Torneo</title>
      <style>
        body { font-family: sans-serif; padding: 20px; color: #111; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f3f4f6; }
        .header { text-align: center; margin-bottom: 30px; }
      </style>
      </head><body>
      <div class="header">
        <h1>Programación de Tatamis</h1>
        <p>${escape(tournament.name)} - ${escape(tournament.date_start || '')}</p>
      </div>
      <table>
        <thead>
          <tr><th>Categoría</th><th>Disciplina</th><th>Género</th><th>Tatami</th></tr>
        </thead>
        <tbody>
          ${cats.map(c => `<tr>
            <td>${escape(c.name)}</td>
            <td>${escape(c.discipline)}</td>
            <td>${escape(c.gender)}</td>
            <td>${escape(String(c.tatami))}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      </body></html>`;
    
    const w = window.open('', '_blank', 'width=900,height=800');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.print();
  }

  async function printCompetitorsList(tournamentId) {
    const competitors = await Competitors.listByTournament(tournamentId);
    
    let html = `
      <html><head><title>Lista de Competidores</title>
      <style>
        body { font-family: sans-serif; padding: 20px; color: #111; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f3f4f6; }
        .header { text-align: center; margin-bottom: 30px; }
      </style>
      </head><body>
      <div class="header">
        <h1>Lista de Competidores Inscritos</h1>
        <p>Torneo: ${await getTournamentName(tournamentId)}</p>
      </div>
      <table>
        <thead>
          <tr><th>Nombre Completo</th><th>Club / Dojo</th><th>Disciplina</th><th>Género</th></tr>
        </thead>
        <tbody>
          ${competitors.map(c => `<tr>
            <td>${escape(c.full_name)}</td>
            <td>${escape(c.club)}</td>
            <td>${escape(c.discipline)}</td>
            <td>${escape(c.gender)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      </body></html>`;
    
    const w = window.open('', '_blank', 'width=900,height=800');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.print();
  }

  async function getTournamentName(id) {
    try {
      const t = await Tournament.getById(id);
      return t ? t.name : 'Torneo';
    } catch { return 'Torneo'; }
  }

  function escape(s){ return String(s||'').replace(/[&<>]/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

  return { generateMedallero, printMedallero, printBrackets, printSchedule, printCompetitorsList };
})();
