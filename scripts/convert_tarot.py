#!/usr/bin/env python3
"""将 Rider-Waite 78 张 PNG 转 WebP(q72)，按规范名输出到 frontend/public/tarot/。
命名：major-00..21 / cups-01..14 / pentacles-01..14 / swords-01..14 / wands-01..14
与前端 faceSrc = c => '/tarot/' + c.suit + '-' + String(c.num).padStart(2,'0') + '.webp' 对应。
"""
import os, re, sys
from PIL import Image

SRC = "C:/Users/FXK/AppData/Local/Temp/tk/package/images"
DST = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "tarot")
DST = os.path.abspath(DST)
os.makedirs(DST, exist_ok=True)

MAJOR_RE = re.compile(r"^(\d{2})-.*\.png$", re.I)
MINOR_RE = re.compile(r"^([A-Za-z]+)(\d{2})\.png$", re.I)

def out_name(fn):
    m = MAJOR_RE.match(fn)
    if m:
        return f"major-{m.group(1)}.webp"
    m = MINOR_RE.match(fn)
    if m:
        return f"{m.group(1).lower()}-{m.group(2)}.webp"
    return None

def main():
    files = sorted(os.listdir(SRC))
    count = 0
    seen = set()
    for fn in files:
        if not fn.lower().endswith(".png"):
            continue
        on = out_name(fn)
        if not on:
            print(f"SKIP (no rule): {fn}")
            continue
        if on in seen:
            print(f"DUP: {fn} -> {on}")
        seen.add(on)
        src = os.path.join(SRC, fn)
        dst = os.path.join(DST, on)
        with Image.open(src) as im:
            if im.mode != "RGB":
                im = im.convert("RGB")
            im.save(dst, "WEBP", quality=72, method=4)
        count += 1
    print(f"converted {count} images -> {DST}")

if __name__ == "__main__":
    main()
