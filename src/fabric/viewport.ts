/**
 * 画布视口导航（平移 / 缩放）—— 只改 fabric 的 viewportTransform，不动任何元素。
 *
 * 验收点（issue #26）：「平移/缩放只改视口，不得改变任何元素的 left/top/scale」。
 * 缩放走 canvas.setZoom()（zoomToPoint(0,0)），平移直接改 viewportTransform 位移项再 requestRenderAll。
 */
import type { Canvas, TMat2D } from 'fabric';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

/** 单位视口矩阵（iMatrix：缩放 1、位移 0）。单份定义，resetViewport 复用本常量。 */
export const IDENTITY_VIEWPORT: TMat2D = [1, 0, 0, 1, 0, 0];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 当前视口缩放（viewportTransform 的 x 向缩放）。 */
export function getZoom(canvas: Canvas): number {
  return canvas.getZoom();
}

/** 精确设视口缩放（钳制到 [MIN_ZOOM, MAX_ZOOM]）。 */
export function setZoom(canvas: Canvas, zoom: number): void {
  canvas.setZoom(clamp(zoom, MIN_ZOOM, MAX_ZOOM));
}

/** 按倍率缩放，返回新的缩放值（已钳制）。 */
export function zoomBy(canvas: Canvas, factor: number): number {
  const next = clamp(getZoom(canvas) * factor, MIN_ZOOM, MAX_ZOOM);
  canvas.setZoom(next);
  return next;
}

/** 视口平移 dx/dy 像素（仅改 viewportTransform 位移项）。 */
export function panBy(canvas: Canvas, dx: number, dy: number): void {
  const vpt = [...canvas.viewportTransform] as TMat2D;
  vpt[4] += dx;
  vpt[5] += dy;
  canvas.setViewportTransform(vpt);
}

/** 复位视口：缩放 1、位移 0（iMatrix）。 */
export function resetViewport(canvas: Canvas): void {
  canvas.setViewportTransform([...IDENTITY_VIEWPORT] as TMat2D);
}
