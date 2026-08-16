/**
 * T10 属性面板纯逻辑（seam 1/2）+#48 拆分。
 *
 * 不可变更新：每个变更返回新 project（引用不同才算变更；无实质变更返回原引用，避免污染撤销栈）。
 * #48：纹理编辑拆纯 plan / 纯 apply，合成（resolve）上移到 projectStore action 编排——
 * - `planTextureProps` 纯 plan：判 no-op / 算新建或更新变体 / 产 TintedTextureRequest（不触发合成）。
 * - `applyTexturePlan` 纯 apply：resolve 结果（dataUrl）写回 record + prune 孤儿纹理。
 * 两道防线：no-op 引用相等（plan 判 noop → action 不入撤销栈）；request 生命周期
 * （plan 产出的 request 原样传 resolve 并写回，重建即 key 漂移缓存永 miss）。
 * 缩放/旋转取值受限：0.5–2（50%–200%）；0/90/180/270。
 */
import type { PaperElement, PaperProject, PaperTexture } from '../../types/project';
import { createPaperTexture } from '../../types/project';
import type { TintedTextureRequest } from '../../texture/supply';
import {
  MAX_TEXTURE_SCALE,
  MIN_TEXTURE_SCALE,
  type TextureRotation,
} from '../../texture/shade';
import type { TextureStyle } from '../../texture/generator';

/** 属性面板内置色板（简洁色集：默认苔绿 + 常用手工纸色；MRU 归 T15 PalettePanel）。 */
export const PROPERTY_PALETTE: readonly string[] = [
  '#7A8B5C', // moss（DESIGN.md 默认纸色）
  '#c0392b',
  '#d9822b',
  '#e5b641',
  '#3e8e5a',
  '#2f80a0',
  '#2b5fa8',
  '#6b4fb0',
  '#b04f88',
  '#8b5e3c',
  '#5a4634',
  '#3b3b3b',
];

/** 纹理旋转仅支持 90° 增量四值（对齐 shade.TEXTURE_ROTATIONS 语义）。 */
export const TEXTURE_ROTATIONS: readonly TextureRotation[] = [0, 90, 180, 270];

