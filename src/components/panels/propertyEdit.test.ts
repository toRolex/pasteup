/**
 * T10 属性面板纯逻辑（seam 1/2）：
 * - 缩放/旋转/不透明度 clamp 与取值受限（50%–200%；0/90/180/270）
 * - 纹理重合成触发（属性变更 → tintCache 新 key → 新 dataURL）
 * - 属性编辑不可变更新（no-op 返回原 project 引用）
 */
import { describe, expect, it, vi } from 'vitest';
import { createEmptyProject, createPaperElement, createPaperTexture } from '../../types/project';
import {
  MAX_TEXTURE_SCALE,
  MIN_TEXTURE_SCALE,
} from '../../texture/shade';
import type { TintedTextureRequest } from '../../texture/cache';
import {
  applyOpacity,
  applyTextureProperty,
  clampOpacity,
  clampTextureScale,
  isTextureRotation,
  removeTexture,
  TEXTURE_ROTATIONS,
  updateElementProperty,
} from './propertyEdit';

function projectWithPaper(options: { texture?: boolean } = {}): ReturnType<typeof createEmptyProject> {
  const project = createEmptyProject(1200, 800);
  project.elements.push(
    createPaperElement({
      id: 'paper-1',
      path: 'M 0 0 L 100 0 L 100 80 L 0 80 Z',
      color: '#7A8B5C',
      opacity: 1,
      textureId: options.texture ? 'tex-1' : null,
      textureScale: 1,
      seed: 42,
    }),
  );
  if (options.texture) {
    project.textures.push(
      createPaperTexture({
        id: 'tex-1',
        style: 'fold',
        seed: 42,
        color: '#7A8B5C',
        scale: 1,
        rotate: 0,
        dataUrl: 'data:image/png;base64,OLD',
      }),
    );
  }
  return project;
}

/** 注入式 tintCache spy：key 编码进 dataURL，便于断言请求参数。 */
function mockTintCache() {
  return {
    get: vi.fn(
      (req: TintedTextureRequest) =>
        `url:${req.texId}:${req.color}:${req.scale}:${req.rotate}`,
    ),
  };
}

describe('clamp 纯逻辑（seam 1）', () => {
  it('clampOpacity 限制在 0–1', () => {
    expect(clampOpacity(0.5)).toBe(0.5);
    expect(clampOpacity(-0.1)).toBe(0);
    expect(clampOpacity(1.5)).toBe(1);
  });

  it('clampTextureScale 限制在 0.5–2（50%–200%）', () => {
    expect(clampTextureScale(1)).toBe(1);
    expect(clampTextureScale(0.1)).toBe(MIN_TEXTURE_SCALE);
    expect(clampTextureScale(3)).toBe(MAX_TEXTURE_SCALE);
  });

  it('TEXTURE_ROTATIONS 仅含 90° 增量四值', () => {
    expect(TEXTURE_ROTATIONS).toEqual([0, 90, 180, 270]);
  });

  it('isTextureRotation 校验 90° 增量', () => {
    expect(isTextureRotation(0)).toBe(true);
    expect(isTextureRotation(90)).toBe(true);
    expect(isTextureRotation(180)).toBe(true);
    expect(isTextureRotation(270)).toBe(true);
    expect(isTextureRotation(45)).toBe(false);
  });
});

describe('applyOpacity（seam 1）', () => {
  it('更新不透明度（clamp）且不可变', () => {
    const project = projectWithPaper();
    const next = applyOpacity(project, 'paper-1', 0.3);
    expect(next.elements[0].opacity).toBe(0.3);
    expect(project.elements[0].opacity).toBe(1);
  });

  it('越界 clamp 到 0/1', () => {
    const project = projectWithPaper();
    expect(applyOpacity(project, 'paper-1', 1.5).elements[0].opacity).toBe(1);
    expect(applyOpacity(project, 'paper-1', -1).elements[0].opacity).toBe(0);
  });

  it('相同值返回原 project 引用（no-op，不污染撤销栈）', () => {
    const project = projectWithPaper();
    expect(applyOpacity(project, 'paper-1', 1)).toBe(project);
  });

  it('找不到元素返回原 project', () => {
    const project = projectWithPaper();
    expect(applyOpacity(project, 'missing', 0.5)).toBe(project);
  });
});

