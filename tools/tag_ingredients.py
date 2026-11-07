"""재료 600개에 분류(cls)와 맛 속성(tags)을 붙여 catalog.json에 써 넣는다.

그림 표는 줄마다 분류가 정해져 있다(예: 일반 표 7줄 = 달걀 3 + 유제품 7).
줄 규칙으로 먼저 정하고, 이름 낱말로 고친다. 다시 돌려도 결과는 같다.

    python3 tools/tag_ingredients.py assets/ingredients/catalog.json
"""
import json
import sys

# 줄 규칙: 줄 하나가 한 분류이거나, 칸 10개의 분류 목록
R = lambda c: [c] * 10  # noqa: E731
ROWS = {
    'normal': [R('root'), R('veg'), R('fruit'), R('fruit'),
               ['grain'] * 4 + ['nut'] * 6,
               ['mushroom'] * 4 + ['herb'] * 6,
               R('meat'),
               ['egg'] * 3 + ['dairy'] * 7,
               ['season', 'sweet', 'spice', 'spice', 'nut', 'sweet', 'season', 'season', 'season', 'season'],
               R('sea')],
    'fantasy': [R('veg'), R('mushroom'), R('fruit'), R('fruit'),
                ['grain'] * 4 + ['nut'] * 6,
                ['spice'] * 9 + ['sweet'],
                ['egg'] * 4 + ['dairy'] * 5 + ['sweet'],
                R('sea'),
                ['veg', 'veg', 'veg', 'root', 'nut', 'root', 'veg', 'veg', 'veg', 'nut'],
                ['season', 'grain', 'sweet', 'herb', 'herb', 'season', 'flower', 'sweet', 'grain', 'sweet']],
    'xian': [R('fruit'), R('fruit'), R('root'), R('mushroom'),
             ['herb'] * 9 + ['veg'],
             ['grain'] * 6 + ['nut'] * 4,
             ['flower'] * 8 + ['spice', 'spice'],
             ['nut'] * 4 + ['veg'] * 6,
             ['season', 'season', 'sweet', 'sweet', 'spice', 'spice', 'nut', 'spice', 'spice', 'herb'],
             ['egg', 'egg', 'sea', 'egg', 'sea', 'sea', 'dairy', 'sea', 'sea', 'nut']],
    'fairy': [R('fruit'), R('veg'), R('root'), R('grain'), R('nut'), R('herb'), R('mushroom'),
              ['sweet'] * 4 + ['season'] + ['dairy'] * 4 + ['egg'],
              ['sweet', 'sweet', 'season', 'flower', 'sweet', 'sweet', 'spice', 'spice', 'spice', 'nut'],
              ['nut'] * 7 + ['sea'] * 3],
    'demon': [R('fruit'), R('fruit'), R('root'), R('mushroom'), R('herb'),
              ['grain'] * 6 + ['nut'] * 4,
              ['veg'] * 6 + ['nut'] * 4,
              ['spice'] * 8 + ['flower'] * 2,
              ['season', 'season', 'sweet', 'sweet', 'sea', 'sea', 'spice', 'root', 'nut', 'flower'],
              ['dairy', 'dairy', 'egg', 'egg', 'egg', 'sea', 'sea', 'sea', 'sea', 'sea']],
    'heaven': [R('fruit'), R('veg'), R('root'), R('grain'), R('nut'),
               ['herb'] * 5 + ['spice', 'herb', 'flower', 'flower', 'flower'],
               R('mushroom'),
               ['dairy'] * 5 + ['egg'] * 3 + ['sweet'] * 2,
               ['season', 'sweet', 'spice', 'spice', 'spice', 'sweet', 'spice', 'grain', 'flower', 'season'],
               ['meat', 'meat'] + ['sea'] * 8],
}

