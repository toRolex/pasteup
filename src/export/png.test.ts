import { describe, expect, it, vi } from 'vitest';
import type { Canvas } from 'fabric';
import { createEmptyProject } from '../types/project';
import { downloadPNG, exportCanvasToPNG } from './png';

interface FakeCanvasState {
  width: number;
  height: number;
  backgroundImage: unknown;
  viewportTransform: number[];
  requestRenderAll: ReturnType<typeof vi.fn>;
  setViewportTransform: ReturnType<typeof vi.fn>;
  toDataURL: ReturnType<typeof vi.fn>;
}

/** 构造可注入断言的 fake fabric canvas（jsdom 无真实渲染，导出管线 seam 用 mock）。 */
function fakeCanvas(): { state: FakeCanvasState; canvas: Canvas } {
  const state: FakeCanvasState = {
    width: 2480,
    height: 3508,
    backgroundImage: undefined,
    viewportTransform: [1, 0, 0, 1, 0, 0],
    requestRenderAll: vi.fn(),
    setViewportTransform: vi.fn(),
    toDataURL: vi.fn(() => 'data:image/png;base64,iVBORw0KGgo='),
  };
  state.setViewportTransform = vi.fn((vpt: number[]) => {
    state.viewportTransform = vpt;
  });
  return { state, canvas: state as unknown as Canvas };
}

const FAKE_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

describe('exportCanvasToPNG（T14 seam）', () => {
  it('默认导出返回 {dataUrl,width,height}，尺寸与 project.canvas 一致（seam 1）', () => {
    const project = createEmptyProject(2480, 3508);
    const { canvas } = fakeCanvas();

    const result = exportCanvasToPNG(canvas, project);

    expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.width).toBe(project.canvas.width);
    expect(result.height).toBe(project.canvas.height);
  });

  it('以正确导出参数调用 toDataURL：format png / multiplier 1 / enableRetinaScaling false（seam 4）', () => {
    const project = createEmptyProject(2480, 3508);
    const { state, canvas } = fakeCanvas();

    exportCanvasToPNG(canvas, project);

    expect(state.toDataURL).toHaveBeenCalledWith({
      format: 'png',
      multiplier: 1,
      enableRetinaScaling: false,
    });
  });

  it('底图默认不含导出：toDataURL 期间 backgroundImage 被临时置空，结束后恢复原引用（seam 2）', () => {
    const project = createEmptyProject(2480, 3508);
    const { state, canvas } = fakeCanvas();
    const bg = { src: 'data:image/png;base64,BBBB' };
    state.backgroundImage = bg;
    const observedDuringCall: unknown[] = [];
    state.toDataURL = vi.fn(() => {
      observedDuringCall.push(state.backgroundImage);
      return FAKE_DATA_URL;
    });

    exportCanvasToPNG(canvas, project);

    expect(observedDuringCall).toEqual([undefined]);
    expect(state.backgroundImage).toBe(bg);
  });

  it('includeBackground:true 时底图不被隐藏（toDataURL 期间 backgroundImage 保持原引用）（seam 3）', () => {
    const project = createEmptyProject(2480, 3508);
    const { state, canvas } = fakeCanvas();
    const bg = { src: 'data:image/png;base64,BBBB' };
    state.backgroundImage = bg;
    const observedDuringCall: unknown[] = [];
    state.toDataURL = vi.fn(() => {
      observedDuringCall.push(state.backgroundImage);
      return FAKE_DATA_URL;
    });

    exportCanvasToPNG(canvas, project, { includeBackground: true });

    expect(observedDuringCall).toEqual([bg]);
    expect(state.backgroundImage).toBe(bg);
  });

  it('multiplier 缩放：透传给 toDataURL，输出尺寸 = 画布像素 × multiplier（seam 5）', () => {
    const project = createEmptyProject(2480, 3508);
    const { state, canvas } = fakeCanvas();

    const result = exportCanvasToPNG(canvas, project, { multiplier: 2 });

    expect(state.toDataURL).toHaveBeenCalledWith({
      format: 'png',
      multiplier: 2,
      enableRetinaScaling: false,
    });
    expect(result.width).toBe(project.canvas.width * 2);
    expect(result.height).toBe(project.canvas.height * 2);
  });

  it('导出期间视口复位为 identity，结束后恢复原视口并 requestRenderAll 同步（seam 6）', () => {
    const project = createEmptyProject(2480, 3508);
    const { state, canvas } = fakeCanvas();
    const zoomed = [2, 0, 0, 2, 120, 60];
    state.viewportTransform = zoomed;
    const observedDuringCall: number[][] = [];
    state.toDataURL = vi.fn(() => {
      observedDuringCall.push([...state.viewportTransform]);
      return FAKE_DATA_URL;
    });

    exportCanvasToPNG(canvas, project);

    expect(observedDuringCall).toEqual([[1, 0, 0, 1, 0, 0]]);
    expect(state.viewportTransform).toEqual(zoomed);
    expect(state.requestRenderAll).toHaveBeenCalled();
  });

  it('toDataURL 抛错时仍恢复底图与视口并 requestRenderAll（try/finally，画布不残留污染状态）', () => {
    const project = createEmptyProject(2480, 3508);
    const { state, canvas } = fakeCanvas();
    const bg = { src: 'data:image/png;base64,BBBB' };
    state.backgroundImage = bg;
    const zoomed = [1.5, 0, 0, 1.5, 40, 20];
    state.viewportTransform = zoomed;
    state.toDataURL = vi.fn(() => {
      throw new Error('render fail');
    });

    expect(() => exportCanvasToPNG(canvas, project)).toThrow('render fail');
    expect(state.backgroundImage).toBe(bg);
    expect(state.viewportTransform).toEqual(zoomed);
    expect(state.requestRenderAll).toHaveBeenCalled();
  });
});

describe('downloadPNG（T14 seam）', () => {
  it('创建 a[download][href=dataUrl] 并触发 click（seam 7）', () => {
    const createSpy = vi.spyOn(document, 'createElement');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadPNG(FAKE_DATA_URL, 'pasteup-export.png');

    const anchor = createSpy.mock.results[0].value as HTMLAnchorElement;
    expect(anchor.tagName.toLowerCase()).toBe('a');
    expect(anchor.href).toBe(FAKE_DATA_URL);
    expect(anchor.download).toBe('pasteup-export.png');
    expect(clickSpy).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
  });
});
