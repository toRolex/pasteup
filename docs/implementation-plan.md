# 手帐剪纸拼贴 App —— 完整实现方案

> 日期：2026-08-03
> 本文档收拢 batch-grill-me 全部已确认决策，作为实现基准。
> 相关调研：`docs/research/render-engine-selection.md` 及两份调研草稿。

---

## 一、产品定位

**一句话**：一个在照片上描摹、把照片"转成剪纸"、用彩纸质感元素做拼贴的手帐工具。

**核心工作流**：上传照片作底图 → 在照片上描摹轮廓 → 自动闭合成"纸片"元素 → 选纹理、调色、排版拼贴 → 导出 PNG / SVG。

**目标场景**：外出、无材料时替代实物彩纸拼贴，做出有真实手工感的数字手帐页。

## 二、已确认决策总表

| 类别 | 决策 |
|---|---|
| 平台 | Tauri（非 Electron），Windows + Mac |
| 描摹工具 | **自由描绘**（MVP 主力）+ **点取贴合**（后置，贴照片内主体边缘） |
| 闭合 | 一笔画完自动闭合 → 成纸片 |
| 画布 | 单页大画布（可平移缩放），多页后置 |
| 底图 | 照片垫底，可开关显示；导出默认不含底图 |
| 质感 | 层叠投影+厚度（基础）+ 用户可选纹理 + 边缘不完美 + 手工随机性（每张纸纹理不完全一致，可选） |
| 纹理 | 开源 CC0 位图（Construction Paper + AmbientCG）+ **明度层 + 用户着色** |
| 纹理选择器 | 进 MVP，内置精简集（8–12 种） |
| 元素属性 | MVP：变换 + 颜色 + 不透明度 + 纹理缩放；边缘粗糙度、厚度后置 |
| 图层 | 完整图层面板 + 上移/下移/置顶/置底 |
| 工具集 MVP | 选择/移动 · 自由描绘 · 取色 · 纹理选择器 · 色板 · 画布导航 · 撤销/重做 · 图层面板 |
| 后置功能 | 点取贴合 · 文字 · 真实纸纹导入扩展 · 在线纹理库 |
| 保存 | 项目文件 + **无感自动保存**（防抖写盘，首建时选位置） |
| 导出 | PNG + SVG 用户自选；SVG 纹理可嵌入 |
| 语言/框架 | TypeScript + React + Vite |
| 状态 | Zustand（管 UI）；Fabric 管画布 |
| 渲染引擎 | **Fabric.js v7**（调研定稿） |
| 后端 | Tauri 2.x（Rust），fs 插件做文件读写 |
| 字体 | Caveat / ZCOOL KuaiLe / Nunito 本地打包（OFL 1.1，woff2 子集，不运行时走 CDN）；中文正文不打包：macOS 系统 Hiragino Maru Gothic ProN，Windows 兜底 Microsoft YaHei |
| 描摹平滑 | perfect-freehand（辅助库） |

## 三、技术架构

### 3.1 分层

```
React UI 层（工具栏 / 图层面板 / 色板 / 纹理选择器 / 属性面板）
        │  Zustand 状态（UI 状态、选中、项目引用）
        ▼
FabricCanvas 桥接壳（useRef 持 fabric.Canvas，单向同步 + 事件回灌）
        │
Fabric 画布层（纸片对象、变换、命中、图层、序列化、导出）
        │
纹理资产服务（灰度明度提取 → 着色合成 → dataURL 缓存）
        │
Tauri fs（项目文件读写、自动保存）
```

**分工铁律**：Fabric 管画布内部状态，React 管外壳 UI，两者经桥接壳通信，不双向绑定。

### 3.2 项目 JSON schema（自动保存格式）

```ts
interface PaperProject {
  version: 1;
  canvas: { width: number; height: number };
  bgPhoto: { dataUrl: string | null; visible: boolean } | null;
  textures: { id: string; dataUrl: string }[];   // 纹理资产，全转 dataURL
  elements: PaperElement[];                        // 数组序 = z 序
}

interface PaperElement {
  id: string;
  kind: 'paper';
  path: string;              // SVG path data（闭合）
  color: string;             // 用户着色
  opacity: number;
  textureId: string | null;  // 引 textures
  textureScale: number;
  transform: { x: number; y: number; rotation: number; scaleX: number; scaleY: number };
}
```

> Fabric `toObject()` 不自动保留自定义属性，序列化基于自定义 schema 显式声明。

### 3.3 目录结构（草案）

