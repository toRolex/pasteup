# Design

## Theme

**Color strategy: Committed-light** — 奶白麻色画布 + 明亮苔绿为主。苔绿在 surface 上以按钮、active 描边、active 工具图标焦点形式出现,占面板 5–10%。纸片本身的色彩由用户选定,UI 不抢戏。

**Mode: Light** — 物理场景:用户在咖啡馆阳台上午后做手帐,阳光从左侧洒在浅米色桌面上,屏幕亮度跟窗外自然光匹配;界面不该刺眼,所以深色 UI 该 back off。

**Token base**: all colors expressed in OKLCH. RGB / hex only when OKLCH is unavailable (image assets).

## Palette

| Role | OKLCH | Hex | Use |
|---|---|---|---|
| `bg` | `oklch(0.94 0.018 85)` | `#F0E8D7` | App 背景、画布背景 |
| `surface` | `oklch(0.965 0.020 85)` | `#F7F0E0` | 面板、磁贴、卡片 |
| `surface-2` | `oklch(0.93 0.022 85)` | `#EFE6D2` | 工具栏、磁贴 hover、深层 surface |
| `ink` | `oklch(0.32 0.045 60)` | `#5A4634` | 正文、标题 |
| `ink-muted` | `oklch(0.52 0.035 60)` | `#8A755E` | 副文本、标签、placeholder |
| `primary` | `oklch(0.55 0.092 130)` | `#7A8B5C` | 苔绿,主行动色、active 焦点 |
| `primary-ink` | `oklch(0.98 0.005 130)` | `#F8F8F2` | 苔绿按钮上的文字 |
| `accent` | `oklch(0.62 0.078 70)` | `#A8845A` | 棕褐,辅助强调、纹理封面 |
| `muted` | `oklch(0.85 0.025 90)` | `#D9C9A8` | 沙石质感底色、分割区 |
| `edge` | `oklch(0.88 0.020 80)` | `#E0D3B5` | 1px 描边 |
| `blob` | `oklch(0.93 0.035 95)` | `#ECDFBE` | 纸张纹理叠层 |

**Contrast check**:
- `ink` on `bg`: L 0.32 / 0.94 → ratio ~9.6:1 (WCAG AAA)
- `ink` on `surface`: L 0.32 / 0.965 → ratio ~10:1 (AAA)
- `ink-muted` on `surface`: L 0.52 / 0.965 → ratio ~4.7:1 (AA)
- `primary-ink` on `primary`: L 0.98 / 0.55 → ratio ~8.9:1 (AAA)
- `primary` on `surface`: L 0.55 / 0.965 → ratio ~4.4:1 (AA, borderline; use only for non-text/button)

## Typography

| Role | Family | Weight | Size | Tracking |
|---|---|---|---|---|
| Display | `Caveat` (英文) + `ZCOOL KuaiLe` (中文) | 600 | clamp(28px, 3vw, 40px) | -0.02em |
| H2 | `Caveat` + `ZCOOL KuaiLe` | 600 | 22px | -0.01em |
| Body | `Nunito` (英文) + `Hiragino Maru Gothic ProN` (中文兜底) | 400 | 13px | 0 |
| Body strong | `Nunito` + `Hiragino Maru Gothic ProN` | 700 | 13px | 0 |
| Caption | `Nunito` + 系统 | 400 | 11px | 0.02em |
| Numeric | `Nunito` | 600 | 13px | 0 |

**Brand font chain**（本地打包 + 系统兜底）:
```css
--font-display: 'Caveat', 'ZCOOL KuaiLe', 'Hiragino Maru Gothic ProN', 'Microsoft YaHei', cursive, sans-serif;
--font-body: 'Nunito', 'Hiragino Maru Gothic ProN', 'PingFang SC', 'Microsoft YaHei', sans-serif;
```

**字体资产（本地打包，OFL 1.1）**：`Caveat`(600) / `ZCOOL KuaiLe`(400) / `Nunito`(400/600/700) 以 woff2 子集进 bundle（`src/assets/fonts/`，经 Vite），桌面 App 不运行时走 CDN（离线优先）。标题中文由打包的 ZCOOL KuaiLe 保证双平台一致；中文正文字体不打包——macOS 用系统 `Hiragino Maru Gothic ProN`，Windows 兜底 `Microsoft YaHei`（正文小字号黑体/圆体差异弱，柔和感由标题承载）。本契约是当前 design system 版本，随设计迭代可调整。

Line length cap: 65–75ch for long-form; UI 行高 1.5,标题 1.2.

## Spacing

4 / 8 / 12 / 16 / 24 / 32 / 48 — 整步递进。

