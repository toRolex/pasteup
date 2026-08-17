/**
 * 项目持久化（projectPersistence）— 保存链路收拢 module 的外部接线测试。
 *
 * 只覆盖 module interface 契约（#52 Q6）：deps 组装、store adapter 契约、
 * subscribe→schedule 路由、open 编排（调 file + store.open + reject 传播）、
 * save()=flush 语义（含首次弹位置）。mock deps（轻函数），不依赖 store 模块形状
 * 与 Tauri 运行时；autosave 内部深时序仍在 autosave.test.ts 覆盖。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, createPaperElement, type PaperProject } from '../types/project';
import type { SaveStatus } from '../store/projectStore';
import { createProjectPersistence } from './projectPersistence';

/** 构造一个可区分版本的项目（element id 含 marker）。 */
function makeProject(marker: string): PaperProject {
  const project = createEmptyProject(100, 100);
  project.elements.push(
    createPaperElement({
      id: `el-${marker}`,
      path: 'M 0 0 L 1 0 L 0 1 Z',
      color: '#000',
      seed: 1,
    }),
  );
  return project;
}

/** 模拟 store 窄 adapter 的轻量状态容器（含订阅，验证壳式 subscribe→schedule 路由）。 */
interface FakeStoreState {
  project: PaperProject;
  savePath: string | null;
  saveStatus: SaveStatus;
}
type StoreListener = (state: FakeStoreState, prev: FakeStoreState) => void;

function createFakeStore() {
  let state: FakeStoreState = {
    project: makeProject('a'),
    savePath: null,
    saveStatus: 'idle',
  };
  const listeners = new Set<StoreListener>();
  const set = (next: Partial<FakeStoreState>) => {
    const prev = state;
    state = { ...state, ...next };
    listeners.forEach((fn) => fn(state, prev));
  };
  return {
    getProject: () => state.project,
    getSavePath: () => state.savePath,
    setSavePath: vi.fn((path: string) => set({ savePath: path })),
    setSaveStatus: vi.fn((status: SaveStatus) => set({ saveStatus: status })),
    open: vi.fn((project: PaperProject, path: string) =>
      set({ project, savePath: path, saveStatus: 'saved' }),
    ),
    subscribe: (fn: StoreListener) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    set,
    get state() {
      return state;
    },
  };
}

/** 模拟 file 窄 adapter（默认首存弹位置返回路径；打开对话框默认取消）。 */
function createFakeFile() {
  return {
    pickSavePath: vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValue('/tmp/selected.json'),
    pickOpenPath: vi.fn<() => Promise<string | null>>().mockResolvedValue(null),
    writeProjectFile: vi
      .fn<(path: string, project: PaperProject) => Promise<void>>()
      .mockResolvedValue(undefined),
    readProjectFile: vi
      .fn<(path: string) => Promise<PaperProject>>()
      .mockResolvedValue(makeProject('b')),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('projectPersistence deps 组装（#52 Q1）', () => {
  it('接受 store/file 窄 adapter，返回 { save, open, schedule, dispose } 四方法', () => {
    const store = createFakeStore();
    const file = createFakeFile();

    const persistence = createProjectPersistence({ store, file });

    expect(typeof persistence.save).toBe('function');
    expect(typeof persistence.open).toBe('function');
    expect(typeof persistence.schedule).toBe('function');
    expect(typeof persistence.dispose).toBe('function');
  });
});

describe('projectPersistence store adapter 契约', () => {
  it('写盘读 store.getProject / getSavePath，状态经 setSaveStatus（saving→saved）上报', async () => {
    const store = createFakeStore();
    store.set({ savePath: '/tmp/p.json' });
    const file = createFakeFile();
    const persistence = createProjectPersistence({ store, file });

    persistence.schedule();
    await vi.advanceTimersByTimeAsync(500);

    expect(file.writeProjectFile).toHaveBeenCalledTimes(1);
    expect(file.writeProjectFile).toHaveBeenCalledWith('/tmp/p.json', store.getProject());
    expect(store.setSaveStatus).toHaveBeenCalledWith('saving');
    expect(store.setSaveStatus).toHaveBeenLastCalledWith('saved');
  });

  it('首存（savePath 为空）→ 弹位置后经 setSavePath 记录路径，再写盘', async () => {
    const store = createFakeStore(); // savePath null
    const file = createFakeFile(); // pickSavePath → '/tmp/selected.json'
    const persistence = createProjectPersistence({ store, file });

    persistence.schedule();
    await vi.advanceTimersByTimeAsync(500);

    expect(file.pickSavePath).toHaveBeenCalledTimes(1);
    expect(store.setSavePath).toHaveBeenCalledWith('/tmp/selected.json');
    expect(file.writeProjectFile).toHaveBeenCalledWith('/tmp/selected.json', store.getProject());
  });
});

describe('projectPersistence subscribe → schedule 路由（#52 Q4：订阅留壳）', () => {
  it('壳式订阅：仅项目变化触发 schedule → 防抖写盘一次（saveStatus 变化不触发）', async () => {
    const store = createFakeStore();
    store.set({ savePath: '/tmp/p.json' });
    const file = createFakeFile();
    const persistence = createProjectPersistence({ store, file });

    // 壳保留的一行订阅（projectPersistence 不收 subscribe，靠 mock store 订阅形状验证路由）
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.project !== prev.project) persistence.schedule();
    });

    // 连续改动：只在静默期后写盘一次，内容为最新状态
    store.set({ project: makeProject('b') });
    await vi.advanceTimersByTimeAsync(100);
    store.set({ project: makeProject('c') });
    await vi.advanceTimersByTimeAsync(600);

    expect(file.writeProjectFile).toHaveBeenCalledTimes(1);
    expect(file.writeProjectFile).toHaveBeenCalledWith('/tmp/p.json', store.getProject());

    // 写盘过程 saveStatus 变化（saving/saved）不重复触发 schedule
    const writeCallsAfterStatus = file.writeProjectFile.mock.calls.length;
    expect(writeCallsAfterStatus).toBe(1);

    unsubscribe();
  });
});

