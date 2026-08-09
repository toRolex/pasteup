import { describe, expect, it } from 'vitest';
import { moveDown, moveToBottom, moveToTop, moveUp } from './layerOps';
import { createPaperElement, type PaperElement } from '../types/project';

/** 用不同 id 与稳定 seed 构造一组纸片（顺序 = z 序：0 在底、n-1 在顶）。 */
function makePapers(n: number): PaperElement[] {
  return Array.from({ length: n }, (_, i) =>
    createPaperElement({
      id: `paper-${i}`,
      path: `M 0 0 L ${i + 1} 0 L ${i + 1} ${i + 1} Z`,
      color: '#7A8B5C',
      seed: i,
    }),
  );
}

describe('layerOps — 图层 z 序重排纯函数', () => {
  describe('moveUp（z 序向高：数组向末尾方向移动一层）', () => {
    it('中间元素上移一层：与后一项交换', () => {
      const elements = makePapers(4);
      const next = moveUp(elements, 'paper-1');
      // 数组末尾 = 画布顶层 = z 高；paper-1 从 index 1 升到 index 2
      expect(next.map((e) => e.id)).toEqual(['paper-0', 'paper-2', 'paper-1', 'paper-3']);
    });

    it('最上层（末尾）上移 → 原样返回（边界 no-op）', () => {
      const elements = makePapers(3);
      const next = moveUp(elements, 'paper-2');
      expect(next).toBe(elements);
    });

    it('单元素数组上移 → 原样返回', () => {
      const elements = makePapers(1);
      const next = moveUp(elements, 'paper-0');
      expect(next).toBe(elements);
    });

    it('返回新数组，不原地修改', () => {
      const elements = makePapers(3);
      const next = moveUp(elements, 'paper-1');
      expect(next).not.toBe(elements);
      expect(elements.map((e) => e.id)).toEqual(['paper-0', 'paper-1', 'paper-2']);
    });

    it('元素身份保持：返回数组内元素对象引用不变', () => {
      const elements = makePapers(3);
      const next = moveUp(elements, 'paper-1');
      expect(next[2]).toBe(elements[1]); // 移上来的 paper-1（到末尾）
      expect(next[1]).toBe(elements[2]); // 移下去的 paper-2
    });

    it('目标 id 不存在 → 抛错', () => {
      const elements = makePapers(3);
      expect(() => moveUp(elements, 'missing')).toThrow(/layerOps/);
    });
  });

  describe('moveDown（z 序向低：数组向首项方向移动一层）', () => {
    it('中间元素下移一层：与前一项交换', () => {
      const elements = makePapers(4);
      const next = moveDown(elements, 'paper-2');
      // paper-2 从 index 2 降到 index 1
      expect(next.map((e) => e.id)).toEqual(['paper-0', 'paper-2', 'paper-1', 'paper-3']);
    });

    it('最下层（首项）下移 → 原样返回（边界 no-op）', () => {
      const elements = makePapers(3);
      const next = moveDown(elements, 'paper-0');
      expect(next).toBe(elements);
    });

    it('单元素数组下移 → 原样返回', () => {
      const elements = makePapers(1);
      const next = moveDown(elements, 'paper-0');
      expect(next).toBe(elements);
    });

    it('返回新数组，不原地修改', () => {
      const elements = makePapers(3);
      const next = moveDown(elements, 'paper-2');
      expect(next).not.toBe(elements);
      expect(elements.map((e) => e.id)).toEqual(['paper-0', 'paper-1', 'paper-2']);
    });

    it('元素身份保持', () => {
      const elements = makePapers(3);
      const next = moveDown(elements, 'paper-2');
      expect(next[0]).toBe(elements[0]);
      expect(next[1]).toBe(elements[2]); // 移上来的 paper-2
      expect(next[2]).toBe(elements[1]); // 移下去的 paper-1
    });
  });

  describe('moveToTop', () => {
    it('中间元素置顶：移到数组末尾', () => {
      const elements = makePapers(4);
      const next = moveToTop(elements, 'paper-1');
      expect(next.map((e) => e.id)).toEqual(['paper-0', 'paper-2', 'paper-3', 'paper-1']);
    });

    it('最顶层置顶 → 原样返回', () => {
      const elements = makePapers(3);
      const next = moveToTop(elements, 'paper-2');
      expect(next).toBe(elements);
    });

    it('返回新数组，不原地修改', () => {
      const elements = makePapers(3);
      const next = moveToTop(elements, 'paper-0');
      expect(next).not.toBe(elements);
      expect(next.map((e) => e.id)).toEqual(['paper-1', 'paper-2', 'paper-0']);
    });

    it('元素身份保持：被移元素引用不变', () => {
      const elements = makePapers(3);
      const target = elements[0]!;
      const next = moveToTop(elements, 'paper-0');
      expect(next[2]).toBe(target);
    });
  });

  describe('moveToBottom', () => {
    it('中间元素置底：移到数组首项', () => {
      const elements = makePapers(4);
      const next = moveToBottom(elements, 'paper-2');
      expect(next.map((e) => e.id)).toEqual(['paper-2', 'paper-0', 'paper-1', 'paper-3']);
    });

    it('最底层置底 → 原样返回', () => {
      const elements = makePapers(3);
      const next = moveToBottom(elements, 'paper-0');
      expect(next).toBe(elements);
    });

    it('返回新数组，不原地修改', () => {
      const elements = makePapers(3);
      const next = moveToBottom(elements, 'paper-2');
      expect(next).not.toBe(elements);
      expect(next.map((e) => e.id)).toEqual(['paper-2', 'paper-0', 'paper-1']);
    });

    it('元素身份保持：被移元素引用不变', () => {
      const elements = makePapers(3);
      const target = elements[2]!;
      const next = moveToBottom(elements, 'paper-2');
      expect(next[0]).toBe(target);
    });
  });
});