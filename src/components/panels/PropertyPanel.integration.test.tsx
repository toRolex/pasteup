/**
 * T18-b 属性面板 → 画布实时渲染集成测试（主 seam）。
 *
 * 链路：属性面板按钮 → propertyEdit 不可变重合成（mock tintCache 廉价 dataURL）→
 * commitProject（写撤销栈）→ store project 变化 → FabricCanvas → projectRenderer →
 * 共享纹理加载器异步加载 → Pattern 更新。走真实 store（Zustand），RTL 渲染
 * FabricCanvas + PropertyPanel 两个组件。
 *
 * 覆盖验收：
 * 1. 切 6 种纹理风格任一 → 画布纸片 pattern 源更新为对应新 dataURL 解码源
 * 2. 调色 / 缩放 / 旋转 → 纹理重合成新 dataURL → 画布 pattern 更新
 * 3. undo / redo 纹理属性变更 → 画布渲染与 store project 一致
 * 4. 快速连续 undo/redo（异步加载中）→ 不出现旧状态覆盖（projectRenderer 内部快照防旧覆盖）
 * 5. 关闭纹理（点「无」）→ 纸片恢复纯色填充（无 pattern）
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Canvas, Pattern } from 'fabric';
import type { TextureLoader } from '../../texture/loader';
import { FabricCanvas } from '../canvas/FabricCanvas';
import { PropertyPanel } from './PropertyPanel';
import { useProjectStore } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import {
  createEmptyProject,
  createPaperElement,
  type PaperProject,
} from '../../types/project';

// propertyEdit 默认 tintTextureCache 走真实合成（1024² fbm）过慢；注入按维度编码的
// 廉价 dataURL，让「重合成出新 dataURL」可被加载器与断言观察到。
vi.mock('../../texture/cache', () => ({
  tintTextureCache: {
    get: vi.fn(
      (request: { style: string; color: string; scale: number; rotate: number }) =>
        `data:image/png;base64,${request.style}|${request.color}|${request.scale}|${request.rotate}`,
    ),
  },
}));

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

/** 可控 fake 纹理加载器：按 dataUrl 返回待决 Promise，测试手动 resolve。 */
function deferredLoader(): TextureLoader & { resolve: (url: string, src: CanvasImageSource) => void } {
  const pending = new Map<string, Deferred<CanvasImageSource>>();
  const load = vi.fn((dataUrl: string) => {
    const d = deferred<CanvasImageSource>();
    pending.set(dataUrl, d);
    return d.promise;
  });
  return {
    load,
    size: 0,
    clear: vi.fn(),
    resolve(url, src) {
      pending.get(url)?.resolve(src);
    },
  };
}

function patternSource(fill: unknown): unknown {
  return (fill as { source?: unknown } | undefined)?.source;
}

/** 集成 harness：真实 store 驱动，FabricCanvas 单向消费 project，PropertyPanel 提交变更。 */
function Harness({
  loader,
  onReady,
}: {
  loader: TextureLoader;
  onReady: (canvas: Canvas) => void;
}) {
  const project = useProjectStore((s) => s.project);
  return (
    <>
      <FabricCanvas project={project} textureLoader={loader} onReady={onReady} />
      <PropertyPanel selectedId="paper-1" />
    </>
  );
}

function projectWithPaper(): PaperProject {
  const project = createEmptyProject(1200, 800);
  project.elements.push(
    createPaperElement({
      id: 'paper-1',
      path: 'M 0 0 L 100 0 L 100 80 L 0 80 Z',
      color: '#7A8B5C',
      opacity: 1,
      textureId: null,
      textureScale: 1,
      seed: 42,
    }),
  );
  return project;
}

/** 当前 store 里纸片引用的纹理记录。 */
function currentTexture() {
  const st = useProjectStore.getState();
  const el = st.project.elements[0];
  return st.project.textures.find((t) => t.id === el.textureId);
}

