/**
 * PalettePanel（S6）——右栏色卡面板：当前选中色 + 「最近使用」MRU 色区。
 *
 * 数据单向来自 editorStore（当前选中色 / MRU），点击 MRU 色块复用（setCurrentColor）。
 * 取色结果由 useScreenPicker 经 applyPickedColor 写入 editorStore，本组件只做渲染与复用。
 */
import { useEditorStore } from '../../store/editorStore';

export function PalettePanel() {
  const currentColor = useEditorStore((s) => s.currentColor);
  const recentColors = useEditorStore((s) => s.recentColors);
  const setCurrentColor = useEditorStore((s) => s.setCurrentColor);

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
                  onClick={() => setCurrentColor(hex)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
