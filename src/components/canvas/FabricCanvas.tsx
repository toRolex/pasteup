/**
 * FabricCanvas 桥接壳（架构核心）。
 *
 * 分工铁律：Fabric 管画布内部状态，React 只管 UI 外壳，经本壳单向通信，不双向绑定。
 * - 单向向下：project 变化 → 把 elements 推送到 fabric 画布（命令式重绘）。
 * - 单向向上：fabric 事件（object:modified）→ 显式读取对象属性回灌 onProjectChange。
 * - 不依赖 fabric `toObject()` 默认行为，schema 字段显式读写。
 */
import { useEffect, useRef, type MutableRefObject } from 'react';
import { Canvas, FabricImage, Path, Point, type TPointerEventInfo } from 'fabric';
import type { PaperProject } from '../../types/project';
import { createFabricPath } from '../../fabric/paperFactory';
import { HIT_TOLERANCE, hitTestElement } from '../../fabric/hitTest';
import { pointsToOpenPath, tracePointsToPaper } from '../../fabric/traceTool';
import { getZoom, panBy, resetViewport, zoomBy } from '../../fabric/viewport';

/** 描摹笔迹（临时）：ink 墨色半透明，模拟手绘描线（DESIGN.md ink-line）。 */
const TRACE_STROKE = 'rgba(90, 70, 52, 0.55)';
const TRACE_STROKE_WIDTH = 3;

/** 画布当前工具：select 默认选择/移动；trace 自由描绘。 */
export type FabricTool = 'select' | 'trace';

/** React→fabric 命令式导航句柄（只承载视口操作与命令式选中，不承载元素读写）。 */
export interface FabricCanvasApi {
  /** 按倍率缩放视口，返回新缩放值。 */
  zoomBy(factor: number): number;
  /** 视口平移 dx/dy 像素。 */
  panBy(dx: number, dy: number): void;
  /** 复位视口：缩放 1、位移 0。 */
  resetViewport(): void;
  /** 当前视口缩放。 */
  getZoom(): number;
  /** 命令式选中指定 paperId 的纸片（未找到 no-op）。T11 图层面板点击条目用。 */
  setActiveObject(paperId: string): void;
}

export interface FabricCanvasProps {
  project: PaperProject;
  /** fabric 画布状态变化（用户拖动/旋转纸片等）向上回灌的新项目。 */
  onProjectChange?: (project: PaperProject) => void;
  /** 画布就绪后暴露 fabric.Canvas 实例（供导出、命中测试等扩展用）。 */
  onReady?: (canvas: Canvas) => void;
  /** 选中变化（fabric → React 单向事件）：当前选中纸片 id，未选中为 null。 */
  onSelectionChange?: (paperId: string | null) => void;
  /** 导航句柄（单向向下：React → fabric 视口；fabric 事件仍只经 onProjectChange 回灌）。 */
  apiRef?: MutableRefObject<FabricCanvasApi | null>;
  /** 当前工具：trace 进入自由描绘（采点 → 自动闭合 → 纸片回灌）。 */
  activeTool?: FabricTool;
}

/** 把 project.elements 命令式推送到 fabric 画布（单向向下）。
 *  T10（T8 遗留接线）：textureId → textures 表 dataUrl → createFabricPath Pattern 填充。 */
function renderProject(canvas: Canvas, project: PaperProject): void {
  canvas.clear();
  canvas.setDimensions({ width: project.canvas.width, height: project.canvas.height });
  for (const el of project.elements) {
    const texture = el.textureId
      ? project.textures.find((t) => t.id === el.textureId)
      : undefined;
    canvas.add(createFabricPath(el, texture?.dataUrl));
  }
  applyBackground(canvas, project.bgPhoto);
  canvas.requestRenderAll();
}

function applyBackground(canvas: Canvas, bgPhoto: PaperProject['bgPhoto']): void {
  if (!bgPhoto) {
    canvas.backgroundImage = undefined;
    return;
  }
  if (!bgPhoto.dataUrl) return;
  void FabricImage.fromURL(bgPhoto.dataUrl).then((image) => {
    image.visible = bgPhoto.visible;
    canvas.backgroundImage = image;
    canvas.requestRenderAll();
  });
}

/** 从 fabric 画布对象显式读回 transform，回灌成新 project（单向向上，不写回原对象）。 */
interface ReadableFabricObject {
  paperId?: string;
  left?: number;
  top?: number;
  angle?: number;
  scaleX?: number;
  scaleY?: number;
}

