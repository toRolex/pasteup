import { describe, expect, it } from 'vitest';
import { Path } from 'fabric';
import {
  CURVE_SEGMENTS,
  distanceToPolygon,
  distanceToSegment,
  hitTestElement,
  hitTestPath,
  pathToPolygons,
  pointInPolygon,
  sceneToLocal,
  type Pt,
} from './hitTest';
import { pointsToClosedPath } from './traceTool';
import { createPaperElement, type ProjectTransform } from '../types/project';

const RECT = 'M 0 0 L 100 0 L 100 80 L 0 80 Z';
const L_SHAPE = 'M 0 0 L 100 0 L 100 40 L 40 40 L 40 100 L 0 100 Z';

function expectPt(actual: Pt, expected: Pt): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

describe('hitTest（T6 seam 1/2/3）— 纯几何命中', () => {
  describe('pathToPolygons：SVG path d → 采样多边形', () => {
    it('矩形返回单一闭合多边形，顶点按序', () => {
      const polys = pathToPolygons(RECT);
      expect(polys).toHaveLength(1);
      expect(polys[0]).toEqual([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
        { x: 0, y: 80 },
      ]);
    });

    it('相对命令归一化为绝对坐标', () => {
      const polys = pathToPolygons('m 0 0 l 10 0 l 0 10 l -10 0 z');
      expect(polys[0]).toEqual([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]);
    });

    it('闭合三次贝塞尔（traceTool Catmull-Rom 同构）按密度细分为折线，首尾相接', () => {
      const d = pointsToClosedPath([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
        { x: 0, y: 80 },
      ]);
      expect(() => new Path(d)).not.toThrow();
      const polys = pathToPolygons(d);
      expect(polys).toHaveLength(1);
      // 4 个描点 → 4 段 C，每段细分 CURVE_SEGMENTS 段；M 起始点 1 个
      expect(polys[0]).toHaveLength(1 + 4 * CURVE_SEGMENTS);
      expectPt(polys[0][0], polys[0][polys[0].length - 1]);
    });

    it('开放路径同样产出多边形（命中按隐式闭合处理）', () => {
      const polys = pathToPolygons('M 0 0 L 10 0 L 10 10');
      expect(polys).toHaveLength(1);
      expect(polys[0]).toHaveLength(3);
    });
  });

  describe('pointInPolygon：射线法内部判定', () => {
    const rect: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ];

    it('凸矩形：内部命中，外部不命中', () => {
      expect(pointInPolygon({ x: 50, y: 40 }, rect)).toBe(true);
      expect(pointInPolygon({ x: 150, y: 40 }, rect)).toBe(false);
      expect(pointInPolygon({ x: 50, y: 100 }, rect)).toBe(false);
    });

    const lShape: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
      { x: 40, y: 40 },
      { x: 40, y: 100 },
      { x: 0, y: 100 },
    ];

    it('凹 L 形：凹槽缺口不命中，实体部分命中', () => {
      expect(pointInPolygon({ x: 50, y: 50 }, lShape)).toBe(false); // 缺口
      expect(pointInPolygon({ x: 20, y: 20 }, lShape)).toBe(true); // 左下实体
      expect(pointInPolygon({ x: 50, y: 20 }, lShape)).toBe(true); // 上方横条
    });
  });

  describe('distanceToSegment / distanceToPolygon：边缘距离', () => {
    it('点到线段垂直距离', () => {
      expect(distanceToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5);
    });

    it('点投影落在端点外时取端点距离', () => {
      expect(distanceToSegment({ x: 20, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(
        Math.sqrt(125),
      );
    });

    it('点在线上距离为 0', () => {
      expect(distanceToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0);
    });

    it('多边形边缘距离取最近边', () => {
      const rect: Pt[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
        { x: 0, y: 80 },
      ];
      expect(distanceToPolygon({ x: 50, y: 90 }, rect)).toBeCloseTo(10);
      expect(distanceToPolygon({ x: 50, y: 0 }, rect)).toBeCloseTo(0); // 恰在边上
    });
  });

  describe('hitTestPath：本地坐标命中（内部 + 边缘容差）', () => {
    it('矩形：内部命中，超出容差的外部不命中', () => {
      expect(hitTestPath(RECT, { x: 50, y: 40 }, 4)).toBe(true);
      expect(hitTestPath(RECT, { x: 150, y: 40 }, 4)).toBe(false);
      expect(hitTestPath(RECT, { x: 50, y: -10 }, 4)).toBe(false);
    });

    it('边缘容差命中：边内/边外几像素均命中，超出容差不命中', () => {
      expect(hitTestPath(RECT, { x: 100, y: 40 }, 4)).toBe(true); // 恰在边上
      expect(hitTestPath(RECT, { x: 103, y: 40 }, 4)).toBe(true); // 边外 3px ≤ 4
      expect(hitTestPath(RECT, { x: 106, y: 40 }, 4)).toBe(false); // 边外 6px > 4
    });

    it('bbox 内形状外不误命中：L 形凹槽', () => {
      expect(hitTestPath(L_SHAPE, { x: 50, y: 50 }, 4)).toBe(false); // 凹槽（bbox 内）
      expect(hitTestPath(L_SHAPE, { x: 20, y: 20 }, 4)).toBe(true); // 实体
      expect(hitTestPath(L_SHAPE, { x: 43, y: 50 }, 4)).toBe(true); // 距凹槽边 3px ≤ 4
      expect(hitTestPath(L_SHAPE, { x: 60, y: 60 }, 4)).toBe(false); // 凹槽中心
    });
  });

  describe('sceneToLocal：transform 逆变换', () => {
    it('平移', () => {
      expectPt(
        sceneToLocal({ x: 110, y: 60 }, { x: 100, y: 50, rotation: 0, scaleX: 1, scaleY: 1 }),
        { x: 10, y: 10 },
      );
    });

    it('旋转 90°', () => {
      expectPt(
        sceneToLocal({ x: -25, y: 50 }, { x: 0, y: 0, rotation: 90, scaleX: 1, scaleY: 1 }),
        { x: 50, y: 25 },
      );
    });

    it('非均匀缩放', () => {
      expectPt(
        sceneToLocal({ x: 110, y: 130 }, { x: 100, y: 100, rotation: 0, scaleX: 2, scaleY: 3 }),
        { x: 5, y: 10 },
      );
    });

    it('旋转 + 非均匀缩放组合（逆序：旋转优先、缩放在后）', () => {
      // 正变换：local(5,5) → scale(10,15) → R90(-15,10) → translate(-5,30)
      const t: ProjectTransform = { x: 10, y: 20, rotation: 90, scaleX: 2, scaleY: 3 };
      expectPt(sceneToLocal({ x: -5, y: 30 }, t), { x: 5, y: 5 });
    });
  });

  describe('hitTestElement：场景坐标命中（含 transform）', () => {
    function element(path: string, transform: ProjectTransform) {
      return createPaperElement({ path, color: '#7A8B5C', transform });
    }

    it('平移后：内部命中、外部不命中', () => {
      const el = element(RECT, { x: 100, y: 50, rotation: 0, scaleX: 1, scaleY: 1 });
      expect(hitTestElement(el, { x: 150, y: 90 }, 4)).toBe(true);
      expect(hitTestElement(el, { x: 250, y: 90 }, 4)).toBe(false);
    });

    it('旋转 90° 后：内部命中、边缘容差、外部不命中', () => {
      const el = element('M 0 0 L 100 0 L 100 50 L 0 50 Z', {
        x: 0,
        y: 0,
        rotation: 90,
        scaleX: 1,
        scaleY: 1,
      });
      expect(hitTestElement(el, { x: -25, y: 50 }, 4)).toBe(true); // local (50,25) 内部
      expect(hitTestElement(el, { x: -25, y: 100 }, 4)).toBe(true); // local (100,25) 边缘
      expect(hitTestElement(el, { x: -25, y: 150 }, 4)).toBe(false); // local (150,25) 外部
    });

    it('缩放后：内部命中、边缘容差随 scale 折算', () => {
      const el = element('M 0 0 L 50 0 L 50 30 L 0 30 Z', {
        x: 100,
        y: 100,
        rotation: 0,
        scaleX: 2,
        scaleY: 2,
      });
      expect(hitTestElement(el, { x: 150, y: 110 }, 4)).toBe(true); // local (25,5) 内部
      expect(hitTestElement(el, { x: 202, y: 110 }, 4)).toBe(true); // local (51,5) 距边 1 local = 2 scene ≤ 4
      expect(hitTestElement(el, { x: 210, y: 110 }, 4)).toBe(false); // local (55,5) 距边 5 local = 10 scene > 4
    });

    it('旋转 + 非均匀缩放组合：bbox 内形状外不误命中', () => {
      const el = element(L_SHAPE, { x: 100, y: 50, rotation: 90, scaleX: 2, scaleY: 2 });
      expect(hitTestElement(el, { x: 60, y: 90 }, 4)).toBe(true); // local (20,20) 实体
      expect(hitTestElement(el, { x: 0, y: 150 }, 4)).toBe(false); // local (50,50) 凹槽（bbox 内）
    });
  });
});
