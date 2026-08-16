import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createPaperElement, createPaperTexture, createEmptyProject, type PaperProject } from '../types/project';
import {
  createDefaultProject,
  useProjectStore,
} from './projectStore';

// applyTextureProps 经 textureSupply.resolve 合成；注入按 request 编码的廉价 compose，
// 避免真实 1024² fbm 合成，并让「request 原样传 resolve」可被断言（key 一致性）。
vi.mock('../texture/supply', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../texture/supply')>();
  return {
    ...actual,
    textureSupply: actual.createTextureSupply({
      compose: (r: { texId: string; color: string; scale: number; rotate: number }) =>
        `url:${r.texId}:${r.color}:${r.scale}:${r.rotate}`,
    }),
  };
});

describe('projectStore（seam S2）— 当前项目单一来源', () => {
  beforeEach(() => {
    // 每例重置回默认项目 + 空撤销/重做栈，避免单例跨用例污染
    useProjectStore.setState({ project: createDefaultProject(), undoStack: [], redoStack: [] });
  });

  it('初始状态 = 默认竖版 A4 @300，画布 2480×3508', () => {
    const project = useProjectStore.getState().project;
    expect(project.canvas).toEqual({ width: 2480, height: 3508 });
    expect(project.elements).toEqual([]);
    expect(project.textures).toEqual([]);
    expect(project.bgPhoto).toBeNull();
    expect(project.version).toBe(1);
  });

  it('createProject 依据朝向+分辨率初始化画布尺寸', () => {
    useProjectStore.getState().createProject('portrait', 96);
    expect(useProjectStore.getState().project.canvas).toEqual({ width: 794, height: 1123 });

    useProjectStore.getState().createProject('landscape', 300);
    expect(useProjectStore.getState().project.canvas).toEqual({ width: 3508, height: 2480 });

    useProjectStore.getState().createProject('portrait', 600);
    expect(useProjectStore.getState().project.canvas).toEqual({ width: 4961, height: 7016 });
  });

  it('createProject 重置内容字段为空（新项目从零开始）', () => {
    // 先塞入内容，验证 createProject 会清空
    useProjectStore.setState({
      project: {
        ...useProjectStore.getState().project,
        bgPhoto: { dataUrl: 'data:image/png;base64,AA', visible: true },
      },
    });
    useProjectStore.getState().createProject('landscape', 96);
    const project = useProjectStore.getState().project;
    expect(project.canvas).toEqual({ width: 1123, height: 794 });
    expect(project.bgPhoto).toBeNull();
    expect(project.elements).toEqual([]);
    expect(project.textures).toEqual([]);
  });

  it('setBackgroundPhoto 写入底图 dataURL 并默认显示', () => {
    useProjectStore.getState().setBackgroundPhoto('data:image/png;base64,AA');
    expect(useProjectStore.getState().project.bgPhoto).toEqual({
      dataUrl: 'data:image/png;base64,AA',
      visible: true,
    });
  });

  it('setBackgroundPhoto(null) 清除底图', () => {
    useProjectStore.getState().setBackgroundPhoto('data:image/png;base64,AA');
    useProjectStore.getState().setBackgroundPhoto(null);
    expect(useProjectStore.getState().project.bgPhoto).toBeNull();
  });

  it('setProject 替换当前 project（fabric 事件回灌通道）', () => {
    const next = { ...useProjectStore.getState().project, canvas: { width: 100, height: 200 } };
    useProjectStore.getState().setProject(next);
    expect(useProjectStore.getState().project.canvas).toEqual({ width: 100, height: 200 });
  });

  it('addPaper 追加闭合纸片到 elements 末尾（数组序即 z 序）', () => {
    useProjectStore.getState().addPaper('M 0 0 L 10 0 L 5 10 Z');
    useProjectStore.getState().addPaper('M 20 20 L 30 20 L 25 30 Z');
    const elements = useProjectStore.getState().project.elements;
    expect(elements).toHaveLength(2);
    expect(elements[0].path).toBe('M 0 0 L 10 0 L 5 10 Z');
    expect(elements[0].color).toBe('#7A8B5C');
    expect(elements[1].path).toBe('M 20 20 L 30 20 L 25 30 Z');
    expect(elements[1].kind).toBe('paper');
    // 每片 id 唯一，后画的在数组末尾 = 更高 z 序
    expect(elements[0].id).not.toBe(elements[1].id);
  });

  it('addPaper 支持自定义颜色（T10 色板接入前的默认色兜底）', () => {
    useProjectStore.getState().addPaper('M 0 0 L 1 0 L 0 1 Z', '#c0392b');
    const el = useProjectStore.getState().project.elements[0];
    expect(el.color).toBe('#c0392b');
  });
});

