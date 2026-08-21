/**
 * 画布视口导航（平移 / 缩放）—— 只改 fabric 的 viewportTransform，不动任何元素。
 *
 * 验收点（issue #26）：「平移/缩放只改视口，不得改变任何元素的 left/top/scale」。
 * 缩放走 canvas.setZoom()（zoomToPoint(0,0)），平移直接改 viewportTransform 位移项再 requestRenderAll。
 */
import { Canvas, Point, type TMat2D } from 'fabric';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

/** fit-to-viewport 留边系数（乘性）：纸边缘与投影阴影可见，「一张纸摊在垫子上」。 */
export const FIT_MARGIN = 0.92;

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

/** 按倍率缩放，返回新的缩放值（已钳制）。锚定视口中心：fit 居中后 ± 缩放不漂移。 */
export function zoomBy(canvas: Canvas, factor: number): number {
  const next = clamp(getZoom(canvas) * factor, MIN_ZOOM, MAX_ZOOM);
  canvas.zoomToPoint(new Point(canvas.getWidth() / 2, canvas.getHeight() / 2), next);
  return next;
}

/** 视口平移 dx/dy 像素（仅改 viewportTransform 位移项）。 */
export function panBy(canvas: Canvas, dx: number, dy: number): void {
  const vpt = [...canvas.viewportTransform] as TMat2D;
  vpt[4] += dx;
  vpt[5] += dy;
  canvas.setViewportTransform(vpt);
}

/**
 * fit 缩放纯函数：世界尺寸装进视口的 min 比例 × FIT_MARGIN。
 * 不经过 setZoom 的 [MIN_ZOOM, MAX_ZOOM] 钳制——fit 与用户 ± 缩放是两套
 * 钳制语义，超小容器下 fit < MIN_ZOOM 也必须生效，否则画布再次溢出视口。
 */
export function computeFitZoom(worldW: number, worldH: number, viewW: number, viewH: number): number {
  if (worldW <= 0 || worldH <= 0 || viewW <= 0 || viewH <= 0) return FIT_MARGIN;
  return Math.min(viewW / worldW, viewH / worldH) * FIT_MARGIN;
}

/** 视口适配：DOM 尺寸改为容器尺寸 + viewportTransform 设为 fit 居中矩阵。 */
export function fitToViewport(
  canvas: Canvas,
  view: { width: number; height: number },
  world: { width: number; height: number },
): void {
  canvas.setDimensions({ width: view.width, height: view.height });
  const zoom = computeFitZoom(world.width, world.height, view.width, view.height);
  canvas.setViewportTransform([zoom, 0, 0, zoom,
    (view.width - world.width * zoom) / 2,
    (view.height - world.height * zoom) / 2,
  ] as TMat2D);
}
