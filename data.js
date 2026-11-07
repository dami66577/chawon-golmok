// 《차원골목 식당》 데이터
// 숫자, 세계, 재료, 메뉴, 손님은 전부 여기서만 고친다. 코드 파일은 건드리지 않아도 된다.
// 새 세계를 열려면 WORLDS에서 ready를 true로 바꾸고, 그 세계의 재료·메뉴·손님을 아래에 더하면 끝.

export const CONFIG = {
  saveVersion: 3,      // 2→3: 재료 창고·연구 노트·개량·메뉴 칸 (옛 저장은 sim.js migrate가 옮긴다)

  // 시간: 게임 1분이 현실 0.1초. 1배속이면 하루 영업 12시간이 72초.
  tickMin: 0.25,
  realSecPerGameMin: 0.1,
  openMin: 9 * 60,        // 오전 9시 개점
  lastEntryMin: 20 * 60,  // 오후 8시 이후엔 손님을 안 받음
  closeMin: 21 * 60,      // 오후 9시 마감 (남은 손님은 다 먹고 나감)

  startMoney: 500,

  // 걷는 속도 (게임 1분에 몇 칸)
  guestWalkPerMin: 0.3,
  staffWalkPerMin: 1.0,

  // 손님
  guestsPerHour: 1.6,       // 평판 0일 때 시간당 손님 수
  repSpawnBoost: 1 / 60,    // 평판 60마다 손님 +100%
  orderMin: 4,              // 자리에 앉아 메뉴 고르는 시간
  patienceMin: 75,          // 음식을 이만큼 못 받으면 화내고 나감

  // 평판
  repThresholds: [0, 40, 120, 240, 400],       // 별 1~5개
  repByRating: { 1: -2, 2: -1, 3: 0.6, 4: 1.4, 5: 2 },
  repSoftness: 60,                              // 오르는 평판 × 60/(60+지금 평판). 높을수록 오르기 힘들다
  repAngry: -3,
  tipRateOnFive: 0.2,                           // 별 다섯 개면 값의 20% 팁

  // 유행: 일주일마다 재료 하나나 세계 하나가 뜬다
  trend: {
    days: 7,             // 한 유행이 가는 날 수
    pickBoost: 3,        // 유행 메뉴를 고를 확률 배수
    priceBoost: 0.3,     // 유행 메뉴 값 +30%
    ratingBonus: 0.25,   // 유행 메뉴 별점 덤
    worldWeight: 2,      // 세계 유행이 재료 유행보다 잘 뽑히는 정도 (메뉴가 있는 세계만)
  },

  // 직원
  staff: {
    maxCooks: 4, maxServers: 3,            // 화덕 4개, 종업원 자리 3개 (지도의 c, s 수)
    expToLevel: [0, 8, 20, 40, 70],        // 레벨 1~5에 필요한 누적 경험치 (한 그릇 = 1)
    cookSpeedPerLevel: 0.1,                // 레벨마다 요리 시간 -10%
    walkSpeedPerLevel: 0.12,               // 레벨마다 걸음 +12%
    wage: { cook: 20, server: 15 },        // 레벨 1 일당
    wagePerLevel: 8,                       // 레벨이 오를 때마다 일당 +8
    hireFeeDays: 3,                        // 뽑을 때 일당 3일치를 계약금으로
    candidatesPerDay: 3,
  },

  // 신메뉴 개발
  dev: {
    baseCost: 120, costStep: 40,           // 개발비: 120G, 하나 만들 때마다 +40G
    priceMult: 1.8, priceMultPerTaste: 0.35,
  },

  // 손님이 몰리는 시간 [시작 분, 끝 분, 배수]
  peaks: [[12 * 60, 13 * 60 + 30, 1.8], [18 * 60, 19 * 60 + 30, 1.6]],

  // 미식 평론가: 둘째 날부터 가끔 온다. 평판 변화가 몇 배로 커진다.
  critic: { chance: 0.3, fromDay: 2, repMult: 4, from: 11 * 60, to: 17 * 60 },

  // 가게 확장: 처음엔 탁자 2개. 하나 더 들일 때마다 값이 오른다 (탁자 순서는 주방에서 가까운 것부터)
  tables: { start: 2, prices: [400, 800, 1500, 2500, 3500, 5000, 7000, 9000] },

  // 분위기: 장식 점수 합. 손님 수 +분위기%, 분위기 20마다 별점 덤 +0.1
  atmosphere: { spawnPerPoint: 0.01, maxSpawn: 0.5, ratingPer20: 0.1 },

  // 아이디어: 별 다섯 개 4번마다 1, 평론가 별 다섯 개면 5. 신메뉴 개발에 골드와 함께 든다.
  ideas: { start: 6, fivesPerIdea: 8, criticFive: 5, special: 2 },

  // 만족도(0~100쯤) → 별. 요리 품질 q에 손님 취향·값·기다림·분위기가 더해진다.
  satStars: [55, 70, 84, 98],          // 이 값 미만이면 별 1, 2, 3, 4개. 넘으면 5개
  waitGrace: 25,                       // 이만큼은 기다려도 괜찮다 (분)
  waitPenalty: 0.5,                    // 그다음 1분마다 만족도 감점

  // 메뉴판 칸: 처음 5칸, 칸을 늘릴 때마다 값이 오른다 (최대 10칸)
  menuSlots: { start: 5, prices: [400, 900, 1800, 3200, 5000] },

  // 시제품 실험: 재료값 × 2 + 10G. 아이디어는 안 든다. 같은 짝은 연구 노트에서 다시 본다.
  lab: { base: 10, costMult: 2, clueIdeas: 3 },

  // 개량: 메뉴마다 3번까지. n번째 개량은 아이디어 2+n개, 골드 80×(n+1)
  upgrade: { max: 3, ideasBase: 2, goldBase: 80, heartyPrice: 0.12, heartyEat: 0.2, premiumPrice: 0.35, techCook: 0.7 },

  // 처음 창고에 있는 재료 (판타지 기본 메뉴 재료 8개 + 일반 재료 10개)
  starterPantry: ['fantasy_095', 'fantasy_098', 'fantasy_067', 'fantasy_002', 'fantasy_052', 'fantasy_062', 'fantasy_065', 'fantasy_066',
    'normal_041', 'normal_042', 'normal_061', 'normal_071', 'normal_074', 'normal_079', 'normal_006', 'normal_011', 'normal_021', 'normal_027'],
  // 거래처 꾸러미: 세계마다 값이 다르다. 같은 묶음의 다음 꾸러미는 50%씩 비싸진다.
  packPrice: { normal: 150, fantasy: 280, xian: 450, fairy: 600, demon: 750, heaven: 900 },
  packSize: 6,

  // 메뉴 레벨: 판 그릇 수로 오른다. 레벨마다 값 +8%, 맛 덤 +0.25
  menuLevel: { exp: [0, 10, 30, 60, 100], pricePerLevel: 0.06, qPerLevel: 1.5 },

  // 요리 종류별 조리·식사 시간 (게임 분). 새로 만든 요리에 쓴다.
  kindTime: { drink: [6, 15], salad: [7, 22], dessert: [12, 25], egg: [10, 28], fry: [11, 28], rice: [13, 35], noodle: [14, 32], bread: [15, 32], grill: [14, 36], soup: [16, 34] },

  // 직원 연수: 하루 한 번, 레벨 × 150G에 경험치 +5
  training: { costPerLevel: 150, exp: 5 },

  // 단골 선물: 이 번째 방문에 선물을 준다
  giftVisits: [5, 10, 20, 40],

  // 가게 순위: 7일마다. 우리 점수 = 평판 + 그 주 매출 / 100
  ranking: { every: 7, salesDiv: 100 },

  // 요리 대회: 매달 30일 마감 때. 대표 메뉴는 (맛 + 레벨) 가장 높은 것
  // 요리 대회: 등급제. 우승하면 다음 등급으로 올라간다. 경쟁 가게 점수는 날짜가 아니라 등급으로 정해지고,
  // 가장 높은 등급도 맛·개량·레벨을 거의 다 채우고 주제에 맞추면 이길 수 있게 맞췄다
  // (최강전 경쟁 1등 114~126점, 완벽한 메뉴 128~144점).
  contest: { day: 30, notice: 3, prizes: [{ gold: 1000, rep: 15 }, { gold: 500, rep: 8 }, { gold: 200, rep: 3 }],
    leagues: [
      { name: '동네 요리 대회', base: 68 },
      { name: '지방 요리 대회', base: 75 },
      { name: '왕국 요리 대회', base: 82 },
      { name: '대륙 요리 대회', base: 88 },
      { name: '이세계 최강전', base: 94 },
    ] },
};

// 가게 장식: 지도의 화분 자리(P)에 놓는다. atmos는 분위기 점수.
// art: 그릴 가게 부품 그림, hue: 색 돌리기(도). world가 있는 장식은 의뢰를 마쳐야 살 수 있고, 그 세계 손님이 좋아한다.
// (세계 가구 그림이 오면 art만 바꾸면 된다)
export const DECOR = [
  { id: 'herb_pot',    name: '허브 화분',   price: 300, atmos: 5,  art: 'herb_pot' },
  { id: 'flower_pot',  name: '꽃 화분',     price: 800, atmos: 8,  art: 'flower_pot' },
  { id: 'crystal_pot', name: '수정 화분',   price: 1500, atmos: 12, art: 'crystal_pot' },
  { id: 'xian_lantern',  name: '선계 연꽃 등', price: 900,  atmos: 10, art: 'flower_pot', hue: 300, world: 'xian',   bonus: 8, desc: '선계 손님 만족 +8' },
  { id: 'fairy_seat',    name: '요정 꽃 의자', price: 900,  atmos: 8,  art: 'herb_pot',   hue: 60,  world: 'fairy',  bonus: 10, desc: '요정 손님 만족 +10' },
  { id: 'demon_brazier', name: '마계 화로',    price: 1200, atmos: 10, art: 'crystal_pot', hue: 150, world: 'demon', bonus: 8, desc: '마계 손님 만족 +8' },
  { id: 'heaven_cloud',  name: '천계 구름 화분', price: 1500, atmos: 12, art: 'crystal_pot', hue: 210, world: 'heaven', bonus: 8, desc: '천계 손님 만족 +8' },
  { id: 'trophy',        name: '요리 대회 트로피', price: 0, atmos: 15, art: 'crystal_pot', hue: 30, unlock: 'contest', desc: '대회 우승 기념. 분위기 +15' },
];

