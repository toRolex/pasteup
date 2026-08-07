/**
 * pasteup 项目数据模型（自定义序列化 schema）。
 *
 * 约定：不依赖 fabric `toObject()` 默认行为，序列化走本 schema 显式声明。
 * 字段名是本仓库共享契约（后续 issue 依赖），不要随意改名。
 */

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
  transform: ProjectTransform;
}

/** 纹理资产：全转 dataURL，保证项目 JSON 与导出 SVG 自包含。 */
export interface PaperTexture {
  id: string;
  dataUrl: string;
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

function uid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface CreatePaperElementInput {
  id?: string;
  path: string;
  color: string;
  opacity?: number;
  textureId?: string | null;
  textureScale?: number;
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

/** 从 JSON 字符串解析项目；version 不受支持时抛错。 */
export function parseProject(json: string): PaperProject {
  const parsed = JSON.parse(json) as PaperProject;
  if (parsed.version !== 1) {
    throw new Error(`不支持的 project version: ${String(parsed.version)}`);
  }
  return parsed;
}
