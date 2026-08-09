/**
 * S4 — 前端 Tauri command 封装：`pickScreenColor` 调 Rust 侧 `pick_color`。
 * 成功返回 hex（#rrggbb）；用户取消 / 系统失败 / 非 Tauri 环境统一返回 null。
 * NSColorSampler 依赖真实系统拾色器，jsdom 只测封装契约（mock @tauri-apps/api/core）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAPTURE_SCREEN_COMMAND,
  PICK_COLOR_COMMAND,
  pickScreenColor,
  pickScreenColorPlatformAware,
} from './pickScreenColor';

const invokeMock = vi.hoisted(() => vi.fn());
const isTauriMock = vi.hoisted(() => vi.fn());
const isWindowsPlatformMock = vi.hoisted(() => vi.fn());
const showWindowsColorOverlayMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  isTauri: isTauriMock,
}));

vi.mock('./winOverlay', () => ({
  isWindowsPlatform: isWindowsPlatformMock,
  showWindowsColorOverlay: showWindowsColorOverlayMock,
}));

describe('pickScreenColor（S4）— Tauri command 封装契约', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTauriMock.mockReturnValue(true);
  });

  it('非 Tauri 环境直接返回 null，不调用 invoke', async () => {
    isTauriMock.mockReturnValue(false);
    await expect(pickScreenColor()).resolves.toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('调用 invoke("pick_color") 并返回 hex', async () => {
    invokeMock.mockResolvedValue('#ff0000');
    await expect(pickScreenColor()).resolves.toBe('#ff0000');
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith(PICK_COLOR_COMMAND);
  });

  it('invoke 返回 null（用户取消）→ null', async () => {
    invokeMock.mockResolvedValue(null);
    await expect(pickScreenColor()).resolves.toBeNull();
  });

  it('invoke 抛错（系统取色失败）→ null 而非向上抛异常', async () => {
    invokeMock.mockRejectedValue(new Error('picker failed'));
    await expect(pickScreenColor()).resolves.toBeNull();
  });
});

describe('pickScreenColorPlatformAware（T17）— Windows 覆盖层路由', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTauriMock.mockReturnValue(true);
    isWindowsPlatformMock.mockReset();
    showWindowsColorOverlayMock.mockReset();
  });

  it('非 Tauri 环境直接返回 null，不调用 invoke', async () => {
    isTauriMock.mockReturnValue(false);
    await expect(pickScreenColorPlatformAware()).resolves.toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('Windows 平台：capture_screen 取图 → 覆盖层取色返回 hex', async () => {
    isWindowsPlatformMock.mockReturnValue(true);
    const shot = { dataUrl: 'data:image/png;base64,', width: 2, height: 2 };
    invokeMock.mockResolvedValue(shot);
    showWindowsColorOverlayMock.mockResolvedValue('#123456');
    await expect(pickScreenColorPlatformAware()).resolves.toBe('#123456');
    expect(invokeMock).toHaveBeenCalledWith(CAPTURE_SCREEN_COMMAND);
    expect(showWindowsColorOverlayMock).toHaveBeenCalledWith(shot);
  });

  it('Windows 平台 capture_screen 失败 → null 而非抛异常', async () => {
    isWindowsPlatformMock.mockReturnValue(true);
    invokeMock.mockRejectedValue(new Error('capture failed'));
    await expect(pickScreenColorPlatformAware()).resolves.toBeNull();
    expect(showWindowsColorOverlayMock).not.toHaveBeenCalled();
  });

  it('非 Windows（macOS/其他）：走原生 pick_color 路径', async () => {
    isWindowsPlatformMock.mockReturnValue(false);
    invokeMock.mockResolvedValue('#ff0000');
    await expect(pickScreenColorPlatformAware()).resolves.toBe('#ff0000');
    expect(invokeMock).toHaveBeenCalledWith(PICK_COLOR_COMMAND);
    expect(showWindowsColorOverlayMock).not.toHaveBeenCalled();
  });
});