// 의뢰: 손님이 부탁하는 요리. need를 만족하는 메뉴를 그 손님 종류에게 내면(별 minStars 이상) 끝난다.
// need: kinds(이 중 하나), tags(이 중 하나), world(그 세계 메뉴), hearty(true 든든 / false 가벼움), maxPrice, minStars
// reward: gold, ideas, ingredients, decor(살 수 있게), invite(그 세계 손님 더 많이), perk(단골 혜택), pack(꾸러미 공짜)
// 세계 의뢰는 문이 열리면 1번부터, 끝내면 다음 번. 판타지 단골 의뢰는 그 손님 종류 중 한 명의 정이 8을 넘으면.
export const REQUESTS = [
  { id: 'xian1', by: 'xian_folk', title: '맑은 향의 차 한 잔', line: '속세의 향 말고, 맑은 향이 나는 차 한 잔 없겠소?',
    need: { kinds: ['drink'], tags: ['향긋', '꽃향'] }, reward: { ideas: 2, ingredients: ['xian_lotus_nectar', 'xian_jade_leaf_tea', 'xian_osmanthus_honey'] } },
  { id: 'xian2', by: 'xian_folk', after: 'xian1', title: '수련 뒤의 든든한 밥', line: '좌선을 오래 했더니 배가 고프구려. 따뜻한 밥 한 그릇!',
    need: { kinds: ['rice'], minStars: 4 }, reward: { gold: 300, decor: 'xian_lantern' } },
  { id: 'xian3', by: 'xian_folk', after: 'xian2', title: '선계에 소문낼 요리', line: '이 집 요리를 사형제들에게도 맛보이고 싶소.',
    need: { world: 'xian', minStars: 5 }, reward: { ideas: 4, invite: 'xian' } },
  { id: 'fairy1', by: 'fairy_folk', title: '꽃향기 디저트', line: '꽃향기가 나는 달콤한 걸 먹고 싶어요!',
    need: { kinds: ['dessert'], tags: ['꽃향'] }, reward: { ideas: 2, ingredients: ['fairy_073', 'fairy_082', 'fairy_032'] } },
  { id: 'fairy2', by: 'fairy_folk', after: 'fairy1', title: '요정 한 입 크기', line: '양이 적고 예쁜 요리면 좋겠어요. 저희는 작으니까요!',
    need: { kinds: ['dessert', 'salad', 'drink'], hearty: false, minStars: 4 }, reward: { gold: 300, decor: 'fairy_seat' } },
  { id: 'fairy3', by: 'fairy_folk', after: 'fairy2', title: '요정 친구 소개', line: '친구들한테 여기 얘기 해도 돼요? 다 데려올게요!',
    need: { world: 'fairy', minStars: 5 }, reward: { ideas: 4, invite: 'fairy' } },
  { id: 'demon1', by: 'demon_folk', title: '지옥불 한 접시', line: '혀가 타들어 갈 만큼 매운 구이를 내놔라!',
    need: { kinds: ['grill'], tags: ['매운맛'] }, reward: { ideas: 2, ingredients: ['demon_beasthorn_garlic', 'demon_volcanic_sichuan_pepper', 'demon_black_sugar_sap'] } },
  { id: 'demon2', by: 'demon_folk', after: 'demon1', title: '마족의 잔칫상', line: '배가 터지도록 진한 걸로. 마족은 적게 안 먹는다.',
    need: { hearty: true, tags: ['감칠'], minStars: 4 }, reward: { gold: 400, decor: 'demon_brazier' } },
  { id: 'demon3', by: 'demon_folk', after: 'demon2', title: '마왕님께 올릴 요리', line: '크큭, 마왕님 생신상에 올릴 만한 걸 보여 봐라.',
    need: { world: 'demon', minStars: 5 }, reward: { ideas: 4, invite: 'demon' } },
  { id: 'heaven1', by: 'heaven_folk', title: '빛나는 디저트', line: '반짝이고 고소한 디저트를 기록하고 싶어요.',
    need: { kinds: ['dessert'], tags: ['마력', '고소'] }, reward: { ideas: 2, ingredients: ['heaven_080', 'heaven_072', 'heaven_037'] } },
  { id: 'heaven2', by: 'heaven_folk', after: 'heaven1', title: '순례자의 수프', line: '긴 순례 끝엔 따뜻한 수프가 그리워요.',
    need: { kinds: ['soup'], minStars: 4 }, reward: { gold: 500, decor: 'heaven_cloud' } },
  { id: 'heaven3', by: 'heaven_folk', after: 'heaven2', title: '천상의 기록', line: '이 맛을 천상의 책에 남기겠어요.',
    need: { world: 'heaven', minStars: 5 }, reward: { ideas: 5, invite: 'heaven' } },
  { id: 'knight1', by: 'knight', bond: 8, title: '훈련용 도시락', line: '훈련장에 들고 갈 든든한 도시락을 부탁해요!',
    need: { kinds: ['rice', 'egg', 'bread'], hearty: true, maxPrice: 40 }, reward: { gold: 200, perk: 'knight' } },
  { id: 'bard1', by: 'bard', bond: 8, title: '노래가 되는 한 잔', line: '노랫말이 떠오를 만큼 향긋한 걸로요.',
    need: { kinds: ['drink', 'dessert'], tags: ['향긋', '꽃향'], minStars: 4 }, reward: { ideas: 2, perk: 'bard' } },
  { id: 'merchant1', by: 'merchant', bond: 8, title: '싸고 맛있게', line: '값은 싸고 맛은 확실한 거 하나만!',
    need: { maxPrice: 24, minStars: 4 }, reward: { perk: 'merchant', pack: 'normal_fish_1' } },
  { id: 'student1', by: 'student', bond: 8, title: '마력 간식 연구', line: '마력이 반짝이는 간식이 있으면 시험 공부가 잘될 것 같아요!',
    need: { tags: ['마력'], kinds: ['dessert', 'drink'], minStars: 4 }, reward: { ideas: 3, perk: 'student' } },
  { id: 'miner1', by: 'miner', bond: 8, title: '광부의 불맛', line: '맵고 든든한 거! 곡괭이가 절로 들리게!',
    need: { tags: ['매운맛'], hearty: true, minStars: 4 }, reward: { gold: 250, ingredients: ['normal_070', 'normal_001', 'normal_084'] } },
];
export const PERKS = {
  knight: '기사단 단체 손님: 견습 기사가 더 자주 와요',
  bard: '음유시인의 노래: 홍보비 절반',
  merchant: '상인 소개: 거래처 20% 할인',
  student: '연구 동아리: 단서 값 아이디어 -1',
};

// 요리 대회 주제: 매달 하나. 맞는 요리를 직접 골라 나간다.
export const CONTEST_THEMES = [
  { id: 'miner', name: '광부를 위한 든든한 한 끼', kinds: ['grill', 'fry', 'rice'], tags: ['매운맛', '감칠'], hearty: 1 },
  { id: 'fairy', name: '요정의 작은 디저트', kinds: ['dessert'], tags: ['꽃향', '단맛'], hearty: -1, world: 'fairy' },
  { id: 'xian', name: '선계를 위한 향기로운 요리', kinds: ['drink', 'rice', 'soup'], tags: ['향긋', '꽃향'], world: 'xian' },
  { id: 'school', name: '마법학교 간식 대회', kinds: ['dessert', 'drink'], tags: ['마력', '단맛'], maxPrice: 30 },
  { id: 'morning', name: '모험가의 아침 식사', kinds: ['egg', 'bread'], tags: ['고소'], hearty: 1 },
  { id: 'demon', name: '마계 불맛 대결', kinds: ['grill', 'rice'], tags: ['매운맛'], world: 'demon' },
  { id: 'heaven', name: '천계의 디저트 정원', kinds: ['dessert'], tags: ['마력', '고소'], world: 'heaven' },
  { id: 'sea', name: '바다의 맛', cls: ['sea'], tags: ['상큼', '감칠'] },
];

// 홍보: days일 동안 손님 수 × mult. rep은 바로 오르는 평판.
export const PROMOS = [
  { id: 'flyer', name: '전단지 돌리기',      price: 150, days: 1, mult: 1.3, rep: 0, desc: '오늘 하루 손님이 조금 늘어요.' },
  { id: 'board', name: '마을 게시판 광고',    price: 500, days: 3, mult: 1.4, rep: 0, desc: '사흘 동안 손님이 늘어요.' },
  { id: 'bard',  name: '음유시인 홍보 공연',  price: 1200, days: 1, mult: 2.0, rep: 5, desc: '하루 손님이 두 배, 평판도 조금 올라요.' },
];

// 마을 라이벌 가게. base는 시작 점수, grow는 하루에 오르는 점수.
export const RIVALS = [
  { name: '왕궁 주방',        base: 350, grow: 10 },
  { name: '용의 둥지 주점',   base: 180, grow: 7 },
  { name: '엘프 찻집',        base: 120, grow: 5.5 },
  { name: '드워프 화덕구이',  base: 80,  grow: 4.5 },
  { name: '마법학교 학생식당', base: 50, grow: 3.5 },
  { name: '떠돌이 포장마차',  base: 20,  grow: 2.5 },
];

