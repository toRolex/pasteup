# 渲染引擎选型调研：Fabric.js / Konva.js / Leafer.js

> 调研背景：Tauri + React + TypeScript 桌面"手帐/剪纸拼贴"绘图 app。
> 核心需求：任意 path 纸片元素、纸纹理位图填充（程序着色）、图层 z 序、拖拽/旋转/缩放与命中测试、JSON 自动保存、PNG + SVG 导出（SVG 中纹理可嵌入）。
> 调研日期：2026-08-03。所有事实均来自一手资料（npm registry / GitHub API / 官方文档 / 官方源码），非二次转述。

---

## 一、Fabric.js

### 1.1 核实到的事实

| 项目 | 事实 | 来源 |
|---|---|---|
| 当前版本 | 7.4.0（2026-05-18 发布） | https://registry.npmjs.org/fabric |
| 发布活跃度 | 近半年持续发版（6.9.1→7.0.0→7.4.0）；GitHub pushed_at=2026-07-31，维护非常活跃 | https://registry.npmjs.org/fabric / https://api.github.com/repos/fabricjs/fabric.js |
| Stars / 成熟度 | 31.4k stars，2010 年创建，最老牌；461 个 open issues（社区大） | https://api.github.com/repos/fabricjs/fabric.js |
| 许可证 | MIT（npm 与 GitHub 一致，商用无碍） | https://registry.npmjs.org/fabric |
| TypeScript | v6 起 TS-first，内置类型 `./dist/index.d.ts`，无需 @types 包 | https://registry.npmjs.org/fabric（latest 版本 types 字段） |
| 对象模型 | 任意 path：`fabric.Path`（API `/api/classes/path/`）；图案填充：`fabric.Pattern`（source + repeat + offset + patternTransform）；z 序：对象 `zIndex` + `sendToBack()/bringToFront()` 等 | https://fabricjs.com/api/classes/path/ / https://fabricjs.com/api/classes/pattern/ |
| 序列化 | `canvas.toJSON()` / `canvas.loadFromJSON()`，覆盖 Path 与 Pattern | https://fabricjs.com/api/classes/staticcanvas/ |
| 导出 PNG | `toDataURL()` / `toCanvasElement()` / `toBlob()` | https://fabricjs.com/api/classes/staticcanvas/ |
| 导出 SVG | `toSVG()`，pattern 经 `createSVGRefElementsMarkup()` 写入 `<defs>` | https://fabricjs.com/api/classes/staticcanvas/ |
| React 集成 | **无官方绑定**；社区 `react-fabricjs` 为 2016 年包（0.1.6），已死 | https://registry.npmjs.org/react-fabricjs |

**SVG 导出对 pattern/位图填充的精确行为（源码级核实）**

Fabric 的 `Pattern.toSVG()` 生成 `<pattern id="SVGID_x">`，内嵌 `<image xlink:href="${escapeXml(this.sourceToString())}">`（`packages/core/src/Pattern/Pattern.ts` 第 167-190 行）。

`sourceToString()` 的关键逻辑（同文件第 113-119 行）：
- source 是 `<img>` → 返回 **`this.source.src`（原始 URL 字符串）**
- source 是 `<canvas>` → 返回 `toDataURL()`（base64）

结论：**当纸纹理以 `<img>`（URL/blob/file）形式作为 pattern source 时，导出的 SVG 引用的是外部 URL，不是自包含的 base64**；只有当 source 为 canvas 时才内嵌 base64。要做"SVG 纹理可嵌入"，需在导出前把纹理源转成 canvas 或 dataURL。

序列化同理：`Pattern.toObject()` 里 `source` 字段 = `sourceToString()`，即 `img` 存 URL、`canvas` 存 dataURL；`Pattern.fromObject()` 通过 `loadImage(source)` 重新拉取。**JSON 里存的是纹理 URL 而非像素数据**。

### 1.2 对我们场景的适配评估

- 任意 path + Pattern 填充 + z 序 + 变换/命中测试：全部原生支持，成熟稳定。
- 序列化：`toJSON/loadFromJSON` 开箱即用；纸片 Path + Pattern 属性（repeat/offset/patternTransform）都能进出 JSON。
- SVG 导出：`toSVG()` 是 Fabric 的看家能力，pattern 会进 `<defs>`，纹理可内嵌（前提是导出时 source 为 canvas/dataURL）。
- 风险点集中在"纹理资产自包含"：自动保存的 JSON 若引用本地/外部 URL，换机器或应用重启后 URL 失效。需把纹理转成 dataURL 存进 JSON，或另建资产库与 JSON 一起持久化。

### 1.3 适配 gap 与风险

