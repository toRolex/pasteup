import { useEffect, useRef, useState } from 'react';
import type { Canvas } from 'fabric';
import {
  FabricCanvas,
  type FabricCanvasApi,
  type FabricTool,
} from './components/canvas/FabricCanvas';
import { NewProjectDialog } from './components/dialogs/NewProjectDialog';
import { LayerPanel } from './components/panels/LayerPanel';
import { PalettePanel } from './components/panels/PalettePanel';
import { downloadPNG, exportCanvasToPNG } from './export/png';
import { PropertyPanel } from './components/panels/PropertyPanel';
import { CharReveal } from './components/brand/CharReveal';
import { CircleNote } from './components/brand/CircleNote';
import { useScreenPicker } from './picker/useScreenPicker';
import { JournalShell } from './styles/journalLayout';
import { useProjectStore } from './store/projectStore';
import { exportProjectToSVG, saveSvgFile } from './export/svg';

export default function App() {
  const project = useProjectStore((s) => s.project);
  const commitProject = useProjectStore((s) => s.commitProject);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const setBackgroundPhoto = useProjectStore((s) => s.setBackgroundPhoto);
  const toggleBackgroundPhoto = useProjectStore((s) => s.toggleBackgroundPhoto);
  const reorderElements = useProjectStore((s) => s.reorderElements);
  const elements = project.elements;
  const bgPhoto = project.bgPhoto;
  const apiRef = useRef<FabricCanvasApi | null>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { activate: activatePicker } = useScreenPicker();
  const [tool, setTool] = useState<FabricTool>('select');
  // T10/T11 选中联动：fabric 选中 → onSelectionChange 单向上报当前纸片 id → 图层面板 + 属性面板。
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // T16 导出图章：点导出盖朱红「Pasteup」图章（CSS 动效，reduced-motion 瞬时）。
  const [stamped, setStamped] = useState(false);

  // 撤销/重做快捷键：Cmd/Ctrl+Z 撤销，Shift+Cmd/Ctrl+Z 重做。
  // MVP 无输入框场景，做全局 keydown 处理；T10 属性面板接入输入框时再细化跳过聚焦场景。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  function handleExportPNG() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { dataUrl, width, height } = exportCanvasToPNG(canvas, project);
    downloadPNG(dataUrl, `pasteup-export-${width}x${height}.png`);
    setStamped(true);
  }

  const handleExportSvg = async () => {
    const svg = await exportProjectToSVG(project);
    saveSvgFile(svg, 'pasteup.svg');
    setStamped(true);
  };

  return (
    <div className="app-shell">
      <JournalShell
        topbar={
          <div className="brand">
            <span className="brand-title">
              <CharReveal className="brand-name" text="pasteup · 手帐剪纸拼贴" />
              <svg
                className="brand-underline"
                data-testid="brand-underline"
                viewBox="0 0 220 10"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  className="underline-path"
                  d="M 8 7 Q 70 2 130 6 T 214 5"
                  fill="none"
                  stroke="var(--tape)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <button
              className="tool-btn"
              data-testid="new-project"
              onClick={() => setDialogOpen(true)}
            >
              新建
            </button>
            <button
              className="tool-btn"
              data-testid="pick-color"
              aria-label="屏幕取色"
              title="屏幕取色（I）"
              onClick={() => activatePicker()}
            >
              取色
            </button>
            <button
              className={`tool-btn${tool === 'select' ? ' tool-btn--active' : ''}`}
              data-testid="tool-select"
              aria-pressed={tool === 'select'}
              onClick={() => setTool('select')}
            >
              选择
            </button>
            <button
              className={`tool-btn${tool === 'trace' ? ' tool-btn--active' : ''}`}
              data-testid="tool-trace"
              aria-pressed={tool === 'trace'}
              onClick={() => setTool('trace')}
            >
              描绘
            </button>
            <button
              className="tool-btn"
              data-testid="undo"
              aria-label="撤销"
              title="撤销（⌘/Ctrl+Z）"
              onClick={() => undo()}
            >
              撤销
            </button>
            <button
              className="tool-btn"
              data-testid="redo"
              aria-label="重做"
              title="重做（⇧⌘/Ctrl+Z）"
              onClick={() => redo()}
            >
              重做
            </button>
            <span className="brand-spacer" aria-hidden="true" />
            <button
              className="tool-btn"
              data-testid="import-bg"
              onClick={() => document.getElementById('bg-photo-input')?.click()}
            >
              导入底图
            </button>
            <input
              id="bg-photo-input"
              data-testid="bg-photo-input"
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setBackgroundPhoto(String(reader.result));
                reader.readAsDataURL(file);
              }}
            />
            {bgPhoto && (
              <button
                className="tool-btn"
                data-testid="toggle-bg"
                onClick={() => toggleBackgroundPhoto()}
              >
                {bgPhoto.visible ? '隐藏底图' : '显示底图'}
              </button>
            )}
            <button
              className="tool-btn"
              data-testid="export-svg"
              onClick={() => void handleExportSvg()}
            >
              导出 SVG
            </button>
            <button
              className="tool-btn"
              data-testid="zoom-out"
              aria-label="缩小视图"
              onClick={() => apiRef.current?.zoomBy(0.8)}
            >
              −
            </button>
            <button
              className="tool-btn"
              data-testid="zoom-in"
              aria-label="放大视图"
              onClick={() => apiRef.current?.zoomBy(1.25)}
            >
              ＋
            </button>
            <button
              className="tool-btn"
              data-testid="zoom-reset"
              aria-label="复位视图"
              onClick={() => apiRef.current?.resetViewport()}
            >
              复位
            </button>
            <button
              className="tool-btn"
              data-testid="export-png"
              aria-label="导出 PNG"
              onClick={handleExportPNG}
            >
              导出 PNG
            </button>
            <CircleNote label="盖戳" testId="export-circle-note" className="circle-note--export" />
            <span className="tape tape--topbar" aria-hidden="true" />
          </div>
        }
        leftPage={
          <div className="page-scaffold">
            <LayerPanel
              elements={elements}
              selectedId={selectedId}
              onSelect={(id) => apiRef.current?.setActiveObject(id)}
              onReorder={reorderElements}
            />
          </div>
        }
        rightPage={
          <div className="page-scaffold">
            <CircleNote label="点色" testId="palette-circle-note" className="circle-note--palette" />
            <PalettePanel selectedId={selectedId} />
            <PropertyPanel selectedId={selectedId} />
            {stamped && (
              <span className="stamp stamp--export stamped" data-testid="export-stamp" aria-label="已导出 Pasteup">
                Pasteup
              </span>
            )}
          </div>
        }
      >
        <FabricCanvas
          project={project}
          onProjectChange={commitProject}
          onSelectionChange={setSelectedId}
          apiRef={apiRef}
          activeTool={tool}
          onReady={(c) => { canvasRef.current = c; }}
        />
      </JournalShell>
      <NewProjectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <div className="grain" aria-hidden="true" />
      <div className="fiber" aria-hidden="true" />
    </div>
  );
}
