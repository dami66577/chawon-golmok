// 《차원골목 식당》 그리기
// 상태를 읽기만 하고 절대 바꾸지 않는다.
// 좌표 단위: 한 칸 = 16단위 = 그림 48픽셀. 그래서 그림 1픽셀 = 1/3단위. 캔버스는 1단위를 6픽셀로 그린다.
// 가게 부품·사람·요리는 그림 묶음(assets/)을 쓰고, 말풍선 몇 개와 효과만 코드로 그린다.
import { getMap, isTrending, nextZone } from './sim.js';
import { MENUS, GUESTS, STAFF_LOOKS, CONFIG, SPRITES, SHOP_ART, DECOR, EQUIPMENT, ANNEX_HUE, dishOf, dishSheetUrl } from './data.js';

export const TILE = 16;
const ART = 3;   // 그림 픽셀 / 단위
const K = 6;     // 캔버스 픽셀 / 단위 (그림 1픽셀 = 캔버스 2픽셀)
const PX = 48;   // 그림 한 칸

const PAL = { ink: '#231a2a', white: '#ffffff', red: '#d8433b', gold: '#ffd35a', plate: '#f4f4f0' };
const SHOP_PARTS = ['floor_wood', 'floor_kitchen_sage', 'wall_plain', 'wall_window', 'door_entrance', 'wood_table', 'chair_north',
  'chair_south', 'stone_oven', 'prep_counter', 'doormat', 'herb_pot', 'crystal_pot', 'flower_pot'];

// 그림은 한 번만 불러 둔다 (가게 배치가 바뀌어 그리기 도구를 새로 만들어도 다시 안 받는다)
const IMG = new Map();
const load = (src) => { if (!IMG.has(src)) { const im = new Image(); im.src = src; IMG.set(src, im); } return IMG.get(src); };

