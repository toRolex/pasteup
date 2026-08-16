/**
 * PNG 导出离线化（#49）seam 测试 —— 全量重写（旧 exportCanvasToPNG live seam 全部作废）。
 *
 * 主 seam：`exportProjectToPNG(project, options, loader)` 一次性无状态——await 全部纹理 resolve →
 * buildStaticCanvas 离线重建临时 StaticCanvas（不碰活画布）→ toDataURL → dispose。
 *
 * 测试策略（jsdom 无真实渲染）：保留**真实** StaticCanvas（svg.test 已实证 jsdom 可构造/add/toSVG），
 * 唯一不能跑的是 toDataURL（内部 getContext('2d') 得 null）——故 spy `StaticCanvas.prototype.toDataURL`，
 * 在 spy 内同步捕获 width/height/对象填充/底图快照做契约断言；`FabricImage.fromURL` 显式 stub
 * （否则 jsdom 会真实尝试图片解码 → 悬挂/unhandled rejection）；纹理 loader 注入 fake。
 * 真实像素一致由浏览器手测兜底（Q5 checklist）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StaticCanvas, FabricImage, Pattern } from 'fabric';
import {
  createEmptyProject,
  createPaperElement,
  createPaperTexture,
  type PaperProject,
} from '../types/project';
import type { TextureLoadSide } from '../texture/supply';
import { downloadPNG, exportProjectToPNG } from './png';

const RECT = 'M 0 0 L 100 0 L 100 80 L 0 80 Z';
const FAKE_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';
const BG_DATA_URL = 'data:image/jpeg;base64,BGIMAGE';

/** jsdom fake 已解码纹理源（真实管线在浏览器 Image decode，测试注入）。 */
const FAKE_SOURCE = {
  width: 64,
  height: 48,
  src: 'data:image/png;base64,AAAA',
} as unknown as CanvasImageSource;

/** fake 底图（带 dispose + render：StaticCanvas destroy 会调 backgroundImage.dispose()，
 *  rAF 调度的 renderAll 会调 backgroundImage.render(ctx)；jsdom 装了 node-canvas，渲染真实发生）。 */
const FAKE_BG = { dispose: vi.fn(), render: vi.fn() } as unknown as FabricImage;

/** toDataURL 调用时同步捕获的画布状态快照（dispose 前取，避免异步清理竞态）。 */
interface CapturedSnapshot {
  args?: Record<string, unknown>;
  width?: number;
  height?: number;
  objectCount?: number;
  fills?: unknown[];
  backgroundImage?: unknown;
}