describe('T18-b 集成：属性面板切换纹理风格 → 画布实时重绘（6 种）', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: projectWithPaper(), undoStack: [], redoStack: [] });
    useEditorStore.setState({ currentColor: '#000000', recentColors: [] });
  });

  it.each(['fold', 'watercolor', 'grain', 'weave', 'marble', 'fiber'] as const)(
    '切纹理风格「%s」→ 画布纸片 pattern 源更新为对应新 dataURL 解码源',
    async (style) => {
      const loader = deferredLoader();
      let canvas: Canvas | undefined;
      render(<Harness loader={loader} onReady={(c) => { canvas = c; }} />);
      expect(canvas!.getObjects()[0].fill).toBe('#7A8B5C'); // 初始纯色

      fireEvent.click(screen.getByTestId(`texture-${style}`));
      const tex = currentTexture();
      expect(tex?.style).toBe(style);
      // 画布先纯色占位，已发起对应新 dataURL 的加载
      expect(canvas!.getObjects()[0].fill).toBe('#7A8B5C');
      expect(loader.load).toHaveBeenCalledWith(tex!.dataUrl);

      loader.resolve(tex!.dataUrl, FAKE_SOURCE);
      await waitFor(() =>
        expect(patternSource(canvas!.getObjects()[0].fill)).toBe(FAKE_SOURCE),
      );
      expect(canvas!.getObjects()[0].fill).toBeInstanceOf(Pattern);
      // 画布渲染与 store 一致：pattern 源对应当前 store dataURL
      expect(currentTexture()!.dataUrl).toBe(tex!.dataUrl);
    },
  );
});

describe('T18-b 集成：调色 / 缩放 / 旋转 → 纹理重合成新 dataURL → 画布 pattern 更新', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: projectWithPaper(), undoStack: [], redoStack: [] });
    useEditorStore.setState({ currentColor: '#000000', recentColors: [] });
  });

  it('调整纸片颜色 → 重合成新 dataURL，画布 pattern 更新', async () => {
    const loader = deferredLoader();
    let canvas: Canvas | undefined;
    render(<Harness loader={loader} onReady={(c) => { canvas = c; }} />);

    fireEvent.click(screen.getByTestId('texture-grain'));
    const grainUrl = currentTexture()!.dataUrl;
    loader.resolve(grainUrl, FAKE_SOURCE);
    await waitFor(() =>
      expect(patternSource(canvas!.getObjects()[0].fill)).toBe(FAKE_SOURCE),
    );

    fireEvent.click(screen.getByTestId('property-color-c0392b'));
    const coloredUrl = currentTexture()!.dataUrl;
    expect(coloredUrl).not.toBe(grainUrl); // 新颜色 → 新 key → 重合成出新 dataURL
    expect(currentTexture()!.color).toBe('#c0392b');
    expect(canvas!.getObjects()[0].fill).toBe('#c0392b'); // 新渲染占位（颜色同步）
    expect(loader.load).toHaveBeenCalledWith(coloredUrl);

    loader.resolve(coloredUrl, FAKE_SOURCE);
    await waitFor(() =>
      expect(patternSource(canvas!.getObjects()[0].fill)).toBe(FAKE_SOURCE),
    );
    expect(currentTexture()!.dataUrl).toBe(coloredUrl);
  });

  it('调整纹理缩放 → 重合成新 dataURL，画布 pattern 更新', async () => {
    const loader = deferredLoader();
    let canvas: Canvas | undefined;
    render(<Harness loader={loader} onReady={(c) => { canvas = c; }} />);

    fireEvent.click(screen.getByTestId('texture-grain'));
    const grainUrl = currentTexture()!.dataUrl;
    loader.resolve(grainUrl, FAKE_SOURCE);
    await waitFor(() =>
      expect(patternSource(canvas!.getObjects()[0].fill)).toBe(FAKE_SOURCE),
    );

    fireEvent.change(screen.getByTestId('scale-slider'), { target: { value: '150' } });
    const scaledUrl = currentTexture()!.dataUrl;
    expect(currentTexture()!.scale).toBe(1.5);
    expect(useProjectStore.getState().project.elements[0].textureScale).toBe(1.5);
    expect(scaledUrl).not.toBe(grainUrl); // 缩放变化 → 新 key → 重合成出新 dataURL
    expect(canvas!.getObjects()[0].fill).toBe('#7A8B5C'); // 新渲染占位
    expect(loader.load).toHaveBeenCalledWith(scaledUrl);

    loader.resolve(scaledUrl, FAKE_SOURCE);
    await waitFor(() =>
      expect(patternSource(canvas!.getObjects()[0].fill)).toBe(FAKE_SOURCE),
    );
    expect(currentTexture()!.dataUrl).toBe(scaledUrl);
  });

  it('调整纹理旋转 → 重合成新 dataURL，画布 pattern 更新', async () => {
    const loader = deferredLoader();
    let canvas: Canvas | undefined;
    render(<Harness loader={loader} onReady={(c) => { canvas = c; }} />);

    fireEvent.click(screen.getByTestId('texture-grain'));
    const grainUrl = currentTexture()!.dataUrl;
    loader.resolve(grainUrl, FAKE_SOURCE);
    await waitFor(() =>
      expect(patternSource(canvas!.getObjects()[0].fill)).toBe(FAKE_SOURCE),
    );

    fireEvent.click(screen.getByTestId('rotate-90'));
    const rotatedUrl = currentTexture()!.dataUrl;
    expect(currentTexture()!.rotate).toBe(90);
    expect(rotatedUrl).not.toBe(grainUrl); // 旋转变化 → 新 key → 重合成出新 dataURL
    expect(canvas!.getObjects()[0].fill).toBe('#7A8B5C'); // 新渲染占位
    expect(loader.load).toHaveBeenCalledWith(rotatedUrl);

    loader.resolve(rotatedUrl, FAKE_SOURCE);
    await waitFor(() =>
      expect(patternSource(canvas!.getObjects()[0].fill)).toBe(FAKE_SOURCE),
    );
    expect(currentTexture()!.dataUrl).toBe(rotatedUrl);
  });
});

