/**
 * T12 — Tauri 项目文件 I/O 薄封装。
 *
 * 收敛 plugin-dialog（保存/打开对话框）与 plugin-fs（readTextFile/writeTextFile）
 * 为项目语义：savePath（文件位置）+ PaperProject（序列化/解析）。
 *
 * 设计（seam 4）：纯薄封装，前端 UI/自动保存只依赖本模块；
 * jsdom 下 mock 两个插件模块断言契约，不依赖真实 Tauri 运行时。
 * 非 Tauri 环境（浏览器 / jsdom 冒烟）优雅降级：对话框返回 null、读写抛错。
 */
import { isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { parseProject, serializeProject, type PaperProject } from '../types/project';

/** 项目文件对话框过滤：只允许 .json。 */
const PROJECT_FILE_FILTERS = [{ name: 'pasteup 项目文件', extensions: ['json'] }];

/** 默认保存文件名（首次保存对话框的 defaultPath 建议名）。 */
export const DEFAULT_PROJECT_FILENAME = 'pasteup.project.json';

/**
 * 弹出「另存为」对话框选择项目文件位置。
 * @returns 所选路径；用户取消 / 非 Tauri 环境返回 null。
 */
export async function pickSavePath(defaultName = DEFAULT_PROJECT_FILENAME): Promise<string | null> {
  if (!isTauri()) return null;
  const path = await save({
    defaultPath: defaultName,
    filters: PROJECT_FILE_FILTERS,
  });
  return path ?? null;
}

/**
 * 弹出「打开」对话框选择项目 .json 文件。
 * @returns 所选文件路径；用户取消 / 非 Tauri 环境返回 null。
 */
export async function pickOpenPath(): Promise<string | null> {
  if (!isTauri()) return null;
  const path = await open({
    multiple: false,
    filters: PROJECT_FILE_FILTERS,
  });
  // multiple:false 时返回 string | null（类型层 OpenDialogReturn 已收窄，这里防御数组）
  return typeof path === 'string' ? path : null;
}

/** 把项目序列化为 JSON 并写入文件（静默覆盖同路径，不重复弹窗）。 */
export async function writeProjectFile(path: string, project: PaperProject): Promise<void> {
  if (!isTauri()) throw new Error('非 Tauri 环境无法写盘');
  const json = serializeProject(project);
  await writeTextFile(path, json);
}

/** 读取项目文件并解析；文件损坏 / version 不支持 / 非 Tauri 环境抛错。 */
export async function readProjectFile(path: string): Promise<PaperProject> {
  if (!isTauri()) throw new Error('非 Tauri 环境无法读盘');
  const json = await readTextFile(path);
  return parseProject(json);
}
