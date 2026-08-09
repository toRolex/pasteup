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
import { useScreenPicker } from './picker/useScreenPicker';
import { JournalShell } from './styles/journalLayout';
import { useProjectStore, type SaveStatus } from './store/projectStore';
import { exportProjectToSVG, saveSvgFile } from './export/svg';
import { createAutosaveController } from './io/autosave';
import { pickOpenPath, pickSavePath, readProjectFile, writeProjectFile } from './io/projectFile';

/** 自动保存状态 → 顶栏指示文案（T12）。 */
const SAVE_STATUS_TEXT: Record<SaveStatus, string> = {
  idle: '未保存',
  saving: '保存中',
  saved: '已保存',
  error: '保存失败',
};

export default function App() {
  const project = useProjectStore((s) => s.project);
  const commitProject = useProjectStore((s) => s.commitProject);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const setBackgroundPhoto = useProjectStore((s) => s.setBackgroundPhoto);
  const toggleBackgroundPhoto = useProjectStore((s) => s.toggleBackgroundPhoto);
  const reorderElements = useProjectStore((s) => s.reorderElements);
  const saveStatus = useProjectStore((s) => s.saveStatus);
  const openProject = useProjectStore((s) => s.openProject);
  const elements = project.elements;
  const bgPhoto = project.bgPhoto;
  const apiRef = useRef<FabricCanvasApi | null>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const autosaveRef = useRef<ReturnType<typeof createAutosaveController> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const { activate: activatePicker } = useScreenPicker();
  const [tool, setTool] = useState<FabricTool>('select');
  // T10/T11 选中联动：fabric 选中 → onSelectionChange 单向上报当前纸片 id → 图层面板 + 属性面板。
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // T12 无感自动保存：订阅 store 项目变化 → 防抖写盘（首次保存弹位置选择）。
  // 控制器与写盘逻辑在 io/autosave.ts（纯逻辑、依赖注入），这里只做接线。
  useEffect(() => {
    const controller = createAutosaveController({
      getProject: () => useProjectStore.getState().project,
      getSavePath: () => useProjectStore.getState().savePath,
      onSavePath: (path) => useProjectStore.getState().setSavePath(path),
      onSaveStatus: (status) => useProjectStore.getState().setSaveStatus(status),
      pickSavePath,
      writeProjectFile,
    });
    autosaveRef.current = controller;
    const unsubscribe = useProjectStore.subscribe((state, prev) => {
      // 只对 project 变化触发（saveStatus/savePath 变化不重复写盘）
      if (state.project !== prev.project) controller.schedule();
    });
    return () => {
      unsubscribe();
      controller.dispose();
      autosaveRef.current = null;
    };
  }, []);

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
  }

  const handleExportSvg = async () => {
    const svg = await exportProjectToSVG(project);
    saveSvgFile(svg, 'pasteup.svg');
  };

  // T12 手动「保存」：立即触发自动保存写盘（无视防抖；首次保存仍弹位置选择）。
  const handleSave = () => {
    setFileError(null);
    void autosaveRef.current?.flush();
  };

  // T12 「打开」：文件对话框选 .json → 读取解析 → 写入 store（新历史起点）。
  // 文件读取/解析失败显示错误，不崩溃。
  const handleOpen = async () => {
    const path = await pickOpenPath();
    if (!path) return;
    try {
      const opened = await readProjectFile(path);
      setFileError(null);
      openProject(opened, path);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : '打开项目失败');
    }
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
              onClick={() => {
                setFileError(null);
                setDialogOpen(true);
              }}
            >
              新建
            </button>
            <button
              className="tool-btn"
              data-testid="open-project"
              onClick={() => void handleOpen()}
            >
              打开
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
            <button
              className="tool-btn"
              data-testid="save-project"
              onClick={handleSave}
            >
              保存
            </button>
            <span className="save-status" data-testid="save-status">
              {SAVE_STATUS_TEXT[saveStatus]}
            </span>
            {fileError && (
              <span className="open-error" data-testid="open-error" role="alert">
                {fileError}
              </span>
            )}
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
            <PalettePanel />
            <PropertyPanel selectedId={selectedId} />
            <span className="stamp">已装订</span>
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
