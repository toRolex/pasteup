/**
 * pickScreenColor（S4）——前端对 Rust 侧 `pick_color` Tauri command 的封装。
 *
 * 契约：成功返回归一化 hex（`#rrggbb`）；用户取消（系统拾色器 Esc）或系统失败返回 null；
 * 非 Tauri 环境（浏览器 / jsdom 冒烟）直接返回 null，避免 invoke 抛错。
 */
import { invoke, isTauri } from '@tauri-apps/api/core';

/** 对应 src-tauri/src/lib.rs 的 `#[tauri::command] pick_color`。 */
export const PICK_COLOR_COMMAND = 'pick_color';

/** 系统级屏幕取色：返回 hex 或 null（取消 / 失败 / 非 Tauri 环境）。 */
export async function pickScreenColor(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const result = await invoke<string | null>(PICK_COLOR_COMMAND);
    return result ?? null;
  } catch {
    return null;
  }
}
