import { afterEach, describe, expect, it } from 'vitest';
import { Canvas } from 'fabric';
import { createEmptyProject, createPaperElement } from '../types/project';
import { createFabricPath } from './paperBridge';
import {
  computeFitZoom,
  FIT_MARGIN,
  fitToViewport,
  getZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  setZoom,
  zoomBy,
} from './viewport';

/** 建一个带单个纸片的 fabric 画布，便于断言「视口变换不动元素」。 */
function makeCanvas(width = 1200, height = 800): Canvas {
  const canvasEl = document.createElement('canvas');
  const canvas = new Canvas(canvasEl, { width, height });
  const project = createEmptyProject(width, height);
  project.elements.push(
    createPaperElement({
      path: 'M 0 0 L 100 0 L 100 80 L 0 80 Z',
      color: '#c0392b',
      transform: { x: 24, y: 48, rotation: 0, scaleX: 1, scaleY: 1 },
    }),
  );
  canvas.add(createFabricPath(project.elements[0]));
  return canvas;
}

const canvases: Canvas[] = [];
afterEach(() => {
  canvases.splice(0).forEach((c) => c.dispose());
});

function mountCanvas(width?: number, height?: number): Canvas {
  const canvas = makeCanvas(width, height);
  canvases.push(canvas);
  return canvas;
}

describe('viewport（seam S4）— 画布视口平移/缩放', () => {
  it('初始视口 = iMatrix，getZoom 为 1', () => {
    const canvas = mountCanvas();
    expect(canvas.viewportTransform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(getZoom(canvas)).toBe(1);
  });

  it('zoomBy(2) 改 viewportTransform 缩放项，元素 left/top/scale 不变', () => {
    const canvas = mountCanvas();
    const el = canvas.getObjects()[0];
    const before = { left: el.left, top: el.top, scaleX: el.scaleX, scaleY: el.scaleY };

    zoomBy(canvas, 2);

    expect(canvas.viewportTransform[0]).toBe(2);
    expect(canvas.viewportTransform[3]).toBe(2);
    expect(el.left).toBe(before.left);
    expect(el.top).toBe(before.top);
    expect(el.scaleX).toBe(before.scaleX);
    expect(el.scaleY).toBe(before.scaleY);
  });

  it('setZoom 精确设值并钳制在 [MIN_ZOOM, MAX_ZOOM]', () => {
    const canvas = mountCanvas();
    setZoom(canvas, 1.5);
    expect(getZoom(canvas)).toBe(1.5);

    setZoom(canvas, 0.0001);
    expect(getZoom(canvas)).toBe(MIN_ZOOM);

    setZoom(canvas, 1e9);
    expect(getZoom(canvas)).toBe(MAX_ZOOM);
  });

  it('zoomBy 按倍率缩放且被钳制', () => {
    const canvas = mountCanvas();
    expect(zoomBy(canvas, 0.0001)).toBe(MIN_ZOOM);
    expect(zoomBy(canvas, 1e9)).toBe(MAX_ZOOM);
  });

  it('panBy(dx,dy) 改 viewportTransform 位移项，元素不动', () => {
    const canvas = mountCanvas();
    const el = canvas.getObjects()[0];
    const before = { left: el.left, top: el.top };

    panBy(canvas, 50, 30);

    expect(canvas.viewportTransform[4]).toBe(50);
    expect(canvas.viewportTransform[5]).toBe(30);
    expect(el.left).toBe(before.left);
    expect(el.top).toBe(before.top);
  });
});

describe('computeFitZoom — 视口适配纯函数（不经过用户缩放钳制）', () => {
  it('竖版 A4@300dpi 进横视口：宽高取 min，乘 FIT_MARGIN', () => {
    // min(634/2480, 592/3508) = min(0.2556, 0.1688) → 高受限
    const scale = computeFitZoom({ width: 2480, height: 3508 }, { width: 634, height: 592 });
    expect(scale).toBeCloseTo(Math.min(634 / 2480, 592 / 3508) * FIT_MARGIN);
    expect(scale).toBeGreaterThan(0.05); // 不被用户 MIN_ZOOM 钳掉
  });

  it('横版 A4@96dpi（1123×794）进近方形视口：宽受限', () => {
    const scale = computeFitZoom({ width: 1123, height: 794 }, { width: 600, height: 600 });
    expect(scale).toBeCloseTo((600 / 1123) * FIT_MARGIN);
  });

  it('超小容器：fit 值低于 MIN_ZOOM 也不被钳制（fit 与用户缩放两套钳制语义）', () => {
    const scale = computeFitZoom({ width: 2480, height: 3508 }, { width: 100, height: 80 });
    expect(scale).toBeCloseTo(Math.min(100 / 2480, 80 / 3508) * FIT_MARGIN);
    expect(scale).toBeLessThan(MIN_ZOOM);
  });

  it('退化输入（零尺寸世界或视口）：回落安全值不产生 NaN/Infinity', () => {
    expect(computeFitZoom({ width: 0, height: 3508 }, { width: 634, height: 592 })).toBe(FIT_MARGIN);
    expect(computeFitZoom({ width: 2480, height: 3508 }, { width: 0, height: 0 })).toBe(FIT_MARGIN);
  });
});

describe('fitToViewport — DOM 尺寸=容器 + viewportTransform 设 fit 居中矩阵', () => {
  it('setDimensions 到容器尺寸，zoom=fitScale，世界中心映射到视口中心', () => {
    const canvas = mountCanvas(2480, 3508);

    fitToViewport(canvas, { width: 634, height: 592 }, { width: 2480, height: 3508 });

    expect(canvas.getWidth()).toBe(634);
    expect(canvas.getHeight()).toBe(592);
    const vpt = canvas.viewportTransform;
    expect(vpt[0]).toBeCloseTo(computeFitZoom({ width: 2480, height: 3508 }, { width: 634, height: 592 }));
    // 世界中心 (1240, 1754) 经 vpt 映射后落在视口中心 (317, 296)
    const wx = 2480 / 2, wy = 3508 / 2;
    expect(vpt[0] * wx + vpt[4]).toBeCloseTo(634 / 2, 0);
    expect(vpt[3] * wy + vpt[5]).toBeCloseTo(592 / 2, 0);
  });

  it('zoomBy 以视口中心为锚点：中心点场景坐标不变（fit 居中后 ± 不漂移）', () => {
    const canvas = mountCanvas(2480, 3508);
    fitToViewport(canvas, { width: 634, height: 592 }, { width: 2480, height: 3508 });
    const cx = canvas.getWidth() / 2, cy = canvas.getHeight() / 2;
    const before = fabricPointToScene(canvas.viewportTransform, cx, cy);

    zoomBy(canvas, 1.25);

    const after = fabricPointToScene(canvas.viewportTransform, cx, cy);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
  });
});

/** 视口像素点 → 世界坐标（vpt 逆变换）。 */
function fabricPointToScene(vpt: number[], px: number, py: number) {
  return {
    x: (px - vpt[4]) / vpt[0],
    y: (py - vpt[5]) / vpt[3],
  };
}
