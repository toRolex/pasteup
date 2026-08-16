/**
 * #48 textureSupply 测试 —— 两层薄缓存（cache + loader）折叠的单对象。
 *
 * seam：
 * - resolve(spec) 同步：命中复用（compose spy 不重合成）/ 未命中合成；spec key 颜色归一化小写 hex。
 * - 统一字节 LRU：dataURL 为 key，`dataURL.length + width×height×4` 记账；超额逐出最旧至预算下。
 * - spec→dataURL 轻量前向索引，生命周期绑死 LRU 条目（逐出删索引 → 再 resolve 重合成）。
 * - load(dataUrl) 异步：adapter 注入；同一 dataURL 去重（成功/失败 Promise 均缓存）；decode 后补记字节。
 *
 * 用例自 cache.test / loader.test 迁入重生（替换不分层）。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createTextureSupply,
  type ComposeTinted,
  type TintedTextureRequest,
} from './supply';

function spec(overrides: Partial<TintedTextureRequest> = {}): TintedTextureRequest {
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

/** jsdom fake 已解码图像源（带 width/height 供字节补记）。 */
function fakeSource(url: string, width = 8, height = 8): CanvasImageSource {
  return { width, height, src: url } as unknown as CanvasImageSource;
}

/** flush 微任务 + 宏任务一轮（让 load 的 decode 补记 .then 落定）。 */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('resolve（seam：命中复用 / 未命中合成）', () => {
  it('同 spec 命中复用：compose 只调一次，两次返回同一 dataURL', () => {
    const compose = vi.fn((r: TintedTextureRequest) => `u:${r.texId}`);
    const supply = createTextureSupply({ compose });

    const first = supply.resolve(spec());
    const second = supply.resolve(spec());

    expect(second).toBe(first);
    expect(compose).toHaveBeenCalledTimes(1);
  });

  it('spec key 颜色归一化：#FF0000 与 #ff0000 同 key（compose 不重合成）', () => {
    const compose = vi.fn((r: TintedTextureRequest) => `u:${r.texId}`);
    const supply = createTextureSupply({ compose });

    supply.resolve(spec({ color: '#FF0000' }));
    supply.resolve(spec({ color: '#ff0000' }));

    expect(compose).toHaveBeenCalledTimes(1);
  });

  it('变更 color / scale / rotate / texId 任一维 → 新 key 重合成', () => {
    const compose = vi.fn((r: TintedTextureRequest) => `u:${r.texId}:${r.color}:${r.scale}:${r.rotate}`);
    const supply = createTextureSupply({ compose });

    supply.resolve(spec({ color: '#ff0000' }));
    supply.resolve(spec({ color: '#00ff00' })); // color 变
    supply.resolve(spec({ scale: 2 })); // scale 变
    supply.resolve(spec({ rotate: 90 })); // rotate 变
    supply.resolve(spec({ texId: 'tex-2' })); // texId 变

    expect(compose).toHaveBeenCalledTimes(5);
  });

  it('clear 清空后再 resolve 重合成', () => {
    const compose = vi.fn((r: TintedTextureRequest) => `u:${r.texId}`);
    const supply = createTextureSupply({ compose });

    supply.resolve(spec());
    supply.clear();
    supply.resolve(spec());

    expect(compose).toHaveBeenCalledTimes(2);
  });

  it('默认 compose 走真实管线（generate → tint → dataURL），小 baseSize 冒烟', () => {
    const supply = createTextureSupply({ baseSize: 8 });
    const url = supply.resolve(spec({ style: 'fold', seed: 7 }));
    expect(typeof url).toBe('string');
    expect(url.startsWith('data:image/png')).toBe(true);
  });
});

