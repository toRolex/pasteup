/**
 * 纸片 schema → fabric 对象工厂。
 *
 * 只做「自定义 schema → fabric 对象」的单向映射；反向（fabric → schema）
 * 由桥接壳在事件回灌时显式读取对象属性完成，不依赖 fabric `toObject()` 默认行为。
 */
import { Path, Shadow } from 'fabric';
import type { PaperElement } from '../types/project';

/** 纸片基础层叠投影（对应 DESIGN.md --shadow-lift：柔和、轻微下沉表达层叠浮起）。 */
export const PAPER_SHADOW = {
  color: 'rgba(90, 70, 52, 0.26)',
  blur: 6,
  offsetX: 0,
  offsetY: 3,
} as const;

/** 纸片厚度描边：取纸片色按因子加深，模拟纸片边缘厚度。 */
const STROKE_DARKEN_FACTOR = 0.82;
const PAPER_STROKE_WIDTH = 1.5;

/** fabric.Path 构造选项（含自定义 paperId 用于事件回灌定位元素）。 */
export interface PaperFabricOptions {
  path: string;
  left: number;
  top: number;
  fill: string;
  opacity: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  originX: 'left';
  originY: 'top';
  selectable: boolean;
  paperId: string;
}

/** 把 paper schema 映射为 fabric.Path 选项。 */
export function paperToFabricOptions(element: PaperElement): PaperFabricOptions {
  const t = element.transform;
  return {
    path: element.path,
    left: t.x,
    top: t.y,
    fill: element.color,
    opacity: element.opacity,
    scaleX: t.scaleX,
    scaleY: t.scaleY,
    angle: t.rotation,
    originX: 'left',
    originY: 'top',
    selectable: true,
    paperId: element.id,
  };
}

/** 把十六进制颜色按因子加深，返回 rgb()。 */
function darkenColor(hex: string, factor: number): string {
  const m = hex.replace('#', '');
  if (m.length !== 6) return hex;
  const n = parseInt(m, 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

/** 依据纸片 schema 创建带基础样式（层叠投影 + 厚度质感）的 fabric.Path 对象。 */
export function createFabricPath(element: PaperElement): Path {
  const { path, ...options } = paperToFabricOptions(element);
  const fabricPath = new Path(path, options);
  fabricPath.shadow = new Shadow(PAPER_SHADOW);
  fabricPath.stroke = darkenColor(element.color, STROKE_DARKEN_FACTOR);
  fabricPath.strokeWidth = PAPER_STROKE_WIDTH;
  fabricPath.strokeUniform = true;
  fabricPath.strokeLineJoin = 'round';
  return fabricPath;
}
