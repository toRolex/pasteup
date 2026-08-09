/**
 * LayerPanel（T11）——左栏图层面板：每张纸片一个条目，z 序操作 + 选中联动。
 *
 * 数据契约：
 * - elements：来自 store 的 PaperElement[]（数组序 = z 序，末尾 = 最上层）。
 * - 列表展示顺序：上到下 = z 高到低（数组末尾在顶部），符合 Figma/PS 等设计工具惯例。
 * - 选中联动：selectedId 由 App 持有（fabric onSelectionChange → setSelectedId），本组件
 *   只渲染高亮 + 接收 onSelect 回写。
 * - z 序操作：onReorder(id, op) → App 调用 store.reorderElements → commitProject。
 *   本组件不直接调 store，保持桥接壳式单向数据流。
 *
 * 拟物样式：沿用 T2 拟物基建（左栏便利贴 / 撕边票根 / 手写感字体），详见 journal.css。
 */
import type { PaperElement } from '../../types/project';

export type ReorderOp = 'up' | 'down' | 'top' | 'bottom';

export interface LayerPanelProps {
  elements: PaperElement[];
  /** 当前选中纸片 id（App 持有，fabric → React 单向） */
  selectedId: string | null;
  /** 点击条目回调（App 调 apiRef.setActiveObject） */
  onSelect: (id: string) => void;
  /** 重排操作回调（App 调 store.reorderElements） */
  onReorder: (id: string, op: ReorderOp) => void;
}

export function LayerPanel({ elements, selectedId, onSelect, onReorder }: LayerPanelProps) {
  if (elements.length === 0) {
    return (
      <div className="layer-panel" data-testid="layer-panel">
        <span className="torn-paper layer-tab" data-testid="layer-tab" aria-hidden="true">
          目录
        </span>
        <h2 className="page-heading">图层</h2>
        <p className="layer-empty" data-testid="layer-panel-empty">
          还没有图层，描一张试试
        </p>
      </div>
    );
  }

  // 列表从上到下 = z 高到低：反转数组使末尾（最上层）显示在顶部
  const display = elements.map((el, idx) => ({ el, originalIndex: idx })).reverse();

  return (
    <div className="layer-panel" data-testid="layer-panel">
      <span className="torn-paper layer-tab" data-testid="layer-tab" aria-hidden="true">
        目录
      </span>
      <h2 className="page-heading">图层</h2>
      <ul className="layer-list">
        {display.map(({ el, originalIndex }) => {
          const isActive = el.id === selectedId;
          const labelIndex = originalIndex + 1; // 1-based「纸片 N」编号
          return (
            <li
              key={el.id}
              className={`layer-item${isActive ? ' layer-item--active' : ''}`}
              data-testid={`layer-item-${el.id}`}
              onClick={() => onSelect(el.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(el.id);
                }
              }}
            >
              <span
                className="layer-swatch"
                data-testid={`layer-swatch-${el.id}`}
                style={{ backgroundColor: el.color }}
                aria-hidden="true"
              />
              <span className="layer-name">纸片 {labelIndex}</span>
              <span className="layer-ops" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="layer-op-btn"
                  data-testid={`layer-up-${el.id}`}
                  aria-label="上移一层"
                  title="上移一层"
                  onClick={() => onReorder(el.id, 'up')}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="layer-op-btn"
                  data-testid={`layer-down-${el.id}`}
                  aria-label="下移一层"
                  title="下移一层"
                  onClick={() => onReorder(el.id, 'down')}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="layer-op-btn"
                  data-testid={`layer-top-${el.id}`}
                  aria-label="置顶"
                  title="置顶"
                  onClick={() => onReorder(el.id, 'top')}
                >
                  ⤒
                </button>
                <button
                  type="button"
                  className="layer-op-btn"
                  data-testid={`layer-bottom-${el.id}`}
                  aria-label="置底"
                  title="置底"
                  onClick={() => onReorder(el.id, 'bottom')}
                >
                  ⤓
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}