import { describe, expect, it } from 'vitest';
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  CANVAS_ORIENTATIONS,
  CANVAS_RESOLUTIONS,
  DEFAULT_CANVAS_ORIENTATION,
  DEFAULT_CANVAS_RESOLUTION,
  createCanvasSize,
  mmToPx,
} from './canvasSize';

describe('mmToPx（seam S1）— 1mm = DPI/25.4 px', () => {
  it('@300：210mm→2480、297mm→3508', () => {
    expect(mmToPx(210, 300)).toBe(2480);
    expect(mmToPx(297, 300)).toBe(3508);
  });

  it('@96：210mm→794、297mm→1123（四舍五入）', () => {
    expect(mmToPx(210, 96)).toBe(794);
    expect(mmToPx(297, 96)).toBe(1123);
  });

  it('@600：210mm→4961、297mm→7016', () => {
    expect(mmToPx(210, 600)).toBe(4961);
    expect(mmToPx(297, 600)).toBe(7016);
  });
});

describe('createCanvasSize（seam S1）— A4 换向', () => {
  it('竖版 210×297mm：portrait 时 width=210mm 侧、height=297mm 侧', () => {
    expect(createCanvasSize('portrait', 300)).toEqual({ width: 2480, height: 3508 });
    expect(createCanvasSize('portrait', 96)).toEqual({ width: 794, height: 1123 });
    expect(createCanvasSize('portrait', 600)).toEqual({ width: 4961, height: 7016 });
  });

  it('横版 297×210mm：landscape 时宽高互换', () => {
    expect(createCanvasSize('landscape', 300)).toEqual({ width: 3508, height: 2480 });
    expect(createCanvasSize('landscape', 96)).toEqual({ width: 1123, height: 794 });
    expect(createCanvasSize('landscape', 600)).toEqual({ width: 7016, height: 4961 });
  });
});

describe('常量（seam S1）', () => {
  it('A4 公制尺寸', () => {
    expect(A4_WIDTH_MM).toBe(210);
    expect(A4_HEIGHT_MM).toBe(297);
  });

  it('分辨率/朝向选项与默认值', () => {
    expect(CANVAS_RESOLUTIONS).toEqual([96, 300, 600]);
    expect(DEFAULT_CANVAS_RESOLUTION).toBe(300);
    expect(CANVAS_ORIENTATIONS).toEqual(['portrait', 'landscape']);
    expect(DEFAULT_CANVAS_ORIENTATION).toBe('portrait');
  });
});
