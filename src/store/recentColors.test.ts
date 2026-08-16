/**
 * S1 — MRU 色区纯逻辑：去重置顶 / 上限 12（会话级，不落盘）。
 * 纯函数，jsdom 可测；UI store 层（editorStore）复用本模块。
 * hex 归一化（normalizeHex）已迁共享 leaf `utils/color`，其测试见 color.test.ts。
 */
import { describe, expect, it } from 'vitest';
import { addRecentColor, MAX_RECENT_COLORS } from './recentColors';

describe('addRecentColor（S1）— MRU 去重置顶 / 上限 12', () => {
  it('空列表追加第一项', () => {
    expect(addRecentColor([], '#ff0000')).toEqual(['#ff0000']);
  });

  it('新色置顶，旧色顺延', () => {
    expect(addRecentColor(['#000000', '#ffffff'], '#ff0000')).toEqual([
      '#ff0000',
      '#000000',
      '#ffffff',
    ]);
  });

  it('已存在色去重后置顶（去重置顶，不留重复）', () => {
    expect(addRecentColor(['#000000', '#ffffff', '#ff0000'], '#ffffff')).toEqual([
      '#ffffff',
      '#000000',
      '#ff0000',
    ]);
  });

  it('上限 12：超限截断最旧色', () => {
    const base = Array.from(
      { length: MAX_RECENT_COLORS },
      (_, i) => `#${i.toString(16).padStart(2, '0')}0000`,
    );
    const result = addRecentColor(base, '#123456');
    expect(result).toHaveLength(MAX_RECENT_COLORS);
    expect(result[0]).toBe('#123456');
    // 最旧一项（#0b0000）被挤出
    expect(result).not.toContain('#0b0000');
    expect(result).toContain('#000000');
  });

  it('非法 hex 被忽略，返回原列表引用', () => {
    const list = ['#000000'];
    expect(addRecentColor(list, 'not-a-color')).toBe(list);
    expect(addRecentColor(list, '#gg')).toBe(list);
  });
});
