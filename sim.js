// 《차원골목 식당》 계산
// 화면을 전혀 모른다. 상태를 받아서 한 칸(tick)씩 굴리고, 일어난 일을 사건 목록으로 돌려준다.
// 그래서 브라우저 없이 node로 하루를 통째로 돌려 볼 수 있다 (tests/ 참고).
import {
  CONFIG, SHOP_MAP, WORLDS, INGREDIENTS, MENUS, GUESTS, SPRITES, TREND_NEWS,
  WEATHER, STAFF_NAMES, WORLD_COLORS, ACHIEVEMENTS, CATALOG, DISH_WORLD_ROW, dishOf,
  DECOR, PROMOS, RIVALS, GIFT_LINES, SHOP_ART, SPECIALS, PACK_GROUPS, TRAITS, REQUESTS, CONTEST_THEMES,
  SHOP_ZONES, START_TABLES, LEGACY_TABLES, EQUIPMENT, GRADES, GOALS, MISSION_KINDS, FESTIVALS, VIPS,
} from './data.js';
import { evaluate, pairKey, pairOf, recipeIdOf, starsOf, UPGRADE_DIRS, canUseFor, upgradeFit, SPECIAL_BY_KEY, CLS_NAME, KIND_NAME } from './taste.js';

// ---------- 난수 ----------
// mulberry32 (Tommy Ettinger, public domain). 씨앗을 상태에 넣어 두니 저장·불러오기 뒤에도 이어진다.
export function rand(s) {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (s, arr) => arr[Math.floor(rand(s) * arr.length)];
function pickWeighted(s, pairs) {
  const total = pairs.reduce((a, [, w]) => a + w, 0);
  let r = rand(s) * total;
  for (const [v, w] of pairs) { if ((r -= w) < 0) return v; }
  return pairs[pairs.length - 1][0];
}
// 문자열 → 고정된 숫자. 같은 재료 짝은 언제나 같은 궁합이 나온다.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------- 지도 ----------
// 가게 지도는 상태에서 만든다: 주방(위 5줄) + 종업원 줄 + 홀(넓이 단계만큼) + 문 줄.
// 탁자와 장식은 플레이어가 옮길 수 있다. 지도가 바뀌면 setLayout(s)로 다시 짓는다.
let MAP = null;
const KITCHEN_ROWS = 5, HALL_TOP = 6;
export const KITCHEN_DECOR = '10,3';
export const zoneOf = (s) => SHOP_ZONES[Math.min(s.zone ?? SHOP_ZONES.length - 2, SHOP_ZONES.length - 1)];
function buildMap(zone, tables, decor) {
  const Z = SHOP_ZONES[zone];
  const W = SHOP_MAP[0].length;
  const rows = [...SHOP_MAP.slice(0, KITCHEN_ROWS + 1)];
  for (let i = 0; i < Z.rows; i++) rows.push('.'.repeat(W));
  rows.push(SHOP_MAP[SHOP_MAP.length - 1]); // 문 줄
  const grid = rows.map((r) => [...r]);
  const H = grid.length;
  const bad = [];
  const put = (x, y, ch) => {
    if (y < HALL_TOP || y > H - 2 || x < 0 || x >= W || grid[y][x] !== '.') { bad.push(`${x},${y}`); return; }
    grid[y][x] = ch;
  };
  tables.forEach((t) => { put(t.x, t.y - 1, 'h'); put(t.x + 1, t.y - 1, 'x'); put(t.x, t.y, 'T'); put(t.x + 1, t.y, 'T'); put(t.x, t.y + 1, 'h'); put(t.x + 1, t.y + 1, 'x'); });
  for (const k of Object.keys(decor || {})) { if (k === KITCHEN_DECOR) continue; const [x, y] = k.split(',').map(Number); put(x, y, 'P'); }
  const all = (ch) => { const out = []; grid.forEach((row, y) => row.forEach((c, x) => { if (c === ch) out.push({ x, y }); })); return out; };
  const m = {
    w: W, h: H, grid, zone, bad, annexTop: zone >= 2 ? HALL_TOP + SHOP_ZONES[1].rows : null,
    at: (x, y) => (grid[y] && grid[y][x]) || '#',
    seats: all('h'), doors: all('D'),
    cookSpots: all('c'), serverHomes: all('s'), pass: all('p')[0],
    decorSpots: [KITCHEN_DECOR, ...Object.keys(decor || {}).filter((k) => k !== KITCHEN_DECOR)],
  };
  m.tables = tables.map((t, i) => ({ i, x: t.x, y: t.y, seats: [`${t.x},${t.y - 1}`, `${t.x},${t.y + 1}`] }));
  return m;
}
// 지금 판의 지도. 판이 없으면(시험용) 예전 넓은 가게.
export function getMap() {
  if (!MAP) MAP = buildMap(1, LEGACY_TABLES, { '0,9': 1, '10,9': 1 });
  return MAP;
}
// 상태의 탁자·장식·넓이로 지도를 다시 짓고, 앉아 있는 손님 자리는 그대로 이어 준다
export function setLayout(s) {
  MAP = buildMap(s.zone, s.tablePos, s.decor);
  const old = new Map((s.seats || []).map((p) => [`${p.x},${p.y}`, p.guest]));
  s.seats = MAP.seats.map((p) => ({ x: p.x, y: p.y, guest: old.get(`${p.x},${p.y}`) ?? null }));
  s.tables = s.tablePos.length;
  reroute(s);
  return MAP;
}
// 지도가 바뀌면 걷고 있는 손님과 종업원의 길을 새 지도로 다시 찾는다
function reroute(s) {
  for (const g of s.guests || []) {
    if (g.state === 'walkIn' && g.seat) {
      const p = findPath(g, (x, y) => x === g.seat.x && y === g.seat.y);
      if (p) { p.push({ x: g.seat.x + 0.5, y: g.seat.y }); g.path = p; }
    } else if (g.state === 'leaving') g.path = doorPath(g);
  }
  for (const v of s.servers || []) {
    if (v.state === 'delivering' && v.carry) {
      const g = (s.guests || []).find((x) => x.id === v.carry.guest);
      const p = g && findPath(v, (x, y) => Math.abs(x - g.seat.x) + Math.abs(y - g.seat.y) === 1 && walkable(x, y));
      if (p) v.path = p;
    } else if (v.state === 'returning') {
      const h = getMap().serverHomes[v.slot];
      if (h) v.path = findPath(v, (x, y) => x === h.x && y === h.y) || [];
    }
  }
}
// 걷고 있는 사람이 새 배치에서 갇히지 않는지
function moversFree(s, reach) {
  const movers = [...(s.guests || []).filter((g) => !['ordering', 'waiting', 'eating'].includes(g.state)), ...(s.servers || [])];
  return movers.every((e) => reach.has(`${Math.round(e.x)},${Math.round(e.y)}`) || getMap().at(Math.round(e.x), Math.round(e.y)) === 'h');
}
// 사람이 지금 서 있거나 걸쳐 있는 칸 (그 칸에는 가구를 못 놓는다)
export function peopleCells(s) {
  const out = new Set();
  const add = (e) => { for (const x of [Math.floor(e.x), Math.ceil(e.x)]) for (const y of [Math.floor(e.y), Math.ceil(e.y)]) out.add(`${x},${y}`); };
  for (const g of s.guests || []) if (!['ordering', 'waiting', 'eating'].includes(g.state)) add(g);
  for (const v of s.servers || []) add(v);
  return out;
}
const tableCells = (t) => [[0, -1], [1, -1], [0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => `${t.x + dx},${t.y + dy}`);
const FLOOR = new Set(['.', 's', 'D']);
const walkable = (x, y) => FLOOR.has(getMap().at(x, y));
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// 너비 우선 탐색. 가게가 작아서 이걸로 충분하다. 맵이 커지면 A*로 바꾸면 된다.
export function findPath(from, isGoal, canEnter = walkable) {
  const map = getMap(), W = map.w;
  const sx = Math.round(from.x), sy = Math.round(from.y), start = sy * W + sx;
  if (isGoal(sx, sy)) return [];
  const prev = new Map([[start, -1]]);
  const q = [[sx, sy]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, k = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= map.h || prev.has(k)) continue;
      const goal = isGoal(nx, ny);
      if (!goal && !canEnter(nx, ny)) continue;
      prev.set(k, y * W + x);
      if (goal) {
        const path = [];
        for (let c = k; c !== start; c = prev.get(c)) path.unshift({ x: c % W, y: Math.floor(c / W) });
        return path;
      }
      q.push([nx, ny]);
    }
  }
  return null;
}

// 경로를 따라 dist칸만큼 걷는다. 도착하면 true.
function advance(e, dist) {
  while (dist > 0 && e.path.length) {
    const n = e.path[0], dx = n.x - e.x, dy = n.y - e.y, d = Math.hypot(dx, dy);
    if (dx) e.face = dx > 0 ? 1 : -1;
    if (d <= dist) { e.x = n.x; e.y = n.y; e.path.shift(); dist -= d; }
    else { e.x += (dx / d) * dist; e.y += (dy / d) * dist; dist = 0; }
  }
  return e.path.length === 0;
}

// ---------- 재료와 메뉴 ----------
// data.js에 없는 재료(개발에 쓴 그림 묶음 재료)는 CATALOG에서 이름을 찾아 채운다
export function ingredientInfo(id) {
  if (INGREDIENTS[id]) return INGREDIENTS[id];
  const c = CATALOG[id];
  if (!c) return null;
  const base = { normal: 2, fantasy: 3, xian: 5, fairy: 5, demon: 6, heaven: 6 }[c.category] ?? 3;
  return { name: c.name, world: c.category, cost: base + (hash(id) % 3), color: WORLD_COLORS[c.category] || '#ccc' };
}
function ensureIngredient(id) {
  if (!INGREDIENTS[id]) { const info = ingredientInfo(id); if (info) INGREDIENTS[id] = info; }
}
export const menuCost = (id) => MENUS[id].ingredients.reduce((a, i) => a + (ingredientInfo(i)?.cost || 0), 0);
export const openWorlds = (s) => s.unlocked.filter((id) => WORLDS[id].ready);
// 재료가 모두 '일반'이거나 열린 세계 것이면 팔 수 있다
const usable = (s, ingId) => { const w = ingredientInfo(ingId)?.world; return w === 'normal' || s.unlocked.includes(w); };
export const availableMenus = (s) => Object.keys(MENUS).filter((id) => {
  if (MENUS[id].custom && !(s.recipes || {})[id]) return false; // 다른 판에서 만든 메뉴
  return MENUS[id].ingredients.every((i) => usable(s, i));
});
// 메뉴판: 칸 수만큼만 올릴 수 있다. 손님은 올린 메뉴만 고른다.
export const menuSlots = (s) => s.menuSlots ?? CONFIG.menuSlots.start;
export const menusOnSale = (s) => { const av = new Set(availableMenus(s)); return (s.onSale || []).filter((id) => av.has(id)); };
export function toggleMenu(s, id) {
  s.onSale ||= [];
  if (s.onSale.includes(id)) {
    if (menusOnSale(s).length <= 1) return { ok: false, reason: '메뉴는 하나 이상 팔아야 해요' };
    s.onSale = s.onSale.filter((x) => x !== id);
    return { ok: true, on: false };
  }
  if (!availableMenus(s).includes(id)) return { ok: false, reason: '아직 팔 수 없는 메뉴예요' };
  if (menusOnSale(s).length >= menuSlots(s)) return { ok: false, reason: `메뉴판이 꽉 찼어요 (${menuSlots(s)}칸). 하나를 내리거나 칸을 늘려요` };
  s.onSale = [...menusOnSale(s), id];
  return { ok: true, on: true };
}
export const slotPrice = (s) => CONFIG.menuSlots.prices[menuSlots(s) - CONFIG.menuSlots.start];
export function buySlot(s) {
  const price = slotPrice(s);
  if (price == null) return { ok: false, reason: '메뉴판이 가장 커요' };
  if (s.money < price) return { ok: false, reason: `${price}G가 모자라요` };
  s.money -= price;
  s.menuSlots = menuSlots(s) + 1;
  return { ok: true, price, ev: [{ type: 'slotAdded', n: s.menuSlots }] };
}

