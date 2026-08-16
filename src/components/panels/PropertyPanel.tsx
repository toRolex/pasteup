/**
 * PropertyPanel（T10）——右栏属性便签：纹理选择器 + 色板 + 属性（不透明度/缩放/旋转）。
 *
 * 选中联动：selectedId 由 FabricCanvas onSelectionChange 单向上报（fabric → React）。
 * 不透明度/清除纹理：不可变计算新 project → commitProject（撤销可回退）→ FabricCanvas 重绘。
 * 纹理相关变更（风格/颜色/缩放/旋转）走 store action `applyTextureProps`（#48：plan → resolve →
 * apply → commit 编排，no-op 不污染撤销栈）。
 * 滑杆手势合并（#50）：range 的 onPointerDown/onKeyDown 生成自增 gestureId（键盘方向键改值不触发
 * pointer 事件，必须覆盖）；同手势连续改值传同一 coalesceKey → History 合并为一条撤销记录。
 * 离散动作（transform 回灌 / 纹理按钮 / 色板 / 旋转 / 清除）不传 hint，永不合并。
 * MRU 色区归 T15 PalettePanel，本面板只放简洁内置色板 + 同步 currentColor。
 */
import { useRef, useState } from 'react';
import type { PaperProject } from '../../types/project';
import { TEXTURE_STYLES } from '../../texture/generator';
import { useProjectStore } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import type { EditHint } from '../../store/history';
import {
  PROPERTY_PALETTE,
  TEXTURE_ROTATIONS,
  applyOpacity,
  removeTexture,
  type TexturePropertyPatch,
} from './propertyEdit';

/** 自增 gestureId 计数器（模块级，跨组件实例单调递增，防 key 复用导致跨手势误并链）。 */
let gestureSeq = 0;
function nextGestureId(): number {
  gestureSeq += 1;
  return gestureSeq;
}

export interface PropertyPanelProps {
  /** 当前选中纸片 id；null 表示未选中。 */
  selectedId: string | null;
}

