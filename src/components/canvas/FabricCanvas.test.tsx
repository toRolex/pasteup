import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { Canvas, FabricImage } from 'fabric';
import { FabricCanvas, type FabricCanvasApi } from './FabricCanvas';
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

  it('渲染底图并在 visible 切换时保持纸片对象不变', async () => {
    vi.spyOn(FabricImage, 'fromURL').mockResolvedValue({ width: 1200, height: 800, render: () => {}, dispose: () => {} } as unknown as FabricImage);
    let canvas: Canvas | undefined;
    const project = projectWithOnePaper();
    project.bgPhoto = { dataUrl: 'data:image/png;base64,AA', visible: true };
    const { rerender } = render(<FabricCanvas project={project} onReady={(c) => { canvas = c; }} />);
    await waitFor(() => expect(canvas!.backgroundImage).toBeDefined());
    expect(canvas!.backgroundImage!.visible).toBe(true);
    const paper = canvas!.getObjects()[0];
    const hidden = { ...project, bgPhoto: { ...project.bgPhoto, visible: false } };
    rerender(<FabricCanvas project={hidden} onReady={(c) => { canvas = c; }} />);
    expect(canvas!.backgroundImage!.visible).toBe(false);
    expect(canvas!.getObjects()[0]).toBe(paper);
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
describe('FabricCanvas 导航 API（seam S5）— apiRef 只改视口不动元素', () => {
  it('apiRef 暴露 zoomBy/panBy/resetViewport，元素属性不变', () => {
    let canvas: Canvas | undefined;
    const apiRef: { current: FabricCanvasApi | null } = { current: null };
    const project = projectWithOnePaper({ x: 24, y: 48, rotation: 0, scaleX: 1, scaleY: 1 });

    render(<FabricCanvas project={project} apiRef={apiRef} onReady={(c) => { canvas = c; }} />);

    expect(apiRef.current).not.toBeNull();
    expect(canvas!.viewportTransform).toEqual([1, 0, 0, 1, 0, 0]);

    const obj = canvas!.getObjects()[0];
    const before = { left: obj.left, top: obj.top, scaleX: obj.scaleX, scaleY: obj.scaleY };

    expect(apiRef.current!.zoomBy(2)).toBe(2);
    expect(canvas!.viewportTransform[0]).toBe(2);
    expect(obj.left).toBe(before.left);
    expect(obj.top).toBe(before.top);
    expect(obj.scaleX).toBe(before.scaleX);
    expect(obj.scaleY).toBe(before.scaleY);

    apiRef.current!.panBy(50, 30);
    expect(canvas!.viewportTransform[4]).toBe(50);
    expect(canvas!.viewportTransform[5]).toBe(30);
    expect(obj.left).toBe(before.left);
    expect(obj.top).toBe(before.top);

    apiRef.current!.resetViewport();
    expect(canvas!.viewportTransform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('卸载后 apiRef 置空', () => {
    const apiRef: { current: FabricCanvasApi | null } = { current: null };
    const project = projectWithOnePaper();

    const { unmount } = render(<FabricCanvas project={project} apiRef={apiRef} />);
    expect(apiRef.current).not.toBeNull();

    unmount();
    expect(apiRef.current).toBeNull();
  });
});