1. **无官方 React 绑定**（GAP）：需手动桥接——用 `useRef` 持有 `fabric.Canvas` 实例，命令式创建/更新对象，React 只管外壳与状态。可行，但样板代码多。
2. **SVG 自包含需要预处理纹理**（GAP）：导出前把每个 pattern 的 `<img>` source 替换为 canvas（`canvas.toDataURL()`）才能得到内嵌纹理的 SVG；否则 SVG 里是外部 URL 引用。
3. **JSON 自包含同理**（GAP）：自动保存需把用户上传的纸纹理统一转 dataURL 再序列化，否则 blob/file URL 无法跨会话恢复。
4. **开源 issue**：`toSVG()` 对带 `patternTransform` 的 pattern 填充有忽略/异常问题（open #5996）；`patternTransform` 进 `toSVG` 的修复 PR #9059 已合入，但 issue 仍 open，属于边缘场景（仅当用 patternTransform 做图案变换时需要盯）。https://github.com/fabricjs/fabric.js/issues/5996
5. v6/v7 大版本间有 breaking changes（v6 是 TS 重写），需锁版本；API 体量大、概念多，学习曲线中等。

---

## 二、Konva.js

### 2.1 核实到的事实

| 项目 | 事实 | 来源 |
|---|---|---|
| 当前版本 | 10.3.0（2026-04-30 发布） | https://registry.npmjs.org/konva |
| 发布活跃度 | 活跃；GitHub pushed_at=2026-07-28；open issues 仅 17（维护极整洁） | https://api.github.com/repos/konvajs/konva |
| Stars / 成熟度 | 14.7k stars，2015 年创建（前身 KineticJS） | https://api.github.com/repos/konvajs/konva |
| 许可证 | MIT（GitHub API 显示 NOASSERTION 是 license 检测异常；仓库 LICENSE 文件为 MIT） | https://github.com/konvajs/konva/blob/master/LICENSE / https://registry.npmjs.org/konva |
| TypeScript | 内置类型 `./lib/index.d.ts`，无需 @types | https://registry.npmjs.org/konva（latest 版本 types 字段） |
| 对象模型 | 任意 path：`Konva.Path`；图案填充：`fillPatternImage` + `fillPatternX/Y/Offset/Scale/Rotation/Repeat` + `fillPriority('pattern')`；z 序：`zIndex()` + `moveToTop()/moveToBottom()` | https://konvajs.org/api/Konva.Shape.html |
| 序列化 | `stage.toJSON()` / `Konva.Node.create(json)` | https://konvajs.org/docs/data_and_serialization/Serialize_a_Stage.html / https://konvajs.org/docs/data_and_serialization/Simple_Load.html |
| 导出 PNG | `stage.toDataURL()` / `toImage()`（支持 pixelRatio、mimeType、quality）；默认 pixelRatio=1 | https://konvajs.org/docs/data_and_serialization/Stage_Data_URL.html / https://konvajs.org/docs/data_and_serialization/High-Quality-Export.html |
| 导出 SVG | **无原生 SVG 导出**（toDataURL/toImage 仅栅格；文档全文无 toSVG） | https://konvajs.org/docs/data_and_serialization/High-Quality-Export.html |
| React 集成 | **官方绑定 `react-konva`**（konvajs org），v19.2.5（2026-06-09），MIT，6.4k stars，React 19 支持，活跃维护 | https://registry.npmjs.org/react-konva / https://api.github.com/repos/konvajs/react-konva |

**序列化对图案/位图填充的精确行为（源码级核实）**

`Konva.Node.toObject()`（`src/Node.ts` 第 1673-1711 行）遍历 attrs 时，对**非 plain object 的值（类实例，如 `HTMLImageElement`）直接 `continue` 跳过**。因此：
- `fillPatternImage`（一张 `HTMLImageElement`）**不会进入 JSON**；
- `Konva.Image` 的 `image` 属性同样被跳过。

官方文档也明确："event handlers and images are not serializable"（Serialize a Stage 页）。结论：**Konva 的 JSON 序列化不含图案位图数据**，加载 JSON 后需按 key 重新挂载纹理图片。

**SVG 导出的现状**：Konva 本身不提供 `toSVG`。issue #1134（"Getting SVG data"）结论是需自己生成路径数据或用 node 端 `canvas` 库导出；社区有第三方 `react-konva-to-svg`（dendrofen）做 hack，但非官方、对 pattern 填充覆盖不可控。

### 2.2 对我们场景的适配评估

- 任意 path + Pattern 填充 + z 序 + 变换/命中测试：原生支持；`Transformer` 节点提供现成的旋转/缩放手柄。
- React 集成是所有候选里最好的：官方 `react-konva`，声明式组件模型与 React 心智一致，和 Tauri + React 栈最搭。
- **硬伤：SVG 导出缺失。** 需求⑥明确要求导出 SVG 且纹理可嵌入，Konva 在这一项是 0 分。要么自己写 SVG 序列化器（工作量大、pattern/纹理处理全要自研），要么依赖不可控的第三方。
- 序列化的图案位图丢失同样是真实 gap：自动保存的 JSON 无法独立恢复纹理。