// 단골 선물 말
// 직원 특기: 뽑을 때 하나씩 붙어 온다
export const TRAITS = {
  cook: {
    baker: { name: '제과 특기', desc: '디저트·빵을 30% 빨리, 더 맛있게' },
    spicy: { name: '불맛 특기', desc: '매운 요리를 20% 빨리, 손님 만족 +6' },
    quick: { name: '빠른 손', desc: '모든 요리 15% 빨리' },
    research: { name: '연구 보조', desc: '실험비 40% 할인, 매일 아이디어 +1' },
  },
  server: {
    host: { name: '단골 응대', desc: '단골 정이 1.5배, 단골 만족 +4' },
    swift: { name: '빠른 발', desc: '걸음이 30% 빨라요' },
    charmer: { name: '싹싹함', desc: '팁 1.5배' },
  },
};

export const GIFT_LINES = {
  ingredient: '고향에서 가져온 재료예요. 맛있는 데 써 주세요!',
  clue: '제가 들은 이야기인데요…',
  gold: '늘 잘 먹고 있어요. 작은 성의예요!',
  ideas: '여행하다 들은 요리 이야기인데, 도움이 될까요?',
  hint: '이 둘을 같이 써 보세요. 고향에서 먹던 맛이에요.',
};

// 날씨: 날마다 하나. mult는 손님 수 배수, minRep 이상일 때만 뽑힌다.
export const WEATHER = [
  { id: 'sunny',  name: '맑음', mult: 1,    w: 6 },
  { id: 'cloudy', name: '흐림', mult: 0.9,  w: 2 },
  { id: 'rain',   name: '비',   mult: 0.65, w: 1.5 },
  { id: 'fest',   name: '축제', mult: 1.6,  w: 0.6, minRep: 30 },
];

// 직원 이름
export const STAFF_NAMES = ['루시', '벤', '미라', '토토', '하루', '세라', '노엘', '다온', '리코', '유나', '카이', '보리', '솔', '테오', '모모', '이안', '나비', '로웬'];

// 개발 메뉴 이름 끝말. 재료 궁합 해시로 하나를 고른다.
export const DISH_WORDS = ['볶음', '찜', '수프', '파이', '덮밥', '샐러드', '구이', '젤리', '스튜', '타르트', '꼬치', '전골', '라테', '푸딩', '튀김'];

// 세계별 접시 색 (그림 묶음 재료로 개발한 메뉴에 쓴다)
export const WORLD_COLORS = { normal: '#d9b48a', fantasy: '#c9a0dc', xian: '#f2c7a0', fairy: '#b8e0b0', demon: '#c25a5a', heaven: '#f5e6a8' };

// 업적: stat 값이 goal 이상이면 달성, reward 골드를 준다. stat 이름은 sim.js stats()에 있다.
export const ACHIEVEMENTS = [
  { id: 'first',    name: '첫 손님',        desc: '손님 1명에게 음식 내기',       stat: 'served',     goal: 1,    reward: 50 },
  { id: 'hundred',  name: '백 그릇',        desc: '손님 100명에게 음식 내기',     stat: 'served',     goal: 100,  reward: 200 },
  { id: 'thousand', name: '천 그릇',        desc: '손님 1,000명에게 음식 내기',   stat: 'served',     goal: 1000, reward: 1000 },
  { id: 'five10',   name: '극찬 열 번',     desc: '별 다섯 개 10번 받기',         stat: 'fiveStars',  goal: 10,   reward: 150 },
  { id: 'regular5', name: '단골 다섯',      desc: '세 번 넘게 온 손님 5명',       stat: 'regulars',   goal: 5,    reward: 200 },
  { id: 'faces40',  name: '반쯤 찬 도감',   desc: '손님 도감 40명 채우기',        stat: 'faces',      goal: 40,   reward: 300 },
  { id: 'trend50',  name: '유행 타는 집',   desc: '유행 메뉴 50그릇 팔기',        stat: 'trendSold',  goal: 50,   reward: 250 },
  { id: 'staff3',   name: '작은 팀',        desc: '직원 3명 이상',                stat: 'staff',      goal: 3,    reward: 150 },
  { id: 'staff7',   name: '꽉 찬 주방',     desc: '직원 7명 모두 채우기',          stat: 'staff',      goal: 7,    reward: 500 },
  { id: 'recipe3',  name: '연구하는 주인',  desc: '신메뉴 3개 개발',              stat: 'recipes',    goal: 3,    reward: 200 },
  { id: 'sales1k',  name: '대박 난 날',     desc: '하루 매출 1,000G',             stat: 'bestSales',  goal: 1000, reward: 300 },
  { id: 'critic',   name: '평론가의 별',    desc: '미식 평론가에게 별 다섯 개',    stat: 'criticFive', goal: 1,    reward: 400 },
  { id: 'tables6',  name: '꽉 찬 홀',       desc: '탁자 6개 모두 놓기',           stat: 'tables',     goal: 6,    reward: 400 },
  { id: 'rank1',    name: '거리의 일등',    desc: '주간 순위 1위',                stat: 'rankTop',    goal: 1,    reward: 800 },
  { id: 'contest',  name: '요리 대회 우승', desc: '요리 대회에서 1등',            stat: 'contestWins',goal: 1,    reward: 500 },
  { id: 'lab10',    name: '실험실의 주인',  desc: '시제품 실험 10번',             stat: 'experiments',goal: 10,   reward: 150 },
  { id: 'legend1',  name: '첫 전설',        desc: '전설의 조합 1개 찾기',          stat: 'specials',   goal: 1,    reward: 200 },
  { id: 'legend10', name: '전설 수집가',    desc: '전설의 조합 10개 찾기',         stat: 'specials',   goal: 10,   reward: 1000 },
  { id: 'upgrade5', name: '고치고 또 고치고', desc: '메뉴 개량 5번',               stat: 'upgrades',   goal: 5,    reward: 300 },
  { id: 'request5', name: '부탁 들어주는 집', desc: '의뢰 5개 마치기',             stat: 'requests',   goal: 5,    reward: 400 },
  { id: 'league4',  name: '이세계 최강',    desc: '이세계 최강전에서 우승',        stat: 'topWins',    goal: 1,    reward: 3000 },
  { id: 'dish20',   name: '요리 수집가',    desc: '요리 도감 20종 채우기',         stat: 'dishes',     goal: 20,   reward: 300 },
  { id: 'dish60',   name: '차원의 미식 백과', desc: '요리 도감 60종 채우기',       stat: 'dishes',     goal: 60,   reward: 1500 },
  { id: 'legend25', name: '전설의 절반',    desc: '전설의 조합 25개 찾기',         stat: 'specials',   goal: 25,   reward: 2000 },
  { id: 'party30',  name: '같이 오는 집',   desc: '일행 손님 30팀 받기',           stat: 'parties',    goal: 30,   reward: 300 },
  { id: 'vip1',     name: '귀빈 접대',      desc: '귀빈을 만족시키기',             stat: 'vipWins',    goal: 1,    reward: 300 },
  { id: 'vip5',     name: '왕실 단골',      desc: '귀빈 5명 만족',                 stat: 'vipWins',    goal: 5,    reward: 1500 },
  { id: 'mission30', name: '하루하루 성실', desc: '오늘의 미션 30개 마치기',       stat: 'missions',   goal: 30,   reward: 800 },
  { id: 'festival', name: '축제의 주인공',  desc: '축제 메뉴 100그릇 팔기',        stat: 'festivalSold', goal: 100, reward: 500 },
  { id: 'grade5',   name: '차원 미식의 전당', desc: '가게 등급 5단계',             stat: 'grade',      goal: 5,    reward: 2000 },
  { id: 'goal20',   name: '골목의 전설',    desc: '가게 목표 20개 모두 달성',      stat: 'goals',      goal: 20,   reward: 5000 },
];

// 거래처 꾸러미 묶음: 세계마다 이 묶음으로 재료를 판다
export const PACK_GROUPS = [
  { id: 'farm', name: '채소밭', cls: ['veg', 'root'] },
  { id: 'orchard', name: '과수원', cls: ['fruit'] },
  { id: 'mill', name: '곡물 창고', cls: ['grain', 'nut'] },
  { id: 'forest', name: '버섯·허브 숲', cls: ['mushroom', 'herb', 'flower'] },
  { id: 'ranch', name: '목장', cls: ['meat', 'egg', 'dairy'] },
  { id: 'fish', name: '어시장', cls: ['sea'] },
  { id: 'spice', name: '향신료 상단', cls: ['spice', 'season', 'sweet'] },
];

// 가게 등급: 평판으로 오른다 (별 다섯 개 다음에도 계속 오를 목표)
export const GRADES = [
  { rep: 0, name: '골목 포장마차' }, { rep: 40, name: '골목 밥집' }, { rep: 140, name: '소문난 식당' },
  { rep: 320, name: '차원골목 명소' }, { rep: 600, name: '차원 미식의 전당' }, { rep: 1000, name: '전설의 식당' },
];