// ---------- 가게 넓히기, 배치, 분위기 ----------
// 배치가 괜찮은가: 겹치지 않고, 문에서 모든 의자 옆과 종업원 자리까지 걸어갈 수 있어야 한다
export function checkLayout(zone, tables, decor) {
  const m = buildMap(zone, tables, decor);
  if (m.bad.length) return { ok: false, reason: '자리가 겹치거나 홀 밖이에요' };
  const seen = new Set();
  const q = m.doors.map((d) => [d.x, d.y]);
  q.forEach(([x, y]) => seen.add(`${x},${y}`));
  const walk = (x, y) => '.sD'.includes(m.at(x, y));
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy, k = `${nx},${ny}`; if (!seen.has(k) && walk(nx, ny)) { seen.add(k); q.push([nx, ny]); } }
  }
  const near = (p) => DIRS.some(([dx, dy]) => seen.has(`${p.x + dx},${p.y + dy}`));
  if (!m.seats.every(near)) return { ok: false, reason: '어떤 의자로 가는 길이 막혀요' };
  if (!m.serverHomes.every((p) => seen.has(`${p.x},${p.y}`))) return { ok: false, reason: '종업원이 다닐 길이 막혀요' };
  return { ok: true, map: m, reach: seen };
}
const seatsOfTable = (t) => [`${t.x},${t.y - 1}`, `${t.x},${t.y + 1}`];
const tableBusy = (s, t) => (s.seats || []).some((p) => p.guest !== null && seatsOfTable(t).includes(`${p.x},${p.y}`));
// 탁자를 둘 수 있는 곳 (i: 옮길 탁자 번호, 없으면 새 탁자)
export function tableSpots(s, i = null) {
  const out = [];
  const busy = peopleCells(s);
  const W = SHOP_MAP[0].length, H = HALL_TOP + zoneOf(s).rows + 1;
  for (let y = HALL_TOP + 1; y <= H - 3; y++) for (let x = 0; x <= W - 2; x++) {
    const tables = s.tablePos.map((t, k) => (k === i ? { x, y } : t));
    if (i === null) tables.push({ x, y });
    if (tableCells({ x, y }).some((c) => busy.has(c))) continue;
    if (checkLayout(s.zone, tables, s.decor).ok) out.push({ x, y });
  }
  return out;
}
export function decorSpotsFree(s, spot = null) {
  const out = [];
  const busy = peopleCells(s);
  const W = SHOP_MAP[0].length, H = HALL_TOP + zoneOf(s).rows + 1;
  for (let y = HALL_TOP; y <= H - 2; y++) for (let x = 0; x < W; x++) {
    const k = `${x},${y}`;
    if (s.decor?.[k] || busy.has(k)) continue; // 이미 장식이 있거나 사람이 있는 칸
    const decor = { ...s.decor };
    const id = spot ? decor[spot] : 'herb_pot';
    if (spot) delete decor[spot];
    decor[k] = id;
    if (checkLayout(s.zone, s.tablePos, decor).ok) out.push({ x, y });
  }
  return out;
}
export function moveTable(s, i, x, y) {
  const t = s.tablePos[i];
  if (!t) return { ok: false, reason: '없는 탁자예요' };
  if (tableBusy(s, t)) return { ok: false, reason: '손님이 앉아 있어요. 다 먹고 나면 옮겨요' };
  if (tableCells({ x, y }).some((c) => peopleCells(s).has(c))) return { ok: false, reason: '사람이 지나가고 있어요. 잠깐 뒤에 옮겨요' };
  const tables = s.tablePos.map((p, k) => (k === i ? { x, y } : p));
  const c = checkLayout(s.zone, tables, s.decor);
  if (!c.ok) return c;
  if (!moversFree(s, c.reach)) return { ok: false, reason: '걷고 있는 사람이 갇혀요. 잠깐 뒤에 옮겨요' };
  s.tablePos = tables;
  setLayout(s);
  return { ok: true, ev: [{ type: 'layoutChanged' }] };
}
export function moveDecor(s, spot, x, y) {
  if (!s.decor?.[spot] || spot === KITCHEN_DECOR) return { ok: false, reason: '옮길 수 없는 장식이에요' };
  const k = `${x},${y}`;
  if (s.decor[k]) return { ok: false, reason: '이미 장식이 있어요' };
  if (peopleCells(s).has(k)) return { ok: false, reason: '사람이 지나가고 있어요. 잠깐 뒤에 옮겨요' };
  const decor = { ...s.decor, [k]: s.decor[spot] };
  delete decor[spot];
  const c = checkLayout(s.zone, s.tablePos, decor);
  if (!c.ok) return c;
  if (!moversFree(s, c.reach)) return { ok: false, reason: '걷고 있는 사람이 갇혀요. 잠깐 뒤에 옮겨요' };
  s.decor = decor;
  setLayout(s);
  return { ok: true, ev: [{ type: 'layoutChanged' }] };
}
// 탁자 배달 거리: 종업원 자리에서 의자 옆까지 걸음 수 (평균)
export function deliverySteps(s, t) {
  const homes = getMap().serverHomes;
  const steps = seatsOfTable(t).map((k) => {
    const [sx, sy] = k.split(',').map(Number);
    let best = 99;
    for (const h of homes) { const p = findPath(h, (x, y) => Math.abs(x - sx) + Math.abs(y - sy) === 1 && walkable(x, y)); if (p) best = Math.min(best, p.length); }
    return best;
  });
  return Math.round(steps.reduce((a, b) => a + b, 0) / steps.length);
}
export const openTables = (s) => getMap().tables;
export const tablePrice = (s) => CONFIG.tables.prices[s.tablePos.length - CONFIG.tables.start];
export function buyTable(s) {
  const price = tablePrice(s);
  if (price == null) return { ok: false, reason: '탁자를 더 들일 수 없어요' };
  if (s.money < price) return { ok: false, reason: `${price}G가 모자라요` };
  // 비어 있는 곳 중 주방에서 가까운 위, 왼쪽부터
  const spot = tableSpots(s)[0];
  if (!spot) return { ok: false, reason: '놓을 자리가 없어요. 가게를 넓히거나 배치를 바꿔요' };
  s.money -= price;
  s.tablePos.push(spot);
  setLayout(s);
  const ev = [{ type: 'tableAdded', n: s.tables, x: spot.x, y: spot.y }];
  checkAchievements(s, ev);
  return { ok: true, price, spot, ev };
}
export const nextZone = (s) => SHOP_ZONES[(s.zone ?? 0) + 1] || null;
export function expandShop(s) {
  const Z = nextZone(s);
  if (!Z) return { ok: false, reason: '가게가 가장 넓어요' };
  if (Z.needWorld && s.unlocked.length < 2) return { ok: false, reason: '세계 문을 하나 이상 열어야 지을 수 있어요' };
  if (s.money < Z.price) return { ok: false, reason: `${Z.price}G가 모자라요` };
  s.money -= Z.price;
  s.zone = (s.zone ?? 0) + 1;
  if (Z.needWorld) s.annexWorld = s.unlocked.filter((w) => w !== 'fantasy').slice(-1)[0];
  setLayout(s);
  const ev = [{ type: 'shopExpanded', zone: Z.id, name: Z.name }];
  checkAchievements(s, ev);
  return { ok: true, price: Z.price, ev };
}
// 별관 테마: 열린 세계 중에서 고른다. 바꿀 때는 500G (처음 지을 때 고른 건 공짜)
export const ANNEX_CHANGE_PRICE = 500;
export function setAnnexWorld(s, world) {
  if ((s.zone ?? 0) < 2) return { ok: false, reason: '세계 별관을 먼저 지어요' };
  if (world === 'fantasy' || !WORLDS[world] || !s.unlocked.includes(world)) return { ok: false, reason: '문이 열린 세계만 고를 수 있어요' };
  if (s.annexWorld === world) return { ok: false, reason: '이미 그 세계 별관이에요' };
  const price = s.annexWorld ? ANNEX_CHANGE_PRICE : 0;
  if (s.money < price) return { ok: false, reason: `${price}G가 모자라요` };
  s.money -= price;
  s.annexWorld = world;
  return { ok: true, price, ev: [{ type: 'annexChanged', world }] };
}

// 분위기: 가게 전체(손님 수)와 자리 근처(만족)
export const atmosphere = (s) => Object.values(s.decor || {}).reduce((a, id) => a + (DECOR.find((d) => d.id === id)?.atmos || 0), 0);
export function seatAtmos(s, seat) {
  let v = 0;
  for (const [k, id] of Object.entries(s.decor || {})) {
    const d = DECOR.find((x) => x.id === id);
    if (!d) continue;
    const [x, y] = k.split(',').map(Number);
    const dist = Math.abs(x - seat.x) + Math.abs(y - seat.y);
    v += d.atmos * Math.max(0, 1 - dist / 5);
  }
  return Math.round(v);
}
// 장식 사기: 자리를 주면 그 자리 장식을 바꾸고, 안 주면 빈 곳(벽 쪽 먼저)에 놓는다
export function buyDecor(s, a, b) {
  const [spot, id] = b === undefined ? [null, a] : [a, b];
  const d = DECOR.find((x) => x.id === id);
  if (!d) return { ok: false, reason: '모르는 장식이에요' };
  if (!decorOpen(s, d)) return { ok: false, reason: d.unlock === 'contest' ? '요리 대회에서 우승하면 받아요' : '의뢰를 마치면 살 수 있어요' };
  if (spot && s.decor?.[spot] === id) return { ok: false, reason: '이미 놓여 있어요' };
  if (spot && spot !== KITCHEN_DECOR && !s.decor?.[spot]) return { ok: false, reason: '놓을 수 없는 자리예요' };
  if (s.money < d.price) return { ok: false, reason: `${d.price}G가 모자라요` };
  let at = spot;
  if (!at) {
    const W = SHOP_MAP[0].length;
    const free = decorSpotsFree(s).sort((p, q) => (Math.min(p.x, W - 1 - p.x) - Math.min(q.x, W - 1 - q.x)) || p.y - q.y);
    if (!free.length) return { ok: false, reason: '놓을 자리가 없어요' };
    at = `${free[0].x},${free[0].y}`;
  }
  s.money -= d.price;
  s.decor ||= {};
  s.decor[at] = id;
  setLayout(s);
  return { ok: true, spot: at, ev: [{ type: 'decorPlaced', id, atmos: atmosphere(s), spot: at }] };
}
// 조리 설비
export function buyEquip(s, slot, id) {
  const E = EQUIPMENT.find((x) => x.id === id);
  if (!E || slot < 0 || slot >= getMap().cookSpots.length) return { ok: false, reason: '놓을 수 없어요' };
  if (s.equip?.[slot] === id) return { ok: false, reason: '이미 있어요' };
  if (s.money < E.price) return { ok: false, reason: `${E.price}G가 모자라요` };
  s.money -= E.price;
  (s.equip ||= {})[slot] = id;
  return { ok: true, ev: [{ type: 'equipPlaced', id, slot }] };
}
const equipMult = (s, slot, kind) => { const E = EQUIPMENT.find((x) => x.id === s.equip?.[slot]); return E && E.kinds.includes(kind) ? E.mult : 1; };
export const decorOpen = (s, d) => (!d.world && !d.unlock) || !!(s.decorUnlocked || {})[d.id];
// 그 세계 손님이 반기는 장식이 놓여 있으면 만족 덤
export const homeDecorBonus = (s, world, seat = null) => Math.max(0, ...Object.entries(s.decor || {}).map(([k, id]) => {
  const d = DECOR.find((x) => x.id === id);
  if (d?.world !== world) return 0;
  if (!seat) return d.bonus || 0;
  const [x, y] = k.split(',').map(Number);
  return Math.abs(x - seat.x) + Math.abs(y - seat.y) <= 4 ? d.bonus || 0 : Math.round((d.bonus || 0) / 3);
}));
export const annexBonus = (s, g) => { const top = getMap().annexTop; return top != null && g.seat?.y >= top && GUESTS[g.type].world === s.annexWorld ? 6 : 0; };
export const promoPrice = (s, p) => Math.round(p.price * (s.perks?.bard ? 0.5 : 1));
export const activePromo = (s) => (s.promo && s.day <= s.promo.until ? PROMOS.find((p) => p.id === s.promo.id) : null);
export function promote(s, id) {
  const p = PROMOS.find((x) => x.id === id);
  if (!p) return { ok: false, reason: '모르는 홍보예요' };
  if (activePromo(s)) return { ok: false, reason: '이미 홍보 중이에요' };
  const price = promoPrice(s, p);
  if (s.money < price) return { ok: false, reason: `${price}G가 모자라요` };
  s.money -= price;
  s.promo = { id, until: s.day + p.days - 1 };
  const ev = [{ type: 'promoStart', id, name: p.name }];
  if (p.rep) applyRep(s, p.rep, ev);
  return { ok: true, ev };
}

// ---------- 메뉴 레벨 ----------
export const menuLevel = (s, id) => { let lv = 1; CONFIG.menuLevel.exp.forEach((t, i) => { if (((s.menuExp || {})[id] || 0) >= t) lv = i + 1; }); return lv; };
const baseQ = (m) => m.q ?? (m.taste * 14 + 6);
// 메뉴의 실제 수치: 기본값 + 메뉴 레벨 + 개량. 손님 판정, 값, 조리 시간은 모두 여기서 나온다.
export function menuStats(s, id) {
  const m = MENUS[id], U = CONFIG.upgrade, L = CONFIG.menuLevel;
  const lv = menuLevel(s, id);
  const ups = (s.upgrades || {})[id] || [];
  let q = baseQ(m) + L.qPerLevel * (lv - 1);
  let price = m.price, cookMin = m.cookMin, eatMin = m.eatMin, hearty = m.hearty || 0, premium = 0, cost = menuCost(id);
  const tags = [...(m.tags || [])];
  const cls = m.cls || m.ingredients.map((i) => CATALOG[i]?.cls).filter(Boolean);
  for (const u of ups) {
    q += u.dq || 0;
    if (u.dir === 'hearty') { hearty += 1; price *= 1 + U.heartyPrice; eatMin *= 1 + U.heartyEat; }
    if (u.dir === 'premium') { premium += 1; price *= 1 + U.premiumPrice; }
    if (u.dir === 'technique') cookMin *= U.techCook;
    if (u.ing) { cost += ingredientInfo(u.ing)?.cost || 0; for (const t of CATALOG[u.ing]?.tags || []) if (!tags.includes(t)) tags.push(t); }
  }
  if (m.effect === 'fast') cookMin *= 0.7;
  if (m.effect === 'hearty') hearty += 1;
  price *= 1 + L.pricePerLevel * (lv - 1);
  return { q: Math.min(100, Math.round(q)), stars: starsOf(q), price: Math.round(price), cookMin, eatMin, hearty, premium, cost, tags, cls,
    kind: m.kind, world: m.world, effect: m.effect || null, ups: ups.length, lv };
}
export const menuPrice = (s, id) => menuStats(s, id).price;

export function repLevel(rep) {
  let lv = 1;
  CONFIG.repThresholds.forEach((t, i) => { if (rep >= t) lv = i + 1; });
  return lv;
}

