/**
 * FabricCanvas 桥接壳（架构核心）。
 *
 * 分工铁律：Fabric 管画布内部状态，React 只管 UI 外壳，经本壳单向通信，不双向绑定。
 * - 单向向下：project 变化 → 把 elements 推送到 fabric 画布（命令式重绘）。
 * - 单向向上：fabric 事件（object:modified）→ 显式读取对象属性回灌 onProjectChange。
 * - 不依赖 fabric `toObject()` 默认行为，schema 字段显式读写。
 */
import { useEffect, useRef } from 'react';
import { Canvas } from 'fabric';
import type { PaperProject } from '../../types/project';
import { createFabricPath } from '../../fabric/paperFactory';

export interface FabricCanvasProps {
  project: PaperProject;
  /** fabric 画布状态变化（用户拖动/旋转纸片等）向上回灌的新项目。 */
  onProjectChange?: (project: PaperProject) => void;
  /** 画布就绪后暴露 fabric.Canvas 实例（供导出、命中测试等扩展用）。 */
  onReady?: (canvas: Canvas) => void;
}

/** 把 project.elements 命令式推送到 fabric 画布（单向向下）。 */
function renderProject(canvas: Canvas, project: PaperProject): void {
  canvas.clear();
  canvas.setDimensions({ width: project.canvas.width, height: project.canvas.height });
  for (const el of project.elements) {
    canvas.add(createFabricPath(el));
  }
  canvas.requestRenderAll();
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

export function FabricCanvas({ project, onProjectChange, onReady }: FabricCanvasProps) {
  const containerElRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const projectRef = useRef(project);
  const onProjectChangeRef = useRef(onProjectChange);
  const onReadyRef = useRef(onReady);

  projectRef.current = project;
  onProjectChangeRef.current = onProjectChange;
  onReadyRef.current = onReady;

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

    canvas.on('object:modified', () => {
      const next = readProjectFromCanvas(canvas, projectRef.current);
      onProjectChangeRef.current?.(next);
    });

    onReadyRef.current?.(canvas);

    return () => {
      canvas.dispose();
      canvasRef.current = null;
    };
    // 仅挂载时执行一次；fabric 画布生命周期由本壳持有
  }, []);

  // 单向向下：project 变化时推送 elements 到画布。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderProject(canvas, project);
  }, [project]);

  return <div ref={containerElRef} data-testid="fabric-canvas" />;
}
