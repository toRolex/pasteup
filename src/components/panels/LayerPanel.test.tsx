import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LayerPanel } from './LayerPanel';
import { createPaperElement, type PaperElement } from '../../types/project';

/** 构造一组纸片（顺序 = z 序：0 在底、n-1 在顶）。 */
function makePapers(n: number): PaperElement[] {
  return Array.from({ length: n }, (_, i) =>
    createPaperElement({
      id: `paper-${i}`,
      path: `M 0 0 L ${i + 1} 0 L ${i + 1} ${i + 1} Z`,
      color: i % 2 === 0 ? '#c0392b' : '#7A8B5C',
      seed: i,
    }),
  );
}

describe('LayerPanel（T11）— 图层列表', () => {
  describe('列表渲染', () => {
    it('空 elements：显示空态文案', () => {
      render(
        <LayerPanel
          elements={[]}
          selectedId={null}
          onSelect={() => {}}
          onReorder={() => {}}
        />,
      );
      expect(screen.getByTestId('layer-panel-empty')).toBeInTheDocument();
    });

    it('每项显示名称 "纸片 N"（N = 在 elements 数组中的索引 1-based）', () => {
      const elements = makePapers(3);
      render(
        <LayerPanel
          elements={elements}
          selectedId={null}
          onSelect={() => {}}
          onReorder={() => {}}
        />,
      );
      const items = screen.getAllByTestId(/^layer-item-/);
      expect(items).toHaveLength(3);
      // 列表从上到下 = z 高到低（数组末尾在顶部）：paper-2 在第一行
      expect(within(items[0]!).getByText('纸片 3')).toBeInTheDocument();
      expect(within(items[2]!).getByText('纸片 1')).toBeInTheDocument();
    });

    it('每项渲染色块（layer-swatch-* 各一）', () => {
      const elements = makePapers(2);
      render(
        <LayerPanel
          elements={elements}
          selectedId={null}
          onSelect={() => {}}
          onReorder={() => {}}
        />,
      );
      const swatches = screen.getAllByTestId(/^layer-swatch-/);
      expect(swatches).toHaveLength(2);
    });
  });

  describe('选中联动', () => {
    it('selectedId 匹配的元素项加高亮 className', () => {
      const elements = makePapers(3);
      render(
        <LayerPanel
          elements={elements}
          selectedId="paper-1"
          onSelect={() => {}}
          onReorder={() => {}}
        />,
      );
      const items = screen.getAllByTestId(/^layer-item-/);
      const highlighted = items.filter((item) =>
        item.className.includes('layer-item--active'),
      );
      expect(highlighted).toHaveLength(1);
      expect(highlighted[0]).toBe(screen.getByTestId('layer-item-paper-1'));
    });

    it('selectedId 不在 elements 中时无任何高亮', () => {
      const elements = makePapers(2);
      render(
        <LayerPanel
          elements={elements}
          selectedId="missing"
          onSelect={() => {}}
          onReorder={() => {}}
        />,
      );
      const items = screen.getAllByTestId(/^layer-item-/);
      const highlighted = items.filter((item) =>
        item.className.includes('layer-item--active'),
      );
      expect(highlighted).toHaveLength(0);
    });
  });

  describe('点选条目', () => {
    it('点击条目调用 onSelect(paperId)', () => {
      const onSelect = vi.fn();
      const elements = makePapers(3);
      render(
        <LayerPanel
          elements={elements}
          selectedId={null}
          onSelect={onSelect}
          onReorder={() => {}}
        />,
      );
      fireEvent.click(screen.getByTestId('layer-item-paper-1'));
      expect(onSelect).toHaveBeenCalledWith('paper-1');
    });
  });

  describe('重排操作', () => {
    it('点击"上移"按钮调用 onReorder(id, "up")', () => {
      const onReorder = vi.fn();
      const elements = makePapers(3);
      render(
        <LayerPanel
          elements={elements}
          selectedId={null}
          onSelect={() => {}}
          onReorder={onReorder}
        />,
      );
      fireEvent.click(screen.getByTestId('layer-up-paper-1'));
      expect(onReorder).toHaveBeenCalledWith('paper-1', 'up');
    });

    it('点击"下移"按钮调用 onReorder(id, "down")', () => {
      const onReorder = vi.fn();
      const elements = makePapers(3);
      render(
        <LayerPanel
          elements={elements}
          selectedId={null}
          onSelect={() => {}}
          onReorder={onReorder}
        />,
      );
      fireEvent.click(screen.getByTestId('layer-down-paper-1'));
      expect(onReorder).toHaveBeenCalledWith('paper-1', 'down');
    });

    it('点击"置顶"按钮调用 onReorder(id, "top")', () => {
      const onReorder = vi.fn();
      const elements = makePapers(3);
      render(
        <LayerPanel
          elements={elements}
          selectedId={null}
          onSelect={() => {}}
          onReorder={onReorder}
        />,
      );
      fireEvent.click(screen.getByTestId('layer-top-paper-1'));
      expect(onReorder).toHaveBeenCalledWith('paper-1', 'top');
    });

    it('点击"置底"按钮调用 onReorder(id, "bottom")', () => {
      const onReorder = vi.fn();
      const elements = makePapers(3);
      render(
        <LayerPanel
          elements={elements}
          selectedId={null}
          onSelect={() => {}}
          onReorder={onReorder}
        />,
      );
      fireEvent.click(screen.getByTestId('layer-bottom-paper-1'));
      expect(onReorder).toHaveBeenCalledWith('paper-1', 'bottom');
    });
  });
});

describe('LayerPanel 左栏撕边拟物（T16 seam 8）— 目录页撕边标签', () => {
  it('渲染 torn-paper 撕边标签（.torn-paper + layer-tab）', () => {
    const elements = makePapers(2);
    render(
      <LayerPanel elements={elements} selectedId={null} onSelect={() => {}} onReorder={() => {}} />,
    );
    const tab = screen.getByTestId('layer-tab');
    expect(tab.className).toContain('torn-paper');
    expect(tab.textContent).toContain('目录');
  });

  it('空态同样保留撕边标签', () => {
    render(
      <LayerPanel elements={[]} selectedId={null} onSelect={() => {}} onReorder={() => {}} />,
    );
    expect(screen.getByTestId('layer-tab').className).toContain('torn-paper');
  });
});