export function PropertyPanel({ selectedId }: PropertyPanelProps) {
  const project = useProjectStore((s) => s.project);
  const commitProject = useProjectStore((s) => s.commitProject);
  const applyTextureProps = useProjectStore((s) => s.applyTextureProps);
  const setCurrentColor = useEditorStore((s) => s.setCurrentColor);
  /** T16 便签打勾：每次属性变更 bump tick，驱动「✓ 已更新」反馈重放动画。 */
  const [tick, setTick] = useState(0);
  /**
   * 每个滑杆独立持有自己的手势 ref（#50 P1）：兄弟滑杆的 blur/pointerup 只清自己的手势，不误杀
   * 正在拖动的另一滑杆（真实浏览器点另一滑杆时，前者 blur 先于新 pointerdown 的手势稳定期）。
   * pointerdown / 首个 keydown 起手势，本滑杆自己的 pointerup / blur 收；键盘连续方向键复用
   * 同一手势（blur 才收）→ 连续改值合并为一条撤销记录。
   */
  const opacityGesture = useRef<number | null>(null);
  const scaleGesture = useRef<number | null>(null);
  const startGesture = (g: { current: number | null }) => {
    g.current = nextGestureId();
  };
  const endGesture = (g: { current: number | null }) => {
    g.current = null;
  };
  /** 键盘手势：首个 keydown 起手势（blur 前连续方向键复用同一手势）。 */
  const ensureGesture = (g: { current: number | null }) => {
    if (g.current === null) g.current = nextGestureId();
  };

  /** 统一提交（不透明度/清除纹理）：写撤销历史（滑杆可带合并 hint）+ 触发便签打勾反馈。 */
  const commit = (next: PaperProject, hint?: EditHint) => {
    commitProject(next, hint);
    setTick((t) => t + 1);
  };

  const element = selectedId
    ? project.elements.find((e) => e.id === selectedId)
    : undefined;
  const texture = element?.textureId
    ? project.textures.find((t) => t.id === element.textureId)
    : undefined;
  const activeStyle = texture?.style ?? null;

  if (!element) {
    return (
      <section className="property-panel" data-testid="property-panel">
        <h2 className="page-heading">属性</h2>
        <p className="property-empty" data-testid="property-empty">
          未选中纸片
        </p>
      </section>
    );
  }

  const opacityPercent = Math.round(element.opacity * 100);
  const scalePercent = Math.round(element.textureScale * 100);
  const rotate = texture?.rotate ?? 0;
  /** 滑杆手势 hint：`'<property>:<elementId>:<gestureId>'`；无激活手势（编程变更）返回 undefined（交给 History 的 null-hint 语义：离散不合并）。 */
  const sliderHint = (property: string, gestureId: number | null): EditHint | undefined =>
    gestureId === null ? undefined : { coalesceKey: `${property}:${element.id}:${gestureId}` };

  /** 纹理属性编辑：走 store action（plan → resolve → apply → commit，滑杆可带合并 hint），并触发便签打勾反馈。 */
  const commitTexture = (patch: TexturePropertyPatch, hint?: EditHint) => {
    applyTextureProps(element.id, patch, hint);
    setTick((t) => t + 1);
  };

  return (
    <section className="property-panel" data-testid="property-panel">
      <h2 className="page-heading">属性</h2>
      {tick > 0 && (
        <span className="prop-tick" data-testid="property-check" key={tick} aria-label="已更新">
          ✓ 已更新
        </span>
      )}

      <div className="property-field" data-testid="texture-field">
        <span className="property-label">纹理</span>
        <div className="property-options texture-options">
          <button
            type="button"
            className={`texture-btn${activeStyle === null ? ' texture-btn--active' : ''}`}
            data-testid="texture-none"
            aria-pressed={activeStyle === null}
            onClick={() => commit(removeTexture(project, element.id))}
          >
            无
          </button>
          {TEXTURE_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`texture-btn${activeStyle === s.id ? ' texture-btn--active' : ''}`}
              data-testid={`texture-${s.id}`}
              aria-pressed={activeStyle === s.id}
              onClick={() => commitTexture({ style: s.id })}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="property-field" data-testid="color-field">
        <span className="property-label">颜色</span>
        <ul className="property-palette" data-testid="property-palette">
          {PROPERTY_PALETTE.map((hex) => {
            const active = element.color.toLowerCase() === hex.toLowerCase();
            return (
              <li key={hex}>
                <button
                  type="button"
                  className={`swatch property-swatch${active ? ' swatch--active' : ''}`}
                  data-testid={`property-color-${hex.replace('#', '')}`}
                  style={{ backgroundColor: hex }}
                  aria-label={`使用颜色 ${hex}`}
                  aria-pressed={active}
                  onClick={() => {
                    setCurrentColor(hex);
                    commitTexture({ color: hex });
                  }}
                />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="property-field" data-testid="opacity-field">
        <span className="property-label">不透明度</span>
        <div className="property-control-row">
          <input
            type="range"
            data-testid="opacity-slider"
            min={0}
            max={1}
            step={0.01}
            value={element.opacity}
            aria-label="不透明度"
            onPointerDown={() => startGesture(opacityGesture)}
            onPointerUp={() => endGesture(opacityGesture)}
            onKeyDown={() => ensureGesture(opacityGesture)}
            onBlur={() => endGesture(opacityGesture)}
            onChange={(e) =>
              commit(
                applyOpacity(project, element.id, Number(e.target.value)),
                sliderHint('opacity', opacityGesture.current),
              )
            }
          />
          <span className="property-value" data-testid="opacity-value">
            {opacityPercent}%
          </span>
        </div>
      </div>

      <div className="property-field" data-testid="scale-field">
        <span className="property-label">纹理缩放</span>
        <div className="property-control-row">
          <input
            type="range"
            data-testid="scale-slider"
            min={50}
            max={200}
            step={1}
            value={scalePercent}
            aria-label="纹理缩放"
            onPointerDown={() => startGesture(scaleGesture)}
            onPointerUp={() => endGesture(scaleGesture)}
            onKeyDown={() => ensureGesture(scaleGesture)}
            onBlur={() => endGesture(scaleGesture)}
            onChange={(e) =>
              commitTexture(
                { scale: Number(e.target.value) / 100 },
                sliderHint('textureScale', scaleGesture.current),
              )
            }
          />
          <span className="property-value" data-testid="scale-value">
            {scalePercent}%
          </span>
        </div>
      </div>

      <div className="property-field" data-testid="rotate-field">
        <span className="property-label">旋转纹理</span>
        <div className="property-options rotate-options">
          {TEXTURE_ROTATIONS.map((deg) => (
            <button
              key={deg}
              type="button"
              className={`rotate-btn${rotate === deg ? ' rotate-btn--active' : ''}`}
              data-testid={`rotate-${deg}`}
              aria-pressed={rotate === deg}
              onClick={() => commitTexture({ rotate: deg })}
            >
              {deg}°
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
