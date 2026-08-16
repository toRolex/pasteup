import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { tokens } from './styles/tokens';
import { createEmptyProject, createPaperElement } from './types/project';
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

// T12 — 自动保存控制器 + 项目文件 I/O 封装 mock（App 层只验接线，防抖/写盘逻辑在 io 单测覆盖）
const createAutosaveControllerMock = vi.hoisted(() => vi.fn());
const scheduleMock = vi.hoisted(() => vi.fn());
const flushMock = vi.hoisted(() => vi.fn());
const disposeMock = vi.hoisted(() => vi.fn());
vi.mock('./io/autosave', () => ({
  createAutosaveController: createAutosaveControllerMock,
}));
// 默认返回有效控制器（App 挂载 useEffect 立即创建；unmount 时调用 dispose 不能为 undefined）
createAutosaveControllerMock.mockImplementation(() => ({
  schedule: scheduleMock,
  flush: flushMock,
  dispose: disposeMock,
}));

const pickOpenPathMock = vi.hoisted(() => vi.fn());
const pickSavePathMock = vi.hoisted(() => vi.fn());
const readProjectFileMock = vi.hoisted(() => vi.fn());
const writeProjectFileMock = vi.hoisted(() => vi.fn());
vi.mock('./io/projectFile', () => ({
  pickOpenPath: pickOpenPathMock,
  pickSavePath: pickSavePathMock,
  readProjectFile: readProjectFileMock,
  writeProjectFile: writeProjectFileMock,
}));

const normalize = (s: string) => s.replace(/\s+/g, '');

type MatchMediaMock = {
  matches: boolean;
  media: string;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
};

function mockMatchMedia(matches: boolean): void {
  const mql: MatchMediaMock = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  window.matchMedia = vi.fn().mockReturnValue(mql);
}

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

describe('App 导出 PNG（T14 seam 8）— 顶栏按钮触发导出 + 下载', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: createDefaultProject(), undoStack: [], redoStack: [] });
  });

  it('「导出 PNG」按钮存在，点击后以 project 尺寸文件名触发下载', async () => {
    const createSpy = vi.spyOn(document, 'createElement');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<App />);

    const btn = screen.getByTestId('export-png');
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);

    // 导出离线化（#49）后 handleExportPNG 为 async：等待离线导出完成后触发下载
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());

    // 下载锚点：download 属性携带 project 像素尺寸文件名
    const exportAnchor = createSpy.mock.results
      .map((r) => r.value as HTMLAnchorElement)
      .find((el) => el.tagName?.toLowerCase() === 'a' && el.download !== '');
    expect(exportAnchor).toBeDefined();
    expect(exportAnchor!.download).toBe('pasteup-export-2480x3508.png');
    expect(exportAnchor!.href).toMatch(/^data:image\/png;base64,/);

    clickSpy.mockRestore();
    createSpy.mockRestore();
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

describe('App 图层面板（T11）— 左栏图层列表 + 双向联动 + z 序重排', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createDefaultProject(),
      undoStack: [],
      redoStack: [],
    });
  });

  it('左栏渲染 LayerPanel，elements 为空时显示空态', () => {
    render(<App />);
    expect(screen.getByTestId('layer-panel')).toBeInTheDocument();
    expect(screen.getByTestId('layer-panel-empty')).toBeInTheDocument();
  });

  it('elements 非空时每项渲染色块 + 名称', () => {
    useProjectStore.getState().addPaper('M 0 0 L 1 0 L 0 1 Z');
    useProjectStore.getState().addPaper('M 1 1 L 2 1 L 1 2 Z');
    useProjectStore.getState().addPaper('M 2 2 L 3 2 L 2 3 Z');
    render(<App />);
    const items = screen.getAllByTestId(/^layer-item-/);
    expect(items).toHaveLength(3);
  });

  it('集成：点 LayerPanel "上移" → elements 数组移动', () => {
    useProjectStore.getState().addPaper('M 0 0 L 1 0 L 0 1 Z');
    useProjectStore.getState().addPaper('M 1 1 L 2 1 L 1 2 Z');
    useProjectStore.getState().addPaper('M 2 2 L 3 2 L 2 3 Z');
    const ids = useProjectStore.getState().project.elements.map((e) => e.id);
    render(<App />);

    fireEvent.click(screen.getByTestId(`layer-up-${ids[1]!}`));
    const next = useProjectStore.getState().project.elements.map((e) => e.id);
    // paper-1 从 index 1 上移到 index 2
    expect(next).toEqual([ids[0], ids[2], ids[1]]);
  });

  it('集成：点 LayerPanel "置顶" 可撤销（undo 恢复原序）', () => {
    useProjectStore.getState().addPaper('M 0 0 L 1 0 L 0 1 Z');
    useProjectStore.getState().addPaper('M 1 1 L 2 1 L 1 2 Z');
    useProjectStore.getState().addPaper('M 2 2 L 3 2 L 2 3 Z');
    const ids = useProjectStore.getState().project.elements.map((e) => e.id);
    render(<App />);

    fireEvent.click(screen.getByTestId(`layer-top-${ids[0]!}`));
    expect(useProjectStore.getState().project.elements[2]!.id).toBe(ids[0]);

    fireEvent.click(screen.getByTestId('undo'));
    expect(useProjectStore.getState().project.elements.map((e) => e.id)).toEqual(ids);
  });
});

