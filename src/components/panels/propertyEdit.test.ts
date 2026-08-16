/**
 * T10 属性面板纯逻辑（seam 1/2）+#48 拆分：
 * - 缩放/旋转/不透明度 clamp 与取值受限（50%–200%；0/90/180/270）
 * - planTextureProps 纯 plan：判 no-op / 算新建或更新变体 / 产 TintedTextureRequest（不触发合成）
 * - applyTexturePlan 纯 apply：resolve 结果（dataUrl）写回 record + prune
 * - 不可变更新：no-op 返回原 project 引用（撤销栈防线）
 */
import { describe, expect, it } from 'vitest';
import { createEmptyProject, createPaperElement, createPaperTexture } from '../../types/project';
import {
  MAX_TEXTURE_SCALE,
  MIN_TEXTURE_SCALE,
} from '../../texture/shade';
import {
  applyOpacity,
  applyTexturePlan,
  clampOpacity,
  clampTextureScale,
  isTextureRotation,
  planTextureProps,
  removeTexture,
  TEXTURE_ROTATIONS,
  updateElementProperty,
  type TexturePropsPlan,
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

describe('planTextureProps 纯 plan（seam 2：判 no-op / 算变体 / 产 request）', () => {
  it('找不到元素 → noop', () => {
    const project = projectWithPaper({ texture: true });
    expect(planTextureProps(project, 'missing', { color: '#ff0000' })).toEqual({ kind: 'noop' });
  });

  it('无纹理纸片改色 → color plan（不产 request，纯着色）', () => {
    const project = projectWithPaper();
    expect(planTextureProps(project, 'paper-1', { color: '#ff0000' })).toEqual({
      kind: 'color',
      color: '#ff0000',
    });
  });

  it('无纹理纸片同色 → noop', () => {
    const project = projectWithPaper();
    expect(planTextureProps(project, 'paper-1', { color: '#7A8B5C' })).toEqual({ kind: 'noop' });
  });

  it('有纹理改色 → texture plan（更新变体 create=false，request 带新色、同 texId）', () => {
    const project = projectWithPaper({ texture: true });
    const plan = planTextureProps(project, 'paper-1', { color: '#ff0000' });
    expect(plan.kind).toBe('texture');
    if (plan.kind !== 'texture') return;
    expect(plan.create).toBe(false);
    expect(plan.request).toEqual({
      texId: 'tex-1',
      style: 'fold',
      seed: 42,
      color: '#ff0000',
      scale: 1,
      rotate: 0,
    });
  });

  it('纹理缩放越界 clamp 到 0.5–2 落入 request', () => {
    const project = projectWithPaper({ texture: true });
    const high = planTextureProps(project, 'paper-1', { scale: 3 });
    if (high.kind !== 'texture') throw new Error('应为 texture plan');
    expect(high.request.scale).toBe(MAX_TEXTURE_SCALE);

    const low = planTextureProps(project, 'paper-1', { scale: 0.1 });
    if (low.kind !== 'texture') throw new Error('应为 texture plan');
    expect(low.request.scale).toBe(MIN_TEXTURE_SCALE);
  });

  it('旋转纹理 → request.rotate 更新', () => {
    const project = projectWithPaper({ texture: true });
    const plan = planTextureProps(project, 'paper-1', { rotate: 90 });
    if (plan.kind !== 'texture') throw new Error('应为 texture plan');
    expect(plan.request.rotate).toBe(90);
  });

  it('切换纹理风格 → texture plan（create=true，新 texId ≠ 旧，seed 保留）', () => {
    const project = projectWithPaper({ texture: true });
    const plan = planTextureProps(project, 'paper-1', { style: 'grain' });
    if (plan.kind !== 'texture') throw new Error('应为 texture plan');
    expect(plan.create).toBe(true);
    expect(plan.request.texId).not.toBe('tex-1');
    expect(plan.request.style).toBe('grain');
    expect(plan.request.seed).toBe(42);
  });

  it('无纹理首次指定风格 → texture plan（create=true）', () => {
    const project = projectWithPaper();
    const plan = planTextureProps(project, 'paper-1', { style: 'grain' });
    if (plan.kind !== 'texture') throw new Error('应为 texture plan');
    expect(plan.create).toBe(true);
    expect(plan.request.style).toBe('grain');
  });

  it('已是同风格纹理再点该风格 → noop', () => {
    const project = projectWithPaper({ texture: true }); // 已有 fold
    expect(planTextureProps(project, 'paper-1', { style: 'fold' })).toEqual({ kind: 'noop' });
  });

  it('有纹理无实质变更（同色/同 scale/同 rotate）→ noop', () => {
    const project = projectWithPaper({ texture: true });
    expect(planTextureProps(project, 'paper-1', { color: '#7A8B5C' })).toEqual({ kind: 'noop' });
    expect(planTextureProps(project, 'paper-1', { rotate: 0 })).toEqual({ kind: 'noop' });
    expect(planTextureProps(project, 'paper-1', { scale: 1 })).toEqual({ kind: 'noop' });
  });
});

describe('applyTexturePlan 纯 apply（seam 2：resolve 结果写回 record + prune）', () => {
  it('noop plan → 返回原 project 引用（撤销栈防线）', () => {
    const project = projectWithPaper({ texture: true });
    expect(applyTexturePlan(project, 'paper-1', { kind: 'noop' })).toBe(project);
  });

  it('color plan → 仅改 element.color，textures 不变', () => {
    const project = projectWithPaper();
    const next = applyTexturePlan(project, 'paper-1', { kind: 'color', color: '#ff0000' });
    expect(next.elements[0].color).toBe('#ff0000');
    expect(next.textures).toEqual([]);
  });

  it('texture 更新变体：resolve dataUrl 写回现有 record，element 同步', () => {
    const project = projectWithPaper({ texture: true });
    const plan: TexturePropsPlan = {
      kind: 'texture',
      create: false,
      request: { texId: 'tex-1', style: 'fold', seed: 42, color: '#ff0000', scale: 1, rotate: 0 },
    };
    const next = applyTexturePlan(project, 'paper-1', plan, 'data:NEW');
    expect(next.textures[0]).toMatchObject({
      id: 'tex-1',
      color: '#ff0000',
      scale: 1,
      rotate: 0,
      dataUrl: 'data:NEW',
    });
    expect(next.elements[0].color).toBe('#ff0000');
    expect(next.elements[0].textureScale).toBe(1);
    expect(project.textures[0].dataUrl).toBe('data:image/png;base64,OLD'); // 原 project 不可变
  });

  it('texture 新建变体：新 record（request 字段 + dataUrl），element 指向新 id，旧 record 被 prune', () => {
    const project = projectWithPaper({ texture: true });
    const plan: TexturePropsPlan = {
      kind: 'texture',
      create: true,
      request: { texId: 'tex-2', style: 'grain', seed: 42, color: '#7A8B5C', scale: 1, rotate: 0 },
    };
    const next = applyTexturePlan(project, 'paper-1', plan, 'data:NEW');
    expect(next.elements[0].textureId).toBe('tex-2');
    const newTex = next.textures.find((t) => t.id === 'tex-2');
    expect(newTex).toMatchObject({ style: 'grain', seed: 42, dataUrl: 'data:NEW' });
    expect(next.textures).toHaveLength(1); // 旧 tex-1 不再被引用 → prune
  });

  it('新建变体时旧 record 仍被其他纸片引用 → prune 保留', () => {
    const project = projectWithPaper({ texture: true });
    project.elements.push(
      createPaperElement({
        id: 'paper-2',
        path: 'M 0 0 L 1 0 L 0 1 Z',
        color: '#000000',
        textureId: 'tex-1',
      }),
    );
    const plan: TexturePropsPlan = {
      kind: 'texture',
      create: true,
      request: { texId: 'tex-2', style: 'grain', seed: 42, color: '#7A8B5C', scale: 1, rotate: 0 },
    };
    const next = applyTexturePlan(project, 'paper-1', plan, 'data:NEW');
    expect(next.textures).toHaveLength(2); // tex-1 仍被 paper-2 引用 → 保留
    expect(next.textures.some((t) => t.id === 'tex-1')).toBe(true);
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
