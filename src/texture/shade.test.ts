/**
 * T8 纹理着色合成（tintTexture）测试。
 * seam：合成尺寸 = baseSize×scale 封顶 2048² / 合成公式（明度乘色，非混合模式）/
 *       旋转 90° 增量坐标映射烘焙（无损）/ 缩放双线性采样 / hexToRgb / imageDataToDataURL。
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_TEXTURE_SIZE,
  MIN_TEXTURE_SCALE,
  TEXTURE_BASE_SIZE,
  hexToRgb,
  imageDataToDataURL,
  tintTexture,
} from './shade';

/** 构造 size×size 灰度缓冲，指定单像素标记值为 value（其余 0）。 */
function grayWithMarker(size: number, markerCol: number, markerRow: number, value = 255): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(size * size);
  buf[markerRow * size + markerCol] = value;
  return buf;
}

/** 构造全常量灰度缓冲。 */
function grayFilled(size: number, value: number): Uint8ClampedArray {
  return new Uint8ClampedArray(size * size).fill(value);
}

const WHITE = { r: 255, g: 255, b: 255 };

describe('tintTexture 合成尺寸（seam 1a：输出 = baseSize×scale，封顶 2048²）', () => {
  it('默认 baseSize=1024、scale=1 → 1024²', () => {
    const out = tintTexture(grayFilled(4, 128), WHITE, 1, 0, 4);
    expect(out.width).toBe(4);
    expect(out.height).toBe(4);
  });

  it('baseSize=1024、scale=0.5 → 512²（下限）', () => {
    const out = tintTexture(grayFilled(TEXTURE_BASE_SIZE, 128), WHITE, 0.5, 0);
    expect(out.width).toBe(512);
    expect(out.height).toBe(512);
    expect(out.data).toHaveLength(512 * 512 * 4);
  });

  it('baseSize=1024、scale=2 → 2048²（上限）', () => {
    const out = tintTexture(grayFilled(TEXTURE_BASE_SIZE, 128), WHITE, 2, 0);
    expect(out.width).toBe(2048);
    expect(out.height).toBe(2048);
  });

  it('scale 超界被 clamp：>2 封顶 2048²、<0.5 保底 512²', () => {
    const cap = tintTexture(grayFilled(TEXTURE_BASE_SIZE, 128), WHITE, 3, 0);
    expect(cap.width).toBe(MAX_TEXTURE_SIZE);
    const floor = tintTexture(grayFilled(TEXTURE_BASE_SIZE, 128), WHITE, 0.2, 0);
    expect(floor.width).toBe(TEXTURE_BASE_SIZE * MIN_TEXTURE_SCALE);
  });

  it('scale 缩放关系：baseSize=16, scale=0.5→8 / 1→16 / 2→32', () => {
    expect(tintTexture(grayFilled(16, 128), WHITE, 0.5, 0, 16).width).toBe(8);
    expect(tintTexture(grayFilled(16, 128), WHITE, 1, 0, 16).width).toBe(16);
    expect(tintTexture(grayFilled(16, 128), WHITE, 2, 0, 16).width).toBe(32);
  });
});

describe('tintTexture 合成公式（seam 1b：明度乘色，程序合成非混合模式）', () => {
  it('灰 255 × 红色 → 全像素 (255,0,0,255)', () => {
    const out = tintTexture(grayFilled(4, 255), '#ff0000', 1, 0, 4);
    for (let i = 0; i < 4 * 4; i++) {
      expect(out.data[i * 4 + 0]).toBe(255);
      expect(out.data[i * 4 + 1]).toBe(0);
      expect(out.data[i * 4 + 2]).toBe(0);
      expect(out.data[i * 4 + 3]).toBe(255);
    }
  });

  it('灰 128 × 红色 → r=128（128/255×255）', () => {
    const out = tintTexture(grayFilled(2, 128), '#ff0000', 1, 0, 2);
    expect(out.data[0]).toBe(128);
  });

  it('灰 0 → 黑色（无染色）', () => {
    const out = tintTexture(grayFilled(2, 0), '#ff0000', 1, 0, 2);
    expect(out.data[0]).toBe(0);
    expect(out.data[1]).toBe(0);
    expect(out.data[2]).toBe(0);
  });

  it('自定义 {r,g,b} 颜色：灰 255 × (200,100,50) → (200,100,50)', () => {
    const out = tintTexture(grayFilled(2, 255), { r: 200, g: 100, b: 50 }, 1, 0, 2);
    expect(out.data[0]).toBe(200);
    expect(out.data[1]).toBe(100);
    expect(out.data[2]).toBe(50);
  });

  it('灰 255 × 白色 → 灰度原值（r=g=b=255）', () => {
    const out = tintTexture(grayFilled(2, 255), WHITE, 1, 0, 2);
    expect(out.data[0]).toBe(255);
    expect(out.data[1]).toBe(255);
    expect(out.data[2]).toBe(255);
  });
});