// 손님 취향 점수: 요리 속성·종류·분류가 손님 입맛에 맞는 만큼 (-28 ~ +28)
export function tasteFit(gt, st, m) {
  const T = gt.taste || {};
  let v = 0;
  for (const t of st.tags) v += T.tags?.[t] || 0;
  v += T.kinds?.[st.kind] || 0;
  for (const c of new Set(st.cls)) v += T.cls?.[c] || 0;
  if (m.ingredients.some((i) => gt.likes.includes(i))) v += 8;
  if (m.ingredients.some((i) => gt.dislikes.includes(i))) v -= 12;
  return Math.max(-28, Math.min(28, v));
}
export const starsFromSat = (sat) => { const T = CONFIG.satStars; return sat < T[0] ? 1 : sat < T[1] ? 2 : sat < T[2] ? 3 : sat < T[3] ? 4 : 5; };
// 한 손님이 한 메뉴를 먹었을 때 만족도와 별. opts: { waited, trend, atmos, bonus }
export function satisfaction(s, guestType, menuId, opts = {}) {
  const gt = GUESTS[guestType], m = MENUS[menuId], st = menuStats(s, menuId);
  const parts = [];
  const fit = tasteFit(gt, st, m);
  let sat = st.q + fit;
  if (fit >= 10) parts.push('입맛에 딱'); else if (fit <= -10) parts.push('입맛에 안 맞음');
  if (gt.world !== 'fantasy' && st.world === gt.world) { sat += 6; parts.push('고향의 맛'); }
  if (gt.budget && st.price > gt.budget) { const p = Math.min(20, (st.price - gt.budget) * 0.6 * (gt.thrifty ? 1.5 : 1)); sat -= p; parts.push('비싸요'); }
  else if (gt.thrifty && st.price <= gt.budget * 0.7) { sat += 4; parts.push('싸요'); }
  if (gt.rich && st.premium) { sat += 6 * st.premium; parts.push('고급스러워요'); }
  if (gt.hungry && st.hearty) { sat += 4 * Math.min(2, st.hearty); parts.push('든든해요'); }
  if (gt.small && st.hearty) { sat -= 5 * st.hearty; parts.push('양이 많아요'); }
  if (opts.trend) sat += 5;
  if (opts.atmos) { sat += Math.min(10, opts.atmos / 2); if (opts.atmos >= 10) parts.push('분위기 좋아요'); }
  if (opts.bonus) sat += opts.bonus;
  const w = opts.waited || 0;
  if (w > CONFIG.waitGrace) { sat -= Math.min(30, (w - CONFIG.waitGrace) * CONFIG.waitPenalty); parts.push('오래 기다림'); }
  return { sat: Math.round(sat), stars: starsFromSat(sat), fit, parts };
}
// 옛 이름 (테스트·화면 호환): 기다린 시간만으로 별을 매긴다
export function rateMeal(s, guestType, menuId, waited = 0, bonus = 0) {
  return satisfaction(s, guestType, menuId, { waited, bonus }).stars;
}

export const gradeOf = (rep) => { let g = 0; GRADES.forEach((x, i) => { if (rep >= x.rep) g = i; }); return g; };
export function applyRep(s, delta, ev = []) {
  const before = repLevel(s.rep);
  const gBefore = gradeOf(s.rep);
  if (delta > 0) delta *= CONFIG.repSoftness / (CONFIG.repSoftness + s.rep);
  s.rep = Math.max(0, Math.round((s.rep + delta) * 100) / 100);
  const after = repLevel(s.rep);
  if (after > before) ev.push({ type: 'repUp', level: after });
  const gAfter = gradeOf(s.rep);
  if (gAfter > gBefore) ev.push({ type: 'gradeUp', grade: gAfter, name: GRADES[gAfter].name });
  for (const [id, w] of Object.entries(WORLDS)) {
    if (!s.unlocked.includes(id) && s.rep >= w.unlockRep) {
      s.unlocked.push(id);
      const menus = Object.keys(MENUS).filter((m) => !MENUS[m].custom && MENUS[m].world === id);
      const added = addToPantry(s, menus.flatMap((m) => MENUS[m].ingredients));
      for (const m of menus) if (s.onSale && menusOnSale(s).length < menuSlots(s)) toggleMenu(s, m);
      ev.push({ type: 'worldUnlocked', world: id, added, menus });
      refreshRequests(s, ev);
    }
  }
  return ev;
}

// ---------- 신메뉴 개발 ----------
// 흐름: 재료 창고(pantry)에서 두 개 골라 시제품 실험 → 연구 노트(tried)에 결과가 남는다 → 마음에 들면 메뉴판에 올린다
// → 팔수록 메뉴 레벨이 오르고, 아이디어를 써서 개량한다. 재료는 거래처 꾸러미·단골 선물·의뢰 보상으로 늘어난다.
// 맛 판정은 taste.js. 같은 짝은 순서와 저장에 상관없이 늘 같은 결과다.
export const compat = (a, b) => evaluate(a, b)?.stars ?? 0;
const worldOpen = (s, id) => { const w = CATALOG[id]?.category || ingredientInfo(id)?.world; return w === 'normal' || s.unlocked.includes(w); };
export const inPantry = (s, id) => (s.pantry || []).includes(id);
export function addToPantry(s, ids) {
  s.pantry ||= [];
  const added = [];
  for (const id of ids) if (!s.pantry.includes(id) && (CATALOG[id] || INGREDIENTS[id])) { s.pantry.push(id); added.push(id); }
  return added;
}
// 창고 재료 중 지금 쓸 수 있는 것 (세계 문이 열린 것)
export const developable = (s) => (s.pantry || []).filter((id) => worldOpen(s, id) && CATALOG[id]);

// ---------- 거래처 꾸러미 ----------
let PACK_CACHE = null;
export function allPacks() {
  const n = Object.keys(CATALOG).length;
  if (PACK_CACHE && PACK_CACHE.n === n) return PACK_CACHE.list;
  const start = new Set(CONFIG.starterPantry);
  const list = [];
  for (const cat of ['normal', 'fantasy', 'xian', 'fairy', 'demon', 'heaven']) for (const g of PACK_GROUPS) {
    const ids = Object.keys(CATALOG).filter((id) => CATALOG[id].category === cat && g.cls.includes(CATALOG[id].cls) && !start.has(id))
      .sort((a, b) => CATALOG[a].row - CATALOG[b].row || CATALOG[a].col - CATALOG[b].col);
    let k = 0;
    for (let i = 0; i < ids.length; i += CONFIG.packSize) {
      const items = ids.slice(i, i + CONFIG.packSize);
      const last = list[list.length - 1];
      if (items.length < 3 && last && last.cat === cat && last.group === g.id) { last.items.push(...items); continue; }
      k += 1;
      list.push({
        id: `${cat}_${g.id}_${k}`, cat, group: g.id, n: k, items,
        name: `${cat === 'normal' ? '동네' : WORLDS[cat].name} ${g.name}${k > 1 ? ` ${k}호` : ''}`,
        price: Math.round((CONFIG.packPrice[cat] * 1.5 ** (k - 1)) / 10) * 10,
      });
    }
  }
  PACK_CACHE = { n, list };
  return list;
}
export const packOf = (id) => allPacks().find((p) => p.id === id);
// 살 수 있나: 세계가 열렸고, 같은 묶음 앞 꾸러미를 샀어야 한다
export function packState(s, p) {
  if ((s.packs || {})[p.id]) return 'owned';
  if (p.cat !== 'normal' && !s.unlocked.includes(p.cat)) return 'locked';
  if (p.n > 1 && !(s.packs || {})[`${p.cat}_${p.group}_${p.n - 1}`]) return 'later';
  return 'open';
}
export const packDiscount = (s) => (s.perks?.merchant ? 0.8 : 1);
export const packPriceFor = (s, p) => Math.round((p.price * packDiscount(s)) / 10) * 10;
export function buyPack(s, id) {
  const p = packOf(id);
  if (!p) return { ok: false, reason: '모르는 거래처예요' };
  const st = packState(s, p);
  if (st === 'owned') return { ok: false, reason: '이미 거래 중이에요' };
  if (st === 'locked') return { ok: false, reason: `${WORLDS[p.cat].name} 문이 열려야 해요` };
  if (st === 'later') return { ok: false, reason: '같은 거래처의 앞 꾸러미부터 사요' };
  const price = packPriceFor(s, p);
  if (s.money < price) return { ok: false, reason: `${price}G가 모자라요` };
  s.money -= price;
  (s.packs ||= {})[id] = s.day;
  const added = addToPantry(s, p.items);
  const ev = [{ type: 'packBought', id, name: p.name, added }];
  checkAchievements(s, ev);
  return { ok: true, price, added, ev };
}
// 재료를 파는 꾸러미 (단서에서 "어디서 사나" 알려 줄 때)
export const packSelling = (id) => allPacks().find((p) => p.items.includes(id)) || null;

// ---------- 시제품 실험 ----------
export const labCost = (s, a, b) => {
  const base = CONFIG.lab.base + CONFIG.lab.costMult * ((ingredientInfo(a)?.cost || 0) + (ingredientInfo(b)?.cost || 0));
  return Math.round(base * (hasTrait(s, 'research') ? 0.6 : 1));
};
// 기본 메뉴와 같은 짝이면 그 메뉴
export function baseMenuFor(a, b) {
  const k = pairKey(a, b);
  return Object.keys(MENUS).find((id) => !MENUS[id].custom && MENUS[id].ingredients.length === 2 && pairKey(...MENUS[id].ingredients) === k) || null;
}
export function experiment(s, x, y) {
  if (!x || !y || x === y) return { ok: false, reason: '서로 다른 재료 두 개를 골라 주세요' };
  if (!CATALOG[x] || !CATALOG[y]) return { ok: false, reason: '모르는 재료예요' };
  if (!inPantry(s, x) || !inPantry(s, y)) return { ok: false, reason: '창고에 없는 재료예요. 거래처에서 들여와요' };
  if (!worldOpen(s, x) || !worldOpen(s, y)) return { ok: false, reason: '아직 문이 안 열린 세계 재료예요' };
  const r = evaluate(x, y);
  const base = baseMenuFor(x, y);
  if (base) return { ok: true, known: true, base, result: r, cost: 0, ev: [] };
  s.tried ||= {};
  if (s.tried[r.key]) return { ok: true, known: true, result: r, cost: 0, ev: [] };
  const cost = labCost(s, x, y);
  if (s.money < cost) return { ok: false, reason: `실험비 ${cost}G가 모자라요` };
  s.money -= cost;
  s.tried[r.key] = { day: s.day, q: r.q, name: r.name, dish: r.dish, special: r.special };
  s.totals.experiments = (s.totals.experiments || 0) + 1;
  const ev = [{ type: 'experiment', key: r.key, stars: r.stars, special: r.special, name: r.name }];
  missionProgress(s, ev, { lab: 1 });
  if (r.stars >= 4 || r.special) { s.week ||= { sales: 0, served: 0, found: [], start: s.day }; s.week.found.push(r.name); }
  if (r.special) {
    s.ideas = (s.ideas || 0) + CONFIG.ideas.special;
    s.totals.specials = (s.totals.specials || 0) + 1;
    s.clues = (s.clues || []).filter((c) => c.key !== r.key);
    ev.push({ type: 'specialFound', key: r.key, name: r.name, effect: r.effect, ideas: CONFIG.ideas.special });
  }
  checkAchievements(s, ev);
  return { ok: true, result: r, cost, ev };
}
function makeRecipe(r, day) {
  const T = CONFIG.kindTime[r.kind] || [12, 30];
  const cost = (ingredientInfo(r.a)?.cost || 0) + (ingredientInfo(r.b)?.cost || 0);
  return {
    custom: true, key: r.key, dish: r.dish, name: r.name, world: r.world, ingredients: [r.a, r.b],
    q: r.q, taste: r.stars, kind: r.kind, tags: r.tags, cls: r.cls, hearty: r.hearty, effect: r.effect, special: r.special,
    price: Math.max(8, Math.round(cost * 1.6 + r.q * 0.3 - 4)), cookMin: T[0], eatMin: T[1],
    color: WORLD_COLORS[r.world] || '#ccc', madeDay: day,
  };
}
// 실험한 짝을 메뉴로 만든다. 칸이 남으면 바로 메뉴판에 올라간다.
export function addRecipe(s, key) {
  const [a, b] = key.split('+');
  if (!(s.tried || {})[key]) return { ok: false, reason: '먼저 실험해 보세요' };
  const r = evaluate(a, b);
  if (!r) return { ok: false, reason: '모르는 재료예요' };
  const id = recipeIdOf(a, b);
  s.recipes ||= {};
  if (s.recipes[id]) return { ok: false, reason: '이미 메뉴로 만들었어요', id };
  ensureIngredient(a); ensureIngredient(b);
  s.recipes[id] = makeRecipe(r, s.day);
  MENUS[id] = s.recipes[id];
  (s.dishBook ||= {})[r.dish] ||= s.day;
  const ev = [{ type: 'recipeMade', id, taste: r.stars, special: r.special }];
  const on = toggleMenu(s, id).ok;
  checkAchievements(s, ev);
  return { ok: true, id, onSale: on, recipe: s.recipes[id], ev };
}
// 예전 함수 이름: 실험하고 바로 메뉴로 (테스트·자동 진행용)
export function develop(s, a, b) {
  const e = experiment(s, a, b);
  if (!e.ok) return e;
  if (e.base) return { ok: false, reason: `이미 있는 메뉴예요: ${MENUS[e.base].name}`, menu: e.base };
  const r = addRecipe(s, e.result.key);
  if (!r.ok) return { ...r, ok: false };
  return { ok: true, id: r.id, recipe: r.recipe, cost: e.cost, ev: [...e.ev, ...r.ev] };
}
// 다른 판에서 만든 메뉴가 섞이지 않게, 저장에 든 개발 메뉴를 MENUS에 다시 올린다
export function registerRecipes(s) {
  for (const id of Object.keys(MENUS)) if (MENUS[id].custom && !(s.recipes || {})[id]) delete MENUS[id];
  for (const [id, r] of Object.entries(s.recipes || {})) {
    r.ingredients.forEach(ensureIngredient);
    MENUS[id] = r;
  }
}

