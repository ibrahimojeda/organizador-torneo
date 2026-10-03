const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

async function test() {
  const store = {
    ot_dev_categories: JSON.stringify([{ id: 'old', tournament_id: 't', age_group_id: 'senior', is_manual: true }]),
  };
  const context = vm.createContext({
    Auth: { isDevMode: () => true },
    localStorage: { getItem: k => store[k], setItem: (k, v) => { store[k] = v; } },
    Tournament: { getById: async () => ({ date_start: '2026-10-03' }) },
    Competitors: { listByTournament: async () => [
      { id: 'c', registration_id: 'r', category_id: 'old', full_name: 'Atleta', dob: '1980-01-01' },
    ] },
    getAgeGroup: () => ({ id: 'veteranos' }),
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/categories.js'), 'utf8') + ';globalThis.api=Categories;', context);
  const before = JSON.stringify(store);
  const counting = vm.createContext({ Auth: { isDevMode: () => true }, localStorage: context.localStorage });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/competitors.js'), 'utf8') + ';globalThis.api=Competitors;', counting);
  assert.equal(counting.api.countUnique([{ id: 'a' }, { id: 'a' }, { id: 'b' }]), 2);
  assert.equal(counting.api.countUnique([{ id: 'r1', competitor_id: 'a' }, { id: 'r2', competitor_id: 'a' }]), 1);
  store.ot_dev_registrations = JSON.stringify([
    { competitor_id: 'a', tournament_id: 't' },
    { competitor_id: 'a', tournament_id: 't' },
    { competitor_id: 'b', tournament_id: 'other' },
  ]);
  assert.equal(await counting.api.countRegistered('t'), 1);
  assert.equal(await counting.api.countRegistered(), 2);
  delete store.ot_dev_registrations;
  const pages = [];
  const remote = vm.createContext({
    Auth: { isDevMode: () => false },
    supabase: { from: () => {
      const q = {
        select: () => q, order: () => q, eq: () => q,
        range: (start) => { pages.push(start); return Promise.resolve({ data: start === 0
          ? Array.from({ length: 1000 }, (_, i) => ({ competitor_id: 'c' + i }))
          : [{ competitor_id: 'c0' }, { competitor_id: 'last' }], error: null }); },
      };
      return q;
    } },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/competitors.js'), 'utf8') + ';globalThis.api=Competitors;', remote);
  assert.equal(await remote.api.countRegistered('t'), 1001);
  assert.deepEqual(pages, [0, 1000], 'Los conteos incluyen más de 1000 inscripciones');
  const plan = await context.api.previewAgeUpdate('t');
  assert.equal(plan.length, 1);
  assert.equal(plan[0].moves[0].registration_id, 'r');
  assert.equal(plan[0].cat.is_manual, true);
  assert.equal(JSON.stringify(store), before, 'La vista previa no modifica datos');
  await assert.rejects(context.api.applyAgeUpdate('old', plan[0].moves, false), /Supabase/);

  for (const file of ['categories', 'competitors', 'dojos', 'superadmin-dojos']) {
    new vm.Script(fs.readFileSync(path.join(root, 'js', file + '.js'), 'utf8'));
  }
  for (const file of fs.readdirSync(path.join(root, 'views')).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root, 'views', file), 'utf8');
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/src\s*=/.test(match[1]) && match[2].trim()) new vm.Script(match[2], { filename: file });
    }
  }
  console.log('OK: vista previa sin cambios, IDs conservados y sintaxis válida.');
}
test().catch(error => { console.error(error); process.exitCode = 1; });