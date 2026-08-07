import { useState } from 'react';
import { FabricCanvas } from './components/canvas/FabricCanvas';
import { JournalShell } from './styles/journalLayout';
import {
  createEmptyProject,
  createPaperElement,
  type PaperProject,
} from './types/project';

/** P0 演示项目：画布上渲染一片带基础样式的纸片。 */
function createDemoProject(): PaperProject {
  const project = createEmptyProject(960, 640);
  project.elements.push(
    createPaperElement({
      path: 'M 60 40 Q 180 10 300 70 Q 340 200 260 320 Q 120 380 20 260 Q -20 100 60 40 Z',
      color: '#7a8b5c',
      opacity: 0.9,
      textureId: null,
      textureScale: 1,
      transform: { x: 120, y: 90, rotation: 12, scaleX: 1, scaleY: 1 },
    }),
  );
  return project;
}

export default function App() {
  const [project, setProject] = useState<PaperProject>(createDemoProject);

  return (
    <div className="app-shell">
      <JournalShell
        topbar={
          <div className="brand">
            <span className="brand-name">pasteup · 手帐剪纸拼贴</span>
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
            <h2 className="page-heading">色卡</h2>
            <div className="torn-paper">
              <span className="note-text">右页待承载：色板 / 纹理 / 属性便签</span>
            </div>
            <span className="stamp">已装订</span>
          </div>
        }
      >
        <FabricCanvas project={project} onProjectChange={setProject} />
      </JournalShell>
      <div className="grain" aria-hidden="true" />
      <div className="fiber" aria-hidden="true" />
    </div>
  );
}
