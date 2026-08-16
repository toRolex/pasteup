/**
 * 共享颜色 leaf（#48 Q3）。
 *
 * normalizeHex 自 store/recentColors 迁入本 leaf：texture 域（shade/supply）与 store 域
 * （recentColors/editorStore）都向下依赖这里，消灭 texture 对 store 层的反向依赖。
 * 纯函数，无 DOM/store 依赖。
 */

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
