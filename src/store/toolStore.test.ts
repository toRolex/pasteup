/**
 * S3 — toolStore：最小工具状态 + 取色进入/退出（前工具切回）。
 * 当前「工具」概念尚未成型（T5 才引入描摹工具），select/picker 先占位供本切片与 T5 衔接。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TOOL, selectIsPickMode, useToolStore } from './toolStore';

describe('toolStore（S3）— 取色进入 / 退出与前工具切回', () => {
  beforeEach(() => {
    useToolStore.setState({ tool: DEFAULT_TOOL, previousTool: null, activePickTemporary: false });
  });

  it('初始工具为 select，不在取色模式', () => {
    const s = useToolStore.getState();
    expect(s.tool).toBe(DEFAULT_TOOL);
    expect(selectIsPickMode(s)).toBe(false);
  });

  it('enterPickColor 进入取色并记住前工具', () => {
    useToolStore.getState().enterPickColor();
    const s = useToolStore.getState();
    expect(s.tool).toBe('picker');
    expect(s.previousTool).toBe('select');
    expect(selectIsPickMode(s)).toBe(true);
    expect(s.activePickTemporary).toBe(false);
  });

  it('exitPickColor 恢复前工具', () => {
    useToolStore.getState().enterPickColor();
    useToolStore.getState().exitPickColor();
    const s = useToolStore.getState();
    expect(s.tool).toBe('select');
    expect(s.previousTool).toBeNull();
    expect(s.activePickTemporary).toBe(false);
    expect(selectIsPickMode(s)).toBe(false);
  });

  it('临时取色标记 temporary', () => {
    useToolStore.getState().enterPickColor({ temporary: true });
    expect(useToolStore.getState().activePickTemporary).toBe(true);
  });

  it('临时取色退出同样恢复前工具并清 temporary', () => {
    useToolStore.getState().enterPickColor({ temporary: true });
    useToolStore.getState().exitPickColor();
    const s = useToolStore.getState();
    expect(s.tool).toBe('select');
    expect(s.activePickTemporary).toBe(false);
  });

  it('已在取色中再次 enter 为 no-op（防重复触发，且不覆盖临时标记）', () => {
    useToolStore.getState().enterPickColor();
    useToolStore.getState().enterPickColor({ temporary: true });
    const s = useToolStore.getState();
    expect(s.tool).toBe('picker');
    expect(s.previousTool).toBe('select');
    expect(s.activePickTemporary).toBe(false);
  });

  it('不在取色中 exitPickColor 为 no-op', () => {
    useToolStore.getState().exitPickColor();
    const s = useToolStore.getState();
    expect(s.tool).toBe(DEFAULT_TOOL);
    expect(s.previousTool).toBeNull();
    expect(s.activePickTemporary).toBe(false);
  });
});
