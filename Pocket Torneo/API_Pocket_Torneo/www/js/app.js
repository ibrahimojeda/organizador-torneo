/* API_Pocket_Torneo — App principal */
(function() {
  var App = {
    init: function() {
      this.updateStatus();
      this.setupConnectionBar();
      this.detectLocalIP();
      this.startProjectionPoller();
    },

    updateStatus: function() {
      var dot = document.getElementById('status-indicator')?.querySelector('.status-dot');
      var txt = document.getElementById('status-indicator')?.querySelector('.status-text');
      var matches = window.DB ? DB.getMatches() : [];
      var active = matches.filter(function(m) { return m.status === 'in_progress' || m.status === 'pending'; });
      if (dot) dot.className = active.length > 0 ? 'status-dot online' : 'status-dot offline';
      if (txt) txt.textContent = active.length > 0 ? active.length + ' ACTIVOS' : 'LOCAL';
    },

    setupConnectionBar: function() {
      var btn = document.getElementById('btn-connect-db');
      if (!btn) return;
      btn.addEventListener('click', function() {
        App.connectToSupabase();
      });
    },

    connectToSupabase: function() {
      var url = DB.getConfig('supabaseUrl', '');
      var key = DB.getConfig('supabaseKey', '');
      if (!url || !key) {
        App.showToast('⚠️ Configura Supabase primero en ⚙️ Config', 'error');
        return;
      }
      if (typeof SupabaseSync === 'undefined') {
        App.showToast('⚠️ Módulo Supabase no cargado', 'error');
        return;
      }
      SupabaseSync.configure(url, key);
      var btn = document.getElementById('btn-connect-db');
      if (btn) { btn.textContent = '⏳ Sincronizando...'; btn.disabled = true; }

      SupabaseSync.syncAll()
        .then(function(result) {
          if (btn) { btn.textContent = '✅ Datos en la nube'; btn.disabled = false; }
          App.showToast('✅ Torneo subido a Supabase', 'success');
          if (result.stats) {
            console.log('Supabase sync stats:', result.stats);
          }
        })
        .catch(function(err) {
          if (btn) { btn.textContent = '🌐 Conectar a Base de Datos'; btn.disabled = false; }
          App.showToast('❌ Error: ' + err.message, 'error');
        });
    },

    detectLocalIP: function() {
      var ipEl = document.getElementById('projection-ip');
      if (!ipEl) return;
      try {
        var pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel('');
        pc.createOffer().then(function(o) { pc.setLocalDescription(o); }).catch(function(){});
        pc.onicecandidate = function(e) {
          if (e.candidate) {
            var ip = e.candidate.candidate.split(' ')[4];
            if (ip && ip.indexOf('.') > 0) {
              ipEl.textContent = 'IP: ' + ip + ':8888';
              pc.close();
            }
          }
        };
        setTimeout(function() {
          if (ipEl.textContent === 'IP: Detectando...') {
            ipEl.textContent = 'IP: Red local (abre access.html)';
          }
        }, 3000);
      } catch(e) {
        ipEl.textContent = 'IP: Conéctate por WiFi';
      }
    },

    startProjectionPoller: function() {
      var statusEl = document.getElementById('projection-status');
      if (!statusEl) return;
      setInterval(function() {
        if (!window.DB) return;
        var matches = DB.getMatches();
        var active = matches.filter(function(m) { return m.status === 'in_progress'; });
        var pending = matches.filter(function(m) { return m.status === 'pending'; });
        if (active.length > 0) {
          statusEl.textContent = '🔴 En vivo · ' + active[0].competitor_a + ' vs ' + active[0].competitor_b;
          statusEl.style.color = '#fde047';
        } else if (pending.length > 0) {
          statusEl.textContent = '🟡 ' + pending.length + ' combates pendientes';
          statusEl.style.color = '#eab308';
        } else {
          statusEl.textContent = '⚪ Inactivo';
          statusEl.style.color = '#94a3b8';
        }
        App.updateStatus();
      }, 2000);
    },

    showToast: function(msg, type) {
      var existing = document.querySelector('.toast');
      if (existing) existing.remove();
      var el = document.createElement('div');
      el.className = 'toast' + (type === 'success' ? ' success' : type === 'error' ? ' error' : '');
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(function() { el.remove(); }, 2500);
    },
  };

  document.addEventListener('DOMContentLoaded', function() { App.init(); });
})();