### 2.3 适配 gap 与风险

1. **无 SVG 导出**（GAP，硬阻塞）：官方能力只有栅格导出。需求⑥不满足，需自研或第三方。
2. **序列化不含图案/位图数据**（GAP）：`fillPatternImage` 被 toObject 跳过，需额外持久化纹理并手动重挂。
3. `toDataURL` 有同源限制：canvas 中外部图片需同源或 CORS，否则 SECURITY_ERR（Tauri 本地用 file/blob/dataURL 基本可控，但要注意）。
4. React 官方文档建议在 React 里"自己管状态、别把 stage 当数据源"（Serialize/Simple_Load 页均提醒反模式）——即声明式渲染与序列化两条路要分开设计。

---

## 三、Leafer.js（leafer-ui）

### 3.1 核实到的事实

| 项目 | 事实 | 来源 |
|---|---|---|
| 当前版本 | leafer-ui 2.2.9（2026-08-01 发布，昨日）；leafer 核心与 leafer-editor 同版本 | https://registry.npmjs.org/leafer-ui / https://registry.npmjs.org/leafer-editor |
| 发布活跃度 | 极活跃，2026-07 起几乎每日发版；GitHub pushed_at=2026-07-30 | https://api.github.com/repos/leaferjs/leafer-ui |
| Stars / 成熟度 | 4.3k stars，2023-03 创建（三库里最年轻） | https://api.github.com/repos/leaferjs/leafer-ui |
| 许可证 | MIT | https://registry.npmjs.org/leafer-ui / https://api.github.com/repos/leaferjs/leafer-ui |
| TypeScript | 内置类型 `types/index.d.ts` | https://registry.npmjs.org/leafer-ui（latest 版本 types 字段） |
| 对象模型 | 任意 path：`Path` 元素（`/ui/reference/display/Path.html`）；图案填充：`fill: { type: 'image', url, mode }`，`mode: 'repeat'` 平铺，含 scale/offset/rotation/gap/interlace；z 序：`zIndex` 属性；编辑器：`leafer-editor` 包提供选择/变换/历史 | https://www.leaferjs.com/ui/reference/UI/paint/image.html |
| 序列化 | `leafer.toJSON()` / `toString()`；导入用 `add(json)` / `new Leafer(opts, json)` / `set(json)`（无 fromJSON，格式即 InputData）；App 元素本身不可直接导入导出，需操作 `tree.children` | https://www.leaferjs.com/ui/reference/UI/json.html |
| 导出 PNG | `export('png' | 'jpg', { pixelRatio, blob })` / `syncExport`；支持画布截图 | https://www.leaferjs.com/ui/guide/basic/export.html |
| 导出 SVG | **无 SVG 导出**；官方在 issue 中确认"只做了一部分、比较复杂、暂时导不了" | https://github.com/leaferjs/leafer-ui/issues/301 |
| React 集成 | **无官方绑定**；社区 `leafer-react`（Dolashink，非 leaferjs 组织）v0.1.5，最后发布于 2025-01-10，已停更一年多 | https://registry.npmjs.org/leafer-react |

**导出与序列化细节核实**

- `export()` 文档只列 PNG/JPG、pixelRatio、Base64/Blob、画布截图（`{ screenshot: true }`），**全文无 SVG/WebP**。
- `toJSON()` 输出 `{ tag, x, y, width, height, fill, draggable, children }` 树；`fill` 字段会被序列化（image paint 序列化为 `{ type: 'image', url, ... }`，存 URL 字符串、不存像素）；可选 `matrix` 是否带变换矩阵。
- **SVG 导出确认缺失**：issue #301（"是否可以使用 svgcanvas 导出为 SVG？"）由作者 leaferjs 于 2024-12 关闭，回复："直接导估计是导不了的，里面有很多离屏 canvas 优化操作。svg 导出的功能我们已经做了一部分了，需要花比较多的时间，后面会继续完善"；2025-06 仍有用户追问进度，无答复。截至调研时点，Leafer 无可靠 SVG 导出。

### 3.2 对我们场景的适配评估

- 任意 path + image/pattern 填充 + z 序 + 编辑器（leafer-editor 提供选择/拖拽/旋转/缩放/历史）：原生能力很强，性能是亮点（无限画布、worker 渲染、百万元素基准）。
- 序列化：`toJSON`/`add(json)` 双向可恢复，路径+image 填充（URL 形式）都能进出。
- **硬伤：SVG 导出缺失（官方确认，阻塞需求⑥）。** 且 `leafer-ui` 的 export 插件 `@leafer-ui/export` 已停留在 1.2.2（2024-12 后不再更新，功能已并入核心）。
- React 绑定为社区包且停更，风险高。

