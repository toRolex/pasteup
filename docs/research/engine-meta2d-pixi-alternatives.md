# 渲染引擎选型调研：手帐/剪纸拼贴编辑器

> 调研日期：2026-08-03
> 背景：Tauri + React + TypeScript 桌面绘图 app。用户上传照片作底图 → 在照片上描摹自由闭合路径 → 生成"纸片"元素。
> 纸片硬需求：① 任意 path 形状 ② 图案/纹理填充（纸纹理位图、程序着色）③ 图层 z 序 ④ 拖拽/旋转/缩放变换 + 命中测试 ⑤ 项目序列化（JSON 自动保存）⑥ 导出 PNG + SVG（SVG 中纹理可嵌入）。
> 元素量：每页几十个元素（远不到千级）。
> 一手来源：npm registry、GitHub API、官方文档（均已标注 URL）。

---

## 结论速览（TL;DR）

- **Meta2d.js** 与 **Pixi.js** 都不适合做"手帐纸片编辑器"的底座：Meta2d 是"节点+连线"的组态/图编辑引擎，抽象层级不对；Pixi 是底层 WebGL 渲染引擎，没有任何编辑器能力，在几十个元素的量级下纯属杀鸡用牛刀。
- **没有比 Fabric.js / Konva.js 更契合的一站式方案**。Fabric.js（v7，TypeScript 重写、活跃）几乎逐条命中 6 项硬需求，是最合适的主选；react-konva 是强次选（React 声明式），唯一硬伤是 Konva 10.x 已移除 `toSVG`，SVG 导出需自建。
- 其余候选要么是渲染库不自带编辑器（Paper.js / SVG.js / Two.js / Pixi），要么是完整编辑器但许可证或定制成本高（tldraw / Excalidraw），无法在"契合度 + 工程量 + 许可"三角上同时胜过 Fabric/Konva。

---

# 部分 A：两个库的定位确认

## A1. Meta2d.js（包名 @meta2d/core）

### 事实（一手来源）

| 项 | 内容 |
|---|---|
| npm | `@meta2d/core`，latest `1.1.28`，MIT，133 个版本，创建 2022-12，最近修改 2026-07-17；`@le5le/meta2d` 在 npm 上 **404 不存在**（`curl https://registry.npmjs.org/@le5le/meta2d` 返回 HTTP 404） |
| GitHub | `le5le-com/meta2d.js`（npm 的 repository 字段指向这里），**1,224 stars** / 305 forks，MIT，TypeScript，最近 push 2026-07-30 |
| 官方定位 | README 原文："real-time data exchange and interactive web 2D engine. Developers are able to build Web SCADA, IoT, Digital twins…"（https://github.com/le5le-com/meta2d.js ） |
| 官方宣传点 | Data-driven view / Rich interactive events / Subscribe message / Animation / Real-time data monitoring / Video play / Extensible（README） |
| 能力描述 | README.CN 提到：支持 SVG PATH、钢笔和曲线工具、自由涂鸦、任意封闭图形可当进度条、可支撑 1 万+ 节点（https://github.com/le5le-com/meta2d.js/blob/main/README.CN.md ）；官方文档中心定位是"介于图表编辑器与自由图形编辑器之间，主体是节点（Node）+ 连线（Line/Edge）模型"（https://doc.le5le.com/document/136 ） |

### 定位判断

Meta2d 本质是**面向 Web SCADA / IoT / 数字孪生 / 组态的"节点 + 连线"图编辑引擎**。它的核心对象是 node / line / diagram，数据驱动、订阅、动效、视频播放这些能力都服务于"实时数据可视化"场景。它确实技术性地支持 path/polygon/polyline 与 image/渐变填充，但这些是**图元的一种样式**，不是"自由纸片"的一等公民。

### 对"手帐纸片"的适配评估

- 任意 path：支持（含 SVG path 导入、贝塞尔/折线/闭合），OK。
- 纹理填充：支持 image 填充，但"用纸纹理位图 + 程序着色 + 每片独立 pattern transform"不是其常用工作流，需深挖文档确认。
- 图层/变换/序列化/撤销：都有（序列化为其 JSON 模型），但都绑定在它自己的节点模型与 `save()/open()` 体系上。
- 导出：官方主打导出 JSON/图片；**SVG 导出不是一等能力**，未在 README 中承诺。

