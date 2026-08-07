# Design

## Theme

**Color strategy: Committed-light, journal metaphor** — 整个 pasteup 界面是一本摊开的手帐本：左页目录、右页色卡、中间留白拼贴页。底色为暖纸面（内页纸）+ 桌面深木色承载书体；苔绿为 UI 主行动色，朱红胶带为强调 / 选中 / 盖章色。纸片本身的色彩由用户选定，UI 不抢戏。

**Mode: Light** — 物理场景：午后阳台手帐桌，书体摊开在浅木桌面上，纸面不刺眼、墨迹清晰。深色 UI back off。

**Token base**: all colors expressed in OKLCH. RGB / hex only when OKLCH is unavailable (image assets).

## Palette

| Role | OKLCH | Hex | Use |
|---|---|---|---|
| `desk` | `oklch(0.80 0.025 88)` | `#C9BCA6` | App 背景（桌面），承载整本书体 |
| `bg` | `oklch(0.965 0.020 85)` | `#F7F0E0` | 画布背景（内页纸）、留白拼贴页 |
| `paper-2` | `oklch(0.935 0.022 85)` | `#F2E9D3` | 目录页、右页、次级纸面 |
| `paper-deep` | `oklch(0.905 0.025 85)` | `#E8DFC6` | 折角、纸页层叠、内阴影 |
| `ink` | `oklch(0.32 0.045 60)` | `#5A4634` | 正文、标题（墨迹） |
| `ink-soft` | `oklch(0.46 0.04 60)` | `#7A6852` | 副文本、批注、标签 |
| `ink-line` | `oklch(0.32 0.045 60 / 0.38)` | `rgba(90,70,52,.38)` | 手绘描线、虚线、页边线 |
| `moss` | `oklch(0.55 0.092 130)` | `#7A8B5C` | 苔绿，主行动色、active 焦点、勾线 |
| `moss-deep` | `oklch(0.48 0.075 130)` | `#64734A` | 苔绿深色、深底可点文字 |
| `tape` | `oklch(0.53 0.175 27)` | `#C0392B` | 朱红胶带、图章、强调 / 选中标记 |
| `note` | `oklch(0.82 0.10 88)` | `#E8C88A` | 便利贴（色板 / 便签底） |
| `note-deep` | `oklch(0.75 0.11 86)` | `#D8B26A` | 便利贴折痕、描边 |
| `sticker` | `oklch(0.55 0.05 320)` | `#8C6A92` | 淡紫贴纸、装饰元素 |

**Contrast check**（按 OKLCH L 估算，落地以实际渲染校准）:
- `ink` on `bg`: L 0.32 / 0.965 → ratio ~10:1 (AAA)
- `ink` on `paper-2`: L 0.32 / 0.935 → ~9:1 (AAA)
- `ink-soft` on `bg`: L 0.46 / 0.965 → ~6:1 (AA/AAA)
- `moss-deep` on `paper`: L 0.48 / 0.965 → ~6.4:1；深底白字 `paper` on `moss-deep` ≈ 5.2:1
- `paper` on `tape`: L 0.965 / 0.53 → ~8.4:1（图章 / 强调文字）
- `ink` on `note`: L 0.32 / 0.82 → ~8:1（便利贴文字）

## Typography

| Role | Family | Weight | Size | Tracking |
|---|---|---|---|---|
| Journal title（主标题） | `Ma Shan Zheng`（中文手写）+ `Caveat`（英文） | 400 / 600 | clamp(28px, 3vw, 40px) | -0.01em |
| Handwritten annotation | `Liu Jian Mao Cao` | 400 | 13–15px | 0 |
| Sub title | `ZCOOL KuaiLe` | 400 | 16–20px | -0.01em |
| Body | `Nunito`（英文）+ `Hiragino Maru Gothic ProN`（中文兜底） | 400 | 13px | 0 |
| Body strong | `Nunito` + `Hiragino Maru Gothic ProN` | 700 | 13px | 0 |
| Caption | `Nunito` + 系统 | 400 | 11px | 0.02em |
| Numeric | `Nunito` | 600/800 | 13px | 0.5px |

**Brand font chain**（本地打包 + 系统兜底）:
```css
--font-hand: 'Ma Shan Zheng', 'Caveat', 'Kaiti SC', cursive;
--font-scrawl: 'Liu Jian Mao Cao', 'Kaiti SC', cursive;
--font-sub: 'ZCOOL KuaiLe', 'PingFang SC', sans-serif;
--font-num: 'Nunito', 'PingFang SC', sans-serif;
--font-body: 'Nunito', 'Hiragino Maru Gothic ProN', 'PingFang SC', 'Microsoft YaHei', sans-serif;
```

**字体资产（本地打包，OFL 1.1）**：`Caveat`(600) / `ZCOOL KuaiLe`(400) / `Nunito`(400/600/700) / `Ma Shan Zheng`(400) / `Liu Jian Mao Cao`(400) 以 woff2 子集进 bundle（`src/assets/fonts/`，经 Vite），桌面 App 不运行时走 CDN（离线优先）。标题中文由打包的 Ma Shan Zheng（主标题手写）/ ZCOOL KuaiLe（副标）保证双平台一致；中文正文字体不打包——macOS 用系统 `Hiragino Maru Gothic ProN`，Windows 兜底 `Microsoft YaHei`。本契约是当前 design system 版本，随设计迭代可调整。

Line length cap: 65–75ch for long-form; UI 行高 1.5,标题 1.2.

## Spacing

4 / 8 / 12 / 16 / 24 / 32 / 48 — 整步递进。

纸页内边距 14px,磁贴之间 12px,组件内 8/12/16。中缝装订线 34px 属布局，不计入面板间距。

