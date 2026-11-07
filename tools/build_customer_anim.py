#!/usr/bin/env python3
"""손님 동작 표(한 줄 = 한 손님, 일곱 칸)를 게임용 48픽셀 표 한 장으로 만든다.

칸 순서: 0 앞 서기 · 1~2 앞으로 걷기 · 3~4 뒤로 걷기 · 5 앞보고 앉기 · 6 뒤돌아 앉기
- 칸 사이 투명한 틈을 찾아 자르므로 칸 간격이 고르지 않아도 된다.
- 모든 칸을 같은 비율로 줄이고, 발(그림 맨 아래)을 (24, 46)에 맞춘다.
- 반투명 가장자리는 0 또는 255로 정리해서 도트가 흐려지지 않게 한다.

예시: python3 tools/build_customer_anim.py 손님동작.png assets/customers_anim_48.png
"""
import sys
import numpy as np
from PIL import Image

CELL, FOOT_Y, CONTENT_H = 48, 46, 44


def runs(v, want_empty, minw):
    out, i, n = [], 0, len(v)
    while i < n:
        if (v[i] == 0) == want_empty:
            j = i
            while j < n and (v[j] == 0) == want_empty:
                j += 1
            if j - i >= minw:
                out.append((i, j))
            i = j
        else:
            i += 1
    return out


def main(src, dst):
    a = np.array(Image.open(src).convert('RGBA'))
    solid = a[..., 3] >= 128
    cols = runs(solid.sum(0), False, 8)
    rows = runs(solid.sum(1), False, 8)
    print(f'칸: 가로 {len(cols)} × 세로 {len(rows)}')
    cells = []
    for r, (y0, y1) in enumerate(rows):
        for c, (x0, x1) in enumerate(cols):
            m = solid[y0:y1, x0:x1]
            ys, xs = np.where(m)
            if not len(xs):
                cells.append(None); continue
            box = (x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1)
            cells.append((r, c, box))
    # 표 전체에서 제일 큰 서 있는 그림(앞 서기 칸)의 키를 44픽셀에 맞춘다
    stand = [b for b in cells if b and b[1] == 0]
    tallest = max(b[2][3] - b[2][1] for b in stand)
    k = CONTENT_H / tallest
    out = Image.new('RGBA', (CELL * len(cols), CELL * len(rows)), (0, 0, 0, 0))
    for item in cells:
        if not item:
            continue
        r, c, (x0, y0, x1, y1) = item
        piece = Image.fromarray(a[y0:y1, x0:x1])
        w, h = max(1, round((x1 - x0) * k)), max(1, round((y1 - y0) * k))
        small = np.array(piece.resize((w, h), Image.BOX))
        small[..., 3] = np.where(small[..., 3] >= 110, 255, 0)
        small[small[..., 3] == 0] = 0
        tile = Image.fromarray(small)
        out.alpha_composite(tile, (c * CELL + (CELL - w) // 2, r * CELL + FOOT_Y - h))
    out.save(dst)
    prev = out.resize((out.width * 3, out.height * 3), Image.NEAREST)
    bg = Image.new('RGBA', prev.size, (238, 234, 222, 255)); bg.alpha_composite(prev)
    bg.save(dst.replace('.png', '_preview3x.png'))
    print(f'저장: {dst} ({out.width}×{out.height}), 비율 {k:.3f}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
