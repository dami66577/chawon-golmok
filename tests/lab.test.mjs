// 조합 발견·개량·의뢰·대회 시험
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const data = await import('../data.js');
data.loadCatalog(JSON.parse(readFileSync(new URL('../assets/ingredients/catalog.json', import.meta.url), 'utf8')));
const sim = await import('../sim.js');
const T = await import('../taste.js');

function runDay(s) {
  const ev = [];
  for (let n = 0; s.phase === 'open' && n < 200000; n++) ev.push(...sim.tick(s));
  return ev;
}

test('재료 600개 모두 분류와 맛 속성이 있다', () => {
  const ids = Object.keys(data.CATALOG);
  assert.equal(ids.length, 600);
  for (const id of ids) {
    const c = data.CATALOG[id];
    assert.ok(T.CLS_NAME[c.cls], `${id} 분류 ${c.cls}`);
    assert.ok(Array.isArray(c.tags) && c.tags.every((t) => T.TAGS.includes(t)), `${id} 속성`);
  }
});

test('같은 짝은 고른 순서와 상관없이 같은 결과, 같은 메뉴 id', () => {
  const pairs = [['fantasy_052', 'fantasy_065'], ['normal_042', 'xian_jade_carp'], ['heaven_074', 'demon_ash_rice'], ['normal_001', 'normal_002']];
  for (const [a, b] of pairs) {
    const x = T.evaluate(a, b), y = T.evaluate(b, a);
    assert.deepEqual(x, y);
    assert.equal(T.recipeIdOf(a, b), T.recipeIdOf(b, a));
    assert.equal(T.pairKey(a, b), T.pairKey(b, a));
  }
  assert.equal(T.evaluate('normal_001', 'normal_001'), null, '같은 재료 둘은 안 된다');
});

test('맛 판정에는 이유가 붙고, 궁합이 좋으면 점수가 높다', () => {
  const good = T.evaluate('normal_027', 'normal_075'); // 딸기 + 생크림 → 전설
  const spicyCream = T.evaluate('normal_084', 'normal_075'); // 고춧가루 + 생크림
  const fishSweet = T.evaluate('normal_091', 'normal_082'); // 연어 + 설탕
  assert.ok(good.special && good.q >= 80);
  assert.ok(spicyCream.reasons.some((r) => r.why.includes('매운맛을 고소함')), JSON.stringify(spicyCream.reasons));
  assert.ok(fishSweet.q < spicyCream.q, `연어+설탕 ${fishSweet.q} < 고춧가루+생크림 ${spicyCream.q}`);
  assert.ok(fishSweet.reasons.some((r) => r.v < 0));
});

test('전설의 조합 45개는 모두 서로 다른 짝이고, 기본 메뉴와 겹치지 않는다', () => {
  const keys = data.SPECIALS.map((sp) => T.pairKey(sp.a, sp.b));
  assert.ok(keys.length >= 40);
  assert.equal(new Set(keys).size, keys.length);
  for (const sp of data.SPECIALS) {
    assert.ok(data.CATALOG[sp.a] && data.CATALOG[sp.b], sp.name);
    assert.ok(sp.a < sp.b, `${sp.name}은 정규화된 순서로 적는다`);
    assert.equal(sim.baseMenuFor(sp.a, sp.b), null, sp.name);
  }
});

