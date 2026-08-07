import { useState } from 'react';
import { FabricCanvas } from './components/canvas/FabricCanvas';
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
      <header className="app-title">pasteup · 手帐剪纸拼贴</header>
      <main className="app-canvas">
        <FabricCanvas project={project} onProjectChange={setProject} />
      </main>
    </div>
  );
}