describe('tintTexture 旋转烘焙（seam 1c：90° 增量坐标映射，无损）', () => {
  const SIZE = 4;

  it('旋转 0：标记保持在左上角 (0,0)', () => {
    const out = tintTexture(grayWithMarker(SIZE, 0, 0), WHITE, 1, 0, SIZE);
    expect(out.data[0]).toBe(255); // (x=0,y=0)
    expect(out.data[(SIZE - 1) * SIZE * 4 + (SIZE - 1) * 4]).toBe(0); // 右下角非标记
  });

  it('旋转 90°（顺时针）：标记从左上角 (0,0) → 右上角 (3,0)', () => {
    const out = tintTexture(grayWithMarker(SIZE, 0, 0), WHITE, 1, 90, SIZE);
    const idx = (SIZE - 1) * 4; // x=3, y=0 → row0, col3
    expect(out.data[idx]).toBe(255);
    expect(out.data[0]).toBe(0); // 左上角非标记
  });

  it('旋转 180°：标记 → 右下角 (3,3)', () => {
    const out = tintTexture(grayWithMarker(SIZE, 0, 0), WHITE, 1, 180, SIZE);
    const idx = (SIZE - 1) * SIZE * 4 + (SIZE - 1) * 4; // (x=3,y=3)
    expect(out.data[idx]).toBe(255);
    expect(out.data[0]).toBe(0);
  });

  it('旋转 270°（逆时针 90°）：标记 → 左下角 (0,3)', () => {
    const out = tintTexture(grayWithMarker(SIZE, 0, 0), WHITE, 1, 270, SIZE);
    const idx = (SIZE - 1) * SIZE * 4; // x=0, y=3 → row3, col0
    expect(out.data[idx]).toBe(255);
    expect(out.data[0]).toBe(0);
  });

  it('旋转 90°：顶部中间标记 (1,0) → 右侧中间 (3,1)，验证旋转方向', () => {
    const out = tintTexture(grayWithMarker(SIZE, 1, 0), WHITE, 1, 90, SIZE);
    const idx = 1 * SIZE * 4 + (SIZE - 1) * 4; // x=3, y=1 → row1, col3
    expect(out.data[idx]).toBe(255);
  });
});

describe('tintTexture 缩放采样（seam 1d：双线性插值烘焙）', () => {
  const SIZE = 4;

  it('scale=2 放大：输出 (6,2) 精确采样 base (col3,row1)=255；相邻 (5,2) 为 50% 双线性混合', () => {
    const out = tintTexture(grayWithMarker(SIZE, 3, 1), WHITE, 2, 0, SIZE);
    // (x=6,y=2) → sx=3, sy=1 → 精确命中标记
    const exactIdx = 2 * (SIZE * 2) * 4 + 6 * 4;
    expect(out.data[exactIdx]).toBe(255);
    // (x=5,y=2) → sx=2.5 → 0 与 255 各 50% → 127.5 → 128
    const blendIdx = 2 * (SIZE * 2) * 4 + 5 * 4;
    expect(out.data[blendIdx]).toBe(128);
    // (x=0,y=0) → sx=0 → 非标记 0
    expect(out.data[0]).toBe(0);
  });

  it('scale=2 放大垂直方向：标记 (col0,row3) → 输出 (0,6) 精确、相邻 (0,5) 混合', () => {
    const out = tintTexture(grayWithMarker(SIZE, 0, 3), WHITE, 2, 0, SIZE);
    const exactIdx = 6 * (SIZE * 2) * 4 + 0; // x=0, y=6
    expect(out.data[exactIdx]).toBe(255);
    const blendIdx = 5 * (SIZE * 2) * 4 + 0; // x=0, y=5 → sy=2.5
    expect(out.data[blendIdx]).toBe(128);
  });
});

describe('hexToRgb（seam 2）', () => {
  it('解析 #rrggbb', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('#c0392b')).toEqual({ r: 192, g: 57, b: 43 });
  });

  it('解析 #rgb（每位翻倍）', () => {
    expect(hexToRgb('#0f0')).toEqual({ r: 0, g: 255, b: 0 });
    expect(hexToRgb('#abc')).toEqual({ r: 170, g: 187, b: 204 });
  });

  it('接受无 # 前缀与任意大小写', () => {
    expect(hexToRgb('c0392b')).toEqual({ r: 192, g: 57, b: 43 });
    expect(hexToRgb('#FF0000')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('非法 hex 抛错', () => {
    expect(() => hexToRgb('#zzz')).toThrow();
    expect(() => hexToRgb('red')).toThrow();
  });
});

describe('imageDataToDataURL（seam 3：独立封装的 dataURL 转换）', () => {
  it('把 TintedImage 转成 dataURL（浏览器真实跑，jsdom 走 mock toDataURL）', () => {
    const out = tintTexture(grayFilled(4, 128), WHITE, 1, 0, 4);
    const url = imageDataToDataURL(out);
    expect(typeof url).toBe('string');
    expect(url.startsWith('data:image/png')).toBe(true);
  });
});
