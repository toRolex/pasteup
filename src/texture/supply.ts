/**
 * 纹理供给（textureSupply，#48）——两层薄缓存（cache + loader）折叠的单对象 module。
 *
 * 统一承载「着色合成」与「解码加载」两侧，消除缓存漂移与双份记账：
 * - `resolve(spec) → dataURL` 同步：命中复用 / 未命中合成（毫秒级像素合成）。
 * - `load(dataUrl) → Promise<ImageSource>` 异步：解码为画布 pattern / 导出可用的图像源。
 *
 * 统一字节 LRU（Q2）：dataURL 为 key，`dataURL.length + width×height×4` 记账——resolve 侧按
 * 请求已知 outputSize 预记（含将解码出的位图），load 侧 decode 完成后按实际位图补记。超额逐出
 * LRU 最旧直到低于预算（默认 256MB，构造可注入）。spec→dataURL 仅轻量前向索引，生命周期绑死
 * LRU 条目——逐出即删索引，再次 resolve 重合成。孤儿纹理由 LRU 自然逐出，不主动失效。
 *
 * 消费方各声明窄 interface（Q1，TS 结构化类型无需真拆）：FabricCanvas / projectRenderer / svg
 * 只声明 load 侧（`TextureLoadSide`），projectStore 只声明 resolve 侧（`TextureResolveSide`）。
 * load 侧 prod（`loadTextureImage`）/ test（jsdom fake）两 adapter 保留。
 *
 * ADR 0001 硬性契约：纹理缩放/旋转已在合成时烘焙进 dataURL，pattern 不设 transform——
 * 运行时与导出共用同一 dataURL 与同一加载管线，导出天然正确。
 */
import { generateTexture, type TextureStyle } from './generator';
import {
  imageDataToDataURL,
  MAX_TEXTURE_SCALE,
  MAX_TEXTURE_SIZE,
  MIN_TEXTURE_SCALE,
  normalizeHexColor,
  TEXTURE_BASE_SIZE,
  tintTexture,
  type TextureRotation,
} from './shade';

/** 纹理着色合成请求（resolve 的 spec，spec key 的完整维度）。 */
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

/** 着色合成实现（resolve 侧 adapter，可注入 spy 计数 / 廉价 dataURL）。 */
export type ComposeTinted = (request: TintedTextureRequest) => string;

/** 纹理解码实现（load 侧 adapter，可注入 jsdom fake；浏览器默认见 loadTextureImage）。 */
export type TextureSourceLoader = (dataUrl: string) => Promise<CanvasImageSource>;

/** 默认字节预算（256MB；1024²≈4.75MB/条带位图 → 约 50 条，覆盖几十片场景）。 */
export const DEFAULT_TEXTURE_BUDGET = 256 * 1024 * 1024;

/** load 侧窄 interface：只声明异步解码（FabricCanvas / projectRenderer / svg 消费）。 */
export interface TextureLoadSide {
  /** 加载 dataURL 为已解码图像源；同一 dataURL 命中复用（成功/失败 Promise 均缓存去重）。 */
  load(dataUrl: string): Promise<CanvasImageSource>;
}

/** resolve 侧窄 interface：只声明同步合成（projectStore 消费）。 */
export interface TextureResolveSide {
  /** 合成 spec 对应 dataURL；命中复用 / 未命中合成。 */
  resolve(spec: TintedTextureRequest): string;
}

/** 纹理供给 interface：resolve 同步合成 + load 异步解码 + 当前条目数 + 清空。 */
export interface TextureSupply extends TextureResolveSide, TextureLoadSide {
  /** 当前 LRU 条目数（以 dataURL 为 key）。 */
  readonly size: number;
  /** 清空缓存（LRU + spec 索引），强制重新合成/解码。 */
  clear(): void;
}

/**
 * 把纹理 dataURL 加载为可被 `Pattern.toSVG()` 读取 width/height 的图片源（prod adapter）。
 * 浏览器实现：`new Image()` + `decode()`；jsdom 不实现图片解码（测试走注入，不调用本函数）。
 */
export async function loadTextureImage(dataUrl: string): Promise<CanvasImageSource> {
  const img = new Image();
  img.src = dataUrl;
  if (typeof img.decode === 'function') {
    await img.decode();
  } else {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`纹理图片加载失败: ${dataUrl.slice(0, 32)}`));
    });
  }
  return img;
}

export interface TextureSupplyOptions {
  /** resolve 侧合成实现；未提供时走默认管线（generateTexture → tintTexture → imageDataToDataURL）。 */
  compose?: ComposeTinted;
  /** load 侧解码实现；未提供时走默认浏览器 Image 加载（loadTextureImage）。 */
  load?: TextureSourceLoader;
  /** 字节预算；默认 256MB。 */
  budget?: number;
  /** 灰度源边长；默认 1024（影响默认 compose 与 resolve 预记的 outputSize）。 */
  baseSize?: number;
}

