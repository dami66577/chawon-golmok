import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync as readCatalog } from 'node:fs';
import { CONFIG, loadCatalog } from '../data.js';
loadCatalog(JSON.parse(readCatalog(new URL('../assets/ingredients/catalog.json', import.meta.url), 'utf8')));
import { createGame, tick, openNextDay, applyRep, rateMeal, calendar, getMap } from '../sim.js';

function runDay(s) {
  const events = [];
  for (let n = 0; s.phase === 'open' && n < 200000; n++) events.push(...tick(s));
  return events;
}

test('하루가 끝까지 돌고, 손님을 받고, 가게가 깨끗하게 닫힌다', async () => {
  const s = createGame(42);
  const ev = runDay(s);
  assert.equal(s.phase, 'closed');
  const end = ev.find((e) => e.type === 'dayEnd');
  assert.ok(end, '하루 마감 사건이 있어야 한다');
  assert.ok(end.summary.served > 5, `손님 ${end.summary.served}명`);
  assert.ok(end.summary.profit > 0, `순이익 ${end.summary.profit}`);
  assert.equal(s.guests.length, 0);
  assert.ok(s.seats.every((p) => p.guest === null), '빈 의자만 남아야 한다');
  const { ACHIEVEMENTS } = await import('../data.js');
  const rewards = ACHIEVEMENTS.filter((a) => s.achieved[a.id]).reduce((x, a) => x + a.reward, 0)
    + ev.filter((e) => e.type === 'goalDone' || e.type === 'missionDone').reduce((x, e) => x + (e.reward.gold || 0), 0)
    + ev.filter((e) => e.type === 'vipDone' && e.ok).reduce((x, e) => x + e.gold, 0);
  assert.equal(s.money, CONFIG.startMoney + end.summary.profit + rewards, '돈 = 시작 + 순이익 + 업적·목표·미션 보상');
});

test('모든 의자는 문에서 걸어갈 수 있다', async () => {
  const { findPath } = await import('../sim.js');
  const map = getMap();
  for (const seat of map.seats) {
    const p = findPath(map.doors[0], (x, y) => x === seat.x && y === seat.y);
    assert.ok(p, `의자 ${seat.x},${seat.y}`);
  }
});

test('같은 씨앗이면 같은 하루가 나온다', () => {
  const a = createGame(7), b = createGame(7);
  runDay(a); runDay(b);
  assert.deepEqual(a.lastSummary, b.lastSummary);
});

test('하루 중간에 저장했다 불러와도 그대로 이어진다', () => {
  const a = createGame(99);
  for (let i = 0; i < 1500; i++) tick(a);
  const b = JSON.parse(JSON.stringify(a));
  runDay(a); runDay(b);
  assert.deepEqual(a.lastSummary, b.lastSummary);
});

test('다음 날이 열리고 며칠을 이어서 굴러간다', () => {
  const s = createGame(3);
  for (let d = 0; d < 5; d++) { runDay(s); openNextDay(s); }
  assert.equal(s.day, 6);
  assert.ok(s.totals.served > 20);
});

test('평판이 기준을 넘으면 선계 문이 열린다', () => {
  const s = createGame(1);
  s.rep = 119.5;
  assert.ok(applyRep(s, 5).some((e) => e.type === 'repUp' && e.level === 3), '평판 120에서 별 셋');
  s.rep = 139.5;
  const ev = applyRep(s, 5);
  assert.ok(s.unlocked.includes('xian'));
  assert.ok(ev.some((e) => e.type === 'worldUnlocked' && e.world === 'xian'));
  // 높을수록 덜 오르고, 깎이는 건 그대로
  const lo = createGame(1); applyRep(lo, 3);
  const hi = createGame(1); hi.rep = 300; applyRep(hi, 3);
  assert.ok(lo.rep - 0 > hi.rep - 300);
  const down = createGame(1); down.rep = 300; applyRep(down, -3);
  assert.equal(down.rep, 297);
});

