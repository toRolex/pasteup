/**
 * toolStore（S3）——最小工具状态：当前工具 + 取色会话（挂起当前工具的系统模态）。
 *
 * 取色建模为「挂起当前工具的系统模态」而非常态工具值：取色期间画布被系统拾色器
 * （macOS NSColorSampler / Windows 截屏+覆盖层）盖住不可交互，`tool` 保持不变，
 * `pickSession !== null` 即表示取色挂起；退出仅清 session，工具原样返回。
 * 因此「前工具是 picker」类非法态不可表示（tool 只有 select/trace 两个真实值）。
 */
import { create } from 'zustand';

/** 工具名（画布交互模式：选择/移动 或 描摹）。取色是模态而非工具值。 */
export type ToolName = 'select' | 'trace';

/** 取色会话：temporary=true 为修饰键按住触发的临时取色（松开即退）；false 为正式取色（取完自动退）。 */
export interface PickSession {
  temporary: boolean;
}

export interface ToolStore {
  /** 当前工具（画布交互模式）。取色期间不变。 */
  tool: ToolName;
  /** 取色会话；null = 不在取色中。 */
  pickSession: PickSession | null;
  /** 设置当前工具（工具栏按钮读写 store）。 */
  setTool: (tool: ToolName) => void;
  /** 进入取色：挂起当前工具（置 pickSession）。已在取色中为 no-op。 */
  enterPickColor: (opts?: { temporary?: boolean }) => void;
  /** 退出取色：清 pickSession，工具原样返回。不在取色中为 no-op。 */
  exitPickColor: () => void;
}

/** 默认工具（选择/移动）。 */
export const DEFAULT_TOOL: ToolName = 'select';

export const useToolStore = create<ToolStore>()((set, get) => ({
  tool: DEFAULT_TOOL,
  pickSession: null,
  setTool: (tool) => set({ tool }),
  enterPickColor: (opts) => {
    const { pickSession } = get();
    if (pickSession !== null) return; // 已在取色中，防重复触发
    set({ pickSession: { temporary: opts?.temporary ?? false } });
  },
  exitPickColor: () => {
    const { pickSession } = get();
    if (pickSession === null) return; // 不在取色中
    set({ pickSession: null });
  },
}));

/** selector：是否处于取色模式（取色会话挂起中）。 */
export function selectIsPickMode(s: ToolStore): boolean {
  return s.pickSession !== null;
}
