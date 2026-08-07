# 01 纸间桌面 PAPER DESK

**概念一句话**：把 pasteup 画布变成一张真实的三维纸桌——纸片像真彩纸一样立在暖木桌上，有厚度、有光照、有投影，左栏是一格格的文具盒。

## 技法清单

| 技法 | 应用点 |
| --- | --- |
| Three.js r160 实时 3D 场景 | 木桌 + 背景纸墙 + 纸片 + 文具道具 |
| 定向光 + 环境光真实投影 | 斜向主光 `shadow.intensity=0.5` 软投影；半球光 + 正面补光 + 聚光灯光池 |
| 纸片厚度挤出 `ExtrudeGeometry` | 有机轮廓挤出 0.14–0.2 厚度，bevel 收边；侧面材质 0.45x 加深，厚度可见 |
| 鼠标视差 | 相机随指针缓动（lerp），桌面产生景深 |
| gsap `CustomEase` 自定义缓动 | `paperSettle` 落桌带轻微过冲 / `paperLift` 拿起 / `woodGlide` 相机 |
| Canvas 程序纹理 | 木纹（条状 grain + 结节 + 纤维）、纸面纤维、水彩晕染、亚麻交织、底图素描 |
| 3D 选中浮签 | 图层名从 UI 投影到 3D 空间，跟随选中纸片移动 |
| 拖动拿纸交互 | 拖纸片 → 抬升 0.52 + 微倾 + 跟随指针（`gsap.quickTo`）；松手 → 弹性落桌 |

## 关键构建决策

- **相机与厚度**：核心 prove 是"纸有厚度"。初版相机几乎垂直俯视，纸片侧边不可见。改为 `(0, 5.1, 8.8)` 斜俯 + 纸片前移（z≈1.1）+ 厚度加到 0.2 + 侧面材质加深到 0.45x + bevel 缩小，侧边带终于在截图中清晰可辨。
- **投影浓度**：初版阴影近黑（`56,18,5`），像黑窟窿。用 `shadow.intensity = 0.5` + 提高半球光，得到柔和的真实纸影。
- **画面层次**：桌面填满画布会显得单调。顶部留一条纸墙背景条（约 12%），中间是奶油色底图照片，前景两片纸 + 和纸胶带 + 铅笔 + 高光纸屑，形成三层景深。
- **一个隐蔽 bug**：`.webgl-fallback` 的 `display: grid` 覆盖了 `hidden` 属性，导致 fallback 盖住整个 3D 画布（截图全是 `#F3E7D0`）。加全局 `[hidden]{display:none!important}` 修复。这是本轮最关键的排查成果。
- **缓动立场**：`--ease-snap: cubic-bezier(0.34, 1.3, 0.5, 1)` 是刻意的纸感微过冲（悬停上浮 1–2px 的"纸片弹起"），幅度极小，服务于"实物纸"隐喻，非呆板弹跳。
- **可访问性**：语义化 landmark、对比度 ≥4.5:1（墨褐/暖纸 ≈9:1，次级文本 ≈5.2:1）、`prefers-reduced-motion` 关闭视差/入场/抬升动画、WebGL 不可用时显示文字回退。
- **响应式**：≤700px 隐藏左右栏，画布全屏 + 底部移动工具条（工具 + 色点），390px 不塌。

## 截图路径

- `shots/desktop-top.png` — 1440×900 完整桌面（3D 纸桌主视图）
- `shots/mobile-top.png` — 390×844 移动端
- 由发布根 harness `tools/shot.js` 生成（含 console errors 校验，交付时零 error）

## 技术约定

纯静态：`index.html` + `styles.css` + `script.js`，three.js r160 / gsap 3.12.5 / CustomEase 走 CDN，Google Fonts 加载 Caveat / Nunito / ZCOOL KuaiLe。本地运行：`uv run --no-project python -m http.server 8411 --directory .`
