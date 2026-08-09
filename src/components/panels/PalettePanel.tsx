/**
 * PalettePanel（S6 / T16）——右栏色卡面板：当前选中色 + 「最近使用」MRU 色区。
 *
 * 数据单向来自 editorStore（当前选中色 / MRU），点击 MRU 色块复用（setCurrentColor）。
 * 取色结果由 useScreenPicker 经 applyPickedColor 写入 editorStore，本组件只做渲染与复用。
 * T16 点色联动：有选中纸片（selectedId）时，点 MRU 色同时给纸片着色——经
 * applyTextureProperty 走重合成（element.color + texture.color 同步），并落入撤销栈。
 */
import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';
import { applyTextureProperty } from './propertyEdit';

export interface PalettePanelProps {
  /** 当前选中纸片 id（App 持有，fabric → React 单向）；null 表示未选中。 */
  selectedId?: string | null;
}

export function PalettePanel({ selectedId = null }: PalettePanelProps) {
  const currentColor = useEditorStore((s) => s.currentColor);
  const recentColors = useEditorStore((s) => s.recentColors);
  const setCurrentColor = useEditorStore((s) => s.setCurrentColor);

  /** 点色：激活为当前选中色；有选中纸片时再给纸片着色（重合成 + 可撤销）。 */
  const applyColor = (hex: string) => {
    setCurrentColor(hex);
    if (selectedId) {
      const { project, commitProject } = useProjectStore.getState();
      commitProject(applyTextureProperty(project, selectedId, { color: hex }));
    }
  };

  return (
    <div className="palette-panel" data-testid="palette-panel">
      <h2 className="page-heading">色卡</h2>

      <section className="palette-section" aria-label="当前选中色">
        <span className="palette-label">当前色</span>
        <div className="palette-current-row">
          <span
            className="swatch swatch--current"
            data-testid="current-color-swatch"
            style={{ backgroundColor: currentColor }}
            aria-hidden="true"
          />
          <span className="palette-hex" data-testid="current-color-hex">
            {currentColor}
          </span>
        </div>
      </section>

      <section className="palette-section" aria-label="最近使用">
        <span className="palette-label">最近使用</span>
        {recentColors.length === 0 ? (
          <p className="palette-empty" data-testid="recent-color-empty">
            还没有取色记录
          </p>
        ) : (
          <ul className="palette-mru" data-testid="recent-color-list">
            {recentColors.map((hex) => (
              <li key={hex}>
                <button
                  type="button"
                  className="swatch"
                  data-testid={`recent-color-${hex.replace('#', '')}`}
                  style={{ backgroundColor: hex }}
                  aria-label={`使用颜色 ${hex}`}
                  onClick={() => applyColor(hex)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
