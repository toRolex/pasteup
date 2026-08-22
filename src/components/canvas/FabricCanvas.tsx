/**
 * FabricCanvas 桥接壳（架构核心）。
 *
 * 分工铁律：Fabric 管画布内部状态，React 只管 UI 外壳，经本壳单向通信，不双向绑定。
 * - 单向向下：project 变化 → 经 projectRenderer 命令式同步到 fabric 画布（渲染知识收在 renderer，#47）。
 * - 单向向上：fabric 事件（object:modified）→ 显式读取对象属性回灌 onProjectChange。
 * - 不依赖 fabric `toObject()` 默认行为，schema 字段显式读写。
 * 本壳只剩交互职责：trace 状态机（含取色挂起中止笔迹）/ selection 事件 / _checkTarget 命中 /
 * object:modified 回灌 / apiRef 导航 / 工具切换；渲染同步（失效判定 / 重建 / 纹理补丁 /
 * selection 恢复）归 projectRenderer。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import { Canvas, Path, Point, type FabricObject, type TPointerEventInfo } from 'fabric';
import type { PaperProject } from '../../types/project';
import { findPaperObject, readTransform } from '../../fabric/paperBridge';
import { createProjectRenderer, type ProjectRenderer } from '../../fabric/projectRenderer';
import { HIT_TOLERANCE, hitTestElement } from '../../fabric/hitTest';
import { pointsToOpenPath, tracePointsToPaper } from '../../fabric/traceTool';
import { getZoom, fitToViewport, panBy, zoomBy } from '../../fabric/viewport';
import { textureSupply, type TextureLoadSide } from '../../texture/supply';
import { useToolStore } from '../../store/toolStore';

/** 描摹笔迹（临时）：ink 墨色半透明，模拟手绘描线（DESIGN.md ink-line）。 */
const TRACE_STROKE = 'rgba(90, 70, 52, 0.55)';
const TRACE_STROKE_WIDTH = 3;

/** React→fabric 命令式导航句柄（只承载视口操作与命令式选中，不承载元素读写）。 */
export interface FabricCanvasApi {
  /** 按倍率缩放视口，返回新缩放值。 */
  zoomBy(factor: number): number;
  /** 视口平移 dx/dy 像素。 */
  panBy(dx: number, dy: number): void;
  /** 复位视口：回到 fit-to-viewport（整张纸可见、居中）。 */
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
  /** 选中变化（fabric → React 单向事件）：当前选中纸片 id，未选中为 null。 */
  onSelectionChange?: (paperId: string | null) => void;
  /** 导航句柄（单向向下：React → fabric 视口；fabric 事件仍只经 onProjectChange 回灌）。 */
  apiRef?: MutableRefObject<FabricCanvasApi | null>;
  /** 纹理供给 load 侧（T18 运行时与导出共用同一条管线；默认应用级单例，测试注入 fake）。 */
  textureLoader?: TextureLoadSide;
}

/** 从 fabric 画布对象显式读回 transform，回灌成新 project（单向向上，不写回原对象）。
 *  单对象 transform 反向映射走 paperBridge.readTransform（缺字段 ?? 回落先前值）；
 *  elements 合并（join-key：elements.find(el => el.id === …)）留在本壳，不收进 paperBridge。 */
function readProjectFromCanvas(canvas: Canvas, previous: PaperProject): PaperProject {
  const objectById = new Map<string, FabricObject>();
  for (const obj of canvas.getObjects()) {
    if (obj.paperId) objectById.set(obj.paperId, obj);
  }
  return {
    ...previous,
    elements: previous.elements.map((el) => {
      const obj = objectById.get(el.id);
      if (!obj) return el;
      return {
        ...el,
        transform: readTransform(obj, el.transform),
      };
    }),
  };
}