/** LRU 条目：specKey 反指针 + 记账字节 + decode Promise；不冗余存 dataUrl（key 即它）。 */
interface SupplyEntry {
  /** spec 索引反指针（load-only 条目为 null，无索引可删）。 */
  specKey: string | null;
  /** 记账字节：dataURL.length + width×height×4（resolve 预记 / load decode 后补记）。 */
  bytes: number;
  /** decode Promise（成功/失败均缓存，去重并发/重复 load）；未 load 为 undefined。 */
  decoded?: Promise<CanvasImageSource>;
}

/** spec key：`texId:color:scale:rotate`，颜色归一化为规范小写 hex。 */
function specKeyOf(spec: TintedTextureRequest): string {
  return `${spec.texId}:${normalizeHexColor(spec.color)}:${spec.scale}:${spec.rotate}`;
}

/** 按请求已知缩放算合成位图边长（与 shade.tintTexture 输出一致：clamp 缩放、封顶 2048²）。 */
function outputSizeFor(scale: number, baseSize: number): number {
  const clamped = Math.min(MAX_TEXTURE_SCALE, Math.max(MIN_TEXTURE_SCALE, scale));
  return Math.min(MAX_TEXTURE_SIZE, Math.round(baseSize * clamped));
}

/** 创建纹理供给：resolve/load 两侧共用统一字节 LRU + spec 前向索引。 */
export function createTextureSupply(options: TextureSupplyOptions = {}): TextureSupply {
  const baseSize = options.baseSize ?? TEXTURE_BASE_SIZE;
  const budget = options.budget ?? DEFAULT_TEXTURE_BUDGET;
  const loadAdapter: TextureSourceLoader = options.load ?? loadTextureImage;
  const compose: ComposeTinted =
    options.compose ??
    ((request) => {
      const gray = generateTexture(request.style, request.seed, baseSize);
      const tinted = tintTexture(gray, request.color, request.scale, request.rotate, baseSize);
      return imageDataToDataURL(tinted);
    });

  // 统一字节 LRU：dataURL 为 key（Map 顺序即访问序，末尾 = 最近使用）。
  const lru = new Map<string, SupplyEntry>();
  // spec→dataURL 轻量前向索引：生命周期绑死 LRU 条目（逐出删索引，再 resolve 重合成）。
  const specIndex = new Map<string, string>();
  let totalBytes = 0;

  /** 标记 dataURL 条目为最近使用并返回条目。 */
  function touch(dataUrl: string): SupplyEntry | undefined {
    const entry = lru.get(dataUrl);
    if (!entry) return undefined;
    lru.delete(dataUrl);
    lru.set(dataUrl, entry);
    return entry;
  }

  /** 超额逐出 LRU 最旧直到低于预算（保留至少 1 条最新；逐出同步删 spec 索引）。 */
  function evictIfOverBudget(): void {
    while (totalBytes > budget && lru.size > 1) {
      const oldestKey = lru.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = lru.get(oldestKey)!;
      totalBytes -= oldest.bytes;
      lru.delete(oldestKey);
      if (oldest.specKey !== null) specIndex.delete(oldest.specKey);
    }
  }

  /** 插入新条目（置于最近使用端）并记账，随后按预算逐出。 */
  function insert(dataUrl: string, entry: SupplyEntry): void {
    lru.set(dataUrl, entry);
    totalBytes += entry.bytes;
    evictIfOverBudget();
  }

  function resolve(spec: TintedTextureRequest): string {
    const specKey = specKeyOf(spec);
    const indexed = specIndex.get(specKey);
    if (indexed !== undefined) {
      touch(indexed); // 命中：LRU 标记最近使用
      return indexed;
    }
    const dataUrl = compose(spec);
    const outputSize = outputSizeFor(spec.scale, baseSize);
    // 预记：dataURL 字符串 + 将解码出的位图（outputSize²×4）
    insert(dataUrl, { specKey, bytes: dataUrl.length + outputSize * outputSize * 4 });
    specIndex.set(specKey, dataUrl);
    return dataUrl;
  }

  function load(dataUrl: string): Promise<CanvasImageSource> {
    const existing = touch(dataUrl);
    if (existing?.decoded) return existing.decoded; // 命中已解码（成功/失败 Promise 复用去重）
    const entry: SupplyEntry = existing ?? { specKey: null, bytes: dataUrl.length };
    if (!existing) insert(dataUrl, entry); // load-only 新条目：先记 dataURL 字符串字节
    const promise = loadAdapter(dataUrl);
    entry.decoded = promise;
    promise.then(
      (image) => {
        // 补记：decode 完成按实际位图 width×height×4 校正记账，超额再逐出
        const width = (image as { width?: number }).width ?? 0;
        const height = (image as { height?: number }).height ?? 0;
        const bytes = dataUrl.length + width * height * 4;
        totalBytes += bytes - entry.bytes;
        entry.bytes = bytes;
        evictIfOverBudget();
      },
      () => {
        // 失败：保持现有记账（resolve 预记或 dataURL.length），不补位图字节
      },
    );
    return promise;
  }

  return {
    resolve,
    load,
    get size() {
      return lru.size;
    },
    clear() {
      lru.clear();
      specIndex.clear();
      totalBytes = 0;
    },
  };
}

/** 默认纹理供给（应用级单例；运行时 + 导出 + store 共用同一条管线）。 */
export const textureSupply: TextureSupply = createTextureSupply();
