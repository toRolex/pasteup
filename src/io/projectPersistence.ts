/**
 * 项目持久化（projectPersistence）— 保存链路收拢 module（#60 / #52 Q1）。
 *
 * 把「改动防抖写盘 + 打开 round-trip」收拢为外层窄 interface：
 * `createProjectPersistence(deps) → { save, open, schedule, dispose }`。
 *
 * deps 两个窄 adapter 由 App 组装时投影（store 投影既有 store 导出，file 投影
 * io/projectFile 导出）：
 * - store：{ getProject, getSavePath, setSavePath, setSaveStatus, open }
 * - file：{ pickSavePath, pickOpenPath, writeProjectFile, readProjectFile }
 *
 * 内部保留 createAutosaveController 独立实例（防抖/首存弹位置/in-flight 补写/flush
 * 语义不变，不重写 autosave 内部）+ open 编排闭包。subscribe 不收进 module
 * （#52 Q4：避免依赖 store 订阅形状、破坏 adapter 抽象），壳保留一行订阅 →
 * schedule()。打开后 store 替换 project → 订阅触发 schedule → 一次无害写回
 * （内容=磁盘内容）属预期行为（#52 Q5 / T12）。
 */
import type { SaveStatus } from '../store/projectStore';
import type { PaperProject } from '../types/project';
import { createAutosaveController } from './autosave';

/** store 窄 adapter：写盘/打开所需的最小 store 面（App 投影 useProjectStore 导出）。 */
export interface ProjectPersistenceStore {
  getProject: () => PaperProject;
  getSavePath: () => string | null;
  setSavePath: (path: string) => void;
  setSaveStatus: (status: SaveStatus) => void;
  /** 打开 round-trip：替换项目 + 记录路径 + saveStatus 置 saved（store 侧 openProject）。 */
  open: (project: PaperProject, path: string) => void;
}

/** file 窄 adapter：项目文件读写 + 对话框（App 投影 io/projectFile 导出）。 */
export interface ProjectPersistenceFile {
  pickSavePath: () => Promise<string | null>;
  pickOpenPath: () => Promise<string | null>;
  writeProjectFile: (path: string, project: PaperProject) => Promise<void>;
  readProjectFile: (path: string) => Promise<PaperProject>;
}

export interface ProjectPersistenceDeps {
  store: ProjectPersistenceStore;
  file: ProjectPersistenceFile;
}

export interface ProjectPersistence {
  /** 手动保存：立即写盘（无视防抖；首次保存仍弹位置选择）。 */
  save: () => Promise<void>;
  /** 打开项目：选文件 → 读取 → store.open；reject 传播由壳 catch 设 fileError。 */
  open: () => Promise<void>;
  /** 改动触发：防抖后写盘（壳订阅 store 项目变化时调用）。 */
  schedule: () => void;
  /** 取消未到期写盘（壳卸载）。 */
  dispose: () => void;
}

export function createProjectPersistence(deps: ProjectPersistenceDeps): ProjectPersistence {
  const autosave = createAutosaveController({
    getProject: deps.store.getProject,
    getSavePath: deps.store.getSavePath,
    onSavePath: deps.store.setSavePath,
    onSaveStatus: deps.store.setSaveStatus,
    pickSavePath: deps.file.pickSavePath,
    writeProjectFile: deps.file.writeProjectFile,
  });

  async function open(): Promise<void> {
    const path = await deps.file.pickOpenPath();
    if (!path) return;
    const project = await deps.file.readProjectFile(path);
    deps.store.open(project, path);
  }

  return {
    save: () => autosave.flush(),
    open,
    schedule: () => autosave.schedule(),
    dispose: () => autosave.dispose(),
  };
}