describe('App 自动保存 + 打开项目（T12）— 顶栏按钮 + 保存状态 + store 接线', () => {
  beforeEach(() => {
    // mockClear 保留默认实现（App 挂载即 create + unmount 即 dispose），只清调用记录
    createAutosaveControllerMock.mockClear();
    scheduleMock.mockReset();
    flushMock.mockReset();
    disposeMock.mockReset();
    pickOpenPathMock.mockReset();
    pickSavePathMock.mockReset();
    readProjectFileMock.mockReset();
    writeProjectFileMock.mockReset();
    useProjectStore.setState({
      project: createDefaultProject(),
      undoStack: [],
      redoStack: [],
      savePath: null,
      saveStatus: 'idle',
    });
  });

  it('顶栏渲染「打开」「保存」按钮与保存状态指示', () => {
    render(<App />);
    expect(screen.getByTestId('open-project')).toBeInTheDocument();
    expect(screen.getByTestId('save-project')).toBeInTheDocument();
    expect(screen.getByTestId('save-status')).toBeInTheDocument();
  });

  it('挂载后建立自动保存订阅：项目改动 → schedule（防抖写盘入口）', async () => {
    render(<App />);
    expect(scheduleMock).not.toHaveBeenCalled();

    useProjectStore.getState().addPaper('M 0 0 L 1 0 L 0 1 Z');
    await waitFor(() => expect(scheduleMock).toHaveBeenCalledTimes(1));
  });

  it('点击「保存」→ 触发 controller.flush（立即写盘）', async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('save-project'));
    await waitFor(() => expect(flushMock).toHaveBeenCalledTimes(1));
  });

  it('保存状态指示：idle=未保存 / saving=保存中 / saved=已保存 / error=保存失败', () => {
    render(<App />);
    expect(screen.getByTestId('save-status')).toHaveTextContent('未保存');

    act(() => useProjectStore.setState({ saveStatus: 'saving' }));
    expect(screen.getByTestId('save-status')).toHaveTextContent('保存中');

    act(() => useProjectStore.setState({ saveStatus: 'saved' }));
    expect(screen.getByTestId('save-status')).toHaveTextContent('已保存');

    act(() => useProjectStore.setState({ saveStatus: 'error' }));
    expect(screen.getByTestId('save-status')).toHaveTextContent('保存失败');
  });

  it('点击「打开」→ 对话框选文件 → 读取解析 → 写入 store（project/savePath/saveStatus）', async () => {
    pickOpenPathMock.mockResolvedValue('/tmp/project.json');
    const opened = createEmptyProject(500, 400);
    opened.elements.push(
      createPaperElement({ id: 'restored', path: 'M 0 0 Z', color: '#000', seed: 9 }),
    );
    readProjectFileMock.mockResolvedValue(opened);

    render(<App />);
    fireEvent.click(screen.getByTestId('open-project'));

    await waitFor(() => {
      const st = useProjectStore.getState();
      expect(st.project).toEqual(opened);
      expect(st.savePath).toBe('/tmp/project.json');
      expect(st.saveStatus).toBe('saved');
    });
    expect(pickOpenPathMock).toHaveBeenCalledTimes(1);
    expect(readProjectFileMock).toHaveBeenCalledWith('/tmp/project.json');
  });

  it('「打开」用户取消 → 不读取、项目不变', async () => {
    pickOpenPathMock.mockResolvedValue(null);
    render(<App />);
    fireEvent.click(screen.getByTestId('open-project'));

    await waitFor(() => expect(pickOpenPathMock).toHaveBeenCalledTimes(1));
    expect(readProjectFileMock).not.toHaveBeenCalled();
    expect(useProjectStore.getState().project).toEqual(createDefaultProject());
  });

  it('「打开」文件损坏/解析失败 → 显示错误、不崩溃、项目不变', async () => {
    pickOpenPathMock.mockResolvedValue('/tmp/project.json');
    readProjectFileMock.mockRejectedValue(new Error('项目文件损坏'));

    render(<App />);
    fireEvent.click(screen.getByTestId('open-project'));

    await waitFor(() => expect(screen.getByTestId('open-error')).toHaveTextContent(/项目文件损坏/));
    expect(useProjectStore.getState().project).toEqual(createDefaultProject());
    expect(useProjectStore.getState().savePath).toBeNull();
  });
});

