// 《차원골목 식당》 화면 연결
// 시간을 흘리고(tick), 사건을 화면에 옮기고, 저장한다. 규칙은 sim.js, 숫자는 data.js에 있다.
import {
  createGame, tick, openNextDay, repLevel, calendar, availableMenus, isTrending, trendLabel,
  toggleMenu, hire, fire, developable, stats, staffWage, staffLevel, migrate,
  registerRecipes, ingredientInfo, weatherOf, peakMult,
  getMap, openTables, tablePrice, buyTable, atmosphere, buyDecor, activePromo, promote, menuLevel, menuPrice,
  trainStaff, trainCost, rivalScore, ourScore, contestEntry,
  menuStats, menuSlots, menusOnSale, slotPrice, buySlot, experiment, addRecipe, labCost, baseMenuFor,
  allPacks, packState, packPriceFor, buyPack, buyClue, upgradeMenu, upgradeCost, inPantry, satisfaction,
  openRequests, requestFits, contestTheme, contestScore, setContestPick, rivalContestScore, decorOpen, promoPrice, openWorlds,
  clueCost, leagueOf, setAnnexWorld, ANNEX_CHANGE_PRICE, setLayout,
  currentGoal, goalProgress, festivalOf, nextFestival, vipWant, vipFits, gradeOf, expandShop, nextZone, tableSpots, decorSpotsFree, moveTable, moveDecor, deliverySteps, buyEquip, KITCHEN_DECOR, zoneOf,
} from './sim.js';
import {
  CONFIG, WORLDS, MENUS, GUESTS, SPRITES, ACHIEVEMENTS, iconOf, ingredientSheetUrl, loadCatalog, CATALOG, dishOf, dishSheetUrl,
  DECOR, PROMOS, RIVALS, guestName, SPECIALS, EFFECT_NAME, TRAITS, REQUESTS, PERKS, CONTEST_THEMES, PACK_GROUPS,
  SHOP_ZONES, EQUIPMENT, GRADES, GOALS, VIPS, FESTIVALS, FACE_NAMES,
} from './data.js';
import { evaluate, pairKey, recipeIdOf, starsOf, CLS_NAME, KIND_NAME, UPGRADE_DIRS, canUseFor, TAGS } from './taste.js';
import { createRenderer } from './render.js';
import { sfx, unlockAudio, isMuted, setMuted, startBgm, isBgmOn, setBgm } from './sound.js';

// 저장 칸 3개. 1번 칸은 예전 저장 이름 그대로 (이어지게).
let slot = 1;
try { slot = Math.min(3, Math.max(1, Number(localStorage.getItem('chawon-slot')) || 1)); } catch { /* 1번 */ }
const slotKey = (n) => (n === 1 ? 'isekai-diner-save' : `isekai-diner-save-${n}`);
let SAVE_KEY = slotKey(slot);
function useSlot(n) { slot = n; SAVE_KEY = slotKey(n); try { localStorage.setItem('chawon-slot', String(n)); } catch { /* 괜찮아 */ } }
function slotSummary(n) {
  try {
    const s = JSON.parse(localStorage.getItem(slotKey(n)) || 'null');
    if (!s || typeof s.money !== 'number') return null;
    const c = calendar(s.day || 1);
    return { text: `${c.year}년 차 ${c.month}월 ${c.date}일 · ${Math.round(s.money).toLocaleString('ko-KR')}G · ${GRADES[gradeOf(s.rep || 0)].name}` };
  } catch { return null; }
}
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const btn = (cls, text, onClick) => { const b = el('button', `${cls} press`, text); b.type = 'button'; if (onClick) b.addEventListener('click', onClick); return b; };
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const trendIconId = (t) => (t.kind === 'world' ? `${t.id}_001` : t.id);
const hotPrice = (id) => Math.round(menuPrice(state, id) * (1 + CONFIG.trend.priceBoost));
const ROLE = { cook: '요리사', server: '종업원' };

// ---------- 그림 칸 ----------
// 그림 묶음에서 한 칸을 잘라 보여 주는 칸 (CSS 배경 위치로 자른다)
function cellEl(url, col, row, size, cls = '', cols = 10, rows = 10) {
  const n = el('span', `ico ${cls}`);
  n.style.width = n.style.height = `${size}px`;
  n.style.backgroundImage = `url(${url})`;
  n.style.backgroundSize = `${size * cols}px ${size * rows}px`;
  n.style.backgroundPosition = `-${col * size}px -${row * size}px`;
  if (size < 48) n.classList.add('soft');
  return n;
}
// 가게 부품 그림을 48칸 안에 비율 그대로
const partEl = (part) => { const n = cellEl(`assets/shop/${part}.png`, 0, 0, 48, 'big', 1, 1); n.style.backgroundSize = 'contain'; n.style.backgroundRepeat = 'no-repeat'; n.style.backgroundPosition = 'center'; return n; };
const iconEl = (id, size = 48, cls = '') => { const ic = iconOf(id); return cellEl(ingredientSheetUrl(ic.sheet), ic.col, ic.row, size, cls); };
// 메뉴의 요리 그림 (없으면 첫 재료 아이콘)
const dishEl = (m, size = 48, cls = 'big') => {
  const d = dishOf(m.dish);
  if (!d) return iconEl(m.ingredients[0], size, cls);
  return cellEl(dishSheetUrl(d.set, 48), d.col, d.row, size, `${cls} dish`, 8, 5);
};
const staffEl = (role, sprite, size = 48) => { const sh = SPRITES[role === 'cook' ? 'chef' : 'server']; return cellEl(sh.url, 0, sprite, size, 'who', sh.cols, sh.rows); };
const guestEl = (sprite, size = 48, cls = 'who') => cellEl(SPRITES.anim.url, SPRITES.anim.frames.front, sprite % SPRITES.customers, size, cls, SPRITES.anim.cols, SPRITES.anim.rows);

// ---------- 상태 ----------
let state = null;
let renderer = null;
let speed = 1;
let onTitle = true;
let sheetName = null;
const sheetTab = { book: 'guests', ledger: 'build' };
let shownMoney = 0;
let selected = null;
let notifiedLastEntry = false;
let brokenSaveNote = false;
const lab = { a: null, b: null, cat: 'normal', result: null, packCat: 'normal' };
const upPick = { id: null, dir: null, ing: null, last: null };
const qStars = (q) => stars(starsOf(q));
const tagChips = (tags) => { const w = el('span', 'chips'); for (const t of tags) w.append(el('span', `chip t-${t}`, t)); return w; };
const worldName = (w) => (w === 'normal' ? '일반' : WORLDS[w]?.name || w);
// 이 메뉴를 좋아할/싫어할 손님 (지금 오는 손님 종류 중)
function fansOf(id) {
  const types = Object.keys(GUESTS).filter((t) => openWorlds(state).includes(GUESTS[t].world));
  const r = types.map((t) => [t, satisfaction(state, t, id).stars]);
  return { love: r.filter(([, x]) => x >= 4).map(([t]) => t), hate: r.filter(([, x]) => x <= 2).map(([t]) => t) };
}
const faceOf = (type) => GUESTS[type].sprites[0];
function fanRow(id) {
  const f = fansOf(id);
  const row = el('div', 'fans');
  if (f.love.length) { row.append(el('small', null, '좋아함')); for (const t of f.love) { const g = guestEl(faceOf(t), 24, ''); g.title = GUESTS[t].name; row.append(g); } }
  if (f.hate.length) { row.append(el('small', 'hate', '별로')); for (const t of f.hate) { const g = guestEl(faceOf(t), 24, 'sil-soft'); g.title = GUESTS[t].name; row.append(g); } }
  if (!f.love.length && !f.hate.length) row.append(el('small', null, '손님 반응은 무난해요'));
  return row;
}

function loadSave() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (s && s.v >= 1 && s.v <= CONFIG.saveVersion && Array.isArray(s.guests) && typeof s.money === 'number') return migrate(s);
    throw new Error('모양이 다른 저장');
  } catch {
    // 못 읽는 저장은 지우지 않고 따로 보관한다
    try { localStorage.setItem(`${SAVE_KEY}-broken-${Date.now()}`, raw); localStorage.removeItem(SAVE_KEY); } catch { /* 괜찮아 */ }
    brokenSaveNote = true;
    return null;
  }
}
function save(show = false) {
  if (onTitle) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { return; }
  if (show) { const d = $('saveDot'); d.classList.remove('flash'); void d.offsetWidth; d.classList.add('flash'); }
}

// ---------- 상단 바 ----------
function clockText(min) {
  const h = Math.floor(min / 60) % 24, m = Math.floor(min % 60 / 10) * 10;
  return `${h < 12 ? '오전' : '오후'} ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`;
}
const lastText = {};
function setText(id, text) { if (lastText[id] !== text) { $(id).textContent = text; lastText[id] = text; } }

function updateHud(dt) {
  const c = calendar(state.day);
  setText('date', `${c.month}월 ${c.date}일`);
  setText('year', weatherOf(state).name);
  const peak = state.phase === 'open' && peakMult(state.clock) > 1;
  setText('time', state.phase === 'closed' ? '영업 끝' : clockText(state.clock) + (peak ? ' 피크' : ''));
  $('time').classList.toggle('peak', peak);
  shownMoney += (state.money - shownMoney) * Math.min(1, dt * 6);
  if (Math.abs(state.money - shownMoney) < 0.5) shownMoney = state.money;
  setText('money', fmt(shownMoney));
  $('moneyPill').classList.toggle('debt', state.money < 0);
  updateTodo();
  setText('ideas', String(state.ideas ?? 0));
  const lv = repLevel(state.rep);
  setText('repStars', stars(lv));
  $('repStars').parentElement.classList.toggle('max', lv >= CONFIG.repThresholds.length);
  const lo = CONFIG.repThresholds[lv - 1], hi = CONFIG.repThresholds[lv];
  $('repBar').style.width = `${hi ? Math.max(0, Math.min(100, ((state.rep - lo) / (hi - lo)) * 100)) : 100}%`;
}

const SPEEDS = [[1, '▶ 1배'], [2, '▶▶ 2배'], [4, '▶▶▶ 4배'], [8, '⏩ 8배'], [0, '❚❚ 멈춤']];
function setSpeed(n) {
  speed = n;
  $('speedBtn').textContent = SPEEDS.find(([v]) => v === n)[1];
}

// ---------- 배지 ----------
function badge(name, n) {
  const b = document.querySelector(`[data-sheet="${name}"] .badge`);
  if (!b) return;
  b.hidden = !n;
  b.textContent = n === true ? '' : n > 9 ? '9+' : String(n || '');
  b.classList.toggle('dot', n === true);
}
const unseen = { achievements: 0 };

