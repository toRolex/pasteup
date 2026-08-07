import { useRef, useState } from 'react';
import {
  FabricCanvas,
  type FabricCanvasApi,
  type FabricTool,
} from './components/canvas/FabricCanvas';
import { NewProjectDialog } from './components/dialogs/NewProjectDialog';
import { PalettePanel } from './components/panels/PalettePanel';
import { useScreenPicker } from './picker/useScreenPicker';
import { JournalShell } from './styles/journalLayout';
import { useProjectStore } from './store/projectStore';
import { exportProjectToSVG, saveSvgFile } from './export/svg';

export default function App() {
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const setBackgroundPhoto = useProjectStore((s) => s.setBackgroundPhoto);
  const bgPhoto = project.bgPhoto;
  const apiRef = useRef<FabricCanvasApi | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { activate: activatePicker } = useScreenPicker();
  const [tool, setTool] = useState<FabricTool>('select');

  const handleExportSvg = async () => {
    const svg = await exportProjectToSVG(project);
    saveSvgFile(svg, 'pasteup.svg');
  };

  return (
    <div className="app-shell">
      <JournalShell
        topbar={
          <div className="brand">
            <span className="brand-name">pasteup · 手帐剪纸拼贴</span>
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
                onClick={() => setProject({ ...project, bgPhoto: { ...bgPhoto, visible: !bgPhoto.visible } })}
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
            <span className="tape tape--topbar" aria-hidden="true" />
          </div>
        }
        leftPage={
          <div className="page-scaffold">
            <h2 className="page-heading">目录</h2>
            <div className="sticky-note">
              <p className="note-text">左页待承载：手绘目录 / 工具 / 图层</p>
            </div>
          </div>
        }
        rightPage={
          <div className="page-scaffold">
            <PalettePanel />
            <span className="stamp">已装订</span>
          </div>
        }
      >
        <FabricCanvas project={project} onProjectChange={setProject} apiRef={apiRef} activeTool={tool} />
      </JournalShell>
      <NewProjectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <div className="grain" aria-hidden="true" />
      <div className="fiber" aria-hidden="true" />
    </div>
  );
}