describe('App 导出盖朱红图章（T16 seam 4）— 点导出盖 Pasteup 图章', () => {
  const clickSpy = () => vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  beforeEach(() => {
    mockMatchMedia(false);
    vi.clearAllMocks();
    useProjectStore.setState({ project: createDefaultProject(), undoStack: [], redoStack: [] });
  });

  afterEach(() => {
    // 只复原 matchMedia；不能用 vi.restoreAllMocks()——它会清掉文件级 T12
    // createAutosaveController mock 的实现，导致后续 App 渲染时 controller.dispose 崩溃。
    (window as unknown as { matchMedia?: unknown }).matchMedia = undefined;
  });

  it('初始不渲染图章', () => {
    render(<App />);
    expect(screen.queryByTestId('export-stamp')).toBeNull();
  });

  it('点「导出 PNG」→ 出现 Pasteup 图章（class stamp + stamped），下载仍触发', async () => {
    const createSpy = vi.spyOn(document, 'createElement');
    const click = clickSpy();
    render(<App />);

    fireEvent.click(screen.getByTestId('export-png'));

    // handleExportPNG 为 async（#49）：图章在离线导出 await 之后出现
    const stamp = await screen.findByTestId('export-stamp');
    expect(stamp).toBeInTheDocument();
    expect(stamp.className).toContain('stamp');
    expect(stamp.className).toContain('stamped');
    expect(stamp.textContent).toContain('Pasteup');

    // 下载锚点仍触发（图章是附加反馈，不替换导出行为）
    const exportAnchor = createSpy.mock.results
      .map((r) => r.value as HTMLAnchorElement)
      .find((el) => el.tagName?.toLowerCase() === 'a' && el.download !== '');
    expect(exportAnchor).toBeDefined();
    expect(click).toHaveBeenCalled();

    createSpy.mockRestore();
    click.mockRestore();
  });

  it('prefers-reduced-motion：根节点标降级，图章仍瞬时出现（不依赖动画）', async () => {
    mockMatchMedia(true);
    const createSpy = vi.spyOn(document, 'createElement');
    const click = clickSpy();
    render(<App />);

    expect(screen.getByTestId('journal')).toHaveAttribute('data-reduced-motion', 'true');
    fireEvent.click(screen.getByTestId('export-png'));

    const stamp = await screen.findByTestId('export-stamp');
    expect(stamp).toBeInTheDocument();
    expect(stamp.className).toContain('stamped');
    expect(stamp.textContent).toContain('Pasteup');

    createSpy.mockRestore();
    click.mockRestore();
  });
});

describe('App 手帐拟物 class 结构（T16 seam 7）— 胶带/逐字/描线/手写圈注', () => {
  beforeEach(() => {
    mockMatchMedia(false);
    useProjectStore.setState({ project: createDefaultProject(), undoStack: [], redoStack: [] });
  });

  afterEach(() => {
    // 只复原 matchMedia；不能 vi.restoreAllMocks()（会清掉文件级 T12 autosave mock 实现）
    (window as unknown as { matchMedia?: unknown }).matchMedia = undefined;
  });

  it('顶栏渲染骑缝胶带（.tape--topbar）', () => {
    render(<App />);
    expect(document.querySelector('.tape--topbar')).not.toBeNull();
  });

  it('品牌名逐字渲染（.ch span 存在）+ 手绘下划线 SVG（brand-underline + .underline-path）', () => {
    render(<App />);
    expect(document.querySelectorAll('.brand-name .ch').length).toBeGreaterThan(0);
    const underline = screen.getByTestId('brand-underline');
    expect(underline.tagName.toLowerCase()).toBe('svg');
    expect(underline.querySelector('.underline-path')).not.toBeNull();
  });

  it('重点功能旁有手写圈注：导出旁「盖戳」+ 色板旁「点色」', () => {
    render(<App />);
    const exportNote = screen.getByTestId('export-circle-note');
    expect(exportNote.className).toContain('circle-note');
    expect(exportNote.textContent).toContain('盖戳');

    const paletteNote = screen.getByTestId('palette-circle-note');
    expect(paletteNote.className).toContain('circle-note');
    expect(paletteNote.textContent).toContain('点色');
  });

  it('reduced-motion：品牌名直接显示（无 .ch span），仍保留下划线', () => {
    mockMatchMedia(true);
    render(<App />);
    expect(document.querySelectorAll('.brand-name .ch')).toHaveLength(0);
    expect(screen.getByTestId('brand-underline')).toBeInTheDocument();
  });
});