### gap（为什么不适合）

1. **抽象层级错位**：它是"图/组态编辑器"，交互模型（连线、端口、数据绑定、动画）对"在照片上描一圈、变一张纸片"是负资产，大量能力用不上、还要绕开。
2. **深度定制成本**：它是一个体量很大的既有引擎（自有事件/动画/序列化体系），把"纸质感渲染、纹理着色、描摹交互"磨合成我们的产品，等于在跟框架打架。国内团队（乐吾乐）主导，文档以中文为主。
3. **SVG 导出缺口**：需求 ⑥ 要求纹理可嵌入的 SVG 导出，Meta2d 无可靠承诺。
4. **星标/生态**：1.2k stars，体量小，社区薄。

### 结论

**Meta2d.js 不适合**。它是"组态/流程图编辑器"的定位，不是通用自由图形编辑器；即便技术上能画 path + 填图，其设计中心（节点-连线-数据绑定）与"手帐纸片"的需求中心（有机形状 + 纹理质感）不匹配，且 SVG 导出不满足需求。

---

## A2. Pixi.js

### 事实（一手来源）

| 项 | 内容 |
|---|---|
| npm | `pixi.js`，latest `8.19.0`，MIT，756 个版本，创建 2014，最近修改 2026-07-13 |
| GitHub | `pixijs/pixijs`，**47.9k stars**，MIT，TypeScript，最近 push 2026-07-19；topics 明确是 `rendering-engine`、`webgl`、`webgpu`（https://api.github.com/repos/pixijs/pixijs ） |
| 官方定位 | 官网标语："The HTML5 Creation Engine … the fastest 2D WebGPU/WebGL renderer"；页面没有任何"编辑器"相关表述（https://pixijs.com/ ） |

### 定位判断

Pixi 是**底层渲染引擎**，不是编辑器。它提供：场景图（Container/DisplayObject）、Graphics（任意 path 形状）、v8 起 Graphics 支持 `fill({ texture })` 纹理填充、事件与命中测试（`eventMode` + `hitArea`/`containsPoint`）、渲染导出（`app.renderer.extract` 出 PNG）。**没有**对象选择框/变换手柄（gizmo）、没有项目序列化 schema、没有 SVG 导出。

### 要自建多少东西（对照 6 项硬需求）

| 需求 | Pixi 现状 | 需自建 |
|---|---|---|
| ① 任意 path | Graphics 画 path，OK | 路径编辑（点/手柄编辑） |
| ② 纹理填充 | v8 fill({texture}) 可填纹理 | 纹理着色/着色器、pattern 变换参数 |
| ③ 图层 z 序 | 场景图排序，OK | 图层管理 UI |
| ④ 拖拽/旋转/缩放 + 命中 | 有 eventMode/containsPoint | 完整的选择 + 变换手柄 + 命中策略 |
| ⑤ JSON 序列化 | 无 | 自建项目模型与序列化 |
| ⑥ 导出 PNG+SVG | PNG 容易 | **SVG 完全自建**（Pixi 不产 SVG） |

### gap（为什么不适合）

- 几十个元素用 WebGL 是过度设计；Canvas2D 方案（Fabric/Konva）在此量级下渲染与命中性能毫无压力。
- 编辑器的一切（选择、手柄、序列化、SVG 导出）都要从零写，工程量远超直接基于 Fabric 的增量工作。
- 唯一加分项是**着色器级纸纹质感**（颗粒、边缘光），但为这个接受全套自建编辑器不划算。

### 结论

**Pixi.js 不适合作为本项目的编辑器底座**。它是渲染引擎，不是编辑器；除非明确要"shader 级纸纹质感 + 放弃现成编辑能力"并愿意投入大量自建，否则应排除。

---

# 部分 B：候选调研（与更优选择）

先给一张总览表（字段为本次 curl/GitHub API/官方文档核实）：

