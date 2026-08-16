/**
 * 当前项目单一来源（Zustand）。
 *
 * 架构（issue #26 / implementation-plan §3.1）：React store 变化 → 命令式推送到 fabric；
 * fabric 事件 → 经桥接壳 onProjectChange 回灌 store（单向通信，不双向绑定）。
 * 撤销/重做（#50）：双栈私有化进泛型 History module（`src/store/history.ts`），移出 Zustand
 * state（非反应式，无 canUndo/canRedo 订阅，栈私有化安全）。统一编辑入口 commitProject：
 * no-op 识别（引用比较 + diffProject）先于 history.record，留在 store 侧；transform 回灌 /
 * addPaper / reorder / 底图开关不传 coalesce hint（离散动作永不合并）；PropertyPanel 滑杆
 * 手势传 hint（同 gestureId 合并为一条撤销记录）。
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
import { createHistory, type EditHint } from './history';

/**
 * 保存状态（T12）：idle 未保存（尚无文件位置）/ saving 写盘中 / saved 已保存 /
 * error 上次写盘失败。打开项目后置为 saved（刚读入磁盘内容）。
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface ProjectStore {
  /** 当前项目（画布尺寸 / 底图 / 纸片 / 纹理）。 */
  project: PaperProject;
  /** 当前项目文件路径；null 表示尚未选择位置（首次保存需弹保存对话框）。 */
  savePath: string | null;
  /** 自动保存状态（驱动顶栏「已保存/保存中」指示）。 */
  saveStatus: SaveStatus;
  /** 新建项目：按朝向 + 分辨率初始化 A4 画布，内容字段重置为空，历史清空（新项目新历史）。 */
  createProject: (orientation: CanvasOrientation, resolution: CanvasResolution) => void;
  /**
   * 统一编辑入口：no-op 识别（引用比较 + diffProject `'none'`）先于 history.record，不入历史；
   * 否则 record 编辑前快照后替换项目。hint 可选：滑杆手势传 coalesceKey（同手势合并为一条）。
   */
  commitProject: (project: PaperProject, hint?: EditHint) => void;
  /** 撤销：委托 History（问 History 要快照再 set({project})）；空栈 no-op。 */
  undo: () => void;
  /** 重做：对称委托 History；空栈 no-op。 */
  redo: () => void;
  /** 设置或清除底图照片（走撤销历史）。 */
  setBackgroundPhoto: (dataUrl: string | null) => void;
  /** 切换底图可见性（走撤销历史）；无底图时 no-op。 */
  toggleBackgroundPhoto: () => void;
  /** 追加一个描摹闭合的纸片到 elements 末尾（数组序即 z 序，后画在上层；走撤销历史）。 */
  addPaper: (path: string, color?: string) => void;
  /** 重排纸片 z 序（数组序即 z 序；走撤销历史；边界 no-op 自动不入历史）。 */
  reorderElements: (id: string, op: 'up' | 'down' | 'top' | 'bottom') => void;
  /**
   * 纹理属性编辑（#48）：编排 plan → resolve → apply → commitProject。
   * 两道防线：plan 判 no-op → 直接返回不入撤销栈（引用相等）；plan 产出的 request 原样传
   * resolve 并写回 record（重建即 key 漂移缓存永 miss）。resolve 侧只声明窄 interface。
   * hint 可选：滑杆手势传 coalesceKey（同手势合并为一条）。
   */
  applyTextureProps: (elementId: string, patch: TexturePropertyPatch, hint?: EditHint) => void;
  /** 记录当前项目文件路径（首次保存后 / 打开项目后调用）。 */
  setSavePath: (path: string | null) => void;
  /** 记录自动保存状态（驱动 UI 指示）。 */
  setSaveStatus: (status: SaveStatus) => void;
  /**
   * 打开项目：替换 project + history.clear()（打开 = 新历史起点）+
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
 * elements），历史栈内快照须与新状态隔离——复制容器与嵌套普通对象，元素对象可复用引用
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

export const useProjectStore = create<ProjectStore>()((set, get) => {
  // History 实例随 store 单例共生（create() 回调内 new），不做模块级单例（防跨测试污染）。
  const history = createHistory<PaperProject>({ snapshot: snapshotProject });

  /**
   * 统一编辑提交：no-op 识别（引用比较 + diffProject `'none'`）先于 history.record，留 store 侧
   * （依赖 project 各字段引用，不进 History）；否则 record 编辑前快照后替换 project。
   * 失效判定单点化（#47）：diffProject `'none'` → no-op 不入栈（避免回灌空提交；T11 layerOps
   * 边界 no-op 返回同引用也经此识别，例如已在末尾再调 moveToTop）。`'bg-only'`（仅底图 visible
   * 翻转）≠ `'none'`，仍入历史。
   */
  const commitEdit = (
    state: ProjectStore,
    next: PaperProject,
    hint?: EditHint,
  ): Partial<ProjectStore> => {
    if (state.project === next) return {};
    if (diffProject(state.project, next) === 'none') return {};
    history.record(state.project, hint);
    return { project: next };
  };

  return {
    project: createDefaultProject(),
    savePath: null,
    saveStatus: 'idle',
    createProject: (orientation, resolution) => {
      history.clear();
      set({
        project: createProjectFrom(orientation, resolution),
        // 新项目无文件位置：首次保存需重新弹保存对话框
        savePath: null,
        saveStatus: 'idle',
      });
    },
    commitProject: (next, hint) => set((state) => commitEdit(state, next, hint)),
    undo: () => {
      const prev = history.undo(get().project);
      if (prev) set({ project: prev });
    },
    redo: () => {
      const next = history.redo(get().project);
      if (next) set({ project: next });
    },
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
        // layerOps 边界 no-op 返回同引用 → commitEdit 自动识别 no-op 不入历史
        return commitEdit(state, { ...state.project, elements: nextElements });
      }),
    applyTextureProps: (elementId, patch, hint) => {
      // resolve 侧窄 interface（#48 Q1）：projectStore 只声明同步合成一侧
      const resolver: TextureResolveSide = textureSupply;
      const plan = planTextureProps(get().project, elementId, patch);
      // 防线 1：no-op 引用相等 → 不入撤销栈（不 commitProject）
      if (plan.kind === 'noop') return;
      // 防线 2：plan 产出的 request 原样传 resolve（重建即 key 漂移缓存永 miss）
      const dataUrl = plan.kind === 'texture' ? resolver.resolve(plan.request) : null;
      set((state) =>
        commitEdit(state, applyTexturePlan(state.project, elementId, plan, dataUrl), hint),
      );
    },
    setSavePath: (path) => set({ savePath: path }),
    setSaveStatus: (status) => set({ saveStatus: status }),
    openProject: (project, savePath) => {
      history.clear();
      set({ project, savePath, saveStatus: 'saved' });
    },
  };
});
