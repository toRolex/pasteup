"""生成 pasteup README 用的品牌卡片 SVG（同源字体取轮廓 + DESIGN.md 调色板）。

产出 docs/assets/banner.svg —— 顶部主视觉（logo · 标题 · 定位 · 工作流 · 技术栈）。

字体全部取自仓库已打包的 OFL 1.1 资产（src/assets/fonts/）：
中文走 Ma Shan Zheng（手写）/ ZCOOL KuaiLe（副标），拉丁与数字走 Caveat / Nunito。
不使用系统字体——Apple 系统字体不允许嵌入轮廓再分发。
字形以 path 内嵌，README 在任意客户端渲染一致，无字体请求。
"""
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / "src" / "assets" / "fonts"
OUT = ROOT / "docs" / "assets"

# DESIGN.md Palette（hex 取自设计契约的 Palette 表）
DESK = "#C9BCA6"
BG = "#F7F0E0"
PAPER2 = "#F2E9D3"
PAPER_DEEP = "#E8DFC6"
INK = "#5A4634"
INK_SOFT = "#7A6852"
MOSS = "#7A8B5C"
MOSS_DEEP = "#64734A"
TAPE = "#C0392B"
NOTE = "#E8C88A"
NOTE_DEEP = "#D8B26A"

HAND = "ma-shan-zheng-400.woff2"
SCRATCH = "caveat-600.woff2"
SUB = "zcool-kuaile-400.woff2"
BODY = "nunito-400.woff2"
BODY6 = "nunito-600.woff2"
BODY7 = "nunito-700.woff2"

_cache: dict[tuple[str, int], TTFont] = {}


def _load(family: str, weight: int | None = None) -> TTFont:
    key = (family, weight or 0)
    if key not in _cache:
        font = TTFont(FONTS / family, lazy=True)
        if weight and "fvar" in font:
            font = instantiateVariableFont(
                font, {"wght": weight}, inplace=False, updateFontNames=False
            )
        _cache[key] = font
    return _cache[key]


def has_glyph(family: str, ch: str) -> bool:
    return ord(ch) in _load(family).getBestCmap()


def text_path(family: str, weight: int, text: str, size: float) -> tuple[str, float]:
    """文本 → (SVG path 片段, 宽)。原点在基线左端；字形 y 向上，故 flip 后 y 向下。"""
    font = _load(family, weight)
    upm = font["head"].unitsPerEm
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    scale = size / upm

    parts: list[str] = []
    x = 0.0
    missing: list[str] = []
    for ch in text:
        gname = cmap.get(ord(ch))
        if gname is None:
            missing.append(ch)
            x += size * 0.5
            continue
        pen = SVGPathPen(gs)
        gs[gname].draw(pen)
        d = pen.getCommands()
        if d:
            parts.append(
                f'<path transform="translate({x:.2f} 0) scale({scale:.5f} -{scale:.5f})" d="{d}"/>'
            )
        x += hmtx[gname][0] * scale
    if missing:
        raise SystemExit(f"字体缺字形 {family}: {''.join(sorted(set(missing)))} —— 换字体或改文案")
    return "".join(parts), x


def T(family, weight, text, size, x, y, fill, opacity=None, anchor="start"):
    """文本元素；anchor: start / middle / end。返回 (svg, 宽度)。"""
    d, w = text_path(family, weight, text, size)
    if anchor == "middle":
        x -= w / 2
    elif anchor == "end":
        x -= w
    op = f' opacity="{opacity}"' if opacity is not None else ""
    return f'<g transform="translate({x:.2f} {y:.2f})" fill="{fill}"{op}>{d}</g>', w


def pill(x, y, label, value, *, h=25):
    """技术栈徽章（文字 pill，配色取项目调色板）。"""
    ld, lw = text_path(BODY6, 600, label, 12.5)
    vd, vw = text_path(BODY7, 700, value, 12.5)
    pad, gap = 11, 6
    w = pad + lw + gap + vw + pad
    return (
        f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h}" rx="4" fill="{PAPER2}"/>'
        f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h}" rx="4" fill="none" '
        f'stroke="{MOSS}" stroke-opacity="0.30"/>'
        f'<g transform="translate({x + pad:.2f} {y + h / 2 + 4.4:.2f})" fill="{INK_SOFT}">{ld}</g>'
        f'<g transform="translate({x + pad + lw + gap:.2f} {y + h / 2 + 4.4:.2f})" fill="{MOSS_DEEP}">{vd}</g>',
        w,
    )


def chip(x, y, label, *, h=26):
    """工作流步骤 chip。"""
    ld, lw = text_path(SUB, 400, label, 15, )
    w = lw + 24
    return (
        f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h}" rx="4" fill="{BG}"/>'
        f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h}" rx="4" fill="none" '
        f'stroke="{MOSS}" stroke-opacity="0.38"/>'
        f'<g transform="translate({x + 12:.2f} {y + h / 2 + 5.6:.2f})" fill="{MOSS_DEEP}">{ld}</g>',
        w,
    )


