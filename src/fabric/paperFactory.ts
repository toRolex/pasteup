/**
 * 纸片 schema → fabric 对象工厂。
 *
 * 只做「自定义 schema → fabric 对象」的单向映射；反向（fabric → schema）
 * 由桥接壳在事件回灌时显式读取对象属性完成，不依赖 fabric `toObject()` 默认行为。
 */
import { Path } from 'fabric';
import type { PaperElement } from '../types/project';

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

/** 依据纸片 schema 创建带基础样式的 fabric.Path 对象。 */
export function createFabricPath(element: PaperElement): Path {
  const { path, ...options } = paperToFabricOptions(element);
  return new Path(path, options);
}