Panel 内边距 14px,magnet 之间 12px,磁贴内 12px,组件内 8/12/16。

## Radius

- **Base**: 12px (面板、磁贴)
- **Card**: 14px (图层卡)
- **Button**: 999px (topbar 按钮 — pill 形)
- **Tile**: 8px (色块、纹理)
- **Tool btn**: 12px (左工具栏按钮)
- **Layer thumb**: 8px

## Elevation

3 级柔和阴影,都用 `oklch` 黑色 + 轻微棕色 tint 接近纸感:

```css
--shadow-1: 0 1px 2px oklch(0.32 0.045 60 / 0.06), 0 1px 1px oklch(0.32 0.045 60 / 0.04);
--shadow-2: 0 2px 6px oklch(0.32 0.045 60 / 0.08), 0 1px 2px oklch(0.32 0.045 60 / 0.05);
--shadow-3: 0 6px 16px oklch(0.32 0.045 60 / 0.10), 0 2px 4px oklch(0.32 0.045 60 / 0.06);
```

纸片叠层 shadow 用 `--shadow-2` 起步,选中后 `--shadow-3`。

## Layout

**App shell grid** (顶栏 + 三栏:左 工具 + 图层 / 中 画布 / 右 色板 + 纹理 + 属性):

```
┌─────────────────────────────────────────────┐
│ topbar  56px                                │
├──────────┬───────────────────────┬──────────┤
│  left    │                       │  right   │
│  rail    │     canvas-area       │  rail    │
│  260px   │                       │  280px   │
│ 工具+图层 │                       │ 色板/纹理 │
│          │                       │  / 属性  │
└──────┴───────────────────────────┴──────────┘
```

grid-template-rows: `56px 1fr`
grid-template-columns: `260px 1fr 280px`
grid-template-areas: `topbar topbar topbar / left canvas right`

Left rail 内部 stacked magnets:工具磁贴(图标 + 文字,2 列网格) / 图层磁贴;右栏 stacked magnets:色板 / 纹理 / 属性。每个磁贴独立成块,块间 12px gap。

## Components

| Component | Style | Notes |
|---|---|---|
| Topbar | 浅米 `bg`,底部 1px 描边 `edge`,24px 圆角 pill 按钮 | 包含品牌 + 文件操作 + 导出 |
| Tool sidebar | 略深 `surface-2`,垂直 6 工具按钮,选中态 primary 边框 + 纯白内填 | 6 工具:选择 / 描摹 / 取色 / 移动 / 缩放 / 旋转 |
| Canvas area | 居中,占满中间区域,`bg` 色无边框 | 纸片 / 底图渲染在此 |
| Magnet card | 浅米 `surface`,14px 圆角,1px 描边 `edge`,`--shadow-1` | 标题 12px ink-muted,右上 8px 圆点作装饰 |
| Layer tile | 整行 36px,32px 圆形 thumb + 名称,选中态描边 primary | 拖动改 z 序(实现阶段) |
| Color chip | 32x32 圆角矩形,2px 描边 | 选中态描边 ink,scale 1.05 |
| Texture tile | 60x60 圆角矩形,平铺 SVG 纹理 | 选中态描边 primary |
| Prop slider | 圆点 16px,轨道 4px,色 primary | 数值实时显示在右 |
| Tool button | 左栏 2 列网格,圆角 10px,图标 18px + 文字 12px 半粗 | 选中态: surface 内填 + primary 1px 描边 + primary 文字 |

## Motion

- 默认过渡: 180ms ease-out-quart
- 工具按钮 / 色块 / 磁贴: hover 0.96 → 1.0 scale;active 0.94
- 颜色切换: 220ms,通过 `state.activeColor` 触发纸片 fill 平滑过渡
- prefers-reduced-motion: 全部降级为瞬时切换

## Texture overlay

Main shell 不强制贴纹理,但 顶栏 跟 右栏可以加一层非常轻的 `blob` 噪声 `radial-gradient` 模拟"纸的颗粒",opacity 0.04 以下,贴合"触摸纸面"心智但不抢戏。

## Anti-patterns explicitly avoided

- 不用玻璃拟态(blur + 半透明)
- 不用渐变文字
- 不用 side-stripe 彩色边框
- 不用 emoji 装饰
- 不用 SaaS 蓝灰白
- 不用 AI 默认 cream/sand(L 0.84-0.97, C < 0.06, hue 40-100);我们 `bg` 用 0.94 L + 0.018 chroma + 85 hue,明确给到色相,不再"假装手作"
- 不用 hero metric + 编号 kicker
- 不用侧栏右上角"齿轮设置"图标群(放进统一的偏好 magnet)