def arrow() -> tuple[str, float]:
    """手绘箭头（字体子集无箭头字形；手绘线更贴合手帐质感）。"""
    w = 22
    d = f"M 0 5 C 6 4.2 13 5.6 {w - 6} 5"
    head = f"M {w - 10} 1.2 L {w - 1} 5 L {w - 10} 8.8"
    return (
        f'<path d="{d}" fill="none" stroke="{MOSS_DEEP}" stroke-opacity="0.75" '
        f'stroke-width="1.5" stroke-linecap="round"/>'
        f'<path d="{head}" fill="none" stroke="{MOSS_DEEP}" stroke-opacity="0.75" '
        f'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
        w,
    )


def build_banner() -> str:
    W, H = 1280, 460
    PAD = 46
    px, py = PAD, 38
    pw, ph = W - PAD * 2, H - 76
    o: list[str] = []

    # 纵向节奏（单点定义，避免各行相互错位）
    cy = py + 84          # logo 中心 / 标题块基准
    line_y = cy + 94      # 分隔线
    body1 = line_y + 36   # 定位文案首行基线
    body2 = line_y + 64   # 次行基线
    flow_y = line_y + 100 # 工作流 chip 顶边

    # 桌面底 + 摊开的纸页（书体投影 + 内页纸）
    o.append(f'<rect width="{W}" height="{H}" fill="{DESK}"/>')
    o.append(f'<rect x="{px}" y="{py + 7}" width="{pw}" height="{ph}" rx="4" fill="#3A2C1E" opacity="0.20"/>')
    o.append(f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="4" fill="{BG}"/>')
    o.append(
        f'<line x1="{px + 26}" y1="{py + 14}" x2="{px + 26}" y2="{py + ph - 14}" '
        f'stroke="{INK}" stroke-opacity="0.20" stroke-width="1" stroke-dasharray="3 3"/>'
    )

    # 便利贴（右上）
    nx, ny, nw, nh = px + pw - 186, py + 20, 156, 84
    o.append(
        f'<g transform="translate({nx} {ny}) rotate(-3)">'
        f'<rect width="{nw}" height="{nh}" rx="4" fill="{NOTE}" opacity="0.85"/>'
        f'<rect width="{nw}" height="{nh}" rx="4" fill="none" stroke="{NOTE_DEEP}" stroke-opacity="0.5"/>'
        f'</g>'
    )
    # logo：苔绿纸片 + 内页纸圆 + 朱红胶带
    lx, r = px + 82, 29
    o.append(f'<rect x="{lx - r}" y="{cy - r}" width="{r * 2}" height="{r * 2}" rx="8" fill="{MOSS}"/>')
    o.append(f'<circle cx="{lx - r * 0.28:.1f}" cy="{cy - r * 0.28:.1f}" r="{r * 0.55:.1f}" fill="{BG}"/>')
    o.append(
        f'<g transform="translate({lx - 44} {cy + 32}) rotate(-2.5)">'
        f'<rect width="88" height="18" fill="{TAPE}" opacity="0.88"/></g>'
    )

    # 主标题 + 中文手写副标
    o.append(T(SCRATCH, 600, "pasteup", 74, lx + r + 28, cy + 18, INK)[0])
    o.append(T(HAND, 400, "手帐剪纸拼贴绘图", 29, lx + r + 32, cy + 62, MOSS_DEEP)[0])

    # 分隔线 + 定位文案（中文走 ZCOOL KuaiLe，拉丁数字走 Nunito）
    o.append(
        f'<line x1="{px + 56}" y1="{line_y}" x2="{px + pw - 56}" y2="{line_y}" '
        f'stroke="{INK}" stroke-opacity="0.18" stroke-width="1"/>'
    )
    o.append(T(SUB, 400, "在照片上描摹出轮廓，生成彩纸质感的纸片，拼贴排版后导出 PNG / SVG。",
               18, px + 56, body1, INK_SOFT)[0])
    o.append(T(SUB, 400, "外出或手边没有材料时，替代实物彩纸拼贴。",
               15, px + 56, body2, INK_SOFT, 0.66)[0])

    # 工作流步骤条（与正文左对齐，箭头手绘）
    steps = ["上传照片", "描摹轮廓", "生成纸片", "拼贴排版", "导出 PNG / SVG"]
    arrow_w = arrow()[1] + 14
    widths = [chip(0, 0, s)[1] for s in steps]
    sx = px + 56
    for i, w in enumerate(widths):
        if i:
            o.append(f'<g transform="translate({sx:.1f} {flow_y + 8:.1f})">{arrow()[0]}</g>')
            sx += arrow_w
        o.append(chip(sx, flow_y, steps[i])[0])
        sx += w

    # 技术栈徽章（末行）
    bx, by = px + 56, flow_y + 58
    for label, value in [("Fabric.js", "v7.4"), ("Tauri", "2"), ("React", "18"),
                         ("Zustand", "5"), ("TypeScript", "5.8")]:
        el, w = pill(bx, by, label, value)
        o.append(el)
        bx += w + 8

    # 手写批注（朱红强调，落在右下空白）
    an, anw = T(HAND, 400, "描摹一下", 20, 0, 0, TAPE, 0.88)
    o.append(
        f'<g transform="translate({px + pw - 66 - anw:.1f} {by + 4:.1f}) rotate(-4)">{an}</g>'
    )

    # 便利贴文字（与便利贴同旋转）
    o.append(
        f'<g transform="translate({nx + 22:.1f} {ny + 24:.1f}) rotate(-3)">'
        f'{T(SCRATCH, 600, "pasteup", 26, 0, 22, INK_SOFT, 0.9)[0]}'
        f'{T(SUB, 400, "手帐剪纸拼贴", 15, 2, 46, INK, 0.72)[0]}'
        f'</g>'
    )

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
        f'viewBox="0 0 {W} {H}" role="img" aria-label="pasteup — 手帐剪纸拼贴绘图 app">'
        + "".join(o)
        + "</svg>"
    )


