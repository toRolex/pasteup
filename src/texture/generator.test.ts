/**
 * T7 程序化纹理生成器（seed 驱动 + 双归一化）测试。
 * seam：PRNG 确定性 / 6 风格有效灰度图 / seed 逐像素一致性 / 双归一化统计。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TARGET_MEAN,
  TEXTURE_STYLES,
  generateTexture,
  mulberry32,
  normalizeLuminance,
} from './generator';

/** 计算灰度缓冲的均值与标准差（样本 std）。 */
function stats(pixels: Uint8ClampedArray): { mean: number; std: number } {
  let sum = 0;
  for (let i = 0; i < pixels.length; i++) sum += pixels[i];
  const mean = sum / pixels.length;
  let v2 = 0;
  for (let i = 0; i < pixels.length; i++) {
    const d = pixels[i] - mean;
    v2 += d * d;
  }
  return { mean, std: Math.sqrt(v2 / pixels.length) };
}

describe('mulberry32 PRNG（seam 1）', () => {
  it('同 seed 产生完全相同的序列', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('异 seed 产生不同的序列', () => {
    const a = mulberry32(42);
    const b = mulberry32(43);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('输出值域 [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('generateTexture（seam 2：6 风格有效灰度图）', () => {
  const styles = TEXTURE_STYLES.map((s) => s.id);
  const SIZE = 64;

  it('6 种风格各生成指定尺寸的灰度图，值域 0-255 整数', () => {
    for (const style of styles) {
      const pixels = generateTexture(style, 42, SIZE);
      expect(pixels, `${style} 长度`).toHaveLength(SIZE * SIZE);
      let violations = 0;
      for (const v of pixels) {
        if (v < 0 || v > 255 || !Number.isInteger(v)) violations++;
      }
      expect(violations, `${style} 越界像素数`).toBe(0);
    }
  });
});

describe('seed 确定性（seam 3）', () => {
  const SIZE = 64;

  it('相同 seed 逐像素完全一致', () => {
    const a = generateTexture('fold', 42, SIZE);
    const b = generateTexture('fold', 42, SIZE);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('不同 seed 结构不同（至少 N 个像素不同）', () => {
    const a = generateTexture('fold', 42, SIZE);
    const b = generateTexture('fold', 43, SIZE);
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) diff++;
    }
    expect(diff).toBeGreaterThan(16);
  });
});

describe('双归一化（seam 4）', () => {
  it('normalizeLuminance 把任意灰度缓冲校准到 targetMean / targetStd', () => {
    const input = new Uint8ClampedArray(256 * 256);
    for (let i = 0; i < input.length; i++) input[i] = 100 + (i % 40) - 20; // 80..119, mean≈99.5
    const out = normalizeLuminance(input, 128, 7);
    const { mean, std } = stats(out);
    expect(Math.abs(mean - 128)).toBeLessThan(1);
    expect(std).toBeGreaterThan(6.5);
    expect(std).toBeLessThan(8);
  });

  it('对接近常数的输入退化到 targetMean，值域不越界', () => {
    const input = new Uint8ClampedArray(64 * 64);
    input.fill(100); // std≈0
    const out = normalizeLuminance(input, 128, 7);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
    const { mean } = stats(out);
    expect(Math.abs(mean - 128)).toBeLessThan(1);
  });

  it('存在离群值时输出值域不越界（clamp 生效）', () => {
    const input = new Uint8ClampedArray(64 * 64);
    input.fill(0);
    input[0] = 255;
    const out = normalizeLuminance(input, 128, 7);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it('generateTexture 各风格输出满足双归一化统计（均值对齐基准、std 对齐风格目标）', () => {
    const SIZE = 128;
    for (const meta of TEXTURE_STYLES) {
      const pixels = generateTexture(meta.id, 42, SIZE);
      const { mean, std } = stats(pixels);
      expect(Math.abs(mean - DEFAULT_TARGET_MEAN), `${meta.id} 均值对齐`).toBeLessThan(1);
      expect(std, `${meta.id} std 下限`).toBeGreaterThan(6.2);
      expect(std, `${meta.id} std 上限`).toBeLessThan(8.2);
      // 双归一化核心：std 对齐该风格的明确目标（6.5-8 区间内）
      expect(Math.abs(std - meta.std), `${meta.id} std 对齐风格目标`).toBeLessThan(0.5);
    }
  });
});
