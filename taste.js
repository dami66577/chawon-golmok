// 《차원골목 식당》 맛 판정
// 재료 두 개 → 어떤 요리가 되는지, 얼마나 맛있는지, 왜 그런지.
// 재료의 분류(cls)와 맛 속성(tags)은 assets/ingredients/catalog.json에 있다 (tools/tag_ingredients.py가 붙인다).
// 같은 짝은 고르는 순서와 상관없이, 어느 저장 파일에서든 언제나 같은 결과가 나온다.
// 그래서 두 사람이 "이 조합 좋아요" 하고 서로 알려 줄 수 있다.
import { CATALOG, SPECIALS, DISH_NAMES, WORLD_ROW_OF_DISH } from './data.js';

export const CLS_NAME = {
  fruit: '과일', veg: '채소', root: '뿌리채소', mushroom: '버섯', herb: '허브', grain: '곡물', nut: '콩·견과',
  flower: '꽃', meat: '고기', sea: '해산물', egg: '알', dairy: '유제품', spice: '향신료', sweet: '단맛 재료', season: '양념',
};
export const TAGS = ['단맛', '상큼', '매운맛', '고소', '감칠', '향긋', '꽃향', '마력'];
export const KIND_NAME = {
  rice: '밥', noodle: '면', egg: '달걀 요리', grill: '구이', soup: '수프', bread: '빵·피자', fry: '튀김',
  salad: '샐러드', dessert: '디저트', drink: '차',
};

// ---------- 정규화 ----------
export const pairOf = (a, b) => (a < b ? [a, b] : [b, a]);
export const pairKey = (a, b) => pairOf(a, b).join('+');
export const recipeIdOf = (a, b) => `rc_${pairOf(a, b).join('__')}`;
export const info = (id) => CATALOG[id] || null;

