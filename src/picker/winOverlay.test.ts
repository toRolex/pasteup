/**
 * T17 Windows 屏幕取色覆盖层 — 前端纯逻辑与 DOM 宿主单测。
 *
 * Windows 分支在 macOS 无法运行/编译验证，故把可测的纯逻辑与 DOM 结构
 * 全部前移到前端：hexAtPixel（中心像素取色）、magnifierSource（放大镜源区域
 * clamp）、isWindowsPlatform（运行时平台探测）、showWindowsColorOverlay
 * （全屏覆盖层 DOM 宿主；jsdom 无 canvas，像素解码为 no-op，仅测结构/事件）。
 */
import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  hexAtPixel,
  isWindowsPlatform,
  magnifierSource,
  showWindowsColorOverlay,
} from './winOverlay';

describe('winOverlay — hexAtPixel（RGBA buffer → #rrggbb）', () => {
  it('提取指定像素 hex，忽略 alpha 通道', () => {
    // 2x2：左上红、右上绿、左下蓝、右下白
    const data = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    expect(hexAtPixel(data, 2, 0, 0)).toBe('#ff0000');
    expect(hexAtPixel(data, 2, 1, 0)).toBe('#00ff00');
    expect(hexAtPixel(data, 2, 0, 1)).toBe('#0000ff');
    expect(hexAtPixel(data, 2, 1, 1)).toBe('#ffffff');
  });

  it('半透明像素取 rgb（alpha 不参与）', () => {
    const data = new Uint8ClampedArray([10, 20, 30, 0]);
    expect(hexAtPixel(data, 1, 0, 0)).toBe('#0a141e');
  });

  it('越界坐标 clamp 到图像范围', () => {
    const data = new Uint8ClampedArray([
      1, 2, 3, 255, 4, 5, 6, 255,
    ]);
    expect(hexAtPixel(data, 2, 99, 0)).toBe('#040506'); // x 超右 → 最右像素
    expect(hexAtPixel(data, 2, -5, 0)).toBe('#010203'); // x 超左 → 最左像素
    expect(hexAtPixel(data, 2, 0, 99)).toBe('#010203'); // y 超下 → 顶行像素
  });
});

describe('winOverlay — magnifierSource（放大镜源区域 clamp）', () => {
  const zoom = 4;
  const view = 40; // 源方边长 = view/zoom = 10
  const SRC_SIDE = 10;

  it('中心：源区域以光标为中心，边长 = ceil(view/zoom)', () => {
    const r = magnifierSource(50, 40, 100, 80, zoom, view);
    expect(r.w).toBe(SRC_SIDE);
    expect(r.h).toBe(SRC_SIDE);
    expect(r.x).toBe(45);
    expect(r.y).toBe(35);
  });

  it('左边缘：x 钳到 0', () => {
    const r = magnifierSource(3, 40, 100, 80, zoom, view);
    expect(r.x).toBe(0);
    expect(r.w).toBe(SRC_SIDE);
  });

  it('右边缘：右边界不越出图像宽', () => {
    const r = magnifierSource(98, 40, 100, 80, zoom, view);
    expect(r.x).toBe(90);
    expect(r.x + r.w).toBe(100);
  });

  it('上边缘：y 钳到 0', () => {
    const r = magnifierSource(50, 2, 100, 80, zoom, view);
    expect(r.y).toBe(0);
  });

  it('下边缘：底边界不越出图像高', () => {
    const r = magnifierSource(50, 77, 100, 80, zoom, view);
    expect(r.y).toBe(70);
    expect(r.y + r.h).toBe(80);
  });
});

describe('winOverlay — 平台探测', () => {
  it('isWindowsPlatform 返回布尔（jsdom 下为 false）', () => {
    expect(typeof isWindowsPlatform()).toBe('boolean');
    expect(isWindowsPlatform()).toBe(false);
  });
});

describe('winOverlay — showWindowsColorOverlay（DOM 宿主）', () => {
  it('创建全屏覆盖层，含放大镜与取色读数元素', async () => {
    const promise = showWindowsColorOverlay({
      dataUrl: 'data:image/png;base64,',
      width: 2,
      height: 2,
    });
    const overlay = document.querySelector('[data-testid="win-overlay"]');
    expect(overlay).not.toBeNull();
    expect(document.querySelector('[data-testid="win-magnifier"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="win-hex"]')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await expect(promise).resolves.toBeNull();
    expect(document.querySelector('[data-testid="win-overlay"]')).toBeNull();
  });

  it('点击覆盖层结束取色并清理 DOM（jsdom 无像素源 → resolve null）', async () => {
    const promise = showWindowsColorOverlay({
      dataUrl: 'data:image/png;base64,',
      width: 2,
      height: 2,
    });
    const overlay = document.querySelector('[data-testid="win-overlay"]') as HTMLElement;
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay);
    await expect(promise).resolves.toBeNull();
    expect(document.querySelector('[data-testid="win-overlay"]')).toBeNull();
  });
});
