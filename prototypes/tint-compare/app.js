/* 纹理着色管线对比 — wayfinder #9 · 一次性代码 */
'use strict';

const TEX = [
  { id: 'conppr-black', label: '黑·手工纸（明度75）' },
  { id: 'conppr-blue',  label: '蓝·手工纸（明度124）' },
  { id: 'conppr-green', label: '绿·手工纸（明度140）' },
  { id: 'conppr-orange',label: '橙·手工纸（明度174）' },
  { id: 'conppr-yellow',label: '黄·手工纸（明度208）' },
];
const PALETTE = ['#d97a5c', '#6b8f6e', '#d6b05c', '#7d9bb3', '#c9888f', '#8a9a5b'];

let texImages = {};   // id -> HTMLImageElement (灰度明度层)
let composeCache = new Map(); // `${texId}:${color}` -> tinted canvas (方案A)

/* ---------- 纸片形状（复杂闭合 path） ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function blossomPath(cx, cy, R, rng) {
  const n = 48, pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const lobe = 0.62 + 0.34 * Math.pow(Math.abs(Math.cos(5 * t / 2)), 1.7);
    const r = R * lobe * (1 + (rng() - 0.5) * 0.1);
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return pts;
}
function traceShape(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3(pts, i + 1)[0] - p1[0]) / 6, c2y = p2[1] - (p3(pts, i + 1)[1] - p1[1]) / 6;
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
  }
  ctx.closePath();
}
function p3(pts, i) { return pts[(i + 1) % pts.length]; }
function paperPts() { return blossomPath(260, 210, 130, mulberry32(11)); }

/* ---------- 方案 A：程序合成（灰度 × 颜色 → 单图） ---------- */
function composeTint(texId, color) {
  const key = `${texId}:${color}`;
  if (composeCache.has(key)) return { canvas: composeCache.get(key), cached: true };
  const t0 = performance.now();
  const img = texImages[texId];
  const c = document.createElement('canvas');
  c.width = c.height = 1024;                       // 与源灰度层同尺寸，平铺尺度一致
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, 1024, 1024);            // 灰度明度层
  ctx.globalCompositeOperation = 'multiply';       // L × C（sRGB 相乘）
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1024, 1024);
  composeCache.set(key, c);
  return { canvas: c, cached: false, ms: performance.now() - t0 };
}

/* ---------- 方案 B：混合模式叠加（灰纹 pattern × multiply 色层） ---------- */
function drawBlendB(ctx, pts, texId, color) {
  ctx.save();
  traceShape(ctx, pts);
  ctx.clip();
  // 底层：用户色
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 520, 420);
  // 上层：灰度明度层 multiply
  ctx.globalCompositeOperation = 'multiply';
  const pat = ctx.createPattern(texImages[texId], 'repeat');
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, 520, 420);
  ctx.restore();
}

/* ---------- 渲染 ---------- */
function drawPaperA(ctx, pts, texId, color) {
  const { canvas, cached, ms } = composeTint(texId, color);
  ctx.save();
  traceShape(ctx, pts);
  ctx.clip();
  ctx.globalCompositeOperation = 'source-over';
  const pat = ctx.createPattern(canvas, 'repeat');
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, 520, 420);
  ctx.restore();
  return { cached, ms };
}

/* ---------- 状态 ---------- */
let currentTex = TEX[0].id;
let currentColor = PALETTE[0];

function render() {
  const cvA = document.getElementById('cvA').getContext('2d');
  const cvB = document.getElementById('cvB').getContext('2d');
  cvA.clearRect(0, 0, 520, 420);
  cvB.clearRect(0, 0, 520, 420);
  const pts = paperPts();

  const r = drawPaperA(cvA, pts, currentTex, currentColor);
  drawBlendB(cvB, pts, currentTex, currentColor);

  document.getElementById('compose-time').textContent =
    r.cached ? `缓存命中（无合成）` : `${r.ms.toFixed(1)} ms`;
  document.getElementById('cache-info').textContent = `${composeCache.size} 张`;

  updateMem();
}

function updateMem() {
  // A：缓存按 色×纹理。模拟 10 纹理 × 常用色池（当前缓存数 + 常驻 10）
  const pool = 12;
  const aCount = 10 * pool;
  const aBytes = (aCount * 0.6).toFixed(0);
  document.getElementById('memA-count').textContent = `${aCount} 张（当前缓存 ${composeCache.size}）`;
  document.getElementById('memA-bytes').textContent = `≈${aBytes} MB`;
}

