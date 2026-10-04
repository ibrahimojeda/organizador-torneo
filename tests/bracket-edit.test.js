const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
async function test() {
  const store = {
    ot_dev_registrations: JSON.stringify([{ id: 'r', competitor_id: 'c', category_id: 'a', tournament_id: 't', seed: 3 }]),
    ot_dev_matches: JSON.stringify([{ category_id: 'a', status: 'finished' }, { category_id: 'b' }, { category_id: 'other' }]),
    ot_dev_podio: JSON.stringify({ a: {}, b: {}, other: {} }),
  };
  let approved = false;
  const context = vm.createContext({
    Auth: { isDevMode: () => true },
    localStorage: { getItem: k => store[k], setItem: (k, v) => { store[k] = v; } },
    Categories: { getById: async id => ({ id, tournament_id: 't', name: id }) },
    confirm: () => approved, prompt: () => 'REHACER',
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/competitors.js'), 'utf8') + ';globalThis.api=Competitors;', context);
  const before = JSON.stringify(store);
  await assert.rejects(context.api.moveCategory('r', 'b'), /cancelada/);
  assert.equal(JSON.stringify(store), before);
  approved = true;
  await context.api.moveCategory('r', 'b');
  assert.equal(JSON.parse(store.ot_dev_registrations)[0].seed, 3);
  assert.equal(JSON.parse(store.ot_dev_registrations)[0].category_id, 'b');
  assert.deepEqual(JSON.parse(store.ot_dev_matches), [{ category_id: 'other' }]);
  assert.deepEqual(JSON.parse(store.ot_dev_podio), { other: {} });
  await context.api.unregister('r');
  assert.equal(JSON.parse(store.ot_dev_registrations).length, 0);
  console.log('OK: cancelar conserva datos; mover conserva inscripción; quitar y reiniciar solo afectan categorías seleccionadas.');
}
test().catch(e => { console.error(e); process.exitCode = 1; });