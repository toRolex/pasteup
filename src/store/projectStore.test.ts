import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createPaperElement, createPaperTexture, createEmptyProject, type PaperProject } from '../types/project';
import { useProjectStore } from './projectStore';

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
    // 逐例隔离：createProject 重置项目（默认 A4@300）+ history.clear()（私有历史不跨用例堆积）
    useProjectStore.getState().createProject('portrait', 300);
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

describe('projectStore（T11 seam）— 图层重排 reorderElements', () => {
  beforeEach(() => {
    // 逐例隔离：重置项目 + history.clear()
    useProjectStore.getState().createProject('portrait', 300);
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

  it('reorderElements 栈顶变更后 redo no-op（新重排清空重做栈）', () => {
    useProjectStore.getState().addPaper('M 0 0 L 1 0 L 0 1 Z');
    useProjectStore.getState().addPaper('M 1 1 L 2 1 L 1 2 Z');
    useProjectStore.getState().addPaper('M 2 2 L 3 2 L 2 3 Z');
    const ids = useProjectStore.getState().project.elements.map((e) => e.id);
    // 制造可重做历史：reorderElements → undo
    useProjectStore.getState().reorderElements(ids[0]!, 'top');
    useProjectStore.getState().undo();

    // 新重排应清空重做栈：redo 变 no-op（不回放旧重排 A→top 的结果 [B,C,A]）
    useProjectStore.getState().reorderElements(ids[1]!, 'up');
    const afterNew = useProjectStore.getState().project.elements.map((e) => e.id);
    expect(afterNew).toEqual([ids[0], ids[2], ids[1]]); // B 上移 → [A,C,B]
    useProjectStore.getState().redo();
    expect(useProjectStore.getState().project.elements.map((e) => e.id)).toEqual(afterNew);
  });

  it('边界 no-op（已在最顶层 moveToTop）不产生独立撤销记录', () => {
    useProjectStore.getState().addPaper('M 0 0 L 1 0 L 0 1 Z');
    useProjectStore.getState().addPaper('M 1 1 L 2 1 L 1 2 Z');
    const topId = useProjectStore.getState().project.elements[1]!.id;

    useProjectStore.getState().reorderElements(topId, 'top'); // 已在末尾 → no-op
    // 一次 undo 应回退最后一条真实编辑（addPaper-2）→ 只剩 1 片；若 no-op 入栈则 undo 停在 2 片
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.elements).toHaveLength(1);
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
    // 逐例隔离：重置项目（默认 A4@300）+ 历史清空 + savePath=null/saveStatus=idle
    useProjectStore.getState().createProject('portrait', 300);
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

  it('openProject 替换 project + 记录 savePath/saveStatus（打开 = 新历史起点）', () => {
    // 先制造撤销/重做历史
    useProjectStore.getState().addPaper('M 0 0 L 1 0 L 0 1 Z');
    useProjectStore.getState().addPaper('M 2 2 L 3 2 L 2 3 Z');
    useProjectStore.getState().undo();

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
    // 历史已清空：undo/redo no-op，不回退到上个项目
    st.undo();
    st.redo();
    expect(useProjectStore.getState().project).toEqual(opened);
  });

  it('openProject 后 undo/redo no-op（打开 = 新历史起点，不回退到上个项目）', () => {
    const opened = createEmptyProject(400, 400);
    opened.elements.push(createPaperElement({ path: 'M 0 0 Z', color: '#000', seed: 1 }));
    useProjectStore.getState().openProject(opened, '/x.json');

    const st = useProjectStore.getState();
    st.undo();
    st.redo();

    expect(useProjectStore.getState().project).toEqual(opened);
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
    // 逐例隔离：先清历史（createProject）再置自定义项目
    useProjectStore.getState().createProject('portrait', 300);
    useProjectStore.setState({ project: texturedProject() });
  });

  it('编排 plan → resolve → apply → commit：record 与 element 同步更新，可撤销回退', () => {
    useProjectStore.getState().applyTextureProps('paper-1', { color: '#ff0000' });
    const st = useProjectStore.getState();
    expect(st.project.textures[0].color).toBe('#ff0000');
    expect(st.project.elements[0].color).toBe('#ff0000');
    expect(st.project.textures[0].dataUrl).toContain('#ff0000'); // resolve 产物写回 record

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.textures[0].color).toBe('#7A8B5C');
  });

  it('防线 1：no-op 编辑（同色）不产生独立撤销记录', () => {
    // 先做一次真实编辑建立基线，再点同色 no-op
    useProjectStore.getState().applyTextureProps('paper-1', { color: '#ff0000' });
    useProjectStore.getState().applyTextureProps('paper-1', { color: '#ff0000' }); // 同色 no-op
    // 一次 undo 应回退真实编辑（→ #7A8B5C）；若 no-op 入栈则 undo 停在 #ff0000
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.textures[0].color).toBe('#7A8B5C');
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
    useProjectStore.setState({ project: plain });

    useProjectStore.getState().applyTextureProps('paper-1', { color: '#ff0000' });
    const st = useProjectStore.getState();
    expect(st.project.elements[0].color).toBe('#ff0000');
    expect(st.project.textures).toEqual([]); // 不产生纹理记录
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.elements[0].color).toBe('#7A8B5C');
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
