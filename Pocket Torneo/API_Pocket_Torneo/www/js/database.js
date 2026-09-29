/* Database abstraction layer - LOCAL first with Supabase sync option */
var DB = (function() {
  var STORAGE_KEY = 'pocket_torneo_db';

  function _load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (_) { return {}; }
  }

  function _save(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
  }

  function _nextId(arr) {
    return arr.reduce(function(max, item) { return Math.max(max, (item.id || 0)); }, 0) + 1;
  }

  function init() {
    var db = _load();
    if (!db.version) {
      db = {
        version: 1,
        tournamentName: 'Mi Torneo',
        tatami: 1,
        judgeCount: 5,
        dojos: [],
        competitors: [],
        brackets: null,
        matches: [],
        results: [],
        pendingAwards: null,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };
      _save(db);
    }
    return db;
  }

  function get() { return _load(); }

  function set(data) {
    data.updated = new Date().toISOString();
    _save(data);
    return data;
  }

  function update(fn) {
    var data = _load();
    fn(data);
    data.updated = new Date().toISOString();
    _save(data);
    return data;
  }

  function reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    return init();
  }

  // --- Dojos ---
  function getDojos() { return _load().dojos || []; }

  function addDojo(name) {
    return update(function(data) {
      data.dojos = data.dojos || [];
      data.dojos.push({ id: _nextId(data.dojos), name: name.trim() });
    });
  }

  function updateDojo(id, name) {
    return update(function(data) {
      data.dojos = data.dojos || [];
      for (var i = 0; i < data.dojos.length; i++) {
        if (data.dojos[i].id === id) { data.dojos[i].name = name.trim(); break; }
      }
    });
  }

  function deleteDojo(id) {
    return update(function(data) {
      data.dojos = (data.dojos || []).filter(function(d) { return d.id !== id; });
    });
  }

  // --- Competitors ---
  function getCompetitors() { return _load().competitors || []; }

  function addCompetitor(name, dojoName, category) {
    return update(function(data) {
      data.competitors = data.competitors || [];
      data.competitors.push({
        id: _nextId(data.competitors),
        name: name.trim(),
        dojo: dojoName || '',
        category: category || 'kata',
      });
    });
  }

  function updateCompetitor(id, name, dojoName, category) {
    return update(function(data) {
      data.competitors = data.competitors || [];
      for (var i = 0; i < data.competitors.length; i++) {
        if (data.competitors[i].id === id) {
          data.competitors[i].name = name.trim();
          data.competitors[i].dojo = dojoName || '';
          data.competitors[i].category = category || 'kata';
          break;
        }
      }
    });
  }

  function deleteCompetitor(id) {
    return update(function(data) {
      data.competitors = (data.competitors || []).filter(function(c) { return c.id !== id; });
    });
  }

  // --- Config ---
  function setConfig(key, value) {
    return update(function(data) { data[key] = value; });
  }

  function getConfig(key, defaultVal) {
    var data = _load();
    return data.hasOwnProperty(key) ? data[key] : defaultVal;
  }

  // --- Brackets / Matches ---
  function getBrackets() { return _load().brackets || null; }

  function setBrackets(bracketsData) {
    return update(function(data) { data.brackets = bracketsData; });
  }

  function getMatches() { return _load().matches || []; }

  function setMatches(matches) {
    return update(function(data) { data.matches = matches; });
  }

  function updateMatch(matchId, updates) {
    return update(function(data) {
      data.matches = data.matches || [];
      for (var i = 0; i < data.matches.length; i++) {
        if (data.matches[i].id === matchId) {
          for (var key in updates) { data.matches[i][key] = updates[key]; }
          break;
        }
      }
    });
  }

  function clearBrackets() {
    return update(function(data) { data.brackets = null; data.matches = []; });
  }

  // --- Results ---
  function getResults() { return _load().results || []; }

  function addResult(result) {
    return update(function(data) {
      data.results = data.results || [];
      data.results.push(result);
    });
  }

  // --- Category finish / awards (fin de categoría) ---
  function getPendingAwards() { return _load().pendingAwards || null; }

  function setPendingAwards(payload) {
    return update(function(data) { data.pendingAwards = payload; });
  }

  function clearPendingAwards() {
    return update(function(data) { data.pendingAwards = null; });
  }

  return {
    init: init, get: get, set: set, update: update, reset: reset,
    getDojos: getDojos, addDojo: addDojo, updateDojo: updateDojo, deleteDojo: deleteDojo,
    getCompetitors: getCompetitors, addCompetitor: addCompetitor,
    updateCompetitor: updateCompetitor, deleteCompetitor: deleteCompetitor,
    setConfig: setConfig, getConfig: getConfig,
    getBrackets: getBrackets, setBrackets: setBrackets,
    getMatches: getMatches, setMatches: setMatches,
    updateMatch: updateMatch, clearBrackets: clearBrackets,
    getResults: getResults, addResult: addResult,
    getPendingAwards: getPendingAwards, setPendingAwards: setPendingAwards, clearPendingAwards: clearPendingAwards,
  };
})();

// Initialize on load
DB.init();