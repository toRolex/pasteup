/**
 * S5 — useScreenPicker 交互编排（jsdom 可测：keydown/keyup + store 状态迁移）。
 * 真实 NSColorSampler 不可测，mock `pickScreenColor` 的返回契约。
 * 取色 = 挂起当前工具的系统模态：pickSession 置/清，tool 不改变。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_CURRENT_COLOR, useEditorStore } from '../store/editorStore';
import { DEFAULT_TOOL, selectIsPickMode, useToolStore } from '../store/toolStore';
import { PICK_COLOR_MODIFIER, PICK_COLOR_SHORTCUT, useScreenPicker } from './useScreenPicker';

const pickScreenColorMock = vi.hoisted(() => vi.fn());
vi.mock('./pickScreenColor', () => ({
  pickScreenColorPlatformAware: pickScreenColorMock,
}));

function Harness() {
  const { activate } = useScreenPicker();
  return (
    <button data-testid="pick-btn" onClick={() => activate()}>
      pick
    </button>
  );
}

function renderHarness() {
  return render(<Harness />);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('useScreenPicker（S5）— 取色交互编排', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEditorStore.setState({ currentColor: DEFAULT_CURRENT_COLOR, recentColors: [] });
    useToolStore.setState({ tool: DEFAULT_TOOL, pickSession: null });
  });

  it('快捷键 I 触发正式取色：成功写入选色并追加 MRU、退出取色会话（工具不变）', async () => {
    pickScreenColorMock.mockResolvedValue('#123456');
    renderHarness();
    fireEvent.keyDown(window, { key: PICK_COLOR_SHORTCUT });
    // 进入取色是同步的：置 pickSession，tool 不变
    expect(selectIsPickMode(useToolStore.getState())).toBe(true);
    expect(useToolStore.getState().tool).toBe(DEFAULT_TOOL);
    await vi.waitFor(() => expect(useEditorStore.getState().currentColor).toBe('#123456'));
    expect(useEditorStore.getState().recentColors).toEqual(['#123456']);
    expect(useToolStore.getState().pickSession).toBeNull();
  });

  it('取色取消（null）→ 退出取色，不写入选色', async () => {
    pickScreenColorMock.mockResolvedValue(null);
    renderHarness();
    fireEvent.keyDown(window, { key: PICK_COLOR_SHORTCUT });
    expect(selectIsPickMode(useToolStore.getState())).toBe(true);
    await vi.waitFor(() => expect(useToolStore.getState().pickSession).toBeNull());
    expect(useEditorStore.getState().currentColor).toBe(DEFAULT_CURRENT_COLOR);
    expect(useEditorStore.getState().recentColors).toEqual([]);
  });

  it('Esc 在取色中取消退出，结果被丢弃', async () => {
    pickScreenColorMock.mockResolvedValue('#123456');
    renderHarness();
    fireEvent.keyDown(window, { key: PICK_COLOR_SHORTCUT });
    expect(selectIsPickMode(useToolStore.getState())).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useToolStore.getState().pickSession).toBeNull();
    await flush();
    expect(useEditorStore.getState().currentColor).toBe(DEFAULT_CURRENT_COLOR);
    expect(useEditorStore.getState().recentColors).toEqual([]);
  });

  it('Esc 非取色中为 no-op', async () => {
    renderHarness();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useToolStore.getState().pickSession).toBeNull();
    expect(pickScreenColorMock).not.toHaveBeenCalled();
  });

  it('按住 Alt 临时取色：取到色后仍停留取色，松开回到原工具', async () => {
    pickScreenColorMock.mockResolvedValue('#abcdef');
    renderHarness();
    fireEvent.keyDown(window, { key: PICK_COLOR_MODIFIER });
    expect(selectIsPickMode(useToolStore.getState())).toBe(true);
    expect(useToolStore.getState().pickSession).toEqual({ temporary: true });
    // 临时模式：取到色后不退出，直到松开修饰键
    await vi.waitFor(() => expect(useEditorStore.getState().currentColor).toBe('#abcdef'));
    expect(selectIsPickMode(useToolStore.getState())).toBe(true);
    expect(useEditorStore.getState().recentColors).toEqual(['#abcdef']);
    fireEvent.keyUp(window, { key: PICK_COLOR_MODIFIER });
    expect(useToolStore.getState().pickSession).toBeNull();
  });

  it('工具按钮点击触发正式取色（与快捷键同一条流程）', async () => {
    pickScreenColorMock.mockResolvedValue('#ff00aa');
    renderHarness();
    fireEvent.click(screen.getByTestId('pick-btn'));
    expect(selectIsPickMode(useToolStore.getState())).toBe(true);
    await vi.waitFor(() => expect(useEditorStore.getState().currentColor).toBe('#ff00aa'));
    expect(useToolStore.getState().pickSession).toBeNull();
  });

  it('输入框聚焦时快捷键不触发取色', async () => {
    pickScreenColorMock.mockResolvedValue('#123456');
    render(
      <div>
        <input data-testid="name-input" />
        <Harness />
      </div>,
    );
    const input = screen.getByTestId('name-input');
    input.focus();
    fireEvent.keyDown(input, { key: PICK_COLOR_SHORTCUT });
    expect(useToolStore.getState().pickSession).toBeNull();
    expect(pickScreenColorMock).not.toHaveBeenCalled();
  });

  it('已在取色中重复触发为 no-op', async () => {
    pickScreenColorMock.mockResolvedValue('#123456');
    renderHarness();
    fireEvent.keyDown(window, { key: PICK_COLOR_SHORTCUT });
    // 未等完成再次触发
    fireEvent.keyDown(window, { key: PICK_COLOR_SHORTCUT });
    await flush();
    expect(pickScreenColorMock).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState().currentColor).toBe('#123456');
  });
});
