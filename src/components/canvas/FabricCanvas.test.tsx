import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Canvas } from 'fabric';
import { FabricCanvas } from './FabricCanvas';
import {
  createEmptyProject,
  createPaperElement,
  type PaperProject,
} from '../../types/project';

function projectWithOnePaper(
  transform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
): PaperProject {
  const project = createEmptyProject(1200, 800);
  project.elements.push(
    createPaperElement({
      path: 'M 0 0 L 100 0 L 100 80 L 0 80 Z',
      color: '#c0392b',
      opacity: 0.85,
      transform,
    }),
  );
  return project;
}

describe('FabricCanvas 桥接壳（seam 6/7）', () => {
  it('挂载后 fabric 画布渲染出一个带基础样式的纸片（P0 验收）', () => {
    let canvas: Canvas | undefined;
    const project = projectWithOnePaper({ x: 24, y: 48, rotation: 0, scaleX: 1, scaleY: 1 });

    render(<FabricCanvas project={project} onReady={(c) => { canvas = c; }} />);

    expect(canvas).toBeDefined();
    const objects = canvas!.getObjects();
    expect(objects).toHaveLength(1);
    const paper = objects[0];
    expect(paper.fill).toBe('#c0392b');
    expect(paper.opacity).toBe(0.85);
    expect(paper.left).toBe(24);
    expect(paper.top).toBe(48);
  });

  it('单向通信：fabric 事件经 onProjectChange 回灌，不反向写回 props（无双向绑定）', () => {
    let canvas: Canvas | undefined;
    const onProjectChange = vi.fn();
    const project = projectWithOnePaper();

    render(
      <FabricCanvas
        project={project}
        onReady={(c) => { canvas = c; }}
        onProjectChange={onProjectChange}
      />,
    );

    const obj = canvas!.getObjects()[0];
    obj.set({ left: 120, top: 200, angle: 45 });
    canvas!.fire('object:modified', { target: obj });

    expect(onProjectChange).toHaveBeenCalledTimes(1);
    const next = onProjectChange.mock.calls[0][0] as PaperProject;
    expect(next.elements[0].transform).toEqual({
      x: 120,
      y: 200,
      rotation: 45,
      scaleX: 1,
      scaleY: 1,
    });
    // 原 props 未被原地修改（无双向绑定）
    expect(project.elements[0].transform).toEqual({
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });
  });
});