describe('applyTextureProperty 重合成触发（seam 2）', () => {
  it('无纹理纸片改色：仅 element.color 变更，不触发重合成', () => {
    const project = projectWithPaper();
    const tintCache = mockTintCache();
    const next = applyTextureProperty(project, 'paper-1', { color: '#ff0000' }, tintCache);
    expect(next.elements[0].color).toBe('#ff0000');
    expect(next.textures).toEqual([]);
    expect(tintCache.get).not.toHaveBeenCalled();
  });

  it('有纹理纸片改色：触发重合成，texture 与 element 颜色同步', () => {
    const project = projectWithPaper({ texture: true });
    const tintCache = mockTintCache();
    const next = applyTextureProperty(project, 'paper-1', { color: '#ff0000' }, tintCache);
    expect(tintCache.get).toHaveBeenCalledTimes(1);
    const req = tintCache.get.mock.calls[0][0] as TintedTextureRequest;
    expect(req.texId).toBe('tex-1');
    expect(req.color).toBe('#ff0000');
    expect(next.textures[0].color).toBe('#ff0000');
    expect(next.textures[0].dataUrl).toBe('url:tex-1:#ff0000:1:0');
    expect(next.elements[0].color).toBe('#ff0000');
  });

  it('纹理缩放越界 clamp 到 0.5–2，element.textureScale 同步', () => {
    const project = projectWithPaper({ texture: true });
    const tintCache = mockTintCache();
    const next = applyTextureProperty(project, 'paper-1', { scale: 3 }, tintCache);
    expect(next.textures[0].scale).toBe(MAX_TEXTURE_SCALE);
    expect(next.elements[0].textureScale).toBe(MAX_TEXTURE_SCALE);
    expect((tintCache.get.mock.calls[0][0] as TintedTextureRequest).scale).toBe(MAX_TEXTURE_SCALE);

    const low = applyTextureProperty(projectWithPaper({ texture: true }), 'paper-1', { scale: 0.1 }, tintCache);
    expect(low.textures[0].scale).toBe(MIN_TEXTURE_SCALE);
  });

  it('旋转纹理：texture.rotate 更新并重合成', () => {
    const project = projectWithPaper({ texture: true });
    const tintCache = mockTintCache();
    const next = applyTextureProperty(project, 'paper-1', { rotate: 90 }, tintCache);
    expect(next.textures[0].rotate).toBe(90);
    expect((tintCache.get.mock.calls[0][0] as TintedTextureRequest).rotate).toBe(90);
  });

  it('切换纹理风格：生成新 texId 记录（同 seed），旧记录被清理', () => {
    const project = projectWithPaper({ texture: true });
    const tintCache = mockTintCache();
    const next = applyTextureProperty(project, 'paper-1', { style: 'grain' }, tintCache);
    const el = next.elements[0];
    expect(el.textureId).not.toBe('tex-1');
    const newTex = next.textures.find((t) => t.id === el.textureId);
    expect(newTex?.style).toBe('grain');
    expect(newTex?.seed).toBe(42);
    expect(next.textures).toHaveLength(1); // 旧 tex-1 不再被引用 → 清理
    expect((tintCache.get.mock.calls[0][0] as TintedTextureRequest).style).toBe('grain');
  });

  it('无实质变更返回原 project 引用（no-op）', () => {
    const project = projectWithPaper({ texture: true });
    const tintCache = mockTintCache();
    expect(applyTextureProperty(project, 'paper-1', { color: '#7A8B5C' }, tintCache)).toBe(project);
    expect(applyTextureProperty(project, 'paper-1', { rotate: 0 }, tintCache)).toBe(project);
    expect(applyTextureProperty(project, 'paper-1', { scale: 1 }, tintCache)).toBe(project);
    expect(tintCache.get).not.toHaveBeenCalled();
  });

  it('已是同风格纹理再点该风格为 no-op（不换 texId）', () => {
    const project = projectWithPaper({ texture: true }); // 已有 fold
    const tintCache = mockTintCache();
    const next = applyTextureProperty(project, 'paper-1', { style: 'fold' }, tintCache);
    expect(next).toBe(project);
    expect(tintCache.get).not.toHaveBeenCalled();
  });

  it('找不到元素返回原 project', () => {
    const project = projectWithPaper({ texture: true });
    const tintCache = mockTintCache();
    expect(applyTextureProperty(project, 'missing', { color: '#ff0000' }, tintCache)).toBe(project);
  });
});

describe('removeTexture（seam 2）', () => {
  it('清除 textureId 并清理孤儿纹理记录', () => {
    const project = projectWithPaper({ texture: true });
    const next = removeTexture(project, 'paper-1');
    expect(next.elements[0].textureId).toBeNull();
    expect(next.textures).toEqual([]);
    expect(project.textures).toHaveLength(1); // 原 project 不可变
  });

  it('保留仍被其他纸片引用的纹理记录', () => {
    const project = projectWithPaper({ texture: true });
    project.elements.push(
      createPaperElement({
        id: 'paper-2',
        path: 'M 0 0 L 1 0 L 0 1 Z',
        color: '#000000',
        textureId: 'tex-1',
      }),
    );
    const next = removeTexture(project, 'paper-1');
    expect(next.elements[0].textureId).toBeNull();
    expect(next.textures).toHaveLength(1); // paper-2 仍引用 tex-1
  });

  it('已无纹理时返回原 project（no-op）', () => {
    const project = projectWithPaper();
    expect(removeTexture(project, 'paper-1')).toBe(project);
  });
});

describe('updateElementProperty（seam 1）', () => {
  it('找不到元素返回原 project', () => {
    const project = projectWithPaper();
    expect(
      updateElementProperty(project, 'missing', (el) => ({ ...el, color: '#ffffff' })),
    ).toBe(project);
  });

  it('更新回调未改引用时返回原 project', () => {
    const project = projectWithPaper();
    expect(updateElementProperty(project, 'paper-1', (el) => el)).toBe(project);
  });
});
