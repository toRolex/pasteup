/**
 * toolStore（S3）— 工具状态合并：tool（画布工具单一真相）+ pickSession（取色挂起模态）。
 * 取色期间 tool 不改变，trace→取色→回 trace 天然正确（修复现 bug：trace 下取色后静默回 select）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TOOL, selectIsPickMode, useToolStore } from './toolStore';

describe('toolStore（S3）— 工具 + 取色会话', () => {
  beforeEach(() => {
    useToolStore.setState({ tool: DEFAULT_TOOL, pickSession: null });
  });

  it('初始工具为 select，不在取色中', () => {
    const s = useToolStore.getState();
    expect(s.tool).toBe(DEFAULT_TOOL);
    expect(s.pickSession).toBeNull();
    expect(selectIsPickMode(s)).toBe(false);
  });

  it('setTool 切换工具（select ↔ trace）', () => {
    useToolStore.getState().setTool('trace');
    expect(useToolStore.getState().tool).toBe('trace');
    useToolStore.getState().setTool('select');
    expect(useToolStore.getState().tool).toBe('select');
  });

  it('enterPickColor 挂起取色会话，tool 不改变', () => {
    useToolStore.getState().setTool('trace');
    useToolStore.getState().enterPickColor();
    const s = useToolStore.getState();
    expect(s.tool).toBe('trace'); // 取色期间工具不变
    expect(s.pickSession).toEqual({ temporary: false });
    expect(selectIsPickMode(s)).toBe(true);
  });

  it('exitPickColor 清会话，工具原样返回（trace→取色→回 trace）', () => {
    useToolStore.getState().setTool('trace');
    useToolStore.getState().enterPickColor();
    useToolStore.getState().exitPickColor();
    const s = useToolStore.getState();
    expect(s.tool).toBe('trace');
    expect(s.pickSession).toBeNull();
    expect(selectIsPickMode(s)).toBe(false);
  });

  it('临时取色在 pickSession 记 temporary', () => {
    useToolStore.getState().enterPickColor({ temporary: true });
    expect(useToolStore.getState().pickSession).toEqual({ temporary: true });
  });

  it('临时取色退出同样清会话', () => {
    useToolStore.getState().enterPickColor({ temporary: true });
    useToolStore.getState().exitPickColor();
    expect(useToolStore.getState().pickSession).toBeNull();
  });

  it('已在取色中再次 enter 为 no-op（防重复触发，且不覆盖临时标记）', () => {
    useToolStore.getState().enterPickColor();
    useToolStore.getState().enterPickColor({ temporary: true });
    const s = useToolStore.getState();
    expect(s.pickSession).toEqual({ temporary: false });
    expect(useToolStore.getState().tool).toBe(DEFAULT_TOOL);
  });

  it('不在取色中 exitPickColor 为 no-op', () => {
    useToolStore.getState().setTool('trace');
    useToolStore.getState().exitPickColor();
    const s = useToolStore.getState();
    expect(s.tool).toBe('trace');
    expect(s.pickSession).toBeNull();
    expect(selectIsPickMode(s)).toBe(false);
  });
});
