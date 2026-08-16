/**
 * 撤销/重做历史深 module（#50）：双栈私有持有、移出 Zustand state。
 *
 * 非反应式：栈不是伪响应式状态（无 canUndo/canRedo 订阅），私有化安全。
 * 泛型可测：snapshot 策略注入（快照隔离在实现内保证），project 域注入 snapshotProject。
 * Coalesce：key 形态 `'<property>:<elementId>:<gestureId>'` 由调用方显式传；
 * record 时同 key → 保留手势前栈顶不新增（一次 undo 回到整段手势之前）。
 * undo/redo/clear 复位内部 lastKey——否则 undo 后继续拖同一滑杆会把新提交错误并链。
 * 容量：undo/redo 各上限 100 条，超限驱逐最旧（栈底丢弃）。
 */
export interface EditHint {
  /** 手势合并 key；同手势连续提交共享同一 key → 合并为一条记录。 */
  coalesceKey: string;
}

/** 撤销/重做历史 interface（窄 seam）：调用方只依赖行为，不接触栈内部。 */
export interface History<T> {
  /** push 编辑前快照（内部 snapshot(prev)）。同 coalesceKey 连续调用只保留手势前一条。 */
  record(prev: T, hint?: EditHint): void;
  /** 撤销：出栈恢复；cur 经 snapshot 押入 redo；复位 lastKey。空栈返回 null。 */
  undo(cur: T): T | null;
  /** 重做：对称；复位 lastKey。空栈返回 null。 */
  redo(cur: T): T | null;
  /** 清空双栈 + 复位 lastKey（openProject / createProject / 测试重置）。 */
  clear(): void;
}

/** 栈容量：undo/redo 各上限 100 条，超限 drop oldest（栈底丢弃）。 */
const HISTORY_LIMIT = 100;

/** 创建历史实例。snapshot 策略注入；实例随 store 单例共生，不做模块级单例（防跨测试污染）。 */
export function createHistory<T>(options: { snapshot: (prev: T) => T }): History<T> {
  const { snapshot } = options;
  let undoStack: T[] = [];
  let redoStack: T[] = [];
  let lastKey: string | null = null;

  const pushCapped = (stack: T[], item: T): T[] => {
    const next = [...stack, item];
    return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
  };

  return {
    record(prev, hint) {
      const key = hint?.coalesceKey ?? null;
      if (key !== null && key === lastKey) return; // 同手势：保留手势前栈顶，不新增快照
      undoStack = pushCapped(undoStack, snapshot(prev));
      redoStack = []; // 栈顶变更清空重做栈
      lastKey = key;
    },
    undo(cur) {
      if (undoStack.length === 0) return null;
      const prev = undoStack[undoStack.length - 1]!;
      undoStack = undoStack.slice(0, -1);
      redoStack = pushCapped(redoStack, snapshot(cur));
      lastKey = null;
      return prev;
    },
    redo(cur) {
      if (redoStack.length === 0) return null;
      const next = redoStack[redoStack.length - 1]!;
      redoStack = redoStack.slice(0, -1);
      undoStack = pushCapped(undoStack, snapshot(cur));
      lastKey = null;
      return next;
    },
    clear() {
      undoStack = [];
      redoStack = [];
      lastKey = null;
    },
  };
}