describe('projectStore（T9 seam U1–U6）— 撤销/重做栈', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createDefaultProject(),
      undoStack: [],
      redoStack: [],
    });
  });

  it('undo/redo 初始空栈：调用不改变 project、不报错', () => {
    const before = useProjectStore.getState().project;
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project).toEqual(before);
    useProjectStore.getState().redo();
    expect(useProjectStore.getState().project).toEqual(before);
    expect(useProjectStore.getState().undoStack).toEqual([]);
    expect(useProjectStore.getState().redoStack).toEqual([]);
  });

  it('commitProject push 编辑前快照到 undoStack 并清空 redoStack（栈顶变更）', () => {
    const initial = useProjectStore.getState().project;
    // 先制造可重做历史：编辑 A → undo
    useProjectStore.getState().addPaper('M 0 0 L 1 0 L 0 1 Z');
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().redoStack).toHaveLength(1);
    expect(useProjectStore.getState().project).toEqual(initial);

    // 新编辑走统一入口 commitProject（模拟 transform 回灌 / 描摹生成）
    useProjectStore.getState().commitProject({
      ...useProjectStore.getState().project,
      elements: [
        ...useProjectStore.getState().project.elements,
        createPaperElement({ path: 'M 5 5 L 6 5 L 5 6 Z', color: '#000', seed: 42 }),
      ],
    });
    const st = useProjectStore.getState();
    expect(st.redoStack).toEqual([]); // 栈顶变更清空重做栈
    expect(st.undoStack).toHaveLength(1);
    expect(st.undoStack[st.undoStack.length - 1]).toEqual(initial); // 编辑前快照
    expect(st.project.elements).toHaveLength(1);
  });

  it('addPaper 后可撤销（纸片移除）/ 重做（纸片恢复）', () => {
    useProjectStore.getState().addPaper('M 0 0 L 10 0 L 5 10 Z');
    expect(useProjectStore.getState().project.elements).toHaveLength(1);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.elements).toHaveLength(0);

    useProjectStore.getState().redo();
    expect(useProjectStore.getState().project.elements).toHaveLength(1);
    expect(useProjectStore.getState().project.elements[0].path).toBe('M 0 0 L 10 0 L 5 10 Z');
  });

  it('多次编辑 undo 逐级回退、redo 逐级恢复（栈序正确）', () => {
    const s = useProjectStore.getState();
    s.addPaper('M 0 0 L 1 0 L 0 1 Z');
    s.addPaper('M 2 2 L 3 2 L 2 3 Z');
    s.addPaper('M 4 4 L 5 4 L 4 5 Z');
    expect(useProjectStore.getState().project.elements).toHaveLength(3);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.elements).toHaveLength(2);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.elements).toHaveLength(1);

    useProjectStore.getState().redo();
    expect(useProjectStore.getState().project.elements).toHaveLength(2);
    useProjectStore.getState().redo();
    expect(useProjectStore.getState().project.elements).toHaveLength(3);
  });

  it('transform 回灌（commitProject 替换 transform）undo 恢复原位 / redo 恢复新位', () => {
    const s = useProjectStore.getState();
    s.addPaper('M 0 0 L 10 0 L 5 10 Z'); // 纸片初始在原点
    const afterAdd = useProjectStore.getState().project;

    // 模拟 object:modified 回灌：移动纸片到 (100, 200)
    const moved = {
      ...afterAdd,
      elements: afterAdd.elements.map((el) => ({
        ...el,
        transform: { ...el.transform, x: 100, y: 200 },
      })),
    };
    useProjectStore.getState().commitProject(moved);
    expect(useProjectStore.getState().project.elements[0].transform).toEqual({
      x: 100, y: 200, rotation: 0, scaleX: 1, scaleY: 1,
    });

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.elements[0].transform.x).toBe(0);
    expect(useProjectStore.getState().project.elements[0].transform.y).toBe(0);

    useProjectStore.getState().redo();
    expect(useProjectStore.getState().project.elements[0].transform).toEqual({
      x: 100, y: 200, rotation: 0, scaleX: 1, scaleY: 1,
    });
  });

  it('底图开关（toggleBackgroundPhoto）undo/redo 恢复 visible', () => {
    const s = useProjectStore.getState();
    s.setBackgroundPhoto('data:image/png;base64,AA');
    expect(useProjectStore.getState().project.bgPhoto?.visible).toBe(true);

    useProjectStore.getState().toggleBackgroundPhoto();
    expect(useProjectStore.getState().project.bgPhoto?.visible).toBe(false);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.bgPhoto?.visible).toBe(true);

    useProjectStore.getState().redo();
    expect(useProjectStore.getState().project.bgPhoto?.visible).toBe(false);
  });

  it('setBackgroundPhoto undo 恢复 null / redo 恢复底图', () => {
    const s = useProjectStore.getState();
    s.setBackgroundPhoto('data:image/png;base64,AA');
    s.setBackgroundPhoto(null);
    expect(useProjectStore.getState().project.bgPhoto).toBeNull();

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.bgPhoto).toEqual({
      dataUrl: 'data:image/png;base64,AA',
      visible: true,
    });

    useProjectStore.getState().redo();
    expect(useProjectStore.getState().project.bgPhoto).toBeNull();
  });

  it('栈顶变更（undo 后新编辑）清空 redoStack，redo no-op', () => {
    const s = useProjectStore.getState();
    s.addPaper('M 0 0 L 1 0 L 0 1 Z');
    s.undo();
    expect(useProjectStore.getState().redoStack).toHaveLength(1);

    s.setBackgroundPhoto('data:image/png;base64,AA'); // 新编辑 → 栈顶变更
    const st = useProjectStore.getState();
    expect(st.redoStack).toEqual([]);

    st.redo(); // redo 空栈 no-op
    expect(useProjectStore.getState().project.bgPhoto).toEqual({
      dataUrl: 'data:image/png;base64,AA',
      visible: true,
    });
    expect(useProjectStore.getState().project.elements).toHaveLength(0);
  });

  it('commitProject 传四引用全相等的浅拷贝（diffProject none）→ no-op 不入撤销栈（#47 连线）', () => {
    const before = useProjectStore.getState().project;
    const undoLenBefore = useProjectStore.getState().undoStack.length;
    // 顶层换新对象但 elements/textures/canvas/bgPhoto 引用全等 → 无实质变更
    useProjectStore.getState().commitProject({ ...before });
    expect(useProjectStore.getState().undoStack.length).toBe(undoLenBefore);
    expect(useProjectStore.getState().project).toBe(before); // no-op：未替换
  });

  it('底图 visible 翻转（diffProject bg-only）仍入撤销栈（bg-only ≠ none，不合并成单一 bool）', () => {
    const s = useProjectStore.getState();
    s.setBackgroundPhoto('data:image/png;base64,AA');
    const undoLenBefore = useProjectStore.getState().undoStack.length;

    s.toggleBackgroundPhoto(); // core 引用不变、bgPhoto 换新同 dataUrl → bg-only
    const st = useProjectStore.getState();
    expect(st.project.bgPhoto?.visible).toBe(false);
    expect(st.undoStack.length).toBe(undoLenBefore + 1); // bg-only 入撤销栈（store 只看 none）
  });

  it('快照隔离：undo 后继续编辑不污染已 undo 状态（redo 清空 + 栈内快照独立）', () => {
    const s = useProjectStore.getState();
    s.addPaper('M 0 0 L 1 0 L 0 1 Z'); // A：1 纸片
    s.setBackgroundPhoto('data:image/png;base64,AA'); // B：A + 底图

    s.undo(); // 回退 B → 仅 A（1 纸片，无底图）
    let st = useProjectStore.getState();
    expect(st.project.elements).toHaveLength(1);
    expect(st.project.bgPhoto).toBeNull();
    expect(st.redoStack).toHaveLength(1);

    s.addPaper('M 9 9 L 8 9 L 9 8 Z'); // 新编辑 C：2 纸片，清空 redoStack
    st = useProjectStore.getState();
    expect(st.redoStack).toEqual([]);
    expect(st.project.elements).toHaveLength(2);

    s.undo(); // 回退 C → 仅 A
    st = useProjectStore.getState();
    expect(st.project.elements).toHaveLength(1);
    expect(st.project.bgPhoto).toBeNull();

    s.undo(); // 回退 A → 空项目
    st = useProjectStore.getState();
    expect(st.project.elements).toHaveLength(0);
    expect(st.project.bgPhoto).toBeNull();
  });

  it('createProject 重置撤销/重做栈（新项目新历史）', () => {
    const s = useProjectStore.getState();
    s.addPaper('M 0 0 L 1 0 L 0 1 Z');
    expect(useProjectStore.getState().undoStack.length).toBeGreaterThan(0);

    useProjectStore.getState().createProject('landscape', 96);
    const st = useProjectStore.getState();
    expect(st.undoStack).toEqual([]);
    expect(st.redoStack).toEqual([]);

    st.undo();
    st.redo();
    expect(useProjectStore.getState().project.canvas).toEqual({ width: 1123, height: 794 });
  });
});

