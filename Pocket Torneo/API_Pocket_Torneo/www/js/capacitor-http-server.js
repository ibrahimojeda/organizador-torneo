/* API Pocket Torneo — Bridge for Capacitor HTTP Server plugin */
var PocketServer = (function() {
  var isNative = false;
  var localIp = '127.0.0.1';
  var port = 8888;

  function _isCapacitor() {
    return typeof window.Capacitor !== 'undefined' && window.Capacitor.isNative;
  }

  function start(callback) {
    if (!_isCapacitor()) {
      console.log('PocketServer: Not in native Capacitor, using fallback');
      if (callback) callback({ success: false, reason: 'not_native' });
      return;
    }
    isNative = true;
    try {
      Capacitor.Plugins.HttpServer.startServer()
        .then(function(result) {
          localIp = result.ip || '127.0.0.1';
          port = result.port || 8888;
          console.log('PocketServer started at http://' + localIp + ':' + port);
          if (callback) callback(result);
        })
        .catch(function(err) {
          console.error('PocketServer start error:', err);
          if (callback) callback({ success: false, error: err });
        });
    } catch(e) {
      console.error('PocketServer not available:', e);
      if (callback) callback({ success: false, error: e.message });
    }
  }

  function stop() {
    if (!isNative) return;
    try {
      Capacitor.Plugins.HttpServer.stopServer();
      isNative = false;
    } catch(e) { /* ignore */ }
  }

  function pushState(stateJson) {
    if (!isNative) return;
    try {
      Capacitor.Plugins.HttpServer.setState({ state: stateJson });
    } catch(e) { /* ignore */ }
  }

  function getIp() {
    if (!isNative) return '127.0.0.1';
    return localIp;
  }

  function getPort() {
    return port;
  }

  function getServerUrl() {
    return 'http://' + localIp + ':' + port;
  }

  function isRunning() {
    return isNative;
  }

  return {
    start: start,
    stop: stop,
    pushState: pushState,
    getIp: getIp,
    getPort: getPort,
    getServerUrl: getServerUrl,
    isRunning: isRunning,
    isNative: function() { return isNative; },
  };
})();