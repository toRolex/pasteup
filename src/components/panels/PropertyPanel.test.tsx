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
    // 逐例隔离：createProject 重置项目 + history.clear()（私有历史不跨用例堆积）
    useProjectStore.getState().createProject('portrait', 300);
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
    // 逐例隔离：createProject 重置项目 + history.clear()（私有历史不跨用例堆积）
    useProjectStore.getState().createProject('portrait', 300);
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

    act(() => {
      useProjectStore.getState().undo();
    });
    expect(useProjectStore.getState().project.elements[0].textureId).toBeNull(); // 可撤销回退
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

describe('PropertyPanel 滑杆手势合并（#50）— 同手势一条撤销记录、不同手势断开', () => {
  beforeEach(() => {
    // 逐例隔离：createProject 重置项目 + history.clear()（私有历史不跨用例堆积）
    useProjectStore.getState().createProject('portrait', 300);
    useEditorStore.setState({ currentColor: '#000000', recentColors: [] });
  });

  it('拖动滑杆一次（pointerdown + 连续 change）只产生一条撤销记录', () => {
    useProjectStore.setState({ project: projectWithPaper() });
    render(<PropertyPanel selectedId="paper-1" />);
    const slider = screen.getByTestId('opacity-slider');

    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '0.9' } });
    fireEvent.change(slider, { target: { value: '0.7' } });
    fireEvent.change(slider, { target: { value: '0.5' } });
    fireEvent.pointerUp(slider);
    expect(useProjectStore.getState().project.elements[0].opacity).toBe(0.5);

    act(() => {
      useProjectStore.getState().undo();
    });
    expect(useProjectStore.getState().project.elements[0].opacity).toBe(1); // 一次 undo 回到手势前
  });

  it('两次拖拽（不同手势）断开为两条撤销记录', () => {
    useProjectStore.setState({ project: projectWithPaper() });
    render(<PropertyPanel selectedId="paper-1" />);
    const slider = screen.getByTestId('opacity-slider');

    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '0.8' } });
    fireEvent.pointerUp(slider);
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '0.6' } });
    fireEvent.pointerUp(slider);
    expect(useProjectStore.getState().project.elements[0].opacity).toBe(0.6);

    act(() => {
      useProjectStore.getState().undo();
    });
    expect(useProjectStore.getState().project.elements[0].opacity).toBe(0.8); // 撤第二个手势
    act(() => {
      useProjectStore.getState().undo();
    });
    expect(useProjectStore.getState().project.elements[0].opacity).toBe(1); // 撤第一个手势
  });

  it('键盘方向键连续改值（同手势）合并为一条撤销记录', () => {
    useProjectStore.setState({ project: projectWithPaper() });
    render(<PropertyPanel selectedId="paper-1" />);
    const slider = screen.getByTestId('opacity-slider');

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.change(slider, { target: { value: '0.9' } });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.change(slider, { target: { value: '0.8' } });
    expect(useProjectStore.getState().project.elements[0].opacity).toBe(0.8);

    act(() => {
      useProjectStore.getState().undo();
    });
    expect(useProjectStore.getState().project.elements[0].opacity).toBe(1); // 一次 undo 回到键盘手势前
  });

  it('兄弟滑杆 blur 不误杀本滑杆手势（先拖不透明度再拖缩放各自独立合并）', () => {
    useProjectStore.setState({ project: projectWithPaper({ texture: true }) });
    render(<PropertyPanel selectedId="paper-1" />);
    const opacity = screen.getByTestId('opacity-slider');
    const scale = screen.getByTestId('scale-slider');

    // 拖 opacity（获焦）→ 收手势
    fireEvent.pointerDown(opacity);
    fireEvent.change(opacity, { target: { value: '0.8' } });
    fireEvent.pointerUp(opacity);

    // 点 scale：pointerdown(scale) 起手势后，opacity 的 blur 触发 endGesture —— 不应清掉 scale 的手势
    fireEvent.pointerDown(scale);
    fireEvent.blur(opacity); // 真实浏览器中，鼠标移向 scale 时 opacity 失焦
    fireEvent.change(scale, { target: { value: '160' } });
    fireEvent.change(scale, { target: { value: '120' } });
    fireEvent.change(scale, { target: { value: '100' } });
    fireEvent.pointerUp(scale);
    expect(useProjectStore.getState().project.elements[0].textureScale).toBe(1);

    act(() => {
      useProjectStore.getState().undo();
    });
    // 一次 undo 回到 scale 手势前：textureScale 复位、opacity 手势不受影响
    expect(useProjectStore.getState().project.elements[0].textureScale).toBe(1.5);
    expect(useProjectStore.getState().project.elements[0].opacity).toBe(0.8);
  });
});

describe('PropertyPanel 便签打勾（T16 seam 3）— 属性变更后出现打勾反馈', () => {
  beforeEach(() => {
    // 逐例隔离：createProject 重置项目 + history.clear()（私有历史不跨用例堆积）
    useProjectStore.getState().createProject('portrait', 300);
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
