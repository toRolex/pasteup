/**
 * T16 CharReveal（seam 5）——主标题逐字浮现。
 *
 * - 默认：每字符一个 `.ch` span（空白转 nbsp），wrapper `role="text"` + `aria-label` 全文本。
 * - prefers-reduced-motion：直接渲染纯文本、无 `.ch` span（字符直接显示，不等动画）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CharReveal } from './CharReveal';

type MatchMediaMock = {
  matches: boolean;
  media: string;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
};

function mockMatchMedia(matches: boolean): void {
  const mql: MatchMediaMock = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  window.matchMedia = vi.fn().mockReturnValue(mql);
}

const TEXT = 'pasteup · 手帐';
const CODE_POINTS = Array.from(TEXT).length;

describe('CharReveal 逐字（T16 seam 5）', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    (window as unknown as { matchMedia?: unknown }).matchMedia = undefined;
  });

  it('默认渲染每字符一个 `.ch` span，空白转 nbsp，wrapper aria-label 为全文本', () => {
    render(<CharReveal text={TEXT} />);
    const chs = document.querySelectorAll('.ch');
    expect(chs.length).toBe(CODE_POINTS);
    // 空白被替换为 nbsp（不换行）
    const joined = Array.from(chs)
      .map((c) => c.textContent)
      .join('');
    expect(joined).toContain(' ');
    // 逐字文本还原后与原文等价（nbsp→空格）
    expect(joined.replace(/ /g, ' ')).toBe(TEXT);
    // aria 全文本
    expect(screen.getByRole('text')).toHaveAttribute('aria-label', TEXT);
  });

  it('reduced-motion：直接渲染纯文本、无 `.ch` span（字符直接显示）', () => {
    mockMatchMedia(true);
    render(<CharReveal text={TEXT} />);
    expect(document.querySelectorAll('.ch')).toHaveLength(0);
    expect(screen.getByTestId('char-reveal').textContent).toBe(TEXT);
  });

  it('className 透传（brand-name 排印样式不丢失）', () => {
    render(<CharReveal text="pasteup" className="brand-name" />);
    expect(screen.getByTestId('char-reveal').className).toContain('brand-name');
  });
});
