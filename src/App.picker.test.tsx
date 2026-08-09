/**
 * App 集成（S6）— 顶栏「取色」按钮 + 右栏色卡面板端到端。
 * 取色后端 mock（真实 NSColorSampler 在 macOS 系统拾色器，jsdom 不可测）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { DEFAULT_CURRENT_COLOR, useEditorStore } from './store/editorStore';
import { createDefaultProject, useProjectStore } from './store/projectStore';
import { DEFAULT_TOOL, useToolStore } from './store/toolStore';

const pickScreenColorMock = vi.hoisted(() => vi.fn());
vi.mock('./picker/pickScreenColor', () => ({
  pickScreenColorPlatformAware: pickScreenColorMock,
}));

describe('App 集成（S6）— 屏幕取色 + MRU 色板', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ project: createDefaultProject() });
    useEditorStore.setState({ currentColor: DEFAULT_CURRENT_COLOR, recentColors: [] });
    useToolStore.setState({ tool: DEFAULT_TOOL, previousTool: null, activePickTemporary: false });
  });

  it('顶栏渲染「取色」按钮，右栏渲染色卡面板', () => {
    render(<App />);
    expect(screen.getByTestId('pick-color')).toBeInTheDocument();
    expect(screen.getByTestId('palette-panel')).toBeInTheDocument();
    expect(screen.getByTestId('current-color-swatch')).toBeInTheDocument();
  });

  it('点击取色按钮：取色成功 → 写入选色 + MRU 显示色块 + 切回前工具', async () => {
    pickScreenColorMock.mockResolvedValue('#ff8800');
    render(<App />);
    fireEvent.click(screen.getByTestId('pick-color'));
    expect(useToolStore.getState().tool).toBe('picker'); // 进入取色是同步的
    await screen.findByTestId('recent-color-ff8800'); // 异步完成（RTL act 包裹）
    expect(useEditorStore.getState().currentColor).toBe('#ff8800');
    expect(useEditorStore.getState().recentColors).toEqual(['#ff8800']);
    expect(useToolStore.getState().tool).toBe(DEFAULT_TOOL);
    expect(screen.queryByTestId('recent-color-empty')).toBeNull();
  });

  it('取色取消（null）→ 不写入选色，MRU 保持空，工具切回', async () => {
    pickScreenColorMock.mockResolvedValue(null);
    render(<App />);
    fireEvent.click(screen.getByTestId('pick-color'));
    await waitFor(() => expect(useToolStore.getState().tool).toBe(DEFAULT_TOOL));
    expect(useEditorStore.getState().currentColor).toBe(DEFAULT_CURRENT_COLOR);
    expect(useEditorStore.getState().recentColors).toEqual([]);
    expect(screen.getByTestId('recent-color-empty')).toBeInTheDocument();
  });

  it('点击 MRU 色块复用：激活为当前选中色', async () => {
    pickScreenColorMock.mockResolvedValue('#ff8800');
    render(<App />);
    fireEvent.click(screen.getByTestId('pick-color'));
    await screen.findByTestId('recent-color-ff8800');
    // 换选其他色，再从 MRU 点回 #ff8800
    act(() => useEditorStore.getState().setCurrentColor('#0000ff'));
    expect(useEditorStore.getState().currentColor).toBe('#0000ff');
    fireEvent.click(screen.getByTestId('recent-color-ff8800'));
    expect(useEditorStore.getState().currentColor).toBe('#ff8800');
    expect(useEditorStore.getState().recentColors[0]).toBe('#ff8800');
  });
});