// annexWorld: 세계 별관 바닥 색. 배치가 바뀌면 main.js가 이 함수를 다시 부른다.
export function createRenderer(canvas, annexWorld = null) {
  const map = getMap();
  const W = map.w * TILE, H = map.h * TILE;
  // 화면이 가게보다 길면 위로 간판, 아래로 가게 앞 길을 늘려 그린다
  let total = H, oy = 0;
  canvas.width = W * K;
  canvas.height = H * K;
  function resize(vw, vh) {
    const scale = Math.min(vw / W, vh / H);
    total = Math.max(H, Math.floor(vh / scale));
    oy = Math.floor((total - H) * 0.5);
    canvas.width = W * K;
    canvas.height = total * K;
    return { scale, w: W, h: total };
  }
  // 가게 칸 좌표 → 화면 위 비율
  const frac = (tx, ty) => ({ fx: (tx * TILE + 8) / W, fy: (ty * TILE + oy) / total });
  const ctx = canvas.getContext('2d');

  // ---------- 그림 불러오기 ----------
  const ready = (im) => im && im.complete && im.naturalWidth > 0;
  const shop = Object.fromEntries(SHOP_PARTS.map((id) => [id, load(`assets/shop/${id}.png`)]));
  const face = { think: load('assets/ui/expression_thinking.png'), happy: load('assets/ui/expression_happy.png'), hurry: load('assets/ui/expression_surprised.png') };
  const anim = load(SPRITES.anim.url);
  const chefSheet = load(SPRITES.chef.url);
  const serverSheet = load(SPRITES.server.url);
  const dish24 = { b: load(dishSheetUrl('b', 24)), f: load(dishSheetUrl('f', 24)) };

  // 그림 픽셀 좌표(ax, ay)에 그림을 놓는다
  const art = (im, ax, ay, sx = 0, sy = 0, sw = im.naturalWidth, sh = im.naturalHeight) =>
    ctx.drawImage(im, sx, sy, sw, sh, ax / ART, ay / ART, sw / ART, sh / ART);
  function dish(id, ax, ay) {
    const d = dishOf(id);
    if (!d || !ready(dish24[d.set])) return false;
    art(dish24[d.set], ax, ay, d.col * 24, d.row * 24, 24, 24);
    return true;
  }

  // ---------- 가게 바탕 (바닥, 벽, 매트) ----------
  const bg = document.createElement('canvas');
  bg.width = W * ART; bg.height = H * ART;
  let bgReady = false;
  function buildBg() {
    if (!SHOP_PARTS.every((id) => ready(shop[id]))) return false;
    const b = bg.getContext('2d');
    b.imageSmoothingEnabled = false;
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const c = map.at(x, y);
      if (c === '#') continue;
      const kitchen = y <= 4 && 'OkcCpP'.includes(c);
      const annex = map.annexTop != null && y >= map.annexTop && y < map.h - 1;
      if (annex && ANNEX_HUE[annexWorld] != null) b.filter = `hue-rotate(${ANNEX_HUE[annexWorld]}deg) saturate(0.8) brightness(1.08)`;
      b.drawImage(kitchen ? shop.floor_kitchen_sage : shop.floor_wood, x * PX, y * PX);
      b.filter = 'none';
    }
    // 벽: 두 줄짜리 그림을 맨 위에 한 번
    for (let x = 0; x < map.w; x++) {
      if (SHOP_ART.windows.includes(x)) { b.drawImage(shop.wall_window, x * PX, 0); x++; continue; }
      b.drawImage(x === SHOP_ART.door ? shop.door_entrance : shop.wall_plain, x * PX, 0);
    }
    const d = map.doors[0];
    b.drawImage(shop.doormat, d.x * PX, d.y * PX + PX - 46);
    bgReady = true;
    return true;
  }

  // ---------- 깊이 순서로 그릴 가구 ----------
  // 탁자 묶음: 위 의자 → 위 손님 → 탁자 → 아래 손님 → 아래 의자 (그림 묶음 안내 그대로)
  const groups = [];
  const props = [];
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const c = map.at(x, y);
    if (c === 'T' && map.at(x - 1, y) !== 'T') {
      const tx = x * PX, ty = y * PX + PX - 62;
      groups.push({ i: groups.length, x, y, tx, ty, north: { x, y: y - 1 }, south: { x, y: y + 1 }, depth: y * PX + PX });
    }
    if (c === 'O' && map.at(x - 1, y) !== 'O' && map.at(x, y - 1) !== 'O') props.push({ part: 'stone_oven', ax: x * PX, ay: (y + 2) * PX - 94, depth: (y + 2) * PX });
    if ((c === 'C' || c === 'p') && x % 2 === 0) props.push({ part: 'prep_counter', ax: x * PX, ay: y * PX + PX - 62, depth: y * PX + PX, counter: x });
    if (c === 'P') props.push({ spot: `${x},${y}`, ax: x * PX, ay: y * PX + PX - 62, depth: y * PX + PX });
  }
  const counterTop = props.find((p) => p.counter != null)?.ay ?? 0;

  // ---------- 사람 ----------
  // 사람은 발밑 (fx, fy)단위에 48픽셀 그림을 1/3로 줄여 그린다
  function figure(sheet, col, row, fx, fy, flip = false) {
    const [ax, ay] = SPRITES.foot;
    ctx.save();
    ctx.translate(Math.round(fx * ART) / ART, Math.round(fy * ART) / ART);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(sheet, col * PX, row * PX, PX, PX, -ax / ART, -ay / ART, PX / ART, PX / ART);
    ctx.restore();
  }
  const shadow = (fx, fy) => { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(fx - 4, fy - 0.7, 8, 1.4); };
  function guestFrame(e) {
    const F = SPRITES.anim.frames;
    if (e.path && e.path.length) {
      const n = e.path[0];
      const up = n.y < e.y - 0.01 && Math.abs(n.y - e.y) >= Math.abs(n.x - e.x);
      return (up ? F.backWalk : F.frontWalk)[Math.floor(time * 6 + e.id) % 2];
    }
    return F.front;
  }
  const seated = (g) => ['ordering', 'waiting', 'eating'].includes(g.state);

  // ---------- 효과 ----------
  const fx = [];
  const says = [];
  const sparks = [];
  let time = 0;
  let selected = null;
  const findSel = (s) => (selected.kind === 'cook' ? s.cooks : selected.kind === 'server' ? s.servers : s.guests).find((g) => g.id === selected.id);
  // 말풍선을 띄울 머리 위 위치 (단위)
  const heads = new Map();

  function draw(s, dt) {
    time += dt;
    ctx.setTransform(K, 0, 0, K, 0, 0);
    ctx.imageSmoothingEnabled = false;
    surround(ctx, W, total, oy, H, s.weather === 'fest', time);
    ctx.setTransform(K, 0, 0, K, 0, oy * K);
    if (!bgReady) buildBg();
    if (bgReady) ctx.drawImage(bg, 0, 0, W, H);
    else { ctx.fillStyle = '#c99560'; ctx.fillRect(0, 0, W, H); }
    heads.clear();

    // 깊이 순서: 가구, 탁자 묶음, 걷는 사람
    const items = [];
    for (const p of props) {
      // 화분은 산 자리에만 놓인다
      const dec = p.spot ? DECOR.find((x) => x.id === s.decor?.[p.spot]) : null;
      const part = p.spot ? dec?.art : p.part;
      if (part) items.push({ d: p.depth, f: () => {
        if (!ready(shop[part])) return;
        if (dec?.hue) ctx.filter = `hue-rotate(${dec.hue}deg) saturate(1.3)`;
        art(shop[part], p.ax, p.ay);
        ctx.filter = 'none';
      } });
    }
    const seatOf = new Map();
    for (const g of s.guests) if (seated(g)) seatOf.set(`${g.seat.x},${g.seat.y}`, g);
    for (const gr of groups) items.push({ d: gr.depth, f: () => drawGroup(s, gr, seatOf) });
    for (const c of s.cooks) {
      const fxu = (c.x + 1) * TILE, fyu = c.y * TILE + 46 / ART;
      items.push({ d: fyu * ART, f: () => {
        if (!ready(chefSheet)) return;
        const F = SPRITES.chef.frames;
        figure(chefSheet, c.state === 'cooking' ? F.cook[Math.floor(time * 4 + c.slot) % 2] : F.idle, c.sprite, fxu, fyu);
        heads.set(c, fyu - 15);
      } });
    }
    for (const v of s.servers) {
      const fxu = v.x * TILE + 8, fyu = v.y * TILE + 46 / ART;
      items.push({ d: fyu * ART, f: () => {
        if (!ready(serverSheet)) return;
        const F = SPRITES.server.frames, pair = v.carry ? F.carry : F.walk;
        shadow(fxu, fyu);
        figure(serverSheet, v.path.length ? pair[Math.floor(time * 6 + v.slot) % 2] : pair[0], v.sprite, fxu, fyu, (v.face || 1) < 0);
        heads.set(v, fyu - 15);
      } });
    }
    for (const g of s.guests) {
      if (seated(g)) continue;
      const fxu = g.x * TILE + 8, fyu = g.y * TILE + 46 / ART;
      items.push({ d: fyu * ART, f: () => {
        if (ready(anim)) {
          shadow(fxu, fyu);
          figure(anim, guestFrame(g), (g.sprite ?? g.id) % SPRITES.customers, fxu, fyu, (g.face || 1) < 0);
        } else drawChar(ctx, fxu, fyu, GUESTS[g.type].look || STAFF_LOOKS.server, { face: g.face || 1 });
        heads.set(g, fyu - 15);
      } });
    }
    items.sort((a, b) => a.d - b.d);
    for (const it of items) it.f();

    // 조리대 위: 요리하는 김, 내놓은 음식
    for (const c of s.cooks) if (c.state === 'cooking') steam(ctx, (c.x + 1) * TILE, counterTop / ART + 1, time + c.slot);
    s.ready.slice(0, 4).forEach((o, i) => dish(MENUS[o.menu]?.dish, map.pass.x * PX - 30 + i * 22, counterTop + 4));

    // 말풍선, 평론가 왕관
    for (const g of s.guests) {
      const hy = heads.get(g);
      if (hy == null) continue;
      const hx = seated(g) ? (g.seat.x + 1) * TILE : g.x * TILE + 8;
      bubbleFor(ctx, g, hx, hy, time, face, dish, !!(g.menu && isTrending(s, g.menu)), ready);
      if ((g.critic || g.vip) && g.state !== 'leaving') crown(ctx, hx, hy - (['waiting', 'ordering'].includes(g.state) ? 17 : 3));
    }

    // 비 오는 날
    if (s.weather === 'rain') {
      ctx.fillStyle = 'rgba(40,60,110,.12)'; ctx.fillRect(0, -oy, W, total);
      ctx.fillStyle = 'rgba(200,220,255,.55)';
      for (let i = 0; i < 70; i++) {
        const x = (i * 37 + Math.floor(time * 60) * 3) % W, y = ((i * 53 + time * 260) % (total + 10)) - oy - 10;
        ctx.fillRect(x, y, 0.7, 4);
      }
    }

    // 저녁 어스름, 밤 창문과 가로등
    const dusk = Math.max(0, Math.min(1, (s.clock - 18 * 60) / 180));
    if (dusk > 0) {
      ctx.fillStyle = `rgba(28,24,70,${0.3 * dusk})`; ctx.fillRect(0, -oy, W, total);
      ctx.fillStyle = `rgba(255,214,120,${0.7 * dusk})`;
      for (const wx of SHOP_ART.windows) ctx.fillRect((wx * PX + 30) / ART, 34 / ART, 36 / ART, 30 / ART);
      if (total - oy - H >= 20) for (const lx of [10, W - 10]) {
        ctx.fillStyle = `rgba(255,214,120,${0.25 * dusk})`; ctx.fillRect(lx - 8, H + 2, 16, 12);
        ctx.fillStyle = `rgba(255,226,150,${dusk})`; ctx.fillRect(lx - 2, H + 3, 4, 3);
      }
    }
    if (s.clock >= CONFIG.lastEntryMin) closedSign(ctx, map);

    // 조리 설비 이름표 (요리사 자리 위 조리대)
    map.cookSpots.forEach((c, slot) => {
      const E = EQUIPMENT.find((x) => x.id === s.equip?.[slot]);
      if (!E) return;
      const x = (c.x + 1) * TILE, y = c.y * TILE + 21;
      ctx.fillStyle = E.color; ctx.fillRect(x - 6, y - 3, 12, 6);
      ctx.fillStyle = '#fff'; ctx.font = '700 4px Galmuri11, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(E.short, x, y + 0.2);
    });
    // 넓힐 수 있으면 문 옆에 공사 표지
    const nz = nextZone(s);
    if (nz && !edit) {
      const x = W - 22, y = (map.h - 1) * TILE + 5 + Math.sin(time * 2.5) * 0.6;
      ctx.fillStyle = '#6a4a2a'; ctx.fillRect(x + 9, y + 6, 1.5, 5);
      ctx.fillStyle = '#ffd35a'; ctx.fillRect(x - 1, y - 1, 21, 8);
      ctx.fillStyle = PAL.ink; ctx.font = '700 4.5px Galmuri11, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('넓히기 ▸', x + 9.5, y + 3.2);
      signBox = { x0: x - 2, y0: y - 2, x1: x + 21, y1: y + 12 };
    } else signBox = null;
    // 배치 모드: 놓을 수 있는 칸과 고른 물건
    if (edit) drawEdit(s);

    // 고른 사람 표시
    if (selected) {
      const t = findSel(s);
      const hy = t && heads.get(t);
      if (hy != null && Math.floor(time * 3) % 2 === 0) {
        const x = Math.round(selected.kind === 'cook' ? (t.x + 1) * TILE : selected.kind === 'guest' && seated(t) ? (t.seat.x + 1) * TILE : t.x * TILE + 8);
        const y = Math.round(hy) - 7;
        ctx.fillStyle = PAL.gold; ctx.fillRect(x - 3, y, 7, 2); ctx.fillRect(x - 2, y + 2, 5, 1); ctx.fillRect(x - 1, y + 3, 3, 1); ctx.fillRect(x, y + 4, 1, 1);
      }
    }

    // 머리 위 한마디
    for (let i = says.length - 1; i >= 0; i--) {
      const b = says[i];
      b.age += dt;
      if (b.age > 1.8) { says.splice(i, 1); continue; }
      const rise = Math.min(1, b.age * 6);
      ctx.font = '700 6px Galmuri11, ui-monospace, monospace';
      ctx.textAlign = 'center';
      const w = Math.ceil(ctx.measureText(b.text).width) + 5;
      const x = Math.round(Math.min(W - w / 2 - 1, Math.max(w / 2 + 1, b.x))), y = Math.round(b.y - 6 * rise);
      ctx.globalAlpha = b.age > 1.4 ? (1.8 - b.age) / 0.4 : 1;
      ctx.fillStyle = PAL.ink; ctx.fillRect(x - w / 2 - 1, y - 8, w + 2, 10);
      ctx.fillStyle = b.bg; ctx.fillRect(x - w / 2, y - 7, w, 8);
      ctx.fillStyle = b.fg; ctx.fillText(b.text, x, y - 1);
      ctx.globalAlpha = 1;
    }

    // 별 다섯 반짝이
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.age += dt;
      if (p.age > 0.8) { sparks.splice(i, 1); continue; }
      const r = 4 + p.age * 16, x = Math.round(p.x + Math.cos(p.a) * r), y = Math.round(p.y - 8 + Math.sin(p.a) * r * 0.7);
      ctx.fillStyle = Math.floor(p.age * 10) % 2 ? '#fff6c2' : PAL.gold;
      ctx.fillRect(x, y - 1, 1, 3); ctx.fillRect(x - 1, y, 3, 1);
    }

    // 떠오르는 숫자
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.age += dt;
      if (f.age > 1.4) { fx.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, Math.min(1, 2.2 - f.age * 1.6));
      ctx.font = '700 6px Galmuri11, ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.lineWidth = 1.5; ctx.strokeStyle = f.hot ? '#5a1033' : '#3a2400'; ctx.fillStyle = f.hot ? '#ff8fc0' : PAL.gold;
      const y = f.y - f.age * 9;
      ctx.strokeText(f.text, f.x, y);
      ctx.fillText(f.text, f.x, y);
      ctx.globalAlpha = 1;
    }
  }

  function drawGroup(s, gr, seatOf) {
    const n = seatOf.get(`${gr.north.x},${gr.north.y}`), so = seatOf.get(`${gr.south.x},${gr.south.y}`);
    const F = SPRITES.anim.frames, rowOf = (g) => (g.sprite ?? g.id) % SPRITES.customers;
    const cx = gr.tx + 24;
    if (ready(shop.chair_north)) art(shop.chair_north, cx, gr.ty - 17);
    if (n && ready(anim)) { art(anim, cx, gr.ty - 32, F.sitFront * PX, rowOf(n) * PX, PX, PX); heads.set(n, (gr.ty - 30) / ART); }
    if (ready(shop.wood_table)) art(shop.wood_table, gr.tx, gr.ty);
    if (n?.state === 'eating') dish(MENUS[n.menu]?.dish, gr.tx + 36, gr.ty + 6);
    if (so?.state === 'eating') dish(MENUS[so.menu]?.dish, gr.tx + 36, gr.ty + 26);
    if (so && ready(anim)) { art(anim, cx, gr.ty + 18, F.sitBack * PX, rowOf(so) * PX, PX, PX); heads.set(so, (gr.ty + 20) / ART); }
    if (ready(shop.chair_south)) art(shop.chair_south, cx, gr.ty + 35);
  }

  // ---------- 배치 모드 ----------
  let edit = null, signBox = null;
  function drawEdit(s) {
    ctx.fillStyle = 'rgba(20,30,60,.18)'; ctx.fillRect(0, 6 * TILE, W, (map.h - 7) * TILE);
    const blink = 0.35 + 0.25 * Math.sin(time * 5);
    for (const p of edit.spots || []) {
      if (edit.sel?.kind === 'table') { ctx.fillStyle = `rgba(90,200,120,${blink})`; ctx.fillRect(p.x * TILE + 1, p.y * TILE + 1, 2 * TILE - 2, TILE - 2); }
      else { ctx.fillStyle = `rgba(90,200,120,${blink})`; ctx.fillRect(p.x * TILE + 3, p.y * TILE + 3, TILE - 6, TILE - 6); }
    }
    const frame = (x, y, w, h) => { ctx.strokeStyle = PAL.gold; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); };
    if (edit.sel?.kind === 'table') { const t = s.tablePos[edit.sel.i]; if (t) frame(t.x * TILE, (t.y - 1) * TILE, 2 * TILE, 3 * TILE); }
    if (edit.sel?.kind === 'decor') { const [x, y] = edit.sel.spot.split(',').map(Number); frame(x * TILE, y * TILE, TILE, TILE); }
    // 장식을 고르면 분위기가 닿는 자리를 보여 준다
    if (edit.sel?.kind === 'decor') {
      const [dx, dy] = edit.sel.spot.split(',').map(Number);
      for (const st of map.seats) { const d = Math.abs(st.x - dx) + Math.abs(st.y - dy); if (d < 5) { ctx.fillStyle = `rgba(255,140,200,${0.5 * (1 - d / 5)})`; ctx.fillRect(st.x * TILE + 4, st.y * TILE + 4, 8, 8); } }
    }
    for (const lb of edit.labels || []) {
      ctx.fillStyle = 'rgba(35,26,42,.8)'; ctx.fillRect(lb.x * TILE + 1, lb.y * TILE + 4, 2 * TILE - 2, 7);
      ctx.fillStyle = '#fff'; ctx.font = '700 4.5px Galmuri11, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(lb.text, lb.x * TILE + TILE, lb.y * TILE + 7.7);
    }
  }

  function coin(x, y, amount, hot = false, five = false) {
    fx.push({ x: x * TILE + 8, y: y * TILE - 6, text: `+${amount}G`, age: 0, hot });
    if (five) for (let i = 0; i < 6; i++) sparks.push({ x: x * TILE + 8, y: y * TILE - 2, a: (i / 6) * Math.PI * 2, age: 0 });
  }

  // rating: 1~5, 0이면 화남
  // 아무 글이나 머리 위에 (바라는 맛, 일행 등)
  function sayText(x, y, text, bg = '#f4f4f0', fg = '#231a2a') {
    if (says.length > 8) return;
    says.push({ x: x * TILE + 8, y: y * TILE - 10, text, bg, fg, age: 0 });
  }
  function say(x, y, rating) {
    const SAY = { 0: ['흥!', '#d8433b', '#fff'], 1: ['별로…', '#f4f4f0', '#231a2a'], 2: ['음…', '#f4f4f0', '#231a2a'],
      3: ['괜찮네', '#f4f4f0', '#231a2a'], 4: ['맛있다!', '#fff4c8', '#231a2a'], 5: ['최고!', '#ffd35a', '#3a2400'] };
    const [text, bg, fg] = SAY[rating];
    says.push({ x: x * TILE + 8, y: y * TILE - 10, text, bg, fg, age: 0 });
  }

  // 화면 위 비율(0~1) 좌표로 누른 사람을 찾는다
  function pick(s, fx0, fy0) {
    const ax = fx0 * W, ay = fy0 * total - oy;
    if (edit) return { kind: 'cell', x: Math.floor(ax / TILE), y: Math.floor(ay / TILE) };
    if (signBox && ax >= signBox.x0 && ax <= signBox.x1 && ay >= signBox.y0 && ay <= signBox.y1) return { kind: 'shop', tab: 'build' };
    const people = [
      ...s.cooks.map((c) => ({ sel: { kind: 'cook', id: c.id }, x: (c.x + 1) * TILE, y: c.y * TILE + 8 })),
      ...s.servers.map((v) => ({ sel: { kind: 'server', id: v.id }, x: v.x * TILE + 8, y: v.y * TILE + 8 })),
      ...s.guests.map((g) => ({ sel: { kind: 'guest', id: g.id }, x: seated(g) ? (g.seat.x + 1) * TILE : g.x * TILE + 8, y: g.y * TILE + 8 })),
    ];
    let best = null, bestD = 1e9;
    for (const p of people) {
      const d = Math.hypot(ax - p.x, ay - p.y);
      if (d < 11 && d < bestD) { best = p.sel; bestD = d; }
    }
    return best;
  }

  return { draw, coin, say, sayText, pick, resize, frac, select: (v) => { selected = v; }, setEdit: (v) => { edit = v; }, get size() { return { w: W, h: total }; } };
}

