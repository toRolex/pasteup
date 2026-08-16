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
  diffProject,
  type PaperProject,
} from '../types/project';
import { moveDown, moveToBottom, moveToTop, moveUp } from './layerOps';
import {
  applyTexturePlan,
  planTextureProps,
  type TexturePropertyPatch,
} from '../components/panels/propertyEdit';
import { textureSupply, type TextureResolveSide } from '../texture/supply';
import {
  createCanvasSize,
  DEFAULT_CANVAS_ORIENTATION,
  DEFAULT_CANVAS_RESOLUTION,
  type CanvasOrientation,
  type CanvasResolution,
} from '../types/canvasSize';

/**
 * 保存状态（T12）：idle 未保存（尚无文件位置）/ saving 写盘中 / saved 已保存 /
 * error 上次写盘失败。打开项目后置为 saved（刚读入磁盘内容）。
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface ProjectStore {
  /** 当前项目（画布尺寸 / 底图 / 纸片 / 纹理）。 */
  project: PaperProject;
  /** 撤销栈：每次编辑 push「编辑前」项目快照（栈顶 = 最近一次编辑前状态）。 */
  undoStack: PaperProject[];
  /** 重做栈：undo 时把当前状态 push 进来；新编辑（栈顶变更）后清空。 */
  redoStack: PaperProject[];
  /** 当前项目文件路径；null 表示尚未选择位置（首次保存需弹保存对话框）。 */
  savePath: string | null;
  /** 自动保存状态（驱动顶栏「已保存/保存中」指示）。 */
  saveStatus: SaveStatus;
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
  /**
   * 纹理属性编辑（#48）：编排 plan → resolve → apply → commitProject。
   * 两道防线：plan 判 no-op → 直接返回不入撤销栈（引用相等）；plan 产出的 request 原样传
   * resolve 并写回 record（重建即 key 漂移缓存永 miss）。resolve 侧只声明窄 interface。
   */
  applyTextureProps: (elementId: string, patch: TexturePropertyPatch) => void;
  /** 记录当前项目文件路径（首次保存后 / 打开项目后调用）。 */
  setSavePath: (path: string | null) => void;
  /** 记录自动保存状态（驱动 UI 指示）。 */
  setSaveStatus: (status: SaveStatus) => void;
  /**
   * 打开项目：替换 project + 清空撤销/重做栈（打开 = 新历史起点）+
   * 记录打开文件路径 + saveStatus 置 saved（内容即磁盘内容）。
   */
  openProject: (project: PaperProject, savePath: string) => void;
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
 * 失效判定单点化（#47）：走 schema 层 diffProject，`'none'`（core+bgPhoto 四引用全相等）→
 * no-op 不入栈（避免回灌空提交；T11 layerOps 边界 no-op 返回同引用也经此识别，例如已在末尾
 * 再调 moveToTop）。`'bg-only'`（仅底图 visible 翻转）≠ `'none'`，仍入撤销栈。
 */
function commitEdit(
  state: ProjectStore,
  next: PaperProject,
): Partial<ProjectStore> {
  if (state.project === next) return {};
  if (diffProject(state.project, next) === 'none') return {};
  return {
    project: next,
    undoStack: [...state.undoStack, snapshotProject(state.project)],
    redoStack: [],
  };
}

export const useProjectStore = create<ProjectStore>()((set, get) => ({
  project: createDefaultProject(),
  undoStack: [],
  redoStack: [],
  savePath: null,
  saveStatus: 'idle',
  createProject: (orientation, resolution) =>
    set({
      project: createProjectFrom(orientation, resolution),
      undoStack: [],
      redoStack: [],
      // 新项目无文件位置：首次保存需重新弹保存对话框
      savePath: null,
      saveStatus: 'idle',
    }),
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
  applyTextureProps: (elementId, patch) => {
    // resolve 侧窄 interface（#48 Q1）：projectStore 只声明同步合成一侧
    const resolver: TextureResolveSide = textureSupply;
    const plan = planTextureProps(get().project, elementId, patch);
    // 防线 1：no-op 引用相等 → 不入撤销栈（不 commitProject）
    if (plan.kind === 'noop') return;
    // 防线 2：plan 产出的 request 原样传 resolve（重建即 key 漂移缓存永 miss）
    const dataUrl = plan.kind === 'texture' ? resolver.resolve(plan.request) : null;
    set((state) => commitEdit(state, applyTexturePlan(state.project, elementId, plan, dataUrl)));
  },
  setSavePath: (path) => set({ savePath: path }),
  setSaveStatus: (status) => set({ saveStatus: status }),
  openProject: (project, savePath) =>
    set({
      project,
      savePath,
      saveStatus: 'saved',
      undoStack: [],
      redoStack: [],
    }),
}));
