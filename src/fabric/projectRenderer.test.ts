/**
 * projectRenderer 渲染失效 headless 直测（#47）。
 *
 * 渲染知识收进有状态 module，壳不感知：render 走 diffProject 三态路径（none 不重绘 /
 * bg-only 只切底图可见性 / full 全量重建），selection 跨重建保持，异步纹理 resolve
 * 防旧覆盖，失败回退纯色，dispose 清内部状态。先例：paperBridge.test.ts（fabric headless，
 * afterEach dispose）、svg.test.ts（注入 loader）。fake loader 按 dataUrl 手动 resolve/reject。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { Canvas, FabricImage, Pattern } from 'fabric';
import {
  createEmptyProject,
  createPaperElement,
  createPaperTexture,
  type PaperProject,
} from '../types/project';
import type { TextureLoadSide } from '../texture/supply';
import { createProjectRenderer } from './projectRenderer';

const RECT = 'M 0 0 L 100 0 L 100 80 L 0 80 Z';

/** jsdom fake 已解码图像源（真实管线在浏览器/Image decode，测试注入）。 */
const FAKE_SOURCE = {
  width: 64,
  height: 48,
  src: 'data:image/png;base64,TEX',
} as unknown as CanvasImageSource;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 可控 fake 纹理加载器：按 dataUrl 返回待决 Promise，测试手动 resolve/reject。 */
function deferredLoader(): TextureLoadSide & {
  resolve: (url: string, src: CanvasImageSource) => void;
  reject: (url: string, reason?: unknown) => void;
} {
  const pending = new Map<string, Deferred<CanvasImageSource>>();
  const load = vi.fn((dataUrl: string) => {
    const d = deferred<CanvasImageSource>();
    pending.set(dataUrl, d);
    return d.promise;
  });
  return {
    load,
    resolve(url, src) {
      pending.get(url)?.resolve(src);
    },
    reject(url, reason) {
      pending.get(url)?.reject(reason);
    },
  };
}

function patternSource(fill: unknown): unknown {
  return (fill as { source?: unknown } | undefined)?.source;
}

/** flush 微任务 + 宏任务一轮（让 fromURL/loader 的 .then 落定；用于「被丢弃」类负断言）。 */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** fabric 底图 mock（fromURL resolve 值；visible 可被 renderer 切换）。 */
function mockBgImage(): FabricImage {
  return { width: 1200, height: 800, visible: true, render: () => {}, dispose: () => {} } as unknown as FabricImage;
}

/** 单纸片项目（无纹理、无底图；位置可覆盖）。 */
function projectWithPaper(
  transform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
): PaperProject {
  const project = createEmptyProject(1200, 800);
  project.elements.push(createPaperElement({ path: RECT, color: '#c0392b', transform }));
  return project;
}

/** 单纹理纸片项目（textureId 引用 textures 表一条记录；paperId 可指定用于防旧覆盖场景）。 */
function texturedProject(texId: string, dataUrl: string, paperId = 'paper-1'): PaperProject {
  const project = createEmptyProject(1200, 800);
  project.textures.push(
    createPaperTexture({ id: texId, style: 'fold', seed: 1, color: '#7A8B5C', dataUrl }),
  );
  project.elements.push(createPaperElement({ id: paperId, path: RECT, color: '#7A8B5C', textureId: texId }));
  return project;
}