// ---------- 가게 바깥: 위 지붕과 간판, 아래 돌길 ----------
function surround(c, W, total, oy, H, fest = false, t = 0) {
  const r = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  r(0, 0, W, total, '#4a3426');
  // 위: 나무 지붕널
  for (let y = 0; y < oy; y += 5) {
    r(0, y + 4, W, 1, '#3a281c');
    for (let x = (y / 5) % 2 ? 0 : 6; x < W; x += 12) r(x, y, 1, 4, '#3a281c');
  }
  // 간판
  if (oy >= 18) {
    const bw = 84, bh = 14, bx = Math.round(W / 2 - bw / 2), by = oy - bh - 3;
    r(bx + 10, by - 4, 1, 4, '#2a2238'); r(bx + bw - 11, by - 4, 1, 4, '#2a2238');
    r(bx - 1, by - 1, bw + 2, bh + 2, '#2a1d14');
    r(bx, by, bw, bh, '#8a5a33'); r(bx, by, bw, 2, '#b57a48'); r(bx, by + bh - 2, bw, 2, '#6a4322');
    c.font = '700 9px Galmuri11, ui-monospace, monospace'; c.textAlign = 'center';
    c.fillStyle = '#2a1d14'; c.fillText('차원골목 식당', W / 2 + 0.5, by + 11);
    c.fillStyle = '#ffe9a8'; c.fillText('차원골목 식당', W / 2, by + 10.5);
  }
  // 축제 날: 줄에 매단 삼각 깃발
  if (fest && oy >= 8) {
    const cols = ['#e2559a', '#ffd35a', '#6fd3a0', '#7ea2ff'];
    const y0 = Math.max(2, oy - 30);
    r(0, y0, W, 1, '#2a2238');
    for (let x = 4, i = 0; x < W - 4; x += 10, i++) {
      const sway = Math.round(Math.sin(t * 3 + i) * 0.6);
      c.fillStyle = cols[i % 4];
      for (let k = 0; k < 4; k++) c.fillRect(x + k + sway, y0 + 1 + k, 7 - k * 2, 1);
    }
  }
  // 아래: 가게 앞 길
  const top = oy + H, h = total - top;
  if (h > 0) {
    r(0, top, W, h, '#8d8478');
    r(0, top, W, Math.min(5, h), '#b9b1a3');
    for (let x = 0; x < W; x += 8) r(x, top, 1, Math.min(5, h), '#a39a8c');
    for (let y = top + 6; y < total; y += 5) for (let x = ((y - top) / 5) % 2 ? 0 : 5; x < W; x += 10) r(x, y, 8, 4, '#968d80');
    if (h >= 20) for (const lx of [10, W - 10]) { r(lx - 1, top + 5, 2, 14, '#2a2238'); r(lx - 3, top + 3, 6, 3, '#3a3050'); r(lx - 2, top + 3, 4, 2, '#f2e6c8'); }
  }
}

