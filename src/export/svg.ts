/**
 * T13 导出 SVG。
 *
 * 主 seam：`postProcessSvg` 纯函数 —— fabric v7 `canvas.toSVG()` 输出的
 * `<pattern>`/`<filter>` 在 `<g>` body 内（jsdom 实测），严格渲染器（Inkscape/librsvg）
 * 要求收进 `<defs>`。
 *
 * ADR 0001 契约：纹理缩放/旋转在合成时预烘焙进最终位图，pattern 不设 transform
 * （fabric v7 toSVG 会丢弃 patternTransform，运行时已烘焙故输出天然正确）；
 * 导出时把 `<pattern>` 收进 `<defs>`，并断言无 `patternTransform`。
 *
 * 导出从 project schema 重建临时 StaticCanvas（不碰 live canvas，构造上排除底图），
 * 纹理 dataURL 加载走纹理供给（`src/texture/supply.ts`，与运行时共用同一条管线，
 * 同一 dataURL 解码结果复用；jsdom 不能真实解码图片，测试注入 fake load adapter）。
 */
import { buildStaticCanvas } from './staticScene';
import { textureSupply, type TextureLoadSide } from '../texture/supply';
import type { PaperProject } from '../types/project';

/**
 * post-process 纯函数（主 seam，可测核心）。
 *
 * 1. 把 `<pattern>` 与 `<filter>` 从当前位置移入 `<defs>`（无 `<defs>` 时在 `<svg>` 内创建）。
 * 2. 契约断言：任何 `<pattern>` 带 `patternTransform` 属性即抛错（ADR 0001，违反即导出错位）。
 * 3. 纹理 dataURL 内嵌自包含、底图不含 —— 由上游 `buildRawSvg` 构造保证，此处原样保留。
 */
export function postProcessSvg(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error(`SVG post-process: 无法解析 SVG: ${parserError.textContent ?? ''}`);
  }
  const root = doc.documentElement;

  // ADR 0001 契约断言：pattern 不设 transform
  for (const pattern of Array.from(doc.querySelectorAll('pattern'))) {
    if (pattern.hasAttribute('patternTransform')) {
      throw new Error('SVG post-process: pattern 含 patternTransform，违反 ADR 0001 契约');
    }
  }

  let defs = doc.querySelector('defs');
  if (!defs) {
    defs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
    root.insertBefore(defs, root.firstChild);
  }
  // pattern/filter 收进 defs（严格渲染器 Inkscape/librsvg 要求；id 引用不变，原位置不留占位）
  for (const selector of ['pattern', 'filter'] as const) {
    for (const el of Array.from(doc.querySelectorAll(selector))) {
      defs.appendChild(el);
    }
  }
  return new XMLSerializer().serializeToString(doc);
}

/**
 * 从 project schema 重建纸片并产出 fabric 原生 SVG（不含底图、不含 preamble）。
 *
 * 离线重建走 PNG/SVG 共享底层 `buildStaticCanvas`（不传第三参，构造上排除底图），toSVG 后 dispose
 * （此前漏了 dispose，一并补上；dispose 返回 Promise 异步清理，临时 canvas 丢弃引用即可）。
 *
 * @param sources textureId → 已加载纹理源（缺省/悬空引用回退纯色填充）。
 */
export function buildRawSvg(
  project: PaperProject,
  sources: Map<string, CanvasImageSource>,
): string {
  const canvas = buildStaticCanvas(project, sources);
  try {
    return canvas.toSVG({ suppressPreamble: true });
  } finally {
    void canvas.dispose();
  }
}

/**
 * 导出管线：经纹理供给 load 侧加载纹理源（同一 dataURL 复用）→ 从 schema 重建 → post-process。
 * @param loader 纹理供给 load 侧（默认应用级单例；测试注入 fake）。
 * @returns 规范化后的 SVG 字符串（pattern/filter 在 defs 内、无 patternTransform、自包含）。
 */
export async function exportProjectToSVG(
  project: PaperProject,
  loader: TextureLoadSide = textureSupply,
): Promise<string> {
  const sources = new Map<string, CanvasImageSource>();
  for (const texture of project.textures) {
    sources.set(texture.id, await loader.load(texture.dataUrl));
  }
  return postProcessSvg(buildRawSvg(project, sources));
}

/**
 * 浏览器下载保存 .svg（简单可靠；Tauri 文件对话框后续统一，T12 自动保存未做）。
 */
export function saveSvgFile(svg: string, filename = 'pasteup.svg'): void {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