describe('projectRenderer（#47）— diffProject 三态路径', () => {
  const canvases: Canvas[] = [];
  afterEach(() => {
    canvases.splice(0).forEach((c) => c.dispose());
    vi.restoreAllMocks();
  });

  function mountCanvas(): Canvas {
    const canvas = new Canvas(document.createElement('canvas'), { width: 1200, height: 800 });
    canvases.push(canvas);
    return canvas;
  }

  it('full：render 把 elements 命令式推送到画布（占位纯色 + transform）', () => {
    const canvas = mountCanvas();
    const renderer = createProjectRenderer(canvas, deferredLoader());
    const project = projectWithPaper({ x: 24, y: 48, rotation: 0, scaleX: 1, scaleY: 1 });

    renderer.render(project);

    expect(canvas.getObjects()).toHaveLength(1);
    const paper = canvas.getObjects()[0];
    expect(paper.fill).toBe('#c0392b');
    expect(paper.left).toBe(24);
    expect(paper.top).toBe(48);
  });

  it('full：elements 引用变化 → 整体重建（对象被替换为新 identity）', () => {
    const canvas = mountCanvas();
    const renderer = createProjectRenderer(canvas, deferredLoader());
    const base = projectWithPaper({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    renderer.render(base);
    const before = canvas.getObjects()[0];

    const moved = {
      ...base,
      elements: base.elements.map((el) => ({ ...el, transform: { ...el.transform, x: 100 } })),
    };
    renderer.render(moved);

    expect(canvas.getObjects()[0]).not.toBe(before);
    expect(canvas.getObjects()[0].left).toBe(100);
  });

  it('none：四引用全相等（仅顶层对象换新）时不重绘（对象不重建、不再 clear）', () => {
    const canvas = mountCanvas();
    const renderer = createProjectRenderer(canvas, deferredLoader());
    const project = projectWithPaper();
    renderer.render(project);
    const obj = canvas.getObjects()[0];
    const clearSpy = vi.spyOn(canvas, 'clear');

    renderer.render({ ...project }); // 顶层新引用、四字段引用全等 → none

    expect(canvas.getObjects()[0]).toBe(obj);
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it('bg-only：仅切 backgroundImage.visible，不重建元素（对象 identity 保持）', async () => {
    vi.spyOn(FabricImage, 'fromURL').mockResolvedValue(mockBgImage());
    const canvas = mountCanvas();
    const renderer = createProjectRenderer(canvas, deferredLoader());
    const base = projectWithPaper();
    base.bgPhoto = { dataUrl: 'data:image/png;base64,AA', visible: true };
    renderer.render(base);
    await waitFor(() => expect(canvas.backgroundImage).toBeDefined());
    expect(canvas.backgroundImage!.visible).toBe(true);
    const paper = canvas.getObjects()[0];

    // core 引用不变、bgPhoto 换新引用同 dataUrl（visible 翻转）→ bg-only
    const hidden = { ...base, bgPhoto: { ...base.bgPhoto!, visible: false } };
    renderer.render(hidden);

    expect(canvas.backgroundImage!.visible).toBe(false);
    expect(canvas.getObjects()[0]).toBe(paper);
  });

  it('有底图时 elements 变化仍全量重建（不落入 bg-only 快速路径）', async () => {
    vi.spyOn(FabricImage, 'fromURL').mockResolvedValue(mockBgImage());
    const canvas = mountCanvas();
    const renderer = createProjectRenderer(canvas, deferredLoader());
    const base = projectWithPaper({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    base.bgPhoto = { dataUrl: 'data:image/png;base64,AA', visible: true };
    renderer.render(base);
    await waitFor(() => expect(canvas.backgroundImage).toBeDefined());
    expect(canvas.getObjects()[0].left).toBe(0);

    const moved = {
      ...base,
      elements: base.elements.map((el) => ({ ...el, transform: { ...el.transform, x: 100, y: 200 } })),
    };
    renderer.render(moved);
    expect(canvas.getObjects()[0].left).toBe(100);

    const restored = {
      ...moved,
      elements: moved.elements.map((el) => ({ ...el, transform: { ...el.transform, x: 0, y: 0 } })),
    };
    renderer.render(restored);
    expect(canvas.getObjects()[0].left).toBe(0);
  });
});

describe('projectRenderer（#47）— selection 跨重建保持', () => {
  const canvases: Canvas[] = [];
  afterEach(() => {
    canvases.splice(0).forEach((c) => c.dispose());
    vi.restoreAllMocks();
  });

  function mountCanvas(): Canvas {
    const canvas = new Canvas(document.createElement('canvas'), { width: 1200, height: 800 });
    canvases.push(canvas);
    return canvas;
  }

  it('render 开始读当前 activeObject 的 paperId，全量重建后按 id 恢复选中', () => {
    const canvas = mountCanvas();
    const renderer = createProjectRenderer(canvas, deferredLoader());
    const project = createEmptyProject(1200, 800);
    project.elements.push(
      createPaperElement({ id: 'paper-a', path: RECT, color: '#c0392b' }),
      createPaperElement({
        id: 'paper-b',
        path: RECT,
        color: '#7A8B5C',
        transform: { x: 200, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      }),
    );
    renderer.render(project);

    const objB = canvas.getObjects().find((o) => o.paperId === 'paper-b')!;
    canvas.setActiveObject(objB);
    expect(canvas.getActiveObject()?.paperId).toBe('paper-b');

    // 全量重建（elements 新引用）→ 重建丢对象，但选中按 paperId 恢复
    const next = { ...project, elements: project.elements.map((el) => ({ ...el })) };
    renderer.render(next);

    expect(canvas.getActiveObject()?.paperId).toBe('paper-b');
    expect(canvas.getObjects().some((o) => o.paperId === 'paper-b')).toBe(true);
  });

  it('重建后目标纸片已删除时不恢复（activeObject 为空）', () => {
    const canvas = mountCanvas();
    const renderer = createProjectRenderer(canvas, deferredLoader());
    const project = createEmptyProject(1200, 800);
    project.elements.push(createPaperElement({ id: 'paper-a', path: RECT, color: '#c0392b' }));
    renderer.render(project);
    canvas.setActiveObject(canvas.getObjects()[0]);
    expect(canvas.getActiveObject()?.paperId).toBe('paper-a');

    // 重建为无元素项目 → 目标不存在，不强行恢复
    renderer.render(createEmptyProject(1200, 800));
    expect(canvas.getActiveObject()).toBeUndefined();
  });
});

describe('projectRenderer（#47）— 运行时纹理管线（占位 → 异步 Pattern）', () => {
  const canvases: Canvas[] = [];
  afterEach(() => {
    canvases.splice(0).forEach((c) => c.dispose());
    vi.restoreAllMocks();
  });

  function mountCanvas(): Canvas {
    const canvas = new Canvas(document.createElement('canvas'), { width: 1200, height: 800 });
    canvases.push(canvas);
    return canvas;
  }

  it('textureId 引用：加载完成前纯色占位，完成后更新为 Pattern（repeat，源为已解码图像源）', async () => {
    const canvas = mountCanvas();
    const loader = deferredLoader();
    const renderer = createProjectRenderer(canvas, loader);
    renderer.render(texturedProject('tex-1', 'D1'));
    const paper = canvas.getObjects()[0];
    expect(paper.fill).toBe('#7A8B5C'); // 占位纯色（未解码前不设 Pattern）

    loader.resolve('D1', FAKE_SOURCE);
    await waitFor(() => expect(paper.fill).toBeInstanceOf(Pattern));
    expect(patternSource(paper.fill)).toBe(FAKE_SOURCE);
    expect((paper.fill as unknown as { repeat?: string }).repeat).toBe('repeat');
  });

  it('textureId 指向缺失记录时保持纯色填充（不发起加载、不抛错）', () => {
    const canvas = mountCanvas();
    const loader = deferredLoader();
    const renderer = createProjectRenderer(canvas, loader);
    const project = createEmptyProject(1200, 800);
    project.elements.push(createPaperElement({ path: RECT, color: '#c0392b', textureId: 'missing' }));

    renderer.render(project);

    expect(canvas.getObjects()[0].fill).toBe('#c0392b');
    expect(loader.load).not.toHaveBeenCalled();
  });

  it('无纹理纸片保持纯色填充（loader 不调用）', () => {
    const canvas = mountCanvas();
    const loader = deferredLoader();
    const renderer = createProjectRenderer(canvas, loader);
    renderer.render(projectWithPaper());
    expect(canvas.getObjects()[0].fill).toBe('#c0392b');
    expect(loader.load).not.toHaveBeenCalled();
  });

  it('多纸片各自独立加载互不影响：先完成的更新自己，另一张保持占位', async () => {
    const canvas = mountCanvas();
    const loader = deferredLoader();
    const renderer = createProjectRenderer(canvas, loader);
    const project = createEmptyProject(1200, 800);
    project.textures.push(
      createPaperTexture({ id: 'tex-1', style: 'fold', seed: 1, color: '#c0392b', dataUrl: 'D1' }),
      createPaperTexture({ id: 'tex-2', style: 'fold', seed: 2, color: '#c0392b', dataUrl: 'D2' }),
    );
    project.elements.push(
      createPaperElement({ path: RECT, color: '#c0392b', textureId: 'tex-1' }),
      createPaperElement({
        path: RECT,
        color: '#c0392b',
        textureId: 'tex-2',
        transform: { x: 200, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      }),
    );
    renderer.render(project);
    const [p1, p2] = canvas.getObjects();
    expect(p1.fill).toBe('#c0392b');
    expect(p2.fill).toBe('#c0392b');

    loader.resolve('D1', FAKE_SOURCE);
    await waitFor(() => expect(p1.fill).toBeInstanceOf(Pattern));
    expect(patternSource(p1.fill)).toBe(FAKE_SOURCE);
    expect(p2.fill).toBe('#c0392b'); // 另一张仍占位，互不影响

    loader.resolve('D2', FAKE_SOURCE);
    await waitFor(() => expect(p2.fill).toBeInstanceOf(Pattern));
    expect(p1.fill).toBeInstanceOf(Pattern);
  });

  it('纹理加载失败：回退纯色，不抛错、画布不中断', async () => {
    const canvas = mountCanvas();
    const loader = deferredLoader();
    const renderer = createProjectRenderer(canvas, loader);
    renderer.render(texturedProject('tex-1', 'D1'));
    const paper = canvas.getObjects()[0];
    expect(paper.fill).toBe('#7A8B5C');

    loader.reject('D1', new Error('load fail'));
    await flush();

    expect(paper.fill).toBe('#7A8B5C'); // 保持纯色
    expect(canvas.getObjects()).toHaveLength(1); // 画布不中断、不白屏
  });
});

describe('projectRenderer（#47）— 异步纹理防旧覆盖（renderer 内部快照校验）', () => {
  const canvases: Canvas[] = [];
  afterEach(() => {
    canvases.splice(0).forEach((c) => c.dispose());
    vi.restoreAllMocks();
  });

  function mountCanvas(): Canvas {
    const canvas = new Canvas(document.createElement('canvas'), { width: 1200, height: 800 });
    canvases.push(canvas);
    return canvas;
  }

  it('快速连续渲染：旧纹理加载结果不覆盖新渲染', async () => {
    const canvas = mountCanvas();
    const loader = deferredLoader();
    const renderer = createProjectRenderer(canvas, loader);
    renderer.render(texturedProject('tex-1', 'D1', 'paper-a'));
    renderer.render(texturedProject('tex-2', 'D2', 'paper-b')); // 全量重建
    const current = canvas.getObjects()[0];
    expect(current.fill).toBe('#7A8B5C'); // 新渲染占位

    // 旧纹理（D1）先加载完成 → 必须被丢弃，不覆盖新渲染
    loader.resolve('D1', FAKE_SOURCE);
    await flush();
    expect(current.fill).toBe('#7A8B5C');

    // 新纹理（D2）加载完成 → 正常应用
    loader.resolve('D2', FAKE_SOURCE);
    await waitFor(() => expect(current.fill).toBeInstanceOf(Pattern));
    expect(patternSource(current.fill)).toBe(FAKE_SOURCE);
  });

  it('同一纸片纹理重合成（同 id 新 dataUrl）：旧加载结果被丢弃，新纹理正常应用', async () => {
    const canvas = mountCanvas();
    const loader = deferredLoader();
    const renderer = createProjectRenderer(canvas, loader);
    renderer.render(texturedProject('tex-1', 'D1', 'paper-1'));
    // 用户改色/缩放 → 同一纹理记录重合成出新 dataURL（同 id，D1 → D2），纸片 id 不变
    renderer.render(texturedProject('tex-1', 'D2', 'paper-1'));
    const current = canvas.getObjects()[0];
    expect(current.fill).toBe('#7A8B5C');

    // 旧纹理（D1）先加载完成 → 同纸片当前 dataUrl 已是 D2，必须丢弃不覆盖
    loader.resolve('D1', FAKE_SOURCE);
    await flush();
    expect(current.fill).toBe('#7A8B5C');

    // 新纹理（D2）加载完成 → 正常应用
    loader.resolve('D2', FAKE_SOURCE);
    await waitFor(() => expect(current.fill).toBeInstanceOf(Pattern));
    expect(patternSource(current.fill)).toBe(FAKE_SOURCE);
  });
});

describe('projectRenderer（#47）— dispose 清内部状态', () => {
  const canvases: Canvas[] = [];
  afterEach(() => {
    canvases.splice(0).forEach((c) => c.dispose());
    vi.restoreAllMocks();
  });

  function mountCanvas(): Canvas {
    const canvas = new Canvas(document.createElement('canvas'), { width: 1200, height: 800 });
    canvases.push(canvas);
    return canvas;
  }

  it('dispose 后 render 变 no-op（不再重绘，canvas 生命周期归壳）', () => {
    const canvas = mountCanvas();
    const renderer = createProjectRenderer(canvas, deferredLoader());
    renderer.render(projectWithPaper());
    expect(canvas.getObjects()).toHaveLength(1);

    renderer.dispose();
    renderer.render(createEmptyProject(1200, 800)); // no-op：不再重绘
    expect(canvas.getObjects()).toHaveLength(1); // 仍是原纸片
  });

  it('dispose 后迟到的异步纹理 resolve 不再写入画布', async () => {
    const canvas = mountCanvas();
    const loader = deferredLoader();
    const renderer = createProjectRenderer(canvas, loader);
    renderer.render(texturedProject('tex-1', 'D1'));
    const paper = canvas.getObjects()[0];
    expect(paper.fill).toBe('#7A8B5C');

    renderer.dispose();
    loader.resolve('D1', FAKE_SOURCE);
    await flush();

    expect(paper.fill).toBe('#7A8B5C'); // 未更新为 Pattern
  });
});