| 候选 | 定位 | 最后发布/活跃 | TS | 图案填充 | 图层 | 序列化 | SVG 导出 | 许可证 |
|---|---|---|---|---|---|---|---|---|
| **Fabric.js**（基准） | Canvas 对象模型编辑器 | v7.4.0 / 2026-05 活跃 | ✅ v6+ | ✅ fabric.Pattern + `toSVG()` | ✅ 对象序 + moveTo | ✅ toJSON/toObject | ✅ canvas.toSVG（含 pattern） | MIT |
| **react-konva / Konva**（基准） | Canvas 2D 交互框架 | konva 10.3.0 / 2026-04 活跃 | ✅ | ✅ fillPatternImage（offset/scale/rotation/repeat） | ✅ Layer + zIndex | ⚠️ toJSON（**不含 image/事件**） | ❌ **v10 已无 toSVG** | MIT |
| **Paper.js** | 矢量路径脚本库 | 0.12.18 / 2024-07（低活跃） | ❌ JS | ❌ 仅 fillColor/Gradient | ✅ 场景图层 | ✅ exportJSON/importJSON | ✅ exportSVG/importSVG | MIT |
| **SVG.js** | SVG DOM 操作库 | 3.2.7 / 2026-07 活跃 | ⚠️ 类型有限 | ✅ 原生 SVG `<pattern>` | ✅ toFront/toBack | ❌ 无（本身即 SVG） | ✅ 天然 SVG | MIT |
| **tldraw** | 完整白板编辑器 SDK | 5.2.5 / 2026-07 活跃 | ✅ | 自定义 shape 可实现 | ✅ | ✅ snapshots | ⚠️ 自渲染 | ⚠️ **source-available，生产需 license key** |
| **Excalidraw** | 可嵌入白板组件 | 0.18.1 / 2026-07 活跃 | ✅ | ❌ 非重点 | ✅ | ✅ scene | ✅ 有导出 | MIT |
| **Two.js** | 渲染器无关 2D 绘图 API | 0.8.23 / 2025-12（稀疏） | ❌ JS | ⚠️ 仅 WebGL 纹理 | ⚠️ 靠顺序 | ❌ | ✅ toSVG | MIT |
| **Sketch.js** | 老矢量绘图库 | 2011–2013，弃维护 | ❌ | ❌ | ❌ | ❌ | ❌ | — |
| **AntV X6** | 图/流程图编辑（节点+边） | 3.1.7 / 2026-06 | ✅ | — | ✅ | ✅ | ⚠️ | MIT |

---

## B1. Paper.js

### 事实
- npm：`paper` 0.12.18，MIT，**2024-07 最后发布，已进入低活跃/维护模式**（https://registry.npmjs.org/paper ）。
- GitHub：`paperjs/paper.js`，15.1k stars，JavaScript，最近 push 2024-07（https://api.github.com/repos/paperjs/paper.js ）。
- 官方定位："The Swiss Army Knife of Vector Graphics Scripting"（http://paperjs.org/about/ ）。
- 参考文档确认：`PathItem.hitTest(point)` / `hitTestAll` / `contains(point)`、`clipMask`、`exportSVG()`、`importSVG()`、`exportJSON()` / `importJSON()`；填充仅有 `fillColor`（纯色）与 Gradient（渐变），**无 Pattern 图案填充**（https://paperjs.org/reference/pathitem/ ）。

### 适配评估
- 矢量路径几何是它最强项：贝塞尔、smooth/simplify、命中测试（hitTest）、复合路径、遮罩——做"描摹路径 + 命中"非常顺。
- 有图层（项目场景树）、JSON 序列化、SVG 双向导入导出，都是现成的。

### gap
- **无原生图案/纹理填充**：需求 ② 只能用"Raster + clipMask"方案实现（把纹理位图裁剪到路径内），每片的 pattern transform、程序着色都要自写。
- **不是编辑器**：没有选择框、变换手柄、撤销栈、控制点交互，这些"编辑 UX"全部自建，工程量接近 Fabric 的差距。
- JS 非 TS；维护停滞（一年以上无发布）。

### 结论
作为**独立的编辑器底座**不如 Fabric；但它是最强的**矢量几何辅助层**，适合在 Fabric/Konva 之上做路径平滑/简化/布尔运算。不建议单独选它。

---

## B2. SVG.js