// 가게 목표: 하나씩 차례로. 처음 몇 개는 길잡이 역할(어디를 누르면 되는지 화살표가 따라간다).
// stat은 sim.js stats()의 값, goal 이상이면 달성. dock은 길잡이가 가리킬 하단 메뉴.
export const GOALS = [
  { id: 'g_lab', name: '첫 실험', desc: '연구 창에서 재료 두 개를 섞어 실험해요', stat: 'experiments', goal: 1, reward: { gold: 100 }, dock: 'dock-dev' },
  { id: 'g_recipe', name: '나만의 메뉴', desc: '실험한 요리 하나를 메뉴로 만들어요', stat: 'recipes', goal: 1, reward: { ideas: 2 }, dock: 'dock-dev' },
  { id: 'g_sell', name: '첫 판매', desc: '내가 만든 메뉴를 손님에게 5그릇 팔아요', stat: 'customSold', goal: 5, reward: { gold: 150 }, dock: 'dock-menu' },
  { id: 'g_staff', name: '첫 직원', desc: '직원 창에서 한 명을 더 뽑아요', stat: 'staff', goal: 3, reward: { gold: 150 }, dock: 'dock-staff' },
  { id: 'g_table', name: '자리 늘리기', desc: '가게 창에서 탁자를 하나 들여요', stat: 'tables', goal: 3, reward: { gold: 200 }, dock: 'dock-ledger' },
  { id: 'g_five', name: '극찬 받기', desc: '별 다섯 개를 3번 받아요', stat: 'fiveStars', goal: 3, reward: { ideas: 2 }, dock: 'dock-menu' },
  { id: 'g_pack', name: '거래처 트기', desc: '연구 창 → 거래처에서 꾸러미를 하나 계약해요', stat: 'packs', goal: 1, reward: { gold: 200 }, dock: 'dock-dev' },
  { id: 'g_up', name: '첫 개량', desc: '메뉴판에서 메뉴 하나를 개량해요', stat: 'upgrades', goal: 1, reward: { ideas: 3 }, dock: 'dock-menu' },
  { id: 'g_mission', name: '성실한 하루', desc: '오늘의 미션 3개를 마쳐요', stat: 'missions', goal: 3, reward: { gold: 300 } },
  { id: 'g_legend', name: '첫 전설', desc: '전설의 조합을 하나 찾아요 (단서를 모아 봐요)', stat: 'specials', goal: 1, reward: { gold: 500 }, dock: 'dock-dev' },
  { id: 'g_world', name: '첫 번째 문', desc: '평판을 올려 선계의 문을 열어요', stat: 'worlds', goal: 2, reward: { gold: 500, ideas: 3 } },
  { id: 'g_request', name: '부탁 들어주기', desc: '손님 의뢰를 하나 마쳐요', stat: 'requests', goal: 1, reward: { gold: 400 }, dock: 'dock-ledger' },
  { id: 'g_hall', name: '넓은 홀', desc: '가게를 넓혀요', stat: 'zone', goal: 1, reward: { gold: 800 }, dock: 'dock-ledger' },
  { id: 'g_contest', name: '대회 입상', desc: '요리 대회에서 3위 안에 들어요', stat: 'contestBest', goal: 1, reward: { ideas: 5 }, dock: 'dock-ledger' },
  { id: 'g_dish', name: '요리 도감 30', desc: '요리 도감을 30종 채워요', stat: 'dishes', goal: 30, reward: { gold: 1000 }, dock: 'dock-book' },
  { id: 'g_vip', name: '귀빈 접대', desc: '찾아온 귀빈을 만족시켜요', stat: 'vipWins', goal: 1, reward: { gold: 1000 } },
  { id: 'g_annex', name: '세계 별관', desc: '세계 별관을 지어요', stat: 'zone', goal: 2, reward: { gold: 2000 }, dock: 'dock-ledger' },
  { id: 'g_legend10', name: '전설 수집', desc: '전설의 조합 10개', stat: 'specials', goal: 10, reward: { gold: 3000, ideas: 5 }, dock: 'dock-dev' },
  { id: 'g_league', name: '대륙 대회', desc: '요리 대회 대륙 등급까지 오르기', stat: 'league', goal: 3, reward: { gold: 5000 }, dock: 'dock-ledger' },
  { id: 'g_heaven', name: '마지막 문', desc: '천계의 문을 열어요', stat: 'worlds', goal: 5, reward: { gold: 10000 } },
];

// 오늘의 미션 틀: 매일 아침 세 개를 뽑는다. {x}는 요리 종류/맛/세계 이름으로 바뀐다.
export const MISSION_KINDS = [
  { id: 'sellKind', text: '{x} {n}그릇 팔기', n: [6, 10, 14] },
  { id: 'sellTag', text: '{x} 요리 {n}그릇 팔기', n: [6, 10, 14] },
  { id: 'five', text: '별 다섯 개 {n}번 받기', n: [3, 6, 10] },
  { id: 'served', text: '손님 {n}명 받기', n: [20, 35, 50] },
  { id: 'sales', text: '하루 매출 {n}G', n: [500, 1200, 2500] },
  { id: 'world', text: '{x} 손님 {n}명 만족시키기', n: [3, 5, 8] },
  { id: 'lab', text: '실험 {n}번 하기', n: [2, 3, 4] },
  { id: 'noAngry', text: '화난 손님 없이 하루 마치기', n: [1, 1, 1] },
];

// 달마다 축제 주간(10~16일). 그 맛이 든 요리는 손님이 더 찾고 값을 15% 더 받는다. 손님도 조금 더 온다.
export const FESTIVALS = [
  { month: 4, name: '봄꽃 축제', tag: '꽃향' }, { month: 5, name: '새싹 장터', tag: '상큼' }, { month: 6, name: '모험가 출정식', tag: '감칠' },
  { month: 7, name: '여름 불맛 주간', tag: '매운맛' }, { month: 8, name: '별똥별 밤', tag: '마력' }, { month: 9, name: '수확 감사제', tag: '고소' },
  { month: 10, name: '단풍 찻잔 주간', tag: '향긋' }, { month: 11, name: '김장 품앗이', tag: '매운맛' }, { month: 12, name: '겨울 디저트 장', tag: '단맛' },
  { month: 1, name: '새해 떡잔치', tag: '고소' }, { month: 2, name: '달콤한 연서 주간', tag: '단맛' }, { month: 3, name: '봄맞이 대청소 밥상', tag: '향긋' },
];

// 귀빈: 세계마다 한 명. 전날 예고하고, 원하는 요리를 내면 큰 보상.
export const VIPS = [
  { world: 'fantasy', type: 'knight', name: '왕국의 공주', want: { kinds: ['dessert', 'egg'], tags: ['고소', '단맛'] } },
  { world: 'xian', type: 'xian_folk', name: '구름 위 선인', want: { kinds: ['drink', 'soup'], tags: ['향긋', '꽃향'] } },
  { world: 'fairy', type: 'fairy_folk', name: '요정 여왕', want: { kinds: ['dessert'], tags: ['꽃향', '단맛'] } },
  { world: 'demon', type: 'demon_folk', name: '마계 공작', want: { kinds: ['grill', 'rice'], tags: ['매운맛'] } },
  { world: 'heaven', type: 'heaven_folk', name: '천계 대천사', want: { kinds: ['dessert', 'egg', 'soup'], tags: ['마력', '고소'] } },
];

// 그림 묶음 재료 600개 이름표. 브라우저는 assets/ingredients/catalog.json을 불러와 loadCatalog로 채운다.
export const CATALOG = {};
export function loadCatalog(obj) { Object.assign(CATALOG, obj); }

// 유행이 시작될 때 소식 띠에 도는 소문. {x}는 '그리핀 알' 또는 '마계 재료'로 바뀐다.
export const TREND_NEWS = [
  '요즘 모험가들 사이에서 {x} 열풍!',
  '마법학교 게시판: "{x} 들어간 거 먹으면 시험 붙는대"',
  '음유시인 신곡 제목이 「{x}의 노래」래요',
  '시장 상인들이 {x} 사재기에 나섰어요',
  '기사단 식당에서 {x} 요리가 동났대요',
];

// 가게 지도. 한 글자가 한 칸(그림 48픽셀). 세로 폰 화면에 맞춰 위가 벽과 주방, 가운데가 홀, 아래가 문.
// # 벽(두 줄이 한 장)  O 돌화덕(2×2)  k 주방 바닥  c 요리사 자리(조리대 두 칸의 왼쪽)  C 조리대  p 음식 내놓는 곳
// . 바닥  s 종업원 자리  T 탁자(두 칸)  h 의자(탁자 왼쪽 칸 위·아래)  x 의자 오른쪽 반  P 화분  D 문 앞
export const SHOP_MAP = [
  '###########',
  '###########',
  'OOkkkkkkkkk',
  'OOckckckckP',
  'kkCCCpCCCCk',
  '...s.s.s...',
  '.hx.hx.hx..',
  '.TT.TT.TT..',
  '.hx.hx.hx..',
  'P.........P',
  '.hx.hx.hx..',
  '.TT.TT.TT..',
  '.hx.hx.hx..',
  '...........',
  '....DD.....',
];

// 가게 넓이: 홀 줄 수가 늘어난다(지도 6줄째부터). 처음엔 작은 홀, 넓히면 화면 속 가게가 실제로 길어진다.
// 별관은 세계 문을 하나 이상 열어야 짓는다. 별관 자리에 앉은 그 세계 손님은 만족 +6.
export const SHOP_ZONES = [
  { id: 'small', name: '작은 홀', rows: 4, price: 0 },
  { id: 'hall', name: '넓은 홀', rows: 8, price: 2500, desc: '홀이 아래로 네 줄 넓어져요. 탁자를 더 놓을 수 있어요.' },
  { id: 'annex', name: '세계 별관', rows: 11, price: 8000, needWorld: true, desc: '세계 분위기로 꾸민 별관이 생겨요. 그 세계 손님이 별관 자리를 좋아해요.' },
];
export const ANNEX_HUE = { xian: 300, fairy: 60, demon: 150, heaven: 210 };
// 처음 탁자 자리와, 0.9 이전 가게(넓은 홀, 탁자 6개)의 탁자 자리. 탁자 위치는 두 칸짜리 탁자의 왼쪽 칸.
export const START_TABLES = [{ x: 1, y: 7 }, { x: 4, y: 7 }];
export const LEGACY_TABLES = [{ x: 1, y: 7 }, { x: 4, y: 7 }, { x: 7, y: 7 }, { x: 1, y: 11 }, { x: 4, y: 11 }, { x: 7, y: 11 }];
// 조리 설비: 요리사 자리(화덕 칸)마다 하나. 그 자리 요리사가 맞는 종류를 빨리 만든다.
export const EQUIPMENT = [
  { id: 'oven', name: '벽돌 화덕', short: '화덕', kinds: ['bread', 'dessert', 'fry'], mult: 0.7, price: 900, color: '#d8643a' },
  { id: 'stove', name: '센 불 화구', short: '화구', kinds: ['soup', 'noodle', 'rice'], mult: 0.7, price: 900, color: '#e8b33a' },
  { id: 'grill', name: '숯불 그릴', short: '그릴', kinds: ['grill', 'egg'], mult: 0.7, price: 900, color: '#6a4a3a' },
  { id: 'teaset', name: '찻잔 선반', short: '찻잔', kinds: ['drink', 'salad'], mult: 0.6, price: 600, color: '#5aa07a' },
];

