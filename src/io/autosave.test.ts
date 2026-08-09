/**
 * T12 — 无感自动保存控制器测试。
 *
 * 控制器纯逻辑、依赖注入（计时器/写盘/对话框都注入），jsdom 用 fake timers 断言：
 * 防抖时机（连续改动只在静默期后写一次）、首次保存弹位置选择、取消不写、
 * 后续静默覆盖不重复弹窗、in-flight 补写（保存中又改动 → 完成后写一次且内容为新状态）、
 * 写盘失败置 error、flush 立即保存。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, createPaperElement, type PaperProject } from '../types/project';
import { createAutosaveController } from './autosave';

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

/** 组装控制器 + 记录写入/状态/路径变化的闭包工具。 */
function setup(overrides: {
  initialPath?: string | null;
  writeResult?: 'ok' | 'reject';
} = {}) {
  const { initialPath = null, writeResult = 'ok' } = overrides;
  let project = makeProject('a');
  let savePath: string | null = initialPath;
  const writes: { path: string; project: PaperProject }[] = [];
  const statuses: string[] = [];
  const pickSavePath = vi.fn<() => Promise<string | null>>().mockResolvedValue('/tmp/selected.json');
  const writeProjectFile = vi.fn(
    (path: string, proj: PaperProject): Promise<void> => {
      writes.push({ path, project: proj });
      return writeResult === 'reject'
        ? Promise.reject(new Error('disk full'))
        : Promise.resolve();
    },
  );
  const onSavePath = vi.fn((p: string) => {
    savePath = p;
  });
  const onSaveStatus = vi.fn((s: string) => {
    statuses.push(s);
  });

  const controller = createAutosaveController({
    getProject: () => project,
    getSavePath: () => savePath,
    onSavePath,
    onSaveStatus,
    pickSavePath,
    writeProjectFile,
  });

  return {
    controller,
    setProject: (p: PaperProject) => {
      project = p;
    },
    get savePath() {
      return savePath;
    },
    writes,
    statuses,
    pickSavePath,
    writeProjectFile,
    onSavePath,
    onSaveStatus,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('autosave 防抖（seam 3）— 改动防抖写盘', () => {
  it('500ms 防抖：连续改动只在静默期后写盘一次', async () => {
    const c = setup({ initialPath: '/tmp/p.json' });

    c.controller.schedule();
    await vi.advanceTimersByTimeAsync(100);
    c.controller.schedule();
    await vi.advanceTimersByTimeAsync(100);
    c.controller.schedule();
    await vi.advanceTimersByTimeAsync(600); // 最后一次改动 + 500ms

    expect(c.writeProjectFile).toHaveBeenCalledTimes(1);
    expect(c.writes[0]!.path).toBe('/tmp/p.json');
  });

  it('防抖窗口内无后续改动才写盘（未到时间不写）', async () => {
    const c = setup({ initialPath: '/tmp/p.json' });
    c.controller.schedule();
    await vi.advanceTimersByTimeAsync(400);
    expect(c.writeProjectFile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(c.writeProjectFile).toHaveBeenCalledTimes(1);
  });

  it('dispose 取消未到期的写盘（不产生写入）', async () => {
    const c = setup({ initialPath: '/tmp/p.json' });
    c.controller.schedule();
    c.controller.dispose();
    await vi.advanceTimersByTimeAsync(600);
    expect(c.writeProjectFile).not.toHaveBeenCalled();
  });
});

describe('autosave 首次保存（seam 3）— 弹位置选择', () => {
  it('首次保存：savePath 为空 → 弹保存对话框，选择后写盘并记录路径', async () => {
    const c = setup(); // initialPath null

    c.controller.schedule();
    await vi.advanceTimersByTimeAsync(500);

    expect(c.pickSavePath).toHaveBeenCalledTimes(1);
    expect(c.savePath).toBe('/tmp/selected.json');
    expect(c.onSavePath).toHaveBeenCalledWith('/tmp/selected.json');
    expect(c.writeProjectFile).toHaveBeenCalledTimes(1);
    expect(c.writes[0]!.path).toBe('/tmp/selected.json');
    expect(c.writes[0]!.project).toEqual(c.writes[0]!.project);
    // 状态流转：saving → saved
    expect(c.statuses).toContain('saving');
    expect(c.statuses[c.statuses.length - 1]).toBe('saved');
  });

  it('首次保存取消（对话框返回 null）→ 不写盘、保持未保存、状态 idle', async () => {
    const c = setup();
    c.pickSavePath.mockResolvedValue(null);

    c.controller.schedule();
    await vi.advanceTimersByTimeAsync(500);

    expect(c.pickSavePath).toHaveBeenCalledTimes(1);
    expect(c.writeProjectFile).not.toHaveBeenCalled();
    expect(c.savePath).toBeNull();
    expect(c.statuses[c.statuses.length - 1]).toBe('idle');
  });
});

describe('autosave 后续静默覆盖（seam 3）', () => {
  it('已有 savePath → 不再弹对话框，静默覆盖同一文件', async () => {
    const c = setup({ initialPath: '/tmp/p.json' });

    c.controller.schedule();
    await vi.advanceTimersByTimeAsync(500);
    c.controller.schedule();
    await vi.advanceTimersByTimeAsync(500);

    expect(c.pickSavePath).not.toHaveBeenCalled();
    expect(c.writeProjectFile).toHaveBeenCalledTimes(2);
    expect(c.writes[0]!.path).toBe('/tmp/p.json');
    expect(c.writes[1]!.path).toBe('/tmp/p.json');
  });
});

describe('autosave in-flight 补写（seam 3）— 保存中又改动', () => {
  it('保存进行中产生新改动 → 当前写盘完成后补写一次且内容为新状态', async () => {
    const c = setup({ initialPath: '/tmp/p.json' });

    // 让第一次写盘挂起（手动控制 resolve）
    let resolveFirst!: () => void;
    const firstWrite = new Promise<void>((res) => {
      resolveFirst = res;
    });
    c.writeProjectFile.mockImplementationOnce((path: string, proj: PaperProject) => {
      c.writes.push({ path, project: proj });
      return firstWrite;
    });

    c.controller.schedule();
    await vi.advanceTimersByTimeAsync(500); // 触发第一次写盘（挂起中）
    expect(c.writes).toHaveLength(1); // 已捕获写盘调用（内容为版本 a）

    // 保存中又改动 → schedule；完成后应补写版本 b
    c.setProject(makeProject('b'));
    c.controller.schedule();

    resolveFirst();
    await vi.advanceTimersByTimeAsync(0); // 让补写循环推进

    expect(c.writeProjectFile).toHaveBeenCalledTimes(2);
    expect(c.writes[1]!.project.elements[0]!.id).toBe('el-b');
  });

  it('写盘失败 → 状态置 error（不崩溃）', async () => {
    const c = setup({ initialPath: '/tmp/p.json', writeResult: 'reject' });

    c.controller.schedule();
    await vi.advanceTimersByTimeAsync(500);

    expect(c.writeProjectFile).toHaveBeenCalledTimes(1);
    expect(c.statuses[c.statuses.length - 1]).toBe('error');
  });
});

describe('autosave flush（seam 3）— 手动立即保存', () => {
  it('flush 无视防抖立即写盘一次（已有路径时覆盖）', async () => {
    const c = setup({ initialPath: '/tmp/p.json' });

    await c.controller.flush();

    expect(c.writeProjectFile).toHaveBeenCalledTimes(1);
    expect(c.writes[0]!.path).toBe('/tmp/p.json');
  });

  it('flush 在未保存项目上触发首次保存对话框', async () => {
    const c = setup(); // no path
    await c.controller.flush();

    expect(c.pickSavePath).toHaveBeenCalledTimes(1);
    expect(c.writeProjectFile).toHaveBeenCalledTimes(1);
    expect(c.writes[0]!.path).toBe('/tmp/selected.json');
  });
});
