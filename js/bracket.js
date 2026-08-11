/* ============================================================
   BRACKET.JS — Motor de llaves de eliminación
   ============================================================ */

const Bracket = (() => {

  const DEV_KEY = 'ot_dev_matches';

  /* ---- localStorage helpers (modo dev) ---- */
  function _devList()    { try { return JSON.parse(localStorage.getItem(DEV_KEY) || '[]'); } catch { return []; } }
  function _devSave(l)   { localStorage.setItem(DEV_KEY, JSON.stringify(l)); }
  function _devGetById(id) { return _devList().find(m => m.id === id) || null; }
  function _devByCat(categoryId)   { return _devList().filter(m => m.category_id === categoryId); }
  function _devByTournament(tid)   { return _devList().filter(m => m.tournament_id === tid); }
  function _devClearByCat(categoryId) {
    const list = _devList().filter(m => m.category_id !== categoryId);
    _devSave(list);
  }
  function _devInsertMatches(matches) {
    const list = _devList();
    const created = matches.map(m => ({ ...m, id: generateId(), created_at: new Date().toISOString() }));
    _devSave([...list, ...created]);
    return created;
  }
  /**
   * Propaga BYEs en cascada para rondas 2+:
   * Si un match tiene un solo competidor y no existe feeder para el slot vacío,
   * ese match es un BYE en cascada y el competidor avanza.
   */
  function _devCascadeByes(categoryId) {
    let changed = true;
    while (changed) {
      changed = false;
      const list = _devList();
      const cat  = list.filter(m => m.category_id === categoryId);
      for (const m of cat) {
        if (m.status !== MATCH_STATUS.PENDING) continue;
        const hasA = !!m.competitor_a_id;
        const hasB = !!m.competitor_b_id;
        if (hasA === hasB) continue; // ambos o ninguno — no aplica
        // El feeder esperado para el slot vacío:
        // slot A viene del feeder en posición 2*P-1, slot B del feeder en 2*P
        const emptyFeederPos = hasA ? m.position * 2 : m.position * 2 - 1;
        const feeder = cat.find(f => f.round === m.round - 1 && f.position === emptyFeederPos);
        if (!feeder) {
          // No hay feeder → BYE en cascada
          const winner = hasA ? m.competitor_a_id : m.competitor_b_id;
          const idx = list.findIndex(mm => mm.id === m.id);
          if (idx !== -1) {
            list[idx] = { ...list[idx], winner_id: winner, status: MATCH_STATUS.BYE };
            _devSave(list);
            _devAdvanceWinner(list[idx], winner, list[idx].position % 2 === 1 ? 'competitor_a_id' : 'competitor_b_id');
            changed = true;
            break; // reiniciar con lista actualizada
          }
        }
      }
    }
  }

  function _devAdvanceWinner(match, winnerId, slot) {
    const list = _devList();
    const nextIdx = list.findIndex(m =>
      m.category_id === match.category_id &&
      m.round       === match.round + 1   &&
      m.position    === Math.ceil(match.position / 2)
    );
    if (nextIdx !== -1) {
      list[nextIdx] = { ...list[nextIdx], [slot]: winnerId };
      _devSave(list);
    }
  }

  /* --------------------------------------------------------
     GENERAR LLAVES PARA UNA CATEGORÍA
     Detecta el sistema automáticamente o usa el especificado.
     @param {string} categoryId
     @returns {object[]} Combates (matches) creados
  -------------------------------------------------------- */
  async function generate(categoryId) {
    const category    = await Categories.getById(categoryId);
    const competitors = await Competitors.listByCategory(categoryId);

    if (competitors.length < 2) {
      throw new Error('Se necesitan al menos 2 competidores para generar llaves.');
    }

    await _clearPendingMatches(categoryId);

    const system = _resolveSystem(category.bracket_system, competitors.length);

    // --- Separar por club (evita mismo dojo en R1) ---
    const separated = _separateByClub(competitors);

    // Detectar conflictos restantes tras la separación
    const warnings = [];
    if (system !== 'round_robin') {
      const size      = nextPowerOf2(separated.length);
      const tempBracket = _seedIntoBracket(separated, size);
      const conflicts = _detectClubConflicts(tempBracket);
      const catName   = category.name || 'Categoría';
      for (const c of conflicts) {
        warnings.push(`"${catName}": ${c.a} vs ${c.b} (mismo dojo: ${c.club})`);
      }
    }

    let matches;
    switch (system) {
      case 'kata_individual':     matches = _buildKataElimination(competitors, category); break;
      case 'round_robin':         matches = _buildRoundRobin(separated, category, true); break;
      case 'single_elimination':  matches = _buildSingleElimination(separated, category, true); break;
      case 'repechage':           matches = _buildRepechage(separated, category, true); break;
      case 'double_elimination':  matches = _buildDoubleElimination(separated, category, true); break;
      default:                    matches = _buildSingleElimination(separated, category, true);
    }

    // Persistir
    if (Auth.isDevMode()) {
      const saved = _devInsertMatches(matches);
      // Propagar BYEs de R1 inmediatamente (ganador ya conocido)
      for (const m of saved) {
        if (m.status === MATCH_STATUS.BYE && m.winner_id) {
          _devAdvanceWinner(m, m.winner_id, m.position % 2 === 1 ? 'competitor_a_id' : 'competitor_b_id');
        }
      }
      // Propagar BYEs en cascada (rounds 2+ donde el feeder del hueco no existe)
      _devCascadeByes(categoryId);
      return { matches: _devByCat(categoryId), warnings };
    }
    const { data, error } = await supabase
      .from('matches')
      .insert(matches)
      .select();
    if (error) throw error;
    // Propagar BYEs en Supabase
    for (const m of data) {
      if (m.status === MATCH_STATUS.BYE && m.winner_id) {
        await advanceWinner(m, m.winner_id);
      }
    }
    return { matches: data, warnings };
  }

  /* --------------------------------------------------------
     OBTENER LLAVES DE UNA CATEGORÍA (con todos los datos)
  -------------------------------------------------------- */
  async function getByCategoryId(categoryId) {
    if (Auth.isDevMode()) return _devByCat(categoryId);
    const { data, error } = await supabase
      .from('matches')
      .select(`
        *,
        competitor_a:registrations!matches_competitor_a_id_fkey(
          id, competitors(id, full_name, club)
        ),
        competitor_b:registrations!matches_competitor_b_id_fkey(
          id, competitors(id, full_name, club)
        ),
        winner:registrations!matches_winner_id_fkey(
          id, competitors(id, full_name)
        )
      `)
      .eq('category_id', categoryId)
      .order('round')
      .order('position');
    if (error) throw error;
    return data || [];
  }

  /* --------------------------------------------------------
     OBTENER LLAVES DE TODO EL TORNEO
  -------------------------------------------------------- */
  async function getByTournamentId(tournamentId) {
    if (Auth.isDevMode()) return _devByTournament(tournamentId);
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('category_id')
      .order('round')
      .order('position');
    if (error) throw error;
    return data || [];
  }

  /**
   * Genera el HTML de una llave profesional para impresión A4.
   * @param {string} categoryId 
   * @param {object} category 
   */
  async function renderPrintableBracket(categoryId, category) {
    const matches = await getByCategoryId(categoryId);
    if (!matches.length) return '<div class="text-center p-4">No hay combates generados para esta categoría.</div>';

    const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);
    
    let html = `<div class="bracket-print-page">`;
    html += `<div class="print-header">
                <h1>${escape(category.name)}</h1>
                <p>${escape(category.discipline)} - ${escape(category.gender)} - ${escape(category.age_group)}</p>
              </div>`;
    
    html += `<div class="bracket-grid-print" style="display: flex; gap: 20px; align-items: flex-start;">`;
    
    for (const round of rounds) {
      const roundMatches = matches.filter(m => m.round === round);
      html += `<div class="bracket-round-print" style="display: flex; flex-direction: column; justify-content: space-around; height: 100%;">`;
      html += `<div style="text-align:center; font-weight:bold; margin-bottom:10px;">Ronda ${round}</div>`;
      
      for (const m of roundMatches) {
        const compA = m.competitor_a?.competitors?.full_name || '---';
        const compB = m.competitor_b?.competitors?.full_name || '---';
        const winner = m.winner?.competitors?.full_name || '';
        
        html += `
          <div class="bracket-match" style="border: 1px solid black; width: 150px; margin-bottom: 15px; font-size: 10px;">
            <div class="bracket-competitor ${winner === compA ? 'bracket-winner' : ''}" style="padding: 2px; border-bottom: 1px solid #ccc;">${escape(compA)}</div>
            <div class="bracket-competitor ${winner === compB ? 'bracket-winner' : ''}" style="padding: 2px;">${escape(compB)}</div>
          </div>`;
      }
      html += `</div>`;
    }
    
    html += `</div></div>`;
    return html;
  }

  function escape(s) { return String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  /* --------------------------------------------------------
     REGENERAR LLAVES (borra y vuelve a crear)
  -------------------------------------------------------- */
  async function regenerate(categoryId) {
    return generate(categoryId);
  }

  /* ======================================================
     ALGORITMOS DE GENERACIÓN DE LLAVES
     ====================================================== */

  /* ---- Resolución del sistema según cantidad de competidores ---- */
  function _resolveSystem(system, count) {
    if (system === 'auto') {
      return count <= 3 ? 'round_robin' : 'single_elimination';
    }
    // Kata individual y kata por duelos se manejan en generate()
    if (system === 'kata_individual') return 'kata_individual';
    if (system === 'kata_duels') return 'kata_duels';
    return system;
  }

  /* --------------------------------------------------------
     ROUND-ROBIN: todos vs todos
     Genera n*(n-1)/2 combates usando el algoritmo de rotación.
     Con número impar, el competidor en la última posición
     recibe BYE en esa ronda.
  -------------------------------------------------------- */
  function _buildRoundRobin(competitors, category, presorted = false) {
    const list = _shuffleAndSeed([...competitors], presorted);
    const n    = list.length;
    const rounds = n % 2 === 0 ? n - 1 : n;
    const pool   = n % 2 === 0 ? [...list] : [...list, null]; // null = BYE
    const size   = pool.length;
    const matches = [];
    let position = 0;

    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < size / 2; i++) {
        const a = pool[i];
        const b = pool[size - 1 - i];
        if (a && b) {
          matches.push(_buildMatch({
            category,
            round: r + 1,
            round_label: `Ronda ${r + 1}`,
            position: ++position,
            competitor_a_id: a.registration_id,
            competitor_b_id: b.registration_id,
            bracket_type: 'round_robin',
          }));
        }
      }
      // Rotación: fija el primer elemento, rota el resto
      pool.splice(1, 0, pool.pop());
    }
    return matches;
  }

  /* --------------------------------------------------------
     ELIMINACIÓN SIMPLE
     Rellena hasta la siguiente potencia de 2 con BYEs.
     Los seeds se colocan en posiciones enfrentadas.
  -------------------------------------------------------- */
  function _buildSingleElimination(competitors, category, presorted = false) {
    const seeded  = _shuffleAndSeed([...competitors], presorted);
    const size    = nextPowerOf2(seeded.length);
    const bracket = _seedIntoBracket(seeded, size);
    const matches = [];
    const totalRounds = Math.log2(size);

    for (let i = 0; i < size / 2; i++) {
      const a = bracket[i * 2];
      const b = bracket[i * 2 + 1];
      const roundLabel = _roundLabel(1, totalRounds);

      if (a && b) {
        // Combate normal
        matches.push(_buildMatch({
          category, round: 1, round_label: roundLabel, position: i + 1,
          competitor_a_id: a.registration_id,
          competitor_b_id: b.registration_id,
          bracket_type: 'single_elimination',
        }));
      } else if (a || b) {
        // BYE: siempre poner al competidor real en slot A para consistencia visual
        const realComp = a || b;
        matches.push(_buildMatch({
          category, round: 1, round_label: roundLabel, position: i + 1,
          competitor_a_id: realComp.registration_id,
          competitor_b_id: null,
          winner_id: realComp.registration_id,
          status: MATCH_STATUS.BYE,
          bracket_type: 'single_elimination',
        }));
      }
      // !a && !b → no crear match (posición vacía, el cascade la resuelve)
    }

    // Genera slots vacíos para rondas posteriores
    let matchesInRound = size / 2;
    for (let round = 2; round <= totalRounds; round++) {
      matchesInRound = matchesInRound / 2;
      const roundLabel = _roundLabel(round, totalRounds);
      for (let pos = 1; pos <= matchesInRound; pos++) {
        matches.push(_buildMatch({
          category, round, round_label: roundLabel, position: pos,
          competitor_a_id: null,
          competitor_b_id: null,
          bracket_type: 'single_elimination',
        }));
      }
    }

    return matches;
  }

  /* --------------------------------------------------------
     ELIMINACIÓN + REPESCA (WKF)
     Los perdedores contra los finalistas entran a la
     "repechage" y pueden disputar el bronce.
  -------------------------------------------------------- */
  function _buildRepechage(competitors, category, presorted = false) {
    const mainBracket = _buildSingleElimination(competitors, category, presorted);

    // Marca los partidos del main bracket
    mainBracket.forEach(m => m.bracket_type = 'repechage_main');

    // Los slots de repesca se agregan como ronda adicional
    // Se genera 1 combate de repesca por semifinal (2 total → 2 bronces)
    const totalRounds = Math.log2(nextPowerOf2(competitors.length));
    const semiRound   = totalRounds - 1;

    const repechajeMatches = [
      _buildMatch({
        category,
        round: totalRounds + 1,
        round_label: 'Repesca Bronce A',
        position: 1,
        competitor_a_id: null,
        competitor_b_id: null,
        bracket_type: 'repechage_bronze',
        notes: `Perdedores de semifinal ronda ${semiRound}`,
      }),
      _buildMatch({
        category,
        round: totalRounds + 1,
        round_label: 'Repesca Bronce B',
        position: 2,
        competitor_a_id: null,
        competitor_b_id: null,
        bracket_type: 'repechage_bronze',
        notes: `Perdedores de semifinal ronda ${semiRound}`,
      }),
    ];

    return [...mainBracket, ...repechajeMatches];
  }

  /* --------------------------------------------------------
     DOBLE ELIMINACIÓN
     Se necesitan 2 derrotas para ser eliminado.
     Winner bracket + Loser bracket + Gran Final.
  -------------------------------------------------------- */
  function _buildDoubleElimination(competitors, category, presorted = false) {
    const seeded = _shuffleAndSeed([...competitors], presorted);
    const size   = nextPowerOf2(seeded.length);
    const bracket = _seedIntoBracket(seeded, size);
    const matches = [];
    const wRounds = Math.log2(size);

    // Winner bracket — igual que eliminación simple
    for (let i = 0; i < size / 2; i++) {
      const a = bracket[i * 2];
      const b = bracket[i * 2 + 1];
      matches.push(_buildMatch({
        category, round: 1, round_label: `W-R1`, position: i + 1,
        competitor_a_id: a ? a.registration_id : null,
        competitor_b_id: b ? b.registration_id : null,
        bracket_type: 'double_winner',
      }));
    }

    let wMatchesInRound = size / 2;
    for (let round = 2; round <= wRounds; round++) {
      wMatchesInRound = wMatchesInRound / 2;
      for (let pos = 1; pos <= wMatchesInRound; pos++) {
        matches.push(_buildMatch({
          category, round, round_label: `W-R${round}`, position: pos,
          competitor_a_id: null, competitor_b_id: null,
          bracket_type: 'double_winner',
        }));
      }
    }

    // Loser bracket (simplificado: slots vacíos por ronda)
    const lRounds = (wRounds - 1) * 2;
    let lMatchesInRound = size / 4;
    for (let round = 1; round <= lRounds; round++) {
      for (let pos = 1; pos <= lMatchesInRound; pos++) {
        matches.push(_buildMatch({
          category,
          round: wRounds + round,
          round_label: `L-R${round}`,
          position: pos,
          competitor_a_id: null, competitor_b_id: null,
          bracket_type: 'double_loser',
        }));
      }
      if (round % 2 === 1) lMatchesInRound = Math.max(1, lMatchesInRound / 2);
    }

    // Gran Final
    matches.push(_buildMatch({
      category,
      round: wRounds + lRounds + 1,
      round_label: 'Gran Final',
      position: 1,
      competitor_a_id: null, competitor_b_id: null,
      bracket_type: 'double_final',
    }));

    return matches;
  }

  /* --------------------------------------------------------
     AVANZAR GANADOR al siguiente combate
     Se llama desde matches.js cuando se registra un resultado.
     @param {object} match - Combate que terminó
     @param {string} winnerId - registration_id del ganador
  -------------------------------------------------------- */
  async function advanceWinner(match, winnerId) {
    if (match.bracket_type === 'round_robin') return;

    const slot = match.position % 2 === 1 ? 'competitor_a_id' : 'competitor_b_id';

    if (Auth.isDevMode()) {
      _devAdvanceWinner(match, winnerId, slot);
      return;
    }

    const nextRound    = match.round + 1;
    const nextPosition = Math.ceil(match.position / 2);

    const { data: nextMatch } = await supabase
      .from('matches')
      .select('*')
      .eq('category_id', match.category_id)
      .eq('round', nextRound)
      .eq('position', nextPosition)
      .maybeSingle();

    if (!nextMatch) return; // Era la final, no hay siguiente

    await supabase
      .from('matches')
      .update({ [slot]: winnerId })
      .eq('id', nextMatch.id);
  }

  /* ---- Helpers privados ---- */

  function _buildMatch(data) {
    const isKata = data.category?.discipline === 'kata';
    return {
      tournament_id:    data.category.tournament_id,
      category_id:      data.category.id,
      round:            data.round,
      round_label:      data.round_label || `Ronda ${data.round}`,
      position:         data.position,
      competitor_a_id:  data.competitor_a_id  || null,
      competitor_b_id:  data.competitor_b_id  || null,
      winner_id:        data.winner_id        || null,
      score_a:          null,
      score_b:          null,
      status:           data.status || MATCH_STATUS.PENDING,
      bracket_type:     isKata ? 'kata_round' : (data.bracket_type || 'single_elimination'),
      notes:            data.notes || null,
      tatami:           data.tatami ?? data.category?.tatami ?? null,
      scheduled_time:   null,
    };
  }

  /* --------------------------------------------------------
     GENERAR TODAS LAS LLAVES DE UN TORNEO
     Itera las categorías y llama a generate(categoryId)
  -------------------------------------------------------- */
  async function generateAll(tournamentId) {
    const cats = await Categories.listByTournament(tournamentId);
    const results = [];
    for (const c of cats) {
      try {
        const res = await generate(c.id);
        results.push({ category: c.id, ok: true, matches: res.matches?.length || 0, warnings: res.warnings || [] });
      } catch (e) {
        results.push({ category: c.id, ok: false, error: e.message });
      }
    }
    return results;
  }

  /** Mezcla y respeta seeds; si presorted=true no baraja los sin-seed. */
  function _shuffleAndSeed(competitors, presorted = false) {
    const seeded   = competitors.filter(c => c.seed != null).sort((a, b) => a.seed - b.seed);
    const unseeded = competitors.filter(c => c.seed == null);
    if (!presorted) unseeded.sort(() => Math.random() - 0.5);
    return [...seeded, ...unseeded];
  }

  /**
   * Reordena los sin-seed para minimizar enfrentamientos del mismo dojo en R1.
   * Propiedad del algoritmo de seeds: el competidor en posición i y el de
   * posición i+half siempre son rivales en R1 (válido para tamaños 4-64).
   */
  function _separateByClub(competitors) {
    const size = nextPowerOf2(competitors.length);
    const half = size / 2;
    const seeded   = competitors.filter(c => c.seed != null).sort((a, b) => a.seed - b.seed);
    const unseeded = competitors.filter(c => c.seed == null).sort(() => Math.random() - 0.5);
    const pending  = [...seeded, ...unseeded];

    // Intenta resolver conflictos: para cada par rival (i, i+half)
    // busca intercambio en la mitad derecha que resuelva sin crear nuevos.
    for (let i = 0; i < Math.min(half, pending.length); i++) {
      const j = i + half;
      if (j >= pending.length) break;
      const a = pending[i], b = pending[j];
      const cA = a?.club?.trim(), cB = b?.club?.trim();
      if (!cA || !cB || cA !== cB) continue;  // sin conflicto

      for (let k = j + 1; k < pending.length; k++) {
        const c  = pending[k];
        const cC = c?.club?.trim();
        // pending[j]<->pending[k]: nuevo rival de i es cC, nuevo rival de k es cB
        const kPair = k < half ? k + half : k - half;
        const kPairClub = kPair < pending.length ? pending[kPair]?.club?.trim() : null;
        if (cA !== cC && (kPairClub == null || cB !== kPairClub)) {
          [pending[j], pending[k]] = [pending[k], pending[j]];
          break;
        }
      }
    }
    return pending;
  }

  /** Detecta pares R1 del bracket con mismo club. */
  function _detectClubConflicts(bracket) {
    const conflicts = [];
    for (let i = 0; i < bracket.length - 1; i += 2) {
      const a = bracket[i], b = bracket[i + 1];
      const cA = a?.club?.trim(), cB = b?.club?.trim();
      if (a && b && cA && cB && cA === cB) {
        conflicts.push({ club: cA, a: a.full_name, b: b.full_name });
      }
    }
    return conflicts;
  }

  /** Kata: todos compiten en una sola ronda individual (sin rival). */
  function _buildKataElimination(competitors, category) {
    return [...competitors].sort(() => Math.random() - 0.5).map((comp, i) =>
      _buildMatch({
        category,
        round: 1,
        round_label: 'Ronda Única',
        position: i + 1,
        competitor_a_id: comp.registration_id,
        competitor_b_id: null,
        bracket_type: 'kata_round',
      })
    );
  }

  /**
   * Distribuye los competidores en el bracket asegurando que:
   * - El seed 1 y 2 quedan en lados opuestos del bracket (no se pueden cruzar hasta la final)
   * - Los seeds 3 y 4 quedan en cuartos opuestos
   * - Los seeds de mayor ranking reciben los BYEs; los últimos pelean en R1
   */
  function _seedIntoBracket(competitors, size) {
    const bracket      = new Array(size).fill(null);
    const seedPositions = _getSeedPositions(size);
    const n    = competitors.length;
    const byes = size - n; // cantidad de BYEs = slots vacíos en R1

    // Top `byes` seeds reciben BYE — su par (rival) queda null
    for (let i = 0; i < byes; i++) {
      const pos = seedPositions[i];
      if (pos !== undefined && pos < size) bracket[pos] = competitors[i];
    }

    // Los competidores restantes pelean en R1.
    // Emparejamiento: seed(byes+k) vs seed(n-1-k), ubicando al de mayor
    // ranking en su posición estándar y al oponente en el par adyacente.
    const fighters    = competitors.slice(byes); // siempre longitud par
    const halfFighters = fighters.length / 2;
    for (let k = 0; k < halfFighters; k++) {
      const hi    = fighters[k];                         // mayor ranking
      const lo    = fighters[fighters.length - 1 - k];  // menor ranking
      const hiPos = seedPositions[byes + k];
      const loPos = hiPos % 2 === 0 ? hiPos + 1 : hiPos - 1; // par adyacente
      if (hiPos < size)                bracket[hiPos] = hi;
      if (loPos >= 0 && loPos < size)  bracket[loPos] = lo;
    }

    return bracket;
  }

  /** Genera las posiciones de seeds según tamaño del bracket. */
  function _getSeedPositions(size) {
    // Para size=8: [0, 7, 3, 4, 1, 6, 2, 5] (seeds enfrentados a los de menor rango)
    if (size === 2)  return [0, 1];
    if (size === 4)  return [0, 3, 1, 2];
    if (size === 8)  return [0, 7, 3, 4, 1, 6, 2, 5];
    if (size === 16) return [0,15,7,8,3,12,4,11,1,14,6,9,2,13,5,10];
    // Genérico para tamaños mayores
    return Array.from({ length: size }, (_, i) => i);
  }

  function _findEmptySlot(bracket) {
    return bracket.findIndex(s => s === null);
  }

  function _roundLabel(round, totalRounds) {
    const remaining = totalRounds - round + 1;
    if (remaining === 1) return 'Final';
    if (remaining === 2) return 'Semifinal';
    if (remaining === 3) return 'Cuartos de Final';
    if (remaining === 4) return 'Octavos de Final';
    return `Ronda ${round}`;
  }

  async function _clearPendingMatches(categoryId) {
    if (Auth.isDevMode()) {
      const existing = _devByCat(categoryId);
      if (existing.some(m => m.status === MATCH_STATUS.FINISHED)) {
        throw new Error('No se pueden regenerar las llaves: ya hay combates finalizados en esta categoría.');
      }
      _devClearByCat(categoryId);
      return;
    }
    const { data } = await supabase
      .from('matches')
      .select('id, status')
      .eq('category_id', categoryId);

    if (!data?.length) return;

    const hasFinished = data.some(m => m.status === MATCH_STATUS.FINISHED);
    if (hasFinished) {
      throw new Error('No se pueden regenerar las llaves: ya hay combates finalizados en esta categoría.');
    }

    await supabase.from('matches').delete().eq('category_id', categoryId);
  }

  /* --------------------------------------------------------
     AVANZAR RONDA DE KATA
     Toma los mejores puntajes de la ronda actual y crea la siguiente.
     @param {string} categoryId
     @returns {object[]} Todos los combates de la categoría
  -------------------------------------------------------- */
  async function advanceKataRound(categoryId) {
    const allMatches = Auth.isDevMode() ? _devByCat(categoryId) : await getByCategoryId(categoryId);
    const kataMatches = allMatches.filter(m => m.bracket_type === 'kata_round');

    if (!kataMatches.length) throw new Error('No hay rondas de kata generadas.');

    const maxRound    = Math.max(...kataMatches.map(m => m.round));
    const currentRound = kataMatches.filter(m => m.round === maxRound);
    const unfinished   = currentRound.filter(m => m.status !== MATCH_STATUS.FINISHED);

    if (unfinished.length) {
      throw new Error(`Faltan ${unfinished.length} competidor(es) por puntuar en la ronda actual.`);
    }

    const n = currentRound.length;
    if (n <= 4) throw new Error('Ronda final: todos ya compitieron. Ver clasificación en el bracket.');

    const advancing = n <= 8 ? 4 : 8;
    const sorted    = [...currentRound].sort((a, b) => (b.score_a || 0) - (a.score_a || 0));
    const top       = sorted.slice(0, Math.min(advancing, n));

    const category = await Categories.getById(categoryId);
    const nextRound = maxRound + 1;
    const roundLabel = top.length <= 4 ? 'Final' : 'Semifinal';

    const newMatches = top.map((m, i) => _buildMatch({
      category,
      round:           nextRound,
      round_label:     roundLabel,
      position:        i + 1,
      competitor_a_id: m.competitor_a_id,
      competitor_b_id: null,
      bracket_type:    'kata_round',
    }));

    if (Auth.isDevMode()) {
      _devInsertMatches(newMatches);
      return _devByCat(categoryId);
    }

    const { data, error } = await supabase.from('matches').insert(newMatches).select();
    if (error) throw error;
    return data;
  }

  /* --------------------------------------------------------
     DETECTAR Y GUARDAR PODIO
     Calcula las posiciones 1°/2°/3° cuando todos los combates
     de la categoría están finalizados.
     @param {string} categoryId
     @returns {object|null} Podio o null si la categoría no terminó
  -------------------------------------------------------- */
  async function checkAndSavePodio(categoryId) {
    try {
      const category   = await Categories.getById(categoryId);
      const allMatches = Auth.isDevMode() ? _devByCat(categoryId) : await getByCategoryId(categoryId);
      const nonBye     = allMatches.filter(m => m.status !== MATCH_STATUS.BYE);
      const finished   = nonBye.filter(m => m.status === MATCH_STATUS.FINISHED);

      if (!nonBye.length || finished.length < nonBye.length) return null; // No terminó

      let positions = [];

      if (category.discipline === 'kata') {
        // Detectar si es kata individual (solo competitor_a) o kata por duelos (competitor_a + competitor_b)
        const isKataDuel = allMatches.some(m => m.competitor_b_id);

        if (!isKataDuel) {
          // Kata individual (WKF): todos compiten en una sola ronda, se ordenan por puntaje
          const kataMatches = allMatches.filter(m => m.status === MATCH_STATUS.FINISHED && Number.isFinite(Number(m.score_a)));
          const sorted = [...kataMatches].sort((a, b) => {
            if ((Number(b.score_a) || 0) !== (Number(a.score_a) || 0)) return (Number(b.score_a) || 0) - (Number(a.score_a) || 0);
            const ta = a.finished_at ? Date.parse(a.finished_at) : 0;
            const tb = b.finished_at ? Date.parse(b.finished_at) : 0;
            return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
          });
          positions = sorted.slice(0, 3).map((m, i) => ({ position: i + 1, registration_id: m.competitor_a_id }));
        } else {
          // Kata por duelos: eliminación (ganador final = 1°, perdedor = 2°, semis = 3°)
          const maxRound    = Math.max(...finished.map(m => m.round));
          const finalMatch  = finished.filter(m => m.round === maxRound);
          if (finalMatch.length === 1) {
            const f      = finalMatch[0];
            const loser  = f.winner_id === f.competitor_a_id ? f.competitor_b_id : f.competitor_a_id;
            positions    = [
              { position: 1, registration_id: f.winner_id },
              { position: 2, registration_id: loser },
            ];
            if (maxRound > 1) {
              const semis = finished.filter(m => m.round === maxRound - 1);
              semis.forEach(s => {
                const bronze = s.winner_id === s.competitor_a_id ? s.competitor_b_id : s.competitor_a_id;
                if (bronze) positions.push({ position: 3, registration_id: bronze });
              });
            }
          }
        }

      } else if (allMatches.some(m => m.bracket_type === 'round_robin')) {
        // Round-robin: clasificación por victorias
        const standings = {};
        for (const m of allMatches.filter(m => m.bracket_type === 'round_robin' && m.status === MATCH_STATUS.FINISHED)) {
          if (!standings[m.competitor_a_id]) standings[m.competitor_a_id] = 0;
          if (m.competitor_b_id && !standings[m.competitor_b_id]) standings[m.competitor_b_id] = 0;
          if (m.winner_id) {
            standings[m.winner_id]++;
            const loser = m.winner_id === m.competitor_a_id ? m.competitor_b_id : m.competitor_a_id;
            if (loser) standings[loser] = standings[loser] || 0;
          }
        }
        const sorted = Object.entries(standings).sort((a, b) => b[1] - a[1]);
        positions = sorted.slice(0, 3).map(([regId], i) => ({ position: i + 1, registration_id: regId }));

      } else {
        // Eliminación: final = última ronda con 1 combate
        const maxRound    = Math.max(...finished.map(m => m.round));
        const finalMatch  = finished.filter(m => m.round === maxRound);
        if (finalMatch.length === 1) {
          const f      = finalMatch[0];
          const loser  = f.winner_id === f.competitor_a_id ? f.competitor_b_id : f.competitor_a_id;
          positions    = [
            { position: 1, registration_id: f.winner_id },
            { position: 2, registration_id: loser },
          ];
          // Bronces: perdedores de las semifinales (ronda anterior a la final)
          if (maxRound > 1) {
            const semis = finished.filter(m => m.round === maxRound - 1);
            semis.forEach(s => {
              const bronze = s.winner_id === s.competitor_a_id ? s.competitor_b_id : s.competitor_a_id;
              if (bronze) positions.push({ position: 3, registration_id: bronze });
            });
          }
        }
      }

      if (!positions.length) return null;

      if (Auth.isDevMode()) {
        const podio = JSON.parse(localStorage.getItem('ot_dev_podio') || '{}');
        const regs  = JSON.parse(localStorage.getItem('ot_dev_registrations') || '[]');
        const comps = JSON.parse(localStorage.getItem('ot_dev_competitors')    || '[]');
        const enriched = positions.map(p => {
          const reg  = regs.find(r => r.id === p.registration_id);
          const comp = reg ? comps.find(c => c.id === reg.competitor_id) : null;
          return { ...p, full_name: comp?.full_name || '—', club: comp?.club || '—' };
        });
        podio[categoryId] = { positions: enriched, category_id: categoryId, calculated_at: new Date().toISOString() };
        localStorage.setItem('ot_dev_podio', JSON.stringify(podio));
        return podio[categoryId];
      }

      // Supabase: enrich positions with competitor names before returning
      const regIds = positions.map(p => p.registration_id).filter(Boolean);
      let enriched = positions;
      if (regIds.length) {
        const { data: regs } = await supabase
          .from('registrations')
          .select('id, competitors(id, full_name, club)')
          .in('id', regIds);
        if (regs?.length) {
          enriched = positions.map(p => {
            const reg  = regs.find(r => r.id === p.registration_id);
            const comp = reg?.competitors;
            return { ...p, full_name: comp?.full_name || '—', club: comp?.club || '—' };
          });
        }
      }
      return { positions: enriched, category_id: categoryId };
    } catch (e) {
      console.warn('[Bracket] checkAndSavePodio error:', e.message);
      return null;
    }
  }

  /* ---- Obtener podio guardado de una categoría ---- */
  async function getPodio(categoryId) {
    if (Auth.isDevMode()) {
      const podio = JSON.parse(localStorage.getItem('ot_dev_podio') || '{}');
      return podio[categoryId] || null;
    }
    return checkAndSavePodio(categoryId);
  }

  return {
    generate,
    regenerate,
    getByCategoryId,
    getByTournamentId,
    advanceWinner,
    advanceKataRound,
    checkAndSavePodio,
    getPodio,
    generateAll,
    // Expuesto para tests
    _buildRoundRobin,
    _buildSingleElimination,
    _buildRepechage,
    _resolveSystem,
  };
})();
