/**
 * T7 程序化灰度纹理生成器（seed 驱动 + 双归一化）。
 *
 * 纯像素缓冲实现（不依赖 canvas 2D 上下文，jsdom 可测）。
 * - 确定性：同 seed → 逐像素一致（mulberry32 PRNG，不用 Math.random）；
 * - 6 风格：褶皱 / 水彩晕染 / 颗粒 / 织物拉丝 / 大理石纹 / 纤维；
 * - 双归一化：均值对齐基准（默认 128），标准差对齐风格目标（6.5–8）。
 * 算法参考 prototypes/texture-procedural/app.js（wayfinder #16 原型）。
 */

/** 6 种程序化纹理风格 id。 */
export type TextureStyle =
  | 'fold'
  | 'watercolor'
  | 'grain'
  | 'weave'
  | 'marble'
  | 'fiber';

/** 风格元信息：id / 展示名 / 明度标准差目标（6.5–8 区间内，对齐真实手工纸）。 */
export interface TextureStyleMeta {
  id: TextureStyle;
  name: string;
  /** 双归一化的标准差目标。 */
  std: number;
}

export const TEXTURE_STYLES: readonly TextureStyleMeta[] = [
  { id: 'fold', name: '褶皱', std: 7.0 },
  { id: 'watercolor', name: '水彩晕染', std: 6.5 },
  { id: 'grain', name: '颗粒', std: 8.0 },
  { id: 'weave', name: '织物拉丝', std: 7.0 },
  { id: 'marble', name: '大理石纹', std: 7.5 },
  { id: 'fiber', name: '纤维', std: 7.0 },
];

/** 明度均值基准：灰度纹理的亮度中心（对齐 128 灰）。 */
export const DEFAULT_TARGET_MEAN = 128;
/** 明度标准差目标区间（wayfinder #16：真实手工纸明度 std≈6–9，取 6.5–8）。 */
export const MIN_TARGET_STD = 6.5;
export const MAX_TARGET_STD = 8;

