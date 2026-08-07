/**
 * MRU 色区纯逻辑（S1）——会话级「最近使用」色，上限 12、去重置顶、存 hex。
 *
 * 纯函数不依赖 DOM/store，jsdom 可直接单测；editorStore 与 PalettePanel 复用。
 * 约定：recentColors 数组每一项都是 `normalizeHex` 输出的小写 `#rrggbb`。
 */

/** MRU 色区上限。 */
export const MAX_RECENT_COLORS = 12;

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** 归一化 hex：接受 `#rgb` / `#rrggbb`（可无 #、任意大小写）→ 小写 `#rrggbb`；非法返回 null。 */
export function normalizeHex(input: string): string | null {
  const match = HEX_RE.exec(input.trim());
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  return `#${hex.toLowerCase()}`;
}

/**
 * 追加 hex 到 MRU：去重置顶、上限 12、非法忽略。
 * 返回新数组；非法输入时返回原数组引用（调用方据此判断未变更）。
 */
export function addRecentColor(recentColors: string[], hex: string): string[] {
  const normalized = normalizeHex(hex);
  if (!normalized) return recentColors;
  const rest = recentColors.filter((c) => normalizeHex(c) !== normalized);
  return [normalized, ...rest].slice(0, MAX_RECENT_COLORS);
}
