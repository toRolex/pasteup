import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { Canvas, Point, type TPointerEventInfo } from 'fabric';
import { FabricCanvas, type FabricCanvasApi } from './FabricCanvas';
import { FIT_MARGIN } from '../../fabric/viewport';
import { useToolStore } from '../../store/toolStore';
import {
  createEmptyProject,
  createPaperElement,
  type PaperProject,
} from '../../types/project';

// 测试观察 seam（替代已收回的 onReady prop，#49）：vi.mock 子类化 fabric Canvas 捕获构造实例。
// 生产壳不再经 prop 外漏 canvas 引用；测试经 lastCanvas() 取最近创建的实例做断言（仍是真实 Canvas 行为）。
const h = vi.hoisted(() => {
  const canvases: import('fabric').Canvas[] = [];
  return {
    canvases,
    lastCanvas(): import('fabric').Canvas {
      const c = canvases[canvases.length - 1];
      if (!c) throw new Error('FabricCanvas 尚未创建 canvas（测试观察 seam）');
      return c;
    },
  };
});
vi.mock('fabric', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fabric')>();
  class SpyCanvas extends actual.Canvas {
    constructor(...args: ConstructorParameters<typeof actual.Canvas>) {
      super(...args);
      h.canvases.push(this);
    }
  }
  return { ...actual, Canvas: SpyCanvas };
});
const { lastCanvas } = h;

// 壳直接订阅 toolStore（#59）：每个用例前复位工具态，避免跨用例污染。
beforeEach(() => {
  useToolStore.setState({ tool: 'select', pickSession: null });
});

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

