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

## 关键技术决策

- 渲染引擎 Fabric.js v7（选型依据：唯一原生支持 SVG 导出含 pattern 填充）。详见 `docs/research/render-engine-selection.md`。
- 纹理来源：程序化 seed 生成（wayfinder #10 决策），替代 CC0 位图素材；seed 持久化进项目文件，重开纹理一致。
- 导出双格式：PNG（成品图）+ SVG（结构文件，纹理可嵌入）。
- 自动保存：改动防抖写盘，无感。

详细决策收拢见 `docs/implementation-plan.md`。