// ---------- 소식 띠, 알림, 배너, 꽃가루 ----------
const newsLog = [];
function ticker(parts) {
  const t = $('ticker');
  newsLog.unshift({ day: state?.day, clock: state?.clock, text: parts.map((p) => (typeof p === 'string' ? p : p.textContent)).join('') });
  if (newsLog.length > 40) newsLog.length = 40;
  t.replaceChildren(...parts.map((p) => (typeof p === 'string' ? document.createTextNode(p) : p)));
  t.classList.remove('in', 'marquee'); void t.offsetWidth; t.classList.add('in');
  // 길어서 잘리면 천천히 흘려 보낸다
  const over = t.scrollWidth - t.parentElement.clientWidth + 20;
  if (over > 0) {
    t.style.setProperty('--shift', `-${over}px`);
    t.style.setProperty('--dur', `${Math.max(3, over / 30)}s`);
    t.classList.add('marquee');
  }
}
let toastTimer = 0;
function toast(text) {
  const t = $('toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}
const bannerQueue = [];
let bannerBusy = false;
// 덜 중요한 알림(minor)은 배너가 밀려 있으면 작은 토스트로 돌린다
function banner(text, kind = '', minor = false) {
  if (minor && (bannerBusy || bannerQueue.length)) { toast(text); return; }
  if (bannerQueue.length > 4) bannerQueue.shift(); // 빨리 감기에서 너무 밀리지 않게
  bannerQueue.push([text, kind]);
  if (!bannerBusy) nextBanner();
}
function nextBanner() {
  const item = bannerQueue.shift();
  if (!item) { bannerBusy = false; return; }
  bannerBusy = true;
  const b = el('div', `banner ${item[1]}`, item[0]);
  $('view').append(b);
  setTimeout(() => { b.remove(); nextBanner(); }, 1700);
}
function confetti(n = 36) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = $('confetti');
  if (box.childElementCount > 120) return;
  const cols = ['#ffd35a', '#e2559a', '#6fd3a0', '#7ea2ff', '#ff9a2e', '#ffffff'];
  for (let i = 0; i < n; i++) {
    const p = el('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = cols[i % cols.length];
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
    p.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    p.style.animationDuration = `${1.4 + Math.random() * 1.2}s`;
    p.style.animationDelay = `${Math.random() * 0.25}s`;
    box.append(p);
    setTimeout(() => p.remove(), 3000);
  }
}

const daysLeft = (t) => { const n = t.endDay - state.day + 1; return n <= 1 ? '오늘까지' : `${n}일 남음`; };

// 가게 화면 구석의 유행 표시
let trendKey = '';
function updateTrendPill() {
  const t = state.trend;
  const key = t ? `${t.kind}:${t.id}:${t.endDay - state.day}` : '';
  if (key === trendKey) return;
  trendKey = key;
  const pill = $('trendPill');
  if (!t) { pill.hidden = true; return; }
  pill.replaceChildren(iconEl(trendIconId(t), 24), el('b', null, '유행'), el('span', null, trendLabel(t)), el('small', null, daysLeft(t)));
  pill.hidden = false;
}

// 동전이 가게 화면에서 돈 칸으로 날아간다
let flying = 0;
function flyCoin(tx, ty) {
  if (flying > 6) return;
  const app = $('app').getBoundingClientRect();
  const cv = $('game').getBoundingClientRect();
  const to = $('moneyPill').getBoundingClientRect();
  const f = renderer.frac(tx, ty);
  const x0 = cv.left - app.left + f.fx * cv.width;
  const y0 = cv.top - app.top + f.fy * cv.height;
  const x1 = to.left - app.left + 10, y1 = to.top - app.top + 10;
  const c = el('i', 'fly');
  $('app').append(c);
  flying++;
  const anim = c.animate([
    { transform: `translate(${x0}px,${y0}px) scale(1)` },
    { transform: `translate(${(x0 + x1) / 2}px,${Math.min(y0, y1) - 40}px) scale(1.2)`, offset: 0.4 },
    { transform: `translate(${x1}px,${y1}px) scale(.7)` },
  ], { duration: 650, easing: 'ease-in' });
  anim.onfinish = () => {
    c.remove(); flying--;
    const m = $('moneyPill'); m.classList.remove('bump'); void m.offsetWidth; m.classList.add('bump');
  };
}

// ---------- 창 안의 탭 ----------
function segTabs(name, tabs) {
  const row = el('div', 'seg');
  for (const [id, label] of tabs) {
    const b = btn('seg-btn' + (sheetTab[name] === id ? ' on' : ''), label, () => { sheetTab[name] = id; sfx.tap(); openSheet(name, true); });
    b.setAttribute('aria-pressed', String(sheetTab[name] === id));
    row.append(b);
  }
  return row;
}

// ---------- 메뉴판 ----------
function trendCard() {
  const t = state.trend;
  if (!t) return [];
  const c = el('div', 'item trend-card');
  const l1 = el('div', 'line1'); l1.append(el('b', null, `이번 주 유행 · ${trendLabel(t)}`), el('span', 'tag hot', daysLeft(t)));
  const p = Math.round(CONFIG.trend.priceBoost * 100);
  c.append(iconEl(trendIconId(t), 48, 'big'), l1, el('div', 'line2', t.news || ''),
    el('div', 'line3', `${trendLabel(t)} 들어간 메뉴는 손님이 ${CONFIG.trend.pickBoost}배 더 찾고, 값을 ${p}% 더 받아요.`));
  const out = [c];
  const n = state.nextTrend;
  if (n) {
    const d = el('div', 'item trend-next');
    const l = el('div', 'line1'); l.append(el('b', null, `다음 유행 예고 · ${trendLabel(n)}`), el('span', 'tag', `${t.endDay - state.day + 2}일 뒤`));
    d.append(iconEl(trendIconId(n), 48, 'big'), l, el('div', 'line2', n.news || ''), el('div', 'line3', '미리 메뉴를 켜 두거나 개발해 두면 첫날부터 잘 팔려요.'));
    out.push(d);
  }
  return out;
}
function menuHead() {
  const n = menusOnSale(state).length, max = menuSlots(state), price = slotPrice(state);
  const head = el('div', 'staff-head');
  head.append(el('span', 'tag' + (n >= max ? ' hot' : ''), `메뉴판 ${n}/${max}칸`));
  const b = btn('small-btn go-small', price == null ? '칸 최대' : `칸 늘리기 ${fmt(price)}G`, () => {
    const r = buySlot(state);
    if (!r.ok) { toast(r.reason); return; }
    sfx.levelUp(); toast(`메뉴판이 ${r.ev[0].n}칸이 됐어요`); save(); openSheet('menu', true);
  });
  b.disabled = price == null || state.money < price;
  head.append(b);
  return [head, el('p', 'sub', '손님은 자기 입맛에 맞을 것 같은 메뉴를 골라요. 칸이 정해져 있으니, 어떤 손님을 노릴지 골라 올려요.')];
}
function menuCard(id) {
  const m = MENUS[id], st = menuStats(state, id);
  const hot = isTrending(state, id);
  const on = menusOnSale(state).includes(id);
  const li = el('div', 'item menu-item' + (hot ? ' hot' : '') + (on ? '' : ' off') + (m.special ? ' legend' : ''));
  const l1 = el('div', 'line1');
  const name = el('b', null, m.name);
  if (m.special) name.append(' ', el('span', 'tag legend', '전설'));
  if (hot) name.append(' ', el('span', 'tag hot', '유행'));
  name.append(' ', el('span', 'lv', `Lv.${st.lv}`));
  l1.append(name, el('span', 'price', hot ? `${st.price} → ${hotPrice(id)} G` : `${st.price} G`));
  const l2 = el('div', 'line2');
  l2.append(el('span', 'kind', KIND_NAME[st.kind] || ''), tagChips(st.tags));
  if (st.hearty) l2.append(el('span', 'chip t-든든', st.hearty > 1 ? '아주 든든' : '든든'));
  if (st.premium) l2.append(el('span', 'chip t-고급', '고급'));
  if (m.effect) l2.append(el('span', 'chip t-효과', EFFECT_NAME[m.effect]));
  const l3 = el('div', 'line3');
  const gain = (hot ? hotPrice(id) : st.price) - st.cost;
  const T = CONFIG.menuLevel.exp, sold = (state.menuExp || {})[id] || 0, next = T[st.lv];
  l3.append(el('span', 'stars', `맛 ${st.q} ${qStars(st.q)}`), el('span', 'gain', `이익 ${gain}G`),
    el('span', null, next != null ? `Lv.${st.lv + 1}까지 ${next - sold}그릇` : '최고 레벨'), el('span', null, `조리 ${Math.round(st.cookMin)}분`),
    el('span', null, `어제 ${state.yesterdaySold?.[id] || 0}그릇`));
  const sw = btn('switch' + (on ? ' on' : ''), on ? '판매 중' : '올리기', () => {
    const r = toggleMenu(state, id);
    if (!r.ok) { toast(r.reason); sfx.angry(); return; }
    sfx.tap(); save(); openSheet('menu', true);
  });
  sw.setAttribute('aria-pressed', String(on));
  const cost = upgradeCost(state, id);
  const ub = btn('small-btn' + (upPick.id === id ? ' on' : ''), `개량 ${st.ups}/${CONFIG.upgrade.max}`, () => {
    upPick.id = upPick.id === id ? null : id; upPick.dir = null; upPick.ing = null; upPick.last = null; sfx.tap(); openSheet('menu', true);
  });
  ub.disabled = st.ups >= CONFIG.upgrade.max && upPick.id !== id;
  const l4 = el('div', 'line3 btns'); l4.append(sw, ub);
  li.append(dishEl(m), l1, l2, l3, fanRow(id), l4);
  if (upPick.id === id) li.append(upgradePanel(id, cost));
  return li;
}
function upgradePanel(id, cost) {
  const box = el('div', 'upgrade');
  const ups = (state.upgrades || {})[id] || [];
  for (const u of ups) box.append(el('div', 'line3', `· ${UPGRADE_DIRS[u.dir].name}${u.ing ? ` (${ingredientInfo(u.ing)?.name})` : ''} — 맛 ${u.dq >= 0 ? '+' : ''}${u.dq} · ${u.why}`));
  if (upPick.last) box.append(el('div', 'up-result' + (upPick.last.dq >= 0 ? ' good' : ' bad'), `방금 개량: 맛 ${upPick.last.dq >= 0 ? '+' : ''}${upPick.last.dq} · ${upPick.last.why}`));
  if (ups.length >= CONFIG.upgrade.max) { box.append(el('p', 'sub', '개량을 다 했어요.')); return box; }
  box.append(el('p', 'sub', `${cost.n + 1}번째 개량: 💡${cost.ideas} · ${cost.gold}G. 재료를 넣는 개량은 궁합에 따라 맛이 오르기도, 떨어지기도 해요.`));
  const dirs = el('div', 'seg');
  for (const [d, D] of Object.entries(UPGRADE_DIRS)) {
    const used = d === 'technique' && ups.some((u) => u.dir === 'technique');
    const b = btn('seg-btn' + (upPick.dir === d ? ' on' : ''), D.name, () => { upPick.dir = d; upPick.ing = null; sfx.tap(); openSheet('menu', true); });
    b.disabled = used;
    dirs.append(b);
  }
  box.append(dirs);
  if (!upPick.dir) return box;
  const D = UPGRADE_DIRS[upPick.dir];
  box.append(el('p', 'sub', D.desc));
  if (upPick.dir !== 'technique') {
    const ids = developable(state).filter((x) => canUseFor(upPick.dir, x) && !MENUS[id].ingredients.includes(x) && !ups.some((u) => u.ing === x));
    if (!ids.length) box.append(el('p', 'sub', upPick.dir === 'premium' ? '세계 재료가 창고에 없어요. 거래처에서 들여와요.' : '맞는 재료가 창고에 없어요. 거래처에서 들여와요.'));
    const grid = el('div', 'ing-grid small');
    for (const x of ids) {
      const c = btn('ing-cell' + (upPick.ing === x ? ' on' : ''), '', () => { upPick.ing = x; sfx.tap(); openSheet('menu', true); });
      c.title = `${CATALOG[x].name} · ${CATALOG[x].tags.join('·') || '담백'}`;
      c.append(iconEl(x, 32, ''), el('small', null, CATALOG[x].name));
      grid.append(c);
    }
    box.append(grid);
  }
  const go = btn('go', `${D.name} · 💡${cost.ideas} · ${cost.gold}G`, () => {
    const r = upgradeMenu(state, id, upPick.dir, upPick.ing);
    if (!r.ok) { toast(r.reason); sfx.angry(); return; }
    upPick.last = { dq: r.dq, why: r.why };
    handle(r.ev);
    upPick.dir = null; upPick.ing = null;
    save(); openSheet('menu', true);
  });
  go.disabled = (upPick.dir !== 'technique' && !upPick.ing) || (state.ideas || 0) < cost.ideas || state.money < cost.gold;
  box.append(go);
  return box;
}
const MENU_SORTS = { base: ['기본', null], q: ['맛', (s) => s.q], gain: ['이익', (s) => s.price - s.cost], sold: ['어제 판매', (s, id) => state.yesterdaySold?.[id] || 0], fast: ['빠른 조리', (s) => -s.cookMin] };
function menuItems() {
  const by = MENU_SORTS[sheetTab.menuSort || 'base'][1];
  const order = (ids) => (by ? ids.slice().sort((a, b) => by(menuStats(state, b), b) - by(menuStats(state, a), a)) : ids);
  const sale = order(menusOnSale(state));
  const wait = availableMenus(state).filter((id) => !sale.includes(id)).sort((a, b) => menuStats(state, b).q - menuStats(state, a).q);
  const sortRow = el('div', 'seg');
  for (const [k, [label]] of Object.entries(MENU_SORTS)) sortRow.append(btn('seg-btn' + ((sheetTab.menuSort || 'base') === k ? ' on' : ''), label, () => { sheetTab.menuSort = k; sfx.tap(); openSheet('menu', true); }));
  const out = [...menuHead(), sortRow, el('h3', 'sec-title', `판매 중 ${sale.length}`), ...sale.map(menuCard)];
  out.push(el('h3', 'sec-title', `대기 중 ${wait.length}`));
  if (!wait.length) out.push(el('p', 'sub', '개발 창에서 실험해 마음에 드는 요리를 메뉴로 만들면 여기로 와요.'));
  out.push(...wait.map(menuCard));
  return out;
}

// ---------- 직원 ----------
function expBar(st) {
  const lv = staffLevel(st.exp), T = CONFIG.staff.expToLevel;
  const m = el('span', 'meter exp');
  const f = el('span');
  f.style.width = `${lv >= T.length ? 100 : Math.round(((st.exp - T[lv - 1]) / (T[lv] - T[lv - 1])) * 100)}%`;
  m.append(f);
  return m;
}
function staffItems() {
  const all = [...state.cooks, ...state.servers];
  const wages = all.reduce((a, x) => a + staffWage(x.role, x.lv), 0);
  const head = el('div', 'staff-head');
  head.append(
    el('span', 'tag', `요리사 ${state.cooks.length}/${CONFIG.staff.maxCooks}`),
    el('span', 'tag', `종업원 ${state.servers.length}/${CONFIG.staff.maxServers}`),
    el('span', 'tag', `하루 일당 ${fmt(wages)}G`),
  );
  const out = [head, el('p', 'sub', `직원마다 특기가 하나씩 있어요. 레벨이 오를수록 요리사는 빨리 만들고, 종업원은 빨리 걸어요. 연수는 하루 한 번, 경험 +${CONFIG.training.exp}.`)];
  for (const st of all) {
    const li = el('div', 'item staff');
    const l1 = el('div', 'line1');
    const lv = staffLevel(st.exp);
    l1.append(el('b', null, `${st.name} · ${ROLE[st.role]}`), el('span', 'lv', `Lv.${lv}`));
    const T0 = TRAITS[st.role][st.trait];
    const l2 = el('div', 'line2');
    if (T0) l2.append(el('span', 'chip t-특기', T0.name), ' ');
    l2.append(expBar(st), ` 경험 ${st.exp} · 일당 ${staffWage(st.role, lv)}G`);
    const l3 = el('div', 'line3');
    let armed = false;
    const fb = btn('small-btn danger', '내보내기', () => {
      if (!armed) { armed = true; fb.textContent = '정말 내보낼까요?'; setTimeout(() => { armed = false; fb.textContent = '내보내기'; }, 3000); return; }
      const r = fire(state, st.id);
      if (!r.ok) { toast(r.reason); return; }
      toast(`${st.name} 님이 가게를 떠났어요`); sfx.tap(); save(); openSheet('staff', true);
    });
    const maxed = lv >= CONFIG.staff.expToLevel.length;
    const tc = trainCost(st);
    const tb = btn('small-btn go-small', maxed ? '최고 레벨' : st.trainedDay === state.day ? '연수 끝' : `연수 ${tc}G`, () => {
      const r = trainStaff(state, st.id);
      if (!r.ok) { toast(r.reason); return; }
      handle(r.ev);
      if (!r.ev.some((e) => e.type === 'staffLevel')) { sfx.great(); toast(`${st.name} 님 연수 완료! 경험 +${CONFIG.training.exp}`); }
      save(); openSheet('staff', true);
    });
    tb.disabled = maxed || st.trainedDay === state.day || state.money < tc;
    l3.append(el('span', null, `${st.slot + 1}번 ${st.role === 'cook' ? '화덕' : '자리'}`), tb, fb);
    li.append(staffEl(st.role, st.sprite), l1, l2, l3);
    out.push(li);
  }
  out.push(el('h3', 'sec-title', '오늘의 지원자'));
  if (!state.candidates.length) out.push(el('p', 'sub', '오늘은 지원자가 더 없어요. 내일 또 와요.'));
  for (const c of state.candidates) {
    const li = el('div', 'item cand');
    const l1 = el('div', 'line1');
    l1.append(el('b', null, `${c.name} · ${ROLE[c.role]}`), el('span', 'lv', `Lv.${c.lv}`));
    const T1 = TRAITS[c.role][c.trait];
    const l2 = el('div', 'line2');
    if (T1) l2.append(el('span', 'chip t-특기', T1.name), ` ${T1.desc} · `);
    l2.append(`일당 ${c.wage}G · 계약금 ${c.fee}G`);
    const full = c.role === 'cook' ? state.cooks.length >= CONFIG.staff.maxCooks : state.servers.length >= CONFIG.staff.maxServers;
    const hb = btn('small-btn go-small', full ? '자리 없음' : '뽑기', () => {
      const r = hire(state, c.id);
      if (!r.ok) { toast(r.reason); return; }
      handle(r.ev);
      sfx.levelUp(); confetti(24);
      toast(`${c.name} 님이 ${ROLE[c.role]}로 들어왔어요!`);
      save(); openSheet('staff', true);
    });
    hb.disabled = full || state.money < c.fee;
    const l3 = el('div', 'line3'); l3.append(el('span', null, !full && state.money < c.fee ? '돈이 모자라요' : ''), hb);
    li.append(staffEl(c.role, c.sprite), l1, l2, l3);
    out.push(li);
  }
  return out;
}

// ---------- 개발: 실험실, 연구 노트, 거래처 ----------
function slotEl(k) {
  const id = lab[k];
  const b = btn('dev-slot' + (id ? ' full' : ''), '', () => { lab[k] = null; lab.result = null; sfx.tap(); openSheet('dev', true); });
  b.setAttribute('aria-label', id ? `${CATALOG[id].name} 빼기` : `재료 ${k === 'a' ? '하나' : '둘'} 빈칸`);
  if (id) b.append(iconEl(id, 48, ''), el('small', null, CATALOG[id].name), el('small', 'slot-tags', `${CLS_NAME[CATALOG[id].cls]} · ${CATALOG[id].tags.join('·') || '담백'}`));
  else b.append(el('small', null, '재료를 골라요'));
  return b;
}
function resultCard(r, opts = {}) {
  const tried = (state.tried || {})[r.key];
  const base = baseMenuFor(r.a, r.b);
  const card = el('div', 'item dev-result' + (r.special ? ' legend' : r.stars >= 4 ? ' great' : r.stars <= 2 ? ' bad' : ''));
  const l1 = el('div', 'line1');
  l1.append(el('b', null, r.special ? '전설의 조합!' : r.stars >= 4 ? '대성공!' : r.stars <= 2 ? '음… 실패작?' : '괜찮은 맛'), el('span', 'stars', `맛 ${r.q} ${qStars(r.q)}`));
  const m = { dish: r.dish, ingredients: [r.a, r.b] };
  card.append(dishEl(m), l1, el('div', 'line2 big-name', r.name));
  const l2 = el('div', 'line2'); l2.append(el('span', 'kind', KIND_NAME[r.kind]), tagChips(r.tags));
  if (r.hearty) l2.append(el('span', 'chip t-든든', '든든'));
  if (r.effect) l2.append(el('span', 'chip t-효과', EFFECT_NAME[r.effect]));
  card.append(l2);
  const why = el('ul', 'why');
  for (const x of r.reasons) why.append(el('li', x.v > 0 ? 'up' : x.v < 0 ? 'down' : null, `${x.v > 0 ? '+' : x.v < 0 ? '−' : '·'} ${x.why}`));
  card.append(why);
  if (opts.fans !== false) {
    const id = recipeIdOf(r.a, r.b);
    if (MENUS[id]) card.append(fanRow(id));
  }
  const l3 = el('div', 'line3 btns');
  const rid = recipeIdOf(r.a, r.b);
  if (base) l3.append(el('span', null, `기본 메뉴 '${MENUS[base].name}'와 같은 조합이에요`));
  else if ((state.recipes || {})[rid]) l3.append(el('span', null, menusOnSale(state).includes(rid) ? '메뉴판에서 팔고 있어요' : '메뉴판 대기 중이에요'));
  else if (tried) {
    l3.append(btn('small-btn go-small', '메뉴로 만들기', () => {
      const a = addRecipe(state, r.key);
      if (!a.ok) { toast(a.reason); return; }
      handle(a.ev);
      toast(a.onSale ? `${a.recipe.name}, 메뉴판에 올렸어요!` : `${a.recipe.name}, 메뉴판이 꽉 차서 대기 중이에요`);
      sfx.great(); save(); openSheet('dev', true);
    }));
  }
  card.append(l3);
  return card;
}
function labItems() {
  const out = [];
  const slots = el('div', 'dev-slots');
  slots.append(slotEl('a'), el('span', 'plus', '+'), slotEl('b'));
  const key = lab.a && lab.b ? pairKey(lab.a, lab.b) : null;
  const known = key && ((state.tried || {})[key] || baseMenuFor(lab.a, lab.b));
  const cost = lab.a && lab.b ? labCost(state, lab.a, lab.b) : 0;
  const go = btn('go dev-go', !key ? '재료 두 개를 골라요' : known ? '연구 노트 보기' : `시제품 실험 · ${cost}G`, () => {
    const r = experiment(state, lab.a, lab.b);
    if (!r.ok) { toast(r.reason); sfx.angry(); return; }
    lab.result = r.result.key;
    if (!r.known) { handle(r.ev); if (!r.result.special) (r.result.stars >= 4 ? sfx.great : sfx.tap)(); }
    save(); openSheet('dev', true);
  });
  go.disabled = !key || (!known && state.money < cost);
  const head = el('div', 'idea-row');
  head.append(el('b', null, `창고 재료 ${developable(state).length}개`), el('small', null, `실험은 재료값만 들어요. 💡 아이디어 ${state.ideas || 0}개는 개량과 단서에 써요.`));
  out.push(head, slots, go);
  if (lab.result) { const [a, b] = lab.result.split('+'); out.push(resultCard(evaluate(a, b))); }
  // 재료 고르기: 세계 → 분류별
  const owned = developable(state);
  const cats = ['normal', 'fantasy', ...Object.keys(WORLDS).filter((w) => w !== 'fantasy' && state.unlocked.includes(w))].filter((c) => owned.some((id) => CATALOG[id].category === c));
  if (!cats.includes(lab.cat)) lab.cat = cats[0];
  const tabs = el('div', 'seg');
  for (const c of cats) tabs.append(btn('seg-btn' + (lab.cat === c ? ' on' : ''), `${worldName(c)} ${owned.filter((id) => CATALOG[id].category === c).length}`, () => { lab.cat = c; sfx.tap(); openSheet('dev', true); }));
  out.push(tabs);
  // 맛 속성으로 거르기 + 이름 찾기
  const chips = el('div', 'filter-chips');
  for (const t of ['전체', ...TAGS]) {
    const on = (lab.tag || '전체') === t;
    const b = btn(`chip-btn${on ? ' on' : ''} ${t === '전체' ? '' : `t-${t}`}`, t, () => { lab.tag = t === '전체' ? null : t; sfx.tap(); openSheet('dev', true); });
    chips.append(b);
  }
  const search = el('input', 'search');
  search.type = 'search'; search.placeholder = '재료 이름 찾기'; search.value = lab.q || '';
  search.addEventListener('input', () => { lab.q = search.value.trim(); clearTimeout(lab.qt); lab.qt = setTimeout(() => { openSheet('dev', true); const n = $('sheetBody').querySelector('.search'); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }, 250); });
  out.push(chips, search);
  if (lab.a) out.push(el('p', 'sub', `✓ 표시는 ${CATALOG[lab.a].name}와 이미 실험해 본 재료예요.`));
  const mine = owned.filter((id) => (lab.q ? CATALOG[id].name.includes(lab.q) : CATALOG[id].category === lab.cat) && (!lab.tag || CATALOG[id].tags.includes(lab.tag)));
  if (!mine.length) out.push(el('p', 'sub', '조건에 맞는 재료가 창고에 없어요. 거래처에서 들여와 봐요.'));
  const byCls = {};
  for (const id of mine) (byCls[CATALOG[id].cls] ||= []).push(id);
  for (const [c, ids] of Object.entries(byCls)) {
    out.push(el('div', 'cls-head', CLS_NAME[c]));
    const grid = el('div', 'ing-grid');
    for (const id of ids) {
      const on = lab.a === id || lab.b === id;
      const done = lab.a && lab.a !== id && ((state.tried || {})[pairKey(lab.a, id)] || baseMenuFor(lab.a, id));
      const b = btn('ing-cell' + (on ? ' on' : '') + (done ? ' done' : ''), '', () => {
        if (on) { if (lab.a === id) lab.a = null; else lab.b = null; }
        else if (!lab.a) lab.a = id;
        else lab.b = id;
        lab.result = null; sfx.tap(); openSheet('dev', true);
      });
      b.title = `${CATALOG[id].name} · ${CATALOG[id].tags.join('·') || '담백'}`;
      b.setAttribute('aria-label', `${CATALOG[id].name}${done ? ', 실험함' : ''}`);
      b.append(iconEl(id, 36, ''), el('small', null, CATALOG[id].name));
      if (CATALOG[id].tags.length) { const dots = el('span', 'dots'); for (const t of CATALOG[id].tags) dots.append(el('i', `dot t-${t}`)); b.append(dots); }
      if (done) b.append(el('span', 'done-mark', '✓'));
      grid.append(b);
    }
    out.push(grid);
  }
  return out;
}
function notesItems() {
  const tried = Object.entries(state.tried || {});
  const found = tried.filter(([, t]) => t.special).length;
  const out = [];
  const head = el('div', 'staff-head');
  head.append(el('span', 'tag', `실험 ${tried.length}번`), el('span', 'tag legend', `전설 ${found}/${SPECIALS.length}`), el('span', 'tag', `💡 ${state.ideas || 0}`));
  out.push(head);
  // 단서
  out.push(el('h3', 'sec-title', '단서'));
  const clues = state.clues || [];
  if (!clues.length) out.push(el('p', 'sub', '아주 만족한 손님이 가끔 귀띔해 줘요. 아이디어로 연구해서 얻을 수도 있어요.'));
  for (const c of clues) {
    const li = el('div', 'item plain clue');
    const l1 = el('div', 'line1'); l1.append(el('b', null, c.by ? `${GUESTS[c.by].name}의 귀띔` : '연구 메모'), el('span', 'tag', `${c.day}일째`));
    li.append(l1, el('div', 'line2', c.text));
    const pickBtn = btn('small-btn', '이 재료 고르기', () => { if (inPantry(state, c.known)) { lab.a = c.known; lab.b = null; lab.cat = CATALOG[c.known].category; sheetTab.dev = 'lab'; lab.result = null; sfx.tap(); openSheet('dev', true); } else toast('창고에 없는 재료예요'); });
    const l3 = el('div', 'line3'); l3.append(pickBtn); li.append(l3);
    out.push(li);
  }
  const need = clueCost(state);
  const cb = btn('small-btn go-small', `단서 연구하기 · 💡${need}`, () => {
    const r = buyClue(state);
    if (!r.ok) { toast(r.reason); return; }
    sfx.great(); save(); openSheet('dev', true);
  });
  cb.disabled = (state.ideas || 0) < need;
  out.push(cb);
  out.push(el('h3', 'sec-title', '연구 노트'));
  if (!tried.length) out.push(el('p', 'sub', '아직 실험한 조합이 없어요.'));
  const nf = lab.noteFilter || 'all';
  const fseg = el('div', 'seg');
  for (const [id, label] of [['all', '전체'], ['legend', '전설'], ['good', '별 4개 이상'], ['new', '아직 메뉴 아님']]) fseg.append(btn('seg-btn' + (nf === id ? ' on' : ''), label, () => { lab.noteFilter = id; sfx.tap(); openSheet('dev', true); }));
  out.push(fseg);
  const keep = ([k, t]) => nf === 'legend' ? t.special : nf === 'good' ? starsOf(t.q) >= 4 : nf === 'new' ? !(state.recipes || {})[recipeIdOf(...k.split('+'))] : true;
  for (const [k] of tried.filter(keep).sort((x, y) => (y[1].special - x[1].special) || (y[1].q - x[1].q))) {
    const [a, b] = k.split('+');
    const r = evaluate(a, b);
    if (!r) continue;
    const li = el('div', 'item note' + (r.special ? ' legend' : ''));
    const l1 = el('div', 'line1'); l1.append(el('b', null, r.name), el('span', 'stars', `${r.q} ${qStars(r.q)}`));
    const l2 = el('div', 'line2 ings');
    for (const x of [a, b]) { const t = el('span', 'ing'); t.append(iconEl(x, 24), CATALOG[x].name); l2.append(t); }
    const rid = recipeIdOf(a, b);
    const l3 = el('div', 'line3');
    l3.append(el('span', null, r.reasons[0]?.why || ''));
    if (!(state.recipes || {})[rid]) l3.append(btn('small-btn', '자세히', () => { lab.a = a; lab.b = b; lab.result = k; sheetTab.dev = 'lab'; sfx.tap(); openSheet('dev'); }));
    else l3.append(el('span', 'tag on', '메뉴'));
    li.append(dishEl({ dish: r.dish, ingredients: [a, b] }), l1, l2, l3);
    out.push(li);
  }
  return out;
}
function packItems() {
  const out = [el('p', 'sub', '거래처와 계약하면 재료 꾸러미가 창고에 들어와요. 안에 뭐가 들었는지는 계약해 봐야 알아요.')];
  const cats = ['normal', 'fantasy', 'xian', 'fairy', 'demon', 'heaven'];
  const tabs = el('div', 'seg');
  for (const c of cats) {
    const b = btn('seg-btn' + (lab.packCat === c ? ' on' : ''), c === 'normal' ? '동네' : WORLDS[c].name, () => { lab.packCat = c; sfx.tap(); openSheet('dev', true); });
    if (c !== 'normal' && !state.unlocked.includes(c)) b.classList.add('locked');
    tabs.append(b);
  }
  out.push(tabs);
  if (lab.packCat !== 'normal' && !state.unlocked.includes(lab.packCat)) out.push(el('p', 'sub', `${WORLDS[lab.packCat].name} 문이 열리면 거래할 수 있어요 (평판 ${WORLDS[lab.packCat].unlockRep}).`));
  for (const g of PACK_GROUPS) {
    const packs = allPacks().filter((p) => p.cat === lab.packCat && p.group === g.id);
    if (!packs.length) continue;
    out.push(el('div', 'cls-head', `${g.name} · ${g.cls.map((c) => CLS_NAME[c]).join('·')}`));
    for (const p of packs) {
      const st = packState(state, p);
      if (st === 'later' && packs.some((x) => x.n < p.n && packState(state, x) !== 'owned' && x.n !== p.n - 1)) continue; // 앞앞 꾸러미는 숨김
      const li = el('div', 'item plain pack' + (st === 'owned' ? ' got' : ''));
      const l1 = el('div', 'line1'); const price = packPriceFor(state, p);
      l1.append(el('b', null, p.name), el('span', 'price', st === 'owned' ? '거래 중' : `${fmt(price)} G`));
      const row = el('div', 'icons');
      for (const id of p.items) {
        const known = st === 'owned' || inPantry(state, id);
        const ic = iconEl(id, 32, known ? '' : 'sil');
        ic.title = known ? CATALOG[id].name : `??? (${CLS_NAME[CATALOG[id].cls]})`;
        row.append(ic);
      }
      li.append(l1, row);
      const l3 = el('div', 'line3');
      if (st === 'owned') l3.append(el('span', null, p.items.map((id) => CATALOG[id].name).join(', ')));
      else {
        l3.append(el('span', null, st === 'later' ? '앞 꾸러미부터 계약해요' : st === 'locked' ? '문이 아직 닫혀 있어요' : `재료 ${p.items.length}개 · ${[...new Set(p.items.map((id) => CLS_NAME[CATALOG[id].cls]))].join('·')}`));
        const b = btn('small-btn go-small', '계약하기', () => {
          const r = buyPack(state, p.id);
          if (!r.ok) { toast(r.reason); return; }
          handle(r.ev); save(); openSheet('dev', true);
        });
        b.disabled = st !== 'open' || state.money < price;
        l3.append(b);
      }
      li.append(l3);
      out.push(li);
    }
  }
  return out;
}
function devItems() {
  sheetTab.dev ||= 'lab';
  const tabs = segTabs('dev', [['lab', '실험실'], ['notes', `연구 노트 ${Object.keys(state.tried || {}).length}`], ['packs', '거래처']]);
  return [tabs, ...(sheetTab.dev === 'notes' ? notesItems() : sheetTab.dev === 'packs' ? packItems() : labItems())];
}

// ---------- 도감 ----------
function guestBook() {
  const visits = state.totals.visits || {};
  const seen = Object.keys(visits).length;
  const out = [el('p', 'sub', `가게에 온 손님 ${seen} / ${SPRITES.customers}명. 세 번 넘게 오면 단골이에요.`)];
  const grid = el('div', 'face-grid');
  let lastWorld = null;
  for (let i = 0; i < SPRITES.customers; i++) {
    const n = visits[i] || 0;
    const type = Object.keys(GUESTS).find((t) => GUESTS[t].sprites.includes(i));
    const world = GUESTS[type]?.world;
    if (world !== lastWorld) {
      lastWorld = world;
      const open = state.unlocked.includes(world);
      grid.append(el('h3', 'sec-title face-world', open ? WORLDS[world].name : `${WORLDS[world].name} · 평판 ${WORLDS[world].unlockRep}에서 열림`));
    }
    const cell = btn('face-cell' + (n ? '' : ' unknown') + (n >= 3 ? ' regular' : ''), '', () => {
      toast(n ? `${guestName(type, i)} · ${n}번 방문${n >= 3 ? ' · 단골' : ''}` : '아직 안 온 손님이에요');
    });
    cell.setAttribute('aria-label', n ? `${guestName(type, i)} ${n}번 방문` : '아직 안 온 손님');
    cell.append(guestEl(i, 48, n ? '' : 'sil'));
    if (n) cell.append(el('small', null, String(n)));
    grid.append(cell);
  }
  out.push(grid);
  return out;
}
function worldItems() {
  return Object.entries(WORLDS).map(([id, w]) => {
    const open = state.unlocked.includes(id);
    const li = el('div', 'item world' + (open ? '' : ' closed'));
    const l1 = el('div', 'line1');
    l1.append(el('b', null, w.name), el('span', `tag ${open ? 'on' : ''}`, open ? '문이 열렸어요' : `평판 ${w.unlockRep}에서 열림`));
    li.append(l1, el('div', 'line2', w.blurb));
    const row = el('div', 'icons');
    for (let n = 1; n <= 8; n++) row.append(iconEl(`${id}_${String(n).padStart(3, '0')}`, 36, open ? '' : 'sil'));
    li.append(row);
    // 이 세계 손님 얼굴과 대표 메뉴
    const faces = el('div', 'icons faces');
    for (const [t, g] of Object.entries(GUESTS)) if (g.world === id && g.names) for (const sp of g.sprites) {
      const f = guestEl(sp, 36, open ? '' : 'sil');
      f.title = open ? guestName(t, sp) : '???';
      faces.append(f);
    }
    if (faces.childNodes.length) li.append(faces);
    const menus = Object.entries(MENUS).filter(([, m]) => m.world === id && !m.custom);
    if (id !== 'fantasy' && menus.length) li.append(el('div', 'line3', open ? `세계 메뉴: ${menus.map(([, m]) => m.name).join(', ')}` : `세계 메뉴 ${menus.length}개가 기다려요`));
    if (!open) {
      const m = el('span', 'meter'); const f = el('span');
      f.style.width = `${Math.min(100, (state.rep / w.unlockRep) * 100)}%`;
      m.append(f); li.append(m);
    }
    return li;
  });
}
function achievementItems() {
  const st = stats(state);
  const done = Object.keys(state.achieved || {}).length;
  const out = [el('p', 'sub', `업적 ${done} / ${ACHIEVEMENTS.length}. 달성하면 골드를 받아요.`)];
  for (const a of ACHIEVEMENTS) {
    const got = state.achieved?.[a.id];
    const li = el('div', 'item ach' + (got ? ' got' : ''));
    const l1 = el('div', 'line1'); l1.append(el('b', null, a.name), el('span', `tag ${got ? 'on' : ''}`, got ? `${got}일째 달성` : `+${fmt(a.reward)}G`));
    const m = el('span', 'meter'); const f = el('span');
    f.style.width = `${Math.min(100, ((st[a.stat] || 0) / a.goal) * 100)}%`; m.append(f);
    li.append(el('span', 'medal' + (got ? ' got' : ''), got ? '★' : '☆'), l1, el('div', 'line2', `${a.desc} · ${fmt(Math.min(st[a.stat] || 0, a.goal))}/${fmt(a.goal)}`), m);
    out.push(li);
  }
  return out;
}

// ---------- 장부 ----------
function reviewItem(r) {
  const g = GUESTS[r.guest];
  const li = el('div', 'item review' + (r.rating === 0 ? ' angry' : '') + (r.critic ? ' critic' : ''));
  const sw = r.sprite != null ? guestEl(r.sprite, 48) : el('span', 'sw');
  const l1 = el('div', 'line1');
  const nm = guestName(r.guest, r.sprite);
  l1.append(el('b', null, r.critic ? `미식 평론가 (${nm})` : nm), el('span', r.rating ? 'stars' : null, r.rating ? stars(r.rating) : '화나서 나감'));
  li.append(sw, l1, el('p', 'quote', `“${r.line}”`));
  const l3 = el('div', 'line3');
  if (r.menu && MENUS[r.menu]) l3.append(el('span', null, MENUS[r.menu].name));
  if (r.visit) l3.append(el('span', r.visit >= 3 ? 'regular' : null, r.visit >= 3 ? `단골 · ${r.visit}번째` : `${r.visit}번째 방문`));
  if (r.why?.length) l3.append(el('span', 'why-inline', r.why.join(' · ')));
  li.append(l3);
  return li;
}
function paperEl(p) {
  const box = el('div', 'item plain gazette');
  const c = calendar(p.day);
  box.append(el('div', 'line1', `골목 신문 · ${c.month}월 ${c.date}일 호`));
  const lines = [
    p.rank ? `이번 주 거리 맛집 순위 ${p.rank}위! 일주일 매출 ${fmt(p.sales)}G, 손님 ${fmt(p.served)}명.` : `일주일 매출 ${fmt(p.sales)}G, 손님 ${fmt(p.served)}명.`,
    p.found?.length ? `새로 찾은 맛: ${p.found.join(', ')}` : '이번 주엔 새로 찾은 맛이 없었어요.',
    p.top ? `골목 사람들이 제일 많이 먹은 요리는 '${p.top}'.` : '',
    p.fan ? `단골 ${guestName(Object.keys(GUESTS).find((t) => GUESTS[t].sprites.includes(p.fan.sprite)), p.fan.sprite)} 님과의 정이 ${p.fan.bond}만큼 깊어졌어요.` : '',
    p.trend ? `요즘 유행은 ${p.trend}${p.next ? `, 다음은 ${p.next}래요` : ''}.` : '',
    p.festival ? `곧 ${p.festival}가 열려요.` : '',
    `이달의 요리 대회 주제는 '${p.contest}'. 우리 가게는 지금 '${p.grade}'.`,
  ].filter(Boolean);
  for (const t of lines) box.append(el('p', 'gazette-line', t));
  return box;
}
function statsItems() {
  const last = (state.history || []).slice(-7);
  const out = [];
  const share = btn('go', '📸 식당 카드 만들기 (이미지 저장·공유)', () => shareCard());
  out.push(share);
  if (state.papers?.length) { out.push(el('h3', 'sec-title', '골목 신문')); out.push(paperEl(state.papers[0])); }
  const box = el('div', 'chart');
  box.append(el('h3', 'sec-title', '최근 7일 순이익'));
  if (!last.length) box.append(el('p', 'sub', '하루를 마치면 막대가 생겨요.'));
  const max = Math.max(1, ...last.map((d) => Math.abs(d.profit)));
  const bars = el('div', 'bars');
  for (const d of last) {
    const c = calendar(d.day);
    const col = el('div', 'bar-col');
    const bar = el('span', 'chart-bar' + (d.profit < 0 ? ' neg' : ''));
    bar.style.height = `${Math.max(3, (Math.abs(d.profit) / max) * 100)}%`;
    col.append(el('small', 'bar-v', fmt(d.profit)), bar, el('small', 'bar-d', `${c.month}/${c.date}`));
    bars.append(col);
  }
  box.append(bars);
  out.push(box);
  const st = stats(state);
  const rows = [
    ['받은 손님', `${fmt(st.served)}명`], ['별 다섯 개', `${fmt(st.fiveStars)}번`], ['단골', `${st.regulars}명`],
    ['손님 도감', `${st.faces}/${SPRITES.customers}`], ['유행 메뉴', `${fmt(st.trendSold)}그릇`], ['최고 하루 매출', `${fmt(st.bestSales)}G`],
    ['직원', `${st.staff}명`], ['개발한 메뉴', `${st.recipes}개`],
    ['탁자', `${st.tables}개`], ['분위기', `${atmosphere(state)}`], ['아이디어', `${state.ideas || 0}개`],
    ['최고 순위', state.rank ? `${state.rank.best}위` : '아직'], ['대회 우승', `${st.contestWins}번`],
  ];
  const t = el('table', 'stat-table');
  for (const [k, v] of rows) { const tr = el('tr'); tr.append(el('th', null, k), el('td', null, v)); t.append(tr); }
  out.push(t);
  return out;
}

// ---------- 가게: 꾸미기, 홍보, 순위 ----------
function buildItems() {
  const out = [];
  const n = state.tables, Z = zoneOf(state), nz = nextZone(state);
  const head = el('div', 'staff-head');
  head.append(el('span', 'tag', Z.name), el('span', 'tag', `탁자 ${n}개 · ${n * 2}석`), el('span', 'tag', `분위기 ${atmosphere(state)}`));
  out.push(head);
  const eb = btn('go', '배치 바꾸기', () => enterEdit());
  out.push(eb, el('p', 'sub', '탁자는 종업원 자리에서 가까울수록 빨리 받아요. 장식 가까운 자리일수록 손님이 더 만족해요.'));
  // 가게 넓히기
  if (nz) {
    const li = el('div', 'item expand');
    const l1 = el('div', 'line1'); l1.append(el('b', null, `가게 넓히기 · ${nz.name}`), el('span', 'price', `${fmt(nz.price)} G`));
    const can = !nz.needWorld || state.unlocked.length > 1;
    const b = btn('small-btn go-small', '공사하기', () => {
      const r = expandShop(state);
      if (!r.ok) { toast(r.reason); return; }
      handle(r.ev); save(); closeSheet();
    });
    b.disabled = !can || state.money < nz.price;
    const l3 = el('div', 'line3'); l3.append(el('span', null, can ? `홀이 ${nz.rows - Z.rows}줄 늘어요` : '세계 문을 하나 열면 지을 수 있어요'), b);
    li.append(partEl('floor_wood'), l1, el('div', 'line2', nz.desc), l3);
    out.push(li);
  }
  // 세계 별관 테마
  if ((state.zone ?? 0) >= 2) {
    const worlds = state.unlocked.filter((w) => w !== 'fantasy');
    const li = el('div', 'item plain expand');
    const l1 = el('div', 'line1'); l1.append(el('b', null, `세계 별관 · ${state.annexWorld ? WORLDS[state.annexWorld].name : '테마 없음'}`), el('span', 'tag', state.annexWorld ? `바꾸기 ${ANNEX_CHANGE_PRICE}G` : '처음은 공짜'));
    const row = el('div', 'line3');
    for (const w of worlds) {
      const b = btn('small-btn' + (state.annexWorld === w ? ' on' : ' go-small'), WORLDS[w].name, () => {
        const r = setAnnexWorld(state, w);
        if (!r.ok) { toast(r.reason); return; }
        relayout(); sfx.levelUp(); toast(`${WORLDS[w].name} 별관이 됐어요. ${WORLDS[w].name} 손님이 별관 자리를 좋아해요`); save(); openSheet('ledger', true);
      });
      b.disabled = state.annexWorld === w || (state.annexWorld && state.money < ANNEX_CHANGE_PRICE);
      row.append(b);
    }
    li.append(l1, el('div', 'line2', '별관 바닥이 그 세계 색이 되고, 그 세계 손님이 별관 자리에 앉으면 만족 +6.'), row);
    out.push(li);
  }
  out.push(el('h3', 'sec-title', '탁자'));
  const price = tablePrice(state);
  const room = tableSpots(state).length > 0;
  const li = el('div', 'item');
  const l1 = el('div', 'line1'); l1.append(el('b', null, price == null ? '탁자를 다 들였어요' : `${n + 1}번째 탁자`), el('span', 'price', price == null ? '' : `${fmt(price)} G`));
  const tb = btn('small-btn go-small', '들이기', () => {
    const r = buyTable(state);
    if (!r.ok) { toast(r.reason); sfx.angry(); return; }
    handle(r.ev); save(); openSheet('ledger', true);
  });
  tb.disabled = price == null || !room || state.money < price;
  const l3 = el('div', 'line3'); l3.append(el('span', null, price == null ? '' : room ? '손님 자리 +2 · 빈 곳에 놓여요' : '놓을 자리가 없어요. 넓히거나 배치를 바꿔요'), tb);
  li.append(partEl('wood_table'), l1, l3);
  out.push(li);
  out.push(el('h3', 'sec-title', '장식'));
  for (const d of DECOR) {
    const open = decorOpen(state, d);
    const have = Object.values(state.decor || {}).filter((x) => x === d.id).length;
    const li2 = el('div', 'item' + (open ? '' : ' off'));
    const l1b = el('div', 'line1'); l1b.append(el('b', null, d.name + (have ? ` ×${have}` : '')), el('span', 'price', open ? `${fmt(d.price)} G` : '잠김'));
    const src = REQUESTS.find((r) => r.reward.decor === d.id);
    const l2 = el('div', 'line2', `분위기 +${d.atmos}${d.desc ? ` · ${d.desc}` : ''}${open ? '' : src ? ` · 의뢰 '${src.title}' 보상` : d.unlock === 'contest' ? ' · 요리 대회 우승 보상' : ''}`);
    const b = btn('small-btn go-small', '들여놓기', () => {
      const r = buyDecor(state, d.id);
      if (!r.ok) { toast(r.reason); return; }
      handle(r.ev); save(); openSheet('ledger', true);
    });
    b.disabled = !open || state.money < d.price;
    const l3b = el('div', 'line3'); l3b.append(b);
    if (state.decor?.[KITCHEN_DECOR] !== d.id) {
      const kb = btn('small-btn', '주방 자리에', () => { const r = buyDecor(state, KITCHEN_DECOR, d.id); if (!r.ok) { toast(r.reason); return; } handle(r.ev); save(); openSheet('ledger', true); });
      kb.disabled = !open || state.money < d.price;
      l3b.append(kb);
    }
    const pe = partEl(d.art || d.id);
    if (d.hue) pe.style.filter = `hue-rotate(${d.hue}deg)`;
    li2.append(pe, l1b, l2, l3b);
    out.push(li2);
  }
  // 조리 설비
  out.push(el('h3', 'sec-title', '조리 설비'));
  out.push(el('p', 'sub', '요리사 자리마다 설비 하나. 그 자리 요리사가 맞는 요리를 빨리 만들어요.'));
  getMap().cookSpots.forEach((_, slot) => {
    const cur = EQUIPMENT.find((x) => x.id === state.equip?.[slot]);
    const cook = state.cooks.find((c) => c.slot === slot);
    const li3 = el('div', 'item plain');
    const l1c = el('div', 'line1'); l1c.append(el('b', null, `${slot + 1}번 자리 · ${cur ? cur.name : '기본 조리대'}`), el('span', 'tag', cook ? cook.name : '비어 있음'));
    const row = el('div', 'line3');
    for (const E of EQUIPMENT) {
      const b = btn('small-btn' + (cur?.id === E.id ? ' on' : ''), `${E.short} ${fmt(E.price)}G`, () => {
        const r = buyEquip(state, slot, E.id);
        if (!r.ok) { toast(r.reason); return; }
        sfx.levelUp(); toast(`${E.name}: ${E.kinds.map((k) => KIND_NAME[k]).join('·')} ${Math.round((1 - E.mult) * 100)}% 빨리`); save(); openSheet('ledger', true);
      });
      b.title = `${E.name}: ${E.kinds.map((k) => KIND_NAME[k]).join('·')}`;
      b.disabled = cur?.id === E.id || state.money < E.price;
      row.append(b);
    }
    li3.append(l1c, el('div', 'line2', cur ? `${cur.kinds.map((k) => KIND_NAME[k]).join('·')}를 ${Math.round((1 - cur.mult) * 100)}% 빨리 만들어요` : '설비를 놓으면 특정 요리가 빨라져요'), row);
    out.push(li3);
  });
  return out;
}

// ---------- 배치 모드 ----------
let editMode = null;
document.getElementById('editDone')?.addEventListener('click', () => exitEdit());
function editLabels() {
  return state.tablePos.map((t) => ({ x: t.x, y: t.y, text: `배달 ${deliverySteps(state, t)}걸음` }));
}
function enterEdit() {
  closeSheet();
  editMode = { sel: null };
  renderer.setEdit({ sel: null, spots: [], labels: editLabels() });
  $('editBar').hidden = false;
  $('coach').hidden = true;
  $('editText').textContent = '옮길 탁자나 장식을 눌러요';
  selected = null; renderer.select(null); showCard();
}
function exitEdit() {
  editMode = null;
  renderer.setEdit(null);
  $('editBar').hidden = true;
  save();
  tutorialShow();
}
function editPick(x, y) {
  const tIdx = state.tablePos.findIndex((t) => x >= t.x && x <= t.x + 1 && y >= t.y - 1 && y <= t.y + 1);
  const dKey = state.decor?.[`${x},${y}`] && `${x},${y}` !== KITCHEN_DECOR ? `${x},${y}` : null;
  const sel = editMode.sel;
  if (sel) {
    const spots = editMode.spots || [];
    const hit = sel.kind === 'table' ? spots.find((p) => p.y === y && (p.x === x || p.x + 1 === x)) : spots.find((p) => p.x === x && p.y === y);
    if (hit) {
      const r = sel.kind === 'table' ? moveTable(state, sel.i, hit.x, hit.y) : moveDecor(state, sel.spot, hit.x, hit.y);
      if (!r.ok) { toast(r.reason); sfx.angry(); return; }
      sfx.great();
      relayout();
      editMode = { sel: null };
      renderer.setEdit({ sel: null, spots: [], labels: editLabels() });
      $('editText').textContent = '옮겼어요! 다른 것도 옮기거나 끝내기를 눌러요';
      return;
    }
  }
  if (tIdx >= 0) {
    const spots = tableSpots(state, tIdx);
    editMode = { sel: { kind: 'table', i: tIdx }, spots };
    $('editText').textContent = spots.length ? '초록 칸으로 옮겨요. 숫자는 배달 걸음 수예요' : '이 탁자는 옮길 곳이 없어요';
  } else if (dKey) {
    const spots = decorSpotsFree(state, dKey);
    editMode = { sel: { kind: 'decor', spot: dKey }, spots };
    $('editText').textContent = '분홍 칸 자리에 분위기가 닿아요. 초록 칸으로 옮겨요';
  } else {
    editMode = { sel: null };
    $('editText').textContent = '옮길 탁자나 장식을 눌러요';
  }
  sfx.tap();
  renderer.setEdit({ ...editMode, labels: editLabels() });
}
// 배치나 넓이가 바뀌면 지도와 그리기 도구를 새로 만든다
function relayout() {
  setLayout(state);
  renderer = createRenderer($('game'), state.annexWorld);
  renderer.select(selected);
  if (editMode) renderer.setEdit({ ...editMode, labels: editLabels() });
  fit();
}

function promoItems() {
  const now = activePromo(state);
  const out = [el('p', 'sub', '홍보는 한 번에 하나만 할 수 있어요. 영업 전에 해 두면 그날부터 손님이 늘어요.')];
  if (now) {
    const c = el('div', 'item plain trend-card');
    const l1 = el('div', 'line1'); l1.append(el('b', null, `홍보 중 · ${now.name}`), el('span', 'tag hot', state.promo.until === state.day ? '오늘까지' : `${state.promo.until - state.day + 1}일 남음`));
    c.append(l1, el('div', 'line2', `손님 ${now.mult}배`));
    out.push(c);
  }
  for (const p of PROMOS) {
    const li = el('div', 'item plain');
    const pp = promoPrice(state, p);
    const l1 = el('div', 'line1'); l1.append(el('b', null, p.name), el('span', 'price', `${fmt(pp)} G`));
    const b = btn('small-btn go-small', now ? '홍보 중' : '하기', () => {
      const r = promote(state, p.id);
      if (!r.ok) { toast(r.reason); return; }
      handle(r.ev); save(); openSheet('ledger', true);
    });
    b.disabled = !!now || state.money < pp;
    const l3 = el('div', 'line3'); l3.append(el('span', null, `${p.days}일 · 손님 ×${p.mult}${p.rep ? ` · 평판 +${p.rep}` : ''}`), b);
    li.append(l1, el('div', 'line2', p.desc), l3);
    out.push(li);
  }
  return out;
}
function themeNeeds(t) {
  const bits = [];
  if (t.kinds) bits.push(t.kinds.map((k) => KIND_NAME[k]).join('·'));
  if (t.tags) bits.push(`${t.tags.join('·')} 맛`);
  if (t.cls) bits.push(`${t.cls.map((c) => CLS_NAME[c]).join('·')} 재료`);
  if (t.world) bits.push(`${WORLDS[t.world].name} 요리 가산점`);
  if (t.hearty === 1) bits.push('든든하게');
  if (t.hearty === -1) bits.push('가볍게');
  if (t.maxPrice) bits.push(`${t.maxPrice}G 이하`);
  return bits.join(' · ');
}
function contestItems() {
  const out = [];
  const c = calendar(state.day);
  const left = CONFIG.contest.day - c.date;
  const theme = contestTheme(state);
  const box = el('div', 'item plain contest-card');
  const l1 = el('div', 'line1');
  const lg = leagueOf(state), lvl = state.league || 0, isTop = lvl >= CONFIG.contest.leagues.length - 1;
  l1.append(el('b', null, `${lg.name} · ${theme.name}`), el('span', 'tag' + (left <= CONFIG.contest.notice ? ' hot' : ''), left === 0 ? '오늘 밤!' : `${left}일 뒤`));
  box.append(l1, el('div', 'line2', `심사 기준: ${themeNeeds(theme)}`),
    el('div', 'line3', `맛 × 0.7 + 주제 맞춤 + 개량 + 메뉴 레벨로 심사해요. 1등 ${fmt(Math.round(CONFIG.contest.prizes[0].gold * (1 + lvl * 0.5)))}G와 트로피${isTop ? '. 최고 등급이에요!' : `, 그리고 ${CONFIG.contest.leagues[lvl + 1].name}로 승급`}.`),
    el('div', 'line3', `등급 ${lvl + 1}/${CONFIG.contest.leagues.length} · ${CONFIG.contest.leagues.map((x, i) => (i === lvl ? `[${x.name}]` : x.name)).join(' → ')}`));
  out.push(box);
  out.push(el('h3', 'sec-title', '출품할 메뉴 고르기'));
  const pick = contestEntry(state);
  const top = Math.max(...RIVALS.map((r) => rivalContestScore(state, r)));
  out.push(el('p', 'sub', `경쟁 가게 중 가장 센 곳은 ${top - 6}~${top + 6}점쯤 나올 것 같아요. ${state.contestPick ? '' : '아직 안 골랐어요. 안 고르면 주제에 가장 맞는 메뉴가 나가요.'}`));
  const list = availableMenus(state).map((id) => [id, contestScore(state, theme, id)]).sort((a, b) => b[1].score - a[1].score).slice(0, 8);
  for (const [id, sc] of list) {
    const li = el('div', 'item contest-pick' + (pick === id ? ' on' : ''));
    const l1b = el('div', 'line1'); l1b.append(el('b', null, MENUS[id].name), el('span', 'price', `${sc.score}점`));
    const notes = el('div', 'line2');
    for (const [sign, t] of sc.notes.slice(0, 3)) notes.append(el('span', sign === '+' ? 'up' : 'down', `${sign} ${t} `));
    const b = btn('small-btn' + (pick === id && state.contestPick ? ' on' : ' go-small'), pick === id && state.contestPick ? '출품 확정' : '이걸로 출품', () => {
      setContestPick(state, id); sfx.great(); toast(`${MENUS[id].name}(으)로 출품해요`); save(); openSheet('ledger', true);
    });
    const l3 = el('div', 'line3'); l3.append(b);
    li.append(dishEl(MENUS[id]), l1b, notes, l3);
    out.push(li);
  }
  if (state.contestLast) {
    const L = state.contestLast;
    const lb = el('div', 'item plain');
    lb.append(el('div', 'line1', `지난 대회 ${L.place}위 · ${MENUS[L.entry]?.name || ''} ${L.score ? `(${L.score}점)` : ''}`));
    const n = el('div', 'line2'); for (const [sign, t] of (L.notes || []).slice(0, 4)) n.append(el('span', sign === '+' ? 'up' : 'down', `${sign} ${t} `));
    lb.append(n);
    out.push(lb);
  }
  out.push(el('h3', 'sec-title', '거리 맛집 순위'));
  out.push(el('p', 'sub', `${CONFIG.ranking.every}일마다 매겨요. 점수는 평판 + 그 주 매출 ÷ ${CONFIG.ranking.salesDiv}. 지금 우리 점수 ${fmt(ourScore(state))}.`));
  const rl = state.rank?.list || [...RIVALS.map((r) => ({ name: r.name, score: rivalScore(r, state.day) })), { name: '우리 가게', score: ourScore(state), me: true }].sort((a, b) => b.score - a.score);
  const t = el('table', 'stat-table rank-table');
  rl.forEach((r, i) => { const tr = el('tr', r.me ? 'me' : null); tr.append(el('th', null, `${i + 1}위 ${r.name}`), el('td', null, fmt(r.score))); t.append(tr); });
  out.push(t);
  return out;
}
function rewardText(R) {
  const bits = [];
  if (R.gold) bits.push(`${fmt(R.gold)}G`);
  if (R.ideas) bits.push(`💡${R.ideas}`);
  if (R.ingredients) bits.push(`재료 ${R.ingredients.length}개`);
  if (R.decor) bits.push(`장식 '${DECOR.find((d) => d.id === R.decor)?.name}'`);
  if (R.invite) bits.push(`${WORLDS[R.invite].name} 손님 소개`);
  if (R.perk) bits.push(PERKS[R.perk] ? PERKS[R.perk].split(':')[0] : '단골 혜택');
  if (R.pack) bits.push('거래처 꾸러미');
  return bits.join(' · ');
}
function needText(N) {
  const bits = [];
  if (N.kinds) bits.push(N.kinds.map((k) => KIND_NAME[k]).join('·'));
  if (N.tags) bits.push(`${N.tags.join('·')} 맛`);
  if (N.world) bits.push(`${WORLDS[N.world].name} 요리`);
  if (N.hearty === true) bits.push('든든하게');
  if (N.hearty === false) bits.push('가볍게');
  if (N.maxPrice) bits.push(`${N.maxPrice}G 이하`);
  bits.push(`별 ${N.minStars || 3}개 이상`);
  return bits.join(' · ');
}
function requestItems() {
  const out = [el('p', 'sub', '손님이 부탁한 요리를 메뉴판에 올려 두면, 그 손님이 와서 먹고 만족했을 때 의뢰가 끝나요.')];
  const open = openRequests(state);
  if (!open.length) out.push(el('p', 'sub', '지금은 의뢰가 없어요. 새 세계가 열리거나, 단골과 정이 깊어지면 의뢰가 와요.'));
  for (const r of open) {
    const li = el('div', 'item request');
    const bestFace = GUESTS[r.by].sprites.slice().sort((a, b) => (state.bonds?.[b] || 0) - (state.bonds?.[a] || 0))[0];
    const l1 = el('div', 'line1'); l1.append(el('b', null, r.title), el('span', 'tag', guestName(r.by, bestFace)));
    const fits = availableMenus(state).filter((id) => requestFits(state, r, id).ok);
    const sale = fits.filter((id) => menusOnSale(state).includes(id));
    li.append(guestEl(bestFace, 48), l1, el('p', 'quote', `“${r.line}”`), el('div', 'line2', `조건: ${needText(r.need)}`), el('div', 'line2', `보상: ${rewardText(r.reward)}`));
    li.append(el('div', 'line3' + (sale.length ? ' ok' : ''), sale.length ? `✓ 판매 중: ${sale.map((id) => MENUS[id].name).join(', ')}` : fits.length ? `메뉴판에 올리면 돼요: ${fits.map((id) => MENUS[id].name).join(', ')}` : '맞는 메뉴가 없어요. 실험해서 만들어 봐요.'));
    out.push(li);
  }
  // 단골
  const regs = Object.entries(state.bonds || {}).filter(([, v]) => v >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8);
  out.push(el('h3', 'sec-title', '단골과의 정'));
  if (!regs.length) out.push(el('p', 'sub', '만족한 식사가 쌓이면 정이 깊어져요. 정이 8을 넘은 손님은 부탁을 해요.'));
  for (const [sp, v] of regs) {
    const type = Object.keys(GUESTS).find((t) => GUESTS[t].sprites.includes(Number(sp)));
    const li = el('div', 'item');
    const l1 = el('div', 'line1'); l1.append(el('b', null, guestName(type, Number(sp))), el('span', 'tag', `정 ${Math.floor(v)}`));
    const m = el('span', 'meter'); const f = el('span'); f.style.width = `${Math.min(100, (v / 30) * 100)}%`; m.append(f);
    li.append(guestEl(Number(sp), 48), l1, el('div', 'line2', `좋아하는 것: ${GUESTS[type].hint}`), m);
    out.push(li);
  }
  const perks = Object.keys(state.perks || {});
  if (perks.length) { out.push(el('h3', 'sec-title', '단골 혜택')); for (const k of perks) out.push(el('p', 'sub', `★ ${PERKS[k]}`)); }
  const done = REQUESTS.filter((r) => state.requests?.[r.id]?.state === 'done');
  if (done.length) out.push(el('p', 'sub', `마친 의뢰 ${done.length}개: ${done.map((r) => r.title).join(', ')}`));
  return out;
}
function reviewItems() {
  return state.log.length ? state.log.slice(0, 25).map(reviewItem) : [el('p', 'sub', '첫 손님이 밥을 다 먹으면 여기에 한마디가 남아요.')];
}

// ---------- 할 일: 가게 목표, 오늘의 미션, 다가오는 일 ----------
let todoKey = '';
function updateTodo() {
  const chip = $('todoChip');
  if (!chip) return;
  if (onTitle || !state || editMode) { chip.hidden = true; todoKey = ''; return; }
  const g = goalProgress(state);
  const m = state.missions || [];
  const key = `${g?.id}|${g?.have}|${m.map((x) => x.done).join()}`;
  if (key === todoKey) return;
  todoKey = key;
  chip.hidden = false;
  chip.replaceChildren(chip.querySelector('.badge') || el('span', 'badge'), el('b', null, '할 일'), el('span', null, g ? `${g.name} ${g.have}/${g.goal}` : '목표 모두 달성!'), el('small', null, `미션 ${m.filter((x) => x.done).length}/${m.length}`));
}
function todoItems() {
  const out = [];
  const grade = GRADES[gradeOf(state.rep)], nextG = GRADES[gradeOf(state.rep) + 1];
  const head = el('div', 'staff-head');
  head.append(el('span', 'tag legend', grade.name), el('span', 'tag', nextG ? `다음 등급 '${nextG.name}'까지 평판 ${Math.max(0, Math.ceil(nextG.rep - state.rep))}` : '최고 등급!'));
  out.push(head);
  const g = goalProgress(state);
  out.push(el('h3', 'sec-title', `가게 목표 ${state.goalIdx || 0}/${GOALS.length}`));
  if (g) {
    const li = el('div', 'item plain goal');
    const l1 = el('div', 'line1'); l1.append(el('b', null, g.name), el('span', 'tag', `${g.have}/${g.goal}`));
    const m2 = el('span', 'meter'); const f = el('span'); f.style.width = `${Math.round((g.have / g.goal) * 100)}%`; m2.append(f);
    const rw = [g.reward.gold && `${fmt(g.reward.gold)}G`, g.reward.ideas && `💡${g.reward.ideas}`].filter(Boolean).join(' · ');
    li.append(l1, el('div', 'line2', g.desc), m2, el('div', 'line3', `보상 ${rw}`));
    if (g.dock) { const b = btn('small-btn go-small', '하러 가기', () => { const name = $(g.dock).dataset.sheet; openSheet(name); }); li.querySelector('.line3').append(b); }
    out.push(li);
  } else out.push(el('p', 'sub', '모든 목표를 이뤘어요. 이제 이 골목의 전설이에요!'));
  const done = GOALS.slice(0, state.goalIdx || 0);
  if (done.length) out.push(el('p', 'sub', `이룬 목표: ${done.map((x) => x.name).join(' · ')}`));
  out.push(el('h3', 'sec-title', '오늘의 미션'));
  for (const m of state.missions || []) {
    const li = el('div', 'item plain mission' + (m.done ? ' got' : ''));
    const l1 = el('div', 'line1'); l1.append(el('b', null, `${m.done ? '✓ ' : ''}${m.text}`), el('span', 'tag' + (m.done ? ' on' : ''), m.done ? '완료' : `${Math.min(m.have, m.need)}/${m.need}`));
    li.append(l1, el('div', 'line3', `보상 ${m.reward.gold ? `${fmt(m.reward.gold)}G` : `💡${m.reward.ideas}`}`));
    out.push(li);
  }
  out.push(el('h3', 'sec-title', '다가오는 일'));
  const soon = [];
  const fest = festivalOf(state), nf = nextFestival(state);
  if (fest) soon.push(`🎉 지금 ${fest.name}! ${fest.tag} 요리를 손님이 더 찾고 15% 비싸게 팔려요 (16일까지)`);
  else if (nf) soon.push(`🎉 ${nf.inDays}일 뒤 ${nf.name}: ${nf.tag} 요리를 준비해 둬요`);
  if (state.vip && state.vip.day >= state.day && !state.vip.done) {
    const V = VIPS.find((v) => v.world === state.vip.world), W = vipWant(state);
    const fits = menusOnSale(state).filter((id) => vipFits(state, id));
    soon.push(`👑 ${state.vip.day === state.day ? '오늘' : '내일'} ${V.name} 방문: ${W.kinds.map((k) => KIND_NAME[k]).join('·')} 중 ${W.tags.join('·')} 맛을 원해요. ${fits.length ? `✓ ${fits.map((id) => MENUS[id].name).join(', ')}` : '맞는 메뉴를 올려 둬요'}`);
  }
  const c = calendar(state.day);
  soon.push(`🏆 ${CONFIG.contest.day - c.date >= 0 ? `${CONFIG.contest.day - c.date}일 뒤` : '다음 달'} ${leagueOf(state).name} · ${contestTheme(state).name}`);
  if (state.nextTrend) soon.push(`📈 다음 유행 예고: ${trendLabel(state.nextTrend)}`);
  for (const t of soon) out.push(el('div', 'item plain soon', t));
  return out;
}

// ---------- 소식 기록 ----------
function newsItems() {
  if (!newsLog.length) return [el('p', 'sub', '아직 소식이 없어요.')];
  return newsLog.map((n) => { const li = el('div', 'item plain news'); li.append(el('div', 'line3', n.day ? `${calendar(n.day).month}/${calendar(n.day).date} ${clockText(n.clock || 0)}` : ''), el('div', 'line2', n.text)); return li; });
}

// ---------- 요리 도감 ----------
function dishBookItems() {
  const book = state.dishBook || {};
  const out = [el('p', 'sub', `팔거나 메뉴로 만든 요리가 모여요. ${Object.keys(book).length} / 80종`)];
  const grid = el('div', 'face-grid dish-grid');
  for (const set of ['b', 'f']) for (let n = 0; n < 40; n++) {
    const id = `${set}${String(n).padStart(2, '0')}`;
    const d = dishOf(id);
    const cell = el('div', 'face-cell' + (book[id] ? '' : ' unknown'));
    cell.append(cellEl(dishSheetUrl(d.set, 48), d.col, d.row, 44, book[id] ? '' : 'sil', 8, 5));
    cell.title = book[id] ? d.name : '???';
    grid.append(cell);
  }
  out.push(grid);
  out.push(el('h3', 'sec-title', `전설의 조합 ${Object.values(state.tried || {}).filter((t) => t.special).length} / ${SPECIALS.length}`));
  const lg = el('div', 'legend-list');
  for (const sp of SPECIALS) {
    const key = pairKey(sp.a, sp.b);
    const found = state.tried?.[key];
    const clue = (state.clues || []).find((c) => c.key === key);
    const w = [sp.a, sp.b].map((x) => CATALOG[x]?.category).find((c) => c && c !== 'normal') || 'normal';
    const li = el('div', 'item legend-row' + (found ? ' legend' : ' off'));
    const d = dishOf(sp.dish);
    li.append(cellEl(dishSheetUrl(d.set, 48), d.col, d.row, 40, found ? '' : 'sil', 8, 5));
    li.append(el('div', 'line1', found ? sp.name : `??? · ${worldName(w)} 재료`), el('div', 'line3', found ? `${CATALOG[sp.a].name} + ${CATALOG[sp.b].name} · ${EFFECT_NAME[sp.effect]}` : clue ? `단서: ${clue.text}` : '아직 단서가 없어요'));
    lg.append(li);
  }
  out.push(lg);
  return out;
}

// ---------- 식당 카드 (이미지로 저장·공유) ----------
async function shareCard() {
  const W = 720, H = 1080;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.fillStyle = '#1b2036'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#2a3150'; x.fillRect(16, 16, W - 32, H - 32);
  const game = $('game');
  const gh = Math.min(640, (game.height / game.width) * (W - 80));
  x.drawImage(game, 40, 120, W - 80, gh);
  x.strokeStyle = '#ffd35a'; x.lineWidth = 4; x.strokeRect(40, 120, W - 80, gh);
  const logo = new Image(); logo.src = 'assets/ui/title_logo.png';
  try { await logo.decode(); x.drawImage(logo, W / 2 - 110, 16, 220, 147); } catch { /* 글자만 */ }
  const st = stats(state), c0 = calendar(state.day);
  const top = Object.entries(state.totals.sold || {}).filter(([id]) => MENUS[id]).sort((a, b) => b[1] - a[1])[0];
  const lines = [
    `${GRADES[gradeOf(state.rep)].name} · ${c0.year}년 차 ${c0.month}월 ${c0.date}일`,
    `손님 ${fmt(st.served)}명 · 평판 ${Math.round(state.rep)} · 열린 세계 ${state.unlocked.length}/5`,
    `전설 ${st.specials}/${SPECIALS.length} · 요리 도감 ${st.dishes}/80 · 손님 도감 ${st.faces}/${SPRITES.customers}`,
    top ? `대표 메뉴: ${MENUS[top[0]].name} (${fmt(top[1])}그릇)` : '',
  ].filter(Boolean);
  x.fillStyle = '#fff4dc'; x.textAlign = 'center';
  x.font = '700 28px Galmuri11, sans-serif';
  lines.forEach((t, i) => x.fillText(t, W / 2, 120 + gh + 60 + i * 44));
  x.font = '20px Galmuri11, sans-serif'; x.fillStyle = '#9aa3c8';
  x.fillText('차원골목 식당 · 바이브코딩러 다미', W / 2, H - 40);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  const file = new File([blob], `chawon-golmok-card-${state.day}.png`, { type: 'image/png' });
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: '차원골목 식당' }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
  const a = el('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('식당 카드를 저장했어요');
}

// ---------- 홈 화면 바로가기 ----------
// 설치형 앱(오프라인·서비스 워커)은 쓰지 않는다. 폰 홈 화면에 아이콘과 이름으로 바로가기만 만든다.
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function homeScreenHelp() {
  if (isIOS()) toast('사파리 아래 공유 버튼(□↑) → "홈 화면에 추가"를 눌러요');
  else toast('브라우저 메뉴(⋮) → "홈 화면에 추가"를 눌러요');
}
function setupApp() {
  // 저장이 브라우저 정리로 지워지지 않게 부탁해 둔다
  navigator.storage?.persist?.().catch(() => {});
  // 1.1에서 잠깐 쓰던 오프라인 저장(서비스 워커)을 지운다. 이제 늘 새 파일로 열린다.
  navigator.serviceWorker?.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  globalThis.caches?.keys?.().then((ks) => ks.filter((k) => k.startsWith('isekai-diner-')).forEach((k) => caches.delete(k))).catch(() => {});
}

// ---------- 저장 파일 백업 ----------
async function exportSave() {
  save();
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { /* 없음 */ }
  if (!raw) { toast('저장이 아직 없어요'); return; }
  const c = calendar(state.day);
  const name = `chawon-golmok-y${c.year}-${String(c.month).padStart(2, '0')}${String(c.date).padStart(2, '0')}-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([raw], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: '차원골목 식당 저장' }); return; }
  } catch (e) { if (e?.name === 'AbortError') return; }
  const a = el('a');
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('저장 파일을 내려받았어요');
}
function importSave() {
  const input = el('input');
  input.type = 'file'; input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (!s || typeof s.money !== 'number' || !Array.isArray(s.guests) || !(s.v >= 1 && s.v <= CONFIG.saveVersion)) throw new Error('모양이 달라요');
      const c = calendar(s.day || 1);
      if (!confirm(`${c.year}년 차 ${c.month}월 ${c.date}일, ${Math.round(s.money).toLocaleString('ko-KR')}G 저장으로 바꿀까요? 지금 판은 사라져요.`)) return;
      try { localStorage.setItem(`${SAVE_KEY}-before-import-${Date.now()}`, localStorage.getItem(SAVE_KEY) || ''); } catch { /* 자리 없음 */ }
      state = migrate(s);
      registerRecipes(state);
      shownMoney = state.money;
      relayout();
      save(true);
      closeSheet();
      toast('저장을 불러왔어요!');
    } catch (e) { toast(`불러오지 못했어요: ${e.message}`); }
  });
  input.click();
}

function settingsItems() {
  const row = (label, b) => { const r = el('div', 'setting'); r.append(el('span', null, label), b); return r; };
  const sb = btn('small-btn', isMuted() ? '켜기' : '끄기', () => { setMuted(!isMuted()); sb.textContent = isMuted() ? '켜기' : '끄기'; sfx.tap(); });
  const bb = btn('small-btn', isBgmOn() ? '끄기' : '켜기', () => { unlockAudio(); setBgm(!isBgmOn()); bb.textContent = isBgmOn() ? '끄기' : '켜기'; });
  const tb = btn('small-btn', '타이틀로', () => { save(true); closeSheet(); showTitle(); });
  const keys = el('div', 'item keys');
  keys.append(el('b', null, 'PC 단축키'), el('div', 'line2', '스페이스 멈춤 · 1 2 4 속도 · M 메뉴판 · Esc 닫기'));
  const ib = btn('small-btn', '방법 보기', () => homeScreenHelp());
  const io = el('div', 'btns');
  io.append(btn('small-btn', '내보내기', () => exportSave()), btn('small-btn', '불러오기', () => importSave()));
  return [row('효과음', sb), row('배경음악', bb), row('홈 화면에 추가', ib), row('저장 파일 (다른 기기로 옮기기·백업)', io), row('저장하고 타이틀로', tb), keys,
    el('p', 'credit', '손님·점원·재료·요리·가게 그림은 바이브코딩러 다미 제작. 글꼴은 갈무리 Galmuri11 (이민서, SIL 오픈 폰트 라이선스 1.1). 효과음과 배경음악은 코드로 만든 임시예요.')];
}

const SHEETS = {
  menu: { title: '메뉴판', build: () => [...trendCard(), ...menuItems()] },
  staff: { title: '직원', build: staffItems },
  dev: { title: '신메뉴 연구', build: devItems },
  book: { title: '도감', build: () => [segTabs('book', [['guests', '손님'], ['dishes', '요리'], ['worlds', '세계'], ['ach', '업적']]),
    ...(sheetTab.book === 'guests' ? guestBook() : sheetTab.book === 'dishes' ? dishBookItems() : sheetTab.book === 'worlds' ? worldItems() : achievementItems())] },
  ledger: { title: '가게', build: () => [segTabs('ledger', [['build', '꾸미기'], ['promo', '홍보'], ['req', `의뢰 ${openRequests(state).length}`], ['rank', '대회·순위'], ['reviews', '한마디'], ['stats', '장부']]),
    ...({ build: buildItems, promo: promoItems, req: requestItems, rank: contestItems, reviews: reviewItems, stats: statsItems }[sheetTab.ledger] || buildItems)()] },
  settings: { title: '설정', build: settingsItems },
  todo: { title: '할 일', build: todoItems },
  news: { title: '소식 기록', build: newsItems },
};
function openSheet(name, keepScroll = false) {
  const scroll = keepScroll ? $('sheetBody').scrollTop : 0;
  sheetName = name;
  $('sheetTitle').textContent = SHEETS[name].title;
  $('sheetBody').replaceChildren(...SHEETS[name].build());
  $('sheetBody').scrollTop = scroll;
  $('scrim').hidden = false;
  $('sheet').classList.add('open');
  $('sheet').setAttribute('aria-hidden', 'false');
  if (name === 'ledger') badge('ledger', 0);
  if (name === 'menu') badge('menu', 0);
  if (name === 'todo') badge('todo', 0);
  if (name === 'dev') badge('dev', 0);
  if (name === 'staff') badge('staff', 0);
  if (name === 'book' && sheetTab.book === 'ach') { unseen.achievements = 0; badge('book', 0); }
  tutorialOn(`sheet:${name}`);
  if (keepScroll) return;
  sfx.sheet();
  setTimeout(() => $('sheetClose').focus(), 50);
}
// 넓은 화면(PC)에서는 창이 오른쪽에 붙어 있고, 가게는 계속 돌아간다
const wide = () => matchMedia('(min-width: 960px) and (min-height: 560px)').matches;
function closeSheet() {
  if (!sheetName || wide()) return;
  sheetName = null;
  $('sheet').classList.remove('open');
  $('sheet').setAttribute('aria-hidden', 'true');
  $('scrim').hidden = true;
  tutorialShow();
}

// ---------- 누른 사람 정보 ----------
function guestStatus(g) {
  const m = g.menu && MENUS[g.menu]?.name;
  switch (g.state) {
    case 'walkIn': return '자리로 가는 중';
    case 'ordering': return '메뉴 고르는 중';
    case 'waiting': return `${m} 기다리는 중 · ${Math.floor(g.waited)}분째`;
    case 'eating': return `${m} 먹는 중`;
    default: return '돌아가는 중';
  }
}
function showCard() {
  $('view').querySelector('.card')?.remove();
  if (!selected) return;
  let name, status, extra = null, face;
  if (selected.kind === 'guest') {
    const g = state.guests.find((x) => x.id === selected.id);
    if (!g) { selected = null; renderer.select(null); return; }
    const gt = GUESTS[g.type];
    name = g.critic ? `미식 평론가 (${guestName(g.type, g.sprite)})` : guestName(g.type, g.sprite);
    status = guestStatus(g);
    if (g.visit) status += g.visit >= 3 ? ` · 단골, ${g.visit}번째 방문` : ` · ${g.visit}번째 방문`;
    face = guestEl(g.sprite ?? g.id, 48);
    const bond = state.bonds?.[g.sprite] || 0;
    extra = [['like', `좋아함: ${gt.hint}`], ['hate', gt.budget ? `예산 ${gt.budget}G쯤` : gt.rich ? '고급 요리도 좋아함' : ''], ['bond', bond >= 1 ? `정 ${Math.floor(bond)}` : '']].filter(([, t]) => t);
  } else {
    const st = (selected.kind === 'cook' ? state.cooks : state.servers).find((x) => x.id === selected.id);
    if (!st) { selected = null; renderer.select(null); return; }
    const lv = staffLevel(st.exp);
    name = `${st.name} · ${ROLE[st.role]} Lv.${lv}`;
    face = staffEl(st.role, st.sprite);
    if (st.role === 'cook') {
      status = st.state === 'cooking' ? `${MENUS[st.order.menu].name} 만드는 중` : '주문 기다리는 중';
      extra = `밀린 주문 ${state.queue.length}개 · 오늘 주방 전체 ${state.today.cooked}그릇`;
    } else {
      status = st.carry ? `${MENUS[st.carry.menu].name} 나르는 중` : '대기 중';
      extra = `내놓은 음식 ${state.ready.length}개 · 오늘 홀 전체 ${state.today.delivered}그릇`;
    }
  }
  const c = el('div', 'card');
  face.classList.add('face');
  c.append(face, el('b', null, name), el('p', null, status));
  if (Array.isArray(extra)) { const p = el('p'); extra.forEach(([k, t], i) => { if (i) p.append(' · '); p.append(el('span', k, t)); }); c.append(p); }
  else c.append(el('p', null, extra));
  $('view').append(c);
}

// ---------- 결산 ----------
function showResult(sum) {
  const c = calendar(sum.day);
  $('resultTitle').textContent = `${c.month}월 ${c.date}일 영업 결산`;
  const rows = [
    ['매출', sum.sales, 'G'], ['팁', sum.tips, 'G'], ['재료비', -sum.cost, 'G'], ['인건비', -(sum.wages || 0), 'G'], ['순이익', sum.profit, 'G'],
    ['받은 손님', sum.served, '명'], ['화나서 간 손님', sum.angry, '명'],
  ];
  const tds = [];
  const extra = (k, v, cls) => { const tr = el('tr'); const td = el('td', cls || null); if (typeof v === 'string') td.textContent = v; else td.append(v); tr.append(el('th', null, k), td); return tr; };
  const trs = rows.map(([k, , u], i) => {
    const tr = el('tr', i === 4 ? 'sum' : null);
    const td = el('td', null, `0${u}`); tds.push(td);
    tr.append(el('th', null, k), td);
    return tr;
  });
  trs.push(extra('평판', `${Math.round(sum.repStart)} → ${Math.round(sum.repEnd)}`));
  trs.push(extra('인기 메뉴', sum.best && MENUS[sum.best] ? `${MENUS[sum.best].name} ${sum.bestCount}그릇` : '없음'));
  if (sum.trend) trs.push(extra(`유행 · ${sum.trend}`, `${sum.trendSold || 0}그릇`));
  if (sum.prevProfit != null) {
    const d = sum.profit - sum.prevProfit;
    trs.push(extra('어제보다', `${d >= 0 ? '▲' : '▼'} ${fmt(Math.abs(d))}G`, d >= 0 ? 'up' : 'down'));
  }
  if (sum.record) trs.push(extra('신기록!', `하루 매출 ${fmt(sum.sales)}G`, 'up'));
  if (sum.rank) trs.push(extra('주간 순위', `${sum.rank.pos}위`, sum.rank.pos === 1 ? 'up' : null));
  if (sum.contest) {
    trs.push(extra(sum.contest.league || '요리 대회', `${sum.contest.place}위 · ${sum.contest.menu}`, sum.contest.place <= 3 ? 'up' : null));
    if (sum.contest.promoted) trs.push(extra('승급!', sum.contest.promoted, 'up'));
    for (const [sign, t] of (sum.contest.notes || []).slice(0, 3)) trs.push(extra(sign === '+' ? '  잘한 점' : '  아쉬운 점', t, sign === '+' ? 'up' : 'down'));
  }
  if (sum.ideas) trs.push(extra('연구 보조', `💡 +${sum.ideas}`));
  if (sum.fan) {
    const who = el('span', 'fan-who');
    who.append(guestEl(sum.fan.sprite, 24, ''), `${guestName(sum.fan.type, sum.fan.sprite)} · ${sum.fan.n}번 와서 ${fmt(sum.fan.spent)}G`);
    trs.push(extra('오늘의 큰손', who));
  }
  $('resultRows').replaceChildren(...trs);
  const w = weatherOf({ weather: sum.weather });
  // 별 분포 막대
  const st5 = sum.stars || {};
  const total = [1, 2, 3, 4, 5].reduce((a, k) => a + (st5[k] || 0), 0) + (sum.angry || 0);
  if (total) {
    const bar = el('div', 'star-bar');
    for (const [k, cls] of [[5, 's5'], [4, 's4'], [3, 's3'], [2, 's2'], [1, 's1'], [0, 's0']]) {
      const n = k ? st5[k] || 0 : sum.angry || 0;
      if (!n) continue;
      const seg = el('span', cls, n >= total / 12 ? `${k ? `★${k}` : '화남'} ${n}` : '');
      seg.style.flexGrow = String(n);
      seg.title = `${k ? `별 ${k}개` : '화남'} ${n}명`;
      bar.append(seg);
    }
    trs.unshift(extra('오늘 별점', bar));
  }
  const wishes = Object.entries(sum.wishes || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (wishes.length) trs.push(extra('손님이 찾던 맛', wishes.map(([t, n]) => `${t} ${n}명`).join(' · '), 'down'));
  const md = (sum.missions || []).filter((m) => m.done).length;
  if (sum.missions?.length) trs.push(extra('오늘의 미션', `${md}/${sum.missions.length} 완료`, md === sum.missions.length ? 'up' : null));
  // 내일 할 일 한 줄 추천
  const tip = sum.angry > Math.max(2, sum.served / 6) ? '손님이 많이 기다렸어요. 직원을 뽑거나, 조리법 개선·설비로 빨리 만들어요.'
    : wishes.length && wishes[0][1] >= 3 ? `'${wishes[0][0]}' 맛을 찾는 손님이 많았어요. 그 맛 재료로 실험해 봐요!`
    : (sum.stars?.[5] || 0) === 0 && sum.served > 5 ? '별 다섯 개가 없었어요. 손님 취향에 맞는 요리를 연구하거나 개량해 봐요.'
    : sum.weather === 'rain' ? '비가 와서 손님이 적었어요. 내일은 갤 거예요.'
    : sum.weather === 'fest' ? '축제 날이라 북적였어요!'
    : sum.repEnd > sum.repStart ? `${w.name}. 소문이 조금씩 퍼지고 있어요.` : '내일은 더 잘될 거예요.';
  $('resultNote').textContent = tip;
  $('resultRows').replaceChildren(...trs);
  $('paperBtn').hidden = !(state.papers?.[0]?.day === sum.day);
  const stamp = $('stamp');
  stamp.textContent = sum.profit >= 0 ? '흑자' : '적자';
  stamp.className = 'stamp' + (sum.profit >= 0 ? '' : ' red');
  $('result').hidden = false;
  $('coach').hidden = true;
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 900), e = 1 - (1 - k) ** 3;
    rows.forEach(([, v, u], i) => { tds[i].textContent = `${fmt(v * e)}${u}`; });
    if (k < 1) requestAnimationFrame(step);
    else { stamp.classList.add('show'); sfx.great(); }
  };
  requestAnimationFrame(step);
  setTimeout(() => $('nextDay').focus(), 50);
}

// ---------- 길잡이 ----------
const TUTORIAL = [
  { target: 'game', text: '손님을 눌러 보세요. 무엇을 좋아하는지 알 수 있어요.', on: 'pick' },
  { target: 'dock-menu', text: '메뉴판에서 이번 주 유행을 확인해요.', on: 'sheet:menu' },
  { target: 'dock-staff', text: '손님이 늘면 직원을 뽑아요. 매일 지원자가 와요.', on: 'sheet:staff' },
  { target: 'dock-dev', text: '연구 창에서 재료 두 개를 섞어 봐요. 전설의 조합이 숨어 있어요!', on: 'sheet:dev' },
];
function tutorialShow() {
  const coach = $('coach');
  let step = state && TUTORIAL[state.tutorial];
  // 튜토리얼이 끝나면 처음 목표 8개까지는 목표가 가리키는 곳을 화살표로 알려 준다
  if (state && !step && !state.goalCoachOff && (state.goalIdx || 0) < 8) {
    const G = GOALS[state.goalIdx || 0];
    if (G?.dock) step = { target: G.dock, text: `목표: ${G.desc}`, goal: true };
  }
  if (onTitle || !step || (sheetName && !wide()) || editMode || !$('result').hidden) { coach.hidden = true; return; }
  const app = $('app').getBoundingClientRect();
  const t = $(step.target).getBoundingClientRect();
  $('coachText').textContent = step.text;
  $('coachStep').textContent = step.goal ? `목표 ${(state.goalIdx || 0) + 1}/${GOALS.length}` : `${state.tutorial + 1}/${TUTORIAL.length}`;
  coach.hidden = false;
  const box = coach.getBoundingClientRect();
  const onGame = step.target === 'game';
  const x = Math.min(app.width - box.width - 8, Math.max(8, t.left - app.left + t.width / 2 - box.width / 2));
  const y = onGame ? t.top - app.top + t.height * 0.42 : t.top - app.top - box.height - 12;
  coach.style.left = `${x}px`;
  coach.style.top = `${y}px`;
  coach.style.setProperty('--ax', `${Math.max(14, Math.min(box.width - 14, t.left - app.left + t.width / 2 - x))}px`);
  coach.classList.toggle('down', !onGame);
}
function tutorialOn(what) {
  if (!state || onTitle) return;
  const step = TUTORIAL[state.tutorial];
  if (step && step.on === what) { state.tutorial += 1; save(); }
  tutorialShow();
}

// ---------- 사건 ----------
function handle(ev) {
  for (const e of ev) {
    if (e.type === 'order') sfx.order();
    else if (e.type === 'coin') { renderer.coin(e.x, e.y, e.amount, e.hot, e.five); flyCoin(e.x, e.y); sfx.coin(); }
    else if (e.type === 'trendTeaser') {
      ticker([el('b', null, '예고'), ` 다음 주엔 ${trendLabel(e.trend)} 바람이 분대요. ${e.trend.news}`]);
      if (sheetName === 'menu') openSheet('menu', true);
    } else if (e.type === 'trendStart') {
      banner(`유행 시작! ${trendLabel(e.trend)}`, 'trend');
      ticker([el('b', null, '소문'), ` ${e.trend.news}`]);
      sfx.great();
      if (sheetName === 'menu') openSheet('menu', true);
    } else if (e.type === 'review') {
      const g = GUESTS[e.guest];
      renderer.say(e.x, e.y, e.rating);
      ticker([el('b', null, e.critic ? '미식 평론가' : guestName(e.guest, e.sprite)), ` ${e.rating ? stars(e.rating) : '화남'} “${e.line}”`]);
      if (e.critic) {
        if (e.rating >= 4) { banner('평론가 극찬! 평판 크게 상승', 'trend'); confetti(); sfx.levelUp(); }
        else if (e.rating <= 2) { banner('평론가 혹평… 평판 하락', 'bad'); sfx.angry(); }
      } else {
        if (e.rating === 5) sfx.great();
        if (e.rating === 0) sfx.angry();
      }
      if (sheetName === 'ledger' && sheetTab.ledger === 'reviews') openSheet('ledger', true);
      else if (e.rating === 5 || e.rating === 0 || e.critic) badge('ledger', true);
    } else if (e.type === 'repUp') { banner(`평판 ${stars(e.level)} 달성!`, 'world'); confetti(); sfx.levelUp(); }
    else if (e.type === 'worldUnlocked') {
      banner(`${WORLDS[e.world].name}의 문이 열렸다!`, 'world'); confetti(50); sfx.levelUp();
      toast(`새 손님과 세계 메뉴 ${e.menus?.length || 0}개! 재료 ${e.added?.length || 0}개가 창고에 들어왔어요`);
      badge('menu', true);
      if (sheetName === 'menu') openSheet('menu', true);
    } else if (e.type === 'staffLevel') {
      banner(`${e.staff.name} 레벨 업! Lv.${e.staff.lv}`, 'level'); confetti(20); sfx.levelUp();
    } else if (e.type === 'achievement') {
      banner(`업적 달성! ${e.name}`, 'ach'); confetti(30); sfx.levelUp();
      toast(`업적 보상 +${fmt(e.reward)}G`);
      unseen.achievements += 1; badge('book', unseen.achievements);
    } else if (e.type === 'recipeMade') {
      if (e.special) sfx.levelUp();
    } else if (e.type === 'experiment') {
      if (!e.special && e.stars >= 4) { banner(`대성공! ${e.name}`, 'level'); confetti(16); }
      if (e.stars <= 2) sfx.angry();
    } else if (e.type === 'specialFound') {
      banner(`전설의 조합 발견! ${e.name}`, 'trend'); confetti(60); sfx.levelUp();
      toast(`효과: ${EFFECT_NAME[e.effect]} · 아이디어 +${e.ideas}`);
    } else if (e.type === 'packBought') {
      sfx.levelUp(); confetti(14);
      toast(`새 재료 ${e.added.length}개: ${e.added.slice(0, 4).map((id) => CATALOG[id]?.name).join(', ')}${e.added.length > 4 ? ' …' : ''}`);
    } else if (e.type === 'clue') {
      if (e.guest) { ticker([el('b', null, guestName(e.guest, e.sprite)), ` 귀띔: ${e.clue.text}`]); banner('손님이 단서를 알려 줬어요!', 'ach'); badge('dev', true); }
      else toast('연구 노트에 단서를 적었어요');
    } else if (e.type === 'upgraded') {
      if (e.dq > 0) { banner(`개량 성공! 맛 +${e.dq}`, 'level'); sfx.levelUp(); }
      else if (e.dq < 0) { banner(`음… 맛 ${e.dq}`, 'bad'); sfx.angry(); }
      else sfx.great();
    } else if (e.type === 'requestNew') {
      banner(`새 의뢰! ${e.title}`, 'ach'); sfx.great(); badge('ledger', true);
      ticker([el('b', null, GUESTS[e.by].name), ' 손님이 부탁이 있대요. 가게 → 의뢰를 확인해요.']);
    } else if (e.type === 'requestDone') {
      banner(`의뢰 완료! ${e.title}`, 'trend'); confetti(40); sfx.levelUp();
      const g = e.got;
      const bits = [g.gold && `${fmt(g.gold)}G`, g.ideas && `💡${g.ideas}`, g.ingredients?.length && `재료 ${g.ingredients.length}개`,
        g.decor && `장식 '${DECOR.find((d) => d.id === g.decor)?.name}'`, g.invite && `${WORLDS[g.invite].name} 손님이 더 와요`, g.perk && PERKS[g.perk]].filter(Boolean);
      toast(`보상: ${bits.join(' · ')}`);
      if (sheetName === 'ledger') openSheet('ledger', true);
    } else if (e.type === 'slotAdded') {
      sfx.levelUp();
    } else if (e.type === 'criticArrive') {
      banner('미식 평론가가 왔어요!', 'ach'); sfx.great();
      ticker([el('b', null, '긴장'), ' 금빛 왕관을 쓴 손님이 미식 평론가예요. 빨리 내 주세요!']);
    } else if (e.type === 'dayStart') {
      const w = weatherOf(state);
      if (state.weather === 'fest') { banner('오늘은 축제 날!', 'trend'); confetti(); }
      else if (state.weather === 'rain') toast('비가 와서 손님이 줄 것 같아요');
      if (state.candidates.length) badge('staff', true);
      setTimeout(() => ticker([`오늘 날씨 ${w.name}. `, el('b', null, '지원자'), ` ${state.candidates.length}명이 기다려요.`]), 1800);
    } else if (e.type === 'gradeUp') {
      banner(`가게 등급 업! '${e.name}'`, 'world'); confetti(60); sfx.levelUp();
      ticker([el('b', null, '등급'), ` 이제 우리 가게는 '${e.name}'이에요!`]);
    } else if (e.type === 'goalDone') {
      banner(`목표 달성! ${e.name}`, 'ach'); confetti(30); sfx.levelUp();
      const rw = [e.reward.gold && `${fmt(e.reward.gold)}G`, e.reward.ideas && `💡${e.reward.ideas}`].filter(Boolean).join(' · ');
      toast(`보상 ${rw}${e.next ? ` · 다음 목표: ${e.next}` : ''}`);
      setTimeout(tutorialShow, 400);
    } else if (e.type === 'missionDone') {
      banner(`미션 완료! ${e.text}`, 'level', true); sfx.great();
    } else if (e.type === 'festivalStart') {
      banner(`${e.name} 시작!`, 'trend'); confetti(50);
      ticker([el('b', null, '축제'), ` ${e.name}! 일주일 동안 ${e.tag} 요리를 손님이 더 찾고 15% 비싸게 팔려요.`]);
    } else if (e.type === 'festivalNotice') {
      setTimeout(() => ticker([el('b', null, '예고'), ` ${e.inDays}일 뒤 ${e.name}! ${e.tag} 요리를 준비해 둬요.`]), 3000);
    } else if (e.type === 'vipNotice') {
      const W = e.want;
      setTimeout(() => { ticker([el('b', null, '귀빈 예고'), ` 내일 ${e.name}이(가) 찾아온대요. ${W.kinds.map((k) => KIND_NAME[k]).join('·')} 중 ${W.tags.join('·')} 맛을 원해요.`]); badge('todo', true); }, 2500);
    } else if (e.type === 'vipToday') {
      setTimeout(() => banner(`오늘 ${e.name} 방문 예정!`, 'ach'), 1200);
    } else if (e.type === 'vipArrive') {
      banner(`${e.name} 도착!`, 'ach'); sfx.great();
    } else if (e.type === 'vipDone') {
      if (e.ok) { banner(`${e.name} 대만족! +${fmt(e.gold)}G`, 'trend'); confetti(60); sfx.levelUp(); }
      else { banner(`${e.name}: ${e.why}`, 'bad'); sfx.angry(); }
    } else if (e.type === 'partyArrive') {
      void 0;
    } else if (e.type === 'partyHappy') {
      renderer.sayText(e.x, e.y, '같이 오길 잘했다!', '#ffe9a8');
    } else if (e.type === 'wish') {
      renderer.sayText(e.x, e.y, `${e.tag} 없나…`, '#e8eefc');
    } else if (e.type === 'paper') {
      badge('ledger', true);
    } else if (e.type === 'tableAdded') {
      banner(`탁자를 들였어요! ${e.n * 2}석`, 'level'); confetti(20); sfx.levelUp(); relayout();
    } else if (e.type === 'decorPlaced') {
      sfx.great(); toast(`분위기 ${e.atmos} · 배치 바꾸기로 옮길 수 있어요`); relayout();
    } else if (e.type === 'shopExpanded') {
      relayout(); banner(`공사 끝! ${e.name}`, 'world'); confetti(60); sfx.levelUp();
      toast('가게가 넓어졌어요. 탁자를 더 들여요');
    } else if (e.type === 'promoStart') {
      banner(`${e.name} 시작!`, 'trend'); sfx.great();
    } else if (e.type === 'menuLevel') {
      banner(`${MENUS[e.id].name} Lv.${e.lv}!`, 'level', true); sfx.levelUp();
      if (sheetName === 'menu') openSheet('menu', true);
    } else if (e.type === 'gift') {
      const g = GUESTS[e.guest];
      const what = e.kind === 'gold' ? `+${fmt(e.gold)}G` : e.kind === 'ideas' ? `아이디어 +${e.ideas}`
        : e.kind === 'ingredient' ? `새 재료 '${CATALOG[e.ingredient]?.name || '?'}'` : e.kind === 'clue' ? '전설 조합 단서' : '마음';
      banner(`단골 선물! ${what}`, 'ach'); sfx.great();
      ticker([el('b', null, `${guestName(e.guest, e.sprite)} (${e.visit}번째)`), ` “${e.line}”`]);
      if (e.kind === 'ingredient' || e.kind === 'clue') badge('dev', true);
    } else if (e.type === 'record') {
      banner(`매출 신기록! ${fmt(e.sales)}G`, 'trend'); confetti(30);
    } else if (e.type === 'ranking') {
      banner(`주간 순위 ${e.pos}위${e.prev && e.prev > e.pos ? ` (▲${e.prev - e.pos})` : ''}`, e.pos === 1 ? 'trend' : 'level');
      if (e.pos === 1) confetti(40);
      badge('ledger', true);
    } else if (e.type === 'contest') {
      banner(e.place === 1 ? `${e.league} 우승!!` : `${e.league} ${e.place}위`, e.place <= 3 ? 'trend' : 'bad');
      if (e.place === 1) { confetti(60); toast(e.promoted ? `다음 달부터 ${e.promoted}에 나가요!` : '트로피 장식을 받았어요! 가게 → 꾸미기'); }
    } else if (e.type === 'contestNotice') {
      const th = CONTEST_THEMES.find((t) => t.id === e.theme);
      setTimeout(() => ticker([el('b', null, `요리 대회 · ${th?.name || ''}`), e.daysLeft === 0 ? ' 오늘 밤이에요! ' : ` ${e.daysLeft}일 남았어요. `,
        e.chosen ? `출품작은 ${MENUS[e.entry].name}.` : '아직 출품작을 안 골랐어요 (가게 → 대회·순위).']), 4200);
      if (!e.chosen) badge('ledger', true);
    } else if (e.type === 'dayEnd') {
      save(true); sfx.close(); closeSheet(); setTimeout(() => showResult(e.summary), 500);
    }
  }
}

function startDayFx() {
  banner('영업 시작!');
  sfx.open();
  ticker(['오전 9시, 차원골목 식당이 문을 열었어요.']);
  notifiedLastEntry = false;
}

// ---------- 고리 ----------
let acc = 0, prev = 0, sinceSave = 0, sinceCard = 0;
function frame(now) {
  const dt = Math.min(0.25, (now - prev) / 1000 || 0);
  prev = now;
  const running = !onTitle && (!sheetName || wide()) && !editMode && $('result').hidden && speed > 0 && state.phase === 'open';
  if (running) {
    acc += dt * speed;
    const per = CONFIG.realSecPerGameMin * CONFIG.tickMin;
    let n = 0;
    while (acc >= per && n < 800 && state.phase === 'open') { acc -= per; handle(tick(state)); n++; }
    if (state.phase !== 'open') acc = 0;
    if (!notifiedLastEntry && state.clock >= CONFIG.lastEntryMin) { notifiedLastEntry = true; toast('오후 8시, 이제 새 손님은 안 받아요'); }
  } else if (onTitle) {
    // 타이틀 뒤에서는 가게가 구경용으로 굴러간다. 저장도 소리도 없다.
    acc += dt * 2;
    const per = CONFIG.realSecPerGameMin * CONFIG.tickMin;
    while (acc >= per) {
      acc -= per;
      if (state.phase !== 'open') openNextDay(state);
      for (const e of tick(state)) {
        if (e.type === 'coin') renderer.coin(e.x, e.y, e.amount);
        else if (e.type === 'review') renderer.say(e.x, e.y, e.rating);
      }
    }
  }
  renderer.draw(state, running || onTitle ? dt : 0);
  updateHud(dt);
  if (!onTitle) updateTrendPill(); else if (!$('trendPill').hidden) { $('trendPill').hidden = true; trendKey = ''; }
  if ((sinceCard += dt) > 0.3) { sinceCard = 0; if (selected) showCard(); }
  if ((sinceSave += dt) > 15) { sinceSave = 0; save(true); }
  requestAnimationFrame(frame);
}

// ---------- 화면 맞추기 ----------
function fit() {
  const v = $('view').getBoundingClientRect();
  if (!v.width || !v.height) return;
  const r = renderer.resize(v.width, v.height);
  $('game').style.width = `${Math.floor(r.w * r.scale)}px`;
  $('game').style.height = `${Math.floor(r.h * r.scale)}px`;
  if (!$('coach').hidden) tutorialShow();
}

// ---------- 타이틀 ----------
function showTitle() {
  onTitle = true;
  selected = null; renderer.select(null); showCard();
  $('coach').hidden = true;
  $('title').hidden = false;
  const btns = $('titleBtns');
  btns.replaceChildren();
  // 저장 칸 고르기
  const slots = el('div', 'slot-tabs');
  for (const n of [1, 2, 3]) {
    const sm = slotSummary(n);
    const b = btn('slot-btn' + (n === slot ? ' on' : ''), '', () => { if (n !== slot) { useSlot(n); sfx.tap(); showTitle(); } });
    b.append(el('b', null, `${n}번 가게`), el('small', null, sm ? sm.text : '비어 있음'));
    slots.append(b);
  }
  btns.append(slots);
  const saved = loadSave();
  const begin = (fresh) => {
    unlockAudio(); startBgm();
    if (fresh) { try { localStorage.removeItem(SAVE_KEY); } catch { /* 괜찮아 */ } state = createGame((Date.now() % 2147483647) | 0); }
    else if (saved) { state = saved; registerRecipes(state); }
    relayout();
    if (wide()) setTimeout(() => openSheet(sheetName || 'menu', true), 0);
    shownMoney = state.money;
    onTitle = false;
    trendKey = '';
    $('title').hidden = true;
    sfx.tap();
    if (state.phase === 'closed' && state.lastSummary) showResult(state.lastSummary);
    else if (state.clock <= CONFIG.openMin + 1) startDayFx();
    else ticker(['다시 문을 열었어요. 손님이 기다리고 있어요.']);
    if (state.candidates?.length && state.cooks.length + state.servers.length < 3) badge('staff', true);
    setTimeout(tutorialShow, 1800);
  };
  if (saved) {
    const c = calendar(saved.day);
    const go = btn('go', `이어하기 · ${c.month}월 ${c.date}일`, () => begin(false));
    const fresh = btn('go alt', '새 가게 열기');
    let armed = false;
    fresh.addEventListener('click', () => {
      if (!armed) { armed = true; fresh.textContent = '한 번 더 누르면 기록이 지워져요'; setTimeout(() => { armed = false; fresh.textContent = '새 가게 열기'; }, 3500); return; }
      begin(true);
    });
    btns.append(go, fresh);
  } else {
    btns.append(btn('go', '가게 열기', () => begin(true)));
  }
  setTimeout(() => btns.querySelector('.go')?.focus(), 50);
  const parade = $('parade');
  if (!parade.childElementCount) {
    for (let i = 0; i < 6; i++) {
      const n = cellEl(SPRITES.anim.url, 1, (i * 13 + 4) % SPRITES.customers, 48, 'walker', SPRITES.anim.cols, SPRITES.anim.rows);
      n.style.animationDelay = `${-i * 0.11}s`;
      parade.append(n);
    }
  }
  if (brokenSaveNote) { brokenSaveNote = false; toast('저장이 깨져서 따로 보관하고 새로 시작해요'); }
}

// ---------- 불러오기 ----------
async function preload() {
  const shopParts = ['floor_wood', 'floor_kitchen_sage', 'wall_plain', 'wall_window', 'door_entrance', 'wood_table', 'chair_north',
    'chair_south', 'stone_oven', 'prep_counter', 'doormat', 'herb_pot', 'crystal_pot', 'flower_pot'].map((id) => `assets/shop/${id}.png`);
  const imgs = [SPRITES.anim.url, SPRITES.chef.url, SPRITES.server.url, ...shopParts, 'assets/ui/title_logo.png',
    ...['b', 'f'].flatMap((x) => [dishSheetUrl(x, 48), dishSheetUrl(x, 24)]),
    ...['normal', 'fantasy', 'xian', 'fairy', 'demon', 'heaven'].map(ingredientSheetUrl)];
  let done = 0;
  const total = imgs.length + 1;
  const bump = () => { done++; $('loadBar').style.width = `${Math.round((done / total) * 100)}%`; };
  const loadImg = (src) => new Promise((ok) => { const im = new Image(); im.onload = im.onerror = () => { bump(); ok(); }; im.src = src; });
  const cat = fetch('assets/ingredients/catalog.json').then((r) => r.json()).then(loadCatalog).catch(() => {}).finally(bump);
  await Promise.race([Promise.all([...imgs.map(loadImg), cat]), new Promise((ok) => setTimeout(ok, 6000))]);
  await cat; // 재료 목록은 맛 판정에 꼭 필요하다
}

// ---------- 시작 ----------
async function start(data) {
  setupApp();
  await preload();
  state = data?.state ? migrate(data.state) : loadSave() ?? createGame(1);
  registerRecipes(state);
  shownMoney = state.money;
  setLayout(state);
  renderer = createRenderer($('game'), state.annexWorld);
  fit();
  new ResizeObserver(fit).observe($('view'));
  $('loading').hidden = true;

  $('speedBtn').addEventListener('click', () => {
    const i = SPEEDS.findIndex(([v]) => v === speed);
    setSpeed(SPEEDS[(i + 1) % SPEEDS.length][0]); sfx.tap();
  });
  $('menuBtn').addEventListener('click', () => openSheet('settings'));
  for (const b of document.querySelectorAll('[data-sheet]')) b.addEventListener('click', () => openSheet(b.dataset.sheet));
  $('sheetClose').addEventListener('click', () => { closeSheet(); sfx.tap(); });
  $('scrim').addEventListener('click', closeSheet);
  $('coachSkip').addEventListener('click', () => { if (state.tutorial >= TUTORIAL.length) state.goalCoachOff = true; state.tutorial = TUTORIAL.length; tutorialShow(); save(); });
  document.querySelector('.ticker').addEventListener('click', () => { sfx.tap(); openSheet('news'); });
  $('paperBtn').addEventListener('click', () => { const p = state.papers?.[0]; if (!p) return; $('paperBox').replaceChildren(paperEl(p)); $('paperBox').hidden = !$('paperBox').hidden; });
  let pausedFrom = 1;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (sheetName) closeSheet();
      else if (selected) { selected = null; renderer.select(null); showCard(); }
      return;
    }
    if (onTitle || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' && $('result').hidden) {
      e.preventDefault();
      if (speed) { pausedFrom = speed; setSpeed(0); } else setSpeed(pausedFrom);
    } else if (['1', '2', '4'].includes(e.key)) setSpeed(Number(e.key));
    else if (e.key === 'm' || e.key === 'M') { if (sheetName === 'menu') closeSheet(); else openSheet('menu'); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
    else { unlockAudio(); prev = performance.now(); }
  });

  $('game').addEventListener('pointerdown', (e) => {
    const r = $('game').getBoundingClientRect();
    const hit = renderer.pick(state, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    if (editMode) { if (hit?.kind === 'cell') editPick(hit.x, hit.y); return; }
    if (hit?.kind === 'shop') { sheetTab.ledger = hit.tab; openSheet('ledger'); return; }
    selected = hit;
    renderer.select(hit);
    showCard();
    if (hit) { sfx.tap(); if (hit.kind === 'guest') tutorialOn('pick'); }
  });

  $('nextDay').addEventListener('click', () => {
    $('result').hidden = true;
    $('stamp').classList.remove('show');
    const ev = openNextDay(state);
    save(true);
    startDayFx();
    handle(ev);
    tutorialShow();
  });

  setSpeed(1);
  window.claude?.hot?.snapshot?.(() => ({ state: onTitle ? null : state }));
  if (data?.state) { onTitle = false; $('title').hidden = true; }
  else showTitle();
  prev = performance.now();
  requestAnimationFrame(frame);
}

window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