### 3.3 适配 gap 与风险

1. **无 SVG 导出**（GAP，硬阻塞）：官方确认未完成。需求⑥不满足，需自研 SVG 序列化器（对 image 填充/path 全部手写），成本最高。
2. **React 集成不成熟**（GAP）：`leafer-react` 非官方、停更；需自研桥接或接受风险。
3. 项目年轻（2023 起），API 与生态仍在大改；中文生态为主，英文文档/社区较少。
4. `toJSON` 的 image 填充存 URL，自包含 JSON 同样需先转 dataURL 或另建资产库。

---

## 四、横向对比与结论

| 维度 | Fabric.js 7.4 | Konva.js 10.3 | Leafer.js 2.2.9 |
|---|---|---|---|
| 版本 / 活跃度 | 7.4.0，2026-05-18，活跃 | 10.3.0，2026-04-30，活跃 | 2.2.9，2026-08-01，极活跃 |
| 成熟度 | 2010 起，31k stars | 2015 起，15k stars | 2023 起，4k stars |
| 许可证（商用） | MIT | MIT | MIT |
| 内置 TS 类型 | 有 | 有 | 有 |
| 任意 path | ✅ fabric.Path | ✅ Konva.Path | ✅ Path 元素 |
| 位图/图案填充 | ✅ fabric.Pattern（repeat/offset/patternTransform） | ✅ fillPatternImage + repeat/scale/rotation | ✅ fill{type:image, mode:repeat} + scale/offset/gap |
| 图层 z 序 | ✅ zIndex + bring/send | ✅ zIndex + moveToTop/Bottom | ✅ zIndex |
| 变换/命中测试 | ✅ 内置 controls | ✅ Transformer + 内置 | ✅ leafer-editor（选择/变换/历史） |
| JSON 序列化 | ✅ toJSON/loadFromJSON（Pattern 存 URL） | ⚠️ toJSON/Node.create（**图案位图被丢弃**） | ✅ toJSON/add(json)（image 存 URL） |
| PNG 导出 | ✅ toDataURL | ✅ toDataURL/toImage（pixelRatio） | ✅ export('png'/'jpg', pixelRatio) |
| **SVG 导出** | ✅ **toSVG，pattern 进 defs，可内嵌（需 source 为 canvas/dataURL）** | ❌ **无**（第三方 hack 不可控） | ❌ **无（官方确认未完成）** |
| React 集成 | ⚠️ 无官方绑定，手动桥接 | ✅ **官方 react-konva**，React 19 | ⚠️ 社区包停更，无官方绑定 |
| 对需求⑥的满足度 | **高（SVG 导出原生，纹理内嵌可达成）** | 低（无 SVG） | 低（无 SVG） |

### 结论：Fabric.js 最契合手帐纸片场景

核心判断依据：**需求⑥（导出 PNG + SVG，且 SVG 中纹理可嵌入）是决定性分水岭。** 三库中只有 Fabric.js 把"对象模型 + JSON 序列化 + SVG 导出"作为一等公民原生提供；Konva 与 Leafer 在 SVG 导出上都是硬缺失。

- **Fabric.js**：唯一原生满足 ①任意 path ②pattern 填充 ③z 序 ④变换/命中 ⑤JSON ⑥PNG+SVG（纹理可内嵌）六项全流程的库。代价是 React 需手动桥接、纹理资产需统一转 dataURL 才能实现自包含。对"几十个元素、不追求千级性能"的手帐 app 完全够用。
- **Konva.js**：如果需求去掉 SVG 导出，它是最佳 React 体验（官方 react-konva、API 简洁、维护极干净）。但 SVG 导出是硬缺口，且序列化丢图案位图，两个需求项都要自研兜底，综合成本最高。
- **Leafer.js**：性能与编辑器能力最强、作者极活跃，但 SVG 导出被官方确认未完成、React 绑定停更，对"要交付可导出 SVG"的产品是硬阻塞，建议直接排除或列为备选观察。

### 若选 Fabric.js 的落地建议（对应上文 gap）

1. React 桥接：自写一个 `<FabricCanvas>` 壳组件（`useRef` 持 `fabric.Canvas`），React 状态与 canvas 对象单向同步，事件回调回灌 React。
2. 纹理资产管理：用户上传纸纹理后统一转 dataURL（或维持 blob 并在保存时转 dataURL）再喂给 `fabric.Pattern`，确保 JSON 与 SVG 都可自包含。
3. 导出前对 pattern source 做归一化：把 `<img>` source 的 pattern 临时替换为 canvas source 再 `toSVG()`，得到内嵌 base64 纹理的自包含 SVG。
4. 锁版本（v7.x），跟进 #5996（patternTransform 的 toSVG 边缘问题，仅在用到 patternTransform 时关注）。
