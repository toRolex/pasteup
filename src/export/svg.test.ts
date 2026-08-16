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
import { createFabricPath } from '../fabric/paperBridge';
import {
  buildRawSvg,
  exportProjectToSVG,
  postProcessSvg,
  saveSvgFile,
} from './svg';

const RECT = 'M 0 0 L 100 0 L 100 80 L 0 80 Z';

/** 与运行时画布渲染对象一致的基准 transform：导出 `<g>` 矩阵必须等于它（T18-c 一致性核心断言）。 */
function canvasRenderMatrix(
  el: Parameters<typeof createFabricPath>[0],
  source: CanvasImageSource | null | undefined,
): number[] {
  return createFabricPath(el, source).calcTransformMatrix() as unknown as number[];
}

/** 解析 SVG：每个含 `<path>` 的 `<g>` 提取矩阵 / fill / opacity / 组内 pattern 的纹理 href。 */
function parseSvgGroups(svg: string) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const groups: Array<{
    matrix: number[];
    fill: string;
    opacity: string | null;
    stroke: string;
    patternHref: string | null;
  }> = [];
  for (const g of Array.from(doc.querySelectorAll('g'))) {
    const path = g.querySelector('path');
    if (!path) continue;
    const transform = g.getAttribute('transform') ?? '';
    const m = transform.match(/matrix\(([^)]+)\)/);
    const style = path.getAttribute('style') ?? '';
    const image = g.querySelector('pattern image');
    groups.push({
      matrix: m ? m[1].trim().split(/\s+/).map(Number) : [],
      fill: style.match(/fill:\s*([^;]+)/)?.[1]?.trim() ?? '',
      opacity: style.match(/opacity:\s*([^;]+)/)?.[1]?.trim() ?? null,
      stroke: style.match(/stroke:\s*([^;]+)/)?.[1]?.trim() ?? '',
      patternHref: image?.getAttribute('xlink:href') ?? null,
    });
  }
  return groups;
}

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

  it('非 90° 旋转 + 非 1 缩放：`<g>` 矩阵列向量精确还原 schema（rotation/scale 独立校验）', () => {
    const project = createEmptyProject(1200, 800);
    project.elements.push(
      createPaperElement({
        path: RECT,
        color: '#c0392b',
        transform: { x: 24, y: 48, rotation: 33, scaleX: 1.5, scaleY: 0.5 },
      }),
    );
    const raw = buildRawSvg(project, new Map());
    const groups = parseSvgGroups(raw);
    expect(groups).toHaveLength(1);
    const m = groups[0].matrix;

    const rad = (33 * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // 列向量长度 = scaleX / scaleY
    expect(Math.hypot(m[0], m[1])).toBeCloseTo(1.5, 2);
    expect(Math.hypot(m[2], m[3])).toBeCloseTo(0.5, 2);
    // 旋转方向与 schema 一致（33°：cos>0、sin>0）
    expect(m[0] / 1.5).toBeCloseTo(cos, 2);
    expect(m[1] / 1.5).toBeCloseTo(sin, 2);
    expect(m[2] / 0.5).toBeCloseTo(-sin, 2);
    expect(m[3] / 0.5).toBeCloseTo(cos, 2);
  });

  it('同 path/同 transform 不同位置：`<g>` 平移差 == schema 位置差（位置映射独立校验，不依赖同一 factory 代理）', () => {
    const project = createEmptyProject(1200, 800);
    project.elements.push(
      createPaperElement({
        path: RECT,
        color: '#c0392b',
        transform: { x: 100, y: 50, rotation: 0, scaleX: 1, scaleY: 1 },
      }),
      createPaperElement({
        path: RECT,
        color: '#c0392b',
        transform: { x: 400, y: 250, rotation: 0, scaleX: 1, scaleY: 1 },
      }),
    );
    const raw = buildRawSvg(project, new Map());
    const groups = parseSvgGroups(raw);
    expect(groups).toHaveLength(2);
    const [mA, mB] = groups.map((g) => g.matrix);
    // fabric.Path 矩阵平移含原点偏移（path 包围盒中心）；两纸片同 path/同旋转/同缩放
    // → 偏移常数彼此抵消，平移差即 schema 位置差（不受 fabric 内部偏移公式影响）。
    expect(mA[4] - mB[4]).toBeCloseTo(100 - 400, 2);
    expect(mA[5] - mB[5]).toBeCloseTo(50 - 250, 2);
  });

  it('导出 `<g>` 矩阵 == 画布渲染对象 calcTransformMatrix（位置/旋转/缩放与实时画布一致）', () => {
    const project = createEmptyProject(1200, 800);
    project.elements.push(
      createPaperElement({
        path: RECT,
        color: '#c0392b',
        textureId: 'tex-1',
        transform: { x: 24, y: 48, rotation: 33, scaleX: 1.5, scaleY: 0.5 },
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
    const sources = new Map([['tex-1', fakeSource]]);
    const raw = buildRawSvg(project, sources);
    const groups = parseSvgGroups(raw);
    expect(groups).toHaveLength(1);

    const expected = canvasRenderMatrix(project.elements[0], sources.get('tex-1'));
    groups[0].matrix.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 2));
  });

  it('多纸片各自 transform + 各自纹理：每个 `<g>` 矩阵与其 schema 对应、纹理各自内嵌不串', () => {
    const project = createEmptyProject(1200, 800);
    project.textures.push(
      createPaperTexture({ id: 'tex-1', style: 'fold', seed: 1, color: '#c0392b', dataUrl: 'DATA_A' }),
      createPaperTexture({ id: 'tex-2', style: 'fold', seed: 2, color: '#2e86c1', dataUrl: 'DATA_B' }),
    );
    const elA = createPaperElement({
      path: RECT,
      color: '#c0392b',
      textureId: 'tex-1',
      opacity: 1,
      transform: { x: 10, y: 20, rotation: 33, scaleX: 1.5, scaleY: 1 },
    });
    const elB = createPaperElement({
      path: RECT,
      color: '#2e86c1',
      textureId: 'tex-2',
      opacity: 0.6,
      transform: { x: 500, y: 300, rotation: -15, scaleX: 1, scaleY: 2.5 },
    });
    project.elements.push(elA, elB);

    const sources = new Map([
      ['tex-1', { ...fakeSource, src: 'DATA_A' } as unknown as CanvasImageSource],
      ['tex-2', { ...fakeSource, src: 'DATA_B' } as unknown as CanvasImageSource],
    ]);
    const raw = buildRawSvg(project, sources);
    const groups = parseSvgGroups(raw);
    expect(groups).toHaveLength(2);

    // 按纹理 href 定位 group，验证矩阵与对应元素 schema 一致（不串位姿）
    const groupA = groups.find((g) => g.patternHref === 'DATA_A')!;
    const groupB = groups.find((g) => g.patternHref === 'DATA_B')!;
    const expectedA = canvasRenderMatrix(elA, sources.get('tex-1'));
    const expectedB = canvasRenderMatrix(elB, sources.get('tex-2'));
    groupA.matrix.forEach((v, i) => expect(v).toBeCloseTo(expectedA[i], 2));
    groupB.matrix.forEach((v, i) => expect(v).toBeCloseTo(expectedB[i], 2));
    // 各自 opacity 跟随元素
    expect(groupA.opacity).toBe('1');
    expect(groupB.opacity).toBe('0.6');
  });

  it('纯色纸片填充色 = element.color（hex → rgb 输出），描边 = 加深色（厚度质感）', () => {
    const project = createEmptyProject(1200, 800);
    project.elements.push(
      createPaperElement({ path: RECT, color: '#c0392b', transform: { x: 24, y: 48, rotation: 0, scaleX: 1, scaleY: 1 } }),
    );
    const raw = buildRawSvg(project, new Map());
    const groups = parseSvgGroups(raw);
    expect(groups).toHaveLength(1);
    expect(groups[0].fill).toBe('rgb(192,57,43)');
    // #c0392b × 0.82 → rgb(157,47,35)，与运行时同一 factory 产物一致
    expect(groups[0].stroke).toBe('rgb(157,47,35)');
  });

  it('opacity 正确导出到 `<path>` style（含纹理纸片）', () => {
    const project = createEmptyProject(1200, 800);
    project.textures.push(
      createPaperTexture({ id: 'tex-1', style: 'fold', seed: 1, color: '#c0392b', dataUrl: 'data:image/png;base64,AAAA' }),
    );
    project.elements.push(
      createPaperElement({ path: RECT, color: '#c0392b', opacity: 0.85, textureId: 'tex-1' }),
    );
    const raw = buildRawSvg(project, new Map([['tex-1', fakeSource]]));
    const groups = parseSvgGroups(raw);
    expect(groups).toHaveLength(1);
    expect(groups[0].opacity).toBe('0.85');
    // 含纹理时 fill 为 pattern 引用（纹理优先，颜色烘焙在 dataURL 内）
    expect(groups[0].fill).toMatch(/^url\(#/);
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

  it('两个不同纹理纸片端到端：post-process 后各自 pattern 收进 defs、path 引用各自纹理 id（不串纹理）', async () => {
    const project = createEmptyProject(1200, 800);
    project.textures.push(
      createPaperTexture({ id: 'tex-1', style: 'fold', seed: 1, color: '#c0392b', dataUrl: 'DATA_A' }),
      createPaperTexture({ id: 'tex-2', style: 'fold', seed: 2, color: '#2e86c1', dataUrl: 'DATA_B' }),
    );
    project.elements.push(
      createPaperElement({
        path: RECT,
        color: '#c0392b',
        textureId: 'tex-1',
        transform: { x: 10, y: 20, rotation: 33, scaleX: 1.5, scaleY: 1 },
      }),
      createPaperElement({
        path: RECT,
        color: '#2e86c1',
        textureId: 'tex-2',
        transform: { x: 500, y: 300, rotation: -15, scaleX: 1, scaleY: 2.5 },
      }),
    );
    const load = vi.fn(async (href: string) => ({ ...fakeSource, src: href }) as CanvasImageSource);
    const loader = createTextureLoader({ load });

    const svg = await exportProjectToSVG(project, loader);

    // 两个纹理 dataURL 均内嵌于 defs
    const defs = defsSection(svg);
    expect(defs).toContain('DATA_A');
    expect(defs).toContain('DATA_B');
    // 两个 path 各引用一个 pattern id，且 id 互不相同
    const fillRefs = Array.from(svg.matchAll(/fill:\s*url\(#([^)]+)\)/g)).map((m) => m[1]);
    expect(fillRefs).toHaveLength(2);
    expect(fillRefs[0]).not.toBe(fillRefs[1]);
    // 各自 pattern 的 xlink:href 对应各自纹理（A 不引用 B 的图，反之亦然）
    const hrefById = new Map(
      Array.from(svg.matchAll(/<pattern id="([^"]+)"[^>]*>[\s\S]*?xlink:href="([^"]+)"/g)).map((m) => [
        m[1],
        m[2],
      ]),
    );
    expect(hrefById.get(fillRefs[0])).toBe('DATA_A');
    expect(hrefById.get(fillRefs[1])).toBe('DATA_B');
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