// 가게 그림 (assets/shop, 48픽셀 칸 기준). 벽 위 창문은 몇 번째 칸부터인지.
export const SHOP_ART = {
  windows: [2, 6], door: 10,
  pots: { '10,3': 'crystal_pot', '0,9': 'herb_pot', '10,9': 'flower_pot' },
};

// 요리 그림 80종. basic은 기본 요리 40종, fantasy는 세계별 8종씩(이세계·선계·마계·천계·요정 순서).
// 메뉴의 dish는 'b12'(기본 13번째) 또는 'f05'(판타지 6번째).
export const DISH_NAMES = {
  b: ['볶음밥', '오므라이스', '카레라이스', '비빔밥', '김밥', '초밥', '리조또', '치킨덮밥',
    '돈가스', '스테이크', '닭구이', '생선구이', '오믈렛', '미트볼', '소시지구이', '꼬치구이',
    '토마토파스타', '크림파스타', '볶음국수', '라멘', '우동', '쌀국수', '크림수프', '고기스튜',
    '햄버거', '샌드위치', '핫도그', '피자', '감자튀김', '크로켓', '만두', '샐러드',
    '팬케이크', '와플', '도넛', '푸딩', '케이크', '과일파이', '아이스크림', '과일접시'],
  f: ['용의 알 오므라이스', '용비늘 호박 그라탱', '나선버섯 크림파스타', '수정감자 크로켓', '무지개 채소 꼬치', '마력 소용돌이 수프', '골렘 돌빵', '보석열매 타르트',
    '구름 만두', '선도복숭아 찐빵', '연화 찹쌀밥', '비취죽순 국수', '비취 두부찜', '영지버섯 전골', '오색 구슬떡', '월백 달떡',
    '용암 치즈버거', '마수 스테이크', '심연 먹물파스타', '화산 돌솥밥', '악마뿔 만두', '그림자포도 롤케이크', '용암복숭아 파이', '흑요석 초콜릿케이크',
    '햇살 별볶음밥', '천사날개 생선구이', '무지개 리본파스타', '빛고리 치즈수플레', '구름층 라자냐', '별빛 콘수프', '황금꿀 링도넛', '별구름 아이스크림',
    '수정꽃 젤리', '꽃잎 딸기 케이크', '도토리 버섯수프', '요정잎 쌈밥', '반딧불 베리팬케이크', '꽃버터 나비쿠키', '이슬방울 샐러드', '꿀요정 벌집파이'],
};
// 판타지 요리 표의 줄 = 세계
export const DISH_WORLD_ROW = { fantasy: 0, xian: 1, demon: 2, heaven: 3, fairy: 4 };
// 판타지 요리 그림 id → 그 줄의 세계 ('f19' → 'demon'). 기본 요리는 null.
export const WORLD_ROW_OF_DISH = (d) => (d[0] === 'f' ? Object.keys(DISH_WORLD_ROW).find((w) => DISH_WORLD_ROW[w] === Math.floor(Number(d.slice(1)) / 8)) : null);

// 전설의 조합: 이 짝을 섞으면 이름 있는 요리가 된다. a < b 순서(정규화)로 적는다.
// effect: tip(팁 2배) hearty(든든) charm(단골 정 2배) inspire(별 다섯 개마다 아이디어) fast(조리 -30%) patience(기다림 +20분) lure(그 세계 손님이 더 온다)
export const SPECIALS = [
  { a: 'fantasy_052', b: 'fantasy_065', name: '불꽃 크림스튜', dish: 'b22', q: 82, effect: 'tip' }, // 불꽃 고추 + 드레이크 우유
  { a: 'fantasy_062', b: 'normal_042', name: '그리핀 알 오므라이스', dish: 'f00', q: 80, effect: 'hearty' }, // 그리핀 알 + 쌀
  { a: 'fantasy_098', b: 'normal_021', name: '수정꿀 사과파이', dish: 'b37', q: 78, effect: 'charm' }, // 수정 꿀 + 사과
  { a: 'fantasy_067', b: 'normal_027', name: '슬라임 딸기 젤리', dish: 'f32', q: 77, effect: 'tip' }, // 슬라임 젤리원액 + 딸기
  { a: 'fantasy_066', b: 'normal_041', name: '무지개 치즈 피자', dish: 'b27', q: 84, effect: 'inspire' }, // 무지개 치즈 + 밀
  { a: 'fantasy_095', b: 'normal_074', name: '나선 밀크티', dish: 'f05', q: 75, effect: 'fast' }, // 나선 찻잎 + 우유
  { a: 'fantasy_052', b: 'normal_061', name: '불꽃 닭꼬치', dish: 'b15', q: 80, effect: 'fast' }, // 닭다리 + 불꽃 고추
  { a: 'normal_011', b: 'normal_071', name: '해돋이 토마토 오믈렛', dish: 'b12', q: 72, effect: 'hearty' }, // 토마토 + 달걀
  { a: 'fantasy_002', b: 'normal_079', name: '수정 감자 버터구이', dish: 'f03', q: 78, effect: 'patience' }, // 버터 + 수정 감자
  { a: 'fantasy_066', b: 'normal_006', name: '무지개 어니언 수프', dish: 'b22', q: 79, effect: 'inspire' }, // 양파 + 무지개 치즈
  { a: 'normal_051', b: 'normal_064', name: '숲의 스테이크', dish: 'b09', q: 83, effect: 'hearty' }, // 소고기 + 표고버섯
  { a: 'normal_033', b: 'normal_091', name: '레몬 연어구이', dish: 'b11', q: 82, effect: 'fast' }, // 연어 + 레몬
  { a: 'normal_042', b: 'normal_094', name: '새우 볶음밥', dish: 'b00', q: 76, effect: 'hearty' }, // 새우 + 쌀
  { a: 'normal_027', b: 'normal_075', name: '딸기 생크림 케이크', dish: 'b36', q: 85, effect: 'charm' }, // 생크림 + 딸기
  { a: 'normal_031', b: 'normal_086', name: '꿀바나나 팬케이크', dish: 'b32', q: 78, effect: 'tip' }, // 바나나 + 꿀
  { a: 'normal_065', b: 'normal_088', name: '된장 삼겹 꼬치', dish: 'b15', q: 80, effect: 'hearty' }, // 돼지삼겹살 + 된장
  { a: 'normal_001', b: 'normal_070', name: '광부의 소시지 감자', dish: 'b14', q: 79, effect: 'hearty' }, // 감자 + 소시지
  { a: 'fantasy_061', b: 'fantasy_091', name: '바실리스크 반숙란', dish: 'b12', q: 86, effect: 'inspire' }, // 바실리스크 알 + 마력 소금
  { a: 'fantasy_003', b: 'fantasy_063', name: '용비늘 호박 그라탱', dish: 'f01', q: 84, effect: 'hearty' }, // 와이번 알 + 용비늘 호박
  { a: 'fantasy_051', b: 'fantasy_072', name: '얼음불 새우볶음국수', dish: 'b18', q: 83, effect: 'tip' }, // 나선 새우 + 얼음 고추
  { a: 'fantasy_025', b: 'fantasy_069', name: '바람 포도 파르페', dish: 'b38', q: 81, effect: 'charm' }, // 바람 포도 + 줄무늬 크림
  { a: 'fantasy_097', b: 'fantasy_098', name: '오색 꽃꿀 젤리', dish: 'f32', q: 85, effect: 'inspire' }, // 오색 꽃가루 + 수정 꿀
  { a: 'fantasy_011', b: 'fantasy_065', name: '책장 버섯 크림수프', dish: 'f05', q: 83, effect: 'inspire' }, // 책장 버섯 + 드레이크 우유
  { a: 'fantasy_034', b: 'fantasy_071', name: '비늘 송어 레몬구이', dish: 'b11', q: 82, effect: 'fast' }, // 비늘 송어 + 톱니 레몬
  { a: 'fantasy_041', b: 'fantasy_068', name: '골렘 돌빵', dish: 'f06', q: 80, effect: 'hearty' }, // 구슬 밀 + 뿔양 버터
  { a: 'xian_immortal_peach', b: 'xian_lotus_nectar', name: '선도 꿀복숭아 달떡', dish: 'f15', q: 88, effect: 'lure' }, // 선도복숭아 + 연꽃꿀
  { a: 'xian_jade_carp', b: 'xian_white_cloud_rice', name: '옥잉어 연잎밥', dish: 'f10', q: 85, effect: 'hearty' }, // 백운쌀 + 옥잉어
  { a: 'xian_jade_leaf_tea', b: 'xian_osmanthus_honey', name: '금계꿀 옥엽차', dish: 'f05', q: 82, effect: 'patience' }, // 옥엽차 + 금계꿀
  { a: 'xian_cloud_mountain_goat_milk', b: 'xian_white_cloud_mushroom', name: '백운송이 전골', dish: 'f13', q: 86, effect: 'inspire' }, // 백운송이 + 운산산양유
  { a: 'fairy_002', b: 'fairy_073', name: '장미꿀 딸기 케이크', dish: 'f33', q: 88, effect: 'lure' }, // 꽃잎 딸기 + 장미 꽃꿀
  { a: 'fairy_003', b: 'fairy_032', name: '반딧불 베리팬케이크', dish: 'f36', q: 85, effect: 'charm' }, // 반딧불 블루베리 + 꽃밀
  { a: 'fairy_015', b: 'fairy_033', name: '요정잎 쌈밥', dish: 'f35', q: 80, effect: 'fast' }, // 이슬 쌀 + 숲상추
  { a: 'fairy_078', b: 'fairy_082', name: '꽃버터 나비쿠키', dish: 'f37', q: 84, effect: 'tip' }, // 꽃버터 + 장미 설탕
  { a: 'demon_beasthorn_garlic', b: 'demon_demonhorn_chili', name: '마각 마늘 스테이크', dish: 'f17', q: 88, effect: 'lure' }, // 마각고추 + 마수뿔마늘
  { a: 'demon_abyss_seaweed', b: 'demon_black_wheat', name: '심연 먹물파스타', dish: 'f18', q: 84, effect: 'inspire' }, // 심연해초 + 흑밀
  { a: 'demon_beast_milk', b: 'demon_shadow_grapes', name: '그림자포도 롤케이크', dish: 'f21', q: 85, effect: 'charm' }, // 그림자포도 + 마수우유
  { a: 'demon_black_sesame', b: 'demon_black_sugar_sap', name: '흑요석 초콜릿케이크', dish: 'f23', q: 86, effect: 'tip' }, // 흑당수액 + 검은참깨
  { a: 'heaven_031', b: 'heaven_074', name: '구름층 라자냐', dish: 'f28', q: 88, effect: 'lure' }, // 금빛 치즈 + 황금 밀
  { a: 'heaven_037', b: 'heaven_071', name: '별빛 콘수프', dish: 'f29', q: 84, effect: 'patience' }, // 여명 옥수수 + 별빛 우유
  { a: 'heaven_028', b: 'heaven_093', name: '천사날개 생선구이', dish: 'f25', q: 87, effect: 'fast' }, // 은빛 흰살생선 + 햇살 생강
  { a: 'heaven_072', b: 'heaven_080', name: '별구름 아이스크림', dish: 'f31', q: 89, effect: 'inspire' }, // 무지개 꽃꿀 + 햇살 크림
  { a: 'normal_027', b: 'normal_074', name: '딸기 우유 푸딩', dish: 'b35', q: 74, effect: 'charm' }, // 딸기 + 우유
  { a: 'normal_011', b: 'normal_077', name: '토마토 치즈 피자', dish: 'b27', q: 79, effect: 'hearty' }, // 치즈 + 토마토
  { a: 'normal_033', b: 'normal_062', name: '레몬 닭가슴살 샐러드', dish: 'b31', q: 74, effect: 'fast' }, // 닭가슴살 + 레몬
  { a: 'normal_041', b: 'normal_071', name: '폭신 와플', dish: 'b33', q: 73, effect: 'tip' }, // 밀 + 달걀
];
export const EFFECT_NAME = {
  tip: '팁 2배', hearty: '든든함', charm: '단골 정 2배', inspire: '극찬마다 아이디어', fast: '조리 30% 빨라짐',
  patience: '기다림 +20분', lure: '그 세계 손님이 더 와요',
};
export function dishOf(id) {
  if (!id) return null;
  const set = id[0], n = Number(id.slice(1));
  return { set, n, col: n % 8, row: Math.floor(n / 8), name: DISH_NAMES[set]?.[n] };
}
export const dishSheetUrl = (set, size = 48) => `assets/dishes/${set === 'f' ? 'fantasy' : 'basic'}_${size}.png`;

