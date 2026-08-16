/**
 * pasteup 项目数据模型（自定义序列化 schema）。
 *
 * 约定：不依赖 fabric `toObject()` 默认行为，序列化走本 schema 显式声明。
 * 字段名是本仓库共享契约（后续 issue 依赖），不要随意改名。
 */
import type { TextureStyle } from '../texture/generator';
import type { TextureRotation } from '../texture/shade';

/** 纸片的位姿变换（对应 fabric.Path 的 left/top/angle/scaleX/scaleY）。 */
export interface ProjectTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

/** 纸片元素：描摹闭合后生成的 fabric.Path，产品核心对象。 */
export interface PaperElement {
  id: string;
  kind: 'paper';
  /** SVG path data（闭合） */
  path: string;
  /** 用户着色 */
  color: string;
  opacity: number;
  /** 引用 textures 表；null 表示无纹理 */
  textureId: string | null;
  textureScale: number;
  /** 程序化纹理 seed（T7）：每张纸独立 → 结构天然不同；重开一致依赖精确持久化。 */
  seed: number;
  transform: ProjectTransform;
}

/**
 * 纹理记录（T8）：承载「灰度纹理 → 着色合成 → 纸面 dataURL」的合成结果。
 * 全转 dataURL 保证项目 JSON 与导出 SVG 自包含（ADR 0001：运行时与导出共用同一数据源）。
 * 一条记录即一个着色变体（texId:color:scale:rotate 唯一），dataUrl 为已烘焙 scale/rotate 的位图。
 */
export interface PaperTexture {
  id: string;
  /** 灰度源风格（T7 6 风格之一）。 */
  style: TextureStyle;
  /** 灰度源 seed（程序化纹理确定性）。 */
  seed: number;
  /** 用户色（规范 hex）。 */
  color: string;
  /** 纹理缩放（0.5–2）。 */
  scale: number;
  /** 纹理旋转（0/90/180/270）。 */
  rotate: TextureRotation;
  /** 着色合成结果（已烘焙 scale/rotate）的自包含 dataURL。 */
  dataUrl: string;
}

/** createPaperTexture 输入；scale/rotate 未提供时默认 1 / 0。 */
export interface CreatePaperTextureInput {
  id?: string;
  style: TextureStyle;
  seed: number;
  color: string;
  scale?: number;
  rotate?: TextureRotation;
  dataUrl: string;
}

/** 创建纹理记录（着色合成变体），未提供的字段取默认值。 */
export function createPaperTexture(input: CreatePaperTextureInput): PaperTexture {
  return {
    id: input.id ?? uid(),
    style: input.style,
    seed: input.seed,
    color: input.color,
    scale: input.scale ?? 1,
    rotate: input.rotate ?? 0,
    dataUrl: input.dataUrl,
  };
}

/** 新纸片默认色（T10 属性面板接入色板前写死；取 DESIGN.md 苔绿 moss）。 */
export const DEFAULT_PAPER_COLOR = '#7A8B5C';

/** 项目根对象：数组序即 z 序（elements 从底到顶）。 */
export interface PaperProject {
  version: 1;
  canvas: { width: number; height: number };
  bgPhoto: { dataUrl: string | null; visible: boolean } | null;
  textures: PaperTexture[];
  elements: PaperElement[];
}

/** 新建空项目。 */
export function createEmptyProject(width: number, height: number): PaperProject {
  return {
    version: 1,
    canvas: { width, height },
    bgPhoto: null,
    textures: [],
    elements: [],
  };
}

/**
 * 渲染失效三态（#47）：schema 层单点化的失效判定，替代散落的「prev 引用比较」手工知识。
 * core（elements/textures/canvas）按引用相等比较；bgPhoto 按 dataUrl 比较（含 null 边界）。
 * 各消费者取所需语义：store 只看 `'none'`（commitEdit 不入撤销栈）；renderer 消费三态。
 */
export type ProjectDiff = 'none' | 'bg-only' | 'full';

/**
 * 比较前后两版 project，判定渲染失效路径。
 * - `'none'`：core + bgPhoto 四引用全相等 → 无实质变化（renderer 不重绘，commitEdit 不入栈）。
 * - `'bg-only'`：core 相等 + bgPhoto 引用不同但 dataUrl 相同（唯一可能变化是 visible）
 *   → renderer 只切 `backgroundImage.visible`，不重建元素。
 * - `'full'`：其余（core 引用变化 / bgPhoto dataUrl 变化 / 底图增删）→ 全量重建。
 */
export function diffProject(prev: PaperProject, next: PaperProject): ProjectDiff {
  const coreEqual =
    prev.elements === next.elements &&
    prev.textures === next.textures &&
    prev.canvas === next.canvas;
  if (!coreEqual) return 'full';
  if (prev.bgPhoto === next.bgPhoto) return 'none';
  // bgPhoto 引用不同：dataUrl 相等则唯一可能变化是 visible → bg-only；否则（增删/换图）全量。
  return prev.bgPhoto?.dataUrl === next.bgPhoto?.dataUrl ? 'bg-only' : 'full';
}

function uid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** 随机 uint32 seed（0..2³²-1）。种子选择本身可随机；纹理结构确定性由 mulberry32 保证。 */
function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000);
}

export interface CreatePaperElementInput {
  id?: string;
  path: string;
  color: string;
  opacity?: number;
  textureId?: string | null;
  textureScale?: number;
  /** 程序化纹理 seed；未提供时默认随机（每张纸独立）。测试/T12 传显式 seed 保证确定。 */
  seed?: number;
  transform?: Partial<ProjectTransform>;
}

/** 创建纸片元素，未提供的字段取默认值。 */
export function createPaperElement(input: CreatePaperElementInput): PaperElement {
  return {
    id: input.id ?? uid(),
    kind: 'paper',
    path: input.path,
    color: input.color,
    opacity: input.opacity ?? 1,
    textureId: input.textureId ?? null,
    textureScale: input.textureScale ?? 1,
    seed: input.seed ?? randomSeed(),
    transform: {
      x: input.transform?.x ?? 0,
      y: input.transform?.y ?? 0,
      rotation: input.transform?.rotation ?? 0,
      scaleX: input.transform?.scaleX ?? 1,
      scaleY: input.transform?.scaleY ?? 1,
    },
  };
}

/** 序列化为 JSON 字符串（自动保存格式）。 */
export function serializeProject(project: PaperProject): string {
  return JSON.stringify(project);
}

/**
 * 从 JSON 字符串解析项目；version 不受支持或结构损坏时抛错。
 * 结构校验（canvas/textures/elements）保证打开损坏文件时提示错误而非在渲染层崩溃。
 */
export function parseProject(json: string): PaperProject {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || (parsed as PaperProject).version !== 1) {
    throw new Error(`不支持的 project version: ${String((parsed as PaperProject | null)?.version)}`);
  }
  const project = parsed as PaperProject;
  if (
    !project.canvas ||
    typeof project.canvas.width !== 'number' ||
    typeof project.canvas.height !== 'number' ||
    !Array.isArray(project.textures) ||
    !Array.isArray(project.elements)
  ) {
    throw new Error('项目文件结构损坏：缺少 canvas / textures / elements 字段');
  }
  return project;
}
