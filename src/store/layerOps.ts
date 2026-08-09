/**
 * 图层 z 序重排纯函数（T11 图层面板）。
 *
 * 数据契约：elements 数组序即 z 序（数组末尾 = 最上层 = 画布顶层）。
 * 本模块只做「数组序」的纯变换，不读 fabric / 不写 store；store 端
 * commitProject 调用前先经本模块计算新数组。
 *
 * 设计原则：
 * - 全部返回新数组（不原地修改），便于 React 引用相等判等与撤销栈快照。
 * - 边界 no-op：目标位置已达 → 返回原数组引用，避免无意义 commitProject 入栈。
 * - 元素身份保持：返回数组内元素对象引用不变，仅位置变化。
 */
import type { PaperElement } from '../types/project';

/** 找元素索引，未找到抛错（保持类型安全，调用方需自行判存在）。 */
function indexOf(elements: PaperElement[], id: string): number {
  const idx = elements.findIndex((el) => el.id === id);
  if (idx < 0) throw new Error(`layerOps: 元素不存在 id=${id}`);
  return idx;
}

/** 上移一层：与后一项交换；已在最上层（末尾）→ 原样返回。 */
export function moveUp(elements: PaperElement[], id: string): PaperElement[] {
  const idx = indexOf(elements, id);
  if (idx >= elements.length - 1) return elements;
  const next = elements.slice();
  [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
  return next;
}

/** 下移一层：与前一项交换；已在最下层（首项）→ 原样返回。 */
export function moveDown(elements: PaperElement[], id: string): PaperElement[] {
  const idx = indexOf(elements, id);
  if (idx <= 0) return elements;
  const next = elements.slice();
  [next[idx], next[idx - 1]] = [next[idx - 1]!, next[idx]!];
  return next;
}

/** 置顶：移到数组末尾；已在末尾 → 原样返回。 */
export function moveToTop(elements: PaperElement[], id: string): PaperElement[] {
  const idx = indexOf(elements, id);
  if (idx >= elements.length - 1) return elements;
  const el = elements[idx]!;
  const next = [...elements.slice(0, idx), ...elements.slice(idx + 1), el];
  return next;
}

/** 置底：移到数组首项；已在首项 → 原样返回。 */
export function moveToBottom(elements: PaperElement[], id: string): PaperElement[] {
  const idx = indexOf(elements, id);
  if (idx <= 0) return elements;
  const el = elements[idx]!;
  const next = [el, ...elements.slice(0, idx), ...elements.slice(idx + 1)];
  return next;
}