// ---------- 소품 ----------
function steam(c, x, y, t) {
  c.fillStyle = 'rgba(255,255,255,.75)';
  for (let i = 0; i < 3; i++) {
    const k = (t * 1.2 + i / 3) % 1;
    c.globalAlpha = 1 - k;
    c.fillRect(Math.round(x - 3 + i * 3 + Math.sin(t * 4 + i) * 1), Math.round(y - k * 8), 1.5, 1.5);
  }
  c.globalAlpha = 1;
}

function crown(c, cx, cy) {
  cx = Math.round(cx); cy = Math.round(cy);
  c.fillStyle = '#3a2400'; c.fillRect(cx - 5, cy - 1, 10, 6);
  c.fillStyle = PAL.gold; c.fillRect(cx - 4, cy + 1, 8, 3); c.fillRect(cx - 4, cy - 1, 2, 2); c.fillRect(cx - 1, cy - 2, 2, 3); c.fillRect(cx + 2, cy - 1, 2, 2);
}

function closedSign(c, map) {
  const d = map.doors[0];
  const x = d.x * TILE - 2, y = d.y * TILE - 8;
  c.fillStyle = '#3a2a1a'; c.fillRect(x, y, 36, 9);
  c.fillStyle = '#f2e6c8'; c.fillRect(x + 1, y + 1, 34, 7);
  c.font = '6px Galmuri11, ui-monospace, monospace'; c.textAlign = 'center'; c.fillStyle = '#3a2a1a';
  c.fillText('영업 마감', x + 18, y + 7);
}

