/**
 * 自由描绘 + 自动闭合（纯逻辑层，可 headless 断言）。
 *
 * 输入：描摹轨迹点数组（fabric pointer 事件采集的 scenePoint）。
 * 输出：平滑开放的 SVG path d（实时笔迹）/ 平滑闭合的 SVG path d（纸片）。
 * 生成路径坐标即画布绝对坐标，因此纸片 transform 保持单位阵（x/y=0, scale=1）。
 */
import { createPaperElement, DEFAULT_PAPER_COLOR, type PaperElement } from '../types/project';

export interface TracePoint {
  x: number;
  y: number;
}

/** 一笔至少需要的描点数（少于 3 个视为误触，不构成纸片）。 */
export const MIN_TRACE_POINTS = 3;

function mid(a: TracePoint, b: TracePoint): TracePoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** 数值格式化为 1 位小数，保持 d 字符串紧凑。 */
function fmt(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 描点 → 平滑开放路径（描摹中实时更新的临时笔迹）。
 * 用「二次贝塞尔中点平滑」：相邻点取中点作曲线端点，原顶点作控制点。
 */
export function pointsToOpenPath(points: TracePoint[]): string {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 1; i < n - 1; i++) {
    const m = mid(points[i], points[i + 1]);
    d += ` Q ${fmt(points[i].x)} ${fmt(points[i].y)} ${fmt(m.x)} ${fmt(m.y)}`;
  }
  d += ` L ${fmt(points[n - 1].x)} ${fmt(points[n - 1].y)}`;
  return d;
}

/**
 * 描点 → 平滑闭合路径（松开自动闭合为纸片）。
 * Catmull-Rom 样条（张力 1/6）转三次贝塞尔：曲线经过全部原始描点，首尾相接。
 */
export function pointsToClosedPath(points: TracePoint[]): string {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M ${fmt(points[0].x)} ${fmt(points[0].y)} Z`;
  if (n === 2) {
    return `M ${fmt(points[0].x)} ${fmt(points[0].y)} L ${fmt(points[1].x)} ${fmt(points[1].y)} Z`;
  }
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const cur = points[i];
    const next = points[(i + 1) % n];
    const afterNext = points[(i + 2) % n];
    const c1 = { x: cur.x + (next.x - prev.x) / 6, y: cur.y + (next.y - prev.y) / 6 };
    const c2 = { x: next.x - (afterNext.x - cur.x) / 6, y: next.y - (afterNext.y - cur.y) / 6 };
    d += ` C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(next.x)} ${fmt(next.y)}`;
  }
  d += ' Z';
  return d;
}

/**
 * 描摹收尾：描点足够则生成闭合纸片元素，不足视为误触返回 null。
 * 纸片 transform 保持单位阵——路径坐标已是画布绝对坐标。
 */
export function tracePointsToPaper(points: TracePoint[], color: string = DEFAULT_PAPER_COLOR): PaperElement | null {
  if (points.length < MIN_TRACE_POINTS) return null;
  return createPaperElement({ path: pointsToClosedPath(points), color });
}
