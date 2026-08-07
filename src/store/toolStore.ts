/**
 * toolStore（S3）——最小工具状态：当前工具 + 取色进入/退出（恢复前工具）。
 *
 * 取色交互要求「取色后自动切回上一工具」「Esc 取消退出」「按住修饰键临时取色，松开回到原工具」，
 * 均由 enterPickColor / exitPickColor 承载。T5 引入描摹工具时在此扩展 ToolName 与工具语义。
 */
import { create } from 'zustand';

/** 工具名。T5 前仅占位 select（选择/移动）与 picker（屏幕取色）。 */
export type ToolName = 'select' | 'picker';

export interface ToolStore {
  /** 当前工具。 */
  tool: ToolName;
  /** 进入取色前记住的工具，退出时恢复；null 表示不在取色中。 */
  previousTool: ToolName | null;
  /** 当前取色会话是否临时（修饰键按住触发）：松开即退。 */
  activePickTemporary: boolean;
  /** 进入取色工具：记住前工具并切到 picker。已在取色中则为 no-op。 */
  enterPickColor: (opts?: { temporary?: boolean }) => void;
  /** 退出取色工具并恢复前工具；不在取色中为 no-op。 */
  exitPickColor: () => void;
}

/** 默认工具（选择/移动）。 */
export const DEFAULT_TOOL: ToolName = 'select';

export const useToolStore = create<ToolStore>()((set, get) => ({
  tool: DEFAULT_TOOL,
  previousTool: null,
  activePickTemporary: false,
  enterPickColor: (opts) => {
    const { tool } = get();
    if (tool === 'picker') return; // 已在取色中，防重复触发
    set({
      tool: 'picker',
      previousTool: tool,
      activePickTemporary: opts?.temporary ?? false,
    });
  },
  exitPickColor: () => {
    const { previousTool } = get();
    if (previousTool === null) return; // 不在取色中
    set({ tool: previousTool, previousTool: null, activePickTemporary: false });
  },
}));

/** selector：是否处于取色模式。 */
export function selectIsPickMode(s: ToolStore): boolean {
  return s.tool === 'picker';
}
