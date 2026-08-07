/**
 * PropertyPanel（T10）——右栏属性便签：纹理选择器 + 色板 + 属性（不透明度/缩放/旋转）。
 *
 * 选中联动：selectedId 由 FabricCanvas onSelectionChange 单向上报（fabric → React）。
 * 每个属性变更 → 不可变计算新 project → commitProject（撤销可回退）→ FabricCanvas 重绘。
 * 纹理相关变更经 propertyEdit.applyTextureProperty 触发重合成（tintCache 复用）。
 * MRU 色区归 T15 PalettePanel，本面板只放简洁内置色板 + 同步 currentColor。
 */
import { TEXTURE_STYLES } from '../../texture/generator';
import { useProjectStore } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import {
  PROPERTY_PALETTE,
  TEXTURE_ROTATIONS,
  applyOpacity,
  applyTextureProperty,
  removeTexture,
} from './propertyEdit';

export interface PropertyPanelProps {
  /** 当前选中纸片 id；null 表示未选中。 */
  selectedId: string | null;
}

export function PropertyPanel({ selectedId }: PropertyPanelProps) {
  const project = useProjectStore((s) => s.project);
  const commitProject = useProjectStore((s) => s.commitProject);
  const setCurrentColor = useEditorStore((s) => s.setCurrentColor);

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

  return (
    <section className="property-panel" data-testid="property-panel">
      <h2 className="page-heading">属性</h2>

      <div className="property-field" data-testid="texture-field">
        <span className="property-label">纹理</span>
        <div className="property-options texture-options">
          <button
            type="button"
            className={`texture-btn${activeStyle === null ? ' texture-btn--active' : ''}`}
            data-testid="texture-none"
            aria-pressed={activeStyle === null}
            onClick={() => commitProject(removeTexture(project, element.id))}
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
              onClick={() =>
                commitProject(applyTextureProperty(project, element.id, { style: s.id }))
              }
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
                    commitProject(applyTextureProperty(project, element.id, { color: hex }));
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
            onChange={(e) =>
              commitProject(applyOpacity(project, element.id, Number(e.target.value)))
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
            onChange={(e) =>
              commitProject(
                applyTextureProperty(project, element.id, { scale: Number(e.target.value) / 100 }),
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
              onClick={() =>
                commitProject(applyTextureProperty(project, element.id, { rotate: deg }))
              }
            >
              {deg}°
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
