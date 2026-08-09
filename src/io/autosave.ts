/**
 * T12 — 无感自动保存控制器。
 *
 * 纯逻辑 + 依赖注入（计时器/写盘/对话框注入），App 负责把它接到 store 订阅。
 *
 * 契约：
 * - `schedule()`：改动触发 → 防抖（默认 500ms）后写盘；连续改动重置计时器。
 * - 首次保存：savePath 为空 → 弹保存对话框选位置；选择后记录路径并写盘。
 *   用户取消 → 本次不写、保持未保存（下次改动再弹），不循环骚扰。
 * - 后续保存：静默覆盖同一文件，不重复弹窗。
 * - in-flight 补写：写盘进行中又产生改动 → 当前写盘完成后补写一次（内容为新状态），
 *   避免丢改动。
 * - `flush()`：手动「保存」立即写盘（无视防抖）。
 * - `dispose()`：组件卸载取消未到期写盘。
 */
import type { SaveStatus } from '../store/projectStore';
import type { PaperProject } from '../types/project';

export interface AutosaveDeps {
  /** 防抖毫秒数；默认 500。 */
  debounceMs?: number;
  /** 当前项目（写盘时读取最新状态）。 */
  getProject: () => PaperProject;
  /** 当前项目文件路径；null = 尚未选择位置。 */
  getSavePath: () => string | null;
  /** 首次选择位置后记录路径。 */
  onSavePath: (path: string) => void;
  /** 写盘状态上报（驱动 UI 指示）。 */
  onSaveStatus: (status: SaveStatus) => void;
  /** 弹「另存为」对话框选位置；取消返回 null。 */
  pickSavePath: () => Promise<string | null>;
  /** 序列化并写入文件。 */
  writeProjectFile: (path: string, project: PaperProject) => Promise<void>;
}

export interface AutosaveController {
  /** 改动触发：防抖后写盘（已有 pending 计时器则重置）。 */
  schedule: () => void;
  /** 立即写盘一次（手动「保存」按钮；无视防抖）。 */
  flush: () => Promise<void>;
  /** 取消未到期写盘（组件卸载）。 */
  dispose: () => void;
}

export function createAutosaveController(deps: AutosaveDeps): AutosaveController {
  const debounceMs = deps.debounceMs ?? 500;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saving = false;
  let dirty = false;

  function schedule(): void {
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, debounceMs);
  }

  async function run(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    // 写盘进行中又 schedule：置 dirty，由当前 run 的 while 循环在完成后补写。
    if (saving) {
      dirty = true;
      return;
    }
    saving = true;
    try {
      while (dirty) {
        dirty = false;
        await doSave();
      }
    } finally {
      saving = false;
    }
  }

  async function doSave(): Promise<void> {
    let path = deps.getSavePath();
    if (!path) {
      path = await deps.pickSavePath();
      if (!path) {
        // 用户取消首次位置选择：保持未保存；下次改动再弹
        deps.onSaveStatus('idle');
        return;
      }
      deps.onSavePath(path);
    }
    const project = deps.getProject();
    deps.onSaveStatus('saving');
    try {
      await deps.writeProjectFile(path, project);
      deps.onSaveStatus('saved');
    } catch {
      deps.onSaveStatus('error');
    }
  }

  async function flush(): Promise<void> {
    dirty = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    await run();
  }

  function dispose(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return { schedule, flush, dispose };
}