// ---------- 단서 ----------
// 아직 못 찾은 전설의 조합을 하나 골라 반쯤 알려 준다. by: 알려 준 손님 종류(없으면 연구)
function clueFor(s, sp, by) {
  const [x, y] = inPantry(s, sp.b) && !inPantry(s, sp.a) ? [sp.b, sp.a] : [sp.a, sp.b];
  const X = CATALOG[x], Y = CATALOG[y];
  const where = inPantry(s, y) ? '창고에 이미 있어요' : packSelling(y) ? `거래처 '${packSelling(y).name}'에서 팔아요` : '어디서 구하는지는 몰라요';
  const flavor = Y.tags[0] ? `${Y.tags[0]} 나는 ` : '';
  return { key: pairKey(sp.a, sp.b), day: s.day, by: by || null, known: x, text: `${X.name}에 ${flavor}${CLS_NAME[Y.cls]}를 더하면 이름난 요리가 된대요. (${where})` };
}
function pickSpecialForClue(s, prefer) {
  const known = new Set([...(s.clues || []).map((c) => c.key), ...Object.keys(s.tried || {})]);
  let cands = SPECIALS.filter((sp) => !known.has(pairKey(sp.a, sp.b)) && worldOpen(s, sp.a) && worldOpen(s, sp.b));
  if (prefer) { const p = cands.filter(prefer); if (p.length) cands = p; }
  // 창고에 하나라도 있는 것부터
  const near = cands.filter((sp) => inPantry(s, sp.a) || inPantry(s, sp.b));
  if (near.length) cands = near;
  return cands.length ? pick(s, cands) : null;
}
// 단서 값: 살 때마다 1씩 오른다 (최대 +4)
export const clueCost = (s) => CONFIG.lab.clueIdeas + Math.min(4, s.cluesBought || 0) - (s.perks?.student ? 1 : 0);
export function buyClue(s) {
  const n = clueCost(s);
  if ((s.ideas || 0) < n) return { ok: false, reason: `아이디어 ${n}개가 필요해요` };
  const sp = pickSpecialForClue(s);
  if (!sp) return { ok: false, reason: '지금 열린 세계의 전설 조합은 모두 찾았거나 단서가 있어요' };
  s.ideas -= n;
  s.cluesBought = (s.cluesBought || 0) + 1;
  const c = clueFor(s, sp, null);
  (s.clues ||= []).push(c);
  return { ok: true, clue: c, ev: [{ type: 'clue', clue: c }] };
}
function guestClue(s, g, ev) {
  const T = GUESTS[g.type].taste?.tags || {};
  const sp = pickSpecialForClue(s, (x) => { const r = evaluate(x.a, x.b); return r && r.tags.some((t) => (T[t] || 0) > 0); });
  if (!sp) return null;
  const c = clueFor(s, sp, g.type);
  (s.clues ||= []).push(c);
  ev.push({ type: 'clue', clue: c, guest: g.type, sprite: g.sprite, x: g.x, y: g.y });
  return c;
}

// ---------- 개량 ----------
export function upgradeCost(s, id) {
  const n = ((s.upgrades || {})[id] || []).length, U = CONFIG.upgrade;
  return { ideas: U.ideasBase + n, gold: U.goldBase * (n + 1), n };
}
// 미리 보기: 이 재료로 이 방향 개량을 하면? (실제로 하기 전엔 맛 변화는 '?'로 보여 준다)
export function upgradeMenu(s, id, dir, ing = null) {
  if (!MENUS[id] || !availableMenus(s).includes(id)) return { ok: false, reason: '없는 메뉴예요' };
  const D = UPGRADE_DIRS[dir];
  if (!D) return { ok: false, reason: '모르는 개량이에요' };
  const ups = ((s.upgrades ||= {})[id] ||= []);
  if (ups.length >= CONFIG.upgrade.max) return { ok: false, reason: `개량은 ${CONFIG.upgrade.max}번까지예요` };
  if (dir === 'technique' && ups.some((u) => u.dir === 'technique')) return { ok: false, reason: '조리법은 이미 고쳤어요' };
  if (dir !== 'technique') {
    if (!ing || !inPantry(s, ing)) return { ok: false, reason: '창고에서 재료를 골라요' };
    if (MENUS[id].ingredients.includes(ing)) return { ok: false, reason: '이미 들어간 재료예요' };
    if (ups.some((u) => u.ing === ing)) return { ok: false, reason: '이미 넣어 본 재료예요' };
    if (!canUseFor(dir, ing)) return { ok: false, reason: `${D.name}엔 ${dir === 'premium' ? '세계 재료' : D.cls.map((c) => CLS_NAME[c]).join('·')}가 필요해요` };
  }
  const cost = upgradeCost(s, id);
  if ((s.ideas || 0) < cost.ideas) return { ok: false, reason: `아이디어 ${cost.ideas}개가 필요해요` };
  if (s.money < cost.gold) return { ok: false, reason: `${cost.gold}G가 모자라요` };
  s.ideas -= cost.ideas;
  s.money -= cost.gold;
  const before = menuStats(s, id);
  let dq = 0, why = '손에 익어 빨라졌어요';
  if (dir !== 'technique') {
    const fit = upgradeFit(before.tags, before.kind, ing);
    dq = dir === 'flavor' ? Math.round(fit.v * 0.7) : dir === 'hearty' ? Math.round(fit.v / 3) : Math.round(fit.v / 2) + 2;
    why = fit.why;
  }
  ups.push({ dir, ing, dq, why, day: s.day });
  const after = menuStats(s, id);
  s.totals.upgrades = (s.totals.upgrades || 0) + 1;
  const ev = [{ type: 'upgraded', id, dir, dq, why }];
  checkAchievements(s, ev);
  return { ok: true, before, after, dq, why, ev };
}

// ---------- 유행 ----------
// trend = { kind: 'ingredient' | 'world', id, startDay, endDay, news }
export function trendLabel(t) {
  if (!t) return '';
  return t.kind === 'world' ? `${WORLDS[t.id].name} 재료` : (ingredientInfo(t.id)?.name || t.id);
}
export function isTrending(s, menuId) {
  const t = s.trend;
  if (!t || !MENUS[menuId]) return false;
  const ings = MENUS[menuId].ingredients;
  return t.kind === 'world' ? ings.some((i) => ingredientInfo(i)?.world === t.id) : ings.includes(t.id);
}
// 지금 가게에서 실제로 팔 수 있는 것만 유행이 된다
export function trendCandidates(s) {
  const menus = availableMenus(s);
  const ings = [...new Set(menus.flatMap((id) => MENUS[id].ingredients))];
  const worlds = [...new Set(ings.map((i) => ingredientInfo(i)?.world))].filter((w) => WORLDS[w]);
  const out = ings.map((id) => ({ kind: 'ingredient', id, w: 1 }));
  // 세계가 둘 이상 팔려야 세계 유행이 뜻이 있다 ('일반'은 세계 유행이 없다)
  if (worlds.length > 1) worlds.forEach((id) => out.push({ kind: 'world', id, w: CONFIG.trend.worldWeight * ings.length / worlds.length }));
  return out;
}
function pickTrend(s, prev) {
  let cands = trendCandidates(s);
  if (prev && cands.length > 1) cands = cands.filter((c) => !(c.kind === prev.kind && c.id === prev.id));
  if (!cands.length) return null;
  const c = pickWeighted(s, cands.map((x) => [x, x.w]));
  const t = { kind: c.kind, id: c.id };
  t.news = pick(s, TREND_NEWS).replace('{x}', trendLabel(t));
  return t;
}
export function rollTrend(s, ev = []) {
  const next = s.nextTrend || pickTrend(s, s.trend);
  s.nextTrend = null;
  if (!next) { s.trend = null; return ev; }
  s.trend = { ...next, startDay: s.day, endDay: s.day + CONFIG.trend.days - 1 };
  ev.push({ type: 'trendStart', trend: { ...s.trend } });
  return ev;
}
// 유행이 끝나기 이틀 전에 다음 유행을 미리 정해 소문을 낸다
function maybeTeaseTrend(s, ev) {
  const t = s.trend;
  if (!t || s.nextTrend || s.day < t.endDay - 1) return;
  s.nextTrend = pickTrend(s, t);
  if (s.nextTrend) ev.push({ type: 'trendTeaser', trend: { ...s.nextTrend } });
}

// ---------- 날씨, 평론가 ----------
export const weatherOf = (s) => WEATHER.find((w) => w.id === s.weather) || WEATHER[0];
function rollDayEvents(s) {
  const opts = WEATHER.filter((w) => !w.minRep || s.rep >= w.minRep);
  s.weather = s.day === 1 ? 'sunny' : pickWeighted(s, opts.map((w) => [w.id, w.w]));
  const c = CONFIG.critic;
  s.critic = s.day >= c.fromDay && rand(s) < c.chance ? { at: c.from + Math.floor(rand(s) * (c.to - c.from)), done: false } : null;
}
export function peakMult(clock) {
  for (const [a, b, m] of CONFIG.peaks) if (clock >= a && clock < b) return m;
  return 1;
}

// ---------- 게임 달력 ----------
// 1년 차 4월 1일부터, 한 달은 30일.
export function calendar(day) {
  const d = day - 1, m = Math.floor(d / 30);
  return { year: 1 + Math.floor((m + 3) / 12), month: ((m + 3) % 12) + 1, date: (d % 30) + 1 };
}

// ---------- 직원 ----------
const S = CONFIG.staff;
function hasTrait(s, t) { return [...(s.cooks || []), ...(s.servers || [])].some((x) => x.trait === t); }
const traitOf = (role, seed) => { const ks = Object.keys(TRAITS[role]); return ks[seed % ks.length]; };
// 요리사 특기에 따른 조리 시간 배수
function cookTraitMult(c, st) {
  if (c.trait === 'baker' && (st.kind === 'dessert' || st.kind === 'bread')) return 0.7;
  if (c.trait === 'spicy' && st.tags.includes('매운맛')) return 0.8;
  if (c.trait === 'quick') return 0.85;
  return 1;
}
// 가게 직원 특기가 손님 만족에 주는 덤
function staffBonus(s, g, m) {
  let v = 0;
  if (hasTrait(s, 'baker') && (m.kind === 'dessert' || m.kind === 'bread')) v += 4;
  if (hasTrait(s, 'spicy') && (m.tags || []).includes('매운맛')) v += 6;
  if (hasTrait(s, 'host') && (s.bonds?.[g.sprite] || 0) >= 5) v += 4;
  return v;
}
export const staffLevel = (exp) => { let lv = 1; S.expToLevel.forEach((t, i) => { if (exp >= t) lv = i + 1; }); return lv; };
export const staffWage = (role, lv) => S.wage[role] + S.wagePerLevel * (lv - 1);
function makeStaff(s, role, { sprite, name, lv = 1, trait = null }) {
  const map = getMap();
  const list = role === 'cook' ? s.cooks : s.servers;
  const spots = role === 'cook' ? map.cookSpots : map.serverHomes;
  const slot = spots.findIndex((_, i) => !list.some((x) => x.slot === i));
  const p = spots[slot];
  const base = { id: s.nextId++, role, name, sprite, lv, exp: S.expToLevel[lv - 1], slot, x: p.x, y: p.y, face: 1, trait: trait || traitOf(role, sprite + name.length) };
  return role === 'cook'
    ? { ...base, state: 'idle', order: null, timer: 0 }
    : { ...base, path: [], state: 'idle', carry: null };
}
function rollCandidates(s) {
  const used = { cook: s.cooks.map((c) => c.sprite), server: s.servers.map((c) => c.sprite) };
  const names = new Set([...s.cooks, ...s.servers].map((x) => x.name));
  const out = [];
  for (let i = 0; i < S.candidatesPerDay; i++) {
    const role = rand(s) < 0.5 ? 'cook' : 'server';
    const rows = role === 'cook' ? SPRITES.chef.rows : SPRITES.server.rows;
    const free = Array.from({ length: rows }, (_, k) => k).filter((k) => !used[role].includes(k) && !out.some((c) => c.role === role && c.sprite === k));
    if (!free.length) continue;
    const lvMax = Math.min(4, 1 + Math.floor(s.rep / 100));
    const lv = 1 + Math.floor(rand(s) * lvMax);
    const freeNames = STAFF_NAMES.filter((n) => !names.has(n) && !out.some((c) => c.name === n));
    const name = freeNames.length ? pick(s, freeNames) : `${pick(s, STAFF_NAMES)} ${i + 2}`;
    const trait = pick(s, Object.keys(TRAITS[role]));
    out.push({ id: `c${s.day}_${i}`, role, sprite: pick(s, free), name, lv, trait, wage: staffWage(role, lv), fee: staffWage(role, lv) * S.hireFeeDays });
  }
  s.candidates = out;
}
export function hire(s, candId) {
  const c = (s.candidates || []).find((x) => x.id === candId);
  if (!c) return { ok: false, reason: '이미 다른 가게로 갔어요' };
  const full = c.role === 'cook' ? s.cooks.length >= S.maxCooks : s.servers.length >= S.maxServers;
  if (full) return { ok: false, reason: c.role === 'cook' ? '화덕이 다 찼어요' : '종업원 자리가 다 찼어요' };
  if (s.money < c.fee) return { ok: false, reason: `계약금 ${c.fee}G가 모자라요` };
  s.money -= c.fee;
  const st = makeStaff(s, c.role, c);
  (c.role === 'cook' ? s.cooks : s.servers).push(st);
  s.candidates = s.candidates.filter((x) => x !== c);
  const ev = [{ type: 'hired', staff: { ...st } }];
  checkAchievements(s, ev);
  return { ok: true, staff: st, ev };
}
export function fire(s, staffId) {
  for (const key of ['cooks', 'servers']) {
    const i = s[key].findIndex((x) => x.id === staffId);
    if (i < 0) continue;
    if (s[key].length <= 1) return { ok: false, reason: key === 'cooks' ? '요리사는 한 명은 있어야 해요' : '종업원은 한 명은 있어야 해요' };
    const st = s[key][i];
    if (st.order) s.queue.unshift(st.order);   // 만들던 음식은 다른 요리사에게
    if (st.carry) s.ready.unshift(st.carry);   // 나르던 음식은 다시 내놓는다
    s[key].splice(i, 1);
    return { ok: true, staff: st };
  }
  return { ok: false, reason: '없는 직원이에요' };
}
export const trainCost = (st) => CONFIG.training.costPerLevel * staffLevel(st.exp);
export function trainStaff(s, staffId) {
  const st = [...s.cooks, ...s.servers].find((x) => x.id === staffId);
  if (!st) return { ok: false, reason: '없는 직원이에요' };
  if (st.trainedDay === s.day) return { ok: false, reason: '오늘은 이미 연수를 받았어요' };
  if (staffLevel(st.exp) >= CONFIG.staff.expToLevel.length) return { ok: false, reason: '이미 최고 레벨이에요' };
  const cost = trainCost(st);
  if (s.money < cost) return { ok: false, reason: `연수비 ${cost}G가 모자라요` };
  s.money -= cost;
  st.trainedDay = s.day;
  const ev = [];
  gainExp(s, st, ev, CONFIG.training.exp);
  return { ok: true, cost, ev };
}
function gainExp(s, st, ev, n = 1) {
  const before = staffLevel(st.exp);
  st.exp += n;
  const after = staffLevel(st.exp);
  if (after > before) { st.lv = after; ev.push({ type: 'staffLevel', staff: { id: st.id, name: st.name, role: st.role, lv: after } }); }
}