### 事实
- npm：`@svgdotjs/svg.js` 3.2.7，MIT，**活跃**（2026-07 修改）（https://registry.npmjs.org/@svgdotjs/svg.js ）。
- GitHub：`svgdotjs/svg.js`，11.8k stars，JavaScript，最近 push 2026-07（https://api.github.com/repos/svgdotjs/svg.js ）。
- 定位："The lightweight library for manipulating and animating SVG"（https://svgdotjs.com/ ）。

### 适配评估
- 直接操作 SVG DOM：`path()` 画任意 path、**原生 `<pattern>` 图案填充**（纹理天然在 SVG 里）、`toFront()/toBack()` 管图层、transform 现成。
- **导出 SVG 是零成本**（本身就是 SVG），需求 ⑥ 的"纹理可嵌入 SVG"最容易满足。

### gap
- 不是编辑器：命中测试只有基础 API，没有选择框、变换手柄、撤销、项目级 JSON 模型——所有交互都要自建。
- 每个纸片 + 每个图案 tile 都是 DOM/SVG 节点，几十个元素 + 每片多 tile 时在 WebView 里要注意性能（虽不至崩，但不如 Canvas 稳定）。
- TS 类型覆盖一般（库主体是 JS）。

### 结论
若最终决策是"SVG 优先、编辑能力自建"，SVG.js 是轻量选择；但对"描摹 → 纸片"的交互编辑，仍要写大量编辑器代码。**契合度不如 Fabric。**

---

## B3. tldraw

### 事实
- npm：`tldraw` 5.2.5，许可证字段 `"SEE LICENSE IN LICENSE.md"`（非 MIT/OSI），3389 个版本（monorepo 全量计数），活跃（2026-07-31）（https://registry.npmjs.org/tldraw ）。
- GitHub：`tldraw/tldraw`，**49.5k stars**，TypeScript，最近 push 2026-08-01（https://api.github.com/repos/tldraw/tldraw ）。
- 许可证（官方文档 https://tldraw.dev/community/license + 仓库 LICENSE.md）：
  - **source-available，非 permissive 开源**；默认只允许"开发环境"使用。
  - **生产环境必须取得 license key**：试用 100 天（每商业主体一次）、商业许可（联系销售，有小团队 startup pricing）、业余许可（非商业 + "made with tldraw" 水印）。
  - 无 key 时 SDK **无法在生产环境运行**（客户端校验 key，可离线、可公开）。
  - 官方原文："it is not permissively licensed"。
- 能力：React 生态、无限画布、自定义 shape 系统、工具/手势、图层、snapshots（序列化）、自渲染 shape。

### 适配评估
- 它确实是"完整编辑器开箱即用"，自定义 shape 系统可以在其上面实现"纸片"形状（含自定义渲染的纹理填充）。
- 对"手帐纸片"的深度定制成本：要学它的 shape 定义 + 工具状态机，把描摹/照片底图/纸纹质感做成自定义 shape 与自定义工具——可行，但不是小活。

### gap
- **许可证是硬伤**：本项目是分发到终端用户的商业桌面 app，属于"生产环境"，必须走商业许可 / license key，与开源团队节奏绑定，有合规风险。
- SDK 体量大、抽象重：对"每页几十个元素 + 极致的纸片质感"是重武器，升级/版本 churn 也是成本。
- 纹理质感仍要自写渲染（它不提供"纸纹理着色"现成能力）。

### 结论
若只是想要"现成白板 + 能接受商业许可"，tldraw 可用；但对一个需要深度定制"纸片质感"、且要控制许可证风险的产品，**许可证与定制成本让它不如 Fabric/Konva**。

---

## B4. react-konva / Konva

