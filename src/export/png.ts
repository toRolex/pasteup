/**
 * PNG 导出（#49 离线化）—— 离线导出（offlineExport）路径。
 *
 * `exportProjectToPNG(project, options, loader)` 一次性无状态：await 全部纹理 resolve →
 * buildStaticCanvas 从 schema 重建临时 StaticCanvas（PNG/SVG 共享底层）→ toDataURL → dispose。
 * **不再 mutate 活画布**（隐底图/视口复位/恢复成为历史），导出过程画布无闪烁、状态不被污染；
 * 纹理纸片 await 后导出为纹理色而非占位纯色（原占位窗口 bug 的修复点）。
 *
 * 主 seam（PNG 像素与画布渲染一致）在 jsdom 无真实渲染：测试保留真实 StaticCanvas，spy toDataURL
 * 同步快照断言尺寸/参数契约/纹理填充/底图分支；真实像素一致由浏览器手测兜底（Q5 checklist）。
 *
 * 设计要点：
 * - 纹理时序：导出必须「await 全纹理后一次性截屏」（与 #47 renderer「先占位、异步补丁」语义相反）。
 *   单个纹理解码失败回退该纸片纯色填充，不中断整体导出。
 * - 底图语义（Q4）：`includeBackground && bgPhoto.dataUrl 存在 && bgPhoto.visible !== false` 才含底图；
 *   底图经 `FabricImage.fromURL` 预加载（与运行时 projectRenderer 同路径），加载失败 console.warn + 无底图导出。
 * - multiplier=1 时输出像素 = project.canvas 尺寸 = 项目分辨率像素；更高分辨率由 multiplier 放大。
 */
import { FabricImage } from 'fabric';
import { buildStaticCanvas } from './staticScene';
import { textureSupply, type TextureLoadSide } from '../texture/supply';
import type { PaperProject } from '../types/project';

export interface PNGExportOptions {
  /** 底图是否包含；默认 false（导出默认不含底图）。 */
  includeBackground?: boolean;
  /** 导出倍率；默认 1（输出像素 = project.canvas 尺寸 = 项目分辨率像素）。 */
  multiplier?: number;
}

export interface PNGExportResult {
  dataUrl: string;
  /** 输出像素宽（project.canvas.width × multiplier）。 */
  width: number;
  /** 输出像素高（project.canvas.height × multiplier）。 */
  height: number;
}

/**
 * 从 project schema 离线重建并导出 PNG dataURL（不碰活画布）。
 *
 * @param loader 纹理供给 load 侧（默认应用级单例；测试注入 fake）。
 */
export async function exportProjectToPNG(
  project: PaperProject,
  options: PNGExportOptions = {},
  loader: TextureLoadSide = textureSupply,
): Promise<PNGExportResult> {
  const { includeBackground = false, multiplier = 1 } = options;

  // await 全部纹理解码（原占位 bug 修复点）：单个失败回退该纸片纯色，不中断整体导出。
  const sources = new Map<string, CanvasImageSource>();
  for (const texture of project.textures) {
    try {
      sources.set(texture.id, await loader.load(texture.dataUrl));
    } catch {
      // 纹理解码失败：sources 缺此项 → createFabricPath 回退纯色填充
    }
  }

  // 底图条件包含：includeBackground && dataUrl 存在 && visible !== false；加载失败 warn + 无底图导出。
  let backgroundImage: FabricImage | undefined;
  if (includeBackground && project.bgPhoto?.dataUrl && project.bgPhoto.visible !== false) {
    try {
      backgroundImage = await FabricImage.fromURL(project.bgPhoto.dataUrl);
    } catch (err) {
      console.warn('PNG 导出：底图加载失败，按无底图导出', err);
    }
  }

  const canvas = buildStaticCanvas(project, sources, backgroundImage);
  try {
    const dataUrl = canvas.toDataURL({
      format: 'png',
      multiplier,
      enableRetinaScaling: false,
    });
    return {
      dataUrl,
      // 输出尺寸契约：project.canvas 尺寸 × multiplier（= 项目分辨率像素）。
      width: Math.round(project.canvas.width * multiplier),
      height: Math.round(project.canvas.height * multiplier),
    };
  } finally {
    // dispose 返回 Promise（异步清理），临时 canvas 丢弃引用即可，无需等待。
    void canvas.dispose();
  }
}

/** 浏览器下载 PNG：创建临时 <a download> 并触发点击（webview 内可用；Tauri 原生另存留待后续）。 */
export function downloadPNG(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}
