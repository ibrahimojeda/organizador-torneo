/* API Pocket Torneo — Motor de sincronización para proyección */
var Projection = (function() {
  var pollInterval = null;
  var listeners = [];
  var serverPusherInterval = null;

  function getCurrentMatch() {
    var matches = DB.getMatches();
    var active = null;
    for (var i = 0; i < matches.length; i++) {
      if (matches[i].status === 'in_progress') {
        active = matches[i];
        break;
      }
    }
    return active;
  }

  function getLastResult() {
    var results = DB.getResults();
    return results.length > 0 ? results[results.length - 1] : null;
  }

  function getState() {
    var match = getCurrentMatch();
    var result = getLastResult();
    var config = DB.get();
    return {
      tournamentName: config.tournamentName || 'Mi Torneo',
      tatami: config.tatami || 1,
      match: match,
      lastResult: result,
      pendingAwards: DB.getPendingAwards ? DB.getPendingAwards() : null,
      timestamp: new Date().toISOString(),
    };
  }

  function pushToHttpServer() {
    // Push state to the native HTTP server (for external devices)
    if (typeof PocketServer !== 'undefined' && PocketServer.isRunning()) {
      var state = getState();
      PocketServer.pushState(JSON.stringify(state));
    }
  }

  function startPolling(callback, intervalMs) {
    intervalMs = intervalMs || 1000;
    if (pollInterval) clearInterval(pollInterval);
    listeners.push(callback);

    // Start HTTP server (native only)
    if (typeof PocketServer !== 'undefined') {
      PocketServer.start(function(result) {
        if (result.success) {
          console.log('📡 HTTP Server running at http://' + result.ip + ':' + result.port);
        }
      });
    }

    // Main polling loop
    pollInterval = setInterval(function() {
      var state = getState();
      callback(state);

      // Push to HTTP server (for external devices)
      pushToHttpServer();

      // DOM for embedded projections
      var el = document.getElementById('projection-state-data');
      if (el) el.textContent = JSON.stringify(state);
    }, intervalMs);

    // Also push state every 500ms to HTTP server separately
    if (!serverPusherInterval) {
      serverPusherInterval = setInterval(pushToHttpServer, 500);
    }

    // Fire immediately
    callback(getState());
    pushToHttpServer();
  }

  function stopPolling() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    if (serverPusherInterval) { clearInterval(serverPusherInterval); serverPusherInterval = null; }
    if (typeof PocketServer !== 'undefined') PocketServer.stop();
  }

  function getServerUrl() {
    if (typeof PocketServer !== 'undefined' && PocketServer.isRunning()) {
      return PocketServer.getServerUrl();
    }
    return null;
  }

  return {
    getState: getState,
    getCurrentMatch: getCurrentMatch,
    startPolling: startPolling,
    stopPolling: stopPolling,
    getServerUrl: getServerUrl,
    pushToHttpServer: pushToHttpServer,
  };
})();