# 渲染引擎选型：最终决策报告

> 项目：手帐/剪纸拼贴绘图 app（Tauri + React + TypeScript）
> 日期：2026-08-03
> 本报告汇总两份一手调研的结论：
> - [engine-fabric-konva-leafer.md](./engine-fabric-konva-leafer.md)（Fabric / Konva / Leafer 深度核实）
> - [engine-meta2d-pixi-alternatives.md](./engine-meta2d-pixi-alternatives.md)（Meta2d / Pixi 定位确认 + 更优选择核查）
> 所有事实均来自 npm registry / GitHub API / 官方文档 / 官方源码，非二次转述。

---

## 一、结论速览

**主选：Fabric.js v7**（MIT，TS-first，活跃，31k stars）。

- 决定性分水岭是需求 **⑥ SVG 导出 + 纹理可嵌入**：三库中只有 Fabric 原生支持 `canvas.toSVG()` 把图案填充（pattern）写入 `<defs>`。
- Konva 10.x 已**移除 toSVG**、Leafer 官方确认 SVG 导出**未完成**、Meta2d/Pixi 定位不对口。
- 更优选择核查无遗漏：Paper.js / SVG.js / Two.js 缺"编辑器层"；tldraw 生产需商业 license key；Excalidraw 定制成本接近重写。

## 二、硬需求回顾

① 任意 path 形状 · ② 图案/纹理位图填充（程序着色）· ③ 图层 z 序 · ④ 拖拽/旋转/缩放 + 命中测试 · ⑤ JSON 序列化（自动保存）· ⑥ 导出 PNG + SVG（SVG 纹理可嵌入）。元素量：每页几十个。

## 三、主候选对比

| 需求 | Fabric.js 7.4 | Konva 10.3 / react-konva | Leafer 2.2.9 |
|---|---|---|---|
| ① 任意 path | ✅ fabric.Path | ✅ Konva.Path | ✅ Path 元素 |
| ② 图案/纹理填充 | ✅ fabric.Pattern（repeat/offset/patternTransform）+ filters 着色 | ✅ fillPatternImage + repeat/scale/rotation | ✅ fill{type:image} |
| ③ 图层 z 序 | ✅ zIndex + moveTo | ✅ Layer + zIndex | ✅ zIndex |
| ④ 变换/命中 | ✅ 内置 controls + containsPoint | ✅ Transformer + containsPoint | ✅ leafer-editor |
| ⑤ JSON 序列化 | ✅ toJSON/loadFromJSON | ⚠️ **图案位图被丢弃** | ✅ toJSON/add |
| ⑥ **SVG 导出** | ✅ **toSVG 含 pattern，纹理可内嵌** | ❌ **v10 无 toSVG** | ❌ **官方确认未完成** |
| React 集成 | ⚠️ 手动桥接（无官方绑定） | ✅ 官方 react-konva | ⚠️ 社区包停更 |
| 许可证 | MIT | MIT | MIT |
| 活跃度 | 活跃（2026-05 发版） | 活跃（2026-04） | 极活跃（2026-08） |

## 四、排除项

| 候选 | 定位核实 | 判定 |
|---|---|---|
| **Meta2d.js** | 官方定位"Web SCADA / IoT / 数字孪生"**节点+连线组态引擎**，非自由图形编辑器 | ❌ 抽象层级错位 |
| **Pixi.js** | 官方自述"fastest WebGPU/WebGL renderer"，**渲染引擎非编辑器**；序列化与 SVG 全自建 | ❌ 几十元素量级杀鸡用牛刀 |
| **Paper.js** | 矢量几何最强，但**无 pattern 填充**、无编辑器层、JS、2024-07 后低活跃 | ❌ 独立底座；可作几何辅助层 |
| **SVG.js** | SVG 导出天然，但无选择框/变换手柄/序列化模型，全自建 | ❌ 契合度不如 Fabric |
| **tldraw** | 完整编辑器 SDK，但 **source-available，生产环境需商业 license key**（试用 100 天 / 水印版） | ❌ 许可证合规风险 |
| **Excalidraw** | MIT 完整白板组件，但改造成"照片描摹+纸纹拼贴"接近重写 | ❌ 定制成本 |
| **AntV X6 / Two.js / Sketch.js** | 前者是节点连线图库；后者缺编辑器、低活跃；Sketch.js 已弃维护 | ❌ |

## 五、最终推荐：Fabric.js v7

理由：**唯一在"需求命中 + 工程量 + 许可"三角上全胜的一站式方案**。对象模型、pattern 填充、z 序、变换/命中、JSON 序列化、PNG+SVG 导出全部内置。

### 落地动作（已确定的实现要点）

1. **React 桥接**：自写 `<FabricCanvas>` 壳组件（`useRef` 持 `fabric.Canvas`），React 管 UI/状态，Fabric 管画布，事件回灌。
2. **纹理资产统一转 dataURL**：用户上传纸纹理后转 dataURL 再喂 `fabric.Pattern`，保证 JSON 与 SVG 自包含（源码确认：pattern source 为 `<img>` 时导出的 SVG 引用外部 URL，为 canvas 时才是 base64）。
3. **导出前归一化 pattern source**：`toSVG()` 前把 `<img>` source 临时替换为 canvas，得到自包含 SVG。
4. **序列化自定义 schema**：基于 `toObject()`，显式存 texture id + path data + transform + zIndex（Fabric `toObject` 不自动保留自定义属性，需声明）。
5. **描摹平滑辅助**：用 `perfect-freehand`（MIT，tldraw 同款压感笔迹平滑）提升手工感；可选 `rough.js` 增强纸片边缘手作质感。
6. **锁版本** v7.x；跟进 open issue #5996（仅用到 patternTransform 时关注）。

### 待原型验证的风险（选型后第一件事）

- `canvas.toSVG()` 对 **pattern + 图案变换** 的保真度（`<pattern>` 是否正确内嵌位图、还原 offset/scale/rotation）。
- `containsPoint` 对**复杂闭合 path** 的命中准确度（不规则纸片边缘）。
- 每片 pattern + filter 在单 canvas 上的渲染开销（几十片同屏）。
- Fabric `toObject` 自定义属性在自动保存 schema 中的保留。

## 六、来源（一手）

- npm registry：`https://registry.npmjs.org/<pkg>`
- GitHub API：`https://api.github.com/repos/<owner>/<repo>`
- Fabric 源码 `packages/core/src/Pattern/Pattern.ts`；官方文档 http://fabricjs.com/api/
- Konva 源码 `src/Node.ts` + 文档 https://konvajs.org/docs/data_and_serialization/
- Leafer issue #301（SVG 导出官方回复）；https://www.leaferjs.com/ui/
- tldraw 许可证：https://tldraw.dev/community/license
- OpenGameArt Construction Paper Backgrounds（CC0）：https://opengameart.org/content/construction-paper-backgrounds
