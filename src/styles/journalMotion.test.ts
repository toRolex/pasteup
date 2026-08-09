/**
 * T16 journal.css 动效/拟物契约（seam 6）——字符串断言。
 *
 * 视觉动画无法在 jsdom 精确断言，本 seam 锁定 CSS 结构契约：
 * 逐字（.ch）、描线（.underline-path）、图章（.stamp--export）动效存在，
 * 且 prefers-reduced-motion 下有显式降级规则（字符直接显示 / 瞬时切换）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/styles/journal.css'), 'utf8');

describe('journal.css T16 动效/拟物（seam 6）', () => {
  it('逐字 .ch：按 --i 索引延迟浮现；reduced 下 opacity 1 直接显示', () => {
    expect(css).toMatch(/\.ch\s*\{/);
    expect(css).toMatch(/var\(--i/);
    expect(css).toMatch(/\[data-reduced-motion='true'\]\s*\.ch\s*\{[^}]*opacity:\s*1/);
  });

  it('描线 .underline-path：stroke-dasharray 后置描线；reduced 下 dashoffset 0 已画完', () => {
    expect(css).toMatch(/\.underline-path\s*\{[^}]*stroke-dasharray/);
    expect(css).toMatch(
      /\[data-reduced-motion='true'\]\s*\.underline-path\s*\{[^}]*stroke-dashoffset:\s*0/,
    );
  });

  it('导出图章 .stamp--export：stampIn/stampJitter 动效 + stamped 基础可见 + reduced 瞬时', () => {
    expect(css).toMatch(/\.stamp--export\s*\{[^}]*animation:/);
    expect(css).toMatch(/\.stamp--export\.stamped\s*\{[^}]*opacity:\s*1/);
    expect(css).toMatch(/@keyframes\s+stampIn/);
    expect(css).toMatch(/@keyframes\s+stampJitter/);
    expect(css).toMatch(
      /\[data-reduced-motion='true'\]\s*\.stamp--export\s*\{[^}]*animation:\s*none/,
    );
  });

  it('手写圈注：.circle-note / .circle-note-ring / .circle-note-label 存在', () => {
    expect(css).toMatch(/\.circle-note\s*\{/);
    expect(css).toMatch(/\.circle-note-ring/);
    expect(css).toMatch(/\.circle-note-label/);
  });

  it('左栏撕边标签：.layer-tab 复用 .torn-paper（撕边 clip-path）', () => {
    expect(css).toMatch(/\.layer-tab\s*\{/);
    expect(css).toMatch(/\.torn-paper\s*\{[^}]*clip-path/);
  });
});
