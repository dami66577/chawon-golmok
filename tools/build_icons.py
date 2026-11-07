"""홈 화면 바로가기 아이콘을 만든다.

    python3 tools/build_icons.py

요리사 그림(staff_chefs_48.png 첫 칸)을 크게 키워 남색 바탕에 얹는다. 도트가 번지지 않게 가장 가까운 픽셀로 키운다.
"""
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = (42, 49, 80, 255)       # 하단 메뉴 남색
RING = (255, 211, 90, 255)   # 금색 테두리


def chef():
    sheet = Image.open(os.path.join(ROOT, 'assets/staff_chefs_48.png')).convert('RGBA')
    return sheet.crop((0, 0, 48, 48))


def icon(size, safe=1.0, ring=True):
    im = Image.new('RGBA', (size, size), BG)
    d = ImageDraw.Draw(im)
    if ring:
        w = max(2, size // 40)
        m = int(size * (1 - safe) / 2) + w
        d.rectangle([m, m, size - m - 1, size - m - 1], outline=RING, width=w)
    c = chef()
    box = c.getbbox()
    c = c.crop(box)
    scale = max(1, int((size * safe * 0.78) // max(c.size)))
    c = c.resize((c.width * scale, c.height * scale), Image.NEAREST)
    im.alpha_composite(c, ((size - c.width) // 2, (size - c.height) // 2 + size // 40))
    return im


def main():
    out = os.path.join(ROOT, 'assets/app')
    os.makedirs(out, exist_ok=True)
    icon(192).save(os.path.join(out, 'icon-192.png'))
    icon(512).save(os.path.join(out, 'icon-512.png'))
    icon(512, safe=0.72, ring=False).save(os.path.join(out, 'icon-maskable-512.png'))  # 둥글게 잘려도 남는 가운데 80%
    icon(180, ring=False).convert('RGB').save(os.path.join(out, 'apple-touch-icon.png'))
    print('아이콘 4개')

if __name__ == '__main__':
    main()
