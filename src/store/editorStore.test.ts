/**
 * S2 — editorStore：当前选中色 + 会话级「最近使用」色区（复用 recentColors 纯逻辑）。
 * 取色结果的目标写入点；右栏色板（T10）接入时复用。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CURRENT_COLOR, useEditorStore } from './editorStore';

describe('editorStore（S2）— 当前选中色 + MRU 色区', () => {
  beforeEach(() => {
    useEditorStore.setState({ currentColor: DEFAULT_CURRENT_COLOR, recentColors: [] });
  });

  it('初始状态：默认选中色、空 MRU', () => {
    const s = useEditorStore.getState();
    expect(s.currentColor).toBe(DEFAULT_CURRENT_COLOR);
    expect(s.recentColors).toEqual([]);
  });

  it('setCurrentColor 更新选中色，不动 MRU', () => {
    useEditorStore.getState().setCurrentColor('#ff0000');
    const s = useEditorStore.getState();
    expect(s.currentColor).toBe('#ff0000');
    expect(s.recentColors).toEqual([]);
  });

  it('setCurrentColor 归一化大小写与 #rgb', () => {
    useEditorStore.getState().setCurrentColor('#ABC');
    expect(useEditorStore.getState().currentColor).toBe('#aabbcc');
  });

  it('setCurrentColor 忽略非法 hex（选中色不变）', () => {
    useEditorStore.getState().setCurrentColor('nope');
    expect(useEditorStore.getState().currentColor).toBe(DEFAULT_CURRENT_COLOR);
  });

  it('applyPickedColor 设置选中色并追加 MRU', () => {
    useEditorStore.getState().applyPickedColor('#123456');
    const s = useEditorStore.getState();
    expect(s.currentColor).toBe('#123456');
    expect(s.recentColors).toEqual(['#123456']);
  });

  it('applyPickedColor 去重置顶', () => {
    const s = useEditorStore.getState();
    s.applyPickedColor('#111111');
    s.applyPickedColor('#222222');
    s.applyPickedColor('#111111');
    const after = useEditorStore.getState();
    expect(after.recentColors).toEqual(['#111111', '#222222']);
    expect(after.currentColor).toBe('#111111');
  });

  it('applyPickedColor 忽略非法 hex（状态不变）', () => {
    const before = useEditorStore.getState();
    useEditorStore.getState().applyPickedColor('xyz');
    const after = useEditorStore.getState();
    expect(after.currentColor).toBe(before.currentColor);
    expect(after.recentColors).toEqual(before.recentColors);
  });
});
