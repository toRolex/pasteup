import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import { Canvas, Path, Pattern, type FabricObject } from 'fabric';
import { createPaperElement, type PaperElement, type ProjectTransform } from '../types/project';
import {
  createFabricPath,
  findPaperObject,
  paperToFabricOptions,
  readTransform,
} from './paperBridge';

function sampleElement(overrides: Partial<PaperElement> = {}): PaperElement {
  return {
    ...createPaperElement({
      path: 'M 0 0 L 100 0 L 100 80 L 0 80 Z',
      color: '#c0392b',
      opacity: 0.85,
      textureId: 'tex-1',
      textureScale: 1.5,
      transform: { x: 24, y: 48, rotation: 90, scaleX: 2, scaleY: 0.5 },
    }),
    ...overrides,
  };
}

describe('paperToFabricOptions（seam 4）', () => {
  it('把 paper schema 映射为 fabric Path 选项', () => {
    const el = sampleElement();
    const opts = paperToFabricOptions(el);

    expect(opts.path).toBe(el.path);
    expect(opts.left).toBe(el.transform.x);
    expect(opts.top).toBe(el.transform.y);
    expect(opts.fill).toBe(el.color);
    expect(opts.opacity).toBe(el.opacity);
    expect(opts.scaleX).toBe(el.transform.scaleX);
    expect(opts.scaleY).toBe(el.transform.scaleY);
    expect(opts.angle).toBe(el.transform.rotation);
    expect(opts.paperId).toBe(el.id);
  });
});

describe('createFabricPath（seam 5）', () => {
  it('创建带基础样式的 fabric.Path 实例', () => {
    const el = sampleElement();
    const path = createFabricPath(el);

    expect(path).toBeInstanceOf(Path);
    expect(path.fill).toBe(el.color);
    expect(path.opacity).toBe(el.opacity);
    expect(path.left).toBe(el.transform.x);
    expect(path.top).toBe(el.transform.y);
    expect(path.angle).toBe(el.transform.rotation);
    expect(path.scaleX).toBe(el.transform.scaleX);
    expect(path.scaleY).toBe(el.transform.scaleY);
  });

  it('创建后可通过对象读取 paperId（用于事件回灌定位元素）', () => {
    const el = sampleElement();
    const path = createFabricPath(el);
    expect(path.paperId).toBe(el.id);
  });

  it('纸片带基础层叠投影（fabric shadow：柔和、offsetY 下沉表达层叠浮起）', () => {
    const path = createFabricPath(sampleElement());
    expect(path.shadow).not.toBeNull();
    expect(path.shadow!.offsetY).toBeGreaterThan(0);
    expect(path.shadow!.blur).toBeGreaterThan(0);
  });

  it('纸片带厚度质感（深色描边模拟纸片边缘厚度）', () => {
    const path = createFabricPath(sampleElement());
    expect(path.stroke).toBeTruthy();
    expect(path.strokeWidth).toBeGreaterThan(0);
  });
});

describe('createFabricPath pattern 填充（seam 6，ADR 0001 硬性契约）', () => {
  it('传入已解码图像源时 fill 为 fabric Pattern（repeat），且不设 patternTransform', () => {
    const fakeSource = {
      width: 64,
      height: 48,
      src: 'data:image/png;base64,iVBORw0KGgo=',
    } as unknown as CanvasImageSource;
    const path = createFabricPath(sampleElement(), fakeSource);

    expect(path.fill).toBeInstanceOf(Pattern);
    const fill = path.fill as unknown as { repeat?: string; patternTransform?: unknown };
    expect(fill.repeat).toBe('repeat');
    // ADR 0001：pattern 完全不设 transform —— 运行时与导出共用同一数据源
    expect(fill.patternTransform).toBeUndefined();
  });

  it('未传合成 dataURL 时保持纯色填充（现有行为不回归）', () => {
    const el = sampleElement();
    const path = createFabricPath(el);
    expect(path.fill).toBe(el.color);
  });
});

describe('readTransform（反向纯映射，与 paperToFabricOptions 手写逐字段 round-trip 锁）', () => {
  const fallback: ProjectTransform = { x: 1, y: 2, rotation: 3, scaleX: 4, scaleY: 5 };

  it('正反向 round-trip：createFabricPath 构造 → readTransform 读回，非平凡 rotation/scale 还原', () => {
    const el = sampleElement(); // transform { x: 24, y: 48, rotation: 90, scaleX: 2, scaleY: 0.5 }
    const path = createFabricPath(el);
    const identity: ProjectTransform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    expect(readTransform(path, identity)).toEqual(el.transform);
  });

  it('缺字段逐字段 ?? 回落 fallback（部分缺）', () => {
    expect(readTransform({ left: 10, angle: 45 }, fallback)).toEqual({
      x: 10,
      y: 2,
      rotation: 45,
      scaleX: 4,
      scaleY: 5,
    });
  });

  it('全缺字段整体回落 fallback', () => {
    expect(readTransform({}, fallback)).toEqual(fallback);
  });

  it('零值不被 ?? 误判为缺（0 是有效 transform 值，须经 ?? 而非 ||）', () => {
    expect(
      readTransform({ left: 0, top: 0, angle: 0, scaleX: 0, scaleY: 0 }, fallback),
    ).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 0, scaleY: 0 });
  });
});

describe('findPaperObject（fabric 侧 paperId 定位单入口）', () => {
  const canvases: Canvas[] = [];
  afterEach(() => {
    canvases.splice(0).forEach((c) => c.dispose());
  });

  function mountCanvas(): Canvas {
    const canvas = new Canvas(document.createElement('canvas'), { width: 400, height: 300 });
    canvases.push(canvas);
    return canvas;
  }

  it('按 paperId 定位画布中的纸片对象；未命中返回 undefined', () => {
    const canvas = mountCanvas();
    const el = sampleElement();
    canvas.add(createFabricPath(el));

    const found = findPaperObject(canvas, el.id);
    expect(found).toBeDefined();
    expect(found?.paperId).toBe(el.id);
    expect(findPaperObject(canvas, 'nonexistent-id')).toBeUndefined();
  });

  it('多个纸片时按 paperId 精确定位（不误中其他对象）', () => {
    const canvas = mountCanvas();
    const a = sampleElement();
    const b = sampleElement();
    canvas.add(createFabricPath(a));
    canvas.add(createFabricPath(b));

    expect(findPaperObject(canvas, a.id)?.paperId).toBe(a.id);
    expect(findPaperObject(canvas, b.id)?.paperId).toBe(b.id);
  });
});

describe('paperId 声明合并承载（type-level 锁写向，防 fabric 升级静默失效）', () => {
  it('paperId 读写双向类型安全：写 string 可编译，属性类型为 string | undefined', () => {
    const path = createFabricPath(sampleElement());
    // 写向锁：string 可赋给 paperId（声明合并生效的编译期证据；fabric 升级破合并则 tsc fail-fast）。
    path.paperId = 'locked-id';
    expect(path.paperId).toBe('locked-id');
    // type-level：paperId 属性类型为 string | undefined（索引访问，破合并即编译错误）。
    expectTypeOf<FabricObject['paperId']>().toEqualTypeOf<string | undefined>();
  });
});