// 같은 문자열 → 같은 숫자 (그림 고르기에만 쓴다, 맛에는 안 쓴다)
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------- 맛 궁합표 ----------
// [속성1, 속성2, 점수, 이유]. 순서 없음.
const TAG_PAIRS = [
  ['단맛', '상큼', 14, '달콤새콤해요'], ['단맛', '고소', 12, '고소하고 달콤해요'], ['단맛', '꽃향', 12, '꽃향이 단맛을 살려요'],
  ['단맛', '향긋', 6, '향긋한 단맛이에요'], ['단맛', '마력', 6, '단맛에 마력이 반짝여요'],
  ['단맛', '매운맛', -6, '달고 매워서 헷갈려요'], ['단맛', '감칠', -8, '단맛이 감칠맛과 부딪혀요'], ['단맛', '단맛', -4, '너무 달아요'],
  ['상큼', '감칠', 10, '새콤함이 진한 맛을 깔끔하게 잡아요'], ['상큼', '매운맛', 4, '새콤매콤해요'],
  ['상큼', '고소', -4, '신맛이 고소함을 깎아요'], ['상큼', '상큼', -6, '너무 셔요'],
  ['매운맛', '고소', 14, '매운맛을 고소함이 부드럽게 감싸요'], ['매운맛', '감칠', 12, '매콤하고 진해요'],
  ['매운맛', '꽃향', -14, '꽃향이 매운맛에 묻혀요'], ['매운맛', '매운맛', -10, '너무 매워요'], ['매운맛', '향긋', 2, '향긋하게 매워요'],
  ['고소', '감칠', 10, '진하고 고소해요'], ['고소', '향긋', 6, '향긋하고 고소해요'], ['고소', '고소', 2, '고소함이 겹쳐요'], ['고소', '꽃향', 4, '은은한 꽃향이 나요'],
  ['감칠', '감칠', 6, '감칠맛이 겹겹이 쌓여요'], ['감칠', '향긋', 8, '향긋함이 잡내를 잡아요'], ['감칠', '꽃향', -10, '꽃향이 어색해요'],
  ['향긋', '꽃향', 6, '향이 곱게 어울려요'], ['향긋', '향긋', -2, '향이 겹쳐요'], ['꽃향', '꽃향', -6, '향이 너무 강해요'],
  ['마력', '마력', 10, '마력이 공명해요'],
];
// [분류1, 분류2, 점수, 이유]
const CLS_PAIRS = [
  ['meat', 'spice', 10, '고기엔 양념이죠'], ['meat', 'herb', 8, '허브가 고기 맛을 살려요'], ['meat', 'mushroom', 8, '고기와 버섯은 단짝'],
  ['meat', 'grain', 6, '든든한 한 그릇이 돼요'], ['meat', 'root', 6, '고기와 뿌리채소가 푸짐해요'], ['meat', 'veg', 4, '고기와 채소는 무난해요'],
  ['meat', 'season', 8, '간이 잘 배요'], ['meat', 'fruit', -8, '고기와 과일은 어색해요'], ['meat', 'flower', -10, '고기에 꽃은 안 어울려요'],
  ['meat', 'sweet', -6, '고기가 너무 달아져요'], ['meat', 'sea', -6, '고기와 해산물이 맛을 다퉈요'], ['meat', 'meat', -4, '고기만 둘이라 느끼해요'],
  ['sea', 'grain', 6, '해산물 밥은 늘 옳아요'], ['sea', 'herb', 6, '허브가 비린내를 잡아요'], ['sea', 'spice', 6, '해산물에 알싸한 양념'],
  ['sea', 'season', 6, '바다 맛이 살아나요'], ['sea', 'veg', 4, '해산물과 채소는 무난해요'], ['sea', 'sweet', -10, '해산물이 달면 이상해요'],
  ['sea', 'flower', -8, '바다 맛과 꽃향이 겉돌아요'], ['sea', 'fruit', -4, '해산물과 과일은 조심해야 해요'],
  ['egg', 'grain', 8, '밥이나 빵엔 달걀이 잘 맞아요'], ['egg', 'veg', 6, '채소와 달걀은 잘 어울려요'], ['egg', 'dairy', 6, '달걀이 부드러워져요'],
  ['egg', 'meat', 4, '둘 다 든든해요'], ['egg', 'root', 4, '포근한 맛이 나요'], ['egg', 'mushroom', 4, '버섯과 달걀은 잘 어울려요'],
  ['egg', 'fruit', -6, '달걀과 과일은 애매해요'], ['egg', 'egg', -4, '알만 두 개예요'],
  ['dairy', 'fruit', 8, '과일엔 크림이죠'], ['dairy', 'sweet', 6, '크림이 달콤해져요'], ['dairy', 'grain', 6, '반죽이 촉촉해져요'],
  ['dairy', 'mushroom', 8, '버섯엔 크림이 진리예요'], ['dairy', 'root', 6, '뿌리채소엔 버터가 잘 맞아요'], ['dairy', 'veg', 4, '채소가 크림에 부드러워져요'], ['dairy', 'herb', 4, '허브 향 크림이 돼요'],
  ['dairy', 'dairy', -2, '느끼해요'],
  ['fruit', 'sweet', 6, '과일 디저트로 딱이에요'], ['fruit', 'grain', 4, '곡물 반죽에 과일을 얹기 좋아요'], ['fruit', 'herb', 4, '허브가 과일 향을 살려요'], ['fruit', 'flower', 6, '꽃과 과일은 잘 어울려요'],
  ['fruit', 'fruit', 2, '과일끼리 무난해요'], ['fruit', 'veg', 2, '상큼한 샐러드가 돼요'], ['fruit', 'mushroom', -8, '과일과 버섯은 안 어울려요'], ['fruit', 'root', -2, '과일과 뿌리채소는 애매해요'],
  ['grain', 'veg', 4, '채소를 넣은 밥은 담백해요'], ['grain', 'mushroom', 4, '버섯 향이 밥에 배어요'], ['grain', 'nut', 4, '반죽이 고소해져요'], ['grain', 'sweet', 4, '반죽이 달콤해져요'],
  ['grain', 'grain', -6, '곡물만 둘이라 퍽퍽해요'],
  ['veg', 'veg', 2, '채소끼리 무난해요'], ['veg', 'herb', 4, '허브가 채소를 향긋하게 해요'], ['veg', 'mushroom', 4, '채소와 버섯은 무난해요'], ['veg', 'root', 4, '채소끼리 무난해요'], ['veg', 'season', 4, '간이 잘 맞아요'],
  ['root', 'season', 4, '간이 배어요'], ['root', 'spice', 4, '뿌리채소에 양념'], ['root', 'root', -2, '퍽퍽해요'],
  ['mushroom', 'season', 6, '버섯 맛이 살아나요'], ['mushroom', 'herb', 4, '허브가 버섯 향을 살려요'],
  ['herb', 'sweet', 4, '달콤한 차가 돼요'], ['herb', 'flower', 4, '꽃차가 돼요'], ['herb', 'herb', -4, '풀맛만 나요'],
  ['flower', 'sweet', 6, '꽃과 꿀은 단짝이에요'], ['flower', 'flower', -4, '꽃만 둘이에요'],
  ['spice', 'spice', -8, '향신료만 둘이라 너무 자극적이에요'], ['season', 'season', -8, '간만 맞추고 재료가 없어요'],
  ['spice', 'season', -4, '양념뿐이에요'], ['sweet', 'sweet', -6, '설탕끼리라 너무 달아요'], ['nut', 'sweet', 6, '고소하고 달콤해요'], ['nut', 'nut', -2, '퍽퍽해요'],
];
const TP = new Map(), CP = new Map();
const k2 = (x, y) => (x < y ? `${x}|${y}` : `${y}|${x}`);
for (const [x, y, v, why] of TAG_PAIRS) TP.set(k2(x, y), [v, why]);
for (const [x, y, v, why] of CLS_PAIRS) CP.set(k2(x, y), [v, why]);
export const tagPair = (x, y) => TP.get(k2(x, y)) || null;
export const clsPair = (x, y) => CP.get(k2(x, y)) || null;

