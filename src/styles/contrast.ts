/**
 * 纯函数 WCAG 对比度工具——OKLCH 字符串 → sRGB → 相对亮度 → WCAG 对比度。
 *
 * 用途：T16 视觉打磨验收「文本对比度 ≥ 4.5:1」。视觉无法在 jsdom 精确断言，
 * 本模块把 DESIGN.md 的 OKLCH token 换算成 WCAG 数值逐对校验，低于阈值即调整
 * token 或文本颜色（不能只靠注释说明）。
 *
 * 色空间换算参考 Björn Ottosson 的 OKLab 标准矩阵；WCAG 相对亮度/对比度按 W3C 规范。
 */

/** OKLCH 解析结果（L/C/H 均为 0–1 / 0–∞ / 0–360；alpha 0–1）。 */
export interface OKLCH {
  l: number;
  c: number;
  h: number;
  a: number;
}

/** 线性 sRGB 通道（未做 gamma 编码）。 */
export interface LinearRGB {
  r: number;
  g: number;
  b: number;
}

const OKLCH_RE = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/;

/** 解析 `oklch(L C H[/ a])`，非 oklch 输入返回 null。 */
export function parseOKLCH(input: string): OKLCH | null {
  const m = OKLCH_RE.exec(input.trim().toLowerCase());
  if (!m) return null;
  const a = m[4] === undefined ? 1 : Number(m[4]);
  return { l: Number(m[1]), c: Number(m[2]), h: Number(m[3]), a };
}

/**
 * OKLCH → 线性 sRGB。
 * - 先按 alpha 合成到目标背景（alpha=1 时为纯色）。
 * - 通道截断到 [0,1]，防止色域外微负值影响亮度。
 */
export function oklchToSRGB(
  oklch: OKLCH | null,
  background: LinearRGB = { r: 0, g: 0, b: 0 },
): LinearRGB {
  if (!oklch) return { r: 0, g: 0, b: 0 };
  const theta = (oklch.h * Math.PI) / 180;
  const aOklab = oklch.c * Math.cos(theta);
  const bOklab = oklch.c * Math.sin(theta);
  const L = oklch.l;

  const l_ = L + 0.3963377774 * aOklab + 0.2158037573 * bOklab;
  const m_ = L - 0.1055613458 * aOklab - 0.0638541728 * bOklab;
  const s_ = L - 0.0894841775 * aOklab - 1.291485548 * bOklab;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const linear = {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  if (oklch.a >= 1) {
    return { r: clamp(linear.r), g: clamp(linear.g), b: clamp(linear.b) };
  }
  const alpha = oklch.a;
  return {
    r: clamp(alpha * linear.r + (1 - alpha) * background.r),
    g: clamp(alpha * linear.g + (1 - alpha) * background.g),
    b: clamp(alpha * linear.b + (1 - alpha) * background.b),
  };
}

/** WCAG 相对亮度：sRGB（0–1）→ 亮度。 */
export function relativeLuminance(srgb: LinearRGB): number {
  const channel = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return (
    0.2126 * channel(srgb.r) + 0.7152 * channel(srgb.g) + 0.0722 * channel(srgb.b)
  );
}

/**
 * WCAG 对比度（可传 oklch 字符串或 OKLCH 对象）。
 * 前景带 alpha 时先合成到背景；ratio = (L1+0.05)/(L2+0.05)，L1 为亮侧。
 */
export function contrastRatio(
  foreground: string | OKLCH,
  background: string | OKLCH,
): number {
  const fg = typeof foreground === 'string' ? parseOKLCH(foreground) : foreground;
  const bg = typeof background === 'string' ? parseOKLCH(background) : background;
  if (!fg || !bg) return 0;
  const bgLinear = oklchToSRGB(bg);
  const fgSRGB = oklchToSRGB(fg, bgLinear);
  const l1 = relativeLuminance(fgSRGB);
  const l2 = relativeLuminance(oklchToSRGB(bg));
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
