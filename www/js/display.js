/* ============================================================
   DISPLAY.JS — Renderizado visual de brackets y resultados
   ============================================================ */

const Display = (() => {

  /* --------------------------------------------------------
     CACHÉ DE DATOS DE DOJOS
  -------------------------------------------------------- */
  function _getCompetitorDojo(competitor) {
    if (!competitor) return null;
    const c = competitor.competitors || competitor;
    return c.dojo_id ? Dojos.getFromCache(c.dojo_id) : null;
  }

  function _getCompetitorCountryInfo(competitor) {
    if (!competitor) return { flag: '', name: '' };
    const c = competitor.competitors || competitor;
    return getCountryInfo(c.country);
  }

  function _renderDojoBadgeSmall(competitor) {
    const dojo = _getCompetitorDojo(competitor);
    const country = _getCompetitorCountryInfo(competitor);
    const parts = [];
    if (dojo?.logo_url) {
      parts.push(`<img src="${dojo.logo_url}" alt="" style="width:16px;height:16px;object-fit:contain;border-radius:2px;display:inline-block;vertical-align:middle;" />`);
    }
    const c = competitor?.competitors || competitor || {};
    const dojoName = dojo?.name || c.club || '';
    if (dojoName) {
      parts.push(`<span class="text-muted" style="font-size:0.82em;">${dojoName}</span>`);
    }
    if (country.flag) {
      parts.push(`<span style="font-size:0.9em;">${country.flag}</span>`);
    }
    if (country.name) {
      parts.push(`<span class="text-muted" style="font-size:0.8em;">${country.name}</span>`);
    }
    if (!parts.length) return '';
    return `<span style="display:inline-flex;align-items:center;gap:3px;">${parts.join(' ')}</span>`;
  }

  /* --------------------------------------------------------
     RENDERIZA EL BRACKET COMPLETO DE UNA CATEGORÍA
     @param {HTMLElement} container - Elemento donde se renderiza
     @param {object[]} matches - Lista de combates de la categoría
     @param {object} category - Datos de la categoría
     @param {object} options - { editable: bool, onMatchClick: fn }
  -------------------------------------------------------- */
  function renderBracket(container, matches, category, options = {}) {
    container.innerHTML = '';

    if (!matches.length) {
      container.innerHTML = _emptyState('No hay llaves generadas para esta categoría.');
      return;
    }

    const bracketType = matches[0]?.bracket_type;

    if (bracketType === 'round_robin') {
      _renderRoundRobin(container, matches, category, options);
    } else if (bracketType === 'kata_round') {
      _renderKataList(container, matches, category, options);
    } else {
      _renderEliminationBracket(container, matches, category, options);
    }
  }

  /* --------------------------------------------------------
     RENDERIZA LISTA DE ATLETAS KATA (ronda única sin rival)
  -------------------------------------------------------- */
  function _renderKataList(container, matches, category, options) {
    const html = `
      <div class="table-wrapper">
        <p class="text-muted text-sm mb-2">Kata — Ronda Única · ${matches.length} atleta(s)</p>
        <table class="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Atleta</th>
              <th>Club</th>
              <th>Estado</th>
              <th>Puntaje</th>
              ${options.editable ? '<th></th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${matches.map(m => {
              const name = _getCompetitorName(m, 'a') || '—';
              const club = m.competitor_a?.competitors?.club || m.competitor_a?.club || '—';
              const kataSummary = (typeof Matches !== 'undefined' && Matches?.getKataSummary)
                ? Matches.getKataSummary(m)
                : null;
              const liveTotal = kataSummary?.total;
              const scoreValue = m.score_a != null
                ? Number(m.score_a).toFixed(2)
                : (liveTotal != null ? Number(liveTotal).toFixed(2) : null);
              const isOfficial = m.status === MATCH_STATUS.FINISHED;
              const statusCell = isOfficial
                ? _statusBadge(m.status)
                : (scoreValue != null
                  ? '<span class="badge badge-blue">Puntaje capturado</span>'
                  : _statusBadge(m.status));
              const scoreCell = scoreValue != null
                ? `<strong>${scoreValue}</strong>${m.score_a == null ? ' <span class="text-xs text-muted">(provisional)</span>' : ''}`
                : '<span class="text-muted">—</span>';
              return `
              <tr>
                <td class="text-muted">${m.position}</td>
                <td><strong>${name}</strong></td>
                <td class="text-muted">${_renderDojoBadgeSmall(m.competitor_a)}</td>
                <td>${statusCell}</td>
                <td>${scoreCell}</td>
                ${options.editable ? `
                  <td>
                    ${m.status !== MATCH_STATUS.FINISHED
                      ? `<button class="btn btn-sm btn-outline" onclick="Display._triggerMatchClick('${m.id}')">Puntuar atleta</button>`
                      : `<button class="btn btn-sm btn-ghost" style="opacity:.7;" onclick="Display._triggerMatchClick('${m.id}')">📋 Ver puntaje</button>`
                    }
                  </td>` : ''}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    container.innerHTML = html;
    container._matchClickHandler = options.onMatchClick;
  }

  /* --------------------------------------------------------
     RENDERIZA EL BRACKET DE ELIMINACIÓN (árbol visual)
  -------------------------------------------------------- */
  function _renderEliminationBracket(container, matches, category, options) {
    const rounds = _groupByRound(matches.filter(m => !m.bracket_type?.includes('bronze')));
    const bronze  = matches.filter(m => m.bracket_type?.includes('bronze'));

    const wrapper = document.createElement('div');
    wrapper.className = 'bracket-container';

    rounds.forEach((roundMatches, index) => {
      const roundEl = _buildRoundColumn(roundMatches, index, rounds.length, options);
      wrapper.appendChild(roundEl);
    });

    container.appendChild(wrapper);

    // Medallas de bronce (repesca)
    if (bronze.length) {
      const bronzeSection = document.createElement('div');
      bronzeSection.className = 'mt-3';
      bronzeSection.innerHTML = `
        <h4 class="text-muted text-sm mb-2" style="text-transform:uppercase;letter-spacing:.06em;">
          🥉 Combates por el Bronce
        </h4>`;
      const bronzeGrid = document.createElement('div');
      bronzeGrid.className = 'flex gap-2 flex-wrap';
      bronze.forEach(m => bronzeGrid.appendChild(_buildMatchCard(m, options)));
      bronzeSection.appendChild(bronzeGrid);
      container.appendChild(bronzeSection);
    }
  }

  function _buildRoundColumn(roundMatches, roundIndex, totalRounds, options) {
    const col = document.createElement('div');
    col.className = 'bracket-round';

    const label = document.createElement('div');
    label.className = 'bracket-round-label';
    label.textContent = roundMatches[0]?.round_label || `Ronda ${roundIndex + 1}`;
    col.appendChild(label);

    const matchesWrap = document.createElement('div');
    matchesWrap.className = 'bracket-matches';
    roundMatches.forEach(m => matchesWrap.appendChild(_buildMatchCard(m, options)));
    col.appendChild(matchesWrap);

    return col;
  }

  /* --------------------------------------------------------
     TARJETA VISUAL DE UN COMBATE
  -------------------------------------------------------- */
  function _buildMatchCard(match, options = {}) {
    const card = document.createElement('div');
    card.className = 'bracket-match';
    card.dataset.matchId = match.id;

    if (options.editable && match.status === MATCH_STATUS.PENDING &&
        match.competitor_a_id && match.competitor_b_id) {
      card.style.cursor = 'pointer';
      card.title = 'Click para registrar resultado';
      card.addEventListener('click', () => options.onMatchClick?.(match));
    }

    if (options.editable && match.status === MATCH_STATUS.FINISHED && match.winner_id) {
      card.style.cursor = 'pointer';
      card.title = 'Ver resultado registrado';
      card.addEventListener('click', () => options.onMatchClick?.(match));
    }

    const nameA = _getCompetitorName(match, 'a');
    const nameB = _getCompetitorName(match, 'b');
    const clubA = match.competitor_a?.competitors?.club || match.competitor_a?.club || '';
    const clubB = match.competitor_b?.competitors?.club || match.competitor_b?.club || '';
    const competitorAId = match.competitor_a?.id || match.competitor_a_id || null;
    const competitorBId = match.competitor_b?.id || match.competitor_b_id || null;
    const isWinnerA = match.winner_id && competitorAId === match.winner_id;
    const isWinnerB = match.winner_id && competitorBId === match.winner_id;
    const isBye     = match.status === MATCH_STATUS.BYE;

    card.innerHTML = `
      <div class="bracket-competitor ${isWinnerA ? 'winner' : ''} ${!isWinnerA && match.winner_id ? 'loser' : ''}">
        <span class="bracket-competitor-name">${nameA || (isBye ? '—' : 'Por definir')}</span>
        ${nameA ? `<span style="font-size:.65rem;opacity:.6;display:block;line-height:1.2;">${_renderDojoBadgeSmall(match.competitor_a)}</span>` : ''}
        ${match.score_a != null ? `<span class="bracket-competitor-score">${match.score_a}</span>` : ''}
      </div>
      <div class="bracket-competitor ${isWinnerB ? 'winner' : ''} ${!isWinnerB && match.winner_id ? 'loser' : ''} ${isBye ? 'bye' : ''}">
        <span class="bracket-competitor-name">${nameB || (isBye ? 'BYE' : 'Por definir')}</span>
        ${nameB ? `<span style="font-size:.65rem;opacity:.6;display:block;line-height:1.2;">${_renderDojoBadgeSmall(match.competitor_b)}</span>` : ''}
        ${match.score_b != null ? `<span class="bracket-competitor-score">${match.score_b}</span>` : ''}
      </div>
    `;

    return card;
  }

  /* --------------------------------------------------------
     RENDERIZA TABLA ROUND-ROBIN
  -------------------------------------------------------- */
  function _renderRoundRobin(container, matches, category, options) {
    const rounds = _groupByRound(matches);

    const html = `
      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Ronda</th>
              <th>Competidor A</th>
              <th>Resultado</th>
              <th>Competidor B</th>
              <th>Estado</th>
              ${options.editable ? '<th></th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${matches.map(m => `
              <tr>
                <td class="text-muted text-sm">${m.round_label || `R${m.round}`}</td>
                <td>
                  <span class="${m.winner_id === m.competitor_a_id ? 'text-success' : ''}">
                    ${_getCompetitorName(m, 'a') || '—'}
                  </span>
                  <small style="display:block;opacity:.7;">${_renderDojoBadgeSmall(m.competitor_a)}</small>
                </td>
                <td class="text-center">
                  ${m.status === MATCH_STATUS.FINISHED
                    ? `<strong>${m.score_a ?? '?'} – ${m.score_b ?? '?'}</strong>`
                    : '<span class="text-muted">vs</span>'
                  }
                </td>
                <td>
                  <span class="${m.winner_id === m.competitor_b_id ? 'text-success' : ''}">
                    ${_getCompetitorName(m, 'b') || '—'}
                  </span>
                  <small style="display:block;opacity:.7;">${_renderDojoBadgeSmall(m.competitor_b)}</small>
                </td>
                <td>${_statusBadge(m.status)}</td>
                ${options.editable ? `
                  <td>
                    ${m.status !== MATCH_STATUS.FINISHED && m.competitor_a_id && m.competitor_b_id
                      ? `<button class="btn btn-sm btn-outline" onclick="Display._triggerMatchClick('${m.id}')">Resultado</button>`
                      : m.status === MATCH_STATUS.FINISHED
                        ? `<button class="btn btn-sm btn-ghost" style="opacity:.7;" onclick="Display._triggerMatchClick('${m.id}')">📋 Ver</button>`
                        : ''
                    }
                  </td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;
    container._matchClickHandler = options.onMatchClick;
  }

  /* Puente para los onclick inline de la tabla round-robin */
  function _triggerMatchClick(matchId) {
    // El handler lo registra la vista que llama a renderBracket
    document.dispatchEvent(new CustomEvent('match:click', { detail: { matchId } }));
  }

  /* --------------------------------------------------------
     TABLA DE CLASIFICACIÓN (Round-Robin standings)
  -------------------------------------------------------- */
  function renderStandings(container, standings) {
    if (!standings.length) {
      container.innerHTML = _emptyState('Aún no hay resultados.');
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    container.innerHTML = `
      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr><th>Pos.</th><th>Competidor</th><th>Club</th><th>V</th><th>D</th><th>Jugados</th></tr>
          </thead>
          <tbody>
            ${standings.map((s, i) => `
              <tr>
                <td>${medals[i] || i + 1}</td>
                <td><strong>${s.full_name || '—'}</strong></td>
                <td class="text-muted text-sm">${s.competitor ? _renderDojoBadgeSmall({ competitors: s }) : (s.club || '—')}</td>
                <td class="text-success"><strong>${s.wins}</strong></td>
                <td class="text-danger">${s.losses}</td>
                <td class="text-muted">${s.played}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /* --------------------------------------------------------
     LISTA DE CATEGORÍAS CON PROGRESO
  -------------------------------------------------------- */
  function renderCategoryList(container, categories, onSelect) {
    if (!categories.length) {
      container.innerHTML = _emptyState('No hay categorías registradas.');
      return;
    }
    container.innerHTML = '';
    categories.forEach(cat => {
      const card = document.createElement('div');
      card.className = 'card mb-2';
      card.style.cursor = 'pointer';

      const total    = cat.matches_count   || 0;
      const finished = cat.finished_count  || 0;
      const pct      = total > 0 ? Math.round((finished / total) * 100) : 0;
      const countBadge  = `<span class="badge badge-blue">${cat.registrations_count || 0} competidores</span>`;
      const discBadge   = `<span class="badge ${cat.discipline === 'kumite' ? 'badge-red' : 'badge-gold'}">${cat.discipline}</span>`;
      const tatamiStr   = cat.tatami ? String(cat.tatami) : null;
      const tatamiBadge = tatamiStr ? `<span class="badge badge-muted" style="background:#334155;color:#94a3b8;">T${tatamiStr}</span>` : '';

      const ageGroup = AGE_GROUPS.find(a => a.id === cat.age_group_id);
      const ageRange = ageGroup
        ? `<span class="text-xs text-muted">${ageGroup.minAge}–${ageGroup.maxAge} años</span>`
        : '';

      card.innerHTML = `
        <div class="flex items-center justify-between">
          <div>
            <div class="flex items-center gap-1 mb-1">
              ${discBadge} ${tatamiBadge} ${countBadge}
            </div>
            <strong>${cat.name || Categories.buildLabel(cat)}</strong>
            ${ageRange ? `<div class="mt-1">${ageRange}</div>` : ''}
          </div>
          <div class="text-right">
            <div class="text-sm text-muted">${finished}/${total} combates</div>
            <div class="text-xs text-muted">${pct}% completado</div>
          </div>
        </div>
        ${total > 0 ? `
          <div style="height:4px;background:var(--border);border-radius:99px;margin-top:.75rem;">
            <div style="height:100%;width:${pct}%;background:var(--success);border-radius:99px;transition:width .4s;"></div>
          </div>` : ''}
      `;
      card.addEventListener('click', () => onSelect?.(cat));
      container.appendChild(card);
    });
  }

  /* --------------------------------------------------------
     TOAST NOTIFICATION
  -------------------------------------------------------- */
  function toast(message, type = 'info') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      document.body.appendChild(toastContainer);
    }

    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    toastContainer.appendChild(el);

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(() => el.remove(), 300);
    }, 3500);
  }

  /* --------------------------------------------------------
     MODAL GENÉRICO
  -------------------------------------------------------- */
  function openModal(modalId) {
    document.getElementById(modalId)?.classList.add('open');
  }

  function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('open');
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }

  /* --------------------------------------------------------
     TABS
  -------------------------------------------------------- */
  function initTabs(containerSelector) {
    // Accept a DOM element directly or a CSS selector string
    let containers;
    if (containerSelector instanceof Element) {
      containers = [containerSelector];
    } else {
      containers = document.querySelectorAll(containerSelector || '[data-tabs]');
    }
    containers.forEach(container => {
      const buttons = container.querySelectorAll('.tab-btn');
      const panels  = container.querySelectorAll('.tab-panel');

      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          const target = btn.dataset.tab;
          buttons.forEach(b => b.classList.remove('active'));
          panels.forEach(p => p.classList.remove('active'));
          btn.classList.add('active');
          // Try data-tab-panel attribute first, then fall back to id
          const panel = container.querySelector(`[data-tab-panel="${target}"]`) ||
                        container.querySelector(`#${target}`);
          panel?.classList.add('active');
        });
      });

      // Activa el primero por defecto
      if (buttons.length) buttons[0].click();
    });
  }

  /* ---- Helpers privados ---- */

  function _groupByRound(matches) {
    const map = new Map();
    matches.forEach(m => {
      if (!map.has(m.round)) map.set(m.round, []);
      map.get(m.round).push(m);
    });
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }

  function _getCompetitorName(match, side) {
    const reg = side === 'a' ? match.competitor_a : match.competitor_b;
    return reg?.competitors?.full_name || reg?.full_name || null;
  }

  function _statusBadge(status) {
    const map = {
      [MATCH_STATUS.PENDING]:  '<span class="badge badge-muted">Pendiente</span>',
      [MATCH_STATUS.ONGOING]:  '<span class="badge badge-orange">En Progreso</span>',
      [MATCH_STATUS.FINISHED]: '<span class="badge badge-green">Finalizado</span>',
      [MATCH_STATUS.BYE]:      '<span class="badge badge-blue">BYE</span>',
    };
    return map[status] || `<span class="badge badge-muted">${status}</span>`;
  }

  function _emptyState(message) {
    return `
      <div class="empty-state">
        <div class="empty-icon">🥋</div>
        <h3>Sin datos</h3>
        <p>${message}</p>
      </div>
    `;
  }

  return {
    renderBracket,
    renderStandings,
    renderCategoryList,
    toast,
    openModal,
    closeModal,
    closeAllModals,
    initTabs,
    _triggerMatchClick,
  };
})();
