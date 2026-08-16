/**
 * 共享颜色 leaf（utils/color）—— hex 归一化。
 *
 * normalizeHex 自 store/recentColors 迁入（#48 Q3）：texture 与 store 都向下依赖本 leaf，
 * 消灭 texture 域对 store 层的反向依赖。纯函数，jsdom 可测。
 */
import { describe, expect, it } from 'vitest';
import { normalizeHex } from './color';

describe('normalizeHex — 归一化为小写 #rrggbb', () => {
  it('#rrggbb 任意大小写统一为小写', () => {
    expect(normalizeHex('#AABBCC')).toBe('#aabbcc');
    expect(normalizeHex('#aAbBcC')).toBe('#aabbcc');
    expect(normalizeHex('#ffffff')).toBe('#ffffff');
  });

  it('#rgb 三倍展开为 #rrggbb', () => {
    expect(normalizeHex('#abc')).toBe('#aabbcc');
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('#f00')).toBe('#ff0000');
  });

  it('无 # 前缀的 6 位 hex 补前缀', () => {
    expect(normalizeHex('aabbcc')).toBe('#aabbcc');
    expect(normalizeHex('FF0000')).toBe('#ff0000');
  });

  it('非法输入返回 null', () => {
    expect(normalizeHex('')).toBeNull();
    expect(normalizeHex('#12')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('#gggggg')).toBeNull();
    expect(normalizeHex('not a color')).toBeNull();
    expect(normalizeHex('rgb(1,2,3)')).toBeNull();
  });
});