// 세계 id는 그림 묶음(assets/ingredients)의 분류 이름과 같다: fantasy, xian, fairy, demon, heaven
export const WORLDS = {
  fantasy: {
    name: '판타지 대륙',
    blurb: '검과 마법의 대륙. 모험가들이 허기진 배를 안고 찾아와요.',
    unlockRep: 0,
    ready: true,
  },
  xian: {
    name: '선계',
    blurb: '구름 위 선문. 수련하는 선인들이 영약 같은 한 끼를 찾아요.',
    unlockRep: 140,
    ready: true,
  },
  fairy: {
    name: '요정 세계',
    blurb: '이슬과 꽃잎으로 지은 마을. 손님은 작지만 입맛은 까다로워요.',
    unlockRep: 300,
    ready: true,
  },
  demon: {
    name: '마계',
    blurb: '불꽃이 흐르는 강가. 매운맛 없이는 손님이 오지 않아요.',
    unlockRep: 550,
    ready: true,
  },
  heaven: {
    name: '천계',
    blurb: '햇살과 구름으로 지은 정원. 모든 세계의 재료가 모이는 마지막 문.',
    unlockRep: 850,
    ready: true,
  },
};

// 재료 id는 그림 묶음의 id 그대로 (assets/ingredients/catalog.json에 600개 이름이 있다).
// 아이콘은 id에서 자동으로 찾는다: fantasy_067 → fantasy 표의 67번째 칸.
export const INGREDIENTS = {
  fantasy_095: { name: '나선 찻잎',       world: 'fantasy', cost: 3, color: '#7fae5a' },
  fantasy_098: { name: '수정 꿀',         world: 'fantasy', cost: 4, color: '#f0b23a' },
  fantasy_067: { name: '슬라임 젤리원액', world: 'fantasy', cost: 3, color: '#8fd36a' },
  fantasy_002: { name: '수정 감자',       world: 'fantasy', cost: 3, color: '#b9a2d8' },
  fantasy_052: { name: '불꽃 고추',       world: 'fantasy', cost: 5, color: '#d9483b' },
  fantasy_062: { name: '그리핀 알',       world: 'fantasy', cost: 6, color: '#efe2c4' },
  fantasy_065: { name: '드레이크 우유',   world: 'fantasy', cost: 4, color: '#dff0c8' },
  fantasy_066: { name: '무지개 치즈',     world: 'fantasy', cost: 5, color: '#f3d27a' },
  // 선계
  xian_immortal_peach:     { name: '선도복숭아', world: 'xian', cost: 6, color: '#f4b6b0' },
  xian_jade_wheat:         { name: '청옥밀',     world: 'xian', cost: 4, color: '#b8d8a8' },
  xian_white_lotus:        { name: '백련꽃',     world: 'xian', cost: 6, color: '#f3eee6' },
  xian_white_cloud_rice:   { name: '백운쌀',     world: 'xian', cost: 4, color: '#f2f0ea' },
  xian_silverbeard_shrimp: { name: '은수새우',   world: 'xian', cost: 8, color: '#f0a48a' },
  // 요정 세계
  fairy_001: { name: '이슬 산딸기',  world: 'fairy', cost: 5, color: '#e05a6a' },
  fairy_002: { name: '꽃잎 딸기',    world: 'fairy', cost: 6, color: '#f07a8a' },
  fairy_062: { name: '도토리 표고',  world: 'fairy', cost: 5, color: '#a07a50' },
  fairy_071: { name: '들꽃 꿀',      world: 'fairy', cost: 7, color: '#f2c04a' },
  fairy_076: { name: '개암 우유',    world: 'fairy', cost: 5, color: '#efe2c8' },
  fairy_078: { name: '꽃버터',       world: 'fairy', cost: 6, color: '#f6df8a' },
  // 마계
  demon_ash_rice:        { name: '잿빛쌀',     world: 'demon', cost: 5, color: '#9a948e' },
  demon_demonhorn_chili: { name: '마각고추',   world: 'demon', cost: 7, color: '#b8282a' },
  demon_lava_peach:      { name: '용암복숭아', world: 'demon', cost: 8, color: '#e8642a' },
  demon_black_wheat:     { name: '흑밀',       world: 'demon', cost: 5, color: '#4a3a3a' },
  demon_beast_milk:      { name: '마수우유',   world: 'demon', cost: 8, color: '#d8c8d8' },
  // 천계
  heaven_031: { name: '황금 밀',     world: 'heaven', cost: 6, color: '#e8c25a' },
  heaven_032: { name: '구름 쌀',     world: 'heaven', cost: 6, color: '#f4f6fa' },
  heaven_071: { name: '별빛 우유',   world: 'heaven', cost: 8, color: '#eef0ff' },
  heaven_074: { name: '금빛 치즈',   world: 'heaven', cost: 9, color: '#f2c84a' },
  heaven_076: { name: '빛구름 달걀', world: 'heaven', cost: 8, color: '#fbf2d8' },
  heaven_079: { name: '하늘 벌꿀',   world: 'heaven', cost: 9, color: '#f0b030' },
};