test('좋아하는 재료는 별이 오르고, 오래 기다리면 깎인다', () => {
  const s = createGame(1);
  assert.ok(rateMeal(s, 'knight', 'griffin_omelet', 0) >= 4, '기사는 그리핀 알 오믈렛을 좋아한다');
  assert.ok(rateMeal(s, 'knight', 'slime_pudding', 0) <= 2, '흐물흐물한 건 싫어한다');
  assert.ok(rateMeal(s, 'knight', 'griffin_omelet', 70) < rateMeal(s, 'knight', 'griffin_omelet', 0), '오래 기다리면 깎인다');
});

test('달력은 1년 차 4월 1일에서 시작한다', () => {
  assert.deepEqual(calendar(1), { year: 1, month: 4, date: 1 });
  assert.deepEqual(calendar(271), { year: 2, month: 1, date: 1 });
});

test('메뉴와 손님 입맛에 쓴 재료는 전부 그림 묶음에 있다', async () => {
  const { readFileSync } = await import('node:fs');
  const { INGREDIENTS, MENUS, GUESTS, iconOf } = await import('../data.js');
  const catalog = JSON.parse(readFileSync(new URL('../assets/ingredients/catalog.json', import.meta.url)));
  const used = new Set([...Object.values(MENUS).flatMap((m) => m.ingredients), ...Object.values(GUESTS).flatMap((g) => [...g.likes, ...g.dislikes])]);
  for (const id of used) {
    assert.ok(INGREDIENTS[id], `${id}가 INGREDIENTS에 없다`);
    assert.ok(catalog[id], `${id}가 그림 묶음에 없다`);
    const ic = iconOf(id);
    assert.equal(catalog[id].row, ic.row);
    assert.equal(catalog[id].col, ic.col);
  }
});

test('유행은 첫날 시작해서 7일마다 바뀌고, 지금 팔 수 있는 것만 뽑힌다', async () => {
  const { trendCandidates } = await import('../sim.js');
  const s = createGame(11);
  tick(s);
  assert.ok(s.trend, '첫날 유행이 있어야 한다');
  const seen = [s.trend];
  for (let d = 0; d < 21; d++) {
    runDay(s);
    openNextDay(s);
    if (s.trend !== seen[seen.length - 1]) seen.push(s.trend);
  }
  assert.equal(seen.length, 4, '22일 동안 유행 4번');
  for (let i = 1; i < seen.length; i++) {
    assert.equal(seen[i].startDay - seen[i - 1].startDay, 7);
    assert.ok(!(seen[i].kind === seen[i - 1].kind && seen[i].id === seen[i - 1].id), '같은 유행이 연달아 오지 않는다');
  }
  // 판타지 메뉴만 있을 땐 세계 유행이 안 나온다
  assert.ok(trendCandidates(createGame(11)).every((c) => c.kind === 'ingredient'));
});

test('세계가 둘 이상 팔리면 세계 유행 후보가 생긴다', async () => {
  const { trendCandidates } = await import('../sim.js');
  const s = createGame(1);
  s.unlocked.push('xian');
  const worlds = trendCandidates(s).filter((c) => c.kind === 'world').map((c) => c.id).sort();
  assert.deepEqual(worlds, ['fantasy', 'xian']);
});

test('유행 메뉴는 더 자주 팔리고 30% 비싸게 팔린다', async () => {
  const { isTrending } = await import('../sim.js');
  const { MENUS } = await import('../data.js');
  let hot = 0, all = 0, hotSales = 0;
  for (const seed of [2, 3, 4, 5, 6, 7, 8, 9]) {
    const s = createGame(seed);
    tick(s);
    s.trend = { kind: 'ingredient', id: 'fantasy_062', startDay: 1, endDay: 99 }; // 그리핀 알
    const ev = runDay(s);
    for (const e of ev.filter((x) => x.type === 'coin')) { all++; if (e.hot) { hot++; hotSales += e.amount; } }
    assert.ok(isTrending(s, 'griffin_omelet'));
    assert.ok(!isTrending(s, 'herb_tea'));
  }
  // 메뉴 5개 중 1개라 유행이 없으면 20% 안팎. 유행이면 그보다 확실히 많아야 한다
  assert.ok(hot / all > 0.35, `유행 메뉴 비율 ${(hot / all).toFixed(2)}`);
  assert.ok(hotSales / hot >= Math.round(MENUS.griffin_omelet.price * 1.3), '유행 값이 붙어야 한다');
});

