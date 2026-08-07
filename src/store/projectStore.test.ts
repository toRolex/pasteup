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

  it('setProject 替换当前 project（fabric 事件回灌通道）', () => {
    const next = { ...useProjectStore.getState().project, canvas: { width: 100, height: 200 } };
    useProjectStore.getState().setProject(next);
    expect(useProjectStore.getState().project.canvas).toEqual({ width: 100, height: 200 });
  });
});
