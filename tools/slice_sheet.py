#!/usr/bin/env python3
"""그림 표(예: 챗지피티로 뽑은 10x10)를 칸마다 잘라 게임용 낱장 PNG로 만든다.

하는 일
  1. 칸 나누기: 일단 똑같이 나눈 뒤, 경계선을 근처의 '그림이 제일 적은 줄'로 옮긴다.
     그래서 챗지피티처럼 칸이 조금씩 삐뚤어도 그림이 잘리지 않는다.
  2. 배경 지우기: 투명 배경이면 그대로, 단색 배경이면 가장자리에서 이어진 같은 색만 지운다.
     요리사 모자처럼 그림 안쪽에 있는 흰색은 지워지지 않는다.
  3. 여백 다듬고 맞추기: 표 전체를 같은 비율로 줄여서 크기 차이를 지키고,
     사람은 발을 같은 줄에(--anchor bottom), 물건은 가운데에(--anchor center) 놓는다.
  4. 미리보기 한 장(_preview.png)과 목록(_manifest.json)을 같이 만든다.

예시
  python3 tools/slice_sheet.py 손님표.png --out assets/guests --names 손님이름.txt
  python3 tools/slice_sheet.py 재료표.png --out assets/ingredients --anchor center --size 64

이름 파일: 한 줄에 하나, 표의 왼쪽 위부터 오른쪽으로 읽는 순서. 빈 칸은 '-'.

주의: 그림이 칸 밖으로 삐져나가면 그 부분은 옆 칸에 붙는다. _preview.png에서 잘린 그림이 없는지 한 번 보기.
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw


def parse_args():
    p = argparse.ArgumentParser(description='그림 표를 칸마다 잘라 낱장 PNG로 만든다')
    p.add_argument('sheet', help='그림 표 파일 (png, jpg, webp)')
    p.add_argument('--out', required=True, help='낱장을 저장할 폴더')
    p.add_argument('--grid', default='10x10', help='열x행, 기본 10x10')
    p.add_argument('--names', help='이름 목록 파일 (한 줄에 하나, 빈 칸은 -)')
    p.add_argument('--size', type=int, default=128, help='낱장 한 변 픽셀, 기본 128')
    p.add_argument('--anchor', choices=['bottom', 'center'], default='bottom', help='bottom=발 맞추기(사람), center=가운데(물건)')
    p.add_argument('--bg', default='auto', help="배경색. auto면 가장자리에서 찾는다. 예: '#ffffff'")
    p.add_argument('--tol', type=float, default=30, help='배경색으로 볼 색 차이, 기본 30')
    p.add_argument('--inset', type=float, default=0.02, help='칸 테두리 선을 버릴 비율, 기본 0.02')
    p.add_argument('--each', action='store_true', help='칸마다 꽉 차게 따로 키운다 (아이콘용)')
    return p.parse_args()


def load_names(path, n):
    if not path:
        return [None] * n
    with open(path, encoding='utf-8') as f:
        names = [line.strip() for line in f]
    names = [None if (not x or x == '-') else x for x in names]
    return (names + [None] * n)[:n]


def background_mask(rgba, bg_arg, tol, seeds):
    """배경 픽셀 True. 단색 배경은 seeds(가장자리 등)에서 이어진 곳만."""
    alpha = rgba[..., 3]
    if (alpha < 16).mean() > 0.05:
        return alpha < 16
    rgb = rgba[..., :3].astype(np.int16)
    if bg_arg == 'auto':
        border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
        color = np.median(border, axis=0)
    else:
        h = bg_arg.lstrip('#')
        color = np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)])
    cand = np.sqrt(((rgb - color) ** 2).sum(-1)) <= tol
    cur = cand & seeds
    # 같은 색끼리 이어진 곳만 번져 나간다
    while True:
        grow = cur.copy()
        grow[1:] |= cur[:-1]; grow[:-1] |= cur[1:]
        grow[:, 1:] |= cur[:, :-1]; grow[:, :-1] |= cur[:, 1:]
        grow &= cand
        if grow.sum() == cur.sum():
            return cur
        cur = grow


def components(mask):
    """서로 붙어 있는 덩어리마다 번호를 붙인다 (상하좌우 연결)."""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    flat = mask.ravel()
    labf = lab.ravel()
    n = 0
    for start in np.flatnonzero(flat):
        if labf[start]:
            continue
        n += 1
        labf[start] = n
        stack = [start]
        while stack:
            i = stack.pop()
            y, x = divmod(i, w)
            for j, ok in ((i - w, y > 0), (i + w, y < h - 1), (i - 1, x > 0), (i + 1, x < w - 1)):
                if ok and flat[j] and not labf[j]:
                    labf[j] = n
                    stack.append(j)
    return lab, n


def _runs(m):
    """가로 방향으로 이어진 길이와, 그 줄이 칸 가장자리에 닿는지."""
    h, w = m.shape
    length = np.zeros((h, w), np.int32)
    touch = np.zeros((h, w), bool)
    for y in range(h):
        row = m[y]
        x = 0
        while x < w:
            if row[x]:
                j = x
                while j < w and row[j]:
                    j += 1
                length[y, x:j] = j - x
                touch[y, x:j] = x <= 3 or j >= w - 3
                x = j
            else:
                x += 1
    return length, touch


def edge_lines(m):
    """칸 가장자리에서 뻗어 나온 두께 3픽셀 이하의 긴 줄 = 칸 테두리 선."""
    h, w = m.shape
    hl, ht = _runs(m)
    vl, vt = _runs(m.T)
    vl, vt = vl.T, vt.T
    horiz = (hl >= w * 0.35) & ht & (vl <= 3)
    vert = (vl >= h * 0.35) & vt & (hl <= 3)
    return horiz | vert


def keep_drawing(m):
    """칸 테두리 선 조각과 부스러기를 버리고 그림 덩어리만 남긴다."""
    lab, n = components(m)
    if n == 0:
        return m
    areas = np.bincount(lab.ravel())[1:]
    big = areas.max()
    keep = np.zeros(n + 1, bool)
    for k in range(1, n + 1):
        ys, xs = np.where(lab == k)
        bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
        # 평균 두께가 3픽셀쯤이면 선(ㄱ자로 꺾인 칸 모서리 포함)
        thin_line = areas[k - 1] <= 3 * (bw + bh)
        keep[k] = areas[k - 1] >= big * 0.02 and not thin_line
    return keep[lab]


def snap_cuts(occupancy, n):
    """똑같이 나눈 경계를 근처에서 그림이 제일 적은 곳으로 옮긴다."""
    L = len(occupancy)
    step = L / n
    cuts = [0]
    for i in range(1, n):
        c = int(round(i * step))
        r = int(step * 0.25)
        lo, hi = max(cuts[-1] + 1, c - r), min(L - 1, c + r)
        window = occupancy[lo:hi + 1]
        # 제일 적은 곳이 여러 개면 원래 경계에 가까운 쪽
        best = min(range(len(window)), key=lambda k: (window[k], abs(lo + k - c)))
        cuts.append(lo + best)
    cuts.append(L)
    return cuts


def main():
    a = parse_args()
    cols, rows = (int(x) for x in a.grid.lower().split('x'))
    img = Image.open(a.sheet).convert('RGBA')
    rgba = np.array(img)
    H, W = rgba.shape[:2]

    seeds = np.zeros((H, W), bool)
    seeds[0, :] = seeds[-1, :] = seeds[:, 0] = seeds[:, -1] = True
    # 칸 테두리 선이 칸을 가두는 경우를 대비해 칸 네 귀퉁이 근처도 씨앗으로
    for i in range(cols + 1):
        for j in range(rows + 1):
            for dx in (-1, 1):
                for dy in (-1, 1):
                    x = int(i * W / cols + dx * W / cols * 0.06)
                    y = int(j * H / rows + dy * H / rows * 0.06)
                    if 0 <= x < W and 0 <= y < H:
                        seeds[y, x] = True
    bg = background_mask(rgba, a.bg, a.tol, seeds)
    fg = ~bg

    xcuts = snap_cuts(fg.sum(0), cols)
    ycuts = snap_cuts(fg.sum(1), rows)

    names = load_names(a.names, cols * rows)
    os.makedirs(a.out, exist_ok=True)

    pieces = []
    for r in range(rows):
        for c in range(cols):
            x0, x1, y0, y1 = xcuts[c], xcuts[c + 1], ycuts[r], ycuts[r + 1]
            ix, iy = int((x1 - x0) * a.inset), int((y1 - y0) * a.inset)
            x0, x1, y0, y1 = x0 + ix, x1 - ix, y0 + iy, y1 - iy
            m = fg[y0:y1, x0:x1].copy()
            m &= ~edge_lines(m)
            m = keep_drawing(m)
            if m.sum() < m.size * 0.004:
                continue
            # 먼지 같은 점은 무시하고 여백을 다듬는다
            ys = np.where(m.sum(1) >= 2)[0]
            xs = np.where(m.sum(0) >= 2)[0]
            if not len(xs) or not len(ys):
                continue
            bx0, bx1, by0, by1 = xs[0], xs[-1] + 1, ys[0], ys[-1] + 1
            if (bx1 - bx0) < (x1 - x0) * 0.08 or (by1 - by0) < (y1 - y0) * 0.08:
                continue  # 부스러기
            piece = rgba[y0 + by0:y0 + by1, x0 + bx0:x0 + bx1].copy()
            piece[..., 3] = np.where(m[by0:by1, bx0:bx1], piece[..., 3], 0)
            idx = r * cols + c
            pieces.append({'idx': idx, 'row': r, 'col': c, 'img': piece,
                           'name': names[idx] or f'r{r + 1:02d}c{c + 1:02d}',
                           'src': [int(x0 + bx0), int(y0 + by0), int(bx1 - bx0), int(by1 - by0)]})

    if not pieces:
        sys.exit('그림을 하나도 못 찾았어요. --bg 나 --tol 을 바꿔 보세요.')

    S, pad = a.size, max(2, a.size // 16)
    biggest = max(max(p['img'].shape[0], p['img'].shape[1]) for p in pieces)
    shared = (S - 2 * pad) / biggest

    manifest = []
    for p in pieces:
        h, w = p['img'].shape[:2]
        k = (S - 2 * pad) / max(h, w) if a.each else shared
        nw, nh = max(1, round(w * k)), max(1, round(h * k))
        im = Image.fromarray(p['img'], 'RGBA').resize((nw, nh), Image.LANCZOS)
        out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        x = (S - nw) // 2
        y = S - pad - nh if a.anchor == 'bottom' else (S - nh) // 2
        out.alpha_composite(im, (x, y))
        fname = f"{p['name']}.png"
        out.save(os.path.join(a.out, fname))
        p['out'] = out
        manifest.append({'name': p['name'], 'file': fname, 'cell': [p['row'] + 1, p['col'] + 1], 'source_box': p['src']})

    # 미리보기: 체크무늬 위에 낱장을 늘어놓고, 발 맞추는 줄을 빨갛게
    per = min(10, len(pieces))
    lines = (len(pieces) + per - 1) // per
    cell = S + 20
    prev = Image.new('RGBA', (per * cell, lines * cell), (255, 255, 255, 255))
    d = ImageDraw.Draw(prev)
    for i, p in enumerate(pieces):
        ox, oy = (i % per) * cell, (i // per) * cell
        for yy in range(0, S, 8):
            for xx in range(0, S, 8):
                if (xx // 8 + yy // 8) % 2:
                    d.rectangle([ox + xx, oy + yy, ox + xx + 7, oy + yy + 7], fill=(228, 228, 228, 255))
        prev.alpha_composite(p['out'], (ox, oy))
        if a.anchor == 'bottom':
            d.line([ox, oy + S - pad, ox + S, oy + S - pad], fill=(220, 60, 60, 255))
        d.text((ox + 2, oy + S + 4), p['name'][:18], fill=(30, 30, 50, 255))
    prev.save(os.path.join(a.out, '_preview.png'))
    with open(os.path.join(a.out, '_manifest.json'), 'w', encoding='utf-8') as f:
        json.dump({'sheet': os.path.basename(a.sheet), 'size': S, 'anchor': a.anchor, 'items': manifest}, f, ensure_ascii=False, indent=2)
    print(f'{len(pieces)}장 저장: {a.out}  (미리보기 {a.out}/_preview.png)')


if __name__ == '__main__':
    main()
