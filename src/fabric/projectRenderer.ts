/**
 * projectRenderer —— 渲染同步有状态 module（#47）。
 *
 * 把「project → fabric 画布」的渲染同步知识从 React 壳收进本 module，壳的 useEffect 变薄为
 * 一句 `renderer.render(project)`，渲染知识不泄进 React（depth：prev/失效/快照全收进 implementation）。
 *
 * - 失效判定单点化：render 内部走 schema 层 `diffProject(prev, next)` 三态——
 *   `'none'` 不重绘；`'bg-only'` 只切 `backgroundImage.visible` 不重建元素（即时无闪烁）；
 *   `'full'` 全量重建。
 * - selection 恢复在 render 内完成：render 开始读当前 activeObject 的 paperId，重建后按 id
 *   恢复（「重绘不丢选中」成为可 headless 直测的不变量；壳不重复恢复）。
 * - 异步纹理补丁（applyTextureWhenReady / applyBackground）收进内部：带纹理纸片先纯色占位，
 *   经共享加载器异步解码后更新为 Pattern；resolve 时校验内部渲染快照里该纸片仍引用同一纹理
 *   （防旧覆盖）；加载失败保持纯色（不抛错、不中断画布）。
 * - loader 构造注入（textureSupply 的 load 侧窄 interface：prod 单例 / test fake 两 adapter）。
 * - 生命周期与 canvas 绑定：仅 mount 创建 / unmount dispose；dispose 只清本 module 内部状态，
 *   canvas.dispose() 仍由壳负责。
 *
 * ADR 0001 硬性契约：纹理缩放/旋转已在合成时烘焙进位图，pattern 不设 transform。
 */
import { Canvas, FabricImage, Pattern } from 'fabric';
import { diffProject, type PaperProject } from '../types/project';
import { createFabricPath, findPaperObject } from './paperBridge';
import type { TextureLoadSide } from '../texture/supply';

/** 渲染器 interface：render 同步 project 到画布；dispose 清内部状态（canvas 生命周期归壳）。 */
export interface ProjectRenderer {
  render(project: PaperProject): void;
  dispose(): void;
}

export function createProjectRenderer(canvas: Canvas, loader: TextureLoadSide): ProjectRenderer {
  // 内部状态：最近一次渲染的 project（prev 与渲染快照合并成一份）。失效判定（diffProject 的 prev）
  // 与异步纹理 resolve 校验（防旧覆盖）都读这一份。重复 createProjectRenderer 会丢 prev（决议风险）。
  let lastRendered: PaperProject | null = null;
  let disposed = false;

  function render(project: PaperProject): void {
    if (disposed) return;
    const prev = lastRendered;
    const mode = prev === null ? 'full' : diffProject(prev, project);

    if (mode === 'none') return; // 四引用全相等：无实质变化，不重绘

    if (mode === 'bg-only') {
      // 唯一可能变化是底图 visible：只切可见性，不重建元素（即时无闪烁）。
      if (canvas.backgroundImage && project.bgPhoto) {
        canvas.backgroundImage.visible = project.bgPhoto.visible;
        canvas.requestRenderAll();
      }
      lastRendered = project;
      return;
    }

    // full：全量重建。render 开始先读当前选中纸片 paperId，重建后按 id 恢复（重绘不丢选中）。
    const activePaperId = canvas.getActiveObject()?.paperId ?? null;
    canvas.clear();
    canvas.setDimensions({ width: project.canvas.width, height: project.canvas.height });
    lastRendered = project; // 渲染快照：异步纹理 resolve 校验「纸片当前仍需该纹理」用
    for (const el of project.elements) {
      const texture = el.textureId
        ? project.textures.find((t) => t.id === el.textureId)
        : undefined;
      canvas.add(createFabricPath(el)); // 占位：无纹理源 → 纯色填充
      if (texture) {
        void applyTextureWhenReady(el.id, texture.id, texture.dataUrl);
      }
    }
    applyBackground(project.bgPhoto);
    if (activePaperId) {
      const restored = findPaperObject(canvas, activePaperId);
      if (restored) canvas.setActiveObject(restored);
    }
    canvas.requestRenderAll();
  }

  /**
   * 异步把已解码纹理源应用到当前纸片。resolve 时校验：内部渲染快照里该纸片仍引用同一纹理记录
   * （同 id 且同 dataURL），否则丢弃旧结果（快速连续编辑时旧纹理不覆盖新渲染）。加载失败保持纯色。
   */
  async function applyTextureWhenReady(
    paperId: string,
    textureId: string,
    dataUrl: string,
  ): Promise<void> {
    try {
      const source = await loader.load(dataUrl);
      if (disposed) return;
      const snapshot = lastRendered;
      const element = snapshot?.elements.find((el) => el.id === paperId);
      const texture = element?.textureId
        ? snapshot?.textures.find((t) => t.id === element.textureId)
        : undefined;
      if (!element || element.textureId !== textureId || texture?.dataUrl !== dataUrl) return;
      const obj = findPaperObject(canvas, paperId);
      if (!obj) return;
      // ADR 0001 硬性契约：缩放/旋转已烘焙进位图，pattern 不设 transform。
      obj.set('fill', new Pattern({ source, repeat: 'repeat' }));
      canvas.requestRenderAll();
    } catch {
      // 加载失败：保持纯色占位，不抛错、不中断画布
    }
  }

  function applyBackground(bgPhoto: PaperProject['bgPhoto']): void {
    if (!bgPhoto) {
      canvas.backgroundImage = undefined;
      return;
    }
    if (!bgPhoto.dataUrl) return;
    void FabricImage.fromURL(bgPhoto.dataUrl).then((image) => {
      if (disposed) return;
      image.visible = bgPhoto.visible;
      canvas.backgroundImage = image;
      canvas.requestRenderAll();
    });
  }

  function dispose(): void {
    disposed = true;
    lastRendered = null;
    // canvas 生命周期归壳：本 module 只清自身状态，不调 canvas.dispose()。
  }

  return { render, dispose };
}
