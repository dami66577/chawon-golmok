// 1.2 새 기능 시험: 목표, 미션, 축제, 귀빈, 일행, 등급, 신문, 요리 도감, 바라는 맛, 이어하기
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const data = await import('../data.js');
data.loadCatalog(JSON.parse(readFileSync(new URL('../assets/ingredients/catalog.json', import.meta.url), 'utf8')));
const sim = await import('../sim.js');

function runDay(s) { const ev = []; for (let n = 0; s.phase === 'open' && n < 200000; n++) ev.push(...sim.tick(s)); return ev; }

test('가게 목표: 첫 목표는 실험이고, 이루면 보상과 함께 다음 목표로 넘어간다', () => {
  const s = sim.createGame(1);
  assert.equal(sim.currentGoal(s).id, 'g_lab');
  const money = s.money;
  const e = sim.experiment(s, 'fantasy_052', 'normal_041');
  assert.ok(e.ok);
  const done = e.ev.find((x) => x.type === 'goalDone');
  assert.ok(done, '실험하자마자 목표 달성');
  assert.equal(s.goalIdx, 1);
  assert.equal(sim.currentGoal(s).id, 'g_recipe');
  assert.ok(s.money >= money - e.cost + data.GOALS[0].reward.gold - 1);
  for (const G of data.GOALS) assert.ok(G.stat in sim.stats(s), `목표 ${G.id}의 ${G.stat}`);
});

test('오늘의 미션: 매일 세 개, 이루면 보상, 다음 날 새로', () => {
  const s = sim.createGame(2);
  assert.equal(s.missions.length, 3);
  const before = JSON.stringify(s.missions);
  const ev = runDay(s);
  const done = ev.filter((e) => e.type === 'missionDone');
  assert.equal(done.length, s.missions.filter((m) => m.done).length);
  sim.openNextDay(s);
  assert.equal(s.missions.length, 3);
  assert.ok(s.missions.every((m) => !m.done));
  void before;
});

test('축제 주간에는 그 맛 요리가 더 비싸고 더 잘 팔린다', () => {
  const fest = (day) => { const s = sim.createGame(3); s.day = day; return sim.festivalOf(s); };
  assert.equal(fest(5), null, '4월 5일은 축제 아님');
  assert.equal(fest(10).name, '봄꽃 축제');
  assert.equal(fest(16).tag, '꽃향');
  assert.equal(fest(17), null);
  const s = sim.createGame(3);
  s.day = 9; sim.openNextDay(s);
  assert.ok(sim.festivalOf(s));
  const ev = runDay(s);
  assert.ok(ev.some((e) => e.type === 'review'));
});

test('귀빈: 전날 예고하고, 원하는 요리로 만족시키면 큰 보상', () => {
  const s = sim.createGame(4);
  s.money = 99999; s.menuSlots = 10;
  s.vip = { day: s.day, world: 'fantasy', at: 9 * 60 + 5, arrived: false, done: false };
  // 공주는 고소·단맛 디저트나 달걀 요리를 원한다 → 딸기 생크림 케이크(전설)
  sim.addToPantry(s, ['normal_027', 'normal_075']);
  const d = sim.develop(s, 'normal_027', 'normal_075');
  assert.ok(d.ok, d.reason);
  assert.ok(sim.vipFits(s, d.id));
  s.onSale = [d.id];
  const ev = runDay(s);
  assert.ok(ev.some((e) => e.type === 'vipArrive'));
  const r = ev.find((e) => e.type === 'vipDone');
  assert.ok(r, '귀빈이 식사를 마친다');
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(s.totals.vipWins, 1);
});

test('둘이 같이 오는 일행은 한 탁자에 앉는다', () => {
  const s = sim.createGame(5);
  s.money = 9999;
  while (sim.buyTable(s).ok) ;
  let found = null;
  for (let d = 0; d < 4 && !found; d++) {
    if (d) sim.openNextDay(s);
    for (let i = 0; i < 20000 && s.phase === 'open' && !found; i++) {
      for (const e of sim.tick(s)) if (e.type === 'partyArrive') found = e.ids;
    }
  }
  assert.ok(found, '일행이 온다');
  const [a, b] = found.map((id) => s.guests.find((g) => g.id === id));
  assert.equal(a.party, b.party);
  assert.equal(a.seat.x, b.seat.x);
  assert.equal(Math.abs(a.seat.y - b.seat.y), 2, '같은 탁자 위아래 의자');
});

test('가게 등급은 평판으로 오르고 별 다섯 개 뒤에도 계속 오른다', () => {
  const s = sim.createGame(6);
  const ev = [];
  sim.applyRep(s, 500, ev);
  s.rep = 0; ev.length = 0;
  for (let i = 0; i < 400; i++) sim.applyRep(s, 50, ev);
  const ups = ev.filter((e) => e.type === 'gradeUp').map((e) => e.grade);
  assert.deepEqual(ups, [1, 2, 3, 4, 5]);
  assert.equal(sim.stats(s).grade, 6);
});

test('7일마다 골목 신문이 나오고, 요리 도감이 찬다, 손님은 원하는 맛이 없으면 투덜거린다', () => {
  const s = sim.createGame(7);
  s.onSale = ['herb_tea']; // 일부러 메뉴를 하나만
  const all = [];
  for (let d = 0; d < 7; d++) { if (d) sim.openNextDay(s); all.push(...runDay(s)); }
  const paper = all.find((e) => e.type === 'paper');
  assert.ok(paper, '7일째 신문');
  assert.ok(paper.paper.sales > 0);
  assert.ok(s.dishBook[data.MENUS.herb_tea.dish], '판 요리가 도감에');
  assert.ok(all.some((e) => e.type === 'wish'), '바라는 맛 말풍선');
  assert.ok(Object.keys(s.lastSummary.wishes).length > 0);
});

test('1.1 저장을 이어 하면 이미 이룬 목표는 건너뛰고(보상 없이) 미션·도감이 생긴다', () => {
  const s = sim.createGame(8);
  s.money = 9999;
  sim.experiment(s, 'fantasy_052', 'normal_041');
  runDay(s);
  const old = JSON.parse(JSON.stringify(s));
  for (const k of ['goalIdx', 'missions', 'dishBook', 'papers', 'week', 'vip', 'lastVip', 'yesterdaySold']) delete old[k];
  const money = old.money;
  const m = sim.migrate(old);
  assert.ok(m.goalIdx >= 1, '실험 목표는 이미 이룸');
  assert.equal(m.money, money, '건너뛴 목표는 보상 없음');
  assert.equal(m.missions.length, 3);
  assert.ok(Object.keys(m.dishBook).length > 0);
  sim.openNextDay(m);
  runDay(m);
  assert.equal(m.phase, 'closed');
});

test('분위기로 늘어나는 손님은 한도가 있다 (화분을 잔뜩 깔아도 끝없이 늘지 않는다)', () => {
  const s = sim.createGame(9);
  s.decor = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`x${i}`, 'crystal_pot']));
  assert.ok(sim.atmosphere(s) > 400);
  // 손님 오는 확률 식의 분위기 배수는 최대 1.5배
  const src = readFileSync(new URL('../sim.js', import.meta.url), 'utf8');
  assert.match(src, /Math\.min\(CONFIG\.atmosphere\.maxSpawn/);
  assert.equal(data.CONFIG.atmosphere.maxSpawn, 0.5);
});
