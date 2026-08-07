import { describe, expect, it } from 'vitest';
import { Path } from 'fabric';
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
});