// ---------- 기록, 업적 ----------
export function stats(s) {
  const visits = s.totals.visits || {};
  return {
    served: s.totals.served,
    fiveStars: s.totals.fiveStars || 0,
    regulars: Object.values(visits).filter((n) => n >= 3).length,
    faces: Object.keys(visits).length,
    trendSold: s.totals.trendSold || 0,
    staff: s.cooks.length + s.servers.length,
    recipes: Object.keys(s.recipes || {}).length,
    bestSales: s.totals.bestSales || 0,
    criticFive: s.totals.criticFive || 0,
    tables: s.tables ?? 6,
    rankTop: s.rank?.best === 1 ? 1 : 0,
    contestWins: s.totals.contestWins || 0,
    experiments: s.totals.experiments || 0,
    specials: s.totals.specials || 0,
    upgrades: s.totals.upgrades || 0,
    pantry: (s.pantry || []).length,
    requests: s.totals.requests || 0,
    topWins: s.totals.topWins || 0,
    dishes: Object.keys(s.dishBook || {}).length,
    parties: s.totals.parties || 0,
    vipWins: s.totals.vipWins || 0,
    missions: s.totals.missions || 0,
    festivalSold: s.totals.festivalSold || 0,
    grade: gradeOf(s.rep) + 1,
    goals: s.goalIdx || 0,
    customSold: Object.keys(s.recipes || {}).reduce((a, id) => a + (s.totals.sold?.[id] || 0), 0),
    packs: Object.keys(s.packs || {}).length,
    worlds: s.unlocked.length,
    zone: s.zone || 0,
    contestBest: s.totals.contestPodium ? 1 : 0,
    league: s.league || 0,
  };
}
export function checkAchievements(s, ev = []) {
  s.achieved ||= {};
  checkGoals(s, ev);
  const st = stats(s);
  for (const a of ACHIEVEMENTS) {
    if (s.achieved[a.id] || (st[a.stat] || 0) < a.goal) continue;
    s.achieved[a.id] = s.day;
    s.money += a.reward;
    ev.push({ type: 'achievement', id: a.id, name: a.name, reward: a.reward });
  }
  return ev;
}

// ---------- 상태 ----------
const freshDay = (rep) => ({ sales: 0, tips: 0, cost: 0, wages: 0, served: 0, angry: 0, trendSold: 0, cooked: 0, delivered: 0, repStart: rep, sold: {}, faces: {} });

export function createGame(seed = 1) {
  const s = {
    v: CONFIG.saveVersion,
    rng: seed | 0 || 1,
    day: 1, clock: CONFIG.openMin, phase: 'open',
    money: CONFIG.startMoney, rep: 0, unlocked: ['fantasy'],
    nextId: 1,
    seats: [],
    guests: [], queue: [], ready: [],
    cooks: [], servers: [],
    candidates: [],
    today: freshDay(0),
    totals: { served: 0, sold: {}, visits: {}, fiveStars: 0, trendSold: 0, bestSales: 0, criticFive: 0, experiments: 0, specials: 0, upgrades: 0 },
    history: [],
    recipes: {},
    achieved: {},
    offMenus: [],
    trend: null, nextTrend: null,
    weather: 'sunny', critic: null,
    tutorial: 0,
    log: [],
    lastSummary: null,
    tables: CONFIG.tables.start, decor: {}, promo: null,
    zone: 0, tablePos: START_TABLES.map((t) => ({ ...t })), equip: {}, annexWorld: null,
    ideas: CONFIG.ideas.start, menuExp: {}, weekSales: 0,
    rank: null, contestLast: null,
    pantry: [...CONFIG.starterPantry], packs: {}, tried: {}, clues: [], upgrades: {},
    onSale: Object.keys(MENUS).filter((id) => !MENUS[id].custom && MENUS[id].world === 'fantasy'),
    menuSlots: CONFIG.menuSlots.start, bonds: {}, perks: {},
    requests: {}, decorUnlocked: {}, invited: {}, contestTheme: null, contestPick: null, themesSeen: [], league: 0,
    goalIdx: 0, missions: [], dishBook: {}, papers: [], week: null, vip: null, lastVip: 0, yesterdaySold: {},
  };
  setLayout(s);
  s.cooks.push(makeStaff(s, 'cook', { sprite: 0, name: STAFF_NAMES[0] }));
  s.servers.push(makeStaff(s, 'server', { sprite: 0, name: STAFF_NAMES[1] }));
  rollDayEvents(s);
  rollCandidates(s);
  registerRecipes(s);
  contestTheme(s);
  rollMissions(s);
  return s;
}

// 옛 저장(1판)을 지금 모양으로 옮긴다. 이미 지금 모양이면 빠진 칸만 채운다.
export function migrate(s) {
  if (!s) return s;
  // 1.0 이전 가게: 넓은 홀에 탁자가 정해진 자리에 있었다
  if (!s.tablePos) {
    if (s.tables === undefined) { s.tables = LEGACY_TABLES.length; s.decor = { ...SHOP_ART.pots }; }
    s.zone = 1;
    s.tablePos = LEGACY_TABLES.slice(0, s.tables).map((t) => ({ ...t }));
    s.decor ||= {};
    s.equip ||= {};
  }
  s.zone ??= 1; s.equip ||= {}; s.decor ||= {};
  setLayout(s);
  // 새 지도에 없는 자리에 앉아 있던 손님은 보낸다 (있는 자리 손님은 그대로)
  if (s.guests) {
    const ok = new Set(s.seats.map((p) => `${p.x},${p.y}`));
    const gone = new Set(s.guests.filter((g) => g.state !== 'leaving' && g.seat && !ok.has(`${g.seat.x},${g.seat.y}`)).map((g) => g.id));
    s.guests = s.guests.filter((g) => !gone.has(g.id));
    s.queue = (s.queue || []).filter((o) => !gone.has(o.guest));
    s.ready = (s.ready || []).filter((o) => !gone.has(o.guest));
    for (const p of s.seats) if (gone.has(p.guest)) p.guest = null;
  }
  const map = getMap();
  if (!s.cooks) {
    s.cooks = [{ id: s.nextId++, role: 'cook', name: STAFF_NAMES[0], sprite: 0, lv: 1, exp: 0, slot: 0, x: map.cookSpots[0].x, y: map.cookSpots[0].y, face: 1, state: 'idle', order: null, timer: 0 }];
    if (s.cook?.order) s.queue.unshift(s.cook.order);
    delete s.cook;
  }
  if (!s.servers) {
    const h = map.serverHomes[0];
    s.servers = [{ id: s.nextId++, role: 'server', name: STAFF_NAMES[1], sprite: 0, lv: 1, exp: 0, slot: 0, x: h.x, y: h.y, face: 1, path: [], state: 'idle', carry: null }];
    if (s.server?.carry) s.ready.unshift(s.server.carry);
    delete s.server;
  }
  s.totals ||= { served: 0, sold: {} };
  for (const k of ['fiveStars', 'trendSold', 'bestSales', 'criticFive', 'contestWins']) s.totals[k] ||= 0;
  // 0.8 이전 판: 이미 탁자 6개와 화분 3개가 있던 가게라 그대로 준다
  s.menuExp ||= {}; s.weekSales ||= 0;
  if (s.ideas === undefined) s.ideas = CONFIG.ideas.start;
  if (s.promo === undefined) s.promo = null;
  if (s.rank === undefined) s.rank = null;
  s.totals.visits ||= {};
  s.history ||= []; s.recipes ||= {}; s.achieved ||= {};
  s.candidates ||= [];
  if (s.weather === undefined) s.weather = 'sunny';
  if (s.critic === undefined) s.critic = null;
  if (s.tutorial === undefined) s.tutorial = 3; // 옛 판은 길잡이를 건너뛴다
  if (s.today) { s.today.wages ||= 0; s.today.faces ||= {}; }
  // 가게 지도가 바뀌었으면 손님 자리와 직원 위치를 새 가게에 맞춘다 (돈·평판·기록은 그대로)
  const seatKey = (arr) => arr.map((p) => `${p.x},${p.y}`).join(' ');
  if (!s.seats || seatKey(s.seats) !== seatKey(map.seats)) {
    s.seats = map.seats.map((p) => ({ x: p.x, y: p.y, guest: null }));
    s.guests = []; s.queue = []; s.ready = [];
    s.cooks.forEach((c, i) => { c.slot = i; Object.assign(c, map.cookSpots[i], { state: 'idle', order: null, timer: 0 }); });
    s.servers.forEach((v, i) => { v.slot = i; Object.assign(v, map.serverHomes[i], { path: [], state: 'idle', carry: null }); });
  }
  // 3판: 재료 창고, 연구 노트, 메뉴 칸, 개량. 옛 개발 메뉴는 새 판정으로 다시 만든다 (판매 기록은 이어 간다).
  if (!s.pantry) {
    s.pantry = [...CONFIG.starterPantry];
    s.packs = {}; s.tried = {}; s.clues = []; s.upgrades = {}; s.bonds ||= {}; s.perks ||= {};
    const old = s.recipes || {};
    s.recipes = {};
    const off = new Set(s.offMenus || []);
    const onSaleOld = [...Object.keys(MENUS).filter((id) => !MENUS[id].custom), ...Object.keys(old)].filter((id) => !off.has(id));
    const rename = {};
    for (const [oid, r] of Object.entries(old)) {
      const [a, b] = r.ingredients || [];
      addToPantry(s, [a, b]);
      const ev = a && b && CATALOG[a] && CATALOG[b] ? evaluate(a, b) : null;
      if (!ev) { s.recipes[oid] = r; continue; }
      const nid = recipeIdOf(a, b);
      s.tried[ev.key] = { day: r.madeDay || s.day, q: ev.q, name: ev.name, dish: ev.dish, special: ev.special };
      s.recipes[nid] = makeRecipe(ev, r.madeDay || s.day);
      rename[oid] = nid;
      for (const k of ['menuExp']) if (s[k]?.[oid] != null) { s[k][nid] = s[k][oid]; delete s[k][oid]; }
      if (s.totals.sold?.[oid] != null) { s.totals.sold[nid] = s.totals.sold[oid]; delete s.totals.sold[oid]; }
    }
    registerRecipes(s);
    renameMenuRefs(s, rename);
    const av = new Set(availableMenus(s));
    const wanted = onSaleOld.map((id) => rename[id] || id).filter((id) => av.has(id));
    s.menuSlots = Math.min(CONFIG.menuSlots.start + CONFIG.menuSlots.prices.length, Math.max(CONFIG.menuSlots.start, wanted.length));
    s.onSale = wanted.slice(0, s.menuSlots);
    // 이미 연 세계의 메뉴 재료는 창고에
    for (const w of s.unlocked) addToPantry(s, Object.values(MENUS).filter((m) => !m.custom && m.world === w).flatMap((m) => m.ingredients));
    delete s.offMenus;
  }
  s.bonds ||= {}; s.perks ||= {}; s.clues ||= []; s.tried ||= {}; s.packs ||= {}; s.upgrades ||= {};
  for (const x of [...s.cooks, ...s.servers]) x.trait ||= traitOf(x.role, x.sprite + (x.name || '').length);
  for (const c of s.candidates) c.trait ||= traitOf(c.role, c.sprite);
  for (const k of ['experiments', 'specials', 'upgrades', 'requests']) s.totals[k] ||= 0;
  s.requests ||= {}; s.decorUnlocked ||= {}; s.invited ||= {}; s.themesSeen ||= [];
  if (s.league === undefined) s.league = Math.min(s.totals.contestWins || 0, CONFIG.contest.leagues.length - 1);
  // 1.2: 목표·미션·요리 도감·신문. 이미 진행한 판은 목표를 지금 상태까지 건너뛴다(보상 없이).
  if (s.goalIdx === undefined) {
    s.goalIdx = 0;
    const st = stats(s);
    while (GOALS[s.goalIdx] && (st[GOALS[s.goalIdx].stat] || 0) >= GOALS[s.goalIdx].goal) s.goalIdx++;
  }
  if (!s.dishBook) { s.dishBook = {}; for (const id of Object.keys(s.totals.sold || {})) if (MENUS[id]?.dish) s.dishBook[MENUS[id].dish] = s.day; }
  s.papers ||= []; s.yesterdaySold ||= {};
  if (!s.missions) rollMissions(s);
  // 0.9 이전 판에서 이미 대회 트로피가 있었다면
  if (s.totals.contestWins) s.decorUnlocked.trophy = true;
  refreshRequests(s, []);
  s.v = CONFIG.saveVersion;
  if (!s.candidates.length) rollCandidates(s);
  registerRecipes(s);
  dropMissingMenus(s);
  return s;
}