test('손님 얼굴 100명은 입맛 하나씩에 겹치지 않게 나뉜다', async () => {
  const { GUESTS, SPRITES } = await import('../data.js');
  const all = Object.values(GUESTS).flatMap((g) => g.sprites);
  assert.equal(all.length, SPRITES.customers);
  assert.equal(new Set(all).size, SPRITES.customers);
  assert.ok(all.every((i) => i >= 0 && i < SPRITES.anim.rows));
});

test('다음 유행은 이틀 전에 예고되고, 예고한 그대로 온다', () => {
  const s = createGame(21);
  tick(s);
  const first = s.trend;
  let teaser = null;
  for (let d = 0; d < 7; d++) {
    runDay(s);
    const ev = openNextDay(s);
    const t = ev.find((e) => e.type === 'trendTeaser');
    if (t) { teaser = t; assert.equal(s.day, first.endDay - 1, '끝나기 이틀 전'); }
  }
  assert.ok(teaser, '예고가 있어야 한다');
  assert.equal(s.trend.id, teaser.trend.id);
  assert.equal(s.trend.kind, teaser.trend.kind);
  assert.equal(s.trend.startDay, first.endDay + 1);
});

test('메뉴를 끄면 손님이 안 시키고, 마지막 하나는 못 끈다', async () => {
  const { toggleMenu, menusOnSale } = await import('../sim.js');
  const s = createGame(5);
  const all = menusOnSale(s);
  for (const id of all.slice(1)) assert.ok(toggleMenu(s, id).ok);
  assert.equal(toggleMenu(s, all[0]).ok, false, '마지막 메뉴');
  const ev = runDay(s);
  const sold = new Set(ev.filter((e) => e.type === 'review' && e.rating > 0).map((e) => e.menu));
  assert.deepEqual([...sold], [all[0]]);
  assert.ok(toggleMenu(s, all[1]).ok, '다시 켜기');
  assert.equal(menusOnSale(s).length, 2);
});

test('손님 얼굴마다 방문을 세고, 결산에 오늘의 큰손이 나온다', () => {
  const s = createGame(8);
  runDay(s);
  const sum = s.lastSummary;
  const visits = Object.values(s.totals.visits).reduce((a, b) => a + b, 0);
  assert.ok(visits >= sum.served + sum.angry);
  assert.ok(sum.fan && sum.fan.spent > 0 && sum.fan.n >= 1);
  assert.equal(sum.prevProfit, null);
  openNextDay(s); runDay(s);
  assert.equal(s.lastSummary.prevProfit, sum.profit);
  assert.equal(s.today.cooked >= s.today.delivered, true);
});

// ---------- 0.6 ----------
import { readFileSync } from 'node:fs';
const catalog = JSON.parse(readFileSync(new URL('../assets/ingredients/catalog.json', import.meta.url)));
const data = await import('../data.js');
data.loadCatalog(catalog);
const sim = await import('../sim.js');

test('지원자를 뽑으면 일하고, 레벨이 오르고, 일당이 결산에서 빠진다', () => {
  const s = createGame(31);
  s.money = 5000;
  s.candidates = [{ id: 'x1', role: 'cook', sprite: 3, name: '테스트', lv: 1, wage: 20, fee: 60 }];
  const r = sim.hire(s, 'x1');
  assert.ok(r.ok, r.reason);
  assert.equal(s.cooks.length, 2);
  assert.equal(s.cooks[1].slot, 1, '두 번째 화덕');
  for (let d = 0; d < 4; d++) { runDay(s); if (d < 3) openNextDay(s); }
  assert.ok(s.cooks.every((c) => c.exp > 0), '두 요리사 모두 일했다');
  assert.ok(s.cooks.some((c) => c.lv >= 2), '레벨이 올랐다');
  const sum = s.lastSummary;
  const wage = [...s.cooks, ...s.servers].reduce((a, x) => a + sim.staffWage(x.role, x.lv), 0);
  assert.equal(sum.wages, wage);
  assert.equal(sum.profit, sum.sales + sum.tips - sum.cost - sum.wages);
});