describe('projectStore（T11 seam）— 图层重排 reorderElements', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createDefaultProject(),
      undoStack: [],
      redoStack: [],
    });
  });

  it('reorderElements 走 commitProject：moveToTop 后 elements 数组末位置为该元素', () => {
    useProjectStore.getState().addPaper('M 0 0 L 1 0 L 0 1 Z');
    useProjectStore.getState().addPaper('M 1 1 L 2 1 L 1 2 Z');
    useProjectStore.getState().addPaper('M 2 2 L 3 2 L 2 3 Z');
    const ids = useProjectStore.getState().project.elements.map((e) => e.id);
    useProjectStore.getState().reorderElements(ids[0]!, 'top');
    const next = useProjectStore.getState().project.elements.map((e) => e.id);
    expect(next[next.length - 1]).toBe(ids[0]);
    expect(next[0]).toBe(ids[1]);
    expect(next[1]).toBe(ids[2]);
  });

  it('reorderElements 走 commitProject：undo 恢复原序 / redo 恢复新序', () => {
    useProjectStore.getState().addPaper('M 0 0 L 1 0 L 0 1 Z');
    useProjectStore.getState().addPaper('M 1 1 L 2 1 L 1 2 Z');
    useProjectStore.getState().addPaper('M 2 2 L 3 2 L 2 3 Z');
    const beforeIds = useProjectStore.getState().project.elements.map((e) => e.id);
    useProjectStore.getState().reorderElements(beforeIds[0]!, 'top');

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.elements.map((e) => e.id)).toEqual(beforeIds);

    useProjectStore.getState().redo();
    const afterIds = useProjectStore.getState().project.elements.map((e) => e.id);
    expect(afterIds[afterIds.length - 1]).toBe(beforeIds[0]);
  });

  it('reorderElements 栈顶变更后清空 redoStack', () => {
    useProjectStore.getState().addPaper('M 0 0 L 1 0 L 0 1 Z');
    useProjectStore.getState().addPaper('M 1 1 L 2 1 L 1 2 Z');
    useProjectStore.getState().addPaper('M 2 2 L 3 2 L 2 3 Z');
    const ids = useProjectStore.getState().project.elements.map((e) => e.id);
    // 制造可重做历史：reorderElements → undo
    useProjectStore.getState().reorderElements(ids[0]!, 'top');
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().redoStack).toHaveLength(1);

    // 新重排操作应清空 redoStack
    const idsNow = useProjectStore.getState().project.elements.map((e) => e.id);
    useProjectStore.getState().reorderElements(idsNow[1]!, 'up');
    expect(useProjectStore.getState().redoStack).toEqual([]);
  });

  it('边界 no-op（已在最顶层 moveToTop）不入撤销栈，commitEdit 视为 no-op', () => {
    useProjectStore.getState().addPaper('M 0 0 L 1 0 L 0 1 Z');
    useProjectStore.getState().addPaper('M 1 1 L 2 1 L 1 2 Z');
    useProjectStore.getState().undo(); // 清空 paper-2
    useProjectStore.getState().undo(); // 清空 paper-1，回到空

    useProjectStore.getState().addPaper('M 0 0 L 1 0 L 0 1 Z');
    useProjectStore.getState().addPaper('M 1 1 L 2 1 L 1 2 Z');
    const topId = useProjectStore.getState().project.elements[1]!.id;

    const undoLenBefore = useProjectStore.getState().undoStack.length;
    useProjectStore.getState().reorderElements(topId, 'top'); // 已在末尾 → no-op
    expect(useProjectStore.getState().undoStack.length).toBe(undoLenBefore);
  });

  it('reorderElements 接受 up/down/top/bottom 四种操作', () => {
    useProjectStore.getState().addPaper('M 0 0 L 1 0 L 0 1 Z');
    useProjectStore.getState().addPaper('M 1 1 L 2 1 L 1 2 Z');
    useProjectStore.getState().addPaper('M 2 2 L 3 2 L 2 3 Z');
    const ids = useProjectStore.getState().project.elements.map((e) => e.id);

    useProjectStore.getState().reorderElements(ids[2]!, 'bottom');
    let next = useProjectStore.getState().project.elements.map((e) => e.id);
    expect(next[0]).toBe(ids[2]);

    useProjectStore.getState().reorderElements(ids[2]!, 'up');
    next = useProjectStore.getState().project.elements.map((e) => e.id);
    expect(next[0]).toBe(ids[0]);
    expect(next[1]).toBe(ids[2]);
  });
});