describe('统一字节 LRU + spec 索引生命周期（seam：按字节记账，超额逐出最旧，逐出删索引）', () => {
  // baseSize=8 → outputSize=8 → 位图 8×8×4=256 字节；compose 产 4 字符 dataURL → 每条约 260 字节。
  // 预算 520 = 2 条：resolve 第 3 条触发逐出最旧。
  const compose: ComposeTinted = (r) => `u:${r.texId}`; // 'u:ta' 等长 4

  it('超额逐出最旧至预算下：被逐出者再 resolve 重合成，命中者不重合成', () => {
    const spy = vi.fn(compose);
    const supply = createTextureSupply({ compose: spy, budget: 520, baseSize: 8 });

    supply.resolve(spec({ texId: 'ta' }));
    supply.resolve(spec({ texId: 'tb' }));
    supply.resolve(spec({ texId: 'tc' })); // 累计 780 > 520 → 逐出最旧 ta
    expect(spy).toHaveBeenCalledTimes(3);
    expect(supply.size).toBe(2); // ta 被逐出，剩 tb/tc

    supply.resolve(spec({ texId: 'tc' })); // 仍命中 → 不重合成
    expect(spy).toHaveBeenCalledTimes(3);

    supply.resolve(spec({ texId: 'ta' })); // ta 已逐出（索引已删）→ 重合成
    expect(spy).toHaveBeenCalledTimes(4);
    expect(supply.size).toBe(2); // ta 回、tb 被逐出
  });

  it('索引绑死 LRU 条目：LRU 命中即索引命中（同 spec 复用同一 dataURL）', () => {
    const spy = vi.fn(compose);
    const supply = createTextureSupply({ compose: spy, budget: 520, baseSize: 8 });

    const a1 = supply.resolve(spec({ texId: 'ta' }));
    const a2 = supply.resolve(spec({ texId: 'ta' }));

    expect(a2).toBe(a1);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('load（seam：adapter 注入 + per-dataURL 去重 + decode 补记）', () => {
  it('adapter 注入：load 走注入的 decode，同一 dataURL 复用（只调一次）', async () => {
    const load = vi.fn(async (url: string) => fakeSource(url));
    const supply = createTextureSupply({ load });

    const a = await supply.load('data:image/png;base64,AAA');
    const b = await supply.load('data:image/png;base64,AAA');

    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('data:image/png;base64,AAA');
  });

  it('同一 dataURL 的失败结果也缓存：只尝试一次，重复调用仍拒绝', async () => {
    const load = vi.fn(async () => {
      throw new Error('decode fail');
    });
    const supply = createTextureSupply({ load });

    await expect(supply.load('data:image/png;base64,AAA')).rejects.toThrow('decode fail');
    await expect(supply.load('data:image/png;base64,AAA')).rejects.toThrow('decode fail');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('不同 dataURL 各自独立加载互不影响', async () => {
    const load = vi.fn(async (url: string) => fakeSource(url));
    const supply = createTextureSupply({ load });

    const a = await supply.load('AAA');
    const b = await supply.load('BBB');

    expect(a).not.toBe(b);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('size 反映条目数，clear 清空后重新加载', async () => {
    const load = vi.fn(async (url: string) => fakeSource(url));
    const supply = createTextureSupply({ load });

    expect(supply.size).toBe(0);
    await supply.load('AAA');
    expect(supply.size).toBe(1);

    supply.clear();
    expect(supply.size).toBe(0);
    await supply.load('AAA');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('decode 完成后补记位图字节：load-only 条目计入预算并参与逐出', async () => {
    // 预算 270 仅容 1 条 8×8 位图（256B + dataURL 4B = 260B）；两条都 decode 补记后累计 520 → 逐出最旧。
    const load = vi.fn(async (url: string) => fakeSource(url, 8, 8));
    const supply = createTextureSupply({ load, budget: 270 });

    await supply.load('AAAA'); // 4 + 补记 256 = 260
    await supply.load('BBBB'); // 260；累计 520 > 270 → 逐出最旧 AAAA
    await flush();

    await supply.load('AAAA'); // AAAA 已逐出 → 重新加载
    expect(load).toHaveBeenCalledTimes(3);
    expect(load).toHaveBeenNthCalledWith(3, 'AAAA');
  });
});
