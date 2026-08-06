# 纹理缩放/旋转走预烘焙（合成时应用到最终位图），pattern 不使用 patternTransform

pasteup 纸片用位图纹理做 pattern 填充（灰度明度层 × 用户色 → 单图 dataURL，wayfinder #9）。纹理自身的缩放/旋转若用 fabric `patternTransform` 表达，fabric v7 `toSVG()` 会丢弃它（fabricjs/fabric.js#5996，open 已 6 年），导出 SVG 会丢纹理变换。决定：纹理缩放/旋转在合成时烘焙进最终位图，pattern 完全不设 transform——运行时与导出共用同一数据源，导出天然正确；同时导出时把 `<pattern>` 收进 `<defs>` 兼容严格渲染器（Inkscape/librsvg）。

## Status

accepted（wayfinder #12，2026-08-06）

## Considered Options

- **patternTransform（SVG 标准属性）**：Illustrator/Inkscape 矢量 pattern 的做法，Chrome/Firefox/Safari/librsvg 全支持。但对 pasteup 的**位图**纹理不适用——位图放大在任何方案下都插值，「矢量无损」是伪优势；且 fabric toSVG 不导出（#5996 open 6 年），导出时 post-process 注入 matrix 实测「恢复大部分但非像素级一致」（wayfinder #2：scale(2) 画布边缘密度 101/k vs 补丁 128/k）。
- **导出时烘焙**：运行时用 patternTransform + 导出时才合成位图。多一条运行时/导出双路径，需保证二者一致，相比运行时预烘焙无收益。

## Consequences

- 纹理属性变化（颜色/缩放/旋转）触发重合成：1024²≈0.17ms、2048²≈0.68ms（M4），可接受。
- 旋转限 90° 增量（0/90/180/270，任意角度 pattern 平铺物理不连续）；缩放 50%–200%（放大接受位图重采样糊）。
- 缓存 key 扩为 `texId:color:scale:rotate`，延续 LRU/活跃元素策略（#9）。
- 合成位图尺寸 = 1024×scale（50%→512²、200%→2048²），封顶 2048²。
- 导出侧：pattern 无 transform，`toSVG()` 输出天然正确；需 post-process 把 `<pattern>` 收进 `<defs>`。
