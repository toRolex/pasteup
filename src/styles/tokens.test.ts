import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tokens, resolveMotion } from './tokens';

describe('tokens（seam 1）— DESIGN.md 契约值', () => {
  it('三栏布局尺寸符合契约：顶栏 56 / 左 260 / 中缝 34 / 右 280', () => {
    expect(tokens.layout).toEqual({ topbar: 56, left: 260, spine: 34, right: 280 });
  });

  it('OKLCH 色板与 DESIGN.md Palette 逐项一致', () => {
    expect(tokens.palette.desk).toBe('oklch(0.80 0.025 88)');
    expect(tokens.palette.bg).toBe('oklch(0.965 0.020 85)');
    expect(tokens.palette.paper2).toBe('oklch(0.935 0.022 85)');
    expect(tokens.palette.ink).toBe('oklch(0.32 0.045 60)');
    expect(tokens.palette.moss).toBe('oklch(0.55 0.092 130)');
    expect(tokens.palette.tape).toBe('oklch(0.53 0.175 27)');
    expect(tokens.palette.note).toBe('oklch(0.82 0.10 88)');
    expect(tokens.palette.sticker).toBe('oklch(0.55 0.05 320)');
  });

  it('圆角符合拟物方向：便利贴/色卡 4、工具按钮 6、图章 0（零大圆角卡片）', () => {
    expect(tokens.radius).toEqual({ chip: 4, toolBtn: 6, stamp: 0 });
  });

  it('纸页阴影用 oklch 表达且含 DESIGN.md 层次', () => {
    expect(tokens.elevation.book).toContain('oklch(');
    expect(tokens.elevation.book).toContain('0 10px 40px');
    expect(tokens.elevation.lift).toContain('oklch(');
    expect(tokens.elevation.hover).toContain('oklch(');
  });

  it('动效 token 与 DESIGN.md Motion 一致（spring ease）', () => {
    expect(tokens.motion.duration).toBe('220ms');
    expect(tokens.motion.easeOut).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
    expect(tokens.motion.easeSpring).toBe('cubic-bezier(0.34, 1.56, 0.64, 1)');
  });

  it('字体链含打包中文字体 + 双平台正文兜底', () => {
    expect(tokens.font.hand).toContain('Ma Shan Zheng');
    expect(tokens.font.sub).toContain('ZCOOL KuaiLe');
    expect(tokens.font.scrawl).toContain('Liu Jian Mao Cao');
    expect(tokens.font.num).toContain('Nunito');
    expect(tokens.font.body).toContain('Nunito');
    expect(tokens.font.body).toContain('Hiragino Maru Gothic ProN');
    expect(tokens.font.body).toContain('Microsoft YaHei');
  });
});

describe('resolveMotion（seam 4）— prefers-reduced-motion 降级', () => {
  it('正常模式返回 spring 弹性动效', () => {
    expect(resolveMotion(false)).toEqual(tokens.motion);
  });

  it('reduced 模式降级为瞬时切换（0.001s + linear）', () => {
    const reduced = resolveMotion(true);
    expect(reduced.duration).toBe('0.001s');
    expect(reduced.easeOut).toBe('linear');
    expect(reduced.easeSpring).toBe('linear');
  });
});

describe('tokens.css（seam 4）— 媒体查询降级块', () => {
  it('含 prefers-reduced-motion: reduce 且将 --motion-duration 覆盖为 0.001s', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(/--motion-duration:\s*0\.001s/);
  });
});
