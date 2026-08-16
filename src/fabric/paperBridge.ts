/**
 * paperBridge —— schema↔fabric 双向映射收拢点。
 *
 * 收拢纸片 schema 与 fabric 对象之间的全部双向映射，新增 transform 字段只改本文件一处：
 * - 正向：`paperToFabricOptions` 纯映射 + `createFabricPath` 构造（含 ADR 0001 质感）。
 * - 反向：`readTransform` 单对象 transform 纯映射（缺字段 ?? 回落 fallback，事件回灌用）。
 * - paperId 承载：`declare module 'fabric'` 声明合并进 `FabricObject`，读写双向类型安全（无强转）。
 * - `findPaperObject`：fabric 侧按 paperId 定位纸片的唯一入口。
 *
 * 不依赖 fabric `toObject()` 默认行为；正反向手写逐字段 colocate，round-trip 测试防漂移。
 * （全画布回灌循环仍由桥接壳持有，本 module 只收单对象 readTransform。）
 */
import { Path, Pattern, Shadow, type Canvas, type FabricObject } from 'fabric';
import type { PaperElement, ProjectTransform } from '../types/project';

/**
 * paperId 承载：TS 声明合并。把纸片元素 id（schema `PaperElement.id`）合并进 fabric
 * `FabricObject`，读写双向类型安全，替代各处针对 paperId 的强转。
 * 依赖 fabric v7 类型结构；interface+class 合并失败会在编译期 fail-fast（不静默错），
 * 并由 paperBridge.test 的 type-level 断言兜 fabric 升级。
 */
declare module 'fabric' {
  interface FabricObject {
    /** 纸片元素 id（schema `PaperElement.id`），事件回灌 / 命令式选中时定位纸片用。 */
    paperId?: string;
  }
}

/** 纸片基础层叠投影（对应 DESIGN.md --shadow-lift：柔和、轻微下沉表达层叠浮起）。 */
export const PAPER_SHADOW = {
  color: 'rgba(90, 70, 52, 0.26)',
  blur: 6,
  offsetX: 0,
  offsetY: 3,
} as const;

/** 纸片厚度描边：取纸片色按因子加深，模拟纸片边缘厚度。 */
const STROKE_DARKEN_FACTOR = 0.82;
const PAPER_STROKE_WIDTH = 1.5;

/** fabric.Path 构造选项（含自定义 paperId 用于事件回灌定位元素）。 */
export interface PaperFabricOptions {
  path: string;
  left: number;
  top: number;
  fill: string;
  opacity: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  originX: 'left';
  originY: 'top';
  selectable: boolean;
  paperId: string;
}

/** 把 paper schema 映射为 fabric.Path 选项。 */
export function paperToFabricOptions(element: PaperElement): PaperFabricOptions {
  const t = element.transform;
  return {
    path: element.path,
    left: t.x,
    top: t.y,
    fill: element.color,
    opacity: element.opacity,
    scaleX: t.scaleX,
    scaleY: t.scaleY,
    angle: t.rotation,
    originX: 'left',
    originY: 'top',
    selectable: true,
    paperId: element.id,
  };
}

/** 把十六进制颜色按因子加深，返回 rgb()。 */
function darkenColor(hex: string, factor: number): string {
  const m = hex.replace('#', '');
  if (m.length !== 6) return hex;
  const n = parseInt(m, 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * 依据纸片 schema 创建带基础样式（层叠投影 + 厚度质感）的 fabric.Path 对象。
 * @param element 纸片 schema。
 * @param textureSource 纹理填充源（ADR 0001 预烘焙结果）：T18 传入共享加载器已解码的
 *   `CanvasImageSource`（Image/Canvas，Pattern.toSVG 需读 width/height）。传入时用
 *   pattern 填充（repeat，**不设 patternTransform**），未传保持纯色填充（占位）。
 */
export function createFabricPath(
  element: PaperElement,
  textureSource?: CanvasImageSource | null,
): Path {
  const { path, ...options } = paperToFabricOptions(element);
  const fabricPath = new Path(path, options);
  if (textureSource) {
    // ADR 0001 硬性契约：纹理缩放/旋转已在合成时烘焙进位图，pattern 不设 transform，
    // 运行时与导出共用同一数据源，导出天然正确。
    fabricPath.fill = new Pattern({
      source: textureSource,
      repeat: 'repeat',
    });
  }
  fabricPath.shadow = new Shadow(PAPER_SHADOW);
  fabricPath.stroke = darkenColor(element.color, STROKE_DARKEN_FACTOR);
  fabricPath.strokeWidth = PAPER_STROKE_WIDTH;
  fabricPath.strokeUniform = true;
  fabricPath.strokeLineJoin = 'round';
  return fabricPath;
}

/** 反向映射的可读 transform 源（fabric 对象侧；字段均可选，缺省由 readTransform 回落 fallback）。 */
export interface ReadableTransform {
  left?: number;
  top?: number;
  angle?: number;
  scaleX?: number;
  scaleY?: number;
}

/**
 * 反向纯映射：从 fabric 对象显式读回 transform 为 schema `ProjectTransform`。
 * 与 `paperToFabricOptions` 手写逐字段对应（colocate 防漂移）；缺字段逐字段 `??` 回落
 * fallback（通常为该纸片先前 transform，保证事件回灌不丢值；`??` 而非 `||`，0 是有效值）。
 */
export function readTransform(
  obj: ReadableTransform,
  fallback: ProjectTransform,
): ProjectTransform {
  return {
    x: obj.left ?? fallback.x,
    y: obj.top ?? fallback.y,
    rotation: obj.angle ?? fallback.rotation,
    scaleX: obj.scaleX ?? fallback.scaleX,
    scaleY: obj.scaleY ?? fallback.scaleY,
  };
}

/** fabric 侧按 paperId 定位纸片对象的唯一入口（收拢各处 `getObjects().find(paperId)`）。 */
export function findPaperObject(canvas: Canvas, paperId: string): FabricObject | undefined {
  return canvas.getObjects().find((o) => o.paperId === paperId);
}
