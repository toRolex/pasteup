/**
 * T18 共享纹理加载器（运行时 + 导出共用同一条管线）。
 *
 * 把纹理 dataURL 异步加载为已解码的图像源（CanvasImageSource），供画布 pattern
 * 填充与导出复用。同一 dataURL 的加载结果复用（避免反复解码）；失败结果也缓存
 * （避免反复重试）。缓存可注入以便测试（jsdom 不能真实解码图片）。
 *
 * ADR 0001 硬性契约：纹理缩放/旋转已在合成时烘焙进 dataURL，pattern 不设
 * transform —— 运行时与导出共用同一数据源与加载管线，导出天然正确。
 */

/** 纹理源加载器（注入以便测试；浏览器默认实现见 loadTextureImage）。 */
export type TextureSourceLoader = (dataUrl: string) => Promise<CanvasImageSource>;

/** 共享纹理加载器句柄（运行时 + 导出共用；缓存可注入以便测试）。 */
export interface TextureLoader {
  /** 加载 dataURL 为已解码图像源；同一 dataURL 命中复用（成功/失败均缓存）。 */
  load(dataUrl: string): Promise<CanvasImageSource>;
  /** 当前缓存条目数。 */
  readonly size: number;
  /** 清空缓存（强制重新加载）。 */
  clear(): void;
}

/**
 * 把纹理 dataURL 加载为可被 `Pattern.toSVG()` 读取 width/height 的图片源。
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

export interface TextureLoaderOptions {
  /** 实际解码实现；未提供时走默认浏览器 Image 加载。 */
  load?: TextureSourceLoader;
  /** 结果缓存（dataURL → Promise）；未提供时新建默认 Map。 */
  cache?: Map<string, Promise<CanvasImageSource>>;
}

/**
 * 创建共享纹理加载器：per-dataURL 去重缓存。
 * 同一 dataURL 命中复用（成功源复用、失败 Promise 也缓存避免反复重试）；
 * 不同 dataURL 各自独立加载互不影响。
 */
export function createTextureLoader(options: TextureLoaderOptions = {}): TextureLoader {
  const cache = options.cache ?? new Map<string, Promise<CanvasImageSource>>();
  const load: TextureSourceLoader = options.load ?? loadTextureImage;

  return {
    load(dataUrl: string): Promise<CanvasImageSource> {
      const hit = cache.get(dataUrl);
      if (hit) return hit;
      const promise = load(dataUrl);
      cache.set(dataUrl, promise);
      return promise;
    },
    get size() {
      return cache.size;
    },
    clear() {
      cache.clear();
    },
  };
}

/** 默认运行时/导出共享加载器（应用级单例；同一 dataURL 解码结果跨会话复用）。 */
export const textureSourceLoader: TextureLoader = createTextureLoader();