test('실험 → 연구 노트 → 메뉴판. 저장했다 불러도 결과와 메뉴가 그대로', () => {
  const s = sim.createGame(3);
  s.money = 2000;
  const before = s.money;
  const e = sim.experiment(s, 'fantasy_065', 'fantasy_052');
  assert.ok(e.ok && e.result.special);
  assert.ok(e.ev.some((x) => x.type === 'specialFound'));
  const bonus = e.ev.filter((x) => x.type === 'goalDone' || x.type === 'missionDone').reduce((a, x) => a + (x.reward.gold || 0), 0)
    + e.ev.filter((x) => x.type === 'achievement').reduce((a, x) => a + x.reward, 0);
  assert.ok(e.cost > 0 && s.money === before - e.cost + bonus, '실험비가 나간다 (보상 제외)');
  const add = sim.addRecipe(s, e.result.key);
  assert.ok(add.ok);
  assert.equal(add.onSale, false, '칸이 꽉 차 있으면 바로 올라가지 않는다');
  assert.equal(sim.toggleMenu(s, add.id).ok, false, '꽉 찬 메뉴판');
  sim.toggleMenu(s, 'herb_tea');
  assert.ok(sim.toggleMenu(s, add.id).ok);
  const loaded = sim.migrate(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(loaded.tried, s.tried);
  assert.ok(sim.menusOnSale(loaded).includes(add.id));
  assert.equal(data.MENUS[add.id].name, '불꽃 크림스튜');
  assert.equal(sim.experiment(loaded, 'fantasy_052', 'fantasy_065').known, true);
});

test('창고에 없는 재료는 실험 못 하고, 거래처 꾸러미를 사면 생긴다', () => {
  const s = sim.createGame(4);
  s.money = 5000;
  assert.equal(sim.experiment(s, 'normal_091', 'normal_033').ok, false);
  const packs = sim.allPacks();
  assert.ok(packs.length > 60);
  const all = new Set(packs.flatMap((p) => p.items));
  for (const id of Object.keys(data.CATALOG)) assert.ok(all.has(id) || data.CONFIG.starterPantry.includes(id), `${id}를 파는 곳이 있다`);
  const fish = packs.find((p) => p.id === 'normal_fish_1');
  assert.equal(sim.buyPack(s, 'normal_fish_2').ok, false, '앞 꾸러미부터');
  assert.equal(sim.buyPack(s, 'xian_orchard_1').ok, false, '안 열린 세계');
  assert.ok(sim.buyPack(s, fish.id).ok);
  assert.ok(fish.items.every((id) => s.pantry.includes(id)));
});

test('단서는 아이디어로 사고, 찾으면 노트에서 지워진다', () => {
  const s = sim.createGame(5);
  s.ideas = 10;
  const c = sim.buyClue(s);
  assert.ok(c.ok, c.reason);
  assert.ok(c.clue.text.length > 10);
  assert.equal(s.ideas, 10 - data.CONFIG.lab.clueIdeas);
  const sp = data.SPECIALS.find((x) => T.pairKey(x.a, x.b) === c.clue.key);
  s.money = 9999;
  sim.addToPantry(s, [sp.a, sp.b]);
  // 세계 재료면 문을 연다
  for (const id of [sp.a, sp.b]) { const w = data.CATALOG[id].category; if (w !== 'normal' && !s.unlocked.includes(w)) s.unlocked.push(w); }
  sim.experiment(s, sp.a, sp.b);
  assert.ok(!s.clues.some((x) => x.key === c.clue.key));
});

test('개량: 방향마다 맞는 재료가 따로 있고, 결과가 수치에 반영된다', () => {
  const s = sim.createGame(6);
  s.ideas = 50; s.money = 9999;
  assert.equal(sim.upgradeMenu(s, 'potato_fries', 'hearty', 'fantasy_052').ok, false, '고추로는 푸짐하게 못 한다');
  const before = sim.menuStats(s, 'potato_fries');
  const h = sim.upgradeMenu(s, 'potato_fries', 'hearty', 'normal_041');
  assert.ok(h.ok, h.reason);
  assert.equal(h.after.hearty, before.hearty + 1);
  assert.ok(h.after.price > before.price);
  const f = sim.upgradeMenu(s, 'potato_fries', 'flavor', 'normal_079'.replace('079', '079'));
  assert.equal(f.ok, false, '버터는 풍미 재료가 아니다(유제품)');
  sim.addToPantry(s, ['normal_083']); // 후추
  const f2 = sim.upgradeMenu(s, 'potato_fries', 'flavor', 'normal_083');
  assert.ok(f2.ok, f2.reason);
  assert.equal(f2.after.q - f2.before.q, f2.dq);
  assert.ok(sim.upgradeMenu(s, 'potato_fries', 'technique').ok);
  assert.equal(sim.upgradeMenu(s, 'potato_fries', 'technique').ok, false, '3번까지');
});

test('새 재료로 만든 요리도 속성으로 손님 취향에 걸린다', () => {
  const s = sim.createGame(7);
  s.money = 9999;
  sim.addToPantry(s, ['normal_084', 'normal_064']); // 고춧가루, 소고기
  sim.toggleMenu(s, 'herb_tea');
  const r = sim.develop(s, 'normal_084', 'normal_064');
  assert.ok(r.ok, r.reason);
  const miner = sim.satisfaction(s, 'miner', r.id).sat;
  const bard = sim.satisfaction(s, 'bard', r.id).sat;
  assert.ok(miner > bard + 15, `광부 ${miner} > 음유시인 ${bard} (매운 고기 구이)`);
});

test('세계 의뢰는 문이 열리면 생기고, 맞는 요리를 내면 끝나고 보상을 준다', () => {
  const s = sim.createGame(8);
  s.tables = 6; s.money = 9999;
  s.unlocked.push('fairy');
  sim.refreshRequests(s, []);
  assert.equal(s.requests.fairy1?.state, 'open');
  const req = data.REQUESTS.find((r) => r.id === 'fairy1');
  // 꽃향 디저트를 만든다: 장미 꽃꿀 + 꽃잎 딸기 (전설)
  sim.addToPantry(s, ['fairy_002', 'fairy_073']);
  s.menuSlots = 10;
  const d = sim.develop(s, 'fairy_002', 'fairy_073');
  assert.ok(d.ok, d.reason);
  assert.ok(sim.requestFits(s, req, d.id).ok);
  assert.equal(sim.requestFits(s, req, 'potato_fries').ok, false);
  s.onSale = [d.id];
  s.invited = { fairy: 20 }; // 요정 손님이 많이 오게
  const ideas = s.ideas;
  let done = null;
  for (let day = 0; day < 4 && !done; day++) { if (day) sim.openNextDay(s); done = runDay(s).find((e) => e.type === 'requestDone' && e.id === 'fairy1'); }
  assert.ok(done, '의뢰가 끝난다');
  assert.ok(s.ideas >= ideas + 2);
  assert.ok(s.pantry.includes('fairy_082'));
  assert.equal(s.requests.fairy2?.state, 'open', '다음 의뢰가 이어지고, 같은 요리로는 끝나지 않는다');
});

test('대회: 주제에 맞는 메뉴를 고르면 점수가 오르고, 고른 메뉴가 실제로 나간다', () => {
  const s = sim.createGame(9);
  const theme = sim.contestTheme(s);
  assert.ok(theme && theme.name);
  const scores = sim.availableMenus(s).map((id) => [id, sim.contestScore(s, theme, id).score]).sort((a, b) => b[1] - a[1]);
  const best = scores[0][0], worst = scores[scores.length - 1][0];
  assert.ok(scores[0][1] > scores[scores.length - 1][1]);
  assert.ok(sim.setContestPick(s, worst).ok);
  assert.equal(sim.contestEntry(s), worst);
  // 30일까지 굴려서 대회 결과 확인
  let ev = [];
  for (let d = 0; d < 30; d++) { if (d) sim.openNextDay(s); ev = runDay(s); if (d === 0) sim.setContestPick(s, worst); }
  const c = ev.find((e) => e.type === 'contest');
  assert.ok(c, '30일에 대회');
  assert.equal(c.entry, worst);
  assert.equal(c.chosen, true);
  assert.ok(c.notes.length >= 2, '심사평이 있다');
  void best;
});

test('직원은 특기를 하나씩 갖고, 특기가 일에 반영된다', () => {
  const s = sim.createGame(10);
  for (const x of [...s.cooks, ...s.servers]) assert.ok(data.TRAITS[x.role][x.trait], x.trait);
  for (const c of s.candidates) assert.ok(data.TRAITS[c.role][c.trait]);
  s.money = 5000;
  sim.addToPantry(s, ['normal_091', 'normal_033']);
  const plain = sim.labCost(s, 'normal_091', 'normal_033');
  s.cooks[0].trait = 'research';
  assert.ok(sim.labCost(s, 'normal_091', 'normal_033') < plain);
});

test('0.9 저장(옛 개발 메뉴·끈 메뉴·고정 탁자)을 1.0으로 옮겨도 이어진다', () => {
  const s = sim.createGame(12);
  for (let i = 0; i < 800; i++) sim.tick(s);
  const old = JSON.parse(JSON.stringify(s));
  // 0.9 모양으로 되돌리기
  old.v = 2;
  for (const k of ['pantry', 'packs', 'tried', 'clues', 'upgrades', 'onSale', 'menuSlots', 'bonds', 'perks', 'requests', 'decorUnlocked',
    'invited', 'contestTheme', 'contestPick', 'themesSeen', 'zone', 'tablePos', 'equip', 'annexWorld']) delete old[k];
  old.tables = 6;
  old.decor = { '10,3': 'crystal_pot', '0,9': 'herb_pot', '10,9': 'flower_pot' };
  old.offMenus = ['herb_tea'];
  old.recipes = { r3_77: { custom: true, dish: 'b12', name: '옛날 메뉴', world: 'fantasy', ingredients: ['fantasy_062', 'normal_041'], price: 30, taste: 4, cookMin: 10, eatMin: 20, color: '#ccc', madeDay: 3 } };
  old.menuExp = { r3_77: 12 };
  old.totals.sold = { ...old.totals.sold, r3_77: 12 };
  old.seats = old.seats.slice(0, 4);
  old.guests = []; old.queue = []; old.ready = [];
  const m = sim.migrate(old);
  assert.equal(m.v, data.CONFIG.saveVersion);
  assert.equal(m.zone, 1);
  assert.equal(m.tables, 6);
  const nid = T.recipeIdOf('fantasy_062', 'normal_041');
  assert.ok(m.recipes[nid], '옛 개발 메뉴가 새 id로');
  assert.equal(m.menuExp[nid], 12, '판매 기록이 이어진다');
  assert.ok(m.tried[T.pairKey('fantasy_062', 'normal_041')]);
  assert.ok(!sim.menusOnSale(m).includes('herb_tea'), '꺼 둔 메뉴는 계속 꺼져 있다');
  assert.ok(sim.menusOnSale(m).includes(nid));
  assert.ok(m.pantry.includes('fantasy_062'));
  assert.ok(m.cooks.every((c) => data.TRAITS.cook[c.trait]));
  sim.openNextDay(m);
  runDay(m);
  assert.equal(m.phase, 'closed');
});

test('메뉴를 연구한 가게가 기본 메뉴만 파는 가게보다 별과 평판이 확실히 높다', () => {
  const play = (research) => {
    const s = sim.createGame(77);
    const stars = [];
    for (let d = 1; d <= 12; d++) {
      if (d > 1) sim.openNextDay(s);
      const c = s.candidates.find((x) => x.role === 'cook');
      if (c && s.cooks.length < 3 && s.money > c.fee + 200) sim.hire(s, c.id);
      let p; while ((p = sim.tablePrice(s)) != null && s.money > p + 300 && sim.buyTable(s).ok) ;
      if (research && d <= 4) {
        // 날마다 시작 재료로 몇 번 실험하고, 맛 70 넘는 걸 올린다
        const pool = sim.developable(s);
        for (let k = 0; k < 6; k++) { const a = pool[(d * 7 + k * 5) % pool.length], b = pool[(d * 3 + k * 11 + 1) % pool.length]; if (a !== b) sim.experiment(s, a, b); }
        for (const [key, t] of Object.entries(s.tried)) if (t.q >= 70) sim.addRecipe(s, key);
        s.onSale = sim.availableMenus(s).sort((x, y) => sim.menuStats(s, y).q - sim.menuStats(s, x).q).slice(0, sim.menuSlots(s));
      }
      for (const e of runDay(s)) if (e.type === 'review' && e.rating) stars.push(e.rating);
    }
    return { avg: stars.reduce((a, b) => a + b, 0) / stars.length, rep: s.rep };
  };
  const basic = play(false), lab = play(true);
  assert.ok(lab.avg > basic.avg + 0.4, `평균 별 연구 ${lab.avg.toFixed(2)} vs 기본 ${basic.avg.toFixed(2)}`);
  assert.ok(lab.rep > basic.rep * 1.3, `평판 연구 ${Math.round(lab.rep)} vs 기본 ${Math.round(basic.rep)}`);
});

test('0.9에서 개발 메뉴를 조리·운반하던 중에 저장한 판도 1.0에서 멈추지 않고 이어진다', () => {
  // 0.9 코드로 실제로 만든 저장: 개발 메뉴 r1_3이 조리 중, 운반 중, 손님 주문에 남아 있다
  const raw = JSON.parse(readFileSync(new URL('./fixtures/save-0.9-cooking.json', import.meta.url), 'utf8'));
  assert.equal(raw.v, 2);
  assert.ok(raw.cooks.some((c) => c.order?.menu === 'r1_3'));
  assert.ok(raw.servers.some((v) => v.carry?.menu === 'r1_3'));
  const s = sim.migrate(raw);
  const nid = T.recipeIdOf('fantasy_062', 'normal_001');
  const refs = [...s.queue, ...s.ready, ...s.cooks.map((c) => c.order), ...s.servers.map((v) => v.carry)].filter(Boolean).map((o) => o.menu)
    .concat(s.guests.map((g) => g.menu).filter(Boolean));
  assert.ok(refs.length >= 3);
  for (const id of refs) assert.ok(data.MENUS[id], `없는 메뉴 ${id}`);
  assert.ok(refs.includes(nid));
  const ev = runDay(s);
  assert.equal(s.phase, 'closed');
  assert.ok(ev.some((e) => e.type === 'review' && e.menu === nid && e.rating > 0), '조리 중이던 개발 메뉴가 손님에게 나간다');
});

test('없는 메뉴를 가리키는 주문이 저장에 있어도 정리하고 이어진다', () => {
  const s = sim.createGame(14);
  for (let i = 0; i < 600; i++) sim.tick(s);
  const raw = JSON.parse(JSON.stringify(s));
  const g = raw.guests.find((x) => x.state === 'waiting' || x.state === 'eating');
  if (g) g.menu = 'ghost_menu';
  raw.queue.push({ id: 9999, guest: g?.id ?? -1, menu: 'ghost_menu' });
  raw.cooks[0].order = { id: 9998, guest: -1, menu: 'ghost_menu' }; raw.cooks[0].state = 'cooking';
  const m = sim.migrate(raw);
  runDay(m);
  assert.equal(m.phase, 'closed');
});

test('푸짐하게 개량한 메뉴는 실제로 더 오래 먹는다', () => {
  const s = sim.createGame(15);
  s.ideas = 20; s.money = 5000;
  const before = sim.menuStats(s, 'griffin_omelet').eatMin;
  assert.ok(sim.upgradeMenu(s, 'griffin_omelet', 'hearty', 'normal_041').ok);
  const after = sim.menuStats(s, 'griffin_omelet').eatMin;
  assert.ok(after > before);
  s.onSale = ['griffin_omelet'];
  let seen = null;
  for (let i = 0; i < 20000 && s.phase === 'open' && seen == null; i++) {
    const waiting = new Set(s.guests.filter((g) => g.state === 'waiting').map((g) => g.id));
    sim.tick(s);
    const g = s.guests.find((x) => x.state === 'eating' && waiting.has(x.id));
    if (g) seen = g.timer;
  }
  assert.ok(seen != null, '누군가 먹기 시작한다');
  assert.ok(Math.abs(seen - after) < 1e-6, `식사 타이머 ${seen} = 개량된 시간 ${after} (개량 전 ${before})`);
});

test('걷는 손님 앞길에 화분을 옮기면 손님은 돌아가고, 화분 칸을 지나가지 않는다', () => {
  const s = sim.createGame(16);
  s.money = 9999;
  const d = sim.buyDecor(s, 'herb_pot');
  assert.ok(d.ok);
  let moved = false, checked = 0;
  for (let i = 0; i < 20000 && s.phase === 'open'; i++) {
    sim.tick(s);
    if (!moved) {
      const g = s.guests.find((x) => x.state === 'walkIn' && x.path.length >= 3);
      if (!g) continue;
      // 이 손님이 곧 밟을 칸 중 하나에 화분을 옮겨 본다
      for (const n of g.path.slice(1, -2)) {
        if (n.x % 1) continue;
        const r = sim.moveDecor(s, Object.keys(s.decor).find((k) => k !== sim.KITCHEN_DECOR), n.x, n.y);
        if (r.ok) { moved = true; break; }
      }
      continue;
    }
    for (const e of [...s.guests, ...s.servers]) {
      if (['ordering', 'waiting', 'eating'].includes(e.state)) continue;
      const c = sim.getMap().at(Math.round(e.x), Math.round(e.y));
      assert.ok(!'PT'.includes(c), `사람이 ${c} 칸(${Math.round(e.x)},${Math.round(e.y)})을 지나간다`);
      checked++;
    }
  }
  assert.ok(moved, '걷는 손님 앞길로 화분을 옮겼다');
  assert.ok(checked > 100);
  // 사람이 서 있는 칸에는 놓을 수 없다
  const t = sim.createGame(17);
  t.money = 9999;
  sim.buyDecor(t, 'herb_pot');
  for (let i = 0; i < 3000; i++) { sim.tick(t); if (t.guests.some((g) => g.state === 'walkIn')) break; }
  const g = t.guests.find((x) => x.state === 'walkIn');
  const spot = Object.keys(t.decor).find((k) => k !== sim.KITCHEN_DECOR);
  const r = sim.moveDecor(t, spot, Math.round(g.x), Math.round(g.y));
  assert.equal(r.ok, false);
});

test('요리 대회는 등급제: 우승하면 승급하고, 경쟁 점수는 날짜가 지나도 오르지 않으며, 최고 등급도 이길 수 있다', () => {
  const s = sim.createGame(18);
  const R = data.RIVALS;
  const at = (day, league) => { s.day = day; s.league = league; return Math.max(...R.map((r) => sim.rivalContestScore(s, r))); };
  // 같은 등급이면 30일째와 3000일째 경쟁 최고점 범위가 같다
  const early = [30, 60, 90, 120].map((d) => at(d, 2)), late = [2970, 3000, 3030, 3060].map((d) => at(d, 2));
  assert.ok(Math.max(...late) <= Math.max(...early) + 12 && Math.min(...late) >= Math.min(...early) - 12);
  // 가장 높은 등급의 경쟁 최고점 < 완벽히 키운 메뉴 점수
  const L = data.CONFIG.contest.leagues.length - 1;
  let rivalMax = 0;
  for (let d = 30; d <= 3000; d += 30) rivalMax = Math.max(rivalMax, at(d, L));
  // 완벽한 메뉴: 맛 100, 개량 3번, 레벨 5, 주제에 맞는 종류·맛·든든
  const best = Math.round(100 * 0.7 + 14 + 16 + 6 + 3 * 4 + 5 * 2);
  assert.ok(best > rivalMax, `최고 등급 경쟁 최고점 ${rivalMax} < 완벽한 메뉴 ${best}`);
  // 우승하면 승급
  const g = sim.createGame(19);
  g.money = 99999; g.ideas = 99;
  sim.toggleMenu(g, 'herb_tea');
  const d = sim.develop(g, 'fantasy_062', 'normal_042'); // 그리핀 알 오므라이스(전설)
  assert.ok(d.ok, d.reason);
  sim.upgradeMenu(g, d.id, 'technique');
  g.menuExp[d.id] = 999;
  let found = false;
  for (let day = 0; day < 30; day++) {
    if (day) sim.openNextDay(g);
    g.contestTheme = { month: 0, id: 'morning' }; g.contestPick = d.id;
    const c = runDay(g).find((e) => e.type === 'contest');
    if (c) { found = true; assert.equal(c.place, 1, JSON.stringify(c.list)); assert.equal(g.league, 1); assert.equal(c.promoted, data.CONFIG.contest.leagues[1].name); }
  }
  assert.ok(found);
});

test('세계 별관 테마를 고르고 바꿀 수 있고, 그 세계 손님만 별관에서 더 만족한다', () => {
  const s = sim.createGame(20);
  s.money = 99999;
  s.unlocked.push('xian', 'fairy');
  assert.equal(sim.setAnnexWorld(s, 'fairy').ok, false, '별관이 먼저');
  sim.expandShop(s); sim.expandShop(s);
  assert.equal(s.zone, 2);
  const before = s.money;
  assert.ok(sim.setAnnexWorld(s, 'xian').ok);
  assert.equal(s.money, before - sim.ANNEX_CHANGE_PRICE, '바꾸면 값이 든다');
  assert.equal(sim.setAnnexWorld(s, 'demon').ok, false, '안 열린 세계');
  const top = sim.getMap().annexTop;
  assert.equal(sim.annexBonus(s, { type: 'xian_folk', seat: { x: 1, y: top + 1 } }), 6);
  assert.equal(sim.annexBonus(s, { type: 'fairy_folk', seat: { x: 1, y: top + 1 } }), 0);
  assert.equal(sim.annexBonus(s, { type: 'xian_folk', seat: { x: 1, y: top - 2 } }), 0);
});