/* ---------- fabric v7 集成验证（toSVG 保真） ---------- */
async function fabricDemo() {
  const outA = document.getElementById('svgA-preview');
  const outB = document.getElementById('svgB-preview');
  const note = document.getElementById('svg-note');
  try {
    const d = pathData();
    const tinted = composeTint(currentTex, currentColor).canvas;

    // A：pattern = 带色单图
    const fcA = new fabric.StaticCanvas(document.createElement('canvas'));
    fcA.setDimensions({ width: 400, height: 300 });
    const objA = new fabric.Path(d, {
      left: 60, top: 40, scaleX: 1.6, scaleY: 1.6,
      fill: new fabric.Pattern({ source: tinted, repeat: 'repeat' }),
    });
    fcA.add(objA);
    const svgA = fcA.toSVG();
    outA.innerHTML = svgA;
    fcA.dispose();

    // B：双层 — 色块 + 灰纹 multiply
    const fcB = new fabric.StaticCanvas(document.createElement('canvas'));
    fcB.setDimensions({ width: 400, height: 300 });
    const base = new fabric.Path(d, {
      left: 60, top: 40, scaleX: 1.6, scaleY: 1.6, fill: currentColor,
    });
    const patB = new fabric.Pattern({ source: texImages[currentTex], repeat: 'repeat' });
    const texLayer = new fabric.Path(d, {
      left: 60, top: 40, scaleX: 1.6, scaleY: 1.6,
      fill: patB, globalCompositeOperation: 'multiply',
    });
    fcB.add(base); fcB.add(texLayer);
    const svgB = fcB.toSVG();
    outB.innerHTML = svgB;
    fcB.dispose();

    const hasGco = /globalCompositeOperation|mix-blend/.test(svgB);
    const hrefIsDataURL = /href="data:/.test(svgB);
    note.innerHTML = hasGco
      ? `<strong>⚠️ B 方案 gco 有导出痕迹，需在外部渲染器（Inkscape/librsvg）实测。</strong>`
      : `<strong>❌ B 方案 toSVG 未导出混合模式指令</strong>（两个 path 各自 fill，无 multiply）：外部渲染器按 source-over 合成 → 灰纹盖住色块，颜色失效。<br><br>`
      + `自包含：A 的 pattern 内嵌 dataURL（✅ 自包含）；B 的灰纹 pattern 引用纹理 URL（${hrefIsDataURL ? '内嵌' : '外部 URL，❌ 不自包含'}）。`;
  } catch (e) {
    note.innerHTML = `<strong>fabric demo 异常：</strong>${e.message}`;
    outA.textContent = outB.textContent = '';
  }
}

function pathData() {
  const pts = paperPts().map(([x, y]) => [x - 260, y - 210]);
  const rng = mulberry32(11);
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (pts[(i + 1) % pts.length][0] - p1[0]) / 6, c2y = p2[1] - (pts[(i + 1) % pts.length][1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + ' Z';
}

/* ---------- init ---------- */
async function init() {
  // 加载灰度明度层
  await Promise.all(TEX.map(t => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { texImages[t.id] = img; res(); };
    img.onerror = rej;
    img.src = `textures/${t.id}.png`;
  })));

  // 纹理下拉
  const sel = document.getElementById('tex-select');
  TEX.forEach(t => {
    const o = document.createElement('option');
    o.value = t.id; o.textContent = t.label;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => { currentTex = sel.value; render(); fabricDemo(); });

  // 色板
  const sw = document.getElementById('swatches');
  PALETTE.forEach(c => {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === currentColor ? ' active' : '');
    b.style.background = c;
    b.dataset.c = c;
    b.addEventListener('click', () => {
      currentColor = c;
      document.querySelectorAll('.swatch').forEach(x => x.classList.toggle('active', x.dataset.c === c));
      document.getElementById('color-input').value = c;
      render(); fabricDemo();
    });
    sw.appendChild(b);
  });
  document.getElementById('color-input').addEventListener('input', (e) => {
    currentColor = e.target.value;
    render(); fabricDemo();
  });

  render();
  fabricDemo();
}

init();