// ---------- 어떤 요리가 되나 ----------
const has = (set, ...cs) => cs.some((c) => set.has(c));
function kindOf(A, B) {
  const cs = new Set([A.cls, B.cls]);
  const other = (c) => (A.cls === c ? B : A);
  const wheat = (x) => /밀|보리|메밀|귀리|전분|효모/.test(x.name);
  if (has(cs, 'meat', 'sea')) {
    const o = has(new Set([A.cls]), 'meat', 'sea') ? B : A;
    if (o.cls === 'grain') return wheat(o) ? 'noodle' : 'rice';
    if (o.cls === 'egg') return 'egg';
    if (o.cls === 'dairy') return 'soup';
    return 'grill';
  }
  if (cs.has('egg')) {
    const o = other('egg');
    if (o.cls === 'grain') return wheat(o) ? 'bread' : 'egg';
    if (has(new Set([o.cls]), 'sweet', 'fruit')) return 'dessert';
    return 'egg';
  }
  if (cs.has('dairy')) {
    const o = other('dairy');
    if (has(new Set([o.cls]), 'fruit', 'sweet', 'flower', 'nut', 'dairy')) return 'dessert';
    if (o.cls === 'grain') return 'bread';
    if (o.cls === 'herb') return 'drink';
    return 'soup';
  }
  if (cs.has('fruit')) {
    const o = other('fruit');
    if (has(new Set([o.cls]), 'fruit', 'sweet', 'flower', 'nut', 'grain')) return 'dessert';
    if (o.cls === 'herb') return 'drink';
    if (o.cls === 'veg') return 'salad';
    return 'salad';
  }
  if (cs.has('sweet')) {
    const o = other('sweet');
    if (has(new Set([o.cls]), 'herb', 'flower')) return 'drink';
    return 'dessert';
  }
  if (cs.has('herb') && has(cs, 'flower', 'herb')) return 'drink';
  if (cs.has('flower')) return 'drink';
  if (cs.has('grain')) {
    const o = other('grain');
    if (has(new Set([o.cls]), 'grain', 'nut')) return 'bread';
    if (has(new Set([o.cls]), 'spice', 'season')) return 'fry';
    return wheat(A.cls === 'grain' ? A : B) ? 'noodle' : 'rice';
  }
  if (cs.has('root')) return has(cs, 'spice', 'season') ? 'fry' : 'soup';
  if (cs.has('mushroom')) return 'soup';
  if (cs.has('veg')) return has(cs, 'spice', 'season') ? 'grill' : 'salad';
  return 'soup';
}

