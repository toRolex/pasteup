/**
 * S6 / T16 — PalettePanel：右栏色卡面板（当前选中色 + 「最近使用」MRU 色区）。
 * 取色结果经 editorStore 落位；本组件只读渲染 + 点击复用（setCurrentColor）。
 * T16 seam 2：点色联动——有选中纸片时点 MRU 色同时给纸片着色（走 applyTextureProps action）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_CURRENT_COLOR, useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';
import { createEmptyProject, createPaperElement, createPaperTexture } from '../../types/project';
import { PalettePanel } from './PalettePanel';

// applyTextureProps 重合成依赖 textureSupply；构造注入廉价 compose 避免真实 1024² fbm 合成。
vi.mock('../../texture/supply', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../texture/supply')>();
  return {
    ...actual,
    textureSupply: actual.createTextureSupply({
      compose: () => 'data:image/png;base64,MOCK',
    }),
  };
});

function projectWithPaper(): ReturnType<typeof createEmptyProject> {
  const project = createEmptyProject(1200, 800);
  project.elements.push(
    createPaperElement({
      id: 'paper-1',
      path: 'M 0 0 L 100 0 L 100 80 L 0 80 Z',
      color: '#7A8B5C',
      textureId: 'tex-1',
      textureScale: 1,
      seed: 42,
    }),
  );
  project.textures.push(
    createPaperTexture({
      id: 'tex-1',
      style: 'fold',
      seed: 42,
      color: '#7A8B5C',
      scale: 1,
      rotate: 0,
      dataUrl: 'data:image/png;base64,OLD',
    }),
  );
  return project;
}

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

describe('PalettePanel 点色联动（T16 seam 2）— 点色给选中纸片着色', () => {
  beforeEach(() => {
    useEditorStore.setState({ currentColor: DEFAULT_CURRENT_COLOR, recentColors: [] });
    // 逐例隔离：createProject 重置项目 + history.clear()（私有历史不跨用例堆积）
    useProjectStore.getState().createProject('portrait', 300);
  });

  it('有选中纸片：点 MRU 色 → element.color + texture.color 更新（重合成）+ currentColor 同步', () => {
    useProjectStore.setState({ project: projectWithPaper() });
    useEditorStore.setState({ recentColors: ['#c0392b', '#7A8B5C'] });
    render(<PalettePanel selectedId="paper-1" />);

    fireEvent.click(screen.getByTestId('recent-color-c0392b'));

    const st = useProjectStore.getState();
    expect(st.project.elements[0].color).toBe('#c0392b');
    expect(st.project.textures[0].color).toBe('#c0392b'); // 纹理同步变色 → 触发重合成
    expect(useEditorStore.getState().currentColor).toBe('#c0392b');

    act(() => {
      useProjectStore.getState().undo();
    });
    expect(useProjectStore.getState().project.elements[0].color).toBe('#7A8B5C'); // 可撤销回退
  });

  it('有选中纸片但 MRU 色与当前元素色相同：no-op 不产生独立撤销记录（applyTextureProps 防线一）', () => {
    useProjectStore.setState({ project: projectWithPaper() });
    useEditorStore.setState({ recentColors: ['#c0392b', '#7A8B5C'] });
    render(<PalettePanel selectedId="paper-1" />);

    // 先做一次真实编辑建立基线，再点同色 no-op
    fireEvent.click(screen.getByTestId('recent-color-c0392b'));
    expect(useProjectStore.getState().project.elements[0].color).toBe('#c0392b');
    fireEvent.click(screen.getByTestId('recent-color-c0392b')); // 同色 no-op（防线一）
    // 一次 undo 应回退真实编辑（→ #7A8B5C）；若 no-op 入栈则 undo 停在 #c0392b
    act(() => {
      useProjectStore.getState().undo();
    });
    expect(useProjectStore.getState().project.elements[0].color).toBe('#7A8B5C');
  });

  it('无选中纸片：点 MRU 只改 currentColor，不动项目', () => {
    useProjectStore.setState({ project: projectWithPaper() });
    useEditorStore.setState({ recentColors: ['#c0392b'] });
    const before = useProjectStore.getState().project;
    render(<PalettePanel selectedId={null} />);

    fireEvent.click(screen.getByTestId('recent-color-c0392b'));

    const st = useProjectStore.getState();
    expect(st.project.elements[0].color).toBe('#7A8B5C');
    expect(st.project.textures[0].color).toBe('#7A8B5C');
    expect(useEditorStore.getState().currentColor).toBe('#c0392b');
    expect(st.project).toBe(before); // 未产生任何项目变更
  });
});
