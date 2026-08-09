/**
 * T18 共享纹理加载器测试。
 *
 * S1 去重缓存：同一 dataURL 成功源复用；失败结果也缓存（避免反复重试）。
 * S2 独立加载：不同 dataURL 互不影响。
 * S3 缓存管理：size / clear / 可注入 cache。
 */
import { describe, expect, it, vi } from 'vitest';
import { createTextureLoader } from './loader';

function fakeSource(url: string): CanvasImageSource {
  return { width: url.length, height: 1, src: url } as unknown as CanvasImageSource;
}

describe('createTextureLoader（S1 去重缓存）', () => {
  it('同一 dataURL 加载结果复用：底层 load 只调用一次，两次返回同一源', async () => {
    const load = vi.fn(async (url: string) => fakeSource(url));
    const loader = createTextureLoader({ load });

    const a = await loader.load('data:image/png;base64,AAA');
    const b = await loader.load('data:image/png;base64,AAA');

    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('data:image/png;base64,AAA');
  });

  it('同一 dataURL 的失败结果也缓存：只尝试一次，重复调用仍拒绝', async () => {
    const load = vi.fn(async () => {
      throw new Error('decode fail');
    });
    const loader = createTextureLoader({ load });

    await expect(loader.load('data:image/png;base64,AAA')).rejects.toThrow('decode fail');
    await expect(loader.load('data:image/png;base64,AAA')).rejects.toThrow('decode fail');
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('createTextureLoader（S2 独立加载）', () => {
  it('不同 dataURL 各自独立加载互不影响', async () => {
    const load = vi.fn(async (url: string) => fakeSource(url));
    const loader = createTextureLoader({ load });

    const a = await loader.load('data:image/png;base64,AAA');
    const b = await loader.load('data:image/png;base64,BBB');

    expect(a).not.toBe(b);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('createTextureLoader（S3 缓存管理）', () => {
  it('size 反映当前缓存条目数，clear() 清空后重新加载', async () => {
    const load = vi.fn(async (url: string) => fakeSource(url));
    const loader = createTextureLoader({ load });

    expect(loader.size).toBe(0);
    await loader.load('AAA');
    expect(loader.size).toBe(1);

    loader.clear();
    expect(loader.size).toBe(0);
    await loader.load('AAA');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('可注入缓存实例（便于测试控制）', async () => {
    const cache = new Map<string, Promise<CanvasImageSource>>();
    const load = vi.fn(async (url: string) => fakeSource(url));
    const loader = createTextureLoader({ load, cache });

    await loader.load('AAA');
    expect(cache.size).toBe(1);
    expect(loader.size).toBe(1);
  });
});
