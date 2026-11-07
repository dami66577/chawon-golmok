// 계산 퍼징: 아무렇게나 노는 플레이어를 흉내 내며 매 칸 상태가 망가지지 않았는지 본다.
//   node tools/fuzz.mjs [시드 수] [날 수]
import { readFileSync } from 'node:fs';
const data = await import('../data.js');
data.loadCatalog(JSON.parse(readFileSync(new URL('../assets/ingredients/catalog.json', import.meta.url), 'utf8')));
const sim = await import('../sim.js');
const T = await import('../taste.js');

const SEEDS = Number(process.argv[2] || 6), DAYS = Number(process.argv[3] || 45);
const problems = new Map();
const report = (seed, day, what) => { if (!problems.has(what)) problems.set(what, `시드 ${seed} ${day}일째: ${what}`); };

function rnd(r) { r.v = (r.v * 16807) % 2147483647; return r.v / 2147483647; }
const pickOf = (r, a) => a[Math.floor(rnd(r) * a.length)];

function check(s, seed) {
  const d = s.day;
  if (!Number.isFinite(s.money)) report(seed, d, '돈이 숫자가 아님');
  if (!Number.isFinite(s.rep) || s.rep < 0) report(seed, d, '평판이 이상함');
  if (!Number.isFinite(s.ideas)) report(seed, d, '아이디어가 숫자가 아님');
  const ids = new Set(s.guests.map((g) => g.id));
  for (const p of s.seats) if (p.guest !== null && !ids.has(p.guest)) report(seed, d, '자리에 없는 손님이 앉아 있음');
  for (const g of s.guests) {
    if (['ordering', 'waiting', 'eating', 'walkIn'].includes(g.state)) {
      const seat = s.seats.find((p) => p.x === g.seat?.x && p.y === g.seat?.y);
      if (!seat) report(seed, d, `손님 자리가 지도에 없음 (${g.state})`);
      else if (seat.guest !== g.id) report(seed, d, `자리 주인이 다름 (${g.state})`);
    }
    if (g.menu && !data.MENUS[g.menu]) report(seed, d, '손님이 없는 메뉴를 주문');
    if (!['ordering', 'waiting', 'eating'].includes(g.state)) {
      const c = sim.getMap().at(Math.round(g.x), Math.round(g.y));
      if ('PTO#Cp'.includes(c)) report(seed, d, `손님이 ${c} 칸 위를 걸음`);
    }
    if (!Number.isFinite(g.x) || !Number.isFinite(g.y)) report(seed, d, '손님 좌표가 숫자가 아님');
  }
  for (const v of s.servers) {
    const c = sim.getMap().at(Math.round(v.x), Math.round(v.y));
    if ('PTO#Cph'.includes(c)) report(seed, d, `종업원이 ${c} 칸 위에 있음`);
  }
  for (const o of [...s.queue, ...s.ready, ...s.cooks.map((c) => c.order), ...s.servers.map((v) => v.carry)].filter(Boolean)) {
    if (!data.MENUS[o.menu]) report(seed, d, '주문에 없는 메뉴');
  }
  for (const id of s.onSale) if (!data.MENUS[id]) report(seed, d, '메뉴판에 없는 메뉴');
  if (sim.menusOnSale(s).length > sim.menuSlots(s)) report(seed, d, '메뉴판 칸보다 많이 팖');
  if (sim.menusOnSale(s).length === 0) report(seed, d, '파는 메뉴가 없음');
  if (s.tables !== s.tablePos.length) report(seed, d, '탁자 수가 안 맞음');
  if (!sim.checkLayout(s.zone, s.tablePos, s.decor).ok) report(seed, d, '배치가 규칙을 어김');
}

