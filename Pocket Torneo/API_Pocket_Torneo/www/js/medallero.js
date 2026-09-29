/* API Pocket Torneo — Medallero y exportación */
// Extiende DB con métodos adicionales

(function() {
  if (typeof DB === 'undefined') return;

  function getMedallero() {
    var results = DB.getResults();
    var matches = DB.getMatches();
    var byCategory = {};

    // Process finished matches with winners
    matches.forEach(function(m) {
      if (m.status !== 'finished' || !m.winner) return;
      var cat = m.category || 'kata';
      if (!byCategory[cat]) byCategory[cat] = [];
      var winnerName = m.winner === 'a' ? m.competitor_a : m.competitor_b;
      var loserName = m.winner === 'a' ? m.competitor_b : m.competitor_a;
      var winnerDojo = m.winner === 'a' ? m.dojo_a : m.dojo_b;
      var loserDojo = m.winner === 'a' ? m.dojo_b : m.dojo_a;
      byCategory[cat].push({
        matchId: m.id,
        round: m.round || 1,
        winner: { name: winnerName, dojo: winnerDojo },
        loser: { name: loserName, dojo: loserDojo },
        winnerSide: m.winner,
      });
    });

    // Build medal standings by category
    var medallero = {};
    for (var cat in byCategory) {
      var fights = byCategory[cat];
      var wins = {};
      fights.forEach(function(f) {
        if (f.winner && f.winner.name) {
          wins[f.winner.name] = (wins[f.winner.name] || 0) + 1;
        }
      });
      // Sort by wins descending, take top 3
      var sorted = Object.keys(wins).sort(function(a, b) { return wins[b] - wins[a]; });
      var top = sorted.slice(0, 3);
      medallero[cat] = {
        gold: top[0] || null,
        silver: top[1] || null,
        bronze: top[2] || null,
        totalFights: fights.length,
      };
    }
    return medallero;
  }

  function getCategoryLabel(category) {
    if (category === 'kata-duel') return 'Kata por Duelo';
    if (category === 'kumite') return 'Kumite';
    return 'Kata Individual';
  }

  function getCategoryPodium(category) {
    var label = getCategoryLabel(category);
    var matches = DB.getMatches().filter(function(m) { return m.category === category && m.status === 'finished'; });
    var positions = [];

    if (category === 'kata') {
      // Kata individual: ranking por puntaje (mayor primero)
      var ranked = matches
        .filter(function(m) { return m.competitor_a && m.score_a != null; })
        .map(function(m) { return { name: m.competitor_a, dojo: m.dojo_a || '', score: Number(m.score_a) }; })
        .sort(function(a, b) { return b.score - a.score; })
        .slice(0, 3);
      positions = ranked.map(function(r, i) { return { position: i + 1, name: r.name, dojo: r.dojo }; });
    } else {
      // Eliminación (kata-duel / kumite): final = ronda más alta con ganador
      var byRound = {};
      matches.forEach(function(m) {
        if (!m.winner) return;
        var r = m.round || 1;
        if (!byRound[r]) byRound[r] = [];
        byRound[r].push(m);
      });
      var rounds = Object.keys(byRound).map(Number).sort(function(a, b) { return a - b; });
      if (rounds.length) {
        var finalRound = rounds[rounds.length - 1];
        var finals = byRound[finalRound];
        if (finals.length === 1) {
          var f = finals[0];
          var winName = f.winner === 'a' ? f.competitor_a : f.competitor_b;
          var losName = f.winner === 'a' ? f.competitor_b : f.competitor_a;
          positions.push({ position: 1, name: winName, dojo: f.winner === 'a' ? f.dojo_a : f.dojo_b });
          if (losName) positions.push({ position: 2, name: losName, dojo: f.winner === 'a' ? f.dojo_b : f.dojo_a });
          var semi = byRound[finalRound - 1] || [];
          semi.forEach(function(s) {
            if (positions.length >= 3) return;
            var bronze = s.winner === 'a' ? s.competitor_b : s.competitor_a;
            if (bronze) positions.push({ position: 3, name: bronze, dojo: s.winner === 'a' ? s.dojo_b : s.dojo_a });
          });
        }
      }
      // Fallback: ranking por cantidad de victorias
      if (positions.length < 2) {
        var wins = {};
        matches.forEach(function(m) {
          if (!m.winner) return;
          var wn = m.winner === 'a' ? m.competitor_a : m.competitor_b;
          if (wn) wins[wn] = (wins[wn] || 0) + 1;
        });
        var sorted = Object.keys(wins).sort(function(a, b) { return wins[b] - wins[a]; }).slice(0, 3);
        positions = sorted.map(function(name, i) { return { position: i + 1, name: name, dojo: '' }; });
      }
    }

    return { label: label, positions: positions };
  }

  function exportCSV() {
    var db = DB.get();
    var rows = [];
    // Header
    rows.push('Torneo,Tatami,Categoría,Competidor A,Competidor B,Puntaje A,Puntaje B,Ganador,Estado,Ronda');

    (db.matches || []).forEach(function(m) {
      var a = m.competitor_a || '—';
      var b = m.competitor_b || '—';
      var sa = m.score_a != null ? m.score_a : '—';
      var sb = m.score_b != null ? m.score_b : '—';
      var cat = m.category === 'kata-duel' ? 'Kata Duelo' : m.category === 'kumite' ? 'Kumite' : 'Kata';
      var win = m.winner ? (m.winner === 'a' ? a : b) : '—';
      rows.push('"' + (db.tournamentName||'') + '",' + (db.tatami||1) + ',"' + cat + '","' + a + '","' + b + '",' + sa + ',' + sb + ',"' + win + '","' + (m.status||'') + '",' + (m.round||1));
    });

    return rows.join('\n');
  }

  // Attach to DB
  DB.getMedallero = getMedallero;
  DB.exportCSV = exportCSV;
  DB.getCategoryLabel = getCategoryLabel;
  DB.getCategoryPodium = getCategoryPodium;
})();