### 事实
- npm：`konva` 10.3.0、`react-konva` 19.2.5，均 MIT，活跃（2026-04 / 2026-06）（https://registry.npmjs.org/konva ）。
- GitHub：`konvajs/konva` 14.7k stars（TS）、`konvajs/react-konva` 6.4k stars（TS）（https://api.github.com/repos/konvajs/konva ）。
- 能力（官方文档 https://konvajs.org/ ）：
  - **图案填充**：`fillPatternImage` + `fillPatternOffset/Scale/Rotation/Repeat`，直接命中需求 ②（https://konvajs.org/docs/styling/Fill.html ）。
  - **变换**：`Transformer` 提供拖拽/旋转/缩放手柄；Layers + `zIndex` 管图层。
  - **序列化**：`stage.toJSON()`，但官方文档明示 **"event handlers and images are not serializable"**（https://konvajs.org/docs/data_and_serialization/Serialize_a_Stage.html ）。
  - **导出**：`stage.toDataURL()/toImage()`（PNG/JPEG，支持 pixelRatio）。**在 v10 源码与 API 文档中均已无 `toSVG`**（已核对 npm 包 konva-10.3.0 源码与 site API 文档，均无 toSVG）。

### 适配评估
- 需求 ①~⑤ 覆盖得很好；React 声明式写法（react-konva）在 React 项目里很顺手；PatternBrush 可画带纹理的自由描边。
- 需求 ⑥ PNG 满足；**SVG 导出完全缺失**——这是唯一、但致命的硬伤。

### gap
- **无 SVG 导出**：需求 ⑥ 要求"SVG 中纹理可嵌入"，Konva 10.x 没有任何 toSVG，需要自建一个"Konva 场景 → SVG 字符串"的导出器（path data 好办，pattern + 变换要自己生成 `<pattern>`/`<image>` 节点），工作量中等偏上。
- 序列化不含 image/事件：纹理图引用需要自定义 schema（这也符合实际——本来就要设计项目模型）。

### 结论
**强次选**。若团队偏好 React 声明式、且愿意为 SVG 导出自建一层，react-konva 是不错的底座；否则主选 Fabric。

---

## B5. Two.js

### 事实
- npm：`two.js` 0.8.23，MIT，2025-12 有修改但发布稀疏（https://registry.npmjs.org/two.js ）。
- GitHub：`jonobr1/two.js`，8.6k stars，JavaScript（https://api.github.com/repos/jonobr1/two.js ）。
- 定位："A renderer agnostic two-dimensional drawing api for the web"（SVG/Canvas/WebGL 三后端）。

### 适配评估
- 有 Path/Polygon、`toSVG()` 导出；WebGL 后端支持纹理贴图。
- 面向**动效/图形编程**，不是编辑器。

### gap
- 无选择/变换手柄、无撤销、无命中测试套件、无项目序列化 schema；JS 非 TS；活跃度低。

### 结论
不适合做编辑器底座。可忽略。

---

## B6. Sketch.js

### 事实
- `@shakacode/sketchjs` 在 npm 上不存在；`sketchjs` 为空包；`sketch.js`（npm）是 leMaik 的 **jQuery 画板插件**，与矢量编辑无关（https://registry.npmjs.org/sketch.js ）。
- 经典矢量 Sketch.js（soulwire/Sketch.js）为 2011–2013 老项目，已弃维护。

### 结论
**排除**。

---

## B7. 其他值得一提的候选/辅助库

| 库 | 事实 | 评估 |
|---|---|---|
| **Excalidraw**（`@excalidraw/excalidraw`） | MIT，0.18.1，活跃，128.8k stars，TS，可嵌入 React 白板组件（https://registry.npmjs.org/@excalidraw/excalidraw ） | MIT 许可的"完整编辑器组件"；但它是手绘风白板，转成"照片描摹 + 纸纹拼贴"需深度定制（近似 fork），数据模型要贴合它。可作"想要现成白板 + MIT"的备选，**契合度不如 Fabric** |
| **AntV X6**（`@antv/x6`） | MIT，3.1.7，2026-06 活跃，"SVG/HTML 图编辑库"（https://registry.npmjs.org/@antv/x6 ） | 与 Meta2d 同类的节点+连线图编辑器，**不契合** |
| **@pixi/react** | MIT，8.0.5，2025-12（https://registry.npmjs.org/@pixi/react ） | 仅当走 Pixi 路线才有意义；结论同 A2 |
| **perfect-freehand** | MIT，1.2.3，活跃，tldraw 同款压感笔迹平滑（https://registry.npmjs.org/perfect-freehand ） | 非编辑器，是**辅助库**：无论选 Fabric/Konva，都推荐用它做描摹笔迹的平滑，显著提升"手工感" |
| **rough.js** | MIT，4.6.6，2023-11 后休眠（https://registry.npmjs.org/roughjs ） | 手绘风渲染，可给"纸片边缘"增加手作质感；可选辅助 |