describe('T18-b 集成：undo/redo 纹理属性变更 → 画布渲染与 store 一致', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: projectWithPaper(), undoStack: [], redoStack: [] });
    useEditorStore.setState({ currentColor: '#000000', recentColors: [] });
  });

  it('切纹理 → 调色 → undo → redo：画布 pattern 源始终对应当前 store dataURL', async () => {
    const loader = deferredLoader();
    let canvas: Canvas | undefined;
    render(<Harness loader={loader} onReady={(c) => { canvas = c; }} />);

    // 1) 切 grain，完成加载
    fireEvent.click(screen.getByTestId('texture-grain'));
    const grainUrl = currentTexture()!.dataUrl;
    loader.resolve(grainUrl, FAKE_SOURCE);
    await waitFor(() =>
      expect(patternSource(canvas!.getObjects()[0].fill)).toBe(FAKE_SOURCE),
    );

    // 2) 调色 → 重合成出新 dataURL，完成加载
    fireEvent.click(screen.getByTestId('property-color-c0392b'));
    const coloredUrl = currentTexture()!.dataUrl;
    expect(coloredUrl).not.toBe(grainUrl);
    loader.resolve(coloredUrl, FAKE_SOURCE);
    await waitFor(() =>
      expect(patternSource(canvas!.getObjects()[0].fill)).toBe(FAKE_SOURCE),
    );

    // 3) undo → 回到调色前（grainUrl）；画布随 store 回退
    act(() => useProjectStore.getState().undo());
    expect(useProjectStore.getState().project.elements[0].color).toBe('#7A8B5C');
    expect(currentTexture()!.dataUrl).toBe(grainUrl);
    expect(canvas!.getObjects()[0].fill).toBe('#7A8B5C'); // 回退后的占位
    expect(loader.load).toHaveBeenCalledWith(grainUrl);
    loader.resolve(grainUrl, FAKE_SOURCE);
    await waitFor(() =>
      expect(patternSource(canvas!.getObjects()[0].fill)).toBe(FAKE_SOURCE),
    );

    // 4) redo → 回到调色后（coloredUrl）；画布随 store 前进
    act(() => useProjectStore.getState().redo());
    expect(useProjectStore.getState().project.elements[0].color).toBe('#c0392b');
    expect(currentTexture()!.dataUrl).toBe(coloredUrl);
    expect(canvas!.getObjects()[0].fill).toBe('#c0392b'); // 前进后的占位
    expect(loader.load).toHaveBeenCalledWith(coloredUrl);
    loader.resolve(coloredUrl, FAKE_SOURCE);
    await waitFor(() =>
      expect(patternSource(canvas!.getObjects()[0].fill)).toBe(FAKE_SOURCE),
    );
  });

  it('undo 清除纹理（回到无纹理快照）→ 画布恢复纯色填充', async () => {
    const loader = deferredLoader();
    let canvas: Canvas | undefined;
    render(<Harness loader={loader} onReady={(c) => { canvas = c; }} />);

    fireEvent.click(screen.getByTestId('texture-grain'));
    const grainUrl = currentTexture()!.dataUrl;
    loader.resolve(grainUrl, FAKE_SOURCE);
    await waitFor(() =>
      expect(patternSource(canvas!.getObjects()[0].fill)).toBe(FAKE_SOURCE),
    );

    // undo → 回到无纹理初始快照 → 纯色填充
    act(() => useProjectStore.getState().undo());
    expect(useProjectStore.getState().project.elements[0].textureId).toBeNull();
    const paper = canvas!.getObjects()[0];
    expect(paper.fill).toBe('#7A8B5C');
    expect(paper.fill).not.toBeInstanceOf(Pattern);

    // redo → 纹理恢复，画布重新加载并应用
    act(() => useProjectStore.getState().redo());
    expect(currentTexture()!.dataUrl).toBe(grainUrl);
    loader.resolve(grainUrl, FAKE_SOURCE);
    await waitFor(() =>
      expect(patternSource(canvas!.getObjects()[0].fill)).toBe(FAKE_SOURCE),
    );
    expect(useProjectStore.getState().project.elements[0].textureId).not.toBeNull();
  });
});

