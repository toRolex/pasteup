/* P0 验证：toSVG 对 pattern+图案变换的保真度 — 一次性原型 */
import {
  Canvas,
  Pattern,
  Polygon,
  util,
} from 'fabric';

const VIEW_W = 560;
const VIEW_H = 420;

/* ---------- 1. 程序化生成纸纹理（canvas source） ---------- */
function makeTextureCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f0e6d2';
  ctx.fillRect(0, 0, size, size);
  let seed = 12345;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 1800; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 0.4 + rng() * 1.8;
    ctx.fillStyle = `rgba(150,118,84,${(0.04 + rng() * 0.3).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 8; i++) {
    const x = rng() * size;
    const y = rng() * size;
    ctx.fillStyle = 'rgba(190,158,120,0.12)';
    ctx.beginPath();
    ctx.arc(x, y, 18 + rng() * 34, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

/* ---------- 2. 不规则闭合纸片路径 ---------- */
function makePaperPoints(cx, cy, R, n = 18, jitter = 0.42) {
  const pts = [];
  let seed = 777;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = R * (1 - jitter / 2 + rng() * jitter);
    pts.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
  }
  return pts;
}

/* ---------- 3. 组装场景 ---------- */
const texture = makeTextureCanvas(256);

function patternTransformFor(scenario) {
  if (scenario === 'scale') {
    return [2, 0, 0, 2, 0, 0];
  }
  if (scenario === 'scale-rotate') {
    const a = (30 * Math.PI) / 180;
    const rot = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
    const sc = [2, 0, 0, 2, 0, 0];
    return util.multiplyTransformMatrices(sc, rot); // scale 后 rotate（与 canvas ctx.transform 顺序一致）
  }
  return undefined;
}

const slot = document.getElementById('canvas-slot');
let canvas = null;
let currentPattern = null;

function buildScene(scenario) {
  slot.innerHTML = '';
  if (canvas) canvas.dispose();
  // fabric v7 的 Canvas 只接受 <canvas> 元素或 id 字符串；传 <div> 会创建游离 canvas 不挂载
  const el = document.createElement('canvas');
  el.width = VIEW_W;
  el.height = VIEW_H;
  slot.appendChild(el);
  canvas = new Canvas(el, { width: VIEW_W, height: VIEW_H });

  const source = texture; // canvas source → toSVG 内嵌 dataURL（产品路径）

  currentPattern = new Pattern({
    source,
    repeat: 'repeat',
    patternTransform: patternTransformFor(scenario),
  });

  const pts = makePaperPoints(0, 0, 150);
  const paper = new Polygon(pts, {
    left: VIEW_W / 2,
    top: VIEW_H / 2,
    scaleX: 1.15,
    scaleY: 1.15,
    angle: 18,
    fill: currentPattern,
  });
  canvas.add(paper);
  canvas.requestRenderAll();
}

/* ---------- 4. 导出 + 补丁 ---------- */
function patchPatternTransform(svg, pattern) {
  if (!pattern || !pattern.patternTransform) return svg;
  const m = pattern.patternTransform.map((v) => v.toFixed(3)).join(' ');
  return svg.replace(/<pattern ([^>]*)>/g, (match, attrs) =>
    match.replace('>', ` patternTransform="matrix(${m})">`),
  );
}

function svgToImage(svg) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  return URL.createObjectURL(blob);
}

function svgToImageEl(svg) {
  const url = svgToImage(svg);
  const img = new Image();
  img.onload = () => URL.revokeObjectURL(url);
  img.src = url;
  return img;
}

/* ---------- 5. 程序化检查 ---------- */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function runChecks(svg, patched) {
  const out = [];
  const hasPattern = /<pattern /i.test(svg);
  out.push([
    hasPattern ? 'ok' : 'bad',
    esc(`<pattern> 元素存在：${hasPattern ? '是' : '否'}`),
  ]);

  // 自包含：pattern 内 image 是 dataURL 而非外部 URL
  const imageHref = svg.match(/<image[^>]*xlink:href="([^"]*)"/i);
  const isData = imageHref && /^data:image\//i.test(imageHref[1]);
  out.push([
    isData ? 'ok' : 'bad',
    esc(`位图内嵌自包含（image href 为 dataURL）：${isData ? '是' : '否'}`),
  ]);

  // patternTransform 是否出现在 <pattern>
  const hasPT = /<pattern[^>]*patternTransform=/i.test(svg);
  out.push([
    hasPT ? 'ok' : 'bad',
    esc(`SVG 中 <pattern> 携带 patternTransform：${hasPT ? '是' : '否'} ${
      hasPT ? '' : '（fabric toSVG 未输出 → 丢失）'
    }`),
  ]);

  // pattern 是否真在 <defs> 内（严格 SVG 消费方要求）
  const defsContent = (svg.match(/<defs>([\s\S]*?)<\/defs>/) || [])[1] || '';
  const patternInsideDefs = /<pattern /.test(defsContent);
  out.push([
    patternInsideDefs ? 'ok' : 'warn',
    esc(`<pattern> 位于 <defs> 内：${patternInsideDefs ? '是' : '否'}（当前在对象 <g> 内联，严格渲染器可能不解析）`),
  ]);

  const patchedHasPT = /<pattern[^>]*patternTransform=/i.test(patched);
  out.push([
    patchedHasPT ? 'ok' : 'bad',
    esc(`补丁后 <pattern> 携带 patternTransform：${patchedHasPT ? '是' : '否'}`),
  ]);

  const container = document.getElementById('checks');
  container.innerHTML = out
    .map(
      ([cls, text]) =>
        `<div class="check-row"><span class="${cls}">[${cls === 'ok' ? '通过' : cls === 'warn' ? '警告' : '失败'}]</span> ${text}</div>`,
    )
    .join('');

  // 结论横幅
  const expectTransform = !!currentPattern?.patternTransform;
  const verdict = document.getElementById('verdict');
  if (expectTransform && !hasPT) {
    verdict.innerHTML =
      '<span class="bad">结论：不保真 — patternTransform 丢失，裸 toSVG 不能直接用于导出（需补丁/兜底）。</span>';
  } else if (expectTransform && !patchedHasPT) {
    verdict.innerHTML =
      '<span class="warn">结论：需补丁 — patternTransform 未写入导出。</span>';
  } else if (expectTransform) {
    verdict.innerHTML =
      '<span class="ok">结论：补丁后恢复图案变换（与画布 avgGrad 接近）。</span>';
  } else {
    verdict.innerHTML =
      '<span class="ok">结论：无图案变换场景保真（对象变换 + 位图内嵌自包含）。</span>';
  }
}

/* ---------- 6. 主流程 ---------- */
function run() {
  const scenario = document.getElementById('scenario').value;
  buildScene(scenario);

  const svg = canvas.toSVG({ suppressPreamble: false });
  const patched = document.getElementById('patch-toggle').checked
    ? patchPatternTransform(svg, currentPattern)
    : svg;

  const svgSlot = document.getElementById('svg-slot');
  const patchedSlot = document.getElementById('patched-slot');
  svgSlot.innerHTML = '';
  patchedSlot.innerHTML = '';
  svgSlot.appendChild(svgToImageEl(svg));
  patchedSlot.appendChild(svgToImageEl(patched));

  document.getElementById('svg-source').textContent = svg;
  runChecks(svg, patched);
}

document.getElementById('scenario').addEventListener('change', run);
document.getElementById('patch-toggle').addEventListener('change', run);
document.getElementById('export-btn').addEventListener('click', run);

document.getElementById('save-svg').addEventListener('click', () => {
  const svg = canvas.toSVG();
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tosvg-${document.getElementById('scenario').value}.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

run();
