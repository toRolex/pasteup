import { afterEach, describe, expect, it } from 'vitest';
import { Canvas } from 'fabric';
import { createEmptyProject, createPaperElement } from '../types/project';
import { createFabricPath } from './paperFactory';
import {
  getZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  resetViewport,
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

describe('viewport（seam S4）— 画布视口平移/缩放', () => {
  const canvases: Canvas[] = [];
  afterEach(() => {
    canvases.splice(0).forEach((c) => c.dispose());
  });

  function mountCanvas(width?: number, height?: number): Canvas {
    const canvas = makeCanvas(width, height);
    canvases.push(canvas);
    return canvas;
  }

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

  it('resetViewport 回到 iMatrix', () => {
    const canvas = mountCanvas();
    zoomBy(canvas, 2);
    panBy(canvas, 100, 50);

    resetViewport(canvas);

    expect(canvas.viewportTransform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(getZoom(canvas)).toBe(1);
  });
});
