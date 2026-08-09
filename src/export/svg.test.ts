/**
 * T13 导出 SVG — 主 seam 断言测试。
 *
 * S1 主 seam：postProcessSvg 纯函数（pattern/filter → defs、无 patternTransform、dataURL 内嵌）。
 * S2 纸片纹理填充接线：buildRawSvg（textureId → dataUrl → Pattern）。
 * S3 导出管线：exportProjectToSVG（注入 loadSource 可测）。
 * S4 保存文件：saveSvgFile（mock 下载）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyProject,
  createPaperElement,
  createPaperTexture,
  type PaperProject,
} from '../types/project';
import { createTextureLoader } from '../texture/loader';
import {
  buildRawSvg,
  exportProjectToSVG,
  postProcessSvg,
  saveSvgFile,
} from './svg';

const RECT = 'M 0 0 L 100 0 L 100 80 L 0 80 Z';

/** 与 fabric v7 Pattern.toSVG 一致的 pattern 片段（含 dataURL）。 */
const PATTERN = `<pattern id="SVGID_0" x="0" y="0" width="0.64" height="0.6">
<image x="0" y="0" width="64" height="48" xlink:href="data:image/png;base64,AAAA"></image>
</pattern>`;

/** 与 fabric v7 Shadow.toSVG 一致的 filter 片段。 */
const FILTER = `<filter id="SVGID_1" y="-31.25%" height="162.5%" x="-26%" width="152%" >
\t<feGaussianBlur in="SourceAlpha" stdDeviation="3"></feGaussianBlur>
</filter>`;

const PATH = `<path style="fill: url(#SVGID_0);filter: url(#SVGID_1);" d="M 0 0 L 100 0 L 100 80 L 0 80 Z" />`;