// 메뉴 id가 바뀌면 진행 중인 모든 참조(주문 대기, 조리 중, 완성, 운반 중, 손님, 기록)까지 함께 바꾼다
function renameMenuRefs(s, rename) {
  const r = (id) => rename[id] || id;
  const orders = [...(s.queue || []), ...(s.ready || []), ...(s.cooks || []).map((c) => c.order), ...(s.servers || []).map((v) => v.carry)];
  for (const o of orders) if (o) o.menu = r(o.menu);
  for (const g of s.guests || []) if (g.menu) g.menu = r(g.menu);
  for (const e of s.log || []) if (e.menu) e.menu = r(e.menu);
  const moveKeys = (obj) => { if (!obj) return; for (const [a, b] of Object.entries(rename)) if (obj[a] != null) { obj[b] = (obj[b] || 0) + obj[a]; delete obj[a]; } };
  moveKeys(s.today?.sold);
  if (s.upgrades) for (const [a, b] of Object.entries(rename)) if (s.upgrades[a]) { s.upgrades[b] = s.upgrades[a]; delete s.upgrades[a]; }
  if (s.contestPick) s.contestPick = r(s.contestPick);
  if (s.contestLast?.entry) s.contestLast.entry = r(s.contestLast.entry);
  if (s.lastSummary?.best) s.lastSummary.best = r(s.lastSummary.best);
}
// 그래도 없는 메뉴를 가리키는 진행 중 주문이 있으면 정리한다: 주문은 버리고, 그 손님은 메뉴를 다시 고른다
function dropMissingMenus(s) {
  const ok = (id) => !!MENUS[id];
  s.queue = (s.queue || []).filter((o) => ok(o.menu));
  s.ready = (s.ready || []).filter((o) => ok(o.menu));
  for (const c of s.cooks || []) if (c.order && !ok(c.order.menu)) Object.assign(c, { order: null, state: 'idle', timer: 0 });
  for (const v of s.servers || []) if (v.carry && !ok(v.carry.menu)) { v.carry = null; if (v.state === 'delivering') v.state = 'returning'; }
  for (const g of s.guests || []) {
    if (!g.menu || ok(g.menu)) continue;
    if (g.state === 'waiting' || g.state === 'eating') { g.menu = null; g.state = 'ordering'; g.timer = 1; g.waited = 0; }
    else g.menu = null;
  }
  if (s.contestPick && !ok(s.contestPick)) s.contestPick = null;
}

// 다음 날 문을 연다. 유행·날씨·지원자를 새로 뽑고, 그 사건을 돌려준다.
export function openNextDay(s) {
  const map = getMap();
  const ev = [];
  s.day += 1;
  if (!s.trend || s.day > s.trend.endDay) rollTrend(s, ev);
  maybeTeaseTrend(s, ev);
  rollDayEvents(s);
  rollCandidates(s);
  refreshRequests(s, ev);
  contestTheme(s);
  rollMissions(s);
  const fest = festivalOf(s), c0 = calendar(s.day);
  if (fest && c0.date === 10) ev.push({ type: 'festivalStart', name: fest.name, tag: fest.tag });
  if (c0.date === 7) { const nf = nextFestival(s); if (nf) ev.push({ type: 'festivalNotice', name: nf.name, tag: nf.tag, inDays: nf.inDays }); }
  maybeVip(s, ev);
  if (s.vip?.day === s.day) ev.push({ type: 'vipToday', name: VIPS.find((v) => v.world === s.vip.world)?.name });
  ev.push({ type: 'dayStart', weather: s.weather, critic: !!s.critic, promo: activePromo(s)?.id || null });
  const left = CONFIG.contest.day - calendar(s.day).date;
  if (left >= 0 && left <= CONFIG.contest.notice) ev.push({ type: 'contestNotice', daysLeft: left, entry: contestEntry(s), theme: contestTheme(s).id, chosen: !!s.contestPick });
  s.clock = CONFIG.openMin;
  s.phase = 'open';
  s.today = freshDay(s.rep);
  s.queue = []; s.ready = [];
  for (const c of s.cooks) Object.assign(c, { state: 'idle', order: null, timer: 0 });
  for (const v of s.servers) { const h = map.serverHomes[v.slot]; Object.assign(v, { x: h.x, y: h.y, path: [], state: 'idle', carry: null }); }
  return ev;
}

// ---------- 한 칸 굴리기 ----------
export function tick(s) {
  const ev = [];
  if (s.phase !== 'open') return ev;
  const dt = CONFIG.tickMin;
  if (s.trend === undefined || s.trend === null && s.clock === CONFIG.openMin) rollTrend(s, ev); // 첫날, 또는 옛 저장
  s.clock += dt;
  maybeSpawn(s, ev);
  for (const g of [...s.guests]) updateGuest(s, g, dt, ev);
  for (const c of s.cooks) updateCook(s, c, dt, ev);
  for (const v of s.servers) updateServer(s, v, dt, ev);
  if (s.clock >= CONFIG.closeMin && s.guests.length === 0) endDay(s, ev);
  return ev;
}

const findGuest = (s, id) => s.guests.find((g) => g.id === id);
const freeSeat = (s, g) => { const seat = s.seats.find((p) => p.guest === g.id); if (seat) seat.guest = null; };
const doorPath = (g) => findPath(g, (x, y) => getMap().at(x, y) === 'D') || [];

function spawnGuest(s, type, seat, ev, extra = {}) {
  const door = pick(s, getMap().doors);
  const path = findPath(door, (x, y) => x === seat.x && y === seat.y);
  if (!path) return null;
  path.push({ x: seat.x + 0.5, y: seat.y }); // 두 칸짜리 탁자 가운데 의자로
  const faces = GUESTS[type].sprites;
  const sprite = faces && faces.length ? pick(s, faces) : Math.floor(rand(s) * SPRITES.customers);
  const g = { id: s.nextId++, type, sprite, x: door.x, y: door.y, face: 1, path, state: 'walkIn',
    seat: { x: seat.x, y: seat.y }, menu: null, timer: 0, waited: 0, mood: null, ...extra };
  s.totals.visits ||= {};
  g.visit = s.totals.visits[sprite] = (s.totals.visits[sprite] || 0) + 1;
  seat.guest = g.id;
  s.guests.push(g);
  return g;
}
function maybeSpawn(s, ev) {
  if (s.clock >= CONFIG.lastEntryMin) return;
  const free = s.seats.filter((p) => p.guest === null);
  if (!free.length) return;
  const critic = s.critic && !s.critic.done && s.clock >= s.critic.at;
  const vip = !critic && s.vip && s.vip.day === s.day && !s.vip.arrived && s.clock >= s.vip.at;
  if (!critic && !vip) {
    const fest = festivalOf(s);
    const p = (CONFIG.guestsPerHour / 60) * CONFIG.tickMin * (1 + s.rep * CONFIG.repSpawnBoost) * weatherOf(s).mult * peakMult(s.clock)
      * (1 + Math.min(CONFIG.atmosphere.maxSpawn, atmosphere(s) * CONFIG.atmosphere.spawnPerPoint)) * (activePromo(s)?.mult || 1) * (fest ? 1.25 : 1);
    if (rand(s) >= p) return;
  }
  const types = Object.keys(GUESTS).filter((id) => openWorlds(s).includes(GUESTS[id].world));
  if (!types.length) return;
  const lure = new Set(menusOnSale(s).filter((id) => MENUS[id].effect === 'lure').map((id) => MENUS[id].world));
  const pickType = () => pickWeighted(s, types.map((id) => [id, (GUESTS[id].weight || 1) * (lure.has(GUESTS[id].world) ? 1.8 : 1) * (s.invited?.[GUESTS[id].world] || 1) * (s.perks?.[id] ? 1.5 : 1)]));
  if (vip) {
    const V = VIPS.find((v) => v.world === s.vip.world);
    const g = spawnGuest(s, V.type, pick(s, free), ev, { vip: true });
    if (g) { s.vip.arrived = true; ev.push({ type: 'vipArrive', id: g.id, name: V.name }); }
    return;
  }
  // 둘이 같이 오는 일행: 빈 탁자가 통째로 있으면 가끔
  if (!critic && rand(s) < 0.22) {
    const both = getMap().tables.filter((t) => t.seats.every((k) => free.some((p) => `${p.x},${p.y}` === k)));
    if (both.length) {
      const t = pick(s, both);
      const party = s.nextId++;
      const first = pickType();
      const sameWorld = types.filter((id) => GUESTS[id].world === GUESTS[first].world);
      const seats = t.seats.map((k) => free.find((p) => `${p.x},${p.y}` === k));
      const a = spawnGuest(s, first, seats[0], ev, { party });
      const b = a && spawnGuest(s, pick(s, sameWorld), seats[1], ev, { party });
      if (a && b) { s.totals.parties = (s.totals.parties || 0) + 1; ev.push({ type: 'partyArrive', ids: [a.id, b.id] }); }
      return;
    }
  }
  const g = spawnGuest(s, pickType(), pick(s, free), ev);
  if (g && critic) { g.critic = true; s.critic.done = true; ev.push({ type: 'criticArrive', id: g.id }); }
}

// 손님은 자기가 만족할 것 같은 메뉴를 고른다 (값도 본다). 평론가는 가장 자신 있는 메뉴를 더 노린다.
function chooseMenu(s, g) {
  return pickWeighted(s, menusOnSale(s).map((id) => {
    const { sat } = satisfaction(s, g.type, id);
    let w = Math.exp((sat - 60) / (g.critic || g.vip ? 6 : 11));
    if (isTrending(s, id)) w *= CONFIG.trend.pickBoost;
    const fest = festivalOf(s);
    if (fest && menuStats(s, id).tags.includes(fest.tag)) w *= 2;
    if (g.vip && vipFits(s, id)) w *= 20;
    return [id, w];
  }));
}

function sayLine(s, g, kind) {
  const line = pick(s, GUESTS[g.type].lines[kind]);
  return line.replace('{menu}', g.menu ? MENUS[g.menu].name : '');
}

function pushLog(s, entry) {
  s.log.unshift(entry);
  if (s.log.length > 40) s.log.length = 40;
}

function updateGuest(s, g, dt, ev) {
  switch (g.state) {
    case 'walkIn':
      if (advance(g, CONFIG.guestWalkPerMin * dt)) { g.state = 'ordering'; g.timer = CONFIG.orderMin; }
      break;
    case 'ordering':
      if ((g.timer -= dt) <= 0) {
        g.menu = chooseMenu(s, g);
        s.queue.push({ id: s.nextId++, guest: g.id, menu: g.menu });
        g.state = 'waiting'; g.waited = 0;
        g.patience = CONFIG.patienceMin + (MENUS[g.menu].effect === 'patience' ? 20 : 0) + (g.vip ? 20 : 0);
        noteWish(s, g, ev);
        ev.push({ type: 'order', id: g.id, menu: g.menu });
      }
      break;
    case 'waiting':
      if ((g.waited += dt) >= (g.patience || CONFIG.patienceMin)) {
        s.queue = s.queue.filter((o) => o.guest !== g.id);
        s.ready = s.ready.filter((o) => o.guest !== g.id);
        s.today.angry += 1;
        applyRep(s, CONFIG.repAngry * (g.critic ? CONFIG.critic.repMult : 1), ev);
        const entry = { day: s.day, guest: g.type, sprite: g.sprite, visit: g.visit, menu: g.menu, rating: 0, critic: !!g.critic, line: sayLine(s, g, 'angry') };
        pushLog(s, entry);
        ev.push({ type: 'review', ...entry, id: g.id, x: g.x, y: g.y });
        g.mood = 'angry';
        leave(s, g);
      }
      break;
    case 'eating':
      if ((g.timer -= dt) <= 0) finishMeal(s, g, ev);
      break;
    case 'leaving':
      if (advance(g, CONFIG.guestWalkPerMin * dt)) s.guests = s.guests.filter((x) => x !== g);
      break;
  }
}

function leave(s, g) {
  freeSeat(s, g);
  g.state = 'leaving';
  g.path = doorPath(g);
}