/** spy toDataURL：截获导出参数 + 同步快照画布状态，返回 fake dataURL。 */
function spyToDataURL() {
  const captured: CapturedSnapshot = {};
  const spy = vi
    .spyOn(StaticCanvas.prototype, 'toDataURL')
    .mockImplementation(function (this: StaticCanvas, options) {
      captured.args = options as Record<string, unknown>;
      captured.width = this.width;
      captured.height = this.height;
      captured.objectCount = this.getObjects().length;
      captured.fills = this.getObjects().map((o) => o.fill);
      captured.backgroundImage = this.backgroundImage;
      return FAKE_DATA_URL;
    });
  return { spy, captured };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 单纹理纸片项目：textureId 'tex-1' 引用 dataUrl 'data:...AAAA'。 */
function texturedProject(): PaperProject {
  const project = createEmptyProject(1200, 800);
  project.textures.push(
    createPaperTexture({ id: 'tex-1', style: 'fold', seed: 1, color: '#c0392b', dataUrl: 'data:image/png;base64,AAAA' }),
  );
  project.elements.push(createPaperElement({ path: RECT, color: '#c0392b', textureId: 'tex-1' }));
  return project;
}

/** 立即 resolve 的 fake 纹理 loader。 */
function okLoader(): TextureLoadSide & { load: ReturnType<typeof vi.fn> } {
  return { load: vi.fn(async () => FAKE_SOURCE) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('exportProjectToPNG（离线导出 seam）— StaticCanvas 重建与 toDataURL 契约', () => {
  it('返回 {dataUrl,width,height}，离线 StaticCanvas 尺寸 = project.canvas（seam：尺寸参数）', async () => {
    const project = createEmptyProject(2480, 3508);
    const { captured } = spyToDataURL();

    const result = await exportProjectToPNG(project, {}, okLoader());

    expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.width).toBe(project.canvas.width);
    expect(result.height).toBe(project.canvas.height);
    // 离线重建的 StaticCanvas 尺寸与 project.canvas 一致
    expect(captured.width).toBe(2480);
    expect(captured.height).toBe(3508);
  });

  it('以正确导出参数调用 toDataURL：format png / multiplier 1 / enableRetinaScaling false（seam：参数契约）', async () => {
    const project = createEmptyProject(2480, 3508);
    const { captured } = spyToDataURL();

    await exportProjectToPNG(project, {}, okLoader());

    expect(captured.args).toEqual({
      format: 'png',
      multiplier: 1,
      enableRetinaScaling: false,
    });
  });

  it('multiplier 透传：toDataURL 收到 multiplier:2，输出尺寸 = 画布像素 × 2（seam：multiplier）', async () => {
    const project = createEmptyProject(2480, 3508);
    const { captured } = spyToDataURL();

    const result = await exportProjectToPNG(project, { multiplier: 2 }, okLoader());

    expect(captured.args).toEqual({ format: 'png', multiplier: 2, enableRetinaScaling: false });
    expect(result.width).toBe(project.canvas.width * 2);
    expect(result.height).toBe(project.canvas.height * 2);
  });

  it('每个纸片重建进离线画布（数组序即 z 序）', async () => {
    const project = createEmptyProject(1200, 800);
    project.elements.push(
      createPaperElement({ path: RECT, color: '#c0392b' }),
      createPaperElement({ path: RECT, color: '#2e86c1', transform: { x: 500, y: 300, rotation: 0, scaleX: 1, scaleY: 1 } }),
    );
    const { captured } = spyToDataURL();

    await exportProjectToPNG(project, {}, okLoader());

    expect(captured.objectCount).toBe(2);
  });
});

describe('exportProjectToPNG — 纹理 await 后导出（原占位 bug 修复核心）', () => {
  it('纹理 await 后才导出：load 未 resolve 时 toDataURL 不被调用，resolve 后才截屏', async () => {
    const project = texturedProject();
    const d = deferred<CanvasImageSource>();
    const load = vi.fn(() => d.promise);
    const { spy } = spyToDataURL();

    const p = exportProjectToPNG(project, {}, { load });
    // 同步即未调用：第一次 await loader.load 挂起（离线导出等待全纹理）
    expect(spy).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();

    d.resolve(FAKE_SOURCE);
    await p;
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('纹理纸片导出为纹理色（Pattern 填充）而非占位纯色（核心回归断言）', async () => {
    const project = texturedProject();
    const load = vi.fn(async () => FAKE_SOURCE);
    const { captured } = spyToDataURL();

    await exportProjectToPNG(project, {}, { load });

    expect(load).toHaveBeenCalledWith('data:image/png;base64,AAAA');
    expect(captured.fills).toHaveLength(1);
    expect(captured.fills![0]).toBeInstanceOf(Pattern);
  });

  it('单个纹理解码失败：该纸片回退纯色填充，整体导出不中断（seam：失败回退纯色）', async () => {
    const project = texturedProject();
    const load = vi.fn(async () => {
      throw new Error('decode fail');
    });
    const { captured } = spyToDataURL();

    const result = await exportProjectToPNG(project, {}, { load });

    expect(result.dataUrl).toBe(FAKE_DATA_URL);
    expect(captured.fills![0]).toBe('#c0392b'); // 回退 element.color 纯色
  });

  it('同一 dataURL 多条纹理记录经 loader 各 load 一次（sources 以 texture.id 为键）', async () => {
    const project = createEmptyProject(200, 200);
    project.textures.push(
      createPaperTexture({ id: 'tex-1', style: 'fold', seed: 1, color: '#c0392b', dataUrl: 'D1' }),
      createPaperTexture({ id: 'tex-2', style: 'fold', seed: 2, color: '#c0392b', dataUrl: 'D1' }),
    );
    project.elements.push(
      createPaperElement({ path: RECT, color: '#c0392b', textureId: 'tex-1' }),
      createPaperElement({ path: RECT, color: '#c0392b', textureId: 'tex-2', transform: { x: 120, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } }),
    );
    const load = vi.fn(async () => FAKE_SOURCE);
    spyToDataURL();

    await exportProjectToPNG(project, {}, { load });

    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledWith('D1');
  });
});

describe('exportProjectToPNG — 底图条件包含与失败 warn', () => {
  function bgProject(overrides: Partial<{ dataUrl: string | null; visible: boolean }> = {}): PaperProject {
    const project = createEmptyProject(1200, 800);
    project.elements.push(createPaperElement({ path: RECT, color: '#c0392b' }));
    project.bgPhoto = { dataUrl: BG_DATA_URL, visible: true, ...overrides };
    return project;
  }

  it('默认（includeBackground false）不含底图：fromURL 不调用，导出无 backgroundImage', async () => {
    const fromURL = vi.spyOn(FabricImage, 'fromURL').mockResolvedValue(FAKE_BG);
    const { captured } = spyToDataURL();

    await exportProjectToPNG(bgProject(), {}, okLoader());

    expect(fromURL).not.toHaveBeenCalled();
    expect(captured.backgroundImage).toBeUndefined();
  });

  it('includeBackground:true 且底图 visible → fromURL 加载并设为 backgroundImage', async () => {
    const fromURL = vi.spyOn(FabricImage, 'fromURL').mockResolvedValue(FAKE_BG);
    const { captured } = spyToDataURL();

    await exportProjectToPNG(bgProject({ visible: true }), { includeBackground: true }, okLoader());

    expect(fromURL).toHaveBeenCalledWith(BG_DATA_URL);
    expect(captured.backgroundImage).toBe(FAKE_BG);
  });

  it('includeBackground:true 但底图 visible:false → 不含底图（fromURL 不调用）', async () => {
    const fromURL = vi.spyOn(FabricImage, 'fromURL').mockResolvedValue(FAKE_BG);
    const { captured } = spyToDataURL();

    await exportProjectToPNG(bgProject({ visible: false }), { includeBackground: true }, okLoader());

    expect(fromURL).not.toHaveBeenCalled();
    expect(captured.backgroundImage).toBeUndefined();
  });

  it('includeBackground:true 但 bgPhoto.dataUrl 为 null → 不含底图（fromURL 不调用）', async () => {
    const fromURL = vi.spyOn(FabricImage, 'fromURL').mockResolvedValue(FAKE_BG);
    const { captured } = spyToDataURL();

    await exportProjectToPNG(bgProject({ dataUrl: null }), { includeBackground: true }, okLoader());

    expect(fromURL).not.toHaveBeenCalled();
    expect(captured.backgroundImage).toBeUndefined();
  });

  it('底图加载失败：console.warn 提示并按无底图导出（一次性用户动作不静默）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(FabricImage, 'fromURL').mockRejectedValue(new Error('bg decode fail'));
    const { captured } = spyToDataURL();

    const result = await exportProjectToPNG(bgProject(), { includeBackground: true }, okLoader());

    expect(warn).toHaveBeenCalledTimes(1);
    expect(result.dataUrl).toBe(FAKE_DATA_URL);
    expect(captured.backgroundImage).toBeUndefined();
  });
});

describe('downloadPNG（浏览器下载，不变）', () => {
  it('创建 a[download][href=dataUrl] 并触发 click', () => {
    const createSpy = vi.spyOn(document, 'createElement');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadPNG(FAKE_DATA_URL, 'pasteup-export.png');

    const anchor = createSpy.mock.results[0].value as HTMLAnchorElement;
    expect(anchor.tagName.toLowerCase()).toBe('a');
    expect(anchor.href).toBe(FAKE_DATA_URL);
    expect(anchor.download).toBe('pasteup-export.png');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