describe('T18-b 集成：快速连续切换 / undo/redo → 不出现旧状态覆盖', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: projectWithPaper(), undoStack: [], redoStack: [] });
    useEditorStore.setState({ currentColor: '#000000', recentColors: [] });
  });

  it('加载中快速切换两种风格：旧加载结果被丢弃，不覆盖新渲染', async () => {
    const loader = deferredLoader();
    let canvas: Canvas | undefined;
    render(<Harness loader={loader} onReady={(c) => { canvas = c; }} />);

    // 切 grain（加载中）→ 立即切 watercolor（加载中）
    fireEvent.click(screen.getByTestId('texture-grain'));
    const grainUrl = currentTexture()!.dataUrl;
    fireEvent.click(screen.getByTestId('texture-watercolor'));
    const wcUrl = currentTexture()!.dataUrl;
    expect(wcUrl).not.toBe(grainUrl);
    expect(canvas!.getObjects()[0].fill).toBe('#7A8B5C'); // 新渲染占位

    // 旧纹理（grain）先加载完成 → 必须被丢弃
    loader.resolve(grainUrl, FAKE_SOURCE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(canvas!.getObjects()[0].fill).toBe('#7A8B5C');
    expect(canvas!.getObjects()[0].fill).not.toBeInstanceOf(Pattern);

    // 新纹理（watercolor）加载完成 → 正常应用，画布与 store 一致
    loader.resolve(wcUrl, FAKE_SOURCE);
    await waitFor(() =>
      expect(patternSource(canvas!.getObjects()[0].fill)).toBe(FAKE_SOURCE),
    );
    expect(currentTexture()!.dataUrl).toBe(wcUrl);
  });

  it('加载中切风格后立刻 undo：被撤销风格的加载结果被丢弃，恢复状态正常应用', async () => {
    const loader = deferredLoader();
    let canvas: Canvas | undefined;
    render(<Harness loader={loader} onReady={(c) => { canvas = c; }} />);

    // 切 grain（加载中）
    fireEvent.click(screen.getByTestId('texture-grain'));
    const grainUrl = currentTexture()!.dataUrl;

    // 切 watercolor（加载中）
    fireEvent.click(screen.getByTestId('texture-watercolor'));
    const wcUrl = currentTexture()!.dataUrl;
    expect(wcUrl).not.toBe(grainUrl);

    // 在 watercolor 加载完成前 undo → 回到 grain
    act(() => useProjectStore.getState().undo());
    expect(currentTexture()!.dataUrl).toBe(grainUrl);
    expect(canvas!.getObjects()[0].fill).toBe('#7A8B5C');

    // 被撤销的 watercolor 旧加载先完成 → 必须丢弃
    loader.resolve(wcUrl, FAKE_SOURCE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(canvas!.getObjects()[0].fill).toBe('#7A8B5C');
    expect(canvas!.getObjects()[0].fill).not.toBeInstanceOf(Pattern);

    // grain 新加载完成 → 正常应用，画布与 store 一致
    loader.resolve(grainUrl, FAKE_SOURCE);
    await waitFor(() =>
      expect(patternSource(canvas!.getObjects()[0].fill)).toBe(FAKE_SOURCE),
    );
    expect(currentTexture()!.dataUrl).toBe(grainUrl);
  });

  it('加载中快速 undo×2 → redo×2：最终画布 pattern 对应最终 store 状态，无旧覆盖', async () => {
    const loader = deferredLoader();
    let canvas: Canvas | undefined;
    render(<Harness loader={loader} onReady={(c) => { canvas = c; }} />);

    // grain → watercolor → marble（均加载中）
    fireEvent.click(screen.getByTestId('texture-grain'));
    const grainUrl = currentTexture()!.dataUrl;
    fireEvent.click(screen.getByTestId('texture-watercolor'));
    const wcUrl = currentTexture()!.dataUrl;
    fireEvent.click(screen.getByTestId('texture-marble'));
    const marbleUrl = currentTexture()!.dataUrl;
    expect(grainUrl).toContain('grain');
    expect(wcUrl).toContain('watercolor');
    expect(marbleUrl).toContain('marble');

    // 连撤两步（marble → watercolor → grain），再重做两步（→ watercolor → marble）
    act(() => useProjectStore.getState().undo());
    act(() => useProjectStore.getState().undo());
    act(() => useProjectStore.getState().redo());
    act(() => useProjectStore.getState().redo());
    expect(currentTexture()!.dataUrl).toBe(marbleUrl); // 最终 store 是 marble

    // 历史 dataURL 的加载结果依次落定：grain / watercolor 均已被 store 淘汰 → 必须丢弃
    loader.resolve(grainUrl, FAKE_SOURCE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(canvas!.getObjects()[0].fill).toBe('#7A8B5C');
    expect(canvas!.getObjects()[0].fill).not.toBeInstanceOf(Pattern);

    loader.resolve(wcUrl, FAKE_SOURCE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(canvas!.getObjects()[0].fill).toBe('#7A8B5C');
    expect(canvas!.getObjects()[0].fill).not.toBeInstanceOf(Pattern);

    // 最终 marble 加载完成 → 正常应用，画布渲染与 store 一致
    loader.resolve(marbleUrl, FAKE_SOURCE);
    await waitFor(() =>
      expect(patternSource(canvas!.getObjects()[0].fill)).toBe(FAKE_SOURCE),
    );
    expect(currentTexture()!.dataUrl).toBe(marbleUrl);
    expect(useProjectStore.getState().project.textures[0].dataUrl).toBe(marbleUrl);
  });
});

describe('T18-b 集成：关闭纹理 → 纸片恢复纯色填充', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: projectWithPaper(), undoStack: [], redoStack: [] });
    useEditorStore.setState({ currentColor: '#000000', recentColors: [] });
  });

  it('加载中点「无」→ 纸片恢复纯色填充；迟到的旧纹理加载不覆盖', async () => {
    const loader = deferredLoader();
    let canvas: Canvas | undefined;
    render(<Harness loader={loader} onReady={(c) => { canvas = c; }} />);

    // 应用纹理但暂不 resolve（加载中）
    fireEvent.click(screen.getByTestId('texture-grain'));
    const grainUrl = currentTexture()!.dataUrl;
    expect(canvas!.getObjects()[0].fill).toBe('#7A8B5C');

    // 加载完成前关闭纹理
    fireEvent.click(screen.getByTestId('texture-none'));
    const st = useProjectStore.getState();
    expect(st.project.elements[0].textureId).toBeNull();
    expect(st.project.textures).toEqual([]);
    expect(canvas!.getObjects()[0].fill).toBe('#7A8B5C'); // 纯色填充
    expect(canvas!.getObjects()[0].fill).not.toBeInstanceOf(Pattern);

    // 旧纹理迟到 → 必须丢弃，不覆盖纯色填充
    loader.resolve(grainUrl, FAKE_SOURCE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(canvas!.getObjects()[0].fill).toBe('#7A8B5C');
    expect(canvas!.getObjects()[0].fill).not.toBeInstanceOf(Pattern);
  });

  it('纹理已应用后点「无」→ 画布纸片恢复纯色填充（不再显示 pattern）', async () => {
    const loader = deferredLoader();
    let canvas: Canvas | undefined;
    render(<Harness loader={loader} onReady={(c) => { canvas = c; }} />);

    // 先应用纹理并完成加载（画布显示 pattern）
    fireEvent.click(screen.getByTestId('texture-grain'));
    const grainUrl = currentTexture()!.dataUrl;
    loader.resolve(grainUrl, FAKE_SOURCE);
    await waitFor(() =>
      expect(patternSource(canvas!.getObjects()[0].fill)).toBe(FAKE_SOURCE),
    );
    expect(canvas!.getObjects()[0].fill).toBeInstanceOf(Pattern);

    // 点「无」→ 画布纸片恢复纯色填充（不再是 pattern）
    fireEvent.click(screen.getByTestId('texture-none'));
    const st = useProjectStore.getState();
    expect(st.project.elements[0].textureId).toBeNull();
    expect(st.project.textures).toEqual([]);
    expect(canvas!.getObjects()[0].fill).toBe('#7A8B5C');
    expect(canvas!.getObjects()[0].fill).not.toBeInstanceOf(Pattern);
  });
});