def build_social() -> str:
    """社交预览卡（GitHub 建议 1280×640）：大字号、信息极简，缩略图下可读。"""
    W, H = 1280, 640
    o: list[str] = [f'<rect width="{W}" height="{H}" fill="{DESK}"/>']
    px, py, pw, ph = 64, 64, W - 128, H - 128
    o.append(f'<rect x="{px}" y="{py + 10}" width="{pw}" height="{ph}" rx="6" fill="#3A2C1E" opacity="0.22"/>')
    o.append(f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="6" fill="{BG}"/>')
    o.append(
        f'<line x1="{px + 30}" y1="{py + 20}" x2="{px + 30}" y2="{py + ph - 20}" '
        f'stroke="{INK}" stroke-opacity="0.20" stroke-width="1.2" stroke-dasharray="4 4"/>'
    )

    # 便利贴（右上）
    nx, ny, nw, nh = px + pw - 232, py + 40, 192, 108
    o.append(
        f'<g transform="translate({nx} {ny}) rotate(-3)">'
        f'<rect width="{nw}" height="{nh}" rx="4" fill="{NOTE}" opacity="0.85"/>'
        f'<rect width="{nw}" height="{nh}" rx="4" fill="none" stroke="{NOTE_DEEP}" stroke-opacity="0.5"/>'
        f'<g transform="translate(26 54)">'
        f'{T(SCRATCH, 600, "pasteup", 30, 0, 0, INK_SOFT, 0.9)[0]}'
        f'{T(SUB, 400, "手帐剪纸拼贴", 17, 2, 28, INK, 0.72)[0]}'
        f'</g></g>'
    )

    # logo + 标题
    lx, ly, r = px + 118, py + 172, 48
    o.append(f'<rect x="{lx - r}" y="{ly - r}" width="{r * 2}" height="{r * 2}" rx="12" fill="{MOSS}"/>')
    o.append(f'<circle cx="{lx - r * 0.28:.1f}" cy="{ly - r * 0.28:.1f}" r="{r * 0.55:.1f}" fill="{BG}"/>')
    o.append(
        f'<g transform="translate({lx - 74} {ly + 52}) rotate(-2.5)">'
        f'<rect width="148" height="28" fill="{TAPE}" opacity="0.88"/></g>'
    )
    o.append(T(SCRATCH, 600, "pasteup", 112, lx + r + 44, ly + 22, INK)[0])
    o.append(T(HAND, 400, "手帐剪纸拼贴绘图", 46, lx + r + 52, ly + 92, MOSS_DEEP)[0])

    # 一句话
    o.append(
        f'<line x1="{px + 80}" y1="{py + 300}" x2="{px + pw - 80}" y2="{py + 300}" '
        f'stroke="{INK}" stroke-opacity="0.18" stroke-width="1.2"/>'
    )
    o.append(T(SUB, 400, "在照片上描摹出轮廓，生成彩纸质感的纸片，", 27, px + 80, py + 344, INK_SOFT)[0])
    o.append(T(SUB, 400, "拼贴排版后导出 PNG / SVG。", 27, px + 80, py + 384, INK_SOFT)[0])

    # 技术栈
    bx, by = px + 80, py + 430
    for label, value in [("Fabric.js", "v7.4"), ("Tauri", "2"), ("React", "18"),
                         ("Zustand", "5"), ("TypeScript", "5.8")]:
        el, w = pill(bx, by, label, value, h=30)
        o.append(el)
        bx += w + 10

    an, anw = T(HAND, 400, "描摹一下", 26, 0, 0, TAPE, 0.88)
    o.append(f'<g transform="translate({px + pw - 90 - anw:.1f} {by + 12:.1f}) rotate(-4)">{an}</g>')

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
        f'viewBox="0 0 {W} {H}" role="img" aria-label="pasteup — 手帐剪纸拼贴绘图 app">'
        + "".join(o) + "</svg>"
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    banner = build_banner()
    (OUT / "banner.svg").write_text(banner, encoding="utf-8")
    social = build_social()
    (OUT / "social-preview.svg").write_text(social, encoding="utf-8")
    print(f"banner.svg {len(banner) / 1024:.1f}KB")
    print(f"social-preview.svg {len(social) / 1024:.1f}KB")


if __name__ == "__main__":
    main()
