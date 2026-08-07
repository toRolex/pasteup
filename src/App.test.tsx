import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { tokens } from './styles/tokens';
import {
  createDefaultProject,
  useProjectStore,
} from './store/projectStore';

const normalize = (s: string) => s.replace(/\s+/g, '');

describe('App 集成（seam S3）— 三栏骨架 + store 驱动的画布', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: createDefaultProject(), undoStack: [], redoStack: [] });
  });

  it('渲染三栏骨架，grid 尺寸 56 / 260 / 34 / 280', () => {
    render(<App />);
    const journal = screen.getByTestId('journal');
    expect(journal.style.gridTemplateRows).toBe(`${tokens.layout.topbar}px 1fr`);
    expect(normalize(journal.style.gridTemplateColumns)).toBe(
      normalize(
        `${tokens.layout.left}px ${tokens.layout.spine}px minmax(0, 1fr) ${tokens.layout.right}px`,
      ),
    );
    expect(screen.getByTestId('journal-topbar')).toBeInTheDocument();
    expect(screen.getByTestId('journal-left')).toBeInTheDocument();
    expect(screen.getByTestId('journal-spine')).toBeInTheDocument();
    expect(screen.getByTestId('journal-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('journal-right')).toBeInTheDocument();
  });

  it('右栏渲染属性面板，未选中时显示占位', () => {
    render(<App />);
    expect(screen.getByTestId('property-panel')).toBeInTheDocument();
    expect(screen.getByTestId('property-empty')).toHaveTextContent('未选中纸片');
  });

  it('画布元素尺寸来自 store 默认项目（2480×3508）', () => {
    render(<App />);
    const canvasEl = screen.getByTestId('fabric-canvas').querySelector('canvas');
    expect(canvasEl).not.toBeNull();
    expect(canvasEl!.width).toBe(2480);
    expect(canvasEl!.height).toBe(3508);
  });

  it('新建项目对话框：选横版 + 96 创建后画布尺寸变为 1123×794', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('new-project'));
    expect(screen.getByTestId('new-project-dialog')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('orientation'), { target: { value: 'landscape' } });
    fireEvent.change(screen.getByTestId('resolution'), { target: { value: '96' } });
    fireEvent.click(screen.getByTestId('create-project'));

    expect(screen.queryByTestId('new-project-dialog')).toBeNull();
    const canvasEl = screen.getByTestId('fabric-canvas').querySelector('canvas');
    expect(canvasEl!.width).toBe(1123);
    expect(canvasEl!.height).toBe(794);
  });

  it('缩放导航控件存在（zoom-in / zoom-out / zoom-reset）', () => {
    render(<App />);
    expect(screen.getByTestId('zoom-in')).toBeInTheDocument();
    expect(screen.getByTestId('zoom-out')).toBeInTheDocument();
    expect(screen.getByTestId('zoom-reset')).toBeInTheDocument();
  });

  it('顶栏工具切换：选择/描绘互斥，激活态通过 aria-pressed 表达', () => {
    render(<App />);
    const selectBtn = screen.getByTestId('tool-select');
    const traceBtn = screen.getByTestId('tool-trace');
    expect(selectBtn).toHaveAttribute('aria-pressed', 'true'); // 默认选择工具
    expect(traceBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(traceBtn);
    expect(traceBtn).toHaveAttribute('aria-pressed', 'true');
    expect(traceBtn).toHaveClass('tool-btn--active');
    expect(selectBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(selectBtn);
    expect(selectBtn).toHaveAttribute('aria-pressed', 'true');
    expect(traceBtn).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('App 撤销/重做（T9 seam U7）— 顶栏按钮 + 快捷键', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createDefaultProject(),
      undoStack: [],
      redoStack: [],
    });
  });

  it('顶栏提供撤销/重做按钮', () => {
    render(<App />);
    expect(screen.getByTestId('undo')).toBeInTheDocument();
    expect(screen.getByTestId('redo')).toBeInTheDocument();
  });

  it('集成：底图开关后点撤销按钮恢复 visible、点重做按钮再次隐藏', () => {
    useProjectStore.setState({
      project: {
        ...useProjectStore.getState().project,
        bgPhoto: { dataUrl: 'data:image/png;base64,AA', visible: true },
      },
    });
    render(<App />);

    fireEvent.click(screen.getByTestId('toggle-bg')); // visible → false（走撤销历史）
    expect(useProjectStore.getState().project.bgPhoto?.visible).toBe(false);

    fireEvent.click(screen.getByTestId('undo'));
    expect(useProjectStore.getState().project.bgPhoto?.visible).toBe(true);

    fireEvent.click(screen.getByTestId('redo'));
    expect(useProjectStore.getState().project.bgPhoto?.visible).toBe(false);
  });

  it('快捷键 Ctrl/Cmd+Z 触发撤销、Shift+Ctrl/Cmd+Z 触发重做', () => {
    useProjectStore.setState({
      project: {
        ...useProjectStore.getState().project,
        bgPhoto: { dataUrl: 'data:image/png;base64,AA', visible: true },
      },
    });
    render(<App />);

    fireEvent.click(screen.getByTestId('toggle-bg')); // visible → false
    expect(useProjectStore.getState().project.bgPhoto?.visible).toBe(false);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(useProjectStore.getState().project.bgPhoto?.visible).toBe(true);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(useProjectStore.getState().project.bgPhoto?.visible).toBe(false);

    // Cmd（metaKey）同样生效
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(useProjectStore.getState().project.bgPhoto?.visible).toBe(true);
  });
});