function readProjectFromCanvas(canvas: Canvas, previous: PaperProject): PaperProject {
  const objectById = new Map<string, ReadableFabricObject>();
  for (const obj of canvas.getObjects()) {
    const o = obj as unknown as ReadableFabricObject;
    if (o.paperId) objectById.set(o.paperId, o);
  }
  return {
    ...previous,
    elements: previous.elements.map((el) => {
      const obj = objectById.get(el.id);
      if (!obj) return el;
      return {
        ...el,
        transform: {
          x: obj.left ?? el.transform.x,
          y: obj.top ?? el.transform.y,
          rotation: obj.angle ?? el.transform.rotation,
          scaleX: obj.scaleX ?? el.transform.scaleX,
          scaleY: obj.scaleY ?? el.transform.scaleY,
        },
      };
    }),
  };
}

export function FabricCanvas({
  project,
  onProjectChange,
  onReady,
  onSelectionChange,
  apiRef,
  activeTool = 'select',
}: FabricCanvasProps) {
  const containerElRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const projectRef = useRef(project);
  const prevProjectRef = useRef<PaperProject | null>(null);
  const onProjectChangeRef = useRef(onProjectChange);
  const onReadyRef = useRef(onReady);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const apiRefRef = useRef(apiRef);
  const activeToolRef = useRef(activeTool);
  const pointsRef = useRef<{ x: number; y: number }[]>([]);
  const tempPathRef = useRef<Path | null>(null);
  const drawingRef = useRef(false);

  projectRef.current = project;
  onProjectChangeRef.current = onProjectChange;
  onReadyRef.current = onReady;
  onSelectionChangeRef.current = onSelectionChange;
  apiRefRef.current = apiRef;
  activeToolRef.current = activeTool;

  // 挂载：创建 fabric 画布并订阅事件（fabric 拥有画布内部状态）。
  // fabric v7 会把传入的 <canvas> 包进自建 wrapper，因此 React 只持有容器 div，
  // canvas 元素由本壳命令式创建，避免 React 虚拟 DOM 与 fabric 实际 DOM 布局脱节。
  useEffect(() => {
    const container = containerElRef.current;
    if (!container) return;
    const canvasEl = document.createElement('canvas');
    container.appendChild(canvasEl);

    const canvas = new Canvas(canvasEl, {
      width: projectRef.current.canvas.width,
      height: projectRef.current.canvas.height,
    });
    canvasRef.current = canvas;

    // T6 自定义命中：覆写 fabric 私有 _checkTarget（唯一对象命中判定点，被
    // _searchPossibleTargets 调用）。select 模式按纸片实际轮廓（isPointInPath 纯几何等价）
    // 命中，替代 fabric 默认 bbox 命中（避免 bbox 内形状外误命中）；不影响 findTarget 的
    // 活动对象控制柄（缩放/旋转手柄）逻辑。trace 模式 skipTargetFind=true 已短路本覆写。
    // 注意：这是 fabric 内部私有方法，属桥接壳对画布内部状态的有意接管（与画布分工铁律一致）。
    type CheckTargetFn = (obj: unknown, pointer: Point) => boolean;
    const originalCheckTarget = (
      Canvas.prototype as unknown as { _checkTarget?: CheckTargetFn }
    )._checkTarget;
    (canvas as unknown as { _checkTarget: CheckTargetFn })._checkTarget = function (
      obj: unknown,
      pointer: Point,
    ): boolean {
      const o = obj as { visible?: boolean; evented?: boolean; paperId?: string };
      if (!o || !o.visible || !o.evented) return false;
      if (!o.paperId) {
        return originalCheckTarget ? originalCheckTarget.call(this, obj, pointer) : false;
      }
      const element = projectRef.current.elements.find((el) => el.id === o.paperId);
      if (!element) return false;
      return hitTestElement(element, { x: pointer.x, y: pointer.y }, HIT_TOLERANCE);
    };

    canvas.on('object:modified', () => {
      const next = readProjectFromCanvas(canvas, projectRef.current);
      onProjectChangeRef.current?.(next);
    });

    // T10 选中联动（fabric → React 单向事件）：选中/切换/清空时上报当前选中纸片 id。
    // renderProject 重建对象时 fabric 会先 discardActiveObject（selection:cleared）再
    // setActiveObject（selection:created），React 18 批处理下最终状态仍为被恢复纸片。
    const emitSelection = () => {
      const active = canvas.getActiveObject();
      const paperId = (active as unknown as { paperId?: string } | undefined)?.paperId ?? null;
      onSelectionChangeRef.current?.(paperId);
    };
    canvas.on('selection:created', emitSelection);
    canvas.on('selection:updated', emitSelection);
    canvas.on('selection:cleared', emitSelection);

    // 自由描绘（trace 工具）：pointer 采集 scenePoint，实时笔迹 + 松开自动闭合。
    // 单向向上：闭合生成的纸片经 onProjectChange 回灌 store，不在 fabric 侧持有 React 状态。
    const handleTraceDown = (e: TPointerEventInfo) => {
      if (activeToolRef.current !== 'trace') return;
      const p = e.scenePoint;
      pointsRef.current = [{ x: p.x, y: p.y }];
      const temp = new Path(pointsToOpenPath(pointsRef.current), {
        fill: '',
        stroke: TRACE_STROKE,
        strokeWidth: TRACE_STROKE_WIDTH,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        selectable: false,
        evented: false,
      });
      tempPathRef.current = temp;
      drawingRef.current = true;
      canvas.add(temp);
      canvas.requestRenderAll();
    };

    const handleTraceMove = (e: TPointerEventInfo) => {
      if (!drawingRef.current) return;
      const p = e.scenePoint;
      pointsRef.current.push({ x: p.x, y: p.y });
      const temp = tempPathRef.current;
      if (temp) {
        // fabric v7 Path.path 是解析后的命令数组；用临时 Path 解析新 d 后整体替换
        temp.path = new Path(pointsToOpenPath(pointsRef.current)).path;
        temp.setCoords();
      }
      canvas.requestRenderAll();
    };

    const handleTraceUp = (e: TPointerEventInfo) => {
      if (!drawingRef.current) return;
      const p = e.scenePoint;
      pointsRef.current.push({ x: p.x, y: p.y });
      drawingRef.current = false;
      if (tempPathRef.current) canvas.remove(tempPathRef.current);
      tempPathRef.current = null;
      const points = pointsRef.current;
      pointsRef.current = [];
      const paper = tracePointsToPaper(points);
      const onProjectChange = onProjectChangeRef.current;
      if (paper && onProjectChange) {
        const current = projectRef.current;
        onProjectChange({ ...current, elements: [...current.elements, paper] });
      }
      canvas.requestRenderAll();
    };

    canvas.on('mouse:down', handleTraceDown);
    canvas.on('mouse:move', handleTraceMove);
    canvas.on('mouse:up', handleTraceUp);

    // 导航句柄：仅承载视口操作与命令式选中（单向向下），fabric 事件仍只经 onProjectChange 回灌。
    const targetApiRef = apiRefRef.current;
    if (targetApiRef) {
      targetApiRef.current = {
        zoomBy: (factor) => zoomBy(canvas, factor),
        panBy: (dx, dy) => panBy(canvas, dx, dy),
        resetViewport: () => resetViewport(canvas),
        getZoom: () => getZoom(canvas),
        setActiveObject: (paperId) => {
          const target = canvas
            .getObjects()
            .find((o) => (o as { paperId?: string }).paperId === paperId);
          if (!target) return;
          canvas.setActiveObject(target);
          canvas.requestRenderAll();
        },
      };
    }

    onReadyRef.current?.(canvas);

    return () => {
      if (targetApiRef) targetApiRef.current = null;
      canvas.dispose();
      canvasRef.current = null;
    };
    // 仅挂载时执行一次；fabric 画布生命周期由本壳持有
  }, []);

  // 工具切换：trace 模式关闭对象选择（不选中既有纸片），光标改十字准星。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const isTrace = activeTool === 'trace';
    canvas.selection = !isTrace;
    canvas.skipTargetFind = isTrace;
    canvas.defaultCursor = isTrace ? 'crosshair' : 'default';
  }, [activeTool]);

  // 单向向下：project 变化时推送 elements 到画布。
  // renderProject 会 clear 重建对象，导致选中丢失；这里在重建后按 paperId 命令式恢复
  // activeObject（React→fabric 单向命令式，不引入双向绑定）。
  // bgPhoto 分支只切可见性，不动元素——但仅当本次变化确实是「纯底图 visible 切换」才走
  // 快速路径；undo/redo 恢复、描摹/变换回灌等会改 elements 的，必须全量 renderProject，
  // 否则画布与 store 脱节（例如有底图时撤销纸片移动不会重绘）。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prev = prevProjectRef.current;
    prevProjectRef.current = project;
    // 首帧（prev === null）与 elements/textures/canvas 引用或底图 dataUrl 变化 → 全量重绘
    const bgOnlyChange =
      prev !== null &&
      project.elements === prev.elements &&
      project.textures === prev.textures &&
      project.canvas === prev.canvas &&
      project.bgPhoto?.dataUrl === prev.bgPhoto?.dataUrl;
    if (bgOnlyChange) {
      if (canvas.backgroundImage && project.bgPhoto) {
        canvas.backgroundImage.visible = project.bgPhoto.visible;
        canvas.requestRenderAll();
      }
      return;
    }
    const activePaperId = (canvas.getActiveObject() as { paperId?: string } | undefined)?.paperId;
    renderProject(canvas, project);
    if (activePaperId) {
      const restored = canvas
        .getObjects()
        .find((o) => (o as { paperId?: string }).paperId === activePaperId);
      if (restored) {
        canvas.setActiveObject(restored);
        canvas.requestRenderAll();
      }
    }
  }, [project]);

  return <div ref={containerElRef} data-testid="fabric-canvas" />;
}
