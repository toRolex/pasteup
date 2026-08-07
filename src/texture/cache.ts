/**
 * T8 纹理着色合成缓存（LRU，延续 wayfinder #9 策略）。
 *
 * key = `texId:color:scale:rotate`（颜色归一化规范小写 hex，scale/rotate 数值 key）。
 * 命中复用返回已合成 dataURL；新 key（texId/color/scale/rotate 任一变）重合成并缓存。
 * 数据源与导出共用同一 dataURL（ADR 0001）。
 */
import type { TextureStyle } from './generator';
import { generateTexture } from './generator';
import {
  imageDataToDataURL,
  normalizeHexColor,
  TEXTURE_BASE_SIZE,
  tintTexture,
  type TextureRotation,
} from './shade';

/** 纹理着色合成请求（缓存 key 的完整维度）。 */
export interface TintedTextureRequest {
  /** 源纹理标识（引用 project.textures 记录）。 */
  texId: string;
  /** 灰度源风格（T7 6 风格之一）。 */
  style: TextureStyle;
  /** 灰度源 seed（程序化纹理确定性）。 */
  seed: number;
  /** 用户色（hex）。 */
  color: string;
  /** 纹理缩放（0.5–2）。 */
  scale: number;
  /** 纹理旋转（0/90/180/270）。 */
  rotate: TextureRotation;
}

/** 着色合成实现（可注入以便测试 spy 计数）。 */
export type ComposeTinted = (request: TintedTextureRequest) => string;

/** 缓存 key：`texId:color:scale:rotate`，颜色归一化为规范小写 hex。 */
export function tintCacheKey(
  texId: string,
  color: string,
  scale: number,
  rotate: TextureRotation,
): string {
  return `${texId}:${normalizeHexColor(color)}:${scale}:${rotate}`;
}

/** 简单 LRU：Map 顺序即访问序，get/set 都置为最近使用，超限驱逐最旧。 */
export class TextureCache {
  private map = new Map<string, string>();

  constructor(private limit = 128) {
    if (limit < 1) throw new Error('TextureCache limit 必须 >= 1');
  }

  get(key: string): string | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: string): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

export interface TintCacheOptions {
  /** 合成实现；未提供时走默认管线（generateTexture → tintTexture → imageDataToDataURL）。 */
  compose?: ComposeTinted;
  /** LRU 实例；未提供时新建默认上限。 */
  cache?: TextureCache;
  /** 灰度源边长；默认 1024。 */
  baseSize?: number;
}

export interface TintCache {
  get(request: TintedTextureRequest): string;
  readonly size: number;
  clear(): void;
}

/** 创建着色合成缓存解析器：命中复用，变更（新 key）重合成。 */
export function createTintCache(options: TintCacheOptions = {}): TintCache {
  const cache = options.cache ?? new TextureCache();
  const baseSize = options.baseSize ?? TEXTURE_BASE_SIZE;
  const compose: ComposeTinted =
    options.compose ??
    ((request) => {
      const gray = generateTexture(request.style, request.seed, baseSize);
      const tinted = tintTexture(gray, request.color, request.scale, request.rotate, baseSize);
      return imageDataToDataURL(tinted);
    });

  return {
    get(request) {
      const key = tintCacheKey(request.texId, request.color, request.scale, request.rotate);
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const dataUrl = compose(request);
      cache.set(key, dataUrl);
      return dataUrl;
    },
    get size() {
      return cache.size;
    },
    clear() {
      cache.clear();
    },
  };
}

/** 默认运行时着色缓存（应用级单例）。 */
export const tintTextureCache = createTintCache();