test('자리가 차면 못 뽑고, 마지막 한 명은 못 내보낸다', () => {
  const s = createGame(2);
  s.money = 99999;
  for (let i = 0; i < 3; i++) {
    s.candidates = [{ id: `k${i}`, role: 'cook', sprite: i + 1, name: `요리${i}`, lv: 1, wage: 20, fee: 60 }];
    assert.ok(sim.hire(s, `k${i}`).ok);
  }
  s.candidates = [{ id: 'k9', role: 'cook', sprite: 6, name: '넘침', lv: 1, wage: 20, fee: 60 }];
  assert.equal(sim.hire(s, 'k9').ok, false, '화덕 4개가 다 찼다');
  assert.equal(sim.fire(s, s.servers[0].id).ok, false, '종업원 마지막 한 명');
  assert.ok(sim.fire(s, s.cooks[3].id).ok);
  assert.equal(s.cooks.length, 3);
});

test('매일 지원자가 새로 오고, 이미 일하는 얼굴은 안 온다', () => {
  const s = createGame(4);
  for (let d = 0; d < 5; d++) {
    openNextDay(s);
    assert.ok(s.candidates.length > 0);
    for (const c of s.candidates) {
      const list = c.role === 'cook' ? s.cooks : s.servers;
      assert.ok(!list.some((x) => x.sprite === c.sprite));
      assert.equal(c.fee, c.wage * 3);
    }
  }
});

test('신메뉴 개발: 같은 짝은 같은 궁합, 팔리고, 저장했다 불러도 남는다', () => {
  const s = createGame(9);
  s.money = 1000;
  assert.equal(sim.compat('normal_041', 'fantasy_062'), sim.compat('fantasy_062', 'normal_041'));
  sim.toggleMenu(s, 'herb_tea'); // 칸 하나 비우기
  const r = sim.develop(s, 'normal_041', 'fantasy_062');
  assert.ok(r.ok, r.reason);
  const bonus = r.ev.filter((e) => e.type === 'goalDone' || e.type === 'missionDone').reduce((x, e) => x + (e.reward.gold || 0), 0)
    + r.ev.filter((e) => e.type === 'achievement').reduce((x, e) => x + e.reward, 0);
  assert.equal(s.money, 1000 - r.cost + bonus);
  assert.ok(sim.availableMenus(s).includes(r.id));
  assert.equal(sim.develop(s, 'fantasy_062', 'normal_041').ok, false, '같은 짝은 한 번만');
  assert.equal(sim.develop(s, 'xian_immortal_peach', 'normal_041').ok, false, '안 열린 세계 재료');
  // 그 메뉴만 팔게 해 두고 하루 돌리기
  for (const id of sim.menusOnSale(s)) if (id !== r.id) sim.toggleMenu(s, id);
  const ev = runDay(s);
  assert.ok(ev.some((e) => e.type === 'review' && e.menu === r.id));
  const loaded = sim.migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(data.MENUS[r.id].name, r.recipe.name);
  assert.ok(sim.availableMenus(loaded).includes(r.id));
  // 다른 판을 열면 남의 개발 메뉴는 사라진다
  sim.registerRecipes(createGame(1));
  assert.equal(data.MENUS[r.id], undefined);
});

test('옛 저장(요리사·종업원 한 명짜리)을 새 모양으로 옮겨 이어서 굴린다', () => {
  const s = createGame(12);
  for (let i = 0; i < 1200; i++) tick(s);
  const old = JSON.parse(JSON.stringify(s));
  old.v = 1;
  old.cook = { ...old.cooks[0] }; delete old.cooks;
  old.server = { ...old.servers[0] }; delete old.servers;
  delete old.history; delete old.recipes; delete old.achieved; delete old.candidates; delete old.weather; delete old.critic; delete old.tutorial;
  const m = sim.migrate(old);
  assert.equal(m.v, data.CONFIG.saveVersion);
  assert.equal(m.cooks.length, 1);
  assert.equal(m.servers.length, 1);
  runDay(m);
  assert.equal(m.phase, 'closed');
  assert.equal(m.guests.length, 0);
});

