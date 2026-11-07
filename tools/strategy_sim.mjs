// 운영 방식 비교: 기본 운영(직원·탁자·넓히기만) vs 연구 운영(+실험·거래처·개량·의뢰·대회 출품)
//   node tools/strategy_sim.mjs [days] [seeds...]
// 각 시드마다 두 방식으로 굴려 순위·돈·평판·별점·세계·대회 결과를 비교한다.
import { readFileSync } from 'node:fs';
const data = await import('../data.js');
data.loadCatalog(JSON.parse(readFileSync(new URL('../assets/ingredients/catalog.json', import.meta.url), 'utf8')));
const sim = await import('../sim.js');
const T = await import('../taste.js');

const DAYS = Number(process.argv[2] || 30);
const SEEDS = process.argv.slice(3).map(Number);
if (!SEEDS.length) SEEDS.push(2026, 7, 42, 99);

function basicInvest(s) {
  // 리뷰에서 쓴 조건과 같은 꼴: 계약금+200G 넘으면 고용(요리사 3, 종업원 2), 탁자값+300G 넘으면 탁자
  // 손님이 화내고 나가면 직원을 더 뽑는다 (사람도 그렇게 한다)
  const busy = (s.lastSummary?.angry || 0) > 2;
  for (const role of ['cook', 'server']) {
    const max = role === 'cook' ? (busy ? 4 : 3) : (busy ? 3 : 2);
    const list = role === 'cook' ? s.cooks : s.servers;
    const c = s.candidates.find((x) => x.role === role);
    if (c && list.length < max && s.money > c.fee + 200) sim.hire(s, c.id);
  }
  let price;
  while ((price = sim.tablePrice(s)) != null && s.money > price + 300 && sim.buyTable(s).ok) ;
  const z = sim.nextZone(s);
  if (z && s.money > z.price + 500 && (!z.needWorld || s.unlocked.length > 1)) sim.expandShop(s);
}

// 연구하는 사람 흉내: 결과를 미리 모른 채 실험하고, 좋은 걸 골라 올리고, 아이디어로 개량한다
function research(s, rng) {
  const r = () => (rng.v = (rng.v * 16807) % 2147483647) / 2147483647;
  // 거래처: 3일에 하나쯤, 돈이 넉넉하면
  const packs = sim.allPacks().filter((p) => sim.packState(s, p) === 'open');
  if (packs.length && s.money > 900 && r() < 0.4) sim.buyPack(s, packs[Math.floor(r() * packs.length)].id);
  // 단서가 있으면 그 재료를 써 본다
  for (const c of s.clues || []) {
    const sp = data.SPECIALS.find((x) => T.pairKey(x.a, x.b) === c.key);
    if (sp && sim.inPantry(s, sp.a) && sim.inPantry(s, sp.b)) sim.experiment(s, sp.a, sp.b);
  }
  if ((s.ideas || 0) >= sim.clueCost(s) + 3 && !(s.clues || []).length) sim.buyClue(s);
  // 하루 4번 실험 (모르는 짝 무작위)
  const pool = sim.developable(s);
  for (let k = 0; k < 4 && s.money > 200; k++) {
    const a = pool[Math.floor(r() * pool.length)], b = pool[Math.floor(r() * pool.length)];
    if (a !== b && !(s.tried || {})[T.pairKey(a, b)]) sim.experiment(s, a, b);
  }
  // 노트에서 좋은 것(맛 65 이상)을 메뉴로, 메뉴판은 맛 순으로
  for (const [k, t] of Object.entries(s.tried || {})) if (t.q >= 65 && !s.recipes[T.recipeIdOf(...k.split('+'))]) sim.addRecipe(s, k);
  if (sim.slotPrice(s) != null && s.money > sim.slotPrice(s) + 1500) sim.buySlot(s);
  const best = sim.availableMenus(s).sort((x, y) => sim.menuStats(s, y).q - sim.menuStats(s, x).q);
  // 의뢰에 맞는 메뉴는 꼭 올린다
  const need = new Set();
  for (const q of sim.openRequests(s)) { const m = best.find((id) => sim.requestFits(s, q, id).ok); if (m) need.add(m); }
  s.onSale = [...need, ...best.filter((id) => !need.has(id))].slice(0, sim.menuSlots(s));
  // 개량: 팔고 있는 가장 좋은 메뉴부터, 풍미 → 조리법
  for (const id of s.onSale.slice(0, 3)) {
    const c = sim.upgradeCost(s, id);
    if ((s.ideas || 0) < c.ideas + 2 || s.money < c.gold + 300) break;
    const ups = (s.upgrades || {})[id] || [];
    if (ups.length >= 3) continue;
    const dir = ups.some((u) => u.dir === 'technique') ? 'flavor' : ups.length ? 'technique' : 'flavor';
    const ings = sim.developable(s).filter((x) => T.canUseFor('flavor', x) && !data.MENUS[id].ingredients.includes(x));
    // 맛 속성이 겹치거나 어울리는 재료를 고르는 척 (사람은 이유 목록을 보고 고른다)
    const ing = dir === 'flavor' ? ings.sort((p, q) => T.upgradeFit(sim.menuStats(s, id).tags, '', q).v - T.upgradeFit(sim.menuStats(s, id).tags, '', p).v)[Math.floor(r() * 3)] : null;
    sim.upgradeMenu(s, id, dir, ing);
  }
  // 대회: 점수가 가장 높은 메뉴로 직접 출품
  const th = sim.contestTheme(s);
  const pick = sim.availableMenus(s).sort((x, y) => sim.contestScore(s, th, y).score - sim.contestScore(s, th, x).score)[0];
  sim.setContestPick(s, pick);
  // 장식: 돈 남으면 하나
  if (s.money > 3000 && Object.keys(s.decor).length < 4) sim.buyDecor(s, 'flower_pot');
}