describe('projectStore（T12 seam）— 自动保存状态与打开项目', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createDefaultProject(),
      undoStack: [],
      redoStack: [],
      savePath: null,
      saveStatus: 'idle',
    });
  });

  it('初始状态：saveStatus=idle、savePath=null（新建项目尚未保存）', () => {
    const st = useProjectStore.getState();
    expect(st.savePath).toBeNull();
    expect(st.saveStatus).toBe('idle');
  });

  it('setSavePath / setSaveStatus 写入保存元数据', () => {
    useProjectStore.getState().setSavePath('/tmp/project.json');
    expect(useProjectStore.getState().savePath).toBe('/tmp/project.json');

    useProjectStore.getState().setSaveStatus('saving');
    expect(useProjectStore.getState().saveStatus).toBe('saving');

    useProjectStore.getState().setSaveStatus('saved');
    expect(useProjectStore.getState().saveStatus).toBe('saved');

    useProjectStore.getState().setSavePath(null);
    expect(useProjectStore.getState().savePath).toBeNull();
  });

  it('createProject 重置 savePath/saveStatus（新建后下次保存重新弹位置）', () => {
    useProjectStore.setState({
      savePath: '/tmp/project.json',
      saveStatus: 'saved',
    });
    useProjectStore.getState().createProject('landscape', 96);

    const st = useProjectStore.getState();
    expect(st.project.canvas).toEqual({ width: 1123, height: 794 });
    expect(st.savePath).toBeNull();
    expect(st.saveStatus).toBe('idle');
  });

  it('openProject 替换 project + 清空 undo/redo + 记录 savePath 且 saveStatus=saved', () => {
    // 先制造撤销/重做历史（两次编辑 + 一次撤销 → undo/redo 栈均非空）
    useProjectStore.getState().addPaper('M 0 0 L 1 0 L 0 1 Z');
    useProjectStore.getState().addPaper('M 2 2 L 3 2 L 2 3 Z');
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().undoStack.length).toBeGreaterThan(0);
    expect(useProjectStore.getState().redoStack.length).toBeGreaterThan(0);

    const opened = createEmptyProject(800, 600);
    opened.elements.push(
      createPaperElement({
        id: 'restored-paper',
        path: 'M 0 0 L 50 0 L 25 40 Z',
        color: '#7a8b5c',
        seed: 424242,
        transform: { x: 30, y: 40, rotation: 45, scaleX: 1.5, scaleY: 1 },
      }),
    );
    useProjectStore.getState().openProject(opened, '/opened/project.json');

    const st = useProjectStore.getState();
    expect(st.project).toEqual(opened);
    expect(st.project.elements[0].id).toBe('restored-paper');
    expect(st.savePath).toBe('/opened/project.json');
    expect(st.saveStatus).toBe('saved');
    expect(st.undoStack).toEqual([]);
    expect(st.redoStack).toEqual([]);
  });

  it('openProject 后 undo/redo no-op（打开 = 新历史起点，不回退到上个项目）', () => {
    const opened = createEmptyProject(400, 400);
    opened.elements.push(createPaperElement({ path: 'M 0 0 Z', color: '#000', seed: 1 }));
    useProjectStore.getState().openProject(opened, '/x.json');

    const st = useProjectStore.getState();
    st.undo();
    st.redo();

    expect(useProjectStore.getState().project).toEqual(opened);
    expect(useProjectStore.getState().undoStack).toEqual([]);
    expect(useProjectStore.getState().redoStack).toEqual([]);
  });
});

