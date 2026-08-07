import { describe, expect, it, beforeEach } from 'vitest';
import {
  createDefaultProject,
  useProjectStore,
} from './projectStore';

describe('projectStore（seam S2）— 当前项目单一来源', () => {
  beforeEach(() => {
    // 每例重置回默认项目，避免单例跨用例污染
    useProjectStore.setState({ project: createDefaultProject() });
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
