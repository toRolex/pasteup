/**
 * editorStore（S2）——当前选中色 + 会话级 MRU 色区（上限 12、去重置顶、存 hex）。
 *
 * 取色结果的目标写入点：`applyPickedColor` 同时激活选中色并追加 MRU。
 * MRU 不落盘（会话级）；右栏色板（T10）与元素属性面板接入时复用。
 * 本 store 只存 hex 归一化值（`#rrggbb`），其他色彩模型留待后续。
 */
import { create } from 'zustand';
import { addRecentColor } from './recentColors';
import { normalizeHex } from '../utils/color';

/** 默认当前选中色（未取色 / 未选色前的兜底）。 */
export const DEFAULT_CURRENT_COLOR = '#000000';

export interface EditorStore {
  /** 当前选中色（hex，`#rrggbb`）。 */
  currentColor: string;
  /** 会话级「最近使用」色区，队首为最新（上限 12、去重置顶）。 */
  recentColors: string[];
  /** 设置当前选中色（归一化；非法 hex 忽略）。 */
  setCurrentColor: (hex: string) => void;
  /** 取色结果：激活选中色并追加 MRU（非法 hex 忽略）。 */
  applyPickedColor: (hex: string) => void;
}

export const useEditorStore = create<EditorStore>()((set) => ({
  currentColor: DEFAULT_CURRENT_COLOR,
  recentColors: [],
  setCurrentColor: (hex) => {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    set({ currentColor: normalized });
  },
  applyPickedColor: (hex) => {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    set((s) => ({
      currentColor: normalized,
      recentColors: addRecentColor(s.recentColors, normalized),
    }));
  },
}));