// 아무렇게나 하는 행동
function chaos(s, r) {
  const n = Math.floor(rnd(r) * 4);
  for (let k = 0; k < n; k++) {
    const a = Math.floor(rnd(r) * 16);
    try {
      if (a === 0) { const c = pickOf(r, s.candidates); if (c) sim.hire(s, c.id); }
      else if (a === 1) { const x = pickOf(r, [...s.cooks, ...s.servers]); if (x) sim.fire(s, x.id); }
      else if (a === 2) sim.buyTable(s);
      else if (a === 3) sim.expandShop(s);
      else if (a === 4) sim.buyDecor(s, pickOf(r, data.DECOR).id);
      else if (a === 5) { const t = Math.floor(rnd(r) * s.tablePos.length); const sp = pickOf(r, sim.tableSpots(s, t)); if (sp) sim.moveTable(s, t, sp.x, sp.y); }
      else if (a === 6) { const k2 = pickOf(r, Object.keys(s.decor).filter((k) => k !== sim.KITCHEN_DECOR)); const sp = k2 && pickOf(r, sim.decorSpotsFree(s, k2)); if (sp) sim.moveDecor(s, k2, sp.x, sp.y); }
      else if (a === 7) { const p = sim.developable(s); const x = pickOf(r, p), y = pickOf(r, p); const e = sim.experiment(s, x, y); if (e.ok && e.result && rnd(r) < 0.5) sim.addRecipe(s, e.result.key); }
      else if (a === 8) { const m = pickOf(r, sim.availableMenus(s)); if (m) sim.toggleMenu(s, m); }
      else if (a === 9) { const m = pickOf(r, sim.availableMenus(s)); const dir = pickOf(r, ['flavor', 'hearty', 'premium', 'technique']); const ing = pickOf(r, sim.developable(s).filter((x) => T.canUseFor(dir, x))); if (m) sim.upgradeMenu(s, m, dir, ing); }
      else if (a === 10) { const p = pickOf(r, sim.allPacks().filter((x) => sim.packState(s, x) === 'open')); if (p) sim.buyPack(s, p.id); }
      else if (a === 11) sim.buyClue(s);
      else if (a === 12) sim.buySlot(s);
      else if (a === 13) { const m = pickOf(r, sim.availableMenus(s)); if (m) sim.setContestPick(s, m); }
      else if (a === 14) sim.buyEquip(s, Math.floor(rnd(r) * 4), pickOf(r, data.EQUIPMENT).id);
      else if (a === 15) { const w = pickOf(r, s.unlocked); sim.setAnnexWorld(s, w); }
    } catch (e) { report(s.seed, s.day, `행동 ${a}에서 오류: ${e.message}`); }
  }
}

for (let seed = 1; seed <= SEEDS; seed++) {
  const s = sim.createGame(seed * 101);
  s.money = 3000 + seed * 2000;
  const r = { v: seed * 7919 };
  for (let d = 1; d <= DAYS; d++) {
    if (d > 1) sim.openNextDay(s);
    let ticks = 0;
    try {
      while (s.phase === 'open') {
        sim.tick(s);
        if (++ticks % 40 === 0) { chaos(s, r); check(s, seed); }
        // 가끔 저장했다 불러오기
        if (ticks === 1500 && rnd(r) < 0.3) {
          const j = JSON.parse(JSON.stringify(s));
          Object.assign(s, sim.migrate(j));
        }
        if (ticks > 20000) { report(seed, d, '하루가 끝나지 않음'); break; }
      }
    } catch (e) { report(seed, d, `오류: ${e.stack.split('\n').slice(0, 2).join(' ')}`); break; }
    check(s, seed);
    // 손님이 너무 많이 화내면 이상 신호
    if (s.lastSummary && s.lastSummary.angry > s.lastSummary.served + 20) report(seed, d, `화난 손님이 너무 많음 ${s.lastSummary.angry}/${s.lastSummary.served}`);
  }
  console.log(`시드 ${seed}: 실험 ${s.totals.experiments} 메뉴 ${Object.keys(s.recipes).length} 개량 ${s.totals.upgrades} 탁자 ${s.tables} 넓이 ${s.zone} 직원 ${s.cooks.length}/${s.servers.length} 장식 ${Object.keys(s.decor).length} 돈 ${s.money} 평판 ${Math.round(s.rep)} 손님 ${s.totals.served}`);
}
console.log(problems.size ? [...problems.values()].join('\n') : '문제 없음');