// taste: 1~5. cookMin, eatMin: 게임 분. 첫 번째 재료가 메뉴의 대표 아이콘이 된다.
export const MENUS = {
  herb_tea:       { dish: 'f05', name: '나선 찻잎 꿀차',      world: 'fantasy', ingredients: ['fantasy_095', 'fantasy_098'], price: 14, taste: 3, cookMin: 6,  eatMin: 15, color: '#9fd27a', kind: 'drink', tags: ['향긋', '단맛', '마력'], q: 50, hearty: 0 },
  slime_pudding:  { dish: 'b35', name: '슬라임 젤리 푸딩',    world: 'fantasy', ingredients: ['fantasy_067', 'fantasy_098'], price: 22, taste: 3, cookMin: 10, eatMin: 25, color: '#8fd36a', kind: 'dessert', tags: ['단맛', '상큼', '마력'], q: 52, hearty: 0 },
  potato_fries:   { dish: 'f03', name: '수정 감자 불꽃 튀김', world: 'fantasy', ingredients: ['fantasy_002', 'fantasy_052'], price: 26, taste: 3, cookMin: 12, eatMin: 30, color: '#d98a3a', kind: 'fry', tags: ['매운맛', '마력'], q: 54, hearty: 1 },
  griffin_omelet: { dish: 'b12', name: '그리핀 알 오믈렛',    world: 'fantasy', ingredients: ['fantasy_062', 'fantasy_065'], price: 34, taste: 4, cookMin: 15, eatMin: 35, color: '#f3d27a', kind: 'egg', tags: ['고소', '마력'], q: 60, hearty: 1 },
  rainbow_gratin: { dish: 'f01', name: '무지개 치즈 그라탱',  world: 'fantasy', ingredients: ['fantasy_066', 'fantasy_002'], price: 38, taste: 4, cookMin: 20, eatMin: 40, color: '#e8c56a', kind: 'soup', tags: ['고소', '감칠', '마력'], q: 62, hearty: 1 },
  // 세계 메뉴: 그 세계 문이 열리면 메뉴판에 저절로 올라간다. 요리 그림은 판타지 요리 표의 그 세계 줄.
  xian_peach_bun:   { dish: 'f09', name: '선도복숭아 찐빵',     world: 'xian', ingredients: ['xian_immortal_peach', 'xian_jade_wheat'], price: 30, taste: 4, cookMin: 14, eatMin: 30, color: '#f4b6b0', kind: 'bread', tags: ['단맛', '마력'], q: 66, hearty: 1 },
  xian_lotus_rice:  { dish: 'f10', name: '백련 찹쌀밥',         world: 'xian', ingredients: ['xian_white_lotus', 'xian_white_cloud_rice'], price: 36, taste: 4, cookMin: 16, eatMin: 35, color: '#f3eee6', kind: 'rice', tags: ['꽃향', '고소'], q: 68, hearty: 1 },
  xian_dumpling:    { dish: 'f08', name: '은수새우 구름 만두',  world: 'xian', ingredients: ['xian_silverbeard_shrimp', 'xian_jade_wheat'], price: 44, taste: 5, cookMin: 22, eatMin: 40, color: '#f0a48a', kind: 'bread', tags: ['감칠', '고소'], q: 72, hearty: 1 },
  fairy_soup:       { dish: 'f34', name: '도토리 버섯수프',     world: 'fairy', ingredients: ['fairy_062', 'fairy_076'], price: 32, taste: 4, cookMin: 14, eatMin: 30, color: '#a07a50', kind: 'soup', tags: ['감칠', '고소'], q: 66, hearty: 0 },
  fairy_cake:       { dish: 'f33', name: '꽃잎 딸기 케이크',    world: 'fairy', ingredients: ['fairy_002', 'fairy_078'], price: 38, taste: 4, cookMin: 18, eatMin: 35, color: '#f07a8a', kind: 'dessert', tags: ['단맛', '상큼', '고소'], q: 70, hearty: 0 },
  fairy_pie:        { dish: 'f39', name: '꿀요정 벌집파이',     world: 'fairy', ingredients: ['fairy_071', 'fairy_001'], price: 48, taste: 5, cookMin: 22, eatMin: 40, color: '#f2c04a', kind: 'dessert', tags: ['단맛', '꽃향', '상큼'], q: 74, hearty: 0 },
  demon_stone_rice: { dish: 'f19', name: '마각고추 화산 돌솥밥', world: 'demon', ingredients: ['demon_ash_rice', 'demon_demonhorn_chili'], price: 42, taste: 4, cookMin: 18, eatMin: 35, color: '#b8282a', kind: 'rice', tags: ['매운맛', '감칠'], q: 68, hearty: 1 },
  demon_peach_pie:  { dish: 'f22', name: '용암복숭아 파이',     world: 'demon', ingredients: ['demon_lava_peach', 'demon_black_wheat'], price: 46, taste: 4, cookMin: 20, eatMin: 35, color: '#e8642a', kind: 'dessert', tags: ['단맛', '매운맛'], q: 66, hearty: 0 },
  demon_burger:     { dish: 'f16', name: '마수 치즈 용암버거',  world: 'demon', ingredients: ['demon_beast_milk', 'demon_black_wheat'], price: 56, taste: 5, cookMin: 24, eatMin: 40, color: '#d8c8d8', kind: 'bread', tags: ['고소', '감칠'], q: 72, hearty: 1 },
  heaven_rice:      { dish: 'f24', name: '햇살 별볶음밥',       world: 'heaven', ingredients: ['heaven_032', 'heaven_076'], price: 50, taste: 4, cookMin: 18, eatMin: 35, color: '#fbf2d8', kind: 'rice', tags: ['고소', '마력'], q: 68, hearty: 1 },
  heaven_souffle:   { dish: 'f27', name: '빛고리 치즈수플레',   world: 'heaven', ingredients: ['heaven_074', 'heaven_071'], price: 58, taste: 4, cookMin: 22, eatMin: 40, color: '#f2c84a', kind: 'egg', tags: ['고소', '감칠'], q: 72, hearty: 0 },
  heaven_donut:     { dish: 'f30', name: '황금꿀 링도넛',       world: 'heaven', ingredients: ['heaven_079', 'heaven_031'], price: 66, taste: 5, cookMin: 24, eatMin: 40, color: '#f0b030', kind: 'dessert', tags: ['단맛', '마력'], q: 76, hearty: 0 },
};

// 손님 그림: assets/customers_anim_48.png. 한 줄이 한 손님, 칸은 아래 frames 순서.
// 0~79 판타지 손님, 80~84 선계, 85~89 요정 세계, 90~94 마계, 95~99 천계.
// 점원 그림: 요리사 assets/staff_chefs_48.png (8명), 종업원 assets/staff_servers_48.png (7명).
// 모두 48×48 칸, 발 기준 (24, 46). 걷기는 166ms, 요리는 250ms마다 칸을 넘긴다.
export const SPRITES = {
  customers: 100, size: 48, foot: [24, 46],
  anim: {
    url: 'assets/customers_anim_48.png', cols: 7, rows: 100,
    frames: { front: 0, frontWalk: [1, 2], backWalk: [3, 4], sitFront: 5, sitBack: 6 },
  },
  chef: { url: 'assets/staff_chefs_48.png', cols: 3, rows: 8, frames: { idle: 0, cook: [1, 2] } },
  server: { url: 'assets/staff_servers_48.png', cols: 4, rows: 7, frames: { walk: [0, 1], carry: [2, 3] } },
};

// 손님 얼굴 0~79를 입맛 다섯 가지에 골고루 나눈다. 같은 얼굴은 늘 같은 입맛 = 단골.
const everyFifth = (start) => Array.from({ length: 16 }, (_, i) => start + i * 5);
const five = (start) => [0, 1, 2, 3, 4].map((i) => start + i);

