import { describe, expect, it } from 'vitest';
import { createHistory } from './history';

describe('history（seam）— 撤销/重做深 module，双栈私有、coalesce 确定性', () => {
  it('record 后 undo 出栈恢复、redo 对称恢复（编辑前快照）', () => {
    const h = createHistory<number>({ snapshot: (n) => n });
    h.record(0);
    h.record(1);
    expect(h.undo(2)).toBe(1);
    expect(h.undo(1)).toBe(0);
    expect(h.redo(0)).toBe(1);
    expect(h.redo(1)).toBe(2);
  });

  it('同 gestureId（coalesceKey 相同）连续编辑合并为一条，一次 undo 回到手势前', () => {
    const h = createHistory<number>({ snapshot: (n) => n });
    h.record(0, { coalesceKey: 'opacity:el:g1' });
    h.record(1, { coalesceKey: 'opacity:el:g1' });
    h.record(2, { coalesceKey: 'opacity:el:g1' });
    expect(h.undo(3)).toBe(0);
    expect(h.redo(0)).toBe(3);
  });

  it('不同 gestureId（两次拖拽）断开为两条独立记录', () => {
    const h = createHistory<number>({ snapshot: (n) => n });
    h.record(0, { coalesceKey: 'opacity:el:g1' });
    h.record(1, { coalesceKey: 'opacity:el:g2' });
    expect(h.undo(2)).toBe(1);
    expect(h.undo(1)).toBe(0);
  });

  it('键盘方向键连续改值（同 coalesceKey）可合并为一条', () => {
    const h = createHistory<number>({ snapshot: (n) => n });
    h.record(10, { coalesceKey: 'opacity:el:g1' });
    h.record(11, { coalesceKey: 'opacity:el:g1' });
    h.record(12, { coalesceKey: 'opacity:el:g1' });
    expect(h.undo(13)).toBe(10);
  });

  it('无 hint（离散编辑）永不合并，栈顶变更清空 redo', () => {
    const h = createHistory<number>({ snapshot: (n) => n });
    h.record(0);
    expect(h.undo(1)).toBe(0);
    h.record(0); // 新编辑 → 栈顶变更 → 清空 redo
    expect(h.redo(0)).toBeNull();
  });

  it('undo 后继续拖同一滑杆不并链（lastKey 复位）', () => {
    const h = createHistory<number>({ snapshot: (n) => n });
    h.record(10, { coalesceKey: 'opacity:el:g1' });
    h.record(11, { coalesceKey: 'opacity:el:g1' });
    expect(h.undo(12)).toBe(10);
    // 继续拖同一滑杆：同 key 新提交，因 undo 已复位 lastKey → 独立记录（undo 非 null）
    h.record(10, { coalesceKey: 'opacity:el:g1' });
    expect(h.undo(11)).toBe(10);
    expect(h.undo(10)).toBeNull(); // 只新增一条
  });

  it('容量超限（上限 100）：驱逐最旧，可连续 undo 100 次后第 101 次 null', () => {
    const h = createHistory<number>({ snapshot: (n) => n });
    for (let i = 0; i < 105; i++) h.record(i);
    for (let i = 104; i >= 5; i--) {
      expect(h.undo(i + 1)).toBe(i);
    }
    expect(h.undo(5)).toBeNull();
  });

  it('redo 栈容量同样上限 100（对称实现）', () => {
    const h = createHistory<number>({ snapshot: (n) => n });
    for (let i = 0; i < 100; i++) h.record(i);
    for (let i = 99; i >= 0; i--) expect(h.undo(i + 1)).toBe(i);
    // redo 100 条全可重做，第 101 次 null
    for (let i = 0; i < 100; i++) expect(h.redo(i)).toBe(i + 1);
    expect(h.redo(100)).toBeNull();
  });

  it('clear 清空双栈并复位 lastKey', () => {
    const h = createHistory<number>({ snapshot: (n) => n });
    h.record(0, { coalesceKey: 'opacity:el:g1' });
    h.record(1, { coalesceKey: 'opacity:el:g1' });
    h.clear();
    expect(h.undo(2)).toBeNull();
    expect(h.redo(2)).toBeNull();
    // lastKey 复位：clear 后同 key 新提交生成独立记录
    h.record(0, { coalesceKey: 'opacity:el:g1' });
    expect(h.undo(1)).toBe(0);
  });

  it('snapshot 策略注入：record/undo 均押入隔离快照（外部变更不影响栈内）', () => {
    const h = createHistory<{ v: number }>({ snapshot: (p) => ({ ...p }) });
    const prev = { v: 1 };
    h.record(prev, { coalesceKey: 'x' });
    prev.v = 999; // 修改 record 传参原对象
    const cur = { v: 2 };
    expect(h.undo(cur)).toEqual({ v: 1 }); // 栈内快照不受影响
    cur.v = 999; // 修改 undo 传参原对象
    expect(h.redo({ v: 1 })).toEqual({ v: 2 }); // redo 栈内快照不受影响
  });

  it('空栈 undo/redo no-op 返回 null', () => {
    const h = createHistory<number>({ snapshot: (n) => n });
    expect(h.undo(0)).toBeNull();
    expect(h.redo(0)).toBeNull();
  });
});