/** 构造 fabric 风格 SVG 包装。 */
function fabricSvg(body: string, defs = '<defs>\n</defs>'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="200" height="200" viewBox="0 0 200 200" xml:space="preserve">
<desc>Created with Fabric.js 7.4.0</desc>
${defs}
${body}
</svg>`;
}

function defsSection(svg: string): string {
  const start = svg.indexOf('<defs');
  const end = svg.indexOf('</defs>');
  if (start === -1 || end === -1) return '';
  return svg.slice(start, end);
}

describe('postProcessSvg（S1 主 seam）— pattern/filter 收进 defs + 契约断言', () => {
  it('把 body 中的 `<pattern>` 与 `<filter>` 移入已有 `<defs>`，path 引用保留', () => {
    const input = fabricSvg(`<g transform="matrix(1 0 0 1 0 0)"  >\n${PATTERN}\n${FILTER}\n${PATH}\n</g>`);
    const out = postProcessSvg(input);

    const defs = defsSection(out);
    expect(defs).toContain('<pattern');
    expect(defs).toContain('<filter');
    // pattern 元素总数不变（只移动位置，不复制）
    expect(out.match(/<pattern/g)).toHaveLength(1);
    // path 的 fill/filter 引用保留
    expect(out).toContain('fill: url(#SVGID_0)');
    expect(out).toContain('filter: url(#SVGID_1)');
    // body（defs 之外）不再含 pattern 元素
    const afterDefs = out.slice(out.indexOf('</defs>'));
    expect(afterDefs).not.toContain('<pattern');
  });

  it('无 `<defs>` 时创建 defs 再移入', () => {
    const input = fabricSvg(`<g transform="matrix(1 0 0 1 0 0)"  >\n${PATTERN}\n${PATH}\n</g>`, '');
    const out = postProcessSvg(input);

    expect(out).toContain('<defs');
    expect(defsSection(out)).toContain('<pattern');
  });

  it('多个纸片各自 pattern 移入同一 defs 且 id 唯一保留', () => {
    const p2 = PATTERN.replace('SVGID_0', 'SVGID_2').replace('AAAA', 'BBBB');
    const path2 = PATH.replace('SVGID_0', 'SVGID_2');
    const input = fabricSvg(
      `<g>\n${PATTERN}\n${PATH}\n</g>\n<g>\n${p2}\n${path2}\n</g>`,
    );
    const out = postProcessSvg(input);

    const defs = defsSection(out);
    expect(defs).toContain('SVGID_0');
    expect(defs).toContain('SVGID_2');
    expect(out).toContain('data:image/png;base64,BBBB');
  });

  it('无 patternTransform 契约：输入含 patternTransform 属性时抛错（ADR 0001）', () => {
    const bad = PATTERN.replace(
      'width="0.64"',
      'width="0.64" patternTransform="matrix(1 0 0 1 0 0)"',
    );
    const input = fabricSvg(`<g>\n${bad}\n${PATH}\n</g>`);
    expect(() => postProcessSvg(input)).toThrow(/patternTransform/);
  });

  it('纹理 dataURL 内嵌自包含保留（不依赖外部资源）', () => {
    const out = postProcessSvg(fabricSvg(`<g>\n${PATTERN}\n${PATH}\n</g>`));
    expect(out).toContain('data:image/png;base64,AAAA');
  });

  it('不引入底图相关元素（输出无 background 引用；底图排除在 buildRawSvg 层断言）', () => {
    const out = postProcessSvg(fabricSvg(`<g>\n${PATTERN}\n${PATH}\n</g>`));
    expect(out).not.toMatch(/background/i);
  });
});

describe('buildRawSvg（S2）— 纸片纹理填充接线（textureId → dataUrl → Pattern）', () => {
  const fakeSource = {
    width: 64,
    height: 48,
    src: 'data:image/png;base64,AAAA',
  } as unknown as CanvasImageSource;

  function texturedProject(): PaperProject {
    const project = createEmptyProject(1200, 800);
    project.elements.push(
      createPaperElement({ path: RECT, color: '#c0392b', textureId: 'tex-1' }),
    );
    project.textures.push(
      createPaperTexture({
        id: 'tex-1',
        style: 'fold',
        seed: 1,
        color: '#c0392b',
        dataUrl: 'data:image/png;base64,AAAA',
      }),
    );
    return project;
  }

  it('含纹理纸片 → 输出 `<pattern>` 且无 patternTransform（ADR 0001）', () => {
    const raw = buildRawSvg(texturedProject(), new Map([['tex-1', fakeSource]]));
    expect(raw).toContain('<pattern');
    expect(raw).not.toContain('patternTransform');
  });

  it('纹理 dataURL 内嵌自包含（xlink:href 含 data: URL）', () => {
    const raw = buildRawSvg(texturedProject(), new Map([['tex-1', fakeSource]]));
    expect(raw).toContain('xlink:href="data:image/png;base64,AAAA"');
  });

  it('无纹理纸片 → 纯色填充，无 `<pattern>`', () => {
    const project = createEmptyProject(200, 200);
    project.elements.push(createPaperElement({ path: RECT, color: '#c0392b' }));
    const raw = buildRawSvg(project, new Map());
    expect(raw).not.toContain('<pattern');
  });

  it('底图默认不含导出：有 bgPhoto 项目输出不含底图 dataURL', () => {
    const project = texturedProject();
    project.bgPhoto = { dataUrl: 'data:image/jpeg;base64,BGIMAGE', visible: true };
    const raw = buildRawSvg(project, new Map([['tex-1', fakeSource]]));
    expect(raw).not.toContain('BGIMAGE');
  });

  it('transform 完整应用（left/top/angle/scaleX/scaleY → `<g>` 矩阵）', () => {
    const project = createEmptyProject(1200, 800);
    project.elements.push(
      createPaperElement({
        path: RECT,
        color: '#c0392b',
        textureId: 'tex-1',
        transform: { x: 24, y: 48, rotation: 90, scaleX: 2, scaleY: 0.5 },
      }),
    );
    project.textures.push(
      createPaperTexture({
        id: 'tex-1',
        style: 'fold',
        seed: 1,
        color: '#c0392b',
        dataUrl: 'data:image/png;base64,AAAA',
      }),
    );
    const raw = buildRawSvg(project, new Map([['tex-1', fakeSource]]));

    const match = raw.match(/<g transform="matrix\(([^)]+)\)"/);
    expect(match).toBeTruthy();
    const m = match![1].trim().split(/\s+/).map(Number);
    // 列向量长度 = scaleX / scaleY（旋转不改变列长度）
    expect(Math.hypot(m[0], m[1])).toBeCloseTo(2, 1);
    expect(Math.hypot(m[2], m[3])).toBeCloseTo(0.5, 1);
    // rotation=90 已应用：X 轴不再水平（纯缩放时 m[1]=0）
    expect(Math.abs(m[1])).toBeGreaterThan(0.1);
  });
});

describe('exportProjectToSVG（S3）— 导出管线（注入共享 loader）', () => {
  const fakeSource = {
    width: 64,
    height: 48,
    src: 'data:image/png;base64,AAAA',
  } as unknown as CanvasImageSource;

  it('带 transform + 纹理纸片 → 输出 post-process 后 SVG（pattern 在 defs、dataURL 保留、transform 应用）', async () => {
    const project = createEmptyProject(1200, 800);
    project.elements.push(
      createPaperElement({
        path: RECT,
        color: '#c0392b',
        textureId: 'tex-1',
        transform: { x: 24, y: 48, rotation: 90, scaleX: 2, scaleY: 0.5 },
      }),
    );
    project.textures.push(
      createPaperTexture({
        id: 'tex-1',
        style: 'fold',
        seed: 1,
        color: '#c0392b',
        dataUrl: 'data:image/png;base64,AAAA',
      }),
    );
    const load = vi.fn(async () => fakeSource as CanvasImageSource);
    const loader = createTextureLoader({ load });

    const svg = await exportProjectToSVG(project, loader);

    expect(load).toHaveBeenCalledWith('data:image/png;base64,AAAA');
    expect(defsSection(svg)).toContain('<pattern');
    expect(svg).toContain('data:image/png;base64,AAAA');
    expect(svg).not.toContain('patternTransform');

    const match = svg.match(/<g transform="matrix\(([^)]+)\)"/);
    expect(match).toBeTruthy();
    const m = match![1].trim().split(/\s+/).map(Number);
    expect(Math.hypot(m[0], m[1])).toBeCloseTo(2, 1);
    expect(Math.hypot(m[2], m[3])).toBeCloseTo(0.5, 1);
  });

  it('空项目导出为合法 SVG 根（无 pattern/无底图）', async () => {
    const project = createEmptyProject(2480, 3508);
    const loader = createTextureLoader({ load: async () => fakeSource as CanvasImageSource });
    const svg = await exportProjectToSVG(project, loader);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="2480"');
    expect(svg).toContain('height="3508"');
    expect(svg).not.toContain('<pattern');
  });

  it('同一 dataURL 多个纹理记录去重：共享 loader 只调用一次（T18 共用管线）', async () => {
    const project = createEmptyProject(200, 200);
    project.textures.push(
      createPaperTexture({ id: 'tex-1', style: 'fold', seed: 1, color: '#c0392b', dataUrl: 'D1' }),
      createPaperTexture({ id: 'tex-2', style: 'fold', seed: 2, color: '#c0392b', dataUrl: 'D1' }),
    );
    project.elements.push(
      createPaperElement({ path: RECT, color: '#c0392b', textureId: 'tex-1' }),
      createPaperElement({
        path: RECT,
        color: '#c0392b',
        textureId: 'tex-2',
        transform: { x: 120, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      }),
    );
    const load = vi.fn(async () => fakeSource as CanvasImageSource);
    const loader = createTextureLoader({ load });

    await exportProjectToSVG(project, loader);

    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('saveSvgFile（S4）— 浏览器下载保存', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('创建 Blob（image/svg+xml）并经 `<a download>` 触发下载，URL 释放', async () => {
    const createObjectURL = URL.createObjectURL as unknown as ReturnType<typeof vi.fn>;
    const revokeObjectURL = URL.revokeObjectURL as unknown as ReturnType<typeof vi.fn>;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    let appended: HTMLAnchorElement | null = null;
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      appended = node as HTMLAnchorElement;
      return node;
    });

    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    saveSvgFile(svg, 'pasteup.svg');

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('image/svg+xml');
    // jsdom Blob 无 .text()：用 FileReader 读内容断言
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(content).toBe(svg);
    expect(appended).not.toBeNull();
    expect(appended!.download).toBe('pasteup.svg');
    expect(appended!.href).toBe('blob:mock');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('未传文件名时默认 pasteup.svg', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    let appended: HTMLAnchorElement | null = null;
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      appended = node as HTMLAnchorElement;
      return node;
    });
    saveSvgFile('<svg />');
    expect(appended!.download).toBe('pasteup.svg');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