function finishMeal(s, g, ev) {
  const m = MENUS[g.menu];
  const hot = isTrending(s, g.menu);
  const fest = festivalOf(s);
  const festive = !!(fest && menuStats(s, g.menu).tags.includes(fest.tag));
  const base = Math.round(menuPrice(s, g.menu) * (festive ? 1.15 : 1));
  const price = hot ? Math.round(base * (1 + CONFIG.trend.priceBoost)) : base;
  const judged = satisfaction(s, g.type, g.menu, { waited: g.waited, trend: hot, atmos: seatAtmos(s, g.seat), bonus: staffBonus(s, g, m) + homeDecorBonus(s, GUESTS[g.type].world, g.seat) + annexBonus(s, g) });
  const rating = judged.stars;
  const tipRate = (rating === 5 ? CONFIG.tipRateOnFive : rating === 4 ? CONFIG.tipRateOnFive / 3 : 0) * (m.effect === 'tip' ? 2 : 1) * (hasTrait(s, 'charmer') ? 1.5 : 1);
  let tip = Math.round(price * tipRate);
  // 일행: 둘 다 만족하면 덤 팁
  if (g.party) {
    s.partyMood ||= {};
    const other = s.partyMood[g.party];
    if (other === undefined) s.partyMood[g.party] = rating;
    else {
      delete s.partyMood[g.party];
      if (other >= 4 && rating >= 4) { tip += Math.round(price * 0.3); ev.push({ type: 'partyHappy', x: g.x, y: g.y }); }
    }
  }
  s.money += price + tip;
  s.today.sales += price;
  s.today.tips += tip;
  s.today.served += 1;
  s.today.sold[g.menu] = (s.today.sold[g.menu] || 0) + 1;
  if (hot) { s.today.trendSold += 1; s.totals.trendSold = (s.totals.trendSold || 0) + 1; }
  const f = (s.today.faces[g.sprite] ||= { n: 0, spent: 0, type: g.type });
  f.n += 1; f.spent += price + tip;
  s.totals.served += 1;
  s.totals.sold[g.menu] = (s.totals.sold[g.menu] || 0) + 1;
  s.today.stars ||= {};
  s.today.stars[rating] = (s.today.stars[rating] || 0) + 1;
  if (rating === 5) {
    s.totals.fiveStars = (s.totals.fiveStars || 0) + 1;
    if (s.totals.fiveStars % CONFIG.ideas.fivesPerIdea === 0) { s.ideas = (s.ideas || 0) + 1; ev.push({ type: 'idea', n: 1, x: g.x, y: g.y }); }
    if (m.effect === 'inspire') { s.ideas = (s.ideas || 0) + 1; ev.push({ type: 'idea', n: 1, x: g.x, y: g.y, inspire: true }); }
    // 아주 만족한 손님은 가끔 전설 조합의 단서를 흘린다
    if (rand(s) < 0.03 && s.day - (s.lastGuestClue || -9) >= 3 && (s.clues || []).filter((c) => c.by).length < 2 && guestClue(s, g, ev)) s.lastGuestClue = s.day;
  }
  // 단골의 정: 만족한 식사가 쌓일수록 깊어진다
  const bondGain = (rating >= 5 ? 2 : rating >= 4 ? 1.5 : rating >= 3 ? 1 : -1) * (m.effect === 'charm' ? 2 : 1) * (hasTrait(s, 'host') ? 1.5 : 1);
  s.bonds ||= {};
  s.bonds[g.sprite] = Math.max(0, (s.bonds[g.sprite] || 0) + bondGain);
  if (g.critic && rating === 5) { s.totals.criticFive = (s.totals.criticFive || 0) + 1; s.ideas += CONFIG.ideas.criticFive; }
  s.weekSales = (s.weekSales || 0) + price;
  // 메뉴 레벨
  const lvBefore = menuLevel(s, g.menu);
  s.menuExp[g.menu] = (s.menuExp[g.menu] || 0) + 1;
  const lvAfter = menuLevel(s, g.menu);
  if (lvAfter > lvBefore) ev.push({ type: 'menuLevel', id: g.menu, lv: lvAfter });
  // 단골 선물
  if (rating >= 3 && CONFIG.giftVisits.includes(g.visit)) giveGift(s, g, ev);
  checkRequests(s, g, rating, ev);
  if (festive) s.totals.festivalSold = (s.totals.festivalSold || 0) + 1;
  (s.dishBook ||= {})[m.dish] ||= s.day;
  if (g.vip) vipResult(s, g, rating, ev);
  missionProgress(s, ev, { kind: menuStats(s, g.menu).kind, tags: menuStats(s, g.menu).tags, rating, world: GUESTS[g.type].world, sold: 1 });
  s.week ||= { sales: 0, served: 0, found: [], start: s.day };
  s.week.sales += price; s.week.served += 1;
  applyRep(s, CONFIG.repByRating[rating] * (g.critic ? CONFIG.critic.repMult : 1), ev);
  ev.push({ type: 'coin', x: g.x, y: g.y, amount: price + tip, hot, five: rating === 5 });
  const kind = rating === 5 ? 'great' : rating >= 3 ? 'good' : 'bad';
  const entry = { day: s.day, guest: g.type, sprite: g.sprite, visit: g.visit, menu: g.menu, rating, critic: !!g.critic, line: sayLine(s, g, kind), why: judged.parts.slice(0, 2), sat: judged.sat };
  pushLog(s, entry);
  ev.push({ type: 'review', ...entry, id: g.id, x: g.x, y: g.y });
  g.mood = rating >= 4 ? 'happy' : rating <= 2 ? 'sad' : null;
  checkAchievements(s, ev);
  leave(s, g);
}

// 단골 선물: 5번째엔 재료, 10번째엔 귀한 재료, 20번째엔 전설 조합 단서(사흘에 하나까지), 40번째엔 골드
function giveGift(s, g, ev) {
  let kind = ['ingredient', 'ingredient', 'clue', 'gold'][CONFIG.giftVisits.indexOf(g.visit)] || 'gold';
  if (kind === 'clue' && s.day - (s.lastGuestClue || -9) < 3) kind = 'ingredient';
  const gift = { type: 'gift', kind, sprite: g.sprite, guest: g.type, visit: g.visit, line: GIFT_LINES[kind] || GIFT_LINES.gold, x: g.x, y: g.y };
  if (kind === 'ingredient') {
    // 이 손님이 좋아하는 맛의 재료 중 창고에 없는 것 (손님 고향 세계 재료 먼저)
    const T = GUESTS[g.type].taste?.tags || {};
    const home = GUESTS[g.type].world;
    const pool = Object.keys(CATALOG).filter((id) => !inPantry(s, id) && worldOpen(s, id) && CATALOG[id].tags.some((t) => (T[t] || 0) > 0));
    const rare = g.visit >= 10;
    let cands = pool.filter((id) => CATALOG[id].category === home);
    if (rare) cands = cands.filter((id) => CATALOG[id].category !== 'normal');
    if (!cands.length) cands = pool;
    const pickId = cands.length ? cands[hash(`${g.sprite}|${g.visit}`) % cands.length] : null;
    if (pickId) { addToPantry(s, [pickId]); gift.ingredient = pickId; }
    else { gift.kind = 'ideas'; gift.ideas = 2; s.ideas += 2; gift.line = GIFT_LINES.ideas; }
  } else if (kind === 'clue') {
    const c = guestClue(s, g, []);
    if (c) { gift.clue = c; s.lastGuestClue = s.day; } else { gift.kind = 'ideas'; gift.ideas = 2; s.ideas += 2; gift.line = GIFT_LINES.ideas; }
  } else { gift.gold = 40 + 10 * g.visit; s.money += gift.gold; }
  ev.push(gift);
}

// ---------- 순위, 대회 ----------
export function rivalScore(r, day) { return Math.round(r.base + r.grow * day + (hash(`${r.name}|${day}`) % 21) - 10); }
export const ourScore = (s) => Math.round(s.rep + (s.weekSales || 0) / CONFIG.ranking.salesDiv);
function weeklyRanking(s, ev) {
  const list = [...RIVALS.map((r) => ({ name: r.name, score: rivalScore(r, s.day) })), { name: '우리 가게', score: ourScore(s), me: true }]
    .sort((a, b) => b.score - a.score);
  const pos = list.findIndex((x) => x.me) + 1;
  const prev = s.rank?.pos ?? null;
  s.rank = { pos, best: Math.min(pos, s.rank?.best ?? 99), day: s.day, list };
  s.weekSales = 0;
  ev.push({ type: 'ranking', pos, prev, list });
}
// ---------- 가게 목표 ----------
export const currentGoal = (s) => GOALS[s.goalIdx || 0] || null;
function checkGoals(s, ev) {
  for (let guard = 0; guard < GOALS.length; guard++) {
    const G = currentGoal(s);
    if (!G) return;
    const st = stats(s);
    if ((st[G.stat] || 0) < G.goal) return;
    s.goalIdx = (s.goalIdx || 0) + 1;
    if (G.reward.gold) s.money += G.reward.gold;
    if (G.reward.ideas) s.ideas = (s.ideas || 0) + G.reward.ideas;
    ev.push({ type: 'goalDone', id: G.id, name: G.name, reward: G.reward, next: currentGoal(s)?.name || null });
  }
}
export const goalProgress = (s) => { const G = currentGoal(s); if (!G) return null; return { ...G, have: Math.min(G.goal, stats(s)[G.stat] || 0) }; };

// ---------- 오늘의 미션 ----------
function rollMissions(s) {
  const tier = s.day < 8 ? 0 : s.day < 25 ? 1 : 2;
  const sale = menusOnSale(s).map((id) => menuStats(s, id));
  const kinds = [...new Set(sale.map((m) => m.kind))];
  const tags = [...new Set(sale.flatMap((m) => m.tags))];
  const worlds = s.unlocked.filter((w) => w !== 'fantasy');
  const pool = MISSION_KINDS.filter((k) => !(k.id === 'world' && !worlds.length) && !(k.id === 'sellKind' && !kinds.length) && !(k.id === 'sellTag' && !tags.length));
  const out = [];
  while (out.length < 3 && pool.length) {
    const k = pool.splice(Math.floor(rand(s) * pool.length), 1)[0];
    const x = k.id === 'sellKind' ? pick(s, kinds) : k.id === 'sellTag' ? pick(s, tags) : k.id === 'world' ? pick(s, worlds) : null;
    const n = k.n[tier];
    const ADJ = { 단맛: '달콤한', 상큼: '상큼한', 매운맛: '매운', 고소: '고소한', 감칠: '감칠맛 나는', 향긋: '향긋한', 꽃향: '꽃향 나는', 마력: '마력 깃든' };
    const label = k.id === 'sellKind' ? KIND_NAME[x] : k.id === 'world' ? WORLDS[x].name : k.id === 'sellTag' ? ADJ[x] || x : x;
    const reward = out.length === 1 ? { ideas: tier + 1 } : { gold: [60, 150, 300][tier] };
    out.push({ id: k.id, x, need: n, have: 0, text: k.text.replace('{x}', label).replace('{n}', n), reward, done: false });
  }
  s.missions = out;
}
function missionProgress(s, ev, f) {
  for (const m of s.missions || []) {
    if (m.done) continue;
    if (m.id === 'sellKind' && f.sold && f.kind === m.x) m.have++;
    else if (m.id === 'sellTag' && f.sold && f.tags.includes(m.x)) m.have++;
    else if (m.id === 'five' && f.rating === 5) m.have++;
    else if (m.id === 'served' && f.sold) m.have++;
    else if (m.id === 'world' && f.sold && f.world === m.x && f.rating >= 4) m.have++;
    else if (m.id === 'lab' && f.lab) m.have++;
    else if (m.id === 'sales' && f.salesNow != null) m.have = f.salesNow;
    else if (m.id === 'noAngry' && f.dayEnd) m.have = f.angry === 0 ? 1 : 0;
    if (m.have >= m.need) {
      m.done = true;
      if (m.reward.gold) s.money += m.reward.gold;
      if (m.reward.ideas) s.ideas = (s.ideas || 0) + m.reward.ideas;
      s.totals.missions = (s.totals.missions || 0) + 1;
      ev.push({ type: 'missionDone', text: m.text, reward: m.reward });
    }
  }
}

// ---------- 축제, 귀빈, 바라는 맛 ----------
export function festivalOf(s) {
  const c = calendar(s.day);
  if (c.date < 10 || c.date > 16) return null;
  return FESTIVALS.find((f) => f.month === c.month) || null;
}
export const nextFestival = (s) => { const c = calendar(s.day); const f = FESTIVALS.find((x) => x.month === c.month); return f && c.date < 10 ? { ...f, inDays: 10 - c.date } : null; };
export const vipWant = (s) => VIPS.find((v) => v.world === s.vip?.world)?.want || null;
export function vipFits(s, id) {
  const W = vipWant(s);
  if (!W) return false;
  const st = menuStats(s, id);
  return W.kinds.includes(st.kind) && W.tags.some((t) => st.tags.includes(t));
}
function maybeVip(s, ev) {
  // 다음 날 귀빈 예고
  if (s.vip && s.vip.day >= s.day) return;
  if (s.day < 6 || s.day - (s.lastVip || 0) < 6 || rand(s) >= 0.3) return;
  const opts = VIPS.filter((v) => s.unlocked.includes(v.world));
  const V = pick(s, opts);
  s.vip = { day: s.day + 1, world: V.world, at: 11 * 60 + Math.floor(rand(s) * 360), arrived: false, done: false };
  s.lastVip = s.day + 1;
  ev.push({ type: 'vipNotice', name: V.name, world: V.world, want: V.want });
}
function vipResult(s, g, rating, ev) {
  const V = VIPS.find((v) => v.world === s.vip?.world);
  if (!V || s.vip.done) return;
  s.vip.done = true;
  const fit = vipFits(s, g.menu);
  if (fit && rating >= 4) {
    const gold = 600 + 300 * Math.max(0, VIPS.indexOf(V));
    s.money += gold; s.ideas = (s.ideas || 0) + 3;
    applyRep(s, 10, ev);
    s.totals.vipWins = (s.totals.vipWins || 0) + 1;
    ev.push({ type: 'vipDone', ok: true, name: V.name, gold, menu: g.menu, x: g.x, y: g.y });
  } else ev.push({ type: 'vipDone', ok: false, name: V.name, why: fit ? '맛이 조금 아쉬웠대요' : '원하던 요리가 아니었대요', menu: g.menu, x: g.x, y: g.y });
}
// 손님이 원하는 맛이 메뉴판에 없으면 말풍선으로 투덜거린다 (결산에 '손님이 찾던 맛'으로 모인다)
function noteWish(s, g, ev) {
  const T = GUESTS[g.type].taste?.tags || {};
  const best = Math.max(...menusOnSale(s).map((id) => satisfaction(s, g.type, id).sat));
  if (best >= 70) return;
  const have = new Set(menusOnSale(s).flatMap((id) => menuStats(s, id).tags));
  const want = Object.entries(T).filter(([t, v]) => v > 0 && !have.has(t)).sort((a, b) => b[1] - a[1])[0]?.[0]
    || Object.entries(T).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!want) return;
  s.today.wishes ||= {};
  s.today.wishes[want] = (s.today.wishes[want] || 0) + 1;
  if (rand(s) < 0.5) ev.push({ type: 'wish', tag: want, x: g.x, y: g.y, guest: g.type, sprite: g.sprite });
}

// ---------- 골목 신문 (주간) ----------
function weeklyPaper(s, ev) {
  const w = s.week || { sales: 0, served: 0, found: [], start: s.day };
  const top = Object.entries(s.totals.sold || {}).sort((a, b) => b[1] - a[1])[0];
  const fan = Object.entries(s.bonds || {}).sort((a, b) => b[1] - a[1])[0];
  const paper = {
    day: s.day, rank: s.rank?.pos ?? null, sales: w.sales, served: w.served, found: w.found.slice(-4),
    trend: s.trend ? trendLabel(s.trend) : null, next: s.nextTrend ? trendLabel(s.nextTrend) : null,
    top: top && MENUS[top[0]] ? MENUS[top[0]].name : null,
    fan: fan ? { sprite: Number(fan[0]), bond: Math.floor(fan[1]) } : null,
    festival: nextFestival(s)?.name || null, contest: contestTheme(s).name, grade: GRADES[gradeOf(s.rep)].name,
  };
  s.papers = [paper, ...(s.papers || [])].slice(0, 4);
  s.week = { sales: 0, served: 0, found: [], start: s.day + 1 };
  ev.push({ type: 'paper', paper });
}

