#!/usr/bin/env python3
"""ascii.py — 把截图「看」出来：亮度 ASCII 图（纸亮墨暗）+ 颜色直方图。
用法:
  uv run --no-project review/ascii.py <png> [--cols 110] [--inv] [--crop x0,y0,x1,y1]
"""
import struct
import subprocess
import sys
import os
import tempfile

PNG = sys.argv[1]
COLS = 110
INV = False
CROP = None
i = 2
while i < len(sys.argv):
    a = sys.argv[i]
    if a == "--cols": COLS = int(sys.argv[i + 1]); i += 2
    elif a == "--inv": INV = True; i += 1
    elif a == "--crop": CROP = [float(x) for x in sys.argv[i + 1].split(",")]; i += 2
    else: i += 1

tmpdir = tempfile.mkdtemp()
bmp = os.path.join(tmpdir, "v.bmp")
subprocess.run(["sips", "-Z", str(COLS * 2), "-s", "format", "bmp", PNG, "--out", bmp],
               capture_output=True, check=True)
with open(bmp, "rb") as f:
    data = f.read()
off = struct.unpack_from("<I", data, 10)[0]
width = struct.unpack_from("<i", data, 18)[0]
height = struct.unpack_from("<i", data, 22)[0]
bpp = struct.unpack_from("<H", data, 28)[0]
bytespp = bpp // 8
flip = height > 0
height = abs(height)
row_size = ((width * bytespp + 3) // 4) * 4

def px(x, y):
    r = y if not flip else (height - 1 - y)
    i = off + r * row_size + x * bytespp
    return data[i + 2], data[i + 1], data[i]  # r,g,b

if CROP:
    x0, y0, x1, y1 = CROP
    cw, ch = int((x1 - x0) * width), int((y1 - y0) * height)
else:
    x0 = y0 = 0; cw, ch = width, height
    x1, y1 = 1.0, 1.0

CHARS_D = " .:-=+*#%@"   # 暗→亮
CHARS_I = "@%#*+=-:. "   # 亮→暗（inv：纸=空格，墨=实心）
ROWS = max(6, int(COLS * (ch / max(1, cw)) * 0.52))

def at(gx, gy):
    x = int((x0 + gx / COLS * (x1 - x0)) * width)
    y = int((y0 + gy / ROWS * (y1 - y0)) * height)
    return px(max(0, min(width - 1, x)), max(0, min(height - 1, y)))

chars = CHARS_I if INV else CHARS_D
print(f"── {os.path.basename(PNG)}  crop={CROP or 'full'}  inv={INV}  {COLS}x{ROWS} ──")
for gy in range(ROWS):
    line = []
    for gx in range(COLS):
        r, g, b = at(gx, gy)
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        line.append(chars[min(int(lum / 256 * len(chars)), len(chars) - 1)])
    print("".join(line))

# 颜色直方图（全图）
buckets = {}
for gy in range(40):
    for gx in range(80):
        x = int(gx * width / 80); y = int(gy * height / 40)
        r, g, b = px(x, y)
        key = (r // 48, g // 48, b // 48)
        buckets[key] = buckets.get(key, 0) + 1
print("── 颜色直方图（前 10）──")
for (q, c, d), n in sorted(buckets.items(), key=lambda kv: -kv[1])[:10]:
    print(f"  #{min(255,q*48+24):02x}{min(255,c*48+24):02x}{min(255,d*48+24):02x}  {n:3d} 格")
