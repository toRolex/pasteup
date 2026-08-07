/**
 * S6 — PalettePanel：右栏色卡面板（当前选中色 + 「最近使用」MRU 色区）。
 * 取色结果经 editorStore 落位；本组件只读渲染 + 点击复用（setCurrentColor）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_CURRENT_COLOR, useEditorStore } from '../../store/editorStore';
import { PalettePanel } from './PalettePanel';

describe('PalettePanel（S6）— 当前色 + MRU 色区', () => {
  beforeEach(() => {
    useEditorStore.setState({ currentColor: DEFAULT_CURRENT_COLOR, recentColors: [] });
  });

  it('初始渲染默认选中色 + 空 MRU 占位', () => {
    render(<PalettePanel />);
    expect(screen.getByTestId('palette-panel')).toBeInTheDocument();
    expect(screen.getByTestId('current-color-swatch')).toBeInTheDocument();
    expect(screen.getByTestId('current-color-hex').textContent).toBe(DEFAULT_CURRENT_COLOR);
    expect(screen.getByTestId('recent-color-empty')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /使用颜色/ })).toBeNull();
  });

  it('MRU 色块渲染数量与 store 一致', () => {
    useEditorStore.setState({ recentColors: ['#111111', '#222222', '#333333'] });
    render(<PalettePanel />);
    expect(screen.getAllByRole('button', { name: /使用颜色/ })).toHaveLength(3);
  });

  it('点击 MRU 色块复用：激活为当前选中色', () => {
    useEditorStore.setState({ recentColors: ['#112233', '#445566'] });
    render(<PalettePanel />);
    fireEvent.click(screen.getByTestId('recent-color-112233'));
    expect(useEditorStore.getState().currentColor).toBe('#112233');
  });

  it('当前选中色 swatch 的 background 跟随 currentColor', () => {
    useEditorStore.setState({ currentColor: '#ff0000' });
    render(<PalettePanel />);
    expect(screen.getByTestId('current-color-swatch').style.backgroundColor).toBe('rgb(255, 0, 0)');
    expect(screen.getByTestId('current-color-hex').textContent).toBe('#ff0000');
  });
});