## Radius

拟物方向几乎不用大圆角——纸片 / 胶带边缘靠 clip-path 撕边与锯齿，圆角仅用于残余的轻微轮廓:

- 便利贴 / 色卡: 4px（轻微，不抢撕边质感）
- 工具按钮: 6px
- 图章: 0（方戳，带轻微倾斜）
- 大圆角卡片（12–14px）退出组件规格——手帐拟物不靠圆角表达层级

## Elevation

纸页阴影层次——「摊开感来自阴影而非描边」，书体大投影 + 页内层叠:

```css
--shadow-book: 0 10px 40px oklch(0.25 0.03 60 / 0.25), 0 2px 8px oklch(0.25 0.03 60 / 0.15);  /* 整本书体落桌 */
--shadow-page: inset 3px 0 0 var(--paper-deep), inset -3px 0 0 var(--paper-deep);  /* 双页内阴影 / 中缝 */
--shadow-lift: 0 4px 10px oklch(0.25 0.03 60 / 0.18);  /* 胶带 / 纸片浮起 */
--shadow-hover: 0 6px 14px oklch(0.25 0.03 60 / 0.25);  /* 悬停 / 选中 */
```

纸片叠层用 `--shadow-lift` 起步,选中后 `--shadow-hover`。

## Layout

**App shell grid** — 摊开手帐本四列（顶栏 + 左目录页 + 中缝 + 中画布 + 右页边栏）:

```
┌────────────────────────────────────────────────┐
│ topbar  56px  (裁纸 + 骑中缝胶带)                │
├──────────┬────┬────────────────────┬───────────┤
│  left    │缝34│    canvas-area     │  right    │
│  page    │    │     留白拼贴页       │   page    │
│  260px   │    │                    │  280px    │
│ 目录/工具 │    │                    │ 色板/纹理/ │
│ /图层     │    │                    │ 属性便签   │
└──────────┴────┴────────────────────┴───────────┘
```

grid-template-rows: `56px 1fr`
grid-template-columns: `260px 34px minmax(0, 1fr) 280px`
grid-template-areas: `topbar topbar topbar topbar / left spine canvas right`

Left page: 手绘目录（待办 / 日志）+ 工具按钮 + 图层 + 回形针；right page: 色卡 + 纹理 + 属性便签。整本书体 `max-width 1560px` 居中于桌面背景。

## Components

| Component | Style | Notes |
|---|---|---|
| Topbar | 裁纸边条（paper）+ 骑在中缝上的朱红胶带；右侧导出「已装订」朱红图章 | 含品牌 + 文件操作 + 导出 |
| Tool btn | 手绘描线圆角按钮（6px），选中态苔绿勾线 + 纸面内填 | 6 工具：选择 / 描摹 / 取色 / 移动 / 缩放 / 旋转 |
| Spine | 34px 中缝，装订虚线 + 双页内阴影 | 分隔目录页与拼贴页 |
| Paper strip（胶带） | `--tape` 半透明 + clip-path 锯齿端 + 透光边缘，微旋转 | 标注、选中强调、撕边 |
| Sticky note（便利贴） | `--note` 底 + 右上折角（border 三角折痕），文字 `--ink` | 色板 / 属性 / 便签待办 |
| Torn paper（撕边票根） | `--paper-2` + clip-path 多边形撕边 + drop-shadow | 图层条目、贴纸载体 |
| Sticker | `--sticker` 淡紫，`feDisplacementMap` 毛边 | 装饰贴纸 |
| Color chip | 32×32 便利贴小卡，选中态苔绿勾线 + scale 1.05 | 选中态可点 |
| Texture tile | 60×60 撕边纸卡，平铺 SVG 纹理 | 选中态苔绿描边 |
| Prop slider | 圆点 16px，轨道 4px，色 moss | 数值实时显示 |
| Handwritten annotation | `Liu Jian Mao Cao` 批注 + 手绘 SVG 箭头 / 圈注 / 虚线 | 工具操作写成手帐叙事 |
| Stamp | 朱红图章（`--tape`），导出 / 装订完成盖戳，轻微 rotate | 反馈性微交互 |

## Motion

- 默认过渡: 220ms custom easing（`--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`）
- 纸片 / 胶带浮起: `--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)`（纸张弹性）
- 工具按钮 / 色块 / 磁贴: hover scale 1.05;active 0.94
- 主标题逐字浮现 + 朱红手绘下划线 `stroke-dashoffset` 后置描线;图章盖戳动画
- prefers-reduced-motion: 全部降级为瞬时切换，逐字 / 描线 / 图章动效关闭，字符直接显示

## Texture overlay

纸页颗粒：双层 SVG `feTurbulence` 噪点 data-URI（`mix-blend-mode: multiply`）铺整本——高频颗粒 + 低频絮理，opacity ≤ 0.05，贴合「触摸纸面」心智。主画布不强制，顶栏 + 右栏可加轻噪声。

## Anti-patterns explicitly avoided

- 不用 SaaS 圆角卡片 + 阴影的「UI 卡片」堆砌——信息架构零卡片，全靠胶带 / 便利贴 / 手写 / 圈注承载
- 不用玻璃拟态（blur + 半透明）
- 不用渐变文字
- 不用 side-stripe 彩色边框
- 不用 emoji 装饰（用 SVG 手绘涂鸦替代）
- 不用 SaaS 蓝灰白
- 不用 AI 默认 cream/sand（L 0.84-0.97, C < 0.06, hue 40-100）——纸面色相明确给到 85hue，不再「假装手作」
- 不用 hero metric + 编号 kicker
- 不用侧栏右上角「齿轮设置」图标群（放进统一的偏好便签）
- 动效不用裸 `linear` easing
