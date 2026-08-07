/**
 * A4 画布尺寸换算 —— 新建项目时依据「朝向 + 分辨率」初始化画布像素尺寸。
 *
 * 规则（issue #26）：
 * - A4 = 210mm × 297mm；1mm = DPI / 25.4 px。
 * - 竖版 width=210mm 侧、height=297mm 侧；横版互换（A4 换向）。
 * - 分辨率选项 96 / 300 / 600，默认 300；取整用 Math.round（@300 与 @600 与规格逐像素一致）。
 */

/** A4 短边 / 长边（公制 mm）。 */
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

/** 画布朝向：竖 / 横（A4 换向，选定后固定）。 */
export const CANVAS_ORIENTATIONS = ['portrait', 'landscape'] as const;
export type CanvasOrientation = (typeof CANVAS_ORIENTATIONS)[number];
export const DEFAULT_CANVAS_ORIENTATION: CanvasOrientation = 'portrait';

/** 分辨率选项（DPI）。 */
export const CANVAS_RESOLUTIONS = [96, 300, 600] as const;
export type CanvasResolution = (typeof CANVAS_RESOLUTIONS)[number];
export const DEFAULT_CANVAS_RESOLUTION: CanvasResolution = 300;

/** mm → px：1mm = DPI/25.4 px，四舍五入到整数。 */
export function mmToPx(mm: number, dpi: number): number {
  return Math.round(mm * (dpi / 25.4));
}

export interface CanvasSize {
  width: number;
  height: number;
}

/** 依据 A4 换向与分辨率计算画布像素尺寸。 */
export function createCanvasSize(
  orientation: CanvasOrientation,
  resolution: CanvasResolution,
): CanvasSize {
  const widthMm = orientation === 'portrait' ? A4_WIDTH_MM : A4_HEIGHT_MM;
  const heightMm = orientation === 'portrait' ? A4_HEIGHT_MM : A4_WIDTH_MM;
  return { width: mmToPx(widthMm, resolution), height: mmToPx(heightMm, resolution) };
}