// 요리 종류 → 그림. b = 기본 요리 40종, f = 판타지 요리 40종(줄 = 세계).
export const KIND_DISHES = {
  rice: ['b00', 'b02', 'b03', 'b04', 'b05', 'b06', 'b07', 'f10', 'f19', 'f24', 'f35'],
  noodle: ['b16', 'b17', 'b18', 'b19', 'b20', 'b21', 'f02', 'f11', 'f18', 'f26', 'f28'],
  egg: ['b01', 'b12', 'f00', 'f27'],
  grill: ['b09', 'b10', 'b11', 'b13', 'b14', 'b15', 'f04', 'f17', 'f25'],
  soup: ['b22', 'b23', 'f01', 'f05', 'f12', 'f13', 'f29', 'f34'],
  bread: ['b24', 'b25', 'b26', 'b27', 'b30', 'f06', 'f08', 'f09', 'f16', 'f20'],
  fry: ['b08', 'b28', 'b29', 'f03'],
  salad: ['b31', 'b39', 'f38'],
  dessert: ['b32', 'b33', 'b34', 'b35', 'b36', 'b37', 'b38', 'b39', 'f07', 'f14', 'f15', 'f21', 'f22', 'f23', 'f30', 'f31', 'f32', 'f33', 'f36', 'f37', 'f39'],
  drink: ['f05', 'b22', 'f32'],
};
// 고기·해산물 그림은 그 재료가 있을 때만
const MEATY = new Set(['b07', 'b08', 'b09', 'b10', 'b13', 'b14', 'b15', 'b23', 'b24', 'b26', 'f16', 'f17']);
const SEAY = new Set(['b05', 'b11', 'f25']);
function dishFor(kind, key, worlds, cs) {
  let all = KIND_DISHES[kind];
  const meat = cs.has('meat'), sea = cs.has('sea');
  const fit = all.filter((d) => (meat || !MEATY.has(d)) && (sea || !SEAY.has(d)));
  const prefer = fit.filter((d) => (meat && MEATY.has(d)) || (sea && SEAY.has(d)));
  all = prefer.length ? prefer : fit.length ? fit : all;
  const h = hash(key);
  // 세계 재료가 들었으면 그 세계 줄 그림을 먼저
  for (const w of worlds) {
    const mine = all.filter((d) => WORLD_ROW_OF_DISH(d) === w);
    if (mine.length && (w !== 'fantasy' || h % 2 === 0)) return mine[(h >>> 4) % mine.length];
  }
  const basic = all.filter((d) => d[0] === 'b');
  const list = basic.length ? basic : all;
  return list[(h >>> 7) % list.length];
}
const nounOf = (dish, kind, A, B) => {
  if (kind === 'drink') return has(new Set([A.cls, B.cls]), 'fruit') ? '에이드' : '차';
  const n = Number(dish.slice(1));
  return dish[0] === 'b' ? DISH_NAMES.b[n] : DISH_NAMES.f[n].split(' ').pop();
};
const ADJ = { 단맛: '달콤', 상큼: '새콤', 매운맛: '매콤', 고소: '고소', 감칠: '진한', 향긋: '향긋', 꽃향: '꽃향', 마력: '반짝' };
const RANK = { normal: 0, fantasy: 1, xian: 2, fairy: 2, demon: 2, heaven: 2 };

// ---------- 판정 ----------
export function starsOf(q) { return q < 30 ? 1 : q < 45 ? 2 : q < 60 ? 3 : q < 75 ? 4 : 5; }
export const SPECIAL_BY_KEY = new Map();
export function indexSpecials() { SPECIAL_BY_KEY.clear(); for (const sp of SPECIALS) SPECIAL_BY_KEY.set(pairKey(sp.a, sp.b), sp); }
indexSpecials();