---

# 最终判断：有没有比 Fabric.js / Konva.js 更契合"手帐纸片编辑器"的方案？

**结论：没有。Fabric.js 是目前最契合的一站式方案，react-konva 是强次选；其余候选无法同时胜过它在"需求命中 + 工程量 + 许可"上的综合表现。**

理由（对照 6 项硬需求做需求映射）：

| 需求 | Fabric.js v7（主选） | Konva 10 / react-konva（次选） |
|---|---|---|
| ① 任意 path | ✅ fabric.Path（任意 SVG path data） | ✅ Konva.Path |
| ② 图案/纹理填充 | ✅ fabric.Pattern（位图 source + 变换矩阵，可用 filters 程序着色） | ✅ fillPatternImage + offset/scale/rotation/repeat |
| ③ 图层 z 序 | ✅ 对象数组序 + moveTo/bringToFront | ✅ Layer + zIndex |
| ④ 变换 + 命中 | ✅ 内置 controls（拖/旋/缩）+ containsPoint | ✅ Transformer 手柄 + containsPoint |
| ⑤ JSON 序列化 | ✅ toJSON/toObject（可自定义 schema） | ⚠️ toJSON 不含 image/事件（需自定义 schema） |
| ⑥ 导出 PNG+SVG | ✅ `canvas.toSVG()` **含 pattern 元素** + toDataURL 出 PNG | ❌ **v10 无 toSVG**，SVG 需自建；PNG ✅ |

- **为什么不是 Paper.js / SVG.js / Two.js / Pixi**：它们都是"渲染/几何库"，缺少"编辑器"这一层（选择框、变换手柄、撤销、命中交互、序列化 schema），等于把 Fabric 已解决的部分重新造一遍。
- **为什么不是 tldraw / Excalidraw**：它们是"完整编辑器"，能省编辑器工作量，但 tldraw 生产环境需要商业 license key（与开源发布节奏绑定、有合规风险）；Excalidraw 是 MIT 但把它改成"照片描摹 + 纸纹拼贴"的定制成本接近重写，且两者都不提供现成的"纸纹理着色"质感。
- **为什么不是 Meta2d**：组态/图编辑引擎，抽象层级错位，见 A1。

### 具体建议
1. **主选 Fabric.js v7**（TypeScript、ESM、活跃、MIT）。在其上：
   - 用 `fabric.Pattern` + Fabric filters（tint / ColorMatrix）实现"纸纹理位图 + 程序着色"；
   - 用 `canvas.toSVG()` 满足纹理可嵌入的 SVG 导出（自研项目，风险点是 pattern 变换保真度，需在原型阶段验证一张纸片 + 一个 pattern 的 SVG 导出效果）；
   - 用 perfect-freehand 做描摹笔迹平滑，`fabric.Path` 承载最终闭合路径；
   - 序列化基于 `toObject()` 自定义 schema（存 texture id + path data + transform + zIndex）。
2. **次选 react-konva**：如果团队强烈偏好 React 声明式，选它，但**必须自建 Konva→SVG 导出层**（path data 可直接转 `<path>`；pattern 需自行生成 `<pattern>`+`<image>`），并在立项时把这项列为明确工期。
3. **Pixi 只在一种情况下回归**：确认要"shader 级纸纹质感（颗粒、边缘光、纤维），且接受自建整套编辑器"。以几十个元素的量级，不推荐为此买单。

### 待验证风险（建议用最小原型验证）
- Fabric `canvas.toSVG()` 对 **pattern + 图案变换** 的保真度（是否还原 offset/scale/rotation，SVG 中 `<pattern>` 是否正确内嵌位图）。
- Fabric `containsPoint` 对**复杂闭合 path** 命中测试的准确度（不规则纸片边缘）。
- 纸纹理着色的性能：每片一个 pattern + filter，几十片在同一 canvas 上的渲染开销。
- 序列化自动保存：Fabric 的 `toObject` 对自定义属性的保留（需在 schema 层显式声明）。