/** 不透明度限制在 0–1。 */
export function clampOpacity(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 纹理缩放限制在 0.5–2（50%–200%）。 */
export function clampTextureScale(value: number): number {
  return Math.min(MAX_TEXTURE_SCALE, Math.max(MIN_TEXTURE_SCALE, value));
}

/** 校验纹理旋转是否 90° 增量。 */
export function isTextureRotation(value: number): value is TextureRotation {
  return (TEXTURE_ROTATIONS as readonly number[]).includes(value);
}

/** 纹理相关属性变更 patch（任一维可选，未传保持现有）。 */
export interface TexturePropertyPatch {
  /** 纹理风格切换（6 选 1）；不传保持现有（可能无纹理）。 */
  style?: TextureStyle;
  /** 用户色（hex）。 */
  color?: string;
  /** 纹理缩放（0.5–2，clamp）。 */
  scale?: number;
  /** 纹理旋转（0/90/180/270）。 */
  rotate?: TextureRotation;
}

/**
 * 纹理属性变更计划（纯 plan 产物，discriminated union）：
 * - `noop`：无实质变更（撤销栈防线——action 据此不入栈）。
 * - `color`：无纹理纸片纯色变更（不产 request，无需 resolve）。
 * - `texture`：纹理变体变更（新建或更新）；request 原样传 resolve 并写回 record。
 */
export type TexturePropsPlan =
  | { kind: 'noop' }
  | { kind: 'color'; color: string }
  | { kind: 'texture'; create: boolean; request: TintedTextureRequest };

/** 按元素 id 应用不可变更新；找不到元素或回调未改引用时返回原 project。 */
export function updateElementProperty(
  project: PaperProject,
  elementId: string,
  update: (element: PaperElement) => PaperElement,
): PaperProject {
  let changed = false;
  const elements = project.elements.map((el) => {
    if (el.id !== elementId) return el;
    const next = update(el);
    if (next !== el) changed = true;
    return next;
  });
  return changed ? { ...project, elements } : project;
}

/** 更新纸片不透明度（clamp 0–1）。 */
export function applyOpacity(
  project: PaperProject,
  elementId: string,
  opacity: number,
): PaperProject {
  const clamped = clampOpacity(opacity);
  return updateElementProperty(project, elementId, (el) =>
    el.opacity === clamped ? el : { ...el, opacity: clamped },
  );
}

/**
 * 纯 plan：判 no-op / 算新建或更新变体 / 产 TintedTextureRequest（不触发合成）。
 *
 * - 无纹理且未指定风格：仅颜色可能变更 → color plan（同色 noop）。
 * - 已有纹理且未指定风格：更新该记录 color/scale/rotate 变体（同 texId）→ texture plan（create=false）。
 * - 指定风格：同风格为 noop；否则产新 texId 记录变体（同 seed）→ texture plan（create=true）。
 */
export function planTextureProps(
  project: PaperProject,
  elementId: string,
  patch: TexturePropertyPatch,
): TexturePropsPlan {
  const element = project.elements.find((el) => el.id === elementId);
  if (!element) return { kind: 'noop' };
  const existing = element.textureId
    ? project.textures.find((t) => t.id === element.textureId)
    : undefined;

  const color = patch.color ?? element.color;
  const scale = clampTextureScale(patch.scale ?? element.textureScale);
  const rotate = patch.rotate ?? existing?.rotate ?? 0;

  if (patch.style !== undefined) {
    // 风格变更 / 首次应用纹理。已是同风格 → noop（当前色/缩放/旋转已在该记录上）。
    if (existing && existing.style === patch.style) return { kind: 'noop' };
    return {
      kind: 'texture',
      create: true,
      request: { texId: makeTextureId(), style: patch.style, seed: element.seed, color, scale, rotate },
    };
  }
  if (existing) {
    // 无风格变更，更新现有变体（同 texId，按 color/scale/rotate 新 key 重合成）
    if (
      existing.color === color &&
      existing.scale === scale &&
      existing.rotate === rotate &&
      element.color === color &&
      element.textureScale === scale
    ) {
      return { kind: 'noop' };
    }
    return {
      kind: 'texture',
      create: false,
      request: { texId: existing.id, style: existing.style, seed: existing.seed, color, scale, rotate },
    };
  }
  // 无纹理且未指定风格：仅颜色可能变更（纯色填充）
  if (color === element.color) return { kind: 'noop' };
  return { kind: 'color', color };
}

/**
 * 纯 apply：把 resolve 结果（dataUrl）写回 record + prune 孤儿纹理。
 *
 * - noop plan → 返回原 project 引用（撤销栈防线）。
 * - color plan → 仅改 element.color。
 * - texture plan → 新建（createPaperTexture）或更新（同 id 覆写）变体 record，
 *   element.color/textureId/textureScale 同步，prune 不再被引用的旧记录。
 * request 字段原样写回（不重建），守住缓存 key 一致性防线。
 */
export function applyTexturePlan(
  project: PaperProject,
  elementId: string,
  plan: TexturePropsPlan,
  dataUrl: string | null = null,
): PaperProject {
  if (plan.kind === 'noop') return project;
  if (plan.kind === 'color') {
    const color = plan.color;
    return updateElementProperty(project, elementId, (el) =>
      el.color === color ? el : { ...el, color },
    );
  }

  const element = project.elements.find((el) => el.id === elementId);
  if (!element) return project;
  const { texId, style, seed, color, scale, rotate } = plan.request;

  const textures = plan.create
    ? [...project.textures, createPaperTexture({ id: texId, style, seed, color, scale, rotate, dataUrl: dataUrl! })]
    : project.textures.map((t) =>
        t.id === texId ? { ...t, color, scale, rotate, dataUrl: dataUrl! } : t,
      );

  const updatedElement: PaperElement = { ...element, color, textureId: texId, textureScale: scale };
  const newElements = project.elements.map((el) => (el.id === elementId ? updatedElement : el));
  const finalTextures = pruneOrphanTextures(textures, newElements);
  return { ...project, textures: finalTextures, elements: newElements };
}

/** 清除纸片纹理（回到纯色填充）；清理不再被引用的纹理记录。 */
export function removeTexture(project: PaperProject, elementId: string): PaperProject {
  const updated = updateElementProperty(project, elementId, (el) =>
    el.textureId === null ? el : { ...el, textureId: null },
  );
  if (updated === project) return project;
  const textures = pruneOrphanTextures(updated.textures, updated.elements);
  return textures.length === updated.textures.length ? updated : { ...updated, textures };
}

/** 只保留仍被纸片引用的纹理记录（防误删：其他纸片引用的记录保留）。 */
function pruneOrphanTextures(
  textures: PaperTexture[],
  elements: PaperElement[],
): PaperTexture[] {
  const referenced = new Set(
    elements
      .map((el) => el.textureId)
      .filter((id): id is string => id !== null),
  );
  return textures.filter((t) => referenced.has(t.id));
}

function makeTextureId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return `tex-${c.randomUUID()}`;
  return `tex-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
