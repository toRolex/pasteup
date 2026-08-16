/**
 * staticScene —— PNG/SVG 共享的离线重建底层（#49）。
 *
 * seam：`buildStaticCanvas(project, sources, backgroundImage?) → StaticCanvas` 同步纯函数。
 * 从 schema 经 StaticCanvas 重建（不碰活画布），纹理命中 sources 用 Pattern 填充、缺失回退纯色；
 * 底图由调用方预加载后传参（共享层保持同步纯粹，SVG 不传第三参）。返回的 canvas 由调用方
 * toDataURL/toSVG 后 dispose（本测试只断言重建结果，dispose 行为经 png/svg 导出测试覆盖）。
 */
import { describe, expect, it, vi } from 'vitest';
import { Pattern, type FabricImage } from 'fabric';
import { buildStaticCanvas } from './staticScene';
import {
  createEmptyProject,
  createPaperElement,
  createPaperTexture,
} from '../types/project';

const RECT = 'M 0 0 L 100 0 L 100 80 L 0 80 Z';

/** jsdom fake 已解码纹理源（真实管线在浏览器 Image decode，测试注入）。 */
const FAKE_SOURCE = {
  width: 64,
  height: 48,
  src: 'data:image/png;base64,AAAA',
} as unknown as CanvasImageSource;

describe('buildStaticCanvas（离线重建共享底层 seam）', () => {
  it('按 project.canvas 尺寸创建 StaticCanvas', () => {
    const project = createEmptyProject(2480, 3508);
    const canvas = buildStaticCanvas(project, new Map());
    expect(canvas.width).toBe(2480);
    expect(canvas.height).toBe(3508);
  });

  it('每个元素重建为一个 fabric 对象（数组序即 z 序，从底到顶）', () => {
    const project = createEmptyProject(1200, 800);
    project.elements.push(
      createPaperElement({ path: RECT, color: '#c0392b' }),
      createPaperElement({
        path: RECT,
        color: '#2e86c1',
        transform: { x: 500, y: 300, rotation: 0, scaleX: 1, scaleY: 1 },
      }),
    );
    const canvas = buildStaticCanvas(project, new Map());
    expect(canvas.getObjects()).toHaveLength(2);
  });

  it('textureId 命中 sources → Pattern 填充（纹理色而非占位纯色）', () => {
    const project = createEmptyProject(1200, 800);
    project.textures.push(
      createPaperTexture({ id: 'tex-1', style: 'fold', seed: 1, color: '#c0392b', dataUrl: 'data:image/png;base64,AAAA' }),
    );
    project.elements.push(createPaperElement({ path: RECT, color: '#c0392b', textureId: 'tex-1' }));
    const canvas = buildStaticCanvas(project, new Map([['tex-1', FAKE_SOURCE]]));
    expect(canvas.getObjects()[0].fill).toBeInstanceOf(Pattern);
  });

  it('textureId 在 sources 缺失/悬空引用 → 回退纯色填充（createFabricPath 语义）', () => {
    const project = createEmptyProject(1200, 800);
    project.elements.push(createPaperElement({ path: RECT, color: '#c0392b', textureId: 'tex-missing' }));
    const canvas = buildStaticCanvas(project, new Map());
    expect(canvas.getObjects()[0].fill).toBe('#c0392b');
  });

  it('无纹理纸片（textureId null）→ 纯色填充，无 Pattern', () => {
    const project = createEmptyProject(1200, 800);
    project.elements.push(createPaperElement({ path: RECT, color: '#c0392b' }));
    const canvas = buildStaticCanvas(project, new Map());
    expect(canvas.getObjects()[0].fill).toBe('#c0392b');
  });

  it('传入 backgroundImage → 设为 canvas.backgroundImage；不传 → 不含底图', () => {
    const project = createEmptyProject(1200, 800);
    const fakeBg = { dispose: vi.fn(), render: vi.fn() } as unknown as FabricImage;
    const withBg = buildStaticCanvas(project, new Map(), fakeBg);
    expect(withBg.backgroundImage).toBe(fakeBg);

    const noBg = buildStaticCanvas(project, new Map());
    expect(noBg.backgroundImage).toBeUndefined();
  });
});
