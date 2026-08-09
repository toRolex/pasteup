/**
 * pickScreenColor（S4 + T17）——前端对 Rust 侧取色 Tauri command 的封装。
 *
 * 契约：成功返回归一化 hex（`#rrggbb`）；用户取消（系统拾色器 Esc）或系统失败返回 null；
 * 非 Tauri 环境（浏览器 / jsdom 冒烟）直接返回 null，避免 invoke 抛错。
 *
 * 平台路由（T17）：macOS 走原生 `pick_color`（NSColorSampler）；Windows 走
 * `capture_screen`（Rust 全屏截屏）+ 前端覆盖层（winOverlay）中心像素取色。
 */
import { invoke, isTauri } from '@tauri-apps/api/core';
import { isWindowsPlatform, showWindowsColorOverlay } from './winOverlay';
import type { ScreenShot } from './winOverlay';

/** 对应 src-tauri/src/lib.rs 的 `#[tauri::command] pick_color`（macOS NSColorSampler）。 */
export const PICK_COLOR_COMMAND = 'pick_color';
/** 对应 src-tauri/src/lib.rs 的 `#[tauri::command] capture_screen`（Windows 全屏截屏）。 */
export const CAPTURE_SCREEN_COMMAND = 'capture_screen';

/** 系统级屏幕取色（原生路径）：返回 hex 或 null（取消 / 失败 / 非 Tauri 环境）。 */
export async function pickScreenColor(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const result = await invoke<string | null>(PICK_COLOR_COMMAND);
    return result ?? null;
  } catch {
    return null;
  }
}

/** 平台感知取色：Windows → 截屏 + 覆盖层；其余平台 → 原生路径。失败/取消统一 null。 */
export async function pickScreenColorPlatformAware(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    if (isWindowsPlatform()) {
      const shot = await invoke<ScreenShot>(CAPTURE_SCREEN_COMMAND);
      return await showWindowsColorOverlay(shot);
    }
  } catch {
    return null;
  }
  return pickScreenColor();
}
