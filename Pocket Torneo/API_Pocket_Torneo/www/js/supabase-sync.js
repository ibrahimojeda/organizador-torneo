/* API Pocket Torneo — Sincronización con Supabase vía REST API */
/* No necesita librería, usa fetch() directamente */
var SupabaseSync = (function() {
  var baseUrl = '';
  var anonKey = '';
  var connected = false;

  function configure(url, key) {
    baseUrl = url.replace(/\/+$/, '');
    anonKey = key;
    connected = !!(baseUrl && anonKey);
    return connected;
  }

  function isConnected() { return connected && !!(baseUrl && anonKey); }

  function getHeaders() {
    return {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': 'Bearer ' + anonKey,
      'Prefer': 'return=minimal',
    };
  }

  function rest(path) {
    return baseUrl + '/rest/v1/' + path;
  }

  // Upsert records: inserts or updates based on primary key
  function upsert(table, records) {
    if (!isConnected() || !records || records.length === 0) return Promise.resolve({ inserted: 0 });
    return fetch(rest(table), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(records),
    }).then(function(r) {
      if (!r.ok) return r.text().then(function(t) { throw new Error('Supabase error ' + r.status + ': ' + t); });
      return { inserted: records.length };
    });
  }

  // Upload tournament data to Supabase
  function syncAll() {
    if (!isConnected()) return Promise.reject(new Error('No conectado a Supabase'));

    var db = DB.get();
    var tournamentId = 'pocket_' + (db.tournamentName || 'torneo').replace(/[^a-z0-9]/gi, '_').toLowerCase();

    return upsert('pocket_tournaments', [{
      id: tournamentId,
      name: db.tournamentName || 'Mi Torneo',
      tatami: db.tatami || 1,
      judge_count: db.judgeCount || 5,
      created_at: db.created || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    .then(function() {
      // Upload dojos
      var dojos = (db.dojos || []).map(function(d) {
        return { id: tournamentId + '_dojo_' + d.id, tournament_id: tournamentId, name: d.name };
      });
      if (dojos.length > 0) return upsert('pocket_dojos', dojos);
    })
    .then(function() {
      // Upload competitors
      var comps = (db.competitors || []).map(function(c) {
        var compId = tournamentId + '_comp_' + c.id;
        return {
          id: compId,
          tournament_id: tournamentId,
          name: c.name,
          dojo: c.dojo || '',
          category: c.category || 'kata',
        };
      });
      if (comps.length > 0) return upsert('pocket_competitors', comps);
    })
    .then(function() {
      // Upload matches
      var matches = (db.matches || []).map(function(m) {
        return {
          id: tournamentId + '_match_' + m.id,
          tournament_id: tournamentId,
          match_id_local: m.id,
          category: m.category || 'kata',
          round: m.round || 1,
          competitor_a: m.competitor_a || '',
          competitor_b: m.competitor_b || '',
          dojo_a: m.dojo_a || '',
          dojo_b: m.dojo_b || '',
          status: m.status || 'pending',
          winner: m.winner || null,
          score_a: m.score_a,
          score_b: m.score_b,
        };
      });
      if (matches.length > 0) return upsert('pocket_matches', matches);
    })
    .then(function() {
      // Upload results
      var results = (db.results || []).map(function(r) {
        return {
          id: tournamentId + '_result_' + (r.match_id || Math.random().toString(36).slice(2, 10)),
          tournament_id: tournamentId,
          match_id: tournamentId + '_match_' + r.match_id,
          competitor_a: r.competitor_a || '',
          competitor_b: r.competitor_b || '',
          score_a: r.score_a,
          score_b: r.score_b,
          winner: r.winner || null,
          created_at: r.timestamp || new Date().toISOString(),
        };
      });
      if (results.length > 0) return upsert('pocket_results', results);
    })
    .then(function() {
      return { success: true, tournamentId: tournamentId, stats: {
        dojos: (db.dojos || []).length,
        competitors: (db.competitors || []).length,
        matches: (db.matches || []).length,
        results: (db.results || []).length,
      }};
    });
  }

  // Test connection by fetching tournament count
  function testConnection() {
    if (!isConnected()) return Promise.reject(new Error('Credenciales no configuradas'));
    return fetch(rest('pocket_tournaments') + '?select=count', {
      method: 'GET',
      headers: getHeaders(),
    }).then(function(r) {
      if (r.ok) return { connected: true };
      return r.text().then(function(t) { throw new Error('Error ' + r.status + ': ' + t); });
    });
  }

  function getUrl() { return baseUrl; }

  return {
    configure: configure,
    isConnected: isConnected,
    syncAll: syncAll,
    testConnection: testConnection,
    getUrl: getUrl,
  };
})();