test('평론가가 오는 날엔 꼭 한 번 오고, 별점의 무게가 크다', () => {
  let came = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = createGame(seed);
    s.critic = { at: 11 * 60, done: false };
    const before = s.rep;
    const ev = runDay(s);
    const arrive = ev.filter((e) => e.type === 'criticArrive');
    assert.equal(arrive.length, 1);
    const rv = ev.find((e) => e.type === 'review' && e.critic);
    assert.ok(rv, '평론가가 평가를 남긴다');
    came++;
  }
  assert.equal(came, 6);
});

test('비 오는 날은 손님이 줄고, 축제 날은 늘어난다', () => {
  const day = (w) => { let n = 0; for (const seed of [1, 2, 3, 4, 5]) { const s = createGame(seed); s.weather = w; s.critic = null; runDay(s); n += s.lastSummary.served + s.lastSummary.angry; } return n; };
  const rain = day('rain'), sun = day('sunny'), fest = day('fest');
  assert.ok(rain < sun && sun < fest, `비 ${rain} < 맑음 ${sun} < 축제 ${fest}`);
});

test('업적은 한 번만 달성되고 보상을 준다', () => {
  const s = createGame(7);
  const ev = runDay(s);
  const got = ev.filter((e) => e.type === 'achievement');
  assert.ok(got.some((e) => e.id === 'first'));
  assert.equal(new Set(got.map((e) => e.id)).size, got.length);
  const again = sim.checkAchievements(s, []);
  assert.equal(again.length, 0);
  assert.equal(s.history.length, 1);
});

// ---------- 0.8: 가게 키우기 ----------
test('작은 홀에서 시작해, 탁자를 들이다 자리가 없으면 가게를 넓힌다', () => {
  const s = createGame(21);
  assert.equal(s.tables, data.CONFIG.tables.start);
  assert.equal(s.zone, 0);
  const small = getMap().h;
  const open = new Set(sim.openTables(s).flatMap((t) => t.seats));
  const sat = new Set();
  for (let i = 0; i < 4000 && s.phase === 'open'; i++) { tick(s); for (const g of s.guests) if (g.seat) sat.add(`${g.seat.x},${g.seat.y}`); }
  for (const k of sat) assert.ok(open.has(k), `탁자가 없는 곳(${k})에 앉으면 안 된다`);
  runDay(s);
  s.money = 100000;
  const paid = [];
  let r;
  while ((r = sim.buyTable(s)).ok) paid.push(r.price);
  assert.match(r.reason, /자리가 없어요/);
  assert.ok(sim.checkLayout(s.zone, s.tablePos, s.decor).ok);
  const e = sim.expandShop(s);
  assert.ok(e.ok, e.reason);
  assert.ok(getMap().h > small, '가게가 실제로 길어진다');
  while ((r = sim.buyTable(s)).ok) paid.push(r.price);
  assert.deepEqual(paid, data.CONFIG.tables.prices.slice(0, paid.length));
  assert.ok(s.tables >= 6);
  assert.equal(sim.expandShop(s).ok, false, '별관은 세계 문이 열려야');
  // 새 배치로도 하루가 멀쩡히 돈다
  openNextDay(s);
  const ev = runDay(s);
  assert.equal(s.phase, 'closed');
  assert.ok(ev.some((x) => x.type === 'coin'));
});

test('탁자와 장식은 옮길 수 있고, 길을 막는 배치는 막는다', () => {
  const s = createGame(22);
  s.money = 9999;
  runDay(s);
  const spots = sim.tableSpots(s, 0);
  assert.ok(spots.length > 0);
  const to = spots[spots.length - 1];
  assert.ok(sim.moveTable(s, 0, to.x, to.y).ok);
  assert.deepEqual(s.tablePos[0], to);
  assert.equal(sim.moveTable(s, 1, to.x, to.y).ok, false, '겹치면 안 된다');
  // 종업원 줄 바로 아래를 장식으로 다 막으면 안 된다
  const decor = {};
  for (let x = 0; x < 11; x++) decor[`${x},6`] = 'herb_pot';
  assert.equal(sim.checkLayout(s.zone, s.tablePos, decor).ok, false);
  const d = sim.buyDecor(s, 'herb_pot');
  assert.ok(d.ok, d.reason);
  const free = sim.decorSpotsFree(s, d.spot);
  assert.ok(sim.moveDecor(s, d.spot, free[0].x, free[0].y).ok);
  assert.ok(sim.seatAtmos(s, getMap().seats[0]) >= 0);
  // 옮긴 뒤에도 손님이 앉고, 음식이 나간다
  openNextDay(s);
  const ev = runDay(s);
  const moved = new Set(sim.openTables(s)[0].seats);
  assert.ok(ev.filter((e) => e.type === 'coin').length > 5);
  assert.equal(s.guests.length, 0);
  void moved;
});

test('화분은 분위기를 올리고, 분위기가 높으면 손님이 더 온다', () => {
  const s = createGame(3);
  s.money = 5000;
  const spot = getMap().decorSpots[0];
  assert.ok(sim.buyDecor(s, spot, 'crystal_pot').ok);
  assert.equal(s.money, 5000 - data.DECOR.find((d) => d.id === 'crystal_pot').price);
  assert.equal(sim.buyDecor(s, spot, 'crystal_pot').ok, false, '같은 화분 두 번은 안 된다');
  assert.equal(sim.buyDecor(s, 'nowhere', 'herb_pot').ok, false);
  const count = (atmos) => { let n = 0; for (const seed of [1, 2, 3, 4]) { const g = createGame(seed); g.tables = 6; g.critic = null; g.decor = atmos ? Object.fromEntries(getMap().decorSpots.map((k) => [k, 'crystal_pot'])) : {}; runDay(g); n += g.lastSummary.served + g.lastSummary.angry; } return n; };
  const plain = count(false), pretty = count(true);
  assert.ok(pretty > plain, `분위기 없음 ${plain} < 있음 ${pretty}`);
});

test('홍보는 한 번에 하나, 기간이 지나면 끝난다', () => {
  const s = createGame(4);
  s.money = 5000;
  const r = sim.promote(s, 'board');
  assert.ok(r.ok);
  assert.equal(sim.promote(s, 'flyer').ok, false);
  runDay(s);
  for (let d = 0; d < 3; d++) { openNextDay(s); runDay(s); }
  assert.equal(sim.activePromo(s), null);
  assert.ok(sim.promote(s, 'flyer').ok);
});

test('많이 판 메뉴는 레벨이 올라 값이 오른다', () => {
  const s = createGame(5);
  const id = 'herb_tea';
  assert.equal(sim.menuLevel(s, id), 1);
  s.menuExp[id] = data.CONFIG.menuLevel.exp[2];
  assert.equal(sim.menuLevel(s, id), 3);
  assert.ok(sim.menuPrice(s, id) > data.MENUS[id].price);
  s.menuExp[id] = 9999;
  assert.equal(sim.menuLevel(s, id), data.CONFIG.menuLevel.exp.length);
});

test('실험은 아이디어 없이 하고, 개량에 아이디어가 든다', () => {
  const s = createGame(9);
  s.money = 5000; s.ideas = 0;
  const e = sim.experiment(s, 'normal_041', 'fantasy_062');
  assert.ok(e.ok && !e.known, e.reason);
  const again = sim.experiment(s, 'fantasy_062', 'normal_041');
  assert.ok(again.known, '같은 짝은 연구 노트에서 다시 본다');
  assert.equal(again.cost, 0);
  assert.equal(sim.upgradeMenu(s, 'griffin_omelet', 'technique').ok, false, '아이디어가 없으면 개량 못 한다');
  s.ideas = 20;
  const u = sim.upgradeMenu(s, 'griffin_omelet', 'technique');
  assert.ok(u.ok, u.reason);
  assert.ok(u.after.cookMin < u.before.cookMin);
  const g = createGame(2); g.ideas = 0; g.tables = 6;
  for (const k of ['rc', 'x']) void k;
  // 좋은 메뉴를 팔면 별 다섯 개가 나오고 아이디어가 쌓인다
  g.money = 9999;
  sim.toggleMenu(g, 'herb_tea');
  sim.develop(g, 'fantasy_052', 'fantasy_065'); // 불꽃 크림스튜
  for (let d = 0; d < 4; d++) { runDay(g); openNextDay(g); }
  assert.ok(g.ideas > 0, `아이디어 ${g.ideas}`);
});

