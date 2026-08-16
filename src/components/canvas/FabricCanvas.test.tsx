import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { Canvas, FabricImage, Pattern, Point, type TPointerEventInfo } from 'fabric';
import { FabricCanvas, type FabricCanvasApi } from './FabricCanvas';
import type { TextureLoader } from '../../texture/loader';
import {
  createEmptyProject,
  createPaperElement,
  createPaperTexture,
  type PaperProject,
} from '../../types/project';

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
function deferredLoader(): TextureLoader & {
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
    size: 0,
    clear: vi.fn(),
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

function projectWithOnePaper(
  transform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
): PaperProject {
  const project = createEmptyProject(1200, 800);
  project.elements.push(
    createPaperElement({
      path: 'M 0 0 L 100 0 L 100 80 L 0 80 Z',
      color: '#c0392b',
      opacity: 0.85,
      transform,
    }),
  );
  return project;
}

describe('FabricCanvas 桥接壳（seam 6/7）', () => {
  it('挂载后 fabric 画布渲染出一个带基础样式的纸片（P0 验收）', () => {
    let canvas: Canvas | undefined;
    const project = projectWithOnePaper({ x: 24, y: 48, rotation: 0, scaleX: 1, scaleY: 1 });

    render(<FabricCanvas project={project} onReady={(c) => { canvas = c; }} />);

    expect(canvas).toBeDefined();
    const objects = canvas!.getObjects();
    expect(objects).toHaveLength(1);
    const paper = objects[0];
    expect(paper.fill).toBe('#c0392b');
    expect(paper.opacity).toBe(0.85);
    expect(paper.left).toBe(24);
    expect(paper.top).toBe(48);
  });

  it('渲染底图并在 visible 切换时保持纸片对象不变', async () => {
    vi.spyOn(FabricImage, 'fromURL').mockResolvedValue({ width: 1200, height: 800, render: () => {}, dispose: () => {} } as unknown as FabricImage);
    let canvas: Canvas | undefined;
    const project = projectWithOnePaper();
    project.bgPhoto = { dataUrl: 'data:image/png;base64,AA', visible: true };
    const { rerender } = render(<FabricCanvas project={project} onReady={(c) => { canvas = c; }} />);
    await waitFor(() => expect(canvas!.backgroundImage).toBeDefined());
    expect(canvas!.backgroundImage!.visible).toBe(true);
    const paper = canvas!.getObjects()[0];
    const hidden = { ...project, bgPhoto: { ...project.bgPhoto, visible: false } };
    rerender(<FabricCanvas project={hidden} onReady={(c) => { canvas = c; }} />);
    expect(canvas!.backgroundImage!.visible).toBe(false);
    expect(canvas!.getObjects()[0]).toBe(paper);
  });

  it('单向通信：fabric 事件经 onProjectChange 回灌，不反向写回 props（无双向绑定）', () => {
    let canvas: Canvas | undefined;
    const onProjectChange = vi.fn();
    const project = projectWithOnePaper();

    render(
      <FabricCanvas
        project={project}
        onReady={(c) => { canvas = c; }}
        onProjectChange={onProjectChange}
      />,
    );

    const obj = canvas!.getObjects()[0];
    obj.set({ left: 120, top: 200, angle: 45 });
    canvas!.fire('object:modified', { target: obj });

    expect(onProjectChange).toHaveBeenCalledTimes(1);
    const next = onProjectChange.mock.calls[0][0] as PaperProject;
    expect(next.elements[0].transform).toEqual({
      x: 120,
      y: 200,
      rotation: 45,
      scaleX: 1,
      scaleY: 1,
    });
    // 原 props 未被原地修改（无双向绑定）
    expect(project.elements[0].transform).toEqual({
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });
  });
});
describe('FabricCanvas 导航 API（seam S5）— apiRef 只改视口不动元素', () => {
  it('apiRef 暴露 zoomBy/panBy/resetViewport，元素属性不变', () => {
    let canvas: Canvas | undefined;
    const apiRef: { current: FabricCanvasApi | null } = { current: null };
    const project = projectWithOnePaper({ x: 24, y: 48, rotation: 0, scaleX: 1, scaleY: 1 });

    render(<FabricCanvas project={project} apiRef={apiRef} onReady={(c) => { canvas = c; }} />);

    expect(apiRef.current).not.toBeNull();
    expect(canvas!.viewportTransform).toEqual([1, 0, 0, 1, 0, 0]);

    const obj = canvas!.getObjects()[0];
    const before = { left: obj.left, top: obj.top, scaleX: obj.scaleX, scaleY: obj.scaleY };

    expect(apiRef.current!.zoomBy(2)).toBe(2);
    expect(canvas!.viewportTransform[0]).toBe(2);
    expect(obj.left).toBe(before.left);
    expect(obj.top).toBe(before.top);
    expect(obj.scaleX).toBe(before.scaleX);
    expect(obj.scaleY).toBe(before.scaleY);

    apiRef.current!.panBy(50, 30);
    expect(canvas!.viewportTransform[4]).toBe(50);
    expect(canvas!.viewportTransform[5]).toBe(30);
    expect(obj.left).toBe(before.left);
    expect(obj.top).toBe(before.top);

    apiRef.current!.resetViewport();
    expect(canvas!.viewportTransform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('卸载后 apiRef 置空', () => {
    const apiRef: { current: FabricCanvasApi | null } = { current: null };
    const project = projectWithOnePaper();

    const { unmount } = render(<FabricCanvas project={project} apiRef={apiRef} />);
    expect(apiRef.current).not.toBeNull();

    unmount();
    expect(apiRef.current).toBeNull();
  });
});

describe('FabricCanvas 描摹（seam 5）— trace 工具：采点 → 自动闭合 → 纸片回灌', () => {
  function pointerEvent(
    x: number,
    y: number,
    extra: { alreadySelected?: boolean; isClick?: boolean } = {},
  ): TPointerEventInfo {
    return {
      e: new MouseEvent('mousemove'),
      scenePoint: new Point(x, y),
      viewportPoint: new Point(x, y),
      transform: null,
      ...extra,
    };
  }

  it('trace 模式下松开自动闭合生成纸片，经 onProjectChange 回灌且数组序为末尾（z 序）', () => {
    let canvas: Canvas | undefined;
    const onProjectChange = vi.fn();
    const project = createEmptyProject(1200, 800);

    render(
      <FabricCanvas
        project={project}
        activeTool="trace"
        onReady={(c) => { canvas = c; }}
        onProjectChange={onProjectChange}
      />,
    );

    canvas!.fire('mouse:down', { ...pointerEvent(10, 10), alreadySelected: false });
    canvas!.fire('mouse:move', pointerEvent(60, 40));
    canvas!.fire('mouse:move', pointerEvent(110, 70));
    canvas!.fire('mouse:up', { ...pointerEvent(160, 120), isClick: false });

    // 临时笔迹已移除，正式纸片回灌
    expect(canvas!.getObjects()).toHaveLength(0);
    expect(onProjectChange).toHaveBeenCalledTimes(1);
    const next = onProjectChange.mock.calls[0][0] as PaperProject;
    expect(next.elements).toHaveLength(1);
    expect(next.elements[0].path.endsWith(' Z')).toBe(true);
    expect(next.elements[0].color).toBe('#7A8B5C');
    expect(next.elements[0].transform).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
  });

  it('trace 模式移动过程渲染临时笔迹，松开后移除不残留', () => {
    let canvas: Canvas | undefined;
    const project = createEmptyProject(1200, 800);

    render(<FabricCanvas project={project} activeTool="trace" onReady={(c) => { canvas = c; }} />);

    canvas!.fire('mouse:down', { ...pointerEvent(10, 10), alreadySelected: false });
    canvas!.fire('mouse:move', pointerEvent(60, 40));
    expect(canvas!.getObjects()).toHaveLength(1);

    canvas!.fire('mouse:up', { ...pointerEvent(60, 40), isClick: false });
    expect(canvas!.getObjects()).toHaveLength(0);
  });

  it('描点不足 3 个视为误触，不生成纸片', () => {
    let canvas: Canvas | undefined;
    const onProjectChange = vi.fn();
    const project = createEmptyProject(1200, 800);

    render(
      <FabricCanvas
        project={project}
        activeTool="trace"
        onReady={(c) => { canvas = c; }}
        onProjectChange={onProjectChange}
      />,
    );

    canvas!.fire('mouse:down', { ...pointerEvent(10, 10), alreadySelected: false });
    canvas!.fire('mouse:up', { ...pointerEvent(12, 14), isClick: false });
    expect(onProjectChange).not.toHaveBeenCalled();
    expect(canvas!.getObjects()).toHaveLength(0);
  });

  it('select 模式下 pointer 事件不生成纸片', () => {
    let canvas: Canvas | undefined;
    const onProjectChange = vi.fn();
    const project = createEmptyProject(1200, 800);

    render(
      <FabricCanvas
        project={project}
        activeTool="select"
        onReady={(c) => { canvas = c; }}
        onProjectChange={onProjectChange}
      />,
    );

    canvas!.fire('mouse:down', { ...pointerEvent(10, 10), alreadySelected: false });
    canvas!.fire('mouse:move', pointerEvent(60, 40));
    canvas!.fire('mouse:up', { ...pointerEvent(160, 120), isClick: false });
    expect(onProjectChange).not.toHaveBeenCalled();
  });

  it('trace 模式关闭对象选择（selection/skipTargetFind），切回 select 恢复', () => {
    let canvas: Canvas | undefined;
    const project = createEmptyProject(1200, 800);

    const { rerender } = render(<FabricCanvas project={project} onReady={(c) => { canvas = c; }} />);
    expect(canvas!.selection).toBe(true);

    rerender(<FabricCanvas project={project} activeTool="trace" onReady={(c) => { canvas = c; }} />);
    expect(canvas!.selection).toBe(false);
    expect(canvas!.skipTargetFind).toBe(true);

    rerender(<FabricCanvas project={project} activeTool="select" onReady={(c) => { canvas = c; }} />);
    expect(canvas!.selection).toBe(true);
    expect(canvas!.skipTargetFind).toBe(false);
  });
});

describe('FabricCanvas 选择/变换（T6 seam 4/5）— select 模式自定义轮廓命中', () => {
  /** 派发真实 DOM mousedown，触发 fabric __onMouseDown → findTarget → _checkTarget 覆写。 */
  function dispatchMouseDown(canvas: Canvas, x: number, y: number): void {
    const el = canvas.upperCanvasEl || canvas.lowerCanvasEl;
    el.dispatchEvent(
      new MouseEvent('mousedown', {
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
  }

  /** 补发 mouseup（冒泡到 document，清空 fabric _currentTransform），完成单击手势。 */
  function dispatchMouseUp(canvas: Canvas, x: number, y: number): void {
    const el = canvas.upperCanvasEl || canvas.lowerCanvasEl;
    el.dispatchEvent(
      new MouseEvent('mouseup', {
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
  }

  /** 拖拽过程发 mousemove（fabric 变换由 mousemove 驱动）。 */
  function dispatchMouseMove(canvas: Canvas, x: number, y: number): void {
    const el = canvas.upperCanvasEl || canvas.lowerCanvasEl;
    el.dispatchEvent(
      new MouseEvent('mousemove', {
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
  }

  /** 完整单击（mousedown + mouseup），避免 _currentTransform 残留阻塞后续 mousedown。 */
  function clickAt(canvas: Canvas, x: number, y: number): void {
    dispatchMouseDown(canvas, x, y);
    dispatchMouseUp(canvas, x, y);
  }

  function activePaperId(canvas: Canvas | undefined): string | undefined {
    return canvas?.getActiveObject()?.paperId;
  }

  const RECT = 'M 0 0 L 100 0 L 100 80 L 0 80 Z';
  const L_SHAPE = 'M 0 0 L 100 0 L 100 40 L 40 40 L 40 100 L 0 100 Z';

  it('点击纸片内部选中；bbox 内形状外（L 形凹槽）不误命中', () => {
    let canvas: Canvas | undefined;
    const project = createEmptyProject(1200, 800);
    const paper = createPaperElement({ path: L_SHAPE, color: '#c0392b' });
    project.elements.push(paper);

    render(<FabricCanvas project={project} onReady={(c) => { canvas = c; }} />);

    clickAt(canvas!, 50, 20); // L 形实体横条 → 选中
    expect(activePaperId(canvas)).toBe(paper.id);

    clickAt(canvas!, 50, 50); // L 形凹槽（bbox 内形状外）→ 不选中
    expect(canvas!.getActiveObject()).toBeUndefined();
  });

  it('边缘容差命中：边外 3px 内仍可选中（超越 fabric bbox 命中）', () => {
    let canvas: Canvas | undefined;
    const project = createEmptyProject(1200, 800);
    const paper = createPaperElement({ path: RECT, color: '#c0392b' });
    project.elements.push(paper);

    render(<FabricCanvas project={project} onReady={(c) => { canvas = c; }} />);

    clickAt(canvas!, 103, 40); // 右边缘外 3px ≤ 容差 4
    expect(activePaperId(canvas)).toBe(paper.id);
  });

  it('未命中时清空已选中', () => {
    let canvas: Canvas | undefined;
    const project = createEmptyProject(1200, 800);
    project.elements.push(createPaperElement({ path: RECT, color: '#c0392b' }));

    render(<FabricCanvas project={project} onReady={(c) => { canvas = c; }} />);

    clickAt(canvas!, 50, 40);
    expect(canvas!.getActiveObject()).toBeDefined();

    clickAt(canvas!, 600, 600); // 空白区域
    expect(canvas!.getActiveObject()).toBeUndefined();
  });

  it('重叠纸片命中 z 序最上层（elements 数组尾 → 顶）', () => {
    let canvas: Canvas | undefined;
    const project = createEmptyProject(1200, 800);
    const bottom = createPaperElement({ path: RECT, color: '#c0392b' });
    const top = createPaperElement({
      path: RECT,
      color: '#7A8B5C',
      transform: { x: 50, y: 40, rotation: 0, scaleX: 1, scaleY: 1 },
    });
    project.elements.push(bottom, top);

    render(<FabricCanvas project={project} onReady={(c) => { canvas = c; }} />);

    clickAt(canvas!, 75, 60); // 两纸片重叠区
    expect(activePaperId(canvas)).toBe(top.id);
  });

  it('变换写回数据模型（object:modified），重渲染后选中按 paperId 保持', () => {
    let canvas: Canvas | undefined;
    const onProjectChange = vi.fn();
    const project = createEmptyProject(1200, 800);
    const paper = createPaperElement({ path: RECT, color: '#c0392b' });
    project.elements.push(paper);

    const { rerender } = render(
      <FabricCanvas
        project={project}
        onReady={(c) => { canvas = c; }}
        onProjectChange={onProjectChange}
      />,
    );

    clickAt(canvas!, 50, 40);
    expect(activePaperId(canvas)).toBe(paper.id);

    const obj = canvas!.getActiveObject();
    expect(obj).toBeDefined();
    obj!.set({ left: 150, top: 120, angle: 30, scaleX: 1.5, scaleY: 1.5 });
    canvas!.fire('object:modified', { target: obj! });

    expect(onProjectChange).toHaveBeenCalledTimes(1);
    const next = onProjectChange.mock.calls[0][0] as PaperProject;
    expect(next.elements[0].transform).toEqual({
      x: 150,
      y: 120,
      rotation: 30,
      scaleX: 1.5,
      scaleY: 1.5,
    });

    // store 回灌 → 重渲染（renderProject 重建对象），选中不丢失
    rerender(
      <FabricCanvas
        project={next}
        onReady={(c) => { canvas = c; }}
        onProjectChange={onProjectChange}
      />,
    );
    expect(activePaperId(canvas)).toBe(paper.id);
  });

  it('选中后拖拽移动：mousedown → mousemove → mouseup 变换写回数据模型', () => {
    let canvas: Canvas | undefined;
    const onProjectChange = vi.fn();
    const project = createEmptyProject(1200, 800);
    const paper = createPaperElement({ path: RECT, color: '#c0392b' });
    project.elements.push(paper);

    render(
      <FabricCanvas
        project={project}
        onReady={(c) => { canvas = c; }}
        onProjectChange={onProjectChange}
      />,
    );

    dispatchMouseDown(canvas!, 50, 40);
    expect(activePaperId(canvas)).toBe(paper.id);

    dispatchMouseMove(canvas!, 70, 60);
    dispatchMouseUp(canvas!, 70, 60);

    expect(onProjectChange).toHaveBeenCalledTimes(1);
    const next = onProjectChange.mock.calls[0][0] as PaperProject;
    // 指针从 (50,40) 移到 (70,60)，纸片原点同步移动 (20,20)
    expect(next.elements[0].transform).toEqual({
      x: 20,
      y: 20,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it('有底图时 undo/redo 恢复仍全量重绘（不落入 bgPhoto 快速路径）', async () => {
    vi.spyOn(FabricImage, 'fromURL').mockResolvedValue({
      width: 1200,
      height: 800,
      render: () => {},
      dispose: () => {},
    } as unknown as FabricImage);
    let canvas: Canvas | undefined;
    const base = createEmptyProject(1200, 800);
    base.bgPhoto = { dataUrl: 'data:image/png;base64,AA', visible: true };
    base.elements.push(createPaperElement({ path: RECT, color: '#c0392b' })); // 位置 A (0,0)

    const moved = {
      ...base,
      elements: base.elements.map((el) => ({
        ...el,
        transform: { ...el.transform, x: 100, y: 200 },
      })),
    };
    const restored = {
      ...moved,
      elements: moved.elements.map((el) => ({
        ...el,
        transform: { ...el.transform, x: 0, y: 0 },
      })),
    };

    const { rerender } = render(<FabricCanvas project={base} onReady={(c) => { canvas = c; }} />);
    await waitFor(() => expect(canvas!.backgroundImage).toBeDefined());
    expect(canvas!.getObjects()[0].left).toBe(0);

    rerender(<FabricCanvas project={moved} onReady={(c) => { canvas = c; }} />);
    expect(canvas!.getObjects()[0].left).toBe(100);

    rerender(<FabricCanvas project={restored} onReady={(c) => { canvas = c; }} />);
    expect(canvas!.getObjects()[0].left).toBe(0);
  });
});

describe('FabricCanvas 选中联动（T10 seam 4）— fabric 选中 → React 单向事件', () => {
  const RECT = 'M 0 0 L 100 0 L 100 80 L 0 80 Z';

  function dispatchMouseDown(canvas: Canvas, x: number, y: number): void {
    const el = canvas.upperCanvasEl || canvas.lowerCanvasEl;
    el.dispatchEvent(
      new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 }),
    );
  }
  function dispatchMouseUp(canvas: Canvas, x: number, y: number): void {
    const el = canvas.upperCanvasEl || canvas.lowerCanvasEl;
    el.dispatchEvent(
      new MouseEvent('mouseup', { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 }),
    );
  }
  function clickAt(canvas: Canvas, x: number, y: number): void {
    dispatchMouseDown(canvas, x, y);
    dispatchMouseUp(canvas, x, y);
  }

  it('点击纸片 → onSelectionChange(paperId)；点空白 → onSelectionChange(null)', () => {
    let canvas: Canvas | undefined;
    const onSelectionChange = vi.fn();
    const project = createEmptyProject(1200, 800);
    const paper = createPaperElement({ path: RECT, color: '#c0392b' });
    project.elements.push(paper);

    render(
      <FabricCanvas
        project={project}
        onReady={(c) => { canvas = c; }}
        onSelectionChange={onSelectionChange}
      />,
    );

    clickAt(canvas!, 50, 40);
    expect(onSelectionChange).toHaveBeenLastCalledWith(paper.id);

    clickAt(canvas!, 600, 600);
    expect(onSelectionChange).toHaveBeenLastCalledWith(null);
  });

  it('纸片间切换选中 → onSelectionChange 上报新 paperId', () => {
    let canvas: Canvas | undefined;
    const onSelectionChange = vi.fn();
    const project = createEmptyProject(1200, 800);
    const a = createPaperElement({ path: RECT, color: '#c0392b' });
    const b = createPaperElement({
      path: RECT,
      color: '#7A8B5C',
      transform: { x: 200, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    });
    project.elements.push(a, b);

    render(
      <FabricCanvas
        project={project}
        onReady={(c) => { canvas = c; }}
        onSelectionChange={onSelectionChange}
      />,
    );

    clickAt(canvas!, 50, 40); // A
    expect(onSelectionChange).toHaveBeenLastCalledWith(a.id);
    clickAt(canvas!, 250, 40); // B
    expect(onSelectionChange).toHaveBeenLastCalledWith(b.id);
  });
});

describe('FabricCanvas 运行时纹理管线（T18）— textureId → 共享加载器 → 占位后更新 Pattern', () => {
  const RECT = 'M 0 0 L 100 0 L 100 80 L 0 80 Z';

  it('textureId 引用的纸片：加载完成前纯色占位，加载完成后更新为 Pattern 填充并重绘', async () => {
    let canvas: Canvas | undefined;
    const loader = deferredLoader();
    const project = createEmptyProject(1200, 800);
    project.textures.push(
      createPaperTexture({
        id: 'tex-1',
        style: 'fold',
        seed: 42,
        color: '#7A8B5C',
        dataUrl: 'data:image/png;base64,TEX',
      }),
    );
    project.elements.push(
      createPaperElement({ path: RECT, color: '#7A8B5C', textureId: 'tex-1' }),
    );

    render(
      <FabricCanvas project={project} onReady={(c) => { canvas = c; }} textureLoader={loader} />,
    );
    const paper = canvas!.getObjects()[0];
    expect(paper.fill).toBe('#7A8B5C'); // 占位纯色（未解码前不设 Pattern）

    loader.resolve('data:image/png;base64,TEX', FAKE_SOURCE);
    await waitFor(() => expect(paper.fill).toBeInstanceOf(Pattern));
    // 运行时图案填充源是已解码的图像源对象，而非 dataURL 字符串
    expect(patternSource(paper.fill)).toBe(FAKE_SOURCE);
    expect((paper.fill as unknown as { repeat?: string }).repeat).toBe('repeat');
    expect(canvas!.requestRenderAll).toBeDefined();
  });

  it('textureId 指向缺失记录时保持纯色填充（不抛错）', () => {
    let canvas: Canvas | undefined;
    const project = createEmptyProject(1200, 800);
    project.elements.push(
      createPaperElement({ path: RECT, color: '#c0392b', textureId: 'missing' }),
    );

    render(<FabricCanvas project={project} onReady={(c) => { canvas = c; }} />);
    const paper = canvas!.getObjects()[0];
    expect(paper.fill).toBe('#c0392b');
  });
});

describe('FabricCanvas 纹理管线鲁棒性（T18）— 独立加载 / 失败回退 / 防旧覆盖', () => {
  const RECT = 'M 0 0 L 100 0 L 100 80 L 0 80 Z';

  it('多纸片各自独立加载互不影响：先完成的更新自己，另一张保持占位', async () => {
    let canvas: Canvas | undefined;
    const loader = deferredLoader();
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

    render(
      <FabricCanvas project={project} onReady={(c) => { canvas = c; }} textureLoader={loader} />,
    );
    const [p1, p2] = canvas!.getObjects();
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

  it('纹理加载失败：纸片回退纯色，不抛错、不中断画布', async () => {
    let canvas: Canvas | undefined;
    const loader = deferredLoader();
    const project = createEmptyProject(1200, 800);
    project.textures.push(
      createPaperTexture({ id: 'tex-1', style: 'fold', seed: 1, color: '#c0392b', dataUrl: 'D1' }),
    );
    project.elements.push(createPaperElement({ path: RECT, color: '#c0392b', textureId: 'tex-1' }));

    render(
      <FabricCanvas project={project} onReady={(c) => { canvas = c; }} textureLoader={loader} />,
    );
    const paper = canvas!.getObjects()[0];
    expect(paper.fill).toBe('#c0392b');

    loader.reject('D1', new Error('load fail'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(paper.fill).toBe('#c0392b'); // 保持纯色
    expect(canvas!.getObjects()).toHaveLength(1); // 画布不中断、不白屏
  });

  it('快速连续编辑：旧纹理加载结果不覆盖新渲染（防旧覆盖）', async () => {
    let canvas: Canvas | undefined;
    const loader = deferredLoader();
    const projectA = createEmptyProject(1200, 800);
    projectA.textures.push(
      createPaperTexture({ id: 'tex-1', style: 'fold', seed: 1, color: '#7A8B5C', dataUrl: 'D1' }),
    );
    projectA.elements.push(
      createPaperElement({ path: RECT, color: '#7A8B5C', textureId: 'tex-1' }),
    );
    const projectB = createEmptyProject(1200, 800);
    projectB.textures.push(
      createPaperTexture({ id: 'tex-2', style: 'fold', seed: 2, color: '#7A8B5C', dataUrl: 'D2' }),
    );
    projectB.elements.push(
      createPaperElement({ path: RECT, color: '#7A8B5C', textureId: 'tex-2' }),
    );

    const { rerender } = render(
      <FabricCanvas project={projectA} onReady={(c) => { canvas = c; }} textureLoader={loader} />,
    );
    rerender(
      <FabricCanvas project={projectB} onReady={(c) => { canvas = c; }} textureLoader={loader} />,
    );
    const current = canvas!.getObjects()[0];
    expect(current.fill).toBe('#7A8B5C'); // 新渲染占位

    // 旧纹理（D1）先加载完成 → 必须被丢弃，不覆盖新渲染
    loader.resolve('D1', FAKE_SOURCE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(current.fill).toBe('#7A8B5C');

    // 新纹理（D2）加载完成 → 正常应用
    loader.resolve('D2', FAKE_SOURCE);
    await waitFor(() => expect(current.fill).toBeInstanceOf(Pattern));
    expect(patternSource(current.fill)).toBe(FAKE_SOURCE);
  });

  it('同一纸片纹理重合成（同 id 新 dataUrl）：旧加载结果被丢弃，新纹理正常应用', async () => {
    let canvas: Canvas | undefined;
    const loader = deferredLoader();
    const projectA = createEmptyProject(1200, 800);
    projectA.textures.push(
      createPaperTexture({ id: 'tex-1', style: 'fold', seed: 1, color: '#7A8B5C', dataUrl: 'D1' }),
    );
    projectA.elements.push(
      createPaperElement({ id: 'paper-1', path: RECT, color: '#7A8B5C', textureId: 'tex-1' }),
    );
    // 用户改色/缩放 → 同一纹理记录重合成出新 dataURL（同 id，D1 → D2），纸片 id 不变
    const projectB = createEmptyProject(1200, 800);
    projectB.textures.push(
      createPaperTexture({ id: 'tex-1', style: 'fold', seed: 1, color: '#C0392B', dataUrl: 'D2' }),
    );
    projectB.elements.push(
      createPaperElement({ id: 'paper-1', path: RECT, color: '#C0392B', textureId: 'tex-1' }),
    );

    const { rerender } = render(
      <FabricCanvas project={projectA} onReady={(c) => { canvas = c; }} textureLoader={loader} />,
    );
    rerender(
      <FabricCanvas project={projectB} onReady={(c) => { canvas = c; }} textureLoader={loader} />,
    );
    const current = canvas!.getObjects()[0];
    expect(current.fill).toBe('#C0392B'); // 新渲染占位

    // 旧纹理（D1）先加载完成 → 同纸片当前 dataUrl 已是 D2，必须丢弃不覆盖
    loader.resolve('D1', FAKE_SOURCE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(current.fill).toBe('#C0392B');

    // 新纹理（D2）加载完成 → 正常应用
    loader.resolve('D2', FAKE_SOURCE);
    await waitFor(() => expect(current.fill).toBeInstanceOf(Pattern));
    expect(patternSource(current.fill)).toBe(FAKE_SOURCE);
  });

  it('无纹理纸片保持纯色填充（现状不变）', () => {
    let canvas: Canvas | undefined;
    const loader = deferredLoader();
    const project = createEmptyProject(1200, 800);
    project.elements.push(createPaperElement({ path: RECT, color: '#c0392b' }));

    render(
      <FabricCanvas project={project} onReady={(c) => { canvas = c; }} textureLoader={loader} />,
    );
    const paper = canvas!.getObjects()[0];
    expect(paper.fill).toBe('#c0392b');
    expect(loader.load).not.toHaveBeenCalled();
  });
});
