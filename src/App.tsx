import { useEffect, useRef, useState } from 'react';
import {
  FabricCanvas,
  type FabricCanvasApi,
} from './components/canvas/FabricCanvas';
import { NewProjectDialog } from './components/dialogs/NewProjectDialog';
import { LayerPanel } from './components/panels/LayerPanel';
import { PalettePanel } from './components/panels/PalettePanel';
import { downloadPNG, exportProjectToPNG } from './export/png';
import { PropertyPanel } from './components/panels/PropertyPanel';
import { CharReveal } from './components/brand/CharReveal';
import { CircleNote } from './components/brand/CircleNote';
import { useScreenPicker } from './picker/useScreenPicker';
import { JournalShell } from './styles/journalLayout';
import { useProjectStore, type SaveStatus } from './store/projectStore';
import { useToolStore } from './store/toolStore';
import { exportProjectToSVG, saveSvgFile } from './export/svg';
import { createProjectPersistence } from './io/projectPersistence';
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
  const elements = project.elements;
  const bgPhoto = project.bgPhoto;
  const apiRef = useRef<FabricCanvasApi | null>(null);
  const persistenceRef = useRef<ReturnType<typeof createProjectPersistence> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const { activate: activatePicker } = useScreenPicker();
  // #59 工具单一真相在 toolStore：按钮读高亮 / 写 setTool，不重复持有本地工具态。
  const tool = useToolStore((s) => s.tool);
  // T10/T11 选中联动：fabric 选中 → onSelectionChange 单向上报当前纸片 id → 图层面板 + 属性面板。
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // T16 导出图章：点导出盖朱红「Pasteup」图章（CSS 动效，reduced-motion 瞬时）。
  const [stamped, setStamped] = useState(false);

  // T12 无感自动保存 + 打开：收拢进 projectPersistence（#60），这里只剩三行接线——
  // 建实例（store/file 两个窄 adapter 投影既有 store 与 io 导出）、订阅 → schedule、卸载 dispose。
  // 防抖/首存弹位置/in-flight 补写/flush 编排在 io/autosave.ts，打开编排在 io/projectPersistence.ts。
  useEffect(() => {
    const persistence = createProjectPersistence({
      store: {
        getProject: () => useProjectStore.getState().project,
        getSavePath: () => useProjectStore.getState().savePath,
        setSavePath: (path) => useProjectStore.getState().setSavePath(path),
        setSaveStatus: (status) => useProjectStore.getState().setSaveStatus(status),
        open: (project, path) => useProjectStore.getState().openProject(project, path),
      },
      file: {
        pickSavePath,
        pickOpenPath,
        writeProjectFile,
        readProjectFile,
      },
    });
    persistenceRef.current = persistence;
    const unsubscribe = useProjectStore.subscribe((state, prev) => {
      // 只对 project 变化触发（saveStatus/savePath 变化不重复写盘）。
      // 打开项目（openProject 替换 project）会触发 schedule → 500ms 后一次无害写回
      // （内容=磁盘内容，非污染；顺带把打开前 saveStatus='error' 刷新为 saved）。
      // 属预期行为（T12 / #52 Q5），不抑制。
      if (state.project !== prev.project) persistence.schedule();
    });
    return () => {
      unsubscribe();
      persistence.dispose();
      persistenceRef.current = null;
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

  // PNG 导出离线化（#49）：从 schema 经临时 StaticCanvas 重建截屏，不碰活画布；
  // 无需 canvas 引用，按钮全程可用（旧路径经 onReady 漏出的 canvasRef 已收回）。
  const handleExportPNG = async () => {
    const { dataUrl, width, height } = await exportProjectToPNG(project);
    downloadPNG(dataUrl, `pasteup-export-${width}x${height}.png`);
    setStamped(true);
  };

  const handleExportSvg = async () => {
    const svg = await exportProjectToSVG(project);
    saveSvgFile(svg, 'pasteup.svg');
    setStamped(true);
  };

  // T12 手动「保存」：projectPersistence.save() 即原 flush 语义（立即写盘无视防抖；首次仍弹位置）。
  const handleSave = () => {
    setFileError(null);
    void persistenceRef.current?.save();
  };

  // T12 「打开」：编排收拢进 projectPersistence.open()（选文件 → 读取 → store.open）。
  // reject 传播到壳：catch 设瞬态 fileError（React state，顶栏展示）；成功/取消 resolve 后清除。
  const handleOpen = async () => {
    try {
      await persistenceRef.current?.open();
      setFileError(null);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : '打开项目失败');
    }
  };

  return (
    <div className="app-shell">
      <JournalShell
        topbar={
          <div className="brand">
            <div className="topbar-group topbar-group--brand">
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
            </div>
            <span className="topbar-divider" aria-hidden="true" />
            <div className="topbar-group" data-testid="topbar-file">
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
            </div>
            <span className="topbar-divider" aria-hidden="true" />
            <div className="topbar-group" data-testid="topbar-tools">
              <button
                className={`tool-btn${tool === 'select' ? ' tool-btn--active' : ''}`}
                data-testid="tool-select"
                aria-pressed={tool === 'select'}
                onClick={() => useToolStore.getState().setTool('select')}
              >
                选择
              </button>
              <button
                className={`tool-btn${tool === 'trace' ? ' tool-btn--active' : ''}`}
                data-testid="tool-trace"
                aria-pressed={tool === 'trace'}
                onClick={() => useToolStore.getState().setTool('trace')}
              >
                描绘
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
            </div>
            <span className="topbar-divider" aria-hidden="true" />
            <div className="topbar-group" data-testid="topbar-canvas">
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
            </div>
            <span className="brand-spacer" aria-hidden="true" />
            <div className="topbar-group" data-testid="topbar-export">
              <button
                className="tool-btn"
                data-testid="export-png"
                aria-label="导出 PNG"
                onClick={() => void handleExportPNG()}
              >
                导出 PNG
              </button>
              <button
                className="tool-btn"
                data-testid="export-svg"
                onClick={() => void handleExportSvg()}
              >
                导出 SVG
              </button>
              <CircleNote label="盖戳" testId="export-circle-note" className="circle-note--export" />
            </div>
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
        />
      </JournalShell>
      <NewProjectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <div className="grain" aria-hidden="true" />
      <div className="fiber" aria-hidden="true" />
    </div>
  );
}
