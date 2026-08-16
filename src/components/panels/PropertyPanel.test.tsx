/**
 * T10 PropertyPanel 属性面板（seam 3/6）：
 * - 空选中占位 / 选中显示属性值（纹理风格/色板/不透明度/缩放/旋转）
 * - 属性编辑 → commitProject / applyTextureProps action（可撤销/重做）
 * - 纹理重合成（mock textureSupply 注入廉价 compose 避免真实像素合成）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createEmptyProject, createPaperElement, createPaperTexture } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import { PropertyPanel } from './PropertyPanel';

// applyTextureProps 默认 textureSupply 走真实合成（1024² fbm）过慢；构造注入廉价 compose。
vi.mock('../../texture/supply', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../texture/supply')>();
  return {
    ...actual,
    textureSupply: actual.createTextureSupply({
      compose: () => 'data:image/png;base64,MOCK',
    }),
  };
});

function projectWithPaper(options: { texture?: boolean } = {}): ReturnType<typeof createEmptyProject> {
  const project = createEmptyProject(1200, 800);
  project.elements.push(
    createPaperElement({
      id: 'paper-1',
      path: 'M 0 0 L 100 0 L 100 80 L 0 80 Z',
      color: '#7A8B5C',
      opacity: 1,
      textureId: options.texture ? 'tex-1' : null,
      textureScale: 1.5,
      seed: 42,
    }),
  );
  if (options.texture) {
    project.textures.push(
      createPaperTexture({
        id: 'tex-1',
        style: 'fold',
        seed: 42,
        color: '#7A8B5C',
        scale: 1.5,
        rotate: 90,
        dataUrl: 'data:image/png;base64,OLD',
      }),
    );
  }
  return project;
}

describe('PropertyPanel 渲染（seam 6）', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createEmptyProject(1200, 800),
      undoStack: [],
      redoStack: [],
    });
    useEditorStore.setState({ currentColor: '#000000', recentColors: [] });
  });

  it('未选中纸片显示占位', () => {
    render(<PropertyPanel selectedId={null} />);
    expect(screen.getByTestId('property-panel')).toBeInTheDocument();
    expect(screen.getByTestId('property-empty')).toHaveTextContent('未选中纸片');
    expect(screen.queryByTestId('opacity-slider')).toBeNull();
  });

  it('selectedId 指向不存在的元素时显示占位', () => {
    useProjectStore.setState({ project: projectWithPaper() });
    render(<PropertyPanel selectedId="missing" />);
    expect(screen.getByTestId('property-empty')).toHaveTextContent('未选中纸片');
  });

  it('选中纸片显示当前属性（纹理风格激活/不透明度/缩放/旋转）', () => {
    useProjectStore.setState({ project: projectWithPaper({ texture: true }) });
    render(<PropertyPanel selectedId="paper-1" />);
    expect(screen.getByTestId('texture-fold')).toHaveAttribute('aria-pressed', 'true');
    expect((screen.getByTestId('opacity-slider') as HTMLInputElement).value).toBe('1');
    expect(screen.getByTestId('opacity-value').textContent).toBe('100%');
    expect((screen.getByTestId('scale-slider') as HTMLInputElement).value).toBe('150');
    expect(screen.getByTestId('scale-value').textContent).toBe('150%');
    expect(screen.getByTestId('rotate-90')).toHaveAttribute('aria-pressed', 'true');
  });

  it('无纹理纸片：无风格激活，旋转默认 0 激活', () => {
    useProjectStore.setState({ project: projectWithPaper() });
    render(<PropertyPanel selectedId="paper-1" />);
    expect(screen.getByTestId('texture-none')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('rotate-0')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('PropertyPanel 属性编辑（seam 3）— 经 commitProject 可撤销', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createEmptyProject(1200, 800),
      undoStack: [],
      redoStack: [],
    });
    useEditorStore.setState({ currentColor: '#000000', recentColors: [] });
  });

  it('点击纹理风格按钮应用纹理（生成 texture 记录 + element.textureId）', () => {
    useProjectStore.setState({ project: projectWithPaper() });
    render(<PropertyPanel selectedId="paper-1" />);
    fireEvent.click(screen.getByTestId('texture-grain'));
    const st = useProjectStore.getState();
    const el = st.project.elements[0];
    expect(el.textureId).not.toBeNull();
    const tex = st.project.textures.find((t) => t.id === el.textureId);
    expect(tex?.style).toBe('grain');
    expect(st.undoStack).toHaveLength(1);
  });

  it('点击「无」清除纹理并清理纹理记录', () => {
    useProjectStore.setState({ project: projectWithPaper({ texture: true }) });
    render(<PropertyPanel selectedId="paper-1" />);
    fireEvent.click(screen.getByTestId('texture-none'));
    const st = useProjectStore.getState();
    expect(st.project.elements[0].textureId).toBeNull();
    expect(st.project.textures).toEqual([]);
  });

  it('点击色板色块：element.color 更新 + currentColor 同步 + 纹理重合成', () => {
    useProjectStore.setState({ project: projectWithPaper({ texture: true }) });
    render(<PropertyPanel selectedId="paper-1" />);
    fireEvent.click(screen.getByTestId('property-color-c0392b'));
    const st = useProjectStore.getState();
    expect(st.project.elements[0].color).toBe('#c0392b');
    expect(st.project.textures[0].color).toBe('#c0392b');
    expect(useEditorStore.getState().currentColor).toBe('#c0392b');
  });

  it('调整不透明度 slider：element.opacity 更新', () => {
    useProjectStore.setState({ project: projectWithPaper() });
    render(<PropertyPanel selectedId="paper-1" />);
    fireEvent.change(screen.getByTestId('opacity-slider'), { target: { value: '0.4' } });
    expect(useProjectStore.getState().project.elements[0].opacity).toBe(0.4);
  });

  it('调整纹理缩放 slider：element.textureScale 与纹理记录同步', () => {
    useProjectStore.setState({ project: projectWithPaper({ texture: true }) });
    render(<PropertyPanel selectedId="paper-1" />);
    fireEvent.change(screen.getByTestId('scale-slider'), { target: { value: '60' } });
    const st = useProjectStore.getState();
    expect(st.project.elements[0].textureScale).toBe(0.6);
    expect(st.project.textures[0].scale).toBe(0.6);
  });

  it('点击旋转按钮更新纹理记录 rotate（90° 增量）', () => {
    useProjectStore.setState({ project: projectWithPaper({ texture: true }) });
    render(<PropertyPanel selectedId="paper-1" />);
    fireEvent.click(screen.getByTestId('rotate-180'));
    expect(useProjectStore.getState().project.textures[0].rotate).toBe(180);
  });

  it('属性变更经 commitProject：可撤销/重做', () => {
    useProjectStore.setState({ project: projectWithPaper({ texture: true }) });
    render(<PropertyPanel selectedId="paper-1" />);
    fireEvent.change(screen.getByTestId('opacity-slider'), { target: { value: '0.4' } });
    expect(useProjectStore.getState().project.elements[0].opacity).toBe(0.4);

    act(() => {
      useProjectStore.getState().undo();
    });
    expect(useProjectStore.getState().project.elements[0].opacity).toBe(1);
    act(() => {
      useProjectStore.getState().redo();
    });
    expect(useProjectStore.getState().project.elements[0].opacity).toBe(0.4);
  });
});

describe('PropertyPanel 便签打勾（T16 seam 3）— 属性变更后出现打勾反馈', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createEmptyProject(1200, 800),
      undoStack: [],
      redoStack: [],
    });
    useEditorStore.setState({ currentColor: '#000000', recentColors: [] });
  });

  it('初始（未变更）不渲染打勾元素', () => {
    useProjectStore.setState({ project: projectWithPaper() });
    render(<PropertyPanel selectedId="paper-1" />);
    expect(screen.queryByTestId('property-check')).toBeNull();
  });

  it('调整不透明度后出现打勾反馈（✓ 已更新）', () => {
    useProjectStore.setState({ project: projectWithPaper() });
    render(<PropertyPanel selectedId="paper-1" />);
    fireEvent.change(screen.getByTestId('opacity-slider'), { target: { value: '0.4' } });
    const check = screen.getByTestId('property-check');
    expect(check).toBeInTheDocument();
    expect(check.textContent).toContain('✓');
    expect(check.className).toContain('prop-tick');
  });

  it('连续两次变更：打勾元素随变更重新出现（key 变化触发动画重放）', () => {
    useProjectStore.setState({ project: projectWithPaper() });
    render(<PropertyPanel selectedId="paper-1" />);
    fireEvent.change(screen.getByTestId('opacity-slider'), { target: { value: '0.4' } });
    const first = screen.getByTestId('property-check');
    fireEvent.change(screen.getByTestId('opacity-slider'), { target: { value: '0.6' } });
    const second = screen.getByTestId('property-check');
    expect(first).not.toBe(second); // key 变更 → 新节点（动画可重放）
    expect(second.textContent).toContain('✓');
  });
});
