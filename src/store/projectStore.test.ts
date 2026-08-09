import { describe, expect, it, beforeEach } from 'vitest';
import { createPaperElement } from '../types/project';
import {
  createDefaultProject,
  useProjectStore,
} from './projectStore';

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