```
cut/
├─ src/
│  ├─ main.tsx / App.tsx
│  ├─ assets/fonts/                       # 内置字体（Caveat/ZCOOL KuaiLe/Nunito，OFL）
│  ├─ components/
│  │  ├─ canvas/FabricCanvas.tsx        # 桥接壳（核心）
│  │  ├─ toolbar/                        # 工具按钮
│  │  ├─ panels/                         # 图层 / 色板 / 纹理 / 属性
│  │  └─ dialogs/                        # 新建/打开/导出
│  ├─ state/                             # Zustand stores
│  ├─ fabric/
│  │  ├─ paperFactory.ts                 # 纸片对象创建/着色
│  │  ├─ traceTool.ts                    # 自由描绘 + 闭合
│  │  └─ selection.ts                    # 选择/变换/层级
│  ├─ texture/
│  │  ├─ source.ts                       # 开源纹理资产（内置精简集）
│  │  ├─ shade.ts                        # 明度提取 + 着色合成
│  │  └─ cache.ts
│  ├─ io/                                # 保存 / 导出 PNG / 导出 SVG
│  └─ types/project.ts
├─ src-tauri/                            # Tauri (Rust)
├─ public/textures/                      # 内置纹理（CC0）
└─ prototypes/                           # 既有质感原型（参考）
```

## 四、MVP 开发阶段（每阶段带验证标准）

| 阶段 | 内容 | 验证标准 |
|---|---|---|
| **P0 脚手架 + 风险验证** | Vite+React+TS+Tauri 脚手架；FabricCanvas 桥接壳；**跑通 4 个技术风险**（见 §6） | 4 个风险项逐一有结论；桥接壳能画一个纸片 |
| **P1 描摹闭环** | 照片底图（导入/显示/开关）→ 自由描绘 → 自动闭合 → 纸片基础渲染（层叠厚度+投影） | 一张照片能描出至少一个闭合纸片，可拖拽旋转 |
| **P2 质感系统** | 纹理资产 + 明度着色合成 + 纹理选择器 + 元素属性面板（颜色/不透明度/纹理缩放） | 纸片可换纹理、调色、实时生效 |
| **P3 编辑基建** | 图层面板 + 快捷层级 + 选择/变换 + 撤销重做 | 图层重排生效；撤销重做稳定 |
| **P4 保存导出** | 无感自动保存 + 打开项目 + 导出 PNG / SVG（纹理自包含） | 关掉重开不丢；导出 SVG 别处打开显示一致 |
| **P5 打磨发布** | 视觉打磨 + Tauri 双平台打包 + 首版 | Windows/Mac 可安装运行 |

## 五、纹理系统落地（明度 + 着色）

1. **内置精简集**：从 Construction Paper（12 色手工纸）与 AmbientCG Paper（中性纸细节）提取 **灰度明度层**，存入 `public/textures/`（CC0）。
2. **着色合成**：用户选色后，程序把「灰度明度 × 用户颜色」合成最终纹理 dataURL（灰度图 + 着色，缓存复用，改色重新合成）。
3. **喂给 Fabric**：合成后的 dataURL 作为 `fabric.Pattern` 的 canvas source → JSON/SVG 天然自包含。
4. **实现方式待 P2 原型验证**：合成着色 vs 混合模式叠加，两者都可行，P2 用最小原型定夺。

## 六、技术风险与缓解（P0 必验）

| 风险 | 缓解 |
|---|---|
| `canvas.toSVG()` 对 pattern+图案变换的保真度（`<pattern>` 是否正确内嵌位图） | P0 最小原型验证；失败则导出时用"canvas 源 + 归一化"兜底（调研已给路径） |
| `containsPoint` 对复杂闭合纸片边缘的命中准确度 | P0 验证；失败则手写命中（包围盒 + 最近边距） |
| 每片 pattern+filter 单 canvas 渲染开销（几十片） | P0 压力验证；不足则纹理合成改为"预合成纸片外观"降低每帧成本 |
| Fabric `toObject` 自定义属性保留 | 序列化走自定义 schema，不依赖 `toObject` 默认行为 |

## 七、后置功能（不进 MVP，已排期方向）

- 点取贴合（照片内主体边缘贴合，半自动锚点 + 手动微调）
- 文字/手写字元素
- 真实纸纹导入（用户自定义纹理资产）
- 在线纹理库下载
- 多页手帐本

## 八、待定项（不阻塞开发）

- UI 视觉方向（工具栏布局、面板风格）——进入 P1 时定
- 画布默认尺寸 / 比例（建议 A4 竖版，待 P1 确认）
- 取色来源细节（画布/底图任意点取色，工具已列入 MVP，交互待 P1 细化）

> **应用命名已定：pasteup**（仓库 https://github.com/toRolex/pasteup，public）。