describe('projectPersistence open 编排（调 file + store.open + reject 传播）', () => {
  it('打开：pickOpenPath → readProjectFile → store.open（project/savePath/saveStatus 更新）', async () => {
    const store = createFakeStore();
    const file = createFakeFile();
    file.pickOpenPath.mockResolvedValue('/tmp/project.json');
    const opened = makeProject('restored');
    file.readProjectFile.mockResolvedValue(opened);
    const persistence = createProjectPersistence({ store, file });

    await persistence.open();

    expect(file.pickOpenPath).toHaveBeenCalledTimes(1);
    expect(file.readProjectFile).toHaveBeenCalledWith('/tmp/project.json');
    expect(store.open).toHaveBeenCalledWith(opened, '/tmp/project.json');
    expect(store.state.project).toEqual(opened);
    expect(store.state.savePath).toBe('/tmp/project.json');
    expect(store.state.saveStatus).toBe('saved');
  });

  it('打开取消（pickOpenPath 返回 null）→ 不读文件、不调 store.open、项目引用不变', async () => {
    const store = createFakeStore();
    const file = createFakeFile();
    file.pickOpenPath.mockResolvedValue(null);
    const persistence = createProjectPersistence({ store, file });

    const projectBefore = store.state.project;
    await persistence.open();

    expect(file.pickOpenPath).toHaveBeenCalledTimes(1);
    expect(file.readProjectFile).not.toHaveBeenCalled();
    expect(store.open).not.toHaveBeenCalled();
    // store 未被触碰：project 引用保持原对象（非重新构造的等价物）
    expect(store.state.project).toBe(projectBefore);
  });

  it('读取失败（readProjectFile reject）→ open() reject 传播（壳 catch 设 fileError）', async () => {
    const store = createFakeStore();
    const file = createFakeFile();
    file.pickOpenPath.mockResolvedValue('/tmp/project.json');
    file.readProjectFile.mockRejectedValue(new Error('项目文件损坏'));
    const persistence = createProjectPersistence({ store, file });

    await expect(persistence.open()).rejects.toThrow('项目文件损坏');
    expect(store.open).not.toHaveBeenCalled();
  });
});

describe('projectPersistence save() = flush 语义（手动保存）', () => {
  it('save() 无视防抖立即写盘（已有路径静默覆盖，不弹位置）', async () => {
    const store = createFakeStore();
    store.set({ savePath: '/tmp/p.json' });
    const file = createFakeFile();
    const persistence = createProjectPersistence({ store, file });

    persistence.schedule(); // 未到防抖期
    await persistence.save();

    expect(file.writeProjectFile).toHaveBeenCalledTimes(1);
    expect(file.pickSavePath).not.toHaveBeenCalled();
    expect(file.writeProjectFile).toHaveBeenCalledWith('/tmp/p.json', store.getProject());
    expect(store.setSaveStatus).toHaveBeenLastCalledWith('saved');
  });

  it('save() 首存（savePath 为空）→ 仍弹位置选择并记录路径后写盘', async () => {
    const store = createFakeStore(); // savePath null
    const file = createFakeFile();
    const persistence = createProjectPersistence({ store, file });

    await persistence.save();

    expect(file.pickSavePath).toHaveBeenCalledTimes(1);
    expect(store.setSavePath).toHaveBeenCalledWith('/tmp/selected.json');
    expect(file.writeProjectFile).toHaveBeenCalledWith('/tmp/selected.json', store.getProject());
  });
});
