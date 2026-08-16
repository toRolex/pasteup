# pasteup —— 领域上下文

## 产品

**pasteup** 是一个手帐剪纸拼贴绘图工具：用户在照片上描摹出轮廓，自动闭合成"纸片"元素，叠加程序生成的纸纹理（灰度明度层 + 用户着色）形成彩纸质感，再进行拼贴排版，导出 PNG / SVG。目标场景是外出/无材料时替代实物彩纸拼贴。

## 领域词汇

- **纸片（paper）**：用户描摹闭合后生成的元素，一个 `fabric.Path` 对象，带纹理填充与着色。产品的核心对象。
- **底图（bgPhoto）**：上传的照片，垫在画布最底层供描摹参照，可开关显示；导出默认不含。
- **纹理（texture）**：seed 驱动的程序化灰度明度层，程序着色合成最终纸面质感。用户可选，MVP 内置 6 种程序风格（褶皱/水彩晕染/颗粒/织物拉丝/大理石纹/纤维）；每张纸 seed 独立、结构不完全一致（手工随机性）。
- **着色（shading）**：把「灰度纹理明度 × 用户选色」合成最终纹理 dataURL 的过程。
- **描摹（trace）**：在底图上画轮廓的行为；MVP 用自由描绘，点取贴合后置。
- **拼贴（collage）**：对纸片做变换、图层排序、排版的最终成品状态。
- **paperBridge**：schema↔fabric 双向映射收拢的 module（`src/fabric/paperBridge.ts`）。正向 `paperToFabricOptions` 纯映射 + `createFabricPath` 构造（含质感）、反向 `readTransform` 单对象 transform 回灌（缺字段 ?? 回落）、paperId 经 `declare module 'fabric'` 声明合并承载（读写类型安全、无强转）、`findPaperObject` 为 fabric 侧按 paperId 定位的唯一 seam。新增 transform 字段只改这一处。
- **渲染（projectRenderer）**：渲染同步有状态 module（`src/fabric/projectRenderer.ts`），把「project → fabric 画布」的渲染知识从 React 壳收拢（壳只剩交互职责）。interface `createProjectRenderer(canvas, loader) → { render, dispose }`：render 内部走 schema 层 `diffProject(prev, next)` 三态（`'none'` 不重绘 / `'bg-only'` 只切底图 `backgroundImage.visible` 不重建元素 / `'full'` 全量重建），selection 跨重建按 paperId 恢复，异步纹理补丁（纯色占位 → 解码 → Pattern）校验内部渲染快照防旧覆盖。prev/失效/快照收进 implementation（depth），壳的 useEffect 变薄为一句 `renderer.render(project)`；loader 构造注入（纹理供给 load 侧窄 interface：prod 单例 / test fake 两 adapter）；dispose 只清内部状态，canvas 生命周期归壳。失效判定单点化在 schema 层 `diffProject`（`src/types/project.ts`）：store 只看 `'none'`（commitEdit 不入撤销栈），renderer 消费三态。
- **纹理供给（textureSupply）**：纹理「着色合成 + 解码加载」两层薄缓存折叠的单对象 module（`src/texture/supply.ts`，#48）。interface `createTextureSupply({ compose, load, budget, baseSize }) → { resolve, load, size, clear }`：`resolve(spec) → dataURL` 同步（命中复用 / 未命中合成），`load(dataUrl) → Promise<ImageSource>` 异步解码。统一字节 LRU：dataURL 为 key，`dataURL.length + width×height×4` 记账（resolve 按请求已知 outputSize 预记、load decode 后按实际位图补记），默认预算 256MB 构造可注入，超额逐出最旧至预算下；spec→dataURL 轻量前向索引生命周期绑死 LRU 条目（逐出删索引、再 resolve 重合成）。消费方各声明窄 interface（TS 结构化类型）：FabricCanvas / projectRenderer / svg 只声明 load 侧（`TextureLoadSide`），projectStore 只声明 resolve 侧（`TextureResolveSide`）；load 侧 prod（`loadTextureImage`）/ test（jsdom fake）两 adapter 保留。纹理编辑经 projectStore action `applyTextureProps(elementId, patch)` 编排（propertyEdit 拆纯 plan `planTextureProps` + 纯 apply `applyTexturePlan`），两道防线：no-op 引用相等不入撤销栈；request 原样传 resolve 不重建（重建即 key 漂移缓存永 miss）。
- **离线导出（offlineExport）**：从 schema 经临时 StaticCanvas 一次性重建后截屏的导出路径，不触碰活画布（无隐底图 / 视口复位 / 状态污染），导出过程画布无闪烁。共享底层 `buildStaticCanvas(project, sources, backgroundImage?)`（`src/export/staticScene.ts`，同步纯函数；底图由调用方预加载 `FabricImage.fromURL` 后传参、SVG 不传第三参，纹理命中 sources 用 Pattern、缺失回退纯色，返回 canvas 由调用方 toDataURL/toSVG 后 dispose）。PNG 走 `exportProjectToPNG(project, options, loader)`（`src/export/png.ts`，async：await 全纹理 resolve → buildStaticCanvas → `toDataURL({format:'png',multiplier,enableRetinaScaling:false})` → dispose），纹理纸片 await 后导出为纹理色而非占位纯色（原占位窗口 bug 修复点）；底图语义 `includeBackground && bgPhoto.dataUrl 存在 && bgPhoto.visible !== false` 才含、加载失败 console.warn + 无底图导出。SVG 私有 `buildRawSvg` 同调 buildStaticCanvas（两条导出路径不各自演化）。与「渲染（projectRenderer）」区分——后者是活画布的持续渲染（含 diff / selection / 异步纹理补丁），纹理时序语义相反（renderer 先占位异步补丁，离线导出 await 全纹理一次性截屏）。

## 关键技术决策

- 渲染引擎 Fabric.js v7（选型依据：唯一原生支持 SVG 导出含 pattern 填充）。详见 `docs/research/render-engine-selection.md`。
- 纹理来源：程序化 seed 生成（wayfinder #10 决策），替代 CC0 位图素材；seed 持久化进项目文件，重开纹理一致。
- 导出双格式：PNG（成品图）+ SVG（结构文件，纹理可嵌入）。
- 自动保存：改动防抖写盘，无感。

详细决策收拢见 `docs/implementation-plan.md`。
