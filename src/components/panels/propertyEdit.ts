/**
 * T10 属性面板纯逻辑（seam 1/2）。
 *
 * 不可变更新：每个变更返回新 project（引用不同才算变更；无实质变更返回原引用，
 * 避免污染撤销栈）。纹理相关属性变更经注入式 tintCache 触发重合成——
 * 缓存 key `texId:color:scale:rotate`，任一维变化 → 新 key → 新 dataURL。
 * 缩放/旋转取值受限：0.5–2（50%–200%）；0/90/180/270。
 */
import type { PaperElement, PaperProject, PaperTexture } from '../../types/project';
import { createPaperTexture } from '../../types/project';
import { tintTextureCache, type TintedTextureRequest } from '../../texture/cache';
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

/** 重合成所需的最小缓存接口（注入式；默认 tintTextureCache）。 */
export interface TintGetter {
  get(request: TintedTextureRequest): string;
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
 * 应用纹理相关属性变更（颜色/缩放/旋转/风格），触发重合成。
 *
 * - 无纹理且未指定风格：仅改 element.color（纯色填充）。
 * - 已有纹理且未指定风格：更新该记录 color/scale/rotate → 重合成（同 texId，缓存新 key）。
 * - 指定风格：同风格同参数为 no-op；否则生成新 texId 记录（同 seed）并指向它，
 *   旧记录若不再被任何纸片引用则清理（避免 textures 表孤儿堆积）。
 * - element.textureScale 与记录 scale 保持同步。
 */
export function applyTextureProperty(
  project: PaperProject,
  elementId: string,
  patch: TexturePropertyPatch,
  tintCache: TintGetter = tintTextureCache,
): PaperProject {
  const element = project.elements.find((el) => el.id === elementId);
  if (!element) return project;
  const existing = element.textureId
    ? project.textures.find((t) => t.id === element.textureId)
    : undefined;

  const color = patch.color ?? element.color;
  const scale = clampTextureScale(patch.scale ?? element.textureScale);
  const rotate = patch.rotate ?? existing?.rotate ?? 0;

  let textureId = element.textureId;
  let textures = project.textures;

  if (patch.style !== undefined) {
    // 风格变更 / 首次应用纹理。已是同风格 → no-op（当前色/缩放/旋转已在该记录上）。
    if (existing && existing.style === patch.style) {
      return project;
    }
    const texId = makeTextureId();
    const dataUrl = tintCache.get({
      texId,
      style: patch.style,
      seed: element.seed,
      color,
      scale,
      rotate,
    });
    textures = [
      ...textures,
      createPaperTexture({
        id: texId,
        style: patch.style,
        seed: element.seed,
        color,
        scale,
        rotate,
        dataUrl,
      }),
    ];
    textureId = texId;
  } else if (existing) {
    // 无风格变更，更新现有变体（同 texId，缓存按 color/scale/rotate 新 key 重合成）
    if (
      existing.color === color &&
      existing.scale === scale &&
      existing.rotate === rotate &&
      element.color === color &&
      element.textureScale === scale
    ) {
      return project;
    }
    const dataUrl = tintCache.get({
      texId: existing.id,
      style: existing.style,
      seed: existing.seed,
      color,
      scale,
      rotate,
    });
    textures = textures.map((t) =>
      t.id === existing.id ? { ...t, color, scale, rotate, dataUrl } : t,
    );
  } else {
    // 无纹理且未指定风格：仅颜色可能变更（纯色填充）
    if (color === element.color) return project;
    return updateElementProperty(project, elementId, (el) => ({ ...el, color }));
  }

  const updatedElement: PaperElement = { ...element, color, textureId, textureScale: scale };
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
