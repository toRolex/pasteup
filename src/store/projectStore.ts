/**
 * 当前项目单一来源（Zustand）。
 *
 * 架构（issue #26 / implementation-plan §3.1）：React store 变化 → 命令式推送到 fabric；
 * fabric 事件 → 经桥接壳 onProjectChange 回灌 store（单向通信，不双向绑定）。
 * T9（issue #32）：撤销/重做基建——所有编辑操作走统一入口 commitProject（push 编辑前
 * 快照到 undoStack、清空 redoStack）；undo/redo 内部用 setProject 恢复（不再 push 栈）。
 * setProject 保留为原始回灌/恢复通道，不写撤销历史。
 */
import { create } from 'zustand';
import {
  createEmptyProject,
  createPaperElement,
  DEFAULT_PAPER_COLOR,
  type PaperProject,
} from '../types/project';
import { moveDown, moveToBottom, moveToTop, moveUp } from './layerOps';
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
  /** 撤销栈：每次编辑 push「编辑前」项目快照（栈顶 = 最近一次编辑前状态）。 */
  undoStack: PaperProject[];
  /** 重做栈：undo 时把当前状态 push 进来；新编辑（栈顶变更）后清空。 */
  redoStack: PaperProject[];
  /** 新建项目：按朝向 + 分辨率初始化 A4 画布，内容字段重置为空，撤销/重做历史清空。 */
  createProject: (orientation: CanvasOrientation, resolution: CanvasResolution) => void;
  /** 替换当前项目（原始回灌/恢复通道；不写撤销历史——undo/redo 内部用它恢复）。 */
  setProject: (project: PaperProject) => void;
  /** 统一编辑入口：push 编辑前快照到 undoStack、清空 redoStack，然后替换项目。 */
  commitProject: (project: PaperProject) => void;
  /** 撤销：空栈 no-op；把当前状态 push 到 redoStack，恢复 undoStack 栈顶快照。 */
  undo: () => void;
  /** 重做：空栈 no-op；把当前状态 push 到 undoStack，恢复 redoStack 栈顶快照。 */
  redo: () => void;
  /** 设置或清除底图照片（走撤销历史）。 */
  setBackgroundPhoto: (dataUrl: string | null) => void;
  /** 切换底图可见性（走撤销历史）；无底图时 no-op。 */
  toggleBackgroundPhoto: () => void;
  /** 追加一个描摹闭合的纸片到 elements 末尾（数组序即 z 序，后画在上层；走撤销历史）。 */
  addPaper: (path: string, color?: string) => void;
  /** 重排纸片 z 序（数组序即 z 序；走撤销历史；边界 no-op 自动不入栈）。 */
  reorderElements: (id: string, op: 'up' | 'down' | 'top' | 'bottom') => void;
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

/**
 * 项目快照（结构浅拷贝）：project 含嵌套数组与对象（dataURL 字符串、bgPhoto、textures、
 * elements），栈内快照须与新状态隔离——复制容器与嵌套普通对象，元素对象可复用引用
 * （全部编辑走不可变更新，不原地修改元素，故引用共享安全）。
 */
function snapshotProject(project: PaperProject): PaperProject {
  return {
    ...project,
    canvas: { ...project.canvas },
    bgPhoto: project.bgPhoto ? { ...project.bgPhoto } : null,
    textures: project.textures.map((t) => ({ ...t })),
    elements: project.elements.map((e) => ({ ...e, transform: { ...e.transform } })),
  };
}

/**
 * 统一编辑提交：push 编辑前快照到 undoStack、清空 redoStack（栈顶变更）、替换 project。
 * 传同一对象引用视为 no-op（避免回灌空提交）。
 * elements 数组引用未变 → 也视为 no-op（T11 layerOps 边界 no-op：用户操作已到达目标位置，
 * 例如已在末尾再调 moveToTop → 不应入撤销栈）。
 */
function commitEdit(
  state: ProjectStore,
  next: PaperProject,
): Partial<ProjectStore> {
  if (state.project === next) return {};
  if (
    state.project.elements === next.elements &&
    state.project.canvas === next.canvas &&
    state.project.bgPhoto === next.bgPhoto &&
    state.project.textures === next.textures
  ) {
    return {};
  }
  return {
    project: next,
    undoStack: [...state.undoStack, snapshotProject(state.project)],
    redoStack: [],
  };
}

export const useProjectStore = create<ProjectStore>()((set) => ({
  project: createDefaultProject(),
  undoStack: [],
  redoStack: [],
  createProject: (orientation, resolution) =>
    set({ project: createProjectFrom(orientation, resolution), undoStack: [], redoStack: [] }),
  setProject: (project) => set({ project }),
  commitProject: (next) => set((state) => commitEdit(state, next)),
  undo: () =>
    set((state) => {
      const prev = state.undoStack[state.undoStack.length - 1];
      if (!prev) return {};
      return {
        project: prev,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, snapshotProject(state.project)],
      };
    }),
  redo: () =>
    set((state) => {
      const next = state.redoStack[state.redoStack.length - 1];
      if (!next) return {};
      return {
        project: next,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, snapshotProject(state.project)],
      };
    }),
  setBackgroundPhoto: (dataUrl) =>
    set((state) =>
      commitEdit(state, {
        ...state.project,
        bgPhoto: dataUrl ? { dataUrl, visible: true } : null,
      }),
    ),
  toggleBackgroundPhoto: () =>
    set((state) => {
      const bg = state.project.bgPhoto;
      if (!bg) return {};
      return commitEdit(state, { ...state.project, bgPhoto: { ...bg, visible: !bg.visible } });
    }),
  addPaper: (path, color = DEFAULT_PAPER_COLOR) =>
    set((state) =>
      commitEdit(state, {
        ...state.project,
        elements: [...state.project.elements, createPaperElement({ path, color })],
      }),
    ),
  reorderElements: (id, op) =>
    set((state) => {
      const compute =
        op === 'up'
          ? moveUp
          : op === 'down'
            ? moveDown
            : op === 'top'
              ? moveToTop
              : moveToBottom;
      const nextElements = compute(state.project.elements, id);
      // layerOps 边界 no-op 返回同引用 → commitEdit 自动识别 no-op 不入栈
      return commitEdit(state, { ...state.project, elements: nextElements });
    }),
}));