// 말풍선: 생각 중·서두름은 표정 그림, 주문은 요리 그림, 나갈 때 기분은 작은 도트
function bubbleFor(c, g, x, headTop, t, faces, dish, hot, ready) {
  let kind = null;
  if (g.state === 'ordering') kind = 'think';
  else if (g.state === 'waiting') kind = g.waited > CONFIG.patienceMin * 0.6 ? 'hurry' : 'food';
  else if (g.state === 'leaving' && g.mood) kind = g.mood;
  if (!kind) return;
  if (kind === 'hurry' && Math.floor(t * 4) % 2) return;
  const X = Math.round(x), Y = Math.round(headTop);
  if ((kind === 'think' || kind === 'hurry' || kind === 'happy') && ready(faces[kind])) {
    c.drawImage(faces[kind], X - 6, Y - 13, 12, 12);
    return;
  }
  if (kind === 'food') {
    const bx = X - 6, by = Y - 12;
    c.fillStyle = hot ? '#e2559a' : PAL.ink; c.fillRect(bx - 1, by - 1, 12, 12); c.fillRect(bx + 4, by + 11, 2, 1.5);
    c.fillStyle = PAL.white; c.fillRect(bx, by, 10, 10);
    if (!dish(MENUS[g.menu]?.dish, (bx + 1) * ART, (by + 1) * ART)) { c.fillStyle = MENUS[g.menu]?.color || '#ccc'; c.fillRect(bx + 3, by + 3, 4, 4); }
    return;
  }
  const bx = X - 5, by = Y - 11;
  c.fillStyle = PAL.ink; c.fillRect(bx - 1, by - 1, 12, 10); c.fillRect(bx + 4, by + 9, 2, 2);
  c.fillStyle = PAL.white; c.fillRect(bx, by, 10, 8); c.fillRect(bx + 4, by + 8, 2, 1);
  const r = (a, b, w, h, col) => { c.fillStyle = col; c.fillRect(bx + a, by + b, w, h); };
  switch (kind) {
    case 'happy': r(2, 2, 2, 1, PAL.red); r(6, 2, 2, 1, PAL.red); r(1, 3, 8, 2, PAL.red); r(2, 5, 6, 1, PAL.red); r(4, 6, 2, 1, PAL.red); break;
    case 'sad': r(2, 3, 1, 1, PAL.ink); r(7, 3, 1, 1, PAL.ink); r(3, 6, 4, 1, PAL.ink); r(2, 5, 1, 1, PAL.ink); r(7, 5, 1, 1, PAL.ink); break;
    case 'angry': r(2, 2, 2, 2, PAL.red); r(6, 2, 2, 2, PAL.red); r(4, 4, 2, 2, PAL.red); r(2, 6, 2, 1, PAL.red); r(6, 6, 2, 1, PAL.red); break;
  }
}

// ---------- 그림을 못 불러왔을 때만 쓰는 임시 도트 사람 ----------
export function drawChar(c, x, y, look, { face = 1 } = {}) {
  const r = (a, b, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(a), Math.round(b), w, h); };
  const X = Math.round(x), Y = Math.round(y);
  r(X - 2, Y - 2, 1, 2, look.legs); r(X + 1, Y - 2, 1, 2, look.legs);
  r(X - 3, Y - 7, 6, 5, look.body);
  r(X - 2, Y - 11, 4, 4, look.skin);
  r(X - 2, Y - 12, 4, 1, look.hair);
  r(X - 1 + (face > 0 ? 1 : 0), Y - 9, 1, 1, PAL.ink);
}