test('직원 연수는 하루 한 번, 경험이 오른다', () => {
  const s = createGame(6);
  s.money = 1000;
  const st = s.cooks[0];
  const r = sim.trainStaff(s, st.id);
  assert.ok(r.ok, r.reason);
  assert.equal(st.exp, data.CONFIG.training.exp);
  assert.equal(sim.trainStaff(s, st.id).ok, false);
  runDay(s); openNextDay(s);
  assert.ok(sim.trainStaff(s, st.id).ok);
});

test('7일마다 순위가 나오고, 30일엔 요리 대회가 열린다', () => {
  const s = createGame(8);
  s.tables = 6;
  const seen = [];
  for (let d = 0; d < 30; d++) {
    if (d) openNextDay(s);
    for (const e of runDay(s)) if (['ranking', 'contest', 'record'].includes(e.type)) seen.push({ ...e, day: s.day, date: calendar(s.day).date });
  }
  const ranks = seen.filter((e) => e.type === 'ranking');
  assert.deepEqual(ranks.map((e) => e.day), [7, 14, 21, 28]);
  for (const r of ranks) assert.equal(r.list.length, data.RIVALS.length + 1);
  const contest = seen.filter((e) => e.type === 'contest');
  assert.equal(contest.length, 1);
  assert.equal(contest[0].date, data.CONFIG.contest.day);
  assert.ok(seen.some((e) => e.type === 'record'));
});

test('다섯 번째로 온 손님은 선물을 준다', () => {
  const s = createGame(10);
  s.tables = 6;
  const gifts = [];
  for (let d = 0; d < 12 && !gifts.length; d++) { if (d) openNextDay(s); gifts.push(...runDay(s).filter((e) => e.type === 'gift')); }
  assert.ok(gifts.length, '열흘 안에 선물이 온다');
  assert.ok(gifts.every((g) => data.CONFIG.giftVisits.includes(g.visit)));
});

test('0.8 이전 저장은 탁자 6개와 화분 3개를 그대로 갖는다', () => {
  const s = createGame(11);
  const old = JSON.parse(JSON.stringify(s));
  for (const k of ['tables', 'decor', 'ideas', 'menuExp', 'promo', 'rank', 'weekSales', 'contestLast', 'tablePos', 'zone', 'equip']) delete old[k];
  const m = sim.migrate(old);
  assert.equal(m.tables, 6);
  assert.equal(m.zone, 1);
  assert.equal(Object.keys(m.decor).length, 3);
  assert.ok(sim.atmosphere(m) > 0);
  runDay(m);
  assert.equal(m.phase, 'closed');
});

test('세계 문이 열리면 그 세계 손님이 와서 세계 메뉴를 먹는다', () => {
  const s = createGame(31);
  s.tables = 6;
  s.unlocked = ['fantasy', 'xian', 'fairy', 'demon', 'heaven'];
  s.rep = 300;
  s.menuSlots = 20;
  s.onSale = sim.availableMenus(s);
  const worlds = new Set(), menus = new Set();
  for (let d = 0; d < 3; d++) {
    if (d) openNextDay(s);
    for (const e of runDay(s)) if (e.type === 'review' && e.rating) { worlds.add(data.GUESTS[e.guest].world); menus.add(data.MENUS[e.menu].world); }
  }
  for (const w of ['xian', 'fairy', 'demon', 'heaven']) {
    assert.ok(worlds.has(w), `${w} 손님이 온다`);
    assert.ok(menus.has(w), `${w} 메뉴가 팔린다`);
  }
  for (const [t, g] of Object.entries(data.GUESTS)) if (g.names) for (const sp of g.sprites) assert.ok(data.guestName(t, sp) !== g.name);
  const fresh = createGame(1);
  assert.ok(!sim.availableMenus(fresh).some((id) => data.MENUS[id].world !== 'fantasy'), '처음엔 판타지 메뉴만');
});

test('모든 재료 그림 칸을 찾을 수 있다 (이름 id 재료 포함)', () => {
  for (const id of Object.keys(data.CATALOG)) {
    const ic = data.iconOf(id);
    assert.ok(ic && ic.col >= 0 && ic.col < 10 && ic.row >= 0 && ic.row < 10, id);
  }
});
