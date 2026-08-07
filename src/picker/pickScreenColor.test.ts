/**
 * S4 — 前端 Tauri command 封装：`pickScreenColor` 调 Rust 侧 `pick_color`。
 * 成功返回 hex（#rrggbb）；用户取消 / 系统失败 / 非 Tauri 环境统一返回 null。
 * NSColorSampler 依赖真实系统拾色器，jsdom 只测封装契约（mock @tauri-apps/api/core）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PICK_COLOR_COMMAND, pickScreenColor } from './pickScreenColor';

const invokeMock = vi.hoisted(() => vi.fn());
const isTauriMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  isTauri: isTauriMock,
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
