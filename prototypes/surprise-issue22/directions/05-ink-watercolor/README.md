# pasteup · 05 墨与水彩 INK & WATERCOLOR

> 视觉方向原型：把 pasteup 做成一张湿润的水彩纸——纸片边缘是活的，墨往纸里渗；换色时像重新滴了一滴颜料。

## 概念一句话

整个界面是一间湿纸画室：色卡 + 滴管 + 留白，纸片不是硬边多边形，而是带水彩晕染湿边的「湿纸片」，选中时颜色还在流动。

## 技法清单（≥3）

1. **canvas 水彩晕染算法（手写，非贴图）** — `script.js` 中 `paintPiece()`：
   - 形状边缘做**多点噪声扩散**（沿法线随机偏移 120+ 个采样点，`softCircle` 径向羽化画晕染）
   - **色边**：边缘内侧叠加 `darken(color,30)` 的浓色积线，复刻水彩「颜料在纸边积住」
   - **纸纹颗粒**：点内 240 个随机纤维噪点 + 3 层湿度明暗 wash
   - 湿/干两态：干边把扩散收窄到 10%，另画一层「纸毛」碎点
2. **SVG filter 湿边羽化** — `#wet-edge`：只位移 **alpha 通道**（`feColorMatrix` 提取 alpha → `feDisplacementMap` → `feGaussianBlur` → `feComposite in`），颜色保持原位，得到有机湿边且**不产生透明黑边**（规避了位移 SourceGraphic 时的经典暗晕 bug）
3. **滴管取色动画** — 取色工具落点画「取样涟漪」ring，同步色板高亮与 HEX 读数
4. **颜色流动缓动** — 4 条自定义 cubic-bezier（`--ease-brush / --ease-flow / --ease-drip / --ease-settle`）+ JS 侧 `E.outQuint / E.settle`；换色走 1050ms rAF 插值，teardrop 沿曲线滴落、落点溅水珠 + 涟漪
5. **留白构图** — 画布左上大面积留白 + 两处批注（「水未干，慢慢来。」「let the paper breathe」）平衡纸面呼吸感
6. **SVG 滤镜微拟物** — 导出按钮 / 选中工具 / 图层色点统一走 `#wet-edge-soft` 小位移，呼应「纸有边缘」的整体语言

## 要 prove 的一件事

**水彩的边缘是活的。** 量化证据：`review/audit.js` 对三张纸片量出核心不透明 bbox 与外层晕染 bbox 的**光晕 halo 58 / 69 / 34 px**；像素采样在叶子内部读到 (196,95,85) 的深色积线（色边），与叶身 (235,202,193) 分层。截图放大远山右缘可见 10+ 列的**羽化斜坡**而非 1 列硬切。换色触发「滴入」：teardrop 滴落 → 颜色插值 → 溅珠，undo 能退回上一滴。

## 关键构建决策

- **纸片画布留余白**：形状只占画布中央 66%（`SHAPE_SCALE`），四周留给晕染渗出，否则 canvas 会裁掉湿边。
- **环（ring）必须全局样式化**：非选中纸片的 `.ring` SVG 若不加 `opacity:0; fill:none; position:absolute`，其 `<circle>` 会落到 SVG UA 默认 `fill:black`，渲染成巨大黑块——这是本轮踩到并修掉的最大坑。
- **SVG 滤镜只动 alpha**：`feDisplacementMap` 直接位移透明 canvas 会在边缘取样到透明黑产生暗晕，改为 alpha-only 位移 + `feComposite in` 保留原色。
- **零 console errors**：交付前 `shot.js` 复跑确认 errors 为空数组；顺带用 `data:,` favicon 消掉 404。
- **可访问性**：`--ink-faint` 调至 `#756B5D`（对纸面 4.79:1 ≥4.5）；全站语义化 + aria + `prefers-reduced-motion` 关重动效。
- **响应式**：≤720px 右栏收起为色板横条，≤560px 左栏变底部工具条，`scrollW` 无横向溢出。
- **本地无图**：水彩全部程序化生成，零外部图片资产；字体走 Google Fonts（Liu Jian Mao Cao / Ma Shan Zheng / Caveat / Nunito）。

## 截图路径

`shots/`（由发布根 `tools/shot.js` 生成，1440×900 桌面 + 390×844 移动，各 top/mid/bottom）：

- `shots/desktop-top.png` — 桌面首屏：三纸片 + 湿纸背景 + 完整三栏
- `shots/desktop-mid.png` / `shots/desktop-bottom.png` — 桌面滚动段（app 单屏 900px，内容完整）
- `shots/mobile-top.png` / `shots/mobile-bottom.png` — 移动端顶栏 + 画布 + 底部工具条

## 开发自检工具

- `review/audit.js` — DOM 几何 + canvas 湿边 halo + 字体加载 + 对比度 + 移动端溢出检查
- `review/ascii.py` — 终端 ASCII 渲染截图（纸亮墨暗），供无头环境「看」图批判

## 运行

```bash
uv run --no-project python -m http.server 8451 --directory .
# 打开 http://localhost:8451/
```