describe('projectStore（#48）— applyTextureProps 纹理编辑编排', () => {
  function texturedProject(): PaperProject {
    const project = createEmptyProject(1200, 800);
    project.textures.push(
      createPaperTexture({ id: 'tex-1', style: 'fold', seed: 42, color: '#7A8B5C', scale: 1, rotate: 0, dataUrl: 'data:OLD' }),
    );
    project.elements.push(
      createPaperElement({ id: 'paper-1', path: 'M 0 0 L 100 0 L 100 80 L 0 80 Z', color: '#7A8B5C', textureId: 'tex-1', textureScale: 1, seed: 42 }),
    );
    return project;
  }

  beforeEach(() => {
    useProjectStore.setState({ project: texturedProject(), undoStack: [], redoStack: [] });
  });

  it('编排 plan → resolve → apply → commit：record 与 element 同步更新，入撤销栈可回退', () => {
    useProjectStore.getState().applyTextureProps('paper-1', { color: '#ff0000' });
    const st = useProjectStore.getState();
    expect(st.project.textures[0].color).toBe('#ff0000');
    expect(st.project.elements[0].color).toBe('#ff0000');
    expect(st.project.textures[0].dataUrl).toContain('#ff0000'); // resolve 产物写回 record
    expect(st.undoStack).toHaveLength(1);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.textures[0].color).toBe('#7A8B5C');
  });

  it('防线 1：no-op 编辑（同色）不入撤销栈', () => {
    const undoLen = useProjectStore.getState().undoStack.length;
    useProjectStore.getState().applyTextureProps('paper-1', { color: '#7A8B5C' }); // 同色 no-op
    expect(useProjectStore.getState().undoStack).toHaveLength(undoLen);
  });

  it('防线 2：request 原样传 resolve——record.dataUrl 等于用 record 自身字段重组的 key', () => {
    useProjectStore.getState().applyTextureProps('paper-1', { scale: 2 });
    const tex = useProjectStore.getState().project.textures[0];
    // compose 按 request 编码 dataUrl；dataUrl 必须等于用 record 自身字段重组者（否则 key 漂移永 miss）
    expect(tex.dataUrl).toBe(`url:${tex.id}:${tex.color}:${tex.scale}:${tex.rotate}`);
    expect(tex.scale).toBe(2);
  });

  it('无纹理纸片纯色变更也走 action（color plan，不经 resolve）', () => {
    const plain = createEmptyProject(1200, 800);
    plain.elements.push(createPaperElement({ id: 'paper-1', path: 'M 0 0 Z', color: '#7A8B5C', seed: 42 }));
    useProjectStore.setState({ project: plain, undoStack: [], redoStack: [] });

    useProjectStore.getState().applyTextureProps('paper-1', { color: '#ff0000' });
    const st = useProjectStore.getState();
    expect(st.project.elements[0].color).toBe('#ff0000');
    expect(st.project.textures).toEqual([]); // 不产生纹理记录
    expect(st.undoStack).toHaveLength(1);
  });

  it('切换风格：新建变体 record，element 指向新 id，旧 record prune', () => {
    useProjectStore.getState().applyTextureProps('paper-1', { style: 'grain' });
    const st = useProjectStore.getState();
    const el = st.project.elements[0];
    expect(el.textureId).not.toBe('tex-1');
    const tex = st.project.textures.find((t) => t.id === el.textureId);
    expect(tex?.style).toBe('grain');
    expect(st.project.textures).toHaveLength(1); // 旧 tex-1 prune
  });
});
