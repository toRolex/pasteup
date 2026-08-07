/**
 * 纸片命中测试（纯几何，headless 可断言）。
 *
 * 问题（issue #29）：fabric `Path.containsPoint` 默认按包围盒（bbox）判定，
 * 复杂闭合轮廓（描摹产物）在 bbox 内形状外会 100% 误命中。本模块自建命中：
 * 1. 把 SVG path d 采样成多边形折线（曲线段按密度细分）；
 * 2. 射线法 point-in-polygon 判内部；
 * 3. 点到线段距离 ≤ 容差判边缘命中；
 * 4. 命中前把指针坐标经 transform 逆变换回 path 本地坐标系。
 *
 * jsdom 的 CanvasRenderingContext2D 不实现 isPointInPath，因此不依赖 ctx 判定；
 * 只复用 fabric 的 path d 解析（new Path(d).path 已归一化相对命令为绝对命令）。
 */
import { Path } from 'fabric';
import type { PaperElement, ProjectTransform } from '../types/project';

export interface Pt {
  x: number;
  y: number;
}

/** 命中容差（场景坐标像素）：边缘命中允许的偏差。 */
export const HIT_TOLERANCE = 4;

/** 每条曲线段采样段数：采样密度越高边缘越贴近真实曲线，性能线性下降。 */
export const CURVE_SEGMENTS = 16;

/** path d → 采样多边形的缓存（同 d 反复命中免重解析；容量超限整体清空）。 */
const polygonCache = new Map<string, Pt[][]>();

function cubicBezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
  };
}

function quadraticBezier(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * p0.x + 2 * u * t * p1.x + tt * p2.x,
    y: uu * p0.y + 2 * u * t * p1.y + tt * p2.y,
  };
}

/** S/T 平滑曲线的控制点反射：2·current − lastControl（无前段时退化为 current）。 */
function reflectControl(control: Pt | null, current: Pt): Pt {
  return control ? { x: 2 * current.x - control.x, y: 2 * current.y - control.y } : current;
}

type Command = [string, ...number[]];

/** 解析 path d → 子路径多边形数组（开放子路径也产出，命中按隐式闭合处理）。 */
function parseToPolygons(d: string, segments: number): Pt[][] {
  const path = new Path(d).path as Command[];
  const polygons: Pt[][] = [];
  let poly: Pt[] = [];
  let current: Pt | null = null;
  let lastControl: Pt | null = null;

  const push = (p: Pt): void => {
    poly.push(p);
    current = p;
  };
  const finish = (): void => {
    if (poly.length > 0) polygons.push(poly);
    poly = [];
    lastControl = null;
  };

  for (const cmd of path) {
    switch (cmd[0]) {
      case 'M': {
        if (poly.length > 0) finish();
        current = { x: cmd[1], y: cmd[2] };
        poly = [current];
        lastControl = null;
        break;
      }
      case 'L': {
        push({ x: cmd[1], y: cmd[2] });
        lastControl = null;
        break;
      }
      case 'H': {
        push({ x: cmd[1], y: current!.y });
        lastControl = null;
        break;
      }
      case 'V': {
        push({ x: current!.x, y: cmd[1] });
        lastControl = null;
        break;
      }
      case 'C': {
        const p0 = current!;
        const p1 = { x: cmd[1], y: cmd[2] };
        const p2 = { x: cmd[3], y: cmd[4] };
        const p3 = { x: cmd[5], y: cmd[6] };
        for (let i = 1; i <= segments; i++) push(cubicBezier(p0, p1, p2, p3, i / segments));
        lastControl = p2;
        break;
      }
      case 'S': {
        const p0 = current!;
        const p1 = reflectControl(lastControl, p0);
        const p2 = { x: cmd[1], y: cmd[2] };
        const p3 = { x: cmd[3], y: cmd[4] };
        for (let i = 1; i <= segments; i++) push(cubicBezier(p0, p1, p2, p3, i / segments));
        lastControl = p2;
        break;
      }
      case 'Q': {
        const p0 = current!;
        const p1 = { x: cmd[1], y: cmd[2] };
        const p2 = { x: cmd[3], y: cmd[4] };
        for (let i = 1; i <= segments; i++) push(quadraticBezier(p0, p1, p2, i / segments));
        lastControl = p1;
        break;
      }
      case 'T': {
        const p0 = current!;
        const p1 = reflectControl(lastControl, p0);
        const p2 = { x: cmd[1], y: cmd[2] };
        for (let i = 1; i <= segments; i++) push(quadraticBezier(p0, p1, p2, i / segments));
        lastControl = p1;
        break;
      }
      case 'Z': {
        // 子路径闭合：SVG fill 隐式闭合首尾，多边形本身按闭合参与命中
        finish();
        break;
      }
      default:
        break;
    }
  }
  if (poly.length > 0) finish();
  return polygons;
}

/** 把 SVG path d 采样成多边形数组（曲线段按 segmentsPerCurve 细分），带缓存。 */
export function pathToPolygons(d: string, segmentsPerCurve = CURVE_SEGMENTS): Pt[][] {
  const key = `${segmentsPerCurve}:${d}`;
  const cached = polygonCache.get(key);
  if (cached) return cached;
  const polygons = parseToPolygons(d, segmentsPerCurve);
  polygonCache.set(key, polygons);
  if (polygonCache.size > 500) polygonCache.clear();
  return polygons;
}

/** 射线法（even-odd）：点是否在多边形内部。 */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersects =
      yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** 点到线段最短距离（投影点在端点外时取端点距离）。 */
export function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 点到多边形边缘最短距离（闭合处理：末边回连首点）。 */
export function distanceToPolygon(p: Pt, poly: Pt[]): number {
  let min = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const d = distanceToSegment(p, poly[i], poly[(i + 1) % n]);
    if (d < min) min = d;
  }
  return min;
}

/** path 本地坐标命中：内部（射线法）或边缘距离 ≤ 容差。 */
export function hitTestPath(d: string, p: Pt, tolerance = HIT_TOLERANCE): boolean {
  const polygons = pathToPolygons(d);
  for (const poly of polygons) {
    if (pointInPolygon(p, poly)) return true;
    if (distanceToPolygon(p, poly) <= tolerance) return true;
  }
  return false;
}

/**
 * 场景坐标 → path 本地坐标（transform 逆变换）。
 * 正变换：scene = R(rotation)·(scale·local) + (x, y)；屏幕坐标 y 向下，rotation 顺时针。
 */
export function sceneToLocal(p: Pt, transform: ProjectTransform): Pt {
  const dx = p.x - transform.x;
  const dy = p.y - transform.y;
  const rad = (transform.rotation * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const rx = c * dx + s * dy;
  const ry = -s * dx + c * dy;
  return { x: rx / transform.scaleX, y: ry / transform.scaleY };
}

/** 纸片命中（场景坐标）：逆变换回本地坐标后按实际轮廓判定，容差随缩放折算。 */
export function hitTestElement(element: PaperElement, p: Pt, tolerance = HIT_TOLERANCE): boolean {
  const t = element.transform;
  if (t.scaleX === 0 || t.scaleY === 0) return false;
  const local = sceneToLocal(p, t);
  const localTolerance = tolerance / Math.max(Math.abs(t.scaleX), Math.abs(t.scaleY));
  return hitTestPath(element.path, local, localTolerance);
}
