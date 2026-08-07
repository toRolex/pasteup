/**
 * T8 纹理着色缓存测试。
 * seam：缓存 key `texId:color:scale:rotate`（颜色归一化规范小写 hex）/ 命中复用（spy 计数不重合成）/
 *       变更失效重合成 / LRU 上限驱逐。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  TextureCache,
  createTintCache,
  tintCacheKey,
  type TintedTextureRequest,
} from './cache';

function request(overrides: Partial<TintedTextureRequest> = {}): TintedTextureRequest {
  return {
    texId: 'tex-1',
    style: 'fold',
    seed: 42,
    color: '#ff0000',
    scale: 1,
    rotate: 0,
    ...overrides,
  };
}

describe('tintCacheKey（seam 4：key = texId:color:scale:rotate）', () => {
  it('颜色归一化为规范小写 hex（#FF0000 → #ff0000）', () => {
    expect(tintCacheKey('tex-1', '#FF0000', 1, 0)).toBe('tex-1:#ff0000:1:0');
  });

  it('无 # 与 3 位 hex 归一化', () => {
    expect(tintCacheKey('t', '00ff00', 1, 0)).toBe('t:#00ff00:1:0');
    expect(tintCacheKey('t', '#abc', 1, 0)).toBe('t:#aabbcc:1:0');
  });

  it('scale/rotate 用数值 key，区分不同参数', () => {
    expect(tintCacheKey('t', '#ff0000', 0.5, 90)).toBe('t:#ff0000:0.5:90');
    expect(tintCacheKey('t', '#ff0000', 1, 90)).not.toBe(tintCacheKey('t', '#ff0000', 0.5, 90));
  });
});

describe('TextureCache（LRU）', () => {
  it('命中即复用并置为最近使用；set 超限驱逐最旧', () => {
    const cache = new TextureCache(2);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.get('a'); // a 变为最近使用
    cache.set('c', '3'); // 驱逐最旧 b
    expect(cache.get('a')).toBe('1');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe('3');
    expect(cache.size).toBe(2);
  });
});

describe('createTintCache（seam 5：命中复用 / 变更失效重合成）', () => {
  it('同 key 命中复用：二次获取不重复合成（compose spy 只调一次）', () => {
    const compose = vi.fn(() => 'data:image/png;base64,MOCK');
    const cache = createTintCache({ compose });

    const first = cache.get(request());
    const second = cache.get(request());

    expect(first).toBe('data:image/png;base64,MOCK');
    expect(second).toBe(first);
    expect(compose).toHaveBeenCalledTimes(1);
  });

  it('变更 color 触发新 key 重合成', () => {
    const compose = vi.fn(() => 'data:image/png;base64,MOCK');
    const cache = createTintCache({ compose });

    cache.get(request({ color: '#ff0000' }));
    cache.get(request({ color: '#00ff00' }));

    expect(compose).toHaveBeenCalledTimes(2);
  });

  it('变更 scale 触发新 key 重合成', () => {
    const compose = vi.fn(() => 'data:image/png;base64,MOCK');
    const cache = createTintCache({ compose });

    cache.get(request({ scale: 1 }));
    cache.get(request({ scale: 2 }));

    expect(compose).toHaveBeenCalledTimes(2);
  });

  it('变更 rotate 触发新 key 重合成', () => {
    const compose = vi.fn(() => 'data:image/png;base64,MOCK');
    const cache = createTintCache({ compose });

    cache.get(request({ rotate: 0 }));
    cache.get(request({ rotate: 90 }));

    expect(compose).toHaveBeenCalledTimes(2);
  });

  it('变更 texId 触发新 key 重合成', () => {
    const compose = vi.fn(() => 'data:image/png;base64,MOCK');
    const cache = createTintCache({ compose });

    cache.get(request({ texId: 'tex-1' }));
    cache.get(request({ texId: 'tex-2' }));

    expect(compose).toHaveBeenCalledTimes(2);
  });

  it('LRU 上限：超出后最旧 key 被驱逐，再取重合成', () => {
    const compose = vi.fn(() => 'data:image/png;base64,MOCK');
    const cache = createTintCache({ compose, cache: new TextureCache(2) });

    cache.get(request({ texId: 'a' }));
    cache.get(request({ texId: 'b' }));
    cache.get(request({ texId: 'c' })); // 驱逐 a
    expect(compose).toHaveBeenCalledTimes(3);

    cache.get(request({ texId: 'a' })); // 被驱逐 → 重合成；set(a) 超限再驱逐 b
    expect(compose).toHaveBeenCalledTimes(4);

    cache.get(request({ texId: 'c' })); // 仍在缓存 → 命中复用
    expect(compose).toHaveBeenCalledTimes(4);
  });

  it('clear 清空缓存', () => {
    const compose = vi.fn(() => 'data:image/png;base64,MOCK');
    const cache = createTintCache({ compose });

    cache.get(request());
    cache.clear();
    cache.get(request());

    expect(compose).toHaveBeenCalledTimes(2);
  });

  it('默认 compose 走完整管线（generate → tint → dataURL），小 baseSize 冒烟', () => {
    const cache = createTintCache({ baseSize: 8 });
    const url = cache.get(request({ style: 'fold', seed: 7 }));
    expect(typeof url).toBe('string');
    expect(url.startsWith('data:image/png')).toBe(true);
  });
});