// ---------- 요리 대회 ----------
// 매달 주제가 정해지고(1일에 공개), 30일 밤에 열린다. 플레이어가 고른 메뉴가 나간다(안 고르면 주제에 가장 맞는 것).
export function contestTheme(s) {
  const month = Math.floor((s.day - 1) / 30);
  if (!s.contestTheme || s.contestTheme.month !== month) {
    const open = CONTEST_THEMES.filter((t) => !t.world || s.unlocked.includes(t.world));
    const fresh = open.filter((t) => !(s.themesSeen || []).includes(t.id));
    const list = fresh.length ? fresh : open;
    const t = list[hash(`theme${month}`) % list.length];
    s.contestTheme = { month, id: t.id };
    s.themesSeen = [...(s.themesSeen || []), t.id];
    s.contestPick = null;
  }
  return CONTEST_THEMES.find((t) => t.id === s.contestTheme.id);
}
export function contestFit(s, theme, id) {
  const st = menuStats(s, id);
  let v = 0;
  const notes = [];
  if (theme.kinds) {
    if (theme.kinds.includes(st.kind)) { v += 14; notes.push(['+', `${KIND_NAME[st.kind]}라 주제에 맞아요`]); }
    else notes.push(['-', `주제는 ${theme.kinds.map((k) => KIND_NAME[k]).join('·')}예요`]);
  }
  if (theme.tags) {
    const hit = theme.tags.filter((t) => st.tags.includes(t));
    v += Math.min(16, hit.length * 8);
    notes.push(hit.length ? ['+', `${hit.join('·')} 맛이 살아 있어요`] : ['-', `${theme.tags.join('·')} 맛이 안 나요`]);
  }
  if (theme.cls) {
    if (st.cls.some((c) => theme.cls.includes(c))) { v += 14; notes.push(['+', '재료가 주제에 딱 맞아요']); }
    else notes.push(['-', `${theme.cls.map((c) => CLS_NAME[c]).join('·')} 재료가 없어요`]);
  }
  if (theme.world && st.world === theme.world) { v += 10; notes.push(['+', `${WORLDS[theme.world].name} 요리라 심사위원이 반겨요`]); }
  if (theme.hearty === 1) { if (st.hearty) { v += 6; notes.push(['+', '든든해요']); } else notes.push(['-', '양이 아쉬워요']); }
  if (theme.hearty === -1) { if (st.hearty) { v -= 10; notes.push(['-', '너무 배불러요']); } else v += 4; }
  if (theme.maxPrice && st.price > theme.maxPrice) { v -= 12; notes.push(['-', `값이 ${theme.maxPrice}G를 넘어요`]); }
  return { fit: v, notes };
}
export function contestScore(s, theme, id, luck = 0) {
  const st = menuStats(s, id), f = contestFit(s, theme, id);
  const notes = [...f.notes];
  if (st.q >= 80) notes.push(['+', '맛이 훌륭해요']); else if (st.q < 60) notes.push(['-', '완성도가 아쉬워요']);
  if (st.ups >= 2) notes.push(['+', '개량이 돋보여요']); else if (st.ups === 0) notes.push(['-', '개량하면 더 좋아질 거예요']);
  return { score: Math.round(st.q * 0.7 + f.fit + st.ups * 4 + st.lv * 2 + luck), notes, fit: f.fit };
}
export function contestEntry(s) {
  if (s.contestPick && availableMenus(s).includes(s.contestPick)) return s.contestPick;
  const theme = contestTheme(s);
  return availableMenus(s).sort((a, b) => contestScore(s, theme, b).score - contestScore(s, theme, a).score)[0];
}
export function setContestPick(s, id) {
  if (!availableMenus(s).includes(id)) return { ok: false, reason: '없는 메뉴예요' };
  s.contestPick = id;
  return { ok: true };
}
export const leagueOf = (s) => CONFIG.contest.leagues[Math.min(s.league || 0, CONFIG.contest.leagues.length - 1)];
// 경쟁 가게 점수: 등급 기준 + 가게 실력 + 그날 운 (날짜가 지나도 오르지 않는다)
export const rivalContestScore = (s, r) => Math.round(leagueOf(s).base + r.grow * 2 + (hash(`${r.name}c${s.day}`) % 13));
function contest(s, ev) {
  const theme = contestTheme(s);
  const chosen = !!(s.contestPick && availableMenus(s).includes(s.contestPick));
  const entry = contestEntry(s);
  const mine = contestScore(s, theme, entry, hash(`c${s.day}${entry}`) % 7);
  const list = [{ name: '우리 가게', menu: MENUS[entry].name, score: mine.score, me: true },
    ...RIVALS.map((r) => ({ name: r.name, score: rivalContestScore(s, r) }))].sort((a, b) => b.score - a.score);
  const place = list.findIndex((x) => x.me) + 1;
  const lv = s.league || 0, league = leagueOf(s);
  const base = CONFIG.contest.prizes[place - 1] || null;
  const prize = base ? { gold: Math.round(base.gold * (1 + lv * 0.5)), rep: base.rep } : null;
  if (prize) { s.money += prize.gold; applyRep(s, prize.rep, ev); s.ideas = (s.ideas || 0) + (4 - place); s.totals.contestPodium = (s.totals.contestPodium || 0) + 1; }
  let promoted = null;
  if (place === 1) {
    s.totals.contestWins = (s.totals.contestWins || 0) + 1;
    (s.decorUnlocked ||= {}).trophy = true;
    if (lv >= CONFIG.contest.leagues.length - 1) s.totals.topWins = (s.totals.topWins || 0) + 1;
    else { s.league = lv + 1; promoted = leagueOf(s).name; }
  }
  s.contestLast = { day: s.day, place, entry, list, theme: theme.id, notes: mine.notes, chosen, score: mine.score, league: league.name, promoted };
  ev.push({ type: 'contest', place, entry, list, prize, theme: theme.id, notes: mine.notes, chosen, league: league.name, promoted });
}

// ---------- 의뢰 ----------
export function requestFits(s, req, menuId) {
  const st = menuStats(s, menuId), N = req.need, miss = [];
  if (N.kinds && !N.kinds.includes(st.kind)) miss.push(N.kinds.map((k) => KIND_NAME[k]).join('·'));
  if (N.tags && !N.tags.some((t) => st.tags.includes(t))) miss.push(`${N.tags.join('·')} 맛`);
  if (N.world && st.world !== N.world) miss.push(`${WORLDS[N.world].name} 요리`);
  if (N.hearty === true && !st.hearty) miss.push('든든함');
  if (N.hearty === false && st.hearty) miss.push('가벼운 양');
  if (N.maxPrice && st.price > N.maxPrice) miss.push(`${N.maxPrice}G 이하`);
  return { ok: !miss.length, miss };
}
export function refreshRequests(s, ev = []) {
  s.requests ||= {};
  for (const r of REQUESTS) {
    if (s.requests[r.id]) continue;
    let open;
    if (r.bond) open = GUESTS[r.by].sprites.some((sp) => (s.bonds?.[sp] || 0) >= r.bond);
    else if (r.after) open = s.requests[r.after]?.state === 'done';
    else open = s.unlocked.includes(GUESTS[r.by].world);
    if (open) { s.requests[r.id] = { state: 'open', day: s.day }; ev.push({ type: 'requestNew', id: r.id, title: r.title, by: r.by }); }
  }
  return ev;
}
export const openRequests = (s) => REQUESTS.filter((r) => s.requests?.[r.id]?.state === 'open');
function checkRequests(s, g, rating, ev) {
  for (const r of openRequests(s)) {
    if (r.by !== g.type || rating < (r.need.minStars || 3) || !requestFits(s, r, g.menu).ok) continue;
    if (r.after && s.requests[r.after]?.menu === g.menu) continue; // 이어지는 의뢰는 다른 요리로
    s.requests[r.id] = { state: 'done', day: s.day, menu: g.menu };
    const R = r.reward, got = {};
    if (R.gold) { s.money += R.gold; got.gold = R.gold; }
    if (R.ideas) { s.ideas = (s.ideas || 0) + R.ideas; got.ideas = R.ideas; }
    if (R.ingredients) got.ingredients = addToPantry(s, R.ingredients);
    if (R.decor) { (s.decorUnlocked ||= {})[R.decor] = true; got.decor = R.decor; }
    if (R.invite) { (s.invited ||= {})[R.invite] = 1.6; got.invite = R.invite; }
    if (R.perk) { (s.perks ||= {})[R.perk] = s.day; got.perk = R.perk; }
    if (R.pack) { const p = packOf(R.pack); (s.packs ||= {})[R.pack] = s.day; if (p) got.ingredients = [...(got.ingredients || []), ...addToPantry(s, p.items)]; got.pack = R.pack; }
    s.totals.requests = (s.totals.requests || 0) + 1;
    ev.push({ type: 'requestDone', id: r.id, title: r.title, got, sprite: g.sprite, guest: g.type, x: g.x, y: g.y, menu: g.menu });
  }
  refreshRequests(s, ev);
}

function updateCook(s, c, dt, ev) {
  if (c.state === 'idle' && s.queue.length) {
    c.order = s.queue.shift();
    const st = menuStats(s, c.order.menu);
    c.timer = st.cookMin * (1 - S.cookSpeedPerLevel * (c.lv - 1)) * cookTraitMult(c, st) * equipMult(s, c.slot, st.kind);
    c.state = 'cooking';
    const cost = st.cost;
    s.today.cooked += 1;
    s.money -= cost;
    s.today.cost += cost;
  } else if (c.state === 'cooking' && (c.timer -= dt) <= 0) {
    s.ready.push(c.order);
    c.order = null;
    c.state = 'idle';
    gainExp(s, c, ev);
  }
}

function updateServer(s, v, dt, ev) {
  const home = getMap().serverHomes[v.slot];
  const speed = CONFIG.staffWalkPerMin * (1 + S.walkSpeedPerLevel * (v.lv - 1)) * (v.trait === 'swift' ? 1.3 : 1) * dt;
  if (v.state === 'idle' || v.state === 'returning') {
    // 손님이 이미 떠난 음식은 버린다
    s.ready = s.ready.filter((o) => findGuest(s, o.guest)?.state === 'waiting');
    if (s.ready.length && (v.state === 'idle' || (Math.abs(v.x - home.x) < 3 && Math.abs(v.y - home.y) < 2))) {
      const o = s.ready.shift();
      const seat = findGuest(s, o.guest).seat;
      // 음식을 내놓는 곳을 들렀다 가는 셈 치고, 지금 자리에서 손님 옆으로 바로 간다
      const path = findPath(v, (x, y) => Math.abs(x - seat.x) + Math.abs(y - seat.y) === 1 && walkable(x, y));
      if (path) { Object.assign(v, { carry: o, path, state: 'delivering' }); return; }
      s.ready.unshift(o);
    }
    if (v.state === 'returning' && advance(v, speed)) v.state = 'idle';
  } else if (v.state === 'delivering') {
    if (!advance(v, speed)) return;
    const g = findGuest(s, v.carry.guest);
    if (g && g.state === 'waiting' && MENUS[g.menu]) { g.state = 'eating'; g.timer = menuStats(s, g.menu).eatMin; s.today.delivered += 1; gainExp(s, v, ev); }
    v.carry = null;
    v.path = findPath(v, (x, y) => x === home.x && y === home.y) || [];
    v.state = 'returning';
  }
}

function endDay(s, ev) {
  s.phase = 'closed';
  const t = s.today;
  t.wages = [...s.cooks, ...s.servers].reduce((a, x) => a + staffWage(x.role, x.lv), 0);
  const helpers = s.cooks.filter((c) => c.trait === 'research').length;
  if (helpers) { s.ideas = (s.ideas || 0) + helpers; t.ideas = helpers; }
  s.money -= t.wages;
  const record = (s.totals.bestSales || 0) > 0 && t.sales > s.totals.bestSales;
  s.totals.bestSales = Math.max(s.totals.bestSales || 0, t.sales);
  if (record) ev.push({ type: 'record', sales: t.sales });
  if (calendar(s.day).date === CONFIG.contest.day) contest(s, ev);
  if (s.day % CONFIG.ranking.every === 0) { weeklyRanking(s, ev); weeklyPaper(s, ev); }
  missionProgress(s, ev, { salesNow: t.sales });
  missionProgress(s, ev, { dayEnd: true, angry: t.angry });
  s.yesterdaySold = { ...t.sold };
  const best = Object.entries(t.sold).sort((a, b) => b[1] - a[1])[0];
  const fan = Object.entries(t.faces || {}).sort((a, b) => b[1].spent - a[1].spent)[0];
  const prevProfit = s.lastSummary ? s.lastSummary.profit : null;
  const profit = t.sales + t.tips - t.cost - t.wages;
  s.lastSummary = {
    day: s.day, sales: t.sales, tips: t.tips, cost: t.cost, wages: t.wages, profit,
    served: t.served, angry: t.angry, repStart: t.repStart, repEnd: s.rep,
    trend: s.trend ? trendLabel(s.trend) : null, trendSold: t.trendSold || 0,
    weather: s.weather, prevProfit, record,
    contest: s.contestLast?.day === s.day ? { place: s.contestLast.place, menu: MENUS[s.contestLast.entry]?.name, notes: s.contestLast.notes, league: s.contestLast.league, promoted: s.contestLast.promoted } : null,
    ideas: t.ideas || 0,
    wishes: t.wishes || {},
    stars: t.stars || {},
    missions: (s.missions || []).map((m) => ({ text: m.text, done: m.done })),
    rank: s.rank?.day === s.day ? { pos: s.rank.pos } : null,
    fan: fan ? { sprite: Number(fan[0]), type: fan[1].type, n: fan[1].n, spent: fan[1].spent, visits: (s.totals.visits || {})[fan[0]] || fan[1].n } : null,
    best: best ? best[0] : null, bestCount: best ? best[1] : 0,
  };
  s.history.push({ day: s.day, sales: t.sales, profit, served: t.served });
  if (s.history.length > 14) s.history.shift();
  checkAchievements(s, ev);
  ev.push({ type: 'dayEnd', summary: s.lastSummary });
}