function run(seed, mode) {
  const s = sim.createGame(seed);
  const rng = { v: seed * 7 + 1 };
  const out = { rank14: null, rank30: null, best: null, contest: [], stars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, angry: 0 };
  for (let d = 1; d <= DAYS; d++) {
    if (d > 1) sim.openNextDay(s);
    basicInvest(s);
    if (mode === 'research') research(s, rng);
    let ev = [];
    while (s.phase === 'open') ev = ev.concat(sim.tick(s));
    for (const e of ev) {
      if (e.type === 'review') { if (e.rating) out.stars[e.rating]++; else out.angry++; }
      if (e.type === 'ranking') { if (d === 14) out.rank14 = e.pos; if (d === 28) out.rank30 = e.pos; }
      if (e.type === 'contest') out.contest.push(e.place);
    }
  }
  out.best = s.rank?.best ?? null;
  out.money = s.money; out.rep = Math.round(s.rep); out.worlds = s.unlocked.length;
  out.specials = s.totals.specials || 0; out.recipes = Object.keys(s.recipes).length; out.requests = s.totals.requests || 0;
  out.tables = s.tables; out.zone = s.zone; out.staff = `${s.cooks.length}/${s.servers.length}`; out.experiments = s.totals.experiments || 0;
  const n = Object.values(out.stars).reduce((a, b) => a + b, 0);
  out.five = Math.round((out.stars[5] / n) * 100); out.four = Math.round((out.stars[4] / n) * 100);
  return out;
}

const fmt = (o) => `순위14 ${o.rank14 ?? '-'} 순위28 ${o.rank30 ?? '-'} 최고 ${o.best ?? '-'} · 대회 ${o.contest.join('/') || '-'} · 돈 ${o.money} 평판 ${o.rep} 세계 ${o.worlds} · 별5 ${o.five}% 별4 ${o.four}% 화남 ${o.angry} · 탁자 ${o.tables} 넓이 ${o.zone} 직원 ${o.staff} · 실험 ${o.experiments} 메뉴 ${o.recipes} 전설 ${o.specials} 의뢰 ${o.requests}`;
for (const seed of SEEDS) {
  console.log(`시드 ${seed}`);
  console.log('  기본', fmt(run(seed, 'basic')));
  console.log('  연구', fmt(run(seed, 'research')));
}
