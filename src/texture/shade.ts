/**
 * T8 纹理着色合成（纯像素缓冲，jsdom 可测）。
 *
 * 灰度明度层 × 用户色 → 程序合成单张纸面位图（明度乘色，非混合模式叠加）。
 * - 输出尺寸 = baseSize×scale（默认 1024，50%→512²、200%→2048²，封顶 2048²）；
 * - 旋转限 90° 增量（0/90/180/270），在合成时经像素坐标映射烘焙进最终位图（无损）；
 * - 缩放经双线性插值采样烘焙（放大更平滑）。
 * 数据来源与导出共用同一 dataURL（ADR 0001：pattern 不设 transform）。
 */
import { normalizeHex } from '../store/recentColors';

/** 合成基准尺寸（灰度源纹理边长）。 */
export const TEXTURE_BASE_SIZE = 1024;
/** 合成位图封顶尺寸（2048²）。 */
export const MAX_TEXTURE_SIZE = 2048;
/** 纹理缩放区间下限（50%）。 */
export const MIN_TEXTURE_SCALE = 0.5;
/** 纹理缩放区间上限（200%）。 */
export const MAX_TEXTURE_SCALE = 2;

/** 纹理旋转仅支持 90° 增量（任意角度 pattern 平铺物理不连续）。 */
export type TextureRotation = 0 | 90 | 180 | 270;

/** 用户色（rgb 分量 0-255）。 */
export interface TintColor {
  r: number;
  g: number;
  b: number;
}

/** 着色合成结果（RGBA 像素缓冲）。 */
export interface TintedImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** 解析十六进制颜色（#rgb / #rrggbb / 可无 #、任意大小写）为 {r,g,b}；非法抛错。 */
export function hexToRgb(color: string): TintColor {
  const match = HEX_RE.exec(color.trim());
  if (!match) throw new Error(`无法解析颜色: ${color}`);
  let hex = match[1];
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** 把用户色归一化为 {r,g,b}（字符串走 hexToRgb）。 */
function toTintColor(color: TintColor | string): TintColor {
  return typeof color === 'string' ? hexToRgb(color) : color;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 双线性采样灰度缓冲（坐标在像素单位 [0, size)）：
 * 整数坐标返回精确像素（旋转烘焙无损）；非整数在四邻域线性插值（缩放平滑）。
 */
function sampleBilinear(
  gray: Uint8ClampedArray,
  size: number,
  sx: number,
  sy: number,
): number {
  const x0 = clamp(Math.floor(sx), 0, size - 1);
  const y0 = clamp(Math.floor(sy), 0, size - 1);
  const x1 = Math.min(x0 + 1, size - 1);
  const y1 = Math.min(y0 + 1, size - 1);
  const fx = clamp(sx - x0, 0, 1);
  const fy = clamp(sy - y0, 0, 1);
  const v00 = gray[y0 * size + x0];
  const v10 = gray[y0 * size + x1];
  const v01 = gray[y1 * size + x0];
  const v11 = gray[y1 * size + x1];
  return (
    v00 * (1 - fx) * (1 - fy) +
    v10 * fx * (1 - fy) +
    v01 * (1 - fx) * fy +
    v11 * fx * fy
  );
}

/**
 * 纹理着色合成：灰度明度 × 用户色 → 带纸质感着色位图（RGBA）。
 *
 * @param grayPixels 灰度纹理（长度 baseSize²，0-255）。
 * @param color 用户色（hex 字符串或 {r,g,b}）。
 * @param scale 纹理缩放（0.5–2，超界 clamp；缩放经双线性插值烘焙）。
 * @param rotation 纹理旋转（0/90/180/270，90° 增量坐标映射烘焙，无损）。
 * @param baseSize 灰度源边长（默认 1024）。
 * @returns { data: RGBA, width, height }，输出边长 = clamp(baseSize×scale, 512, 2048)。
 */
export function tintTexture(
  grayPixels: Uint8ClampedArray,
  color: TintColor | string,
  scale: number,
  rotation: TextureRotation,
  baseSize = TEXTURE_BASE_SIZE,
): TintedImage {
  const rgb = toTintColor(color);
  const sourceSize = Math.round(Math.sqrt(grayPixels.length));
  const clampedScale = clamp(scale, MIN_TEXTURE_SCALE, MAX_TEXTURE_SCALE);
  const outputSize = Math.min(
    MAX_TEXTURE_SIZE,
    Math.round(baseSize * clampedScale),
  );
  const data = new Uint8ClampedArray(outputSize * outputSize * 4);

  for (let oy = 0; oy < outputSize; oy++) {
    for (let ox = 0; ox < outputSize; ox++) {
      // 旋转坐标映射（输出 → 未旋转空间，90° 增量离散映射，无损）
      let x1: number;
      let y1: number;
      switch (rotation) {
        case 90:
          x1 = oy;
          y1 = outputSize - 1 - ox;
          break;
        case 180:
          x1 = outputSize - 1 - ox;
          y1 = outputSize - 1 - oy;
          break;
        case 270:
          x1 = outputSize - 1 - oy;
          y1 = ox;
          break;
        default:
          x1 = ox;
          y1 = oy;
      }
      // 缩放采样（双线性，烘焙进最终位图）
      const sx = x1 / clampedScale;
      const sy = y1 / clampedScale;
      const g = sampleBilinear(grayPixels, sourceSize, sx, sy);
      const idx = (oy * outputSize + ox) * 4;
      data[idx] = Math.round((g / 255) * rgb.r);
      data[idx + 1] = Math.round((g / 255) * rgb.g);
      data[idx + 2] = Math.round((g / 255) * rgb.b);
      data[idx + 3] = 255;
    }
  }
  return { data, width: outputSize, height: outputSize };
}

/**
 * 把着色合成位图转成 dataURL（浏览器环境真实跑；jsdom 下依赖 mock toDataURL）。
 * 独立封装：纹理自包含契约 —— 项目 JSON 与导出 SVG 共用同一 dataURL。
 */
export function imageDataToDataURL(image: TintedImage): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const ImageDataCtor =
    typeof ImageData === 'function'
      ? ImageData
      : (undefined as unknown as new (data: Uint8ClampedArray, w: number, h: number) => ImageData);
  const imageData = ImageDataCtor
    ? new ImageDataCtor(image.data, image.width, image.height)
    : ({ data: image.data, width: image.width, height: image.height } as ImageData);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

/** 归一化 hex 为规范小写（#rrggbb）；供缓存 key 复用。 */
export function normalizeHexColor(color: string): string {
  return normalizeHex(color) ?? color.toLowerCase();
}
