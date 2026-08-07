import { describe, expect, it } from 'vitest';
import { Path } from 'fabric';
import {
  pointsToClosedPath,
  pointsToOpenPath,
  tracePointsToPaper,
  type TracePoint,
} from './traceTool';

const P = (x: number, y: number): TracePoint => ({ x, y });

describe('traceTool（seam 1/2）— 轨迹采集纯逻辑', () => {
  describe('pointsToOpenPath（描摹中实时笔迹，开放路径）', () => {
    it('空输入返回空串', () => {
      expect(pointsToOpenPath([])).toBe('');
    });

    it('单点返回 M 起笔', () => {
      expect(pointsToOpenPath([P(10, 20)])).toBe('M 10 20');
    });

    it('两点返回折线', () => {
      expect(pointsToOpenPath([P(0, 0), P(100, 50)])).toBe('M 0 0 L 100 50');
    });

    it('三点及以上用二次贝塞尔中点平滑，落点在最末点', () => {
      const d = pointsToOpenPath([P(0, 0), P(50, 100), P(100, 0)]);
      expect(d.startsWith('M 0 0')).toBe(true);
      expect(d).toContain('Q 50 100 75 50');
      expect(d.endsWith('L 100 0')).toBe(true);
    });
  });

  describe('pointsToClosedPath（松开自动闭合，SVG d 可被 fabric.Path 解析）', () => {
    it('空输入返回空串', () => {
      expect(pointsToClosedPath([])).toBe('');
    });

    it('单点退化为 M + Z', () => {
      expect(pointsToClosedPath([P(10, 20)])).toBe('M 10 20 Z');
    });

    it('两点退化为闭合折线', () => {
      expect(pointsToClosedPath([P(0, 0), P(100, 50)])).toBe('M 0 0 L 100 50 Z');
    });

    it('矩形四点生成平滑闭合曲线，首尾相接且可被 fabric.Path 解析', () => {
      const d = pointsToClosedPath([P(0, 0), P(100, 0), P(100, 80), P(0, 80)]);
      expect(d.startsWith('M 0 0')).toBe(true);
      expect(d.endsWith('0 0 Z')).toBe(true);
      // Catmull-Rom→三次贝塞尔：每段一个 C，共 4 个点 → 4 段
      expect(d.split('C ').length - 1).toBe(4);
      expect(() => new Path(d)).not.toThrow();
    });
  });

  describe('tracePointsToPaper（描摹收尾 → 纸片元素）', () => {
    it('描点不足 3 个视为误触，不生成纸片（边界）', () => {
      expect(tracePointsToPaper([P(0, 0)])).toBeNull();
      expect(tracePointsToPaper([P(0, 0), P(5, 5)])).toBeNull();
    });

    it('3 个及以上描点生成闭合纸片元素（默认苔绿色）', () => {
      const paper = tracePointsToPaper([P(0, 0), P(100, 0), P(50, 80)]);
      expect(paper).not.toBeNull();
      expect(paper!.kind).toBe('paper');
      expect(paper!.path.endsWith(' Z')).toBe(true);
      expect(paper!.color).toBe('#7A8B5C');
      expect(paper!.transform).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    });
  });
});
