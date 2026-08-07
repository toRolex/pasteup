import { describe, expect, it } from 'vitest';
import { Path, Pattern } from 'fabric';
import { createPaperElement, type PaperElement } from '../types/project';
import { createFabricPath, paperToFabricOptions } from './paperFactory';

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
    expect((path as unknown as { paperId: string }).paperId).toBe(el.id);
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
  it('传入合成 dataURL 时 fill 为 fabric Pattern（repeat），且不设 patternTransform', () => {
    const path = createFabricPath(sampleElement(), 'data:image/png;base64,iVBORw0KGgo=');

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
