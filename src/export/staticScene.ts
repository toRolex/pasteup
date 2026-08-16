/**
 * staticScene —— PNG/SVG 共享的离线重建底层（#49）。
 *
 * 「离线导出（offlineExport）」的共享 base：从 project schema 经临时 StaticCanvas 一次性重建，
 * 不触碰活画布（无隐底图/视口复位/状态污染）。PNG（toDataURL）与 SVG（toSVG）两条导出路径共用
 * 本 module，不各自演化；SVG 私有 buildRawSvg 与 PNG 导出都改调它。
 *
 * - 同步纯函数：底图由调用方预加载（`FabricImage.fromURL`）后以参数传入，共享层不含异步；
 *   SVG 调用零改动（不传第三参，构造上排除底图）。
 * - 纹理填充沿用 createFabricPath 语义：textureId 命中 sources 用 Pattern 填充，缺失/悬空引用
 *   回退纯色填充。
 * - 返回的 StaticCanvas 由调用方 toDataURL/toSVG 后 dispose（本 module 不 dispose）。
 *
 * ADR 0001 硬性契约：纹理缩放/旋转已在合成时烘焙进位图，pattern 不设 transform。
 */
import { StaticCanvas, type FabricImage } from 'fabric';
import { createFabricPath } from '../fabric/paperBridge';
import type { PaperProject } from '../types/project';

/**
 * 从 project schema 重建临时 StaticCanvas（一次性、无状态，不碰活画布）。
 *
 * @param sources textureId → 已加载纹理源（缺省/悬空引用回退纯色填充）。
 * @param backgroundImage 调用方预加载的底图（可选；传入即设为 canvas.backgroundImage）。
 * @returns 重建完成的 StaticCanvas；调用方负责 toDataURL/toSVG 后 dispose。
 */
export function buildStaticCanvas(
  project: PaperProject,
  sources: Map<string, CanvasImageSource>,
  backgroundImage?: FabricImage,
): StaticCanvas {
  const canvas = new StaticCanvas(undefined, {
    width: project.canvas.width,
    height: project.canvas.height,
  });
  if (backgroundImage) {
    canvas.backgroundImage = backgroundImage;
  }
  for (const el of project.elements) {
    const textureSource = el.textureId ? sources.get(el.textureId) : undefined;
    canvas.add(createFabricPath(el, textureSource));
  }
  return canvas;
}
