/**
 * T16 对比度 seam 1——纯函数 WCAG 对比度（oklch 字符串 → sRGB → 相对亮度 → ratio）。
 *
 * 验收硬性要求：文本/背景对比度 ≥ 4.5:1。视觉无法 jsdom 断言像素，本 seam 用 DESIGN.md
 * 的 OKLCH token 逐对计算，低于阈值的对必须调整 token 或文本颜色（不能只注释）。
 */
import { describe, expect, it } from 'vitest';
import { tokens } from './tokens';
import {
  contrastRatio,
  oklchToSRGB,
  parseOKLCH,
  relativeLuminance,
} from './contrast';

describe('OKLCH → sRGB 转换（seam 1）', () => {
  it('解析 `oklch(L C H)`', () => {
    expect(parseOKLCH('oklch(0.32 0.045 60)')).toEqual({ l: 0.32, c: 0.045, h: 60, a: 1 });
  });

  it('解析带 alpha 的 `oklch(L C H / a)`', () => {
    expect(parseOKLCH('oklch(0.32 0.045 60 / 0.38)')).toEqual({
      l: 0.32,
      c: 0.045,
      h: 60,
      a: 0.38,
    });
  });

  it('L=0 → 近黑，L=1 → 近白（OKLab→sRGB 基准）', () => {
    const black = oklchToSRGB(parseOKLCH('oklch(0 0 0)'));
    const white = oklchToSRGB(parseOKLCH('oklch(1 0 0)'));
    expect(black.r).toBeLessThan(0.01);
    expect(black.g).toBeLessThan(0.01);
    expect(black.b).toBeLessThan(0.01);
    expect(white.r).toBeGreaterThan(0.99);
    expect(white.g).toBeGreaterThan(0.99);
    expect(white.b).toBeGreaterThan(0.99);
  });

  it('相对亮度：黑 0 / 白 1', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(relativeLuminance({ r: 1, g: 1, b: 1 })).toBeCloseTo(1, 5);
  });
});

describe('WCAG 对比度（seam 1）— 关键文本/底色对 ≥ 4.5:1', () => {
  const { bg, paper2, ink, inkSoft, note, mossDeep, tape } = tokens.palette;

  it.each([
    ['ink/bg（正文/标题）', ink, bg],
    ['ink/paper-2（顶栏品牌/工具按钮）', ink, paper2],
    ['ink/note（属性便签正文/数值）', ink, note],
    ['ink-soft/bg（右栏标签/空态）', inkSoft, bg],
    ['ink-soft/paper-2（左栏标签）', inkSoft, paper2],
    ['moss-deep/bg（新建预览色）', mossDeep, bg],
    ['moss-deep/note（便签打勾反馈）', mossDeep, note],
  ])('%s 对比度 ≥ 4.5:1', (_name, fg, bgc) => {
    expect(contrastRatio(fg, bgc)).toBeGreaterThanOrEqual(4.5);
  });

  it('ink-soft on note（属性便签 label/空态文字）≥ 4.5:1', () => {
    expect(contrastRatio(inkSoft, note)).toBeGreaterThanOrEqual(4.5);
  });

  it('tape（朱红图章/强调）on bg ≥ 4.5:1', () => {
    expect(contrastRatio(tape, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('tape 85% alpha 合成于 bg（图章文字实际呈现）≥ 4.5:1', () => {
    const fg = { ...parseOKLCH(tape)!, a: 0.85 };
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('黑/白 对比度 ≈ 21:1（函数正确性基准）', () => {
    const ratio = contrastRatio('oklch(0 0 0)', 'oklch(1 0 0)');
    expect(ratio).toBeGreaterThanOrEqual(20);
    expect(ratio).toBeLessThanOrEqual(22);
  });
});
