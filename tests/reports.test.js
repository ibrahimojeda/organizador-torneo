const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
async function test() {
  const windows = [];
  const cats = [{ id: 'a', name: 'Kata <Mini>', discipline: 'kata', tatami: 2, registrations: [{ count: 2 }] }, { id: 'b', discipline: 'kumite', tatami: 1 }];
  const context = vm.createContext({
    window: { open: () => {
      const w = { html: '', prints: 0, document: { readyState: 'complete', open() { w.html = ''; }, write(s) { w.html += s; }, close() {} }, focus() {}, print() { w.prints++; }, close() {} };
      windows.push(w); return w;
    } },
    Categories: { listByTournament: async () => cats, buildLabel: () => 'Kumite Mini' },
    Tournament: { getById: async () => ({ name: 'Torneo <Prueba>' }) },
    Competitors: { countRegistered: async () => 2 },
    Bracket: { renderPrintableBracket: async id => 'LLAVE-' + id },
    Matches: { listScheduled: async () => [{ scheduled_time: '2026-10-03T10:00:00Z', tatami: 2, category: cats[0], status: 'pending' }], listByTournament: async () => [] },
    MATCH_STATUS_LABELS: { pending: 'Pendiente' },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/reports.js'), 'utf8') + ';globalThis.api=Reports;', context);
  const pending = context.api.printCategories('t');
  assert.equal(windows.length, 1, 'La ventana se abre antes de las consultas');
  await pending;
  assert.match(windows[0].html, /2 atletas únicos/);
  assert.match(windows[0].html, /Kata &lt;Mini&gt;/);
  await context.api.printBrackets('t');
  assert.match(windows[1].html, /LLAVE-a/);
  assert.match(windows[1].html, /LLAVE-b/);
  await context.api.printSchedule('t');
  assert.match(windows[2].html, /Horarios programados/);
  context.Matches.listScheduled = async () => [];
  await context.api.printSchedule('t');
  assert.match(windows[3].html, /ESTIMADOS/);
  windows.forEach(w => assert.equal(w.prints, 1));
  context.window.open = () => null;
  await assert.rejects(context.api.printCategories('t'), /ventanas emergentes/);
  console.log('OK: categorías, todas las llaves, cronograma programado/estimado y bloqueo de ventanas.');
}
test().catch(e => { console.error(e); process.exitCode = 1; });