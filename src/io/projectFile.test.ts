/**
 * T12 — Tauri 文件 I/O 封装契约测试。
 *
 * 封装把 plugin-dialog（保存/打开对话框）与 plugin-fs（readTextFile/writeTextFile）
 * 收敛为项目语义（savePath / PaperProject）。jsdom 无 Tauri 运行时，mock 两个插件模块
 * 断言：对话框参数、写盘内容（serialize 输出）、读取恢复（parseProject）、
 * 非 Tauri 环境优雅降级。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, createPaperElement } from '../types/project';
import { pickOpenPath, pickSavePath, readProjectFile, writeProjectFile } from './projectFile';

const isTauriMock = vi.hoisted(() => vi.fn());
const saveMock = vi.hoisted(() => vi.fn());
const openMock = vi.hoisted(() => vi.fn());
const writeTextFileMock = vi.hoisted(() => vi.fn());
const readTextFileMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: isTauriMock,
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: saveMock,
  open: openMock,
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: writeTextFileMock,
  readTextFile: readTextFileMock,
}));

describe('pickSavePath（T12 seam）— 首次保存弹位置选择', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTauriMock.mockReturnValue(true);
  });

  it('Tauri 环境调 save 对话框并返回所选路径', async () => {
    saveMock.mockResolvedValue('/tmp/pasteup.project.json');
    await expect(pickSavePath()).resolves.toBe('/tmp/pasteup.project.json');
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: 'pasteup.project.json',
        filters: [{ name: expect.stringContaining('pasteup'), extensions: ['json'] }],
      }),
    );
  });

  it('用户取消（save 返回 null）→ 返回 null', async () => {
    saveMock.mockResolvedValue(null);
    await expect(pickSavePath()).resolves.toBeNull();
  });

  it('非 Tauri 环境返回 null，不调用 save（jsdom/浏览器冒烟）', async () => {
    isTauriMock.mockReturnValue(false);
    await expect(pickSavePath()).resolves.toBeNull();
    expect(saveMock).not.toHaveBeenCalled();
  });
});

describe('pickOpenPath（T12 seam）— 打开项目文件对话框', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTauriMock.mockReturnValue(true);
  });

  it('Tauri 环境调 open 对话框（单选 json）并返回所选路径', async () => {
    openMock.mockResolvedValue('/tmp/project.json');
    await expect(pickOpenPath()).resolves.toBe('/tmp/project.json');
    expect(openMock).toHaveBeenCalledWith(
      expect.objectContaining({
        multiple: false,
        filters: [{ name: expect.stringContaining('pasteup'), extensions: ['json'] }],
      }),
    );
  });

  it('用户取消（open 返回 null）→ 返回 null', async () => {
    openMock.mockResolvedValue(null);
    await expect(pickOpenPath()).resolves.toBeNull();
  });

  it('非 Tauri 环境返回 null，不调用 open', async () => {
    isTauriMock.mockReturnValue(false);
    await expect(pickOpenPath()).resolves.toBeNull();
    expect(openMock).not.toHaveBeenCalled();
  });
});

describe('writeProjectFile / readProjectFile（T12 seam）— 项目文件读写', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTauriMock.mockReturnValue(true);
  });

  const sample = () => {
    const project = createEmptyProject(800, 600);
    project.bgPhoto = { dataUrl: 'data:image/png;base64,AAAA', visible: true };
    project.textures = [
      { id: 'tex-1', style: 'fold', seed: 42, color: '#7a8b5c', scale: 1, rotate: 0, dataUrl: 'data:image/png;base64,BBBB' },
    ];
    project.elements.push(
      createPaperElement({
        id: 'el-1',
        path: 'M 0 0 L 50 0 L 25 40 Z',
        color: '#c0392b',
        opacity: 0.7,
        textureId: 'tex-1',
        textureScale: 1.5,
        seed: 424242,
        transform: { x: 10, y: 20, rotation: 45, scaleX: 1.2, scaleY: 0.8 },
      }),
    );
    return project;
  };

  it('writeProjectFile 把 serialize 输出写入目标路径（内容可 parse 且深度一致）', async () => {
    const project = sample();
    writeTextFileMock.mockResolvedValue(undefined);
    await writeProjectFile('/tmp/project.json', project);

    expect(writeTextFileMock).toHaveBeenCalledTimes(1);
    expect(writeTextFileMock).toHaveBeenCalledWith('/tmp/project.json', expect.any(String));

    const written = writeTextFileMock.mock.calls[0]![1] as string;
    expect(JSON.parse(written)).toEqual(project);
  });

  it('readProjectFile 读文件 → parseProject 完整恢复', async () => {
    const project = sample();
    readTextFileMock.mockResolvedValue(JSON.stringify(project));
    const restored = await readProjectFile('/tmp/project.json');

    expect(readTextFileMock).toHaveBeenCalledWith('/tmp/project.json');
    expect(restored).toEqual(project);
    expect(restored.elements[0].seed).toBe(424242);
  });

  it('readProjectFile 读到的内容损坏（非 JSON / version 不符）→ 抛错不静默返回', async () => {
    readTextFileMock.mockResolvedValue('not json');
    await expect(readProjectFile('/tmp/project.json')).rejects.toThrow();

    readTextFileMock.mockResolvedValue('{"version":999,"canvas":{},"bgPhoto":null,"textures":[],"elements":[]}');
    await expect(readProjectFile('/tmp/project.json')).rejects.toThrow(/version/);
  });

  it('非 Tauri 环境：写盘/读盘明确报错（浏览器无法访问本地文件系统）', async () => {
    isTauriMock.mockReturnValue(false);
    await expect(writeProjectFile('/tmp/x.json', sample())).rejects.toThrow();
    await expect(readProjectFile('/tmp/x.json')).rejects.toThrow();
    expect(writeTextFileMock).not.toHaveBeenCalled();
    expect(readTextFileMock).not.toHaveBeenCalled();
  });
});