/** 确定性 PRNG（mulberry32）。同 seed → 同序列；输出 [0, 1)。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 256×256 value-noise 晶格 + 双线性平滑插值。 */
function makeValueNoise(rng: () => number): (x: number, y: number) => number {
  const size = 256;
  const vals = new Float32Array(size * size);
  for (let i = 0; i < vals.length; i++) vals[i] = rng();
  return function noise(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const x0 = xi & 255;
    const y0 = yi & 255;
    const x1 = (x0 + 1) & 255;
    const y1 = (y0 + 1) & 255;
    const a = vals[y0 * size + x0];
    const b = vals[y0 * size + x1];
    const c = vals[y1 * size + x0];
    const d = vals[y1 * size + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** fBm（fractal Brownian motion）：多倍频 value-noise 叠加，均值≈0.5。 */
function makeFbm(rng: () => number): (x: number, y: number, octaves: number) => number {
  const n = makeValueNoise(rng);
  return function fbm(x: number, y: number, octaves: number): number {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * n(x * freq, y * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}

/** 风格生成器：返回灰度结构场（Float32Array，长度 size*size）。 */
type FieldGenerator = (size: number, rng: () => number) => Float32Array;

const STYLE_GENERATORS: Record<TextureStyle, FieldGenerator> = {
  /** 褶皱：折痕方向的平滑明暗带，域扭曲使折痕不规则，方向随 seed。 */
  fold: (S, rng) => {
    const fbm = makeFbm(rng);
    const angle = rng() * Math.PI;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const out = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x - S / 2;
        const dy = y - S / 2;
        const rx = dx * ca + dy * sa;
        const ry = -dx * sa + dy * ca;
        const warp = fbm(dx / 130, dy / 130, 3);
        const crease = fbm(rx / 220, ry / 22 + warp * 3.0, 4);
        const base = fbm(dx / 180, dy / 180, 3);
        out[y * S + x] = crease * 0.55 + base * 0.45;
      }
    }
    return out;
  },
  /** 水彩晕染：超低频大斑块 + 少量沉淀细点，边缘晕开。 */
  watercolor: (S, rng) => {
    const fbm = makeFbm(rng);
    const out = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const b1 = fbm(x / 150, y / 150, 4);
        const b2 = fbm((x + 37) / 64, (y + 11) / 64, 3);
        const spec = fbm(x / 9, y / 9, 2) - 0.5;
        out[y * S + x] = b1 * 0.72 + b2 * 0.28 + spec * 0.06;
      }
    }
    return out;
  },
  /** 颗粒：中频粗粒 + 高频细噪，纸浆颗粒感。 */
  grain: (S, rng) => {
    const fbm = makeFbm(rng);
    const out = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const coarse = fbm(x / 16, y / 16, 3);
        const fine = fbm(x / 3.2, y / 3.2, 3);
        out[y * S + x] = coarse * 0.55 + fine * 0.45;
      }
    }
    return out;
  },
  /** 织物拉丝：定向细丝（方向随 seed）+ 平滑底，斜纹布质感。 */
  weave: (S, rng) => {
    const fbm = makeFbm(rng);
    const angle = rng() * Math.PI;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const out = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x - S / 2;
        const dy = y - S / 2;
        const rx = dx * ca + dy * sa;
        const ry = -dx * sa + dy * ca;
        const strand = fbm(rx / 300, ry / 5, 4);
        const tone = fbm(dx / 140, dy / 140, 2);
        out[y * S + x] = strand * 0.6 + tone * 0.4;
      }
    }
    return out;
  },
  /** 大理石纹：sine 域扭曲的蜿蜒纹路，方向随 seed，流动感。 */
  marble: (S, rng) => {
    const fbm = makeFbm(rng);
    const angle = rng() * Math.PI;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const out = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x - S / 2;
        const dy = y - S / 2;
        const rx = dx * ca + dy * sa;
        const ry = -dx * sa + dy * ca;
        const w1 = fbm(rx / 32, ry / 32, 4);
        const w2 = fbm(rx / 74, ry / 74, 3);
        out[y * S + x] = Math.sin(rx / 20 + w1 * 6.5 + w2 * 3.5) * 0.5 + 0.5;
      }
    }
    return out;
  },
  /** 纤维：两组交叉细纤维（毛毡）+ 平滑底。 */
  fiber: (S, rng) => {
    const fbm = makeFbm(rng);
    const angle = rng() * Math.PI;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const a2 = angle + Math.PI / 2;
    const ca2 = Math.cos(a2);
    const sa2 = Math.sin(a2);
    const out = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x - S / 2;
        const dy = y - S / 2;
        const rx = dx * ca + dy * sa;
        const ry = -dx * sa + dy * ca;
        const rx2 = dx * ca2 + dy * sa2;
        const ry2 = -dx * sa2 + dy * ca2;
        const f1 = fbm(rx / 320, ry / 3.5, 4);
        const f2 = fbm(rx2 / 240, ry2 / 4.5, 3);
        const tone = fbm(dx / 120, dy / 120, 2);
        out[y * S + x] = f1 * 0.42 + f2 * 0.38 + tone * 0.2;
      }
    }
    return out;
  },
};

/**
 * 明度双归一化：线性缩放 + 平移，使输出均值对齐 targetMean、标准差对齐 targetStd。
 * 对接近常数的输入（std≈0）退化到全 targetMean，避免放大噪声越界；
 * 输出经 Uint8ClampedArray 自动 clamp 到 0-255 并取整。
 */
export function normalizeLuminance(
  pixels: ArrayLike<number>,
  targetMean: number,
  targetStd: number,
): Uint8ClampedArray {
  const n = pixels.length;
  const out = new Uint8ClampedArray(n);
  if (n === 0) return out;

  let sum = 0;
  for (let i = 0; i < n; i++) sum += pixels[i];
  const mean = sum / n;

  let v2 = 0;
  for (let i = 0; i < n; i++) {
    const d = pixels[i] - mean;
    v2 += d * d;
  }
  const std = Math.sqrt(v2 / n);

  const k = std > 1e-6 ? targetStd / std : 0;
  for (let i = 0; i < n; i++) {
    out[i] = targetMean + (pixels[i] - mean) * k;
  }
  return out;
}

/**
 * seed 驱动的程序化灰度纹理生成（纯像素缓冲）。
 * 返回 Uint8ClampedArray（长度 size*size，灰度 0-255）。
 * 均值对齐 DEFAULT_TARGET_MEAN、标准差对齐风格目标（6.5–8）。
 */
export function generateTexture(
  style: TextureStyle,
  seed: number,
  size: number,
): Uint8ClampedArray {
  const meta = TEXTURE_STYLES.find((s) => s.id === style);
  if (!meta) throw new Error(`未知纹理风格: ${String(style)}`);
  const rng = mulberry32(seed);
  const field = STYLE_GENERATORS[style](size, rng);
  return normalizeLuminance(field, DEFAULT_TARGET_MEAN, meta.std);
}
