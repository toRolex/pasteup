import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { tokens } from './styles/tokens';
import {
  createDefaultProject,
  useProjectStore,
} from './store/projectStore';

const exportProjectToSVGMock = vi.hoisted(() => vi.fn());
const saveSvgFileMock = vi.hoisted(() => vi.fn());
vi.mock('./export/svg', () => ({
  exportProjectToSVG: exportProjectToSVGMock,
  saveSvgFile: saveSvgFileMock,
}));

const normalize = (s: string) => s.replace(/\s+/g, '');

describe('App 集成（seam S3）— 三栏骨架 + store 驱动的画布', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: createDefaultProject() });
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

describe('App 集成（S5）— 顶栏「导出 SVG」按钮触发导出 + 下载', () => {
  beforeEach(() => {
    exportProjectToSVGMock.mockReset();
    saveSvgFileMock.mockReset();
    useProjectStore.setState({ project: createDefaultProject() });
  });

  it('顶栏渲染「导出 SVG」按钮', () => {
    render(<App />);
    expect(screen.getByTestId('export-svg')).toBeInTheDocument();
  });

  it('点击后调用 exportProjectToSVG 并用返回的 SVG 触发 saveSvgFile', async () => {
    exportProjectToSVGMock.mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    render(<App />);
    fireEvent.click(screen.getByTestId('export-svg'));

    await waitFor(() => expect(saveSvgFileMock).toHaveBeenCalledTimes(1));
    expect(exportProjectToSVGMock).toHaveBeenCalledTimes(1);
    expect(saveSvgFileMock).toHaveBeenCalledWith(
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      'pasteup.svg',
    );
  });
});