describe('FabricCanvas 桥接壳 — 单向通信回灌（fabric 事件 → onProjectChange）', () => {
  it('单向通信：fabric 事件经 onProjectChange 回灌，不反向写回 props（无双向绑定）', () => {
    let canvas: Canvas | undefined;
    const onProjectChange = vi.fn();
    const project = projectWithOnePaper();

    render(
      <FabricCanvas
        project={project}
        onProjectChange={onProjectChange}
      />,
    );
    canvas = lastCanvas();

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

    render(<FabricCanvas project={project} apiRef={apiRef} />);
    canvas = lastCanvas();

    expect(apiRef.current).not.toBeNull();
    expect(canvas!.viewportTransform).toEqual([1, 0, 0, 1, 0, 0]);

    const obj = canvas!.getObjects()[0];
    const before = { left: obj.left, top: obj.top, scaleX: obj.scaleX, scaleY: obj.scaleY };

    expect(apiRef.current!.zoomBy(2)).toBe(2);
    // zoomBy 锚视口中心（zoomToPoint）：缩放项=2，位移项 = 中心 - 世界中心×2
    const vptAfterZoom = canvas!.viewportTransform;
    expect(vptAfterZoom[0]).toBe(2);
    expect(vptAfterZoom[3]).toBe(2);
    expect(obj.left).toBe(before.left);
    expect(obj.top).toBe(before.top);
    expect(obj.scaleX).toBe(before.scaleX);
    expect(obj.scaleY).toBe(before.scaleY);

    apiRef.current!.panBy(50, 30);
    const vptBeforePan = canvas!.viewportTransform;
    expect(vptBeforePan[4]).toBeCloseTo(vptAfterZoom[4] + 50);
    expect(vptBeforePan[5]).toBeCloseTo(vptAfterZoom[5] + 30);
    expect(obj.left).toBe(before.left);
    expect(obj.top).toBe(before.top);

    // 复位 = 回 fit-to-viewport。jsdom 容器 0×0，fit 被守卫跳过（no-op）：
    // 视口保持 panBy 后状态，但元素属性仍不动。
    apiRef.current!.resetViewport();
    expect(obj.left).toBe(before.left);
    expect(obj.top).toBe(before.top);
  });

  it('复位 = 回 fit-to-viewport 矩阵（容器有布局尺寸时：zoom=fitScale 且世界居中）', () => {
    const apiRef: { current: FabricCanvasApi | null } = { current: null };
    const project = projectWithOnePaper(); // 世界 1200×800

    render(<FabricCanvas project={project} apiRef={apiRef} />);
    const canvas = lastCanvas();
    // jsdom 无布局：打桩容器尺寸，让 applyFit 的零尺寸守卫放行
    const container = screen.getByTestId('fabric-canvas');
    Object.defineProperty(container, 'clientWidth', { value: 600, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });

    // 先扰动视口（缩放 + 平移），再复位
    apiRef.current!.zoomBy(2);
    apiRef.current!.panBy(50, 30);
    apiRef.current!.resetViewport();

    const zoom = Math.min(600 / 1200, 400 / 800) * FIT_MARGIN;
    const vpt = canvas.viewportTransform;
    expect(vpt[0]).toBeCloseTo(zoom);
    expect(vpt[3]).toBeCloseTo(zoom);
    // 世界中心 (600, 400) 映射到视口中心 (300, 200)
    expect(vpt[4]).toBeCloseTo((600 - 1200 * zoom) / 2);
    expect(vpt[5]).toBeCloseTo((400 - 800 * zoom) / 2);
    expect(canvas.getWidth()).toBe(600);
    expect(canvas.getHeight()).toBe(400);
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

    useToolStore.setState({ tool: 'trace' });
    render(
      <FabricCanvas
        project={project}
        onProjectChange={onProjectChange}
      />,
    );
    canvas = lastCanvas();

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

    useToolStore.setState({ tool: 'trace' });
    render(<FabricCanvas project={project} />);
    canvas = lastCanvas();

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

    useToolStore.setState({ tool: 'trace' });
    render(
      <FabricCanvas
        project={project}
        onProjectChange={onProjectChange}
      />,
    );
    canvas = lastCanvas();

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
        onProjectChange={onProjectChange}
      />,
    );
    canvas = lastCanvas();

    canvas!.fire('mouse:down', { ...pointerEvent(10, 10), alreadySelected: false });
    canvas!.fire('mouse:move', pointerEvent(60, 40));
    canvas!.fire('mouse:up', { ...pointerEvent(160, 120), isClick: false });
    expect(onProjectChange).not.toHaveBeenCalled();
  });

  it('trace 模式关闭对象选择（selection/skipTargetFind），切回 select 恢复', () => {
    let canvas: Canvas | undefined;
    const project = createEmptyProject(1200, 800);

    render(<FabricCanvas project={project} />);
    canvas = lastCanvas();
    expect(canvas!.selection).toBe(true);

    act(() => useToolStore.getState().setTool('trace'));
    expect(canvas!.selection).toBe(false);
    expect(canvas!.skipTargetFind).toBe(true);

    act(() => useToolStore.getState().setTool('select'));
    expect(canvas!.selection).toBe(true);
    expect(canvas!.skipTargetFind).toBe(false);
  });

  it('取色挂起（trace 描绘中）中止进行中笔迹，不产生纸片（幽灵笔迹 bug 修复）', () => {
    let canvas: Canvas | undefined;
    const onProjectChange = vi.fn();
    const project = createEmptyProject(1200, 800);

    useToolStore.setState({ tool: 'trace' });
    render(<FabricCanvas project={project} onProjectChange={onProjectChange} />);
    canvas = lastCanvas();

    // 开始描摹（mouse down + move → 临时笔迹出现）
    canvas!.fire('mouse:down', { ...pointerEvent(10, 10), alreadySelected: false });
    canvas!.fire('mouse:move', pointerEvent(60, 40));
    expect(canvas!.getObjects()).toHaveLength(1);

    // 进入取色（pickSession null→非 null）：命令式中止进行中笔迹
    act(() => useToolStore.getState().enterPickColor({ temporary: true }));
    expect(canvas!.getObjects()).toHaveLength(0); // 临时笔迹已移除
    expect(onProjectChange).not.toHaveBeenCalled(); // 未产生纸片

    // 取色期间松开鼠标：drawingRef=false 短路 mouse:up，不补产生纸片、tempPath 不双移除
    canvas!.fire('mouse:up', { ...pointerEvent(160, 120), isClick: false });
    expect(onProjectChange).not.toHaveBeenCalled();
    expect(canvas!.getObjects()).toHaveLength(0);
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

    render(<FabricCanvas project={project} />);
    canvas = lastCanvas();

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

    render(<FabricCanvas project={project} />);
    canvas = lastCanvas();

    clickAt(canvas!, 103, 40); // 右边缘外 3px ≤ 容差 4
    expect(activePaperId(canvas)).toBe(paper.id);
  });

  it('未命中时清空已选中', () => {
    let canvas: Canvas | undefined;
    const project = createEmptyProject(1200, 800);
    project.elements.push(createPaperElement({ path: RECT, color: '#c0392b' }));

    render(<FabricCanvas project={project} />);
    canvas = lastCanvas();

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

    render(<FabricCanvas project={project} />);
    canvas = lastCanvas();

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
        onProjectChange={onProjectChange}
      />,
    );
    canvas = lastCanvas();

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

    // store 回灌 → 重渲染（renderer 重建对象），选中不丢失
    rerender(
      <FabricCanvas
        project={next}
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
        onProjectChange={onProjectChange}
      />,
    );
    canvas = lastCanvas();

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
        onSelectionChange={onSelectionChange}
      />,
    );
    canvas = lastCanvas();

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
        onSelectionChange={onSelectionChange}
      />,
    );
    canvas = lastCanvas();

    clickAt(canvas!, 50, 40); // A
    expect(onSelectionChange).toHaveBeenLastCalledWith(a.id);
    clickAt(canvas!, 250, 40); // B
    expect(onSelectionChange).toHaveBeenLastCalledWith(b.id);
  });
});