# 분류마다 기본 맛
BASE = {
    'fruit': ['단맛'], 'sweet': ['단맛'], 'dairy': ['고소'], 'nut': ['고소'], 'egg': ['고소'],
    'meat': ['감칠'], 'sea': ['감칠'], 'mushroom': ['감칠'], 'season': ['감칠'],
    'herb': ['향긋'], 'flower': ['꽃향'], 'spice': ['매운맛'],
    'veg': [], 'root': [], 'grain': [],
}
# 이름 낱말 → 맛 (있으면 더한다)
WORDS = {
    '상큼': ['레몬', '라임', '유자', '귤', '오렌지', '매실', '석류', '식초', '키위', '구스베리', '파인애플', '산딸기',
           '베리', '자두', '살구', '체리', '앵두', '오디', '산수유', '까치밥', '구기자', '요거트', '토마토', '다래', '비파', '모과'],
    '매운맛': ['고추', '후추', '산초', '겨자', '생강', '마늘', '고춧가루', '불꽃', '용암', '화산', '불씨', '마각', '래디시'],
    '단맛': ['꿀', '설탕', '시럽', '코코아', '바닐라', '고구마', '호박', '옥수수', '대추', '무화과', '망고', '바나나',
           '멜론', '수박', '복숭아', '포도', '감', '사과', '배', '젤리', '수액', '딸기', '참외', '당근', '비트'],
    '꽃향': ['꽃', '장미', '라벤더', '국화', '작약', '매화', '목서', '제비꽃', '한련화', '카모마일', '연꽃', '백련', '홍련', '난초'],
    '향긋': ['민트', '박하', '바질', '로즈메리', '타임', '세이지', '찻잎', '차잎', '향초', '쑥', '깻잎', '고수', '파슬리',
           '월계수', '딜', '처빌', '레몬밤', '계피', '팔각', '회향', '샤프란', '강황', '솔잎', '커피', '옥엽차'],
    '고소': ['버터', '치즈', '크림', '우유', '참깨', '땅콩', '호두', '아몬드', '잣', '밤', '캐슈', '피스타치오', '해바라기', '코코넛'],
    '감칠': ['버섯', '송이', '표고', '트러플', '송로', '간장', '된장', '누룩', '해초', '다시마', '김', '미역', '치즈'],
    '마력': ['마력', '수정', '무지개', '번개', '자수정', '오색', '천상', '영지', '선도', '별빛', '빛고리', '마수', '진주', '구슬', '유리', '동충초'],
}
# 맛을 빼야 하는 낱말 (예: '호박씨'는 단맛 아님, '감자'는 '감'이 아님)
NOT = {'단맛': ['호박씨', '감자', '감귤', '배추', '양배추', '애호박'], '꽃향': ['불꽃', '꽃무늬', '꽃방울 브로콜리', '콜리플라워']}
# 분류를 이름으로 고친다
CLS_WORDS = [
    ('root', ['당근', '감자', '양파', '순무', '우엉', '연근', '고구마', '토란', '래디시', '비트', '더덕']),
    ('nut', ['콩', '팥', '렌틸', '호박씨', '참깨', '잣', '솔씨']),
]
MILD = ['계피', '바닐라', '팔각', '회향', '샤프란', '강황', '심황', '향기', '국화', '카네이션']
# 든든함: 배를 채우는 재료
HEARTY = {'grain', 'root', 'meat', 'egg', 'nut'}


def tag(cat):
    out = {}
    rows = ROWS[cat['category']]
    cls = rows[cat['row']][cat['col']]
    name = cat['name']
    if any(w in name for w in ['젤리', '젤라틴']):
        cls = 'sweet'
    for c, words in CLS_WORDS:
        if cls in ('veg', 'root', 'mushroom', 'spice') and any(w in name for w in words):
            cls = c
    tags = list(BASE[cls])
    # 맵지 않은 향신료: 계피, 바닐라 같은 것은 향긋하다
    if cls == 'spice' and any(w in name for w in MILD):
        tags = ['향긋']
    for t, words in WORDS.items():
        if t in tags:
            continue
        if any(w in name for w in words) and not any(n in name for n in NOT.get(t, [])):
            tags.append(t)
    # 과일은 단맛 기본, 이름이 시면 상큼도. 마력은 판타지 표 재료 대부분에 조금씩.
    if cls == 'fruit' and '상큼' not in tags and cat['col'] % 3 == 0:
        tags.append('상큼')
    if cat['category'] == 'fantasy' and '마력' not in tags and cls in ('mushroom', 'season', 'sweet', 'egg', 'dairy'):
        tags.append('마력')
    # 셋까지만, 앞쪽(분류 기본) 우선
    seen = []
    for t in tags:
        if t not in seen:
            seen.append(t)
    out['cls'] = cls
    out['tags'] = seen[:3]
    out['hearty'] = cls in HEARTY
    return out


def main(path):
    data = json.load(open(path, encoding='utf-8'))
    for k, v in data.items():
        v.update(tag(v))
    json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    from collections import Counter
    print(Counter(v['cls'] for v in data.values()))
    print(Counter(t for v in data.values() for t in v['tags']))


if __name__ == '__main__':
    main(sys.argv[1])
