/**
 * PNG 导出（T14）。
 *
 * 导出触发点：顶栏「导出 PNG」按钮 → exportCanvasToPNG 取当前画布像素 → downloadPNG 落盘。
 * 主 seam（PNG 像素与画布渲染一致）在 jsdom 无真实渲染，headless 断言导出管线
 * 把当前画布原样交给 fabric toDataURL（同对象/同 pattern/正确参数/底图隐藏/视口复位/尺寸一致），
 * 真实像素一致由浏览器手测兜底（验证边界见 DONE 汇报）。
 *
 * 设计要点（issue #37 / ADR 0001）：
 * - 底图默认不含导出：fabric `toDataURL()` 的 renderCanvas 会绘制 backgroundImage，需临时隐藏。
 * - 视口复位：导出完整画布内容（缩放/平移不进入成品），结束后恢复并 requestRenderAll 同步画布。
 * - multiplier=1 时输出像素 = canvas 尺寸 = 项目分辨率像素（project.canvas 已在新建时按 DPI 折算），
 *   满足「尺寸与项目分辨率一致」；更高分辨率导出由调用方传 multiplier 放大。
 * - try/finally 保证 toDataURL 抛错时 backgroundImage 与 viewportTransform 也还原，画布不残留污染状态。
 */
import type { Canvas, TMat2D } from 'fabric';
import type { PaperProject } from '../types/project';

export interface PNGExportOptions {
  /** 底图是否包含；默认 false（导出默认不含底图）。 */
  includeBackground?: boolean;
  /** 导出倍率；默认 1（输出像素 = 画布像素 = 项目分辨率像素）。 */
  multiplier?: number;
}

export interface PNGExportResult {
  dataUrl: string;
  /** 输出像素宽（画布像素 × multiplier）。 */
  width: number;
  /** 输出像素高（画布像素 × multiplier）。 */
  height: number;
}

const IDENTITY_VIEWPORT: TMat2D = [1, 0, 0, 1, 0, 0];

/** 把当前画布导出为 PNG dataURL。底图默认隐藏，视口导出期间复位。 */
export function exportCanvasToPNG(
  canvas: Canvas,
  project: PaperProject,
  options: PNGExportOptions = {},
): PNGExportResult {
  const { includeBackground = false, multiplier = 1 } = options;

  const savedBackground = canvas.backgroundImage;
  const savedViewport = canvas.viewportTransform;

  try {
    if (!includeBackground) {
      canvas.backgroundImage = undefined;
    }
    canvas.setViewportTransform([...IDENTITY_VIEWPORT] as TMat2D);

    const dataUrl = canvas.toDataURL({
      format: 'png',
      multiplier,
      enableRetinaScaling: false,
    });

    return {
      dataUrl,
      // 输出尺寸契约：项目画布像素 × multiplier（= 项目分辨率像素）。
      width: Math.round(project.canvas.width * multiplier),
      height: Math.round(project.canvas.height * multiplier),
    };
  } finally {
    canvas.setViewportTransform([...savedViewport] as TMat2D);
    if (!includeBackground) {
      canvas.backgroundImage = savedBackground;
    }
    // 视口恢复后同步画布视觉（导出期间置空的底图也一并还原渲染）。
    canvas.requestRenderAll();
  }
}

/** 浏览器下载 PNG：创建临时 <a download> 并触发点击（webview 内可用；Tauri 原生另存留待后续）。 */
export function downloadPNG(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}