// 재료 두 개를 섞으면? { key, a, b, q, stars, kind, dish, name, tags, cls, hearty, world, reasons, special }
export function evaluate(x, y) {
  const [a, b] = pairOf(x, y);
  const A = info(a), B = info(b);
  if (!A || !B || a === b) return null;
  const key = `${a}+${b}`;
  const reasons = [];
  // 1) 맛 속성 궁합: 서로 다른 재료의 속성끼리
  let tagSum = 0;
  const tagHits = [];
  for (const t1 of A.tags) for (const t2 of B.tags) {
    const p = tagPair(t1, t2);
    if (p) { tagSum += p[0]; tagHits.push(p); }
  }
  tagSum = Math.max(-24, Math.min(24, tagSum));
  // 2) 분류 궁합
  const cp = clsPair(A.cls, B.cls);
  const clsScore = cp ? cp[0] : 0;
  // 3) 세계
  let worldScore = 0;
  const worlds = [A.category, B.category].filter((w) => w !== 'normal');
  const rare = RANK[A.category] * 2 + RANK[B.category] * 2;
  if (worlds.length === 2 && worlds[0] === worlds[1] && worlds[0] !== 'fantasy') { worldScore = 5; reasons.push({ v: 5, why: '같은 세계 재료라 잘 어울려요' }); }
  else if (worlds.length === 2 && worlds[0] !== worlds[1] && RANK[worlds[0]] === 2 && RANK[worlds[1]] === 2) { worldScore = -4; reasons.push({ v: -4, why: '세계가 달라 맛이 겉돌아요' }); }
  // 이유: 가장 센 속성 궁합 둘 + 분류 궁합
  tagHits.sort((p, q) => Math.abs(q[0]) - Math.abs(p[0]));
  const seenWhy = new Set();
  for (const p of tagHits) { if (seenWhy.has(p[1])) continue; seenWhy.add(p[1]); reasons.push({ v: p[0], why: p[1] }); if (seenWhy.size >= 2) break; }
  if (cp) reasons.push({ v: cp[0], why: cp[1] });
  if (!tagHits.length && !cp) reasons.push({ v: 0, why: A.tags.length || B.tags.length ? '맛이 한쪽으로만 나요. 받쳐 줄 재료를 찾아보세요' : '맛이 심심해요. 개성 있는 재료를 더해 보세요' });
  let q = 42 + tagSum + clsScore + worldScore + rare;
  q = Math.max(12, Math.min(88, Math.round(q)));
  const kind = kindOf(A, B);
  const tags = [...new Set([...A.tags, ...B.tags])].slice(0, 4);
  const hearty = (A.hearty ? 1 : 0) + (B.hearty ? 1 : 0) >= 1 && ['rice', 'noodle', 'grill', 'bread', 'fry', 'egg', 'soup'].includes(kind) ? 1 : 0;
  const order = [a, b].sort((p, q2) => (RANK[info(q2).category] - RANK[info(p).category]) || (info(q2).tags.length - info(p).tags.length));
  const main = info(order[0]), side = info(order[1]);
  const world = worlds.sort((p, q2) => RANK[q2] - RANK[p])[0] || 'normal';
  let dish = dishFor(kind, key, worlds.length ? [...new Set(worlds)].sort((p, q2) => RANK[q2] - RANK[p]) : [], new Set([A.cls, B.cls]));
  let name = `${side.tags[0] ? ADJ[side.tags[0]] : side.name} ${main.name} ${nounOf(dish, kind, A, B)}`;
  const sp = SPECIAL_BY_KEY.get(key);
  let effect = null;
  let k = kind;
  if (sp) {
    q = sp.q; dish = sp.dish; name = sp.name; effect = sp.effect;
    if (!KIND_DISHES[kind].includes(dish)) k = Object.keys(KIND_DISHES).find((x) => KIND_DISHES[x].includes(dish)) || kind;
    reasons.unshift({ v: 20, why: '전설의 조합! 이름 있는 요리가 됐어요' });
  }
  return {
    key, a, b, q, stars: starsOf(q), kind: k, dish, name, tags, cls: [A.cls, B.cls], hearty, world,
    reasons: reasons.filter((r) => r.why).slice(0, 4), special: !!sp, effect,
  };
}

// ---------- 개량 ----------
// 방향: flavor(풍미) · hearty(푸짐) · premium(고급) · technique(조리법). 앞의 셋은 재료 하나를 더한다.
export const UPGRADE_DIRS = {
  flavor: { name: '풍미 강화', cls: ['herb', 'spice', 'flower', 'season', 'sweet'], desc: '맛이 깊어져요. 원가가 조금 올라요.' },
  hearty: { name: '푸짐하게', cls: ['grain', 'root', 'nut', 'egg', 'meat'], desc: '배부른 한 그릇. 값이 오르고 먹는 시간이 늘어요.' },
  premium: { name: '고급 재료', cls: null, desc: '세계 재료로 고급 요리가 돼요. 값이 크게 오르고, 지갑 얇은 손님은 망설여요.' },
  technique: { name: '조리법 개선', cls: [], desc: '조리 시간이 30% 줄어요. 재료는 필요 없어요.' },
};
export function canUseFor(dir, ingId) {
  const I = info(ingId);
  if (!I) return false;
  if (dir === 'technique') return false;
  if (dir === 'premium') return I.category !== 'normal';
  return UPGRADE_DIRS[dir].cls.includes(I.cls);
}
// 요리(속성 목록)에 재료 하나를 더했을 때 얼마나 어울리나: -8 ~ +16
export function upgradeFit(menuTags, menuKind, ingId) {
  const I = info(ingId);
  let v = 4;
  const hits = [];
  for (const t1 of menuTags) for (const t2 of I.tags) { const p = tagPair(t1, t2); if (p) { v += p[0] / 2; hits.push(p); } }
  hits.sort((p, q) => Math.abs(q[0]) - Math.abs(p[0]));
  v = Math.max(-8, Math.min(16, Math.round(v)));
  return { v, why: hits[0] ? hits[0][1] : v >= 4 ? '무난하게 어울려요' : '맛이 따로 놀아요' };
}