// 손님 종류 = 입맛. sprites는 이 입맛으로 오는 손님 얼굴(위 표의 줄 번호).
export const GUESTS = {
  knight: {
    name: '견습 기사', world: 'fantasy', weight: 1,
    taste: { tags: { 고소: 8, 감칠: 8 }, kinds: { rice: 10, egg: 10, grill: 8 }, cls: { meat: 6, egg: 6 } }, budget: 42, hungry: true,
    hint: '든든한 밥이나 달걀 요리',
    sprites: everyFifth(0),
    likes: ['fantasy_062'], dislikes: ['fantasy_067'],
    look: { skin: '#f1c9a0', body: '#5b7bd1', legs: '#33304a', hat: 'helm', hair: '#a7afc0' },
    lines: {
      great: ['{menu}! 이거 먹고 내일 훈련도 버틴다!', '기사단 식당보다 백 배 낫다…'],
      good: ['든든하다. 다음에 또 올게.', '검 다음으로 좋은 게 밥이지.'],
      bad: ['흐물흐물한 건 좀…', '훈련 교관 잔소리 같은 맛이었어.'],
      angry: ['기사는 기다림에 강하지만, 이건 너무하잖아!'],
    },
  },
  bard: {
    name: '떠돌이 음유시인', world: 'fantasy', weight: 1,
    taste: { tags: { 향긋: 10, 꽃향: 10, 단맛: 6, 매운맛: -12 }, kinds: { drink: 12, dessert: 8 } }, budget: 36,
    hint: '향긋한 차나 꽃향 디저트',
    sprites: everyFifth(1),
    likes: ['fantasy_095'], dislikes: ['fantasy_052'],
    look: { skin: '#f6dcbc', body: '#3fa37a', legs: '#2c4a3c', hat: 'hair', hair: '#f2e6a0' },
    lines: {
      great: ['{menu}의 향기를 노래로 만들겠어요.', '여행 중에 먹은 것 중 최고예요.'],
      good: ['담백하네요. 나쁘지 않아요.', '다음 마을에서도 소문낼게요.'],
      bad: ['혀가 불타는 줄 알았어요…', '제 노래에는 못 넣겠네요.'],
      angry: ['노래 세 곡을 다 불렀는데도 안 나오다니요.'],
    },
  },
  merchant: {
    name: '시장 상인', world: 'fantasy', weight: 1,
    taste: { tags: { 감칠: 8, 고소: 6, 꽃향: -6 }, kinds: { bread: 10, rice: 6 }, cls: { dairy: 6 } }, budget: 28, thrifty: true,
    hint: '싸고 배부른 빵이나 밥',
    sprites: everyFifth(2),
    likes: ['fantasy_066'], dislikes: ['fantasy_095'],
    look: { skin: '#e8b48a', body: '#8a5a3a', legs: '#4a3428', hat: 'cap', hair: '#c0392b' },
    lines: {
      great: ['싸고 맛있으면 장땡! 여기 단골 한다!', '이 치즈면 시장에 내다 팔아도 되겠어.'],
      good: ['값어치는 하네.', '배는 찼다! 장사하러 가야지.'],
      bad: ['풀떼기 끓인 물에 돈을 내다니.', '이 값이면 좀 더 줘야지.'],
      angry: ['시간도 돈이라고!'],
    },
  },
  student: {
    name: '마법학교 학생', world: 'fantasy', weight: 1,
    taste: { tags: { 마력: 12, 단맛: 8, 감칠: -6 }, kinds: { dessert: 10, drink: 6 } }, budget: 26, thrifty: true,
    hint: '마력이 반짝이는 달콤한 간식',
    sprites: everyFifth(3),
    likes: ['fantasy_067'], dislikes: ['fantasy_066'],
    look: { skin: '#f1c9a0', body: '#6b4fc6', legs: '#2e2a4a', hat: 'pointy', hair: '#6b4fc6' },
    lines: {
      great: ['{menu} 먹으니까 마나가 꽉 찼어요!', '시험 전날엔 무조건 여기 올래요.'],
      good: ['과제하면서 먹기 딱 좋아요.', '마법학교 매점보다 나아요!'],
      bad: ['치즈 색이 일곱 개라 어지러워요…', '주문 외우다 체할 것 같아요.'],
      angry: ['수업 늦겠어요! 그냥 갈래요.'],
    },
  },
  miner: {
    name: '광산 광부', world: 'fantasy', weight: 1,
    taste: { tags: { 매운맛: 14, 감칠: 8, 상큼: -6, 꽃향: -10 }, kinds: { grill: 10, fry: 10, soup: 6 }, cls: { meat: 6 } }, budget: 50, hungry: true,
    hint: '맵고 든든한 구이나 튀김',
    sprites: everyFifth(4),
    likes: ['fantasy_052'], dislikes: ['fantasy_067'],
    look: { skin: '#e8b48a', body: '#7a6a5a', legs: '#3e3630', hat: 'hair', hair: '#b5652f', beard: '#b5652f' },
    lines: {
      great: ['크하하! 이 매운맛이야말로 광부의 맛!', '곡괭이가 저절로 들리는 맛이군!'],
      good: ['곡괭이 들 힘이 나는군.', '나쁘지 않아, 주인장.'],
      bad: ['이런 걸로는 광산 못 버텨.', '흐물흐물한 건 광부 음식이 아니야.'],
      angry: ['광부를 굶기다니!'],
    },
  },
  // ---------- 세계 손님: 얼굴마다 이름이 있다 ----------
  xian_folk: {
    name: '선계 손님', world: 'xian', weight: 1.5,
    taste: { tags: { 향긋: 12, 꽃향: 10, 상큼: 6, 매운맛: -14 }, kinds: { rice: 8, drink: 10, soup: 6 }, cls: { meat: -10 } }, rich: true,
    hint: '향긋하고 맑은 차나 밥',
    sprites: five(80),
    names: { 80: '청죽 선비', 81: '연화 선녀', 82: '백운 신선', 83: '비취 약사', 84: '선도 여행객' },
    likes: ['xian_immortal_peach', 'xian_white_lotus'], dislikes: ['fantasy_052', 'demon_demonhorn_chili'],
    lines: {
      great: ['{menu}… 백 년 수련보다 이 한 그릇이 낫구려.', '선단을 먹은 듯 몸이 가볍소!'],
      good: ['담백하니 도에 맞는 맛이오.', '하산한 보람이 있구려.'],
      bad: ['속세의 맛이 너무 강하오…', '기가 흐트러지는 맛이로군.'],
      angry: ['수련으로 참을성을 길렀으나, 이건 너무하오.'],
    },
  },
  fairy_folk: {
    name: '요정 손님', world: 'fairy', weight: 1.5,
    taste: { tags: { 꽃향: 14, 단맛: 10, 매운맛: -16 }, kinds: { dessert: 12, salad: 8, drink: 6 }, cls: { meat: -12 } }, budget: 60, small: true,
    hint: '꽃향 나는 작은 디저트',
    sprites: five(85),
    names: { 85: '새싹 요정', 86: '꽃잎 요정', 87: '꿀빛 요정', 88: '이슬 요정', 89: '열매 요정' },
    likes: ['fairy_071', 'fairy_002'], dislikes: ['demon_demonhorn_chili', 'fantasy_052'],
    lines: {
      great: ['{menu}! 날개가 저절로 파닥거려요!', '숲에 돌아가서 다 자랑할 거예요!'],
      good: ['한 입이 딱 요정 크기예요.', '이슬처럼 깔끔해요.'],
      bad: ['너무 커요… 아니, 너무 매워요!', '꽃향이 하나도 안 나요.'],
      angry: ['꽃이 세 번 피고 질 동안 기다렸어요!'],
    },
  },
  demon_folk: {
    name: '마계 손님', world: 'demon', weight: 1.5,
    taste: { tags: { 매운맛: 16, 감칠: 8, 꽃향: -12, 향긋: -6 }, kinds: { grill: 12, rice: 6, bread: 6 }, cls: { meat: 8 } }, rich: true, hungry: true,
    hint: '불처럼 매운 고기 요리',
    sprites: five(90),
    names: { 90: '홍각 여행객', 91: '흑월 상인', 92: '은발 악마', 93: '자수정 임프', 94: '양뿔 귀족' },
    likes: ['demon_demonhorn_chili', 'fantasy_052'], dislikes: ['xian_white_lotus', 'fantasy_095'],
    lines: {
      great: ['크큭, {menu}… 영혼을 팔아도 아깝지 않군.', '이 매운맛이라면 마왕님께도 올리겠다!'],
      good: ['인간 음식치곤 나쁘지 않군.', '뿔이 근질근질한 맛이다.'],
      bad: ['밍밍하다! 불꽃이 하나도 없잖나.', '천계 놈들이나 먹을 맛이군.'],
      angry: ['감히 마족을 기다리게 하다니!'],
    },
  },
  heaven_folk: {
    name: '천계 손님', world: 'heaven', weight: 1.5,
    taste: { tags: { 고소: 10, 단맛: 8, 마력: 8, 매운맛: -8 }, kinds: { dessert: 10, egg: 8, soup: 6 } }, rich: true,
    hint: '빛나는 고소한 디저트',
    sprites: five(95),
    names: { 95: '금빛 천사', 96: '햇살 순례자', 97: '청운 전령', 98: '백금 수호자', 99: '별빛 기록관' },
    likes: ['heaven_074', 'heaven_079'], dislikes: ['demon_ash_rice', 'fantasy_067'],
    lines: {
      great: ['{menu}… 천상의 기록에 남기겠어요.', '빛고리가 반짝일 만큼 맛있어요!'],
      good: ['따뜻하고 정갈한 맛이에요.', '여행길에 축복을 받은 기분이에요.'],
      bad: ['조금 어두운 맛이네요…', '날개가 무거워지는 맛이에요.'],
      angry: ['구름이 다 흘러가 버렸어요.'],
    },
  },
};
// 손님 이름: 세계 손님은 얼굴마다 이름이 있다
// 판타지 손님 80명 각자의 이름 (얼굴 번호 순서). 성별을 가리지 않는 이름으로.
export const FACE_NAMES = [
  '리안', '하루', '소라', '유리', '카이', '노아', '레이', '미루', '아린', '세나',
  '로아', '시온', '다온', '루비', '이든', '라온', '모아', '윤슬', '해솔', '나빈',
  '도담', '가온', '보리', '새벽', '여울', '하늘', '이솔', '단비', '루미', '토리',
  '라엘', '시엘', '에린', '오리', '피아', '케이', '제로', '밀로', '네오', '코코',
  '바다', '별이', '구름', '다래', '산들', '송이', '아라', '온새', '찬솔', '한결',
  '마루', '누리', '다솜', '라희', '비오', '솔이', '아토', '유하', '지오', '하랑',
  '레오', '루카', '미카', '사샤', '알리', '엘리', '이안', '조이', '케이티', '테스',
  '펠릭', '헤일', '니코', '로빈', '세이', '우노', '이오', '쥬니', '키키', '호두',
];
export const guestName = (type, sprite) => GUESTS[type]?.names?.[sprite] || (sprite < FACE_NAMES.length && GUESTS[type]?.world === 'fantasy' ? `${GUESTS[type].name} ${FACE_NAMES[sprite]}` : GUESTS[type]?.name || '손님');

export const STAFF_LOOKS = {
  cook:   { skin: '#f1c9a0', body: '#f4f2ea', legs: '#33304a', hat: 'chef', hair: '#f4f2ea' },
  server: { skin: '#f1c9a0', body: '#2f3e66', legs: '#22283a', hat: 'hair', hair: '#4a2f22', apron: '#f4f2ea' },
};

// 재료 id → 아이콘 위치. 'fantasy_067' → { sheet: 'fantasy', col: 6, row: 6 }
export function iconOf(id) {
  // 그림 묶음 목록에 있으면 그 칸 (선계·마계 재료는 id가 이름이라 이것만 맞다)
  const c = CATALOG[id];
  if (c) return { sheet: c.category, col: c.col, row: c.row };
  const m = /^([a-z]+)_(\d+)$/.exec(id);
  if (!m) return null;
  const n = Number(m[2]) - 1;
  return { sheet: m[1], col: n % 10, row: Math.floor(n / 10) };
}
export const ingredientSheetUrl = (sheet) => `assets/ingredients/${sheet}_10x10.png`;