export function FabricCanvas({
  project,
  onProjectChange,
  onSelectionChange,
  apiRef,
  textureLoader = textureSupply,
}: FabricCanvasProps) {
  const tool = useToolStore((s) => s.tool);
  const pickSession = useToolStore((s) => s.pickSession);
  const containerElRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const rendererRef = useRef<ProjectRenderer | null>(null);
  const projectRef = useRef(project);
  const onProjectChangeRef = useRef(onProjectChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const apiRefRef = useRef(apiRef);
  const activeToolRef = useRef(tool);
  const textureLoaderRef = useRef(textureLoader);
  const pointsRef = useRef<{ x: number; y: number }[]>([]);
  const tempPathRef = useRef<Path | null>(null);
  const drawingRef = useRef(false);
  const prevPickSessionRef = useRef(pickSession);

  projectRef.current = project;
  onProjectChangeRef.current = onProjectChange;
  onSelectionChangeRef.current = onSelectionChange;
  apiRefRef.current = apiRef;
  activeToolRef.current = tool;
  textureLoaderRef.current = textureLoader;

  // 视口适配（viewport fit）：DOM 尺寸=容器尺寸 + viewportTransform 设 fit 居中矩阵。
  // 世界坐标始终是 project.canvas 尺寸；fit 不经 setZoom 钳制（见 computeFitZoom）。
  // 布局读统一 clientWidth/clientHeight；零尺寸守卫（jsdom 无布局）保留。
  const applyFit = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerElRef.current;
    if (!canvas || !container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w <= 0 || h <= 0) return;
    fitToViewport(canvas, { width: w, height: h }, projectRef.current.canvas);
    canvas.requestRenderAll();
  }, []);

  // 挂载：创建 fabric 画布并订阅事件（fabric 拥有画布内部状态）。
  // fabric v7 会把传入的 <canvas> 包进自建 wrapper，因此 React 只持有容器 div，
  // canvas 元素由本壳命令式创建，避免 React 虚拟 DOM 与 fabric 实际 DOM 布局脱节。
  // 用 useLayoutEffect：创建画布 + applyFit 必须在首帧绘制前同步完成，
  // 否则浏览器会先按全尺寸（2480×3508）画一帧再收缩（首帧闪动）。
  useLayoutEffect(() => {
    const container = containerElRef.current;
    if (!container) return;
    const canvasEl = document.createElement('canvas');
    container.appendChild(canvasEl);

    const canvas = new Canvas(canvasEl, {
      width: projectRef.current.canvas.width,
      height: projectRef.current.canvas.height,
    });
    // fabric v7 构造时会在自建 wrapper 内新建 lower-canvas 而不复用传入元素，
    // 传入的 canvasEl 成为孤儿以 inline 留在容器里占位全尺寸，
    // 把 wrapper 推出视口（画布脱离视口 bug 的真正根因）——清掉。
    // StrictMode 双挂载下 dispose 的 cleanupDOM 会把 canvasEl 恢复回原 parent，
    // 孤儿再现，故卸载 cleanup 亦调本函数兜底。
    const detachOrphanCanvas = () => {
      if (canvasEl.parentElement === container) container.removeChild(canvasEl);
    };
    detachOrphanCanvas();
    canvasRef.current = canvas;

    // 创建后立即 fit 一次（layout effect 保证在首帧绘制前完成，不闪全尺寸画布）；
    // 此后由 RO 跟随容器变化。
    applyFit();

    // ResizeObserver 跟随容器：回调先对比尺寸，相同 early-return
    // （setDimensions 会改 wrapper 触发 RO，不守卫会自激循环）。zoom 重置为 fitScale。
    let lastW = container.clientWidth;
    let lastH = container.clientHeight;
    const ro = new ResizeObserver(() => {
      if (container.clientWidth === lastW && container.clientHeight === lastH) return;
      lastW = container.clientWidth;
      lastH = container.clientHeight;
      applyFit();
    });
    ro.observe(container);
    // 渲染同步收进有状态 renderer（#47）：构造注入共享 loader；renderer 生命周期与 canvas 绑定
    // （仅 mount 创建 / unmount dispose，重复创建会丢 prev）。
    rendererRef.current = createProjectRenderer(canvas, textureLoaderRef.current);

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
      const o = obj as FabricObject;
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
    // renderer 全量重建对象时 fabric 会先 discardActiveObject（selection:cleared）再
    // setActiveObject（selection:created），React 18 批处理下最终状态仍为被恢复纸片。
    const emitSelection = () => {
      const active = canvas.getActiveObject();
      const paperId = active?.paperId ?? null;
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
        resetViewport: () => applyFit(),
        getZoom: () => getZoom(canvas),
        setActiveObject: (paperId) => {
          const target = findPaperObject(canvas, paperId);
          if (!target) return;
          canvas.setActiveObject(target);
          canvas.requestRenderAll();
        },
      };
    }

    return () => {
      if (targetApiRef) targetApiRef.current = null;
      ro.disconnect();
      rendererRef.current?.dispose(); // dispose 只清 renderer 内部状态
      rendererRef.current = null;
      canvas.dispose(); // canvas 生命周期仍归壳
      detachOrphanCanvas();
      canvasRef.current = null;
    };
    // 仅挂载时执行一次；fabric 画布生命周期由本壳持有
  }, [applyFit]);

  // 工具切换：trace 模式关闭对象选择（不选中既有纸片），光标改十字准星。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const isTrace = tool === 'trace';
    canvas.selection = !isTrace;
    canvas.skipTargetFind = isTrace;
    canvas.defaultCursor = isTrace ? 'crosshair' : 'default';
  }, [tool]);

  // 取色挂起（pickSession null→非 null）且描绘进行中：命令式中止进行中笔迹
  // （清 pointsRef、移除 tempPath、drawingRef=false），不产生纸片——修复 trace 下
  // 取色残留幽灵笔迹 bug。drawingRef=false 同时短路后续 mouse:up，与 handleTraceUp
  // 互斥（tempPath 不会双移除）。
  useEffect(() => {
    const wasPicking = prevPickSessionRef.current !== null;
    const isPicking = pickSession !== null;
    prevPickSessionRef.current = pickSession;
    if (isPicking && !wasPicking && drawingRef.current) {
      pointsRef.current = [];
      if (tempPathRef.current) canvasRef.current?.remove(tempPathRef.current);
      tempPathRef.current = null;
      drawingRef.current = false;
      canvasRef.current?.requestRenderAll();
    }
  }, [pickSession]);

  // 单向向下：project 变化时同步到画布。渲染知识（失效判定三态 / 全量重建 / 底图可见性 /
  // 异步纹理补丁 / selection 恢复）全部收进 projectRenderer（#47），壳只转发一句 render。
  useEffect(() => {
    rendererRef.current?.render(project);
  }, [project]);

  // project.canvas 尺寸变化（新建项目换朝向/分辨率）：世界变了，重算 fit。
  useEffect(() => {
    applyFit();
  }, [project.canvas.width, project.canvas.height, applyFit]);

  return <div ref={containerElRef} data-testid="fabric-canvas" />;
}
