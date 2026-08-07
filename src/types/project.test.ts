import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createPaperElement,
  parseProject,
  serializeProject,
  type PaperProject,
} from './project';

describe('createEmptyProject（seam 1）', () => {
  it('返回符合 schema 默认值的空项目', () => {
    const project = createEmptyProject(1200, 800);

    expect(project.version).toBe(1);
    expect(project.canvas).toEqual({ width: 1200, height: 800 });
    expect(project.bgPhoto).toBeNull();
    expect(project.textures).toEqual([]);
    expect(project.elements).toEqual([]);
  });

  it('每次调用返回独立对象（不共享引用）', () => {
    const a = createEmptyProject(1, 1);
    const b = createEmptyProject(1, 1);
    expect(a).not.toBe(b);
    expect(a.elements).not.toBe(b.elements);
    a.elements.push(createPaperElement({ path: 'M0 0 Z', color: '#000' }));
    expect(b.elements).toHaveLength(0);
  });
});

describe('createPaperElement（seam 2）', () => {
  it('产出 schema 完整字段的纸片', () => {
    const el = createPaperElement({
      path: 'M 0 0 L 10 0 L 10 10 Z',
      color: '#c0392b',
    });

    expect(el.kind).toBe('paper');
    expect(el.path).toBe('M 0 0 L 10 0 L 10 10 Z');
    expect(el.color).toBe('#c0392b');
    expect(el.opacity).toBe(1);
    expect(el.textureId).toBeNull();
    expect(el.textureScale).toBe(1);
    expect(el.transform).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    expect(typeof el.id).toBe('string');
    expect(el.id.length).toBeGreaterThan(0);
  });

  it('支持覆盖默认字段（opacity/textureId/textureScale/transform）', () => {
    const el = createPaperElement({
      path: 'M 0 0 Z',
      color: '#7a8b5c',
      opacity: 0.6,
      textureId: 'tex-1',
      textureScale: 1.5,
      transform: { x: 40, y: 20, rotation: 90, scaleX: 2, scaleY: 0.5 },
    });

    expect(el.opacity).toBe(0.6);
    expect(el.textureId).toBe('tex-1');
    expect(el.textureScale).toBe(1.5);
    expect(el.transform).toEqual({ x: 40, y: 20, rotation: 90, scaleX: 2, scaleY: 0.5 });
  });
});

describe('serializeProject / parseProject（seam 3）', () => {
  it('项目 JSON 往返保真（不依赖 fabric toObject）', () => {
    const project: PaperProject = {
      version: 1,
      canvas: { width: 1200, height: 800 },
      bgPhoto: { dataUrl: 'data:image/png;base64,AAAA', visible: true },
      textures: [{ id: 'tex-1', dataUrl: 'data:image/png;base64,BBBB' }],
      elements: [
        createPaperElement({
          path: 'M 0 0 L 10 0 L 10 10 Z',
          color: '#c0392b',
          opacity: 0.8,
          textureId: 'tex-1',
          textureScale: 1.25,
          transform: { x: 12, y: 34, rotation: 45, scaleX: 1.5, scaleY: 0.75 },
        }),
      ],
    };

    const restored = parseProject(serializeProject(project));

    expect(restored).toEqual(project);
    // 纸片核心字段逐项断言，锁定共享契约字段名
    const el = restored.elements[0];
    expect(el).toMatchObject({
      kind: 'paper',
      path: 'M 0 0 L 10 0 L 10 10 Z',
      color: '#c0392b',
      opacity: 0.8,
      textureId: 'tex-1',
      textureScale: 1.25,
    });
    expect(el.transform).toEqual({ x: 12, y: 34, rotation: 45, scaleX: 1.5, scaleY: 0.75 });
  });

  it('parseProject 拒绝不支持的 version', () => {
    expect(() => parseProject('{"version":999,"canvas":{},"bgPhoto":null,"textures":[],"elements":[]}')).toThrow(
      /version/,
    );
  });
});
