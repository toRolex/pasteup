/**
 * 当前项目单一来源（Zustand）。
 *
 * 架构（issue #26 / implementation-plan §3.1）：React store 变化 → 命令式推送到 fabric；
 * fabric 事件 → 经桥接壳 onProjectChange 回灌 store.setProject（单向通信，不双向绑定）。
 * T4–T17 将在此 store 上持续扩展（底图 / 纸片数组 / 撤销栈等）。
 */
import { create } from 'zustand';
import {
  createEmptyProject,
  createPaperElement,
  DEFAULT_PAPER_COLOR,
  type PaperProject,
} from '../types/project';
import {
  createCanvasSize,
  DEFAULT_CANVAS_ORIENTATION,
  DEFAULT_CANVAS_RESOLUTION,
  type CanvasOrientation,
  type CanvasResolution,
} from '../types/canvasSize';

export interface ProjectStore {
  /** 当前项目（画布尺寸 / 底图 / 纸片 / 纹理）。 */
  project: PaperProject;
  /** 新建项目：按朝向 + 分辨率初始化 A4 画布，内容字段重置为空。 */
  createProject: (orientation: CanvasOrientation, resolution: CanvasResolution) => void;
  /** 替换当前项目（fabric 事件回灌通道；T4+ 撤销栈会包一层）。 */
  setProject: (project: PaperProject) => void;
  /** 设置或清除底图照片。 */
  setBackgroundPhoto: (dataUrl: string | null) => void;
  /** 追加一个描摹闭合的纸片到 elements 末尾（数组序即 z 序，后画在上层）。 */
  addPaper: (path: string, color?: string) => void;
}

/** 按朝向 + 分辨率创建 A4 空项目。 */
function createProjectFrom(
  orientation: CanvasOrientation,
  resolution: CanvasResolution,
): PaperProject {
  const size = createCanvasSize(orientation, resolution);
  return createEmptyProject(size.width, size.height);
}

/** 默认项目：竖版 A4 @300（2480×3508）。 */
export function createDefaultProject(): PaperProject {
  return createProjectFrom(DEFAULT_CANVAS_ORIENTATION, DEFAULT_CANVAS_RESOLUTION);
}

export const useProjectStore = create<ProjectStore>()((set) => ({
  project: createDefaultProject(),
  createProject: (orientation, resolution) =>
    set({ project: createProjectFrom(orientation, resolution) }),
  setProject: (project) => set({ project }),
  setBackgroundPhoto: (dataUrl) =>
    set((state) => ({
      project: { ...state.project, bgPhoto: dataUrl ? { dataUrl, visible: true } : null },
    })),
  addPaper: (path, color = DEFAULT_PAPER_COLOR) =>
    set((state) => ({
      project: {
        ...state.project,
        elements: [...state.project.elements, createPaperElement({ path, color })],
      },
    })),
}));
