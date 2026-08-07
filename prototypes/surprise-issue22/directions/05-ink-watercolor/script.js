/* ============================================================
   pasteup · 05 墨与水彩 INK & WATERCOLOR
   水彩引擎：边缘多点扩散 + 色边 + 羽化，全部手写 canvas 2D。
   纸片不是硬边多边形，是「墨往纸里渗」的湿边缘。
   ============================================================ */
'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── 调色板与领域文案 ─────────────────────── */
const PALETTE = [
  { name: '湿纸白', hex: '#F8F5EC' },
  { name: '靛蓝',   hex: '#3B5B92' },
  { name: '朱红',   hex: '#C0392B' },
  { name: '藤黄',   hex: '#E8B84B' },
  { name: '深青',   hex: '#4A7C59' },
  { name: '墨',     hex: '#2C2A26' },
];

const TEXTURES = [
  { name: '晕染',   desc: '色向四周散开', spread: 1.0, wet: true },
  { name: '湿边',   desc: '留一圈浓色边', spread: 0.55, wet: true },
  { name: '留白',   desc: '水收住，留白', spread: 0.12, wet: false },
  { name: '叠一层', desc: '两遍色叠着走', spread: 0.8, wet: true, layered: true },
];

const PAPER = '#F8F5EC';
const WASHES = ['#3B5B92', '#C0392B', '#E8B84B', '#4A7C59', '#8A8172'];

/* ── 状态 ─────────────────────────────────── */
const state = {
  selectedId: null,
  activeColor: '#C0392B',
  tool: 'select',
  zoom: 100,
  pieces: [
    { id: 'p-mountain', kind: 'mountain', name: '纸片·远山', color: '#3B5B92', x: 0.30, y: 0.58, s: 0.40, rot: -2, seed: 11, bloom: 0.7, opacity: 0.92, wet: true },
    { id: 'p-leaf',     kind: 'leaf',     name: '纸片·枫叶', color: '#C0392B', x: 0.60, y: 0.50, s: 0.34, rot: 14, seed: 23, bloom: 0.62, opacity: 0.92, wet: true },
    { id: 'p-sun',      kind: 'sun',      name: '纸片·日轮', color: '#E8B84B', x: 0.79, y: 0.30, s: 0.15, rot: 0,  seed: 37, bloom: 0.5, opacity: 0.95, wet: true },
  ],
  base: { id: 'p-base', name: '底图·速写', color: '#8A8172' },
};
state.selectedId = state.pieces[1].id; // 初始选中枫叶

/* 撤销/重做历史 */
const history = { undo: [], redo: [] };

/* ── 工具函数 ─────────────────────────────── */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

function hexToRgb(hex) {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbCss(c, a = 1) {
  const [r, g, b] = hexToRgb(c);
  return `rgba(${r},${g},${b},${a})`;
}
function mix(c1, c2, t) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  return '#' + [0, 1, 2].map((i) => Math.round(lerp(a[i], b[i], t)).toString(16).padStart(2, '0')).join('');
}
const lighten = (c, amt) => {
  const [r, g, b] = hexToRgb(c);
  return '#' + [r, g, b].map((v) => clamp(Math.round(v + (255 - v) * amt / 100), 0, 255).toString(16).padStart(2, '0')).join('');
};
const darken = (c, amt) => {
  const [r, g, b] = hexToRgb(c);
  return '#' + [r, g, b].map((v) => clamp(Math.round(v * (1 - amt / 100)), 0, 255).toString(16).padStart(2, '0')).join('');
};

/* 自定义缓动（JS 侧） */
const E = {
  outExpo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  outQuint: (k) => 1 - Math.pow(1 - k, 5),
  inOutSine: (k) => -(Math.cos(Math.PI * k) - 1) / 2,
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
  settle: (k) => { const s = 1.2; const r = k / 1; return (Math.pow(2, -10 * k) * Math.sin((k - s / 4) * (2 * Math.PI) / s) + 1); },
};

/* ── 形状生成（单位坐标 [-1,1]）────────────── */
function fit(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const sc = 1.9 / Math.max(maxX - minX, maxY - minY);
  return pts.map(([x, y]) => [(x - cx) * sc, (y - cy) * sc]);
}

function makeShape(kind, seed) {
  const rnd = mulberry32(seed);
  if (kind === 'mountain') {
    const pts = [];
    const peakX = (rnd() - 0.5) * 0.3;
    const n = 26;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = -1 + 2 * t;
      let y;
      if (t < 0.42) y = 0.52 - (0.42 - t) * 2.3 + 0.06 * Math.sin(t * 18) * (rnd() * 0.5 + 0.5);
      else if (t < 0.5) y = -0.32 + (t - 0.42) / 0.08 * (peakX * 0.2) + 0.05 * Math.sin(t * 30);
      else if (t < 0.58) y = -0.32 + (0.58 - t) / 0.08 * (peakX * 0.2) + 0.05 * Math.sin(t * 30);
      else y = 0.52 - (t - 0.58) * 2.3 + 0.06 * Math.sin(t * 18) * (rnd() * 0.5 + 0.5);
      pts.push([x, y]);
    }
    return fit(pts);
  }
  if (kind === 'leaf') {
    const n = 18;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const lobes = 2.5; // 5 尖
      const r = 0.5 + 0.44 * Math.pow(Math.abs(Math.cos(a * lobes)), 0.85) + 0.05 * (rnd() - 0.5);
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return fit(pts);
  }
  if (kind === 'sun') {
    const n = 16;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 0.82 + 0.06 * Math.sin(a * 3 + rnd() * 6) + 0.04 * (rnd() - 0.5);
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return fit(pts);
  }
  // blob（添加纸片的随机形状）
  const n = 16;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.72 + 0.26 * Math.sin(a * 3 + rnd() * 6) + 0.1 * (rnd() - 0.5);
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return fit(pts);
}

/* 闭合 Catmull-Rom 平滑 */
function smoothClosed(pts, samplesPerSeg = 8) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let t = 0; t < samplesPerSeg; t++) {
      const s = t / samplesPerSeg, s2 = s * s, s3 = s2 * s;
      const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * s + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * s2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * s3);
      const y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * s + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * s2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * s3);
      out.push([x, y]);
    }
  }
  return out;
}

function tracePath(ctx, pts) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function boundsOf(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return [minX, minY, maxX - minX, maxY - minY];
}

function pointInPoly(pts, px, py) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function softCircle(ctx, x, y, r, col, a) {
  if (a <= 0.003 || r <= 0.3) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgbCss(col, a));
  g.addColorStop(1, rgbCss(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/* ── 纸片绘制：核心水彩晕染算法 ───────────── */
const SHAPE_SCALE = 0.66; // 形状只占画布中央，四周留晕染渗出的余白
function toPx(pts, w, h) {
  const pad = (1 - SHAPE_SCALE) / 2;
  return pts.map(([u, v]) => [((u + 1) / 2) * SHAPE_SCALE * w + pad * w, ((v + 1) / 2) * SHAPE_SCALE * h + pad * h]);
}

function paintPiece(p, opts = {}) {
  const canvas = p.el.querySelector('.pc');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = p.w, h = p.h;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const color = opts.color || p.color;
  const wet = opts.wet !== undefined ? opts.wet : p.wet;
  const bloom = clamp(opts.bloom !== undefined ? opts.bloom : p.bloom, 0, 1.3);
  const alpha = clamp(opts.opacity !== undefined ? opts.opacity : p.opacity, 0.2, 1);
  const rnd = mulberry32((p.seed || 7) + (opts.drip ? 1 : 0) + Math.floor((opts.frame || 0) * 7));

  const shape = p.shape || (p.shape = makeShape(p.kind, p.seed));
  const pts = toPx(shape, w, h);
  const smooth = smoothClosed(pts, 10);
  const M = smooth.length;
  const [cx, cy] = [w / 2, h / 2];

  const spread = (10 + 58 * bloom) * (wet ? 1 : 0.1);

  /* 1. 纸面底色：先铺一层水，颜色往里渗 */
  ctx.beginPath();
  tracePath(ctx, pts);
  ctx.fillStyle = rgbCss(color, alpha * 0.94);
  ctx.fill();

  /* 2. 内部湿度的明暗起伏（水多的地方淡，水少的地方浓） */
  const washes = 3;
  for (let k = 0; k < washes; k++) {
    const wobble = shape.map(([u, v]) => {
      const jx = (rnd() - 0.5) * 0.16, jy = (rnd() - 0.5) * 0.16;
      return [u + jx, v + jy];
    });
    ctx.beginPath();
    tracePath(ctx, smoothClosed(toPx(wobble, w, h), 8));
    ctx.fillStyle = rgbCss(k % 2 ? lighten(color, 22) : darken(color, 16), alpha * (0.1 + rnd() * 0.08));
    ctx.fill();
  }

  /* 3. 纸纹颗粒：短小的纤维噪点 */
  const bnd = boundsOf(pts);
  let grain = 0;
  let tries = 0;
  while (grain < 240 && tries < 900) {
    tries++;
    const gx = bnd[0] + rnd() * bnd[2];
    const gy = bnd[1] + rnd() * bnd[3];
    if (!pointInPoly(pts, gx, gy)) continue;
    grain++;
    const gr = 0.5 + rnd() * 1.8;
    ctx.fillStyle = rgbCss(rnd() < 0.5 ? lighten(color, 30) : darken(color, 22), 0.015 + rnd() * 0.05);
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.fill();
  }

  /* 4. 边缘多点扩散（湿边）—— 墨往纸里渗的关键 */
  const N = Math.floor(M / 5);
  for (let i = 0; i < N; i++) {
    const idx = Math.floor(rnd() * M);
    const [px, py] = smooth[idx];
    const prev = smooth[(idx - 1 + M) % M], next = smooth[(idx + 1) % M];
    let nx = -(next[1] - prev[1]), ny = next[0] - prev[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    if ((px + nx - cx) * nx + (py + ny - cy) * ny < 0) { nx = -nx; ny = -ny; }
    const off = (0.2 + rnd() * 1.25) * spread;
    const bx = px + nx * off;
    const by = py + ny * off;
    const br = 1.5 + rnd() * (5 + spread * 0.55);
    const ba = (0.03 + rnd() * 0.10) * (wet ? 1 : 0.28) * alpha;
    softCircle(ctx, bx, by, br, color, ba);
  }

  /* 5. 色边 —— 水彩特有的浓色积线（浅色靠它勾勒出轮廓） */
  const edgeDark = darken(color, 30);
  const W2 = wet ? 1 : 0.45;
  const edgeN = Math.floor(N * 1.4);
  for (let i = 0; i < edgeN; i++) {
    const idx = Math.floor(rnd() * M);
    const [px, py] = smooth[idx];
    const prev = smooth[(idx - 1 + M) % M], next = smooth[(idx + 1) % M];
    let nx = -(next[1] - prev[1]), ny = next[0] - prev[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    if ((px + nx - cx) * nx + (py + ny - cy) * ny < 0) { nx = -nx; ny = -ny; }
    const ix = px - nx * (1.5 + rnd() * 5);
    const iy = py - ny * (1.5 + rnd() * 5);
    const ir = 1 + rnd() * 3;
    const ia = (0.09 + rnd() * 0.2) * W2 * alpha;
    softCircle(ctx, ix, iy, ir, edgeDark, ia);
  }

  /* 6. 干边时收一笔 —— 给硬边一点纸毛 */
  if (!wet) {
    for (let i = 0; i < N; i++) {
      const idx = Math.floor(rnd() * M);
      const [px, py] = smooth[idx];
      const prev = smooth[(idx - 1 + M) % M], next = smooth[(idx + 1) % M];
      let nx = -(next[1] - prev[1]), ny = next[0] - prev[0];
      const len = Math.hypot(nx, ny) || 1;
      nx /= len; ny /= len;
      if ((px + nx - cx) * nx + (py + ny - cy) * ny < 0) { nx = -nx; ny = -ny; }
      const ax = px + nx * (rnd() * 4);
      const ay = py + ny * (rnd() * 4);
      ctx.fillStyle = rgbCss(color, (0.02 + rnd() * 0.04) * alpha);
      ctx.beginPath();
      ctx.arc(ax, ay, 0.5 + rnd() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* 7. 滴入动画（换色时像重新滴了一滴颜料） */
  if (opts.drip !== undefined && opts.drip < 1) drawDrip(ctx, w, h, color, opts.drip, rnd, alpha);

  /* 8. 叠一层：第二遍色，随机位置更浓 */
  if (p.layered || opts.layered) {
    const ly = shape.map(([u, v]) => [u + (rnd() - 0.5) * 0.22, v + (rnd() - 0.5) * 0.22]);
    ctx.beginPath();
    tracePath(ctx, smoothClosed(toPx(ly, w, h), 8));
    ctx.fillStyle = rgbCss(color, alpha * 0.22);
    ctx.fill();
  }
}

function drawDrip(ctx, w, h, color, k, rnd, alpha) {
  const pad = (1 - SHAPE_SCALE) / 2;
  const sx = w * 0.5, sy = h * (pad - 0.03);
  const ex = w * 0.5 + w * 0.06 * Math.sin(k * Math.PI * 2), ey = h * 0.5;
  const x = lerp(sx, ex, E.outCubic(k));
  const y = lerp(sy, ey, E.outCubic(k));
  const r = Math.max(2, w * 0.045 * (1 - k * 0.4));

  // 拖尾
  ctx.strokeStyle = rgbCss(color, 0.22 * (1 - k) * alpha);
  ctx.lineWidth = r * 0.7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y - r * 4);
  ctx.lineTo(x + (rnd() - 0.5) * 3, y);
  ctx.stroke();

  // 滴头
  softCircle(ctx, x, y, r * 1.7, color, 0.5 * (1 - k * 0.25) * alpha);
  softCircle(ctx, x, y, r * 0.8, lighten(color, 26), 0.4 * alpha);

  // 落点溅起的小水珠
  if (k > 0.35 && k < 0.9) {
    const sp = 4;
    for (let i = 0; i < sp; i++) {
      const a = rnd() * Math.PI * 2;
      const d = r * (0.6 + rnd() * 2.4) * Math.sin(k * Math.PI);
      softCircle(ctx, x + Math.cos(a) * d, y + Math.abs(Math.sin(a)) * d * 0.6, 0.8 + rnd() * 1.6, color, 0.22 * alpha * Math.sin(k * Math.PI));
    }
  }

  // 落点涟漪
  const ring = k * w * 0.28;
  ctx.strokeStyle = rgbCss(color, 0.14 * (1 - k) * alpha);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, ring, 0, Math.PI * 2);
  ctx.stroke();
}

/* ── 背景：湿润水彩纸 ─────────────────────── */
function paintBackground() {
  const cv = $('#bgCanvas');
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth || 1, H = cv.clientHeight || 1;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  const rnd = mulberry32(99);

  /* 纸纤维噪点 */
  for (let i = 0; i < 1100; i++) {
    ctx.fillStyle = `rgba(44,42,38,${0.008 + rnd() * 0.02})`;
    ctx.fillRect(rnd() * W, rnd() * H, 0.6 + rnd() * 1.4, 0.4 + rnd() * 1);
  }

  /* 淡色水渍（背景是湿纸的证明） */
  for (let i = 0; i < 46; i++) {
    const bx = rnd() * W, by = rnd() * H, br = 20 + rnd() * 150;
    softCircle(ctx, bx, by, br, WASHES[i % WASHES.length], 0.012 + rnd() * 0.032);
  }
  /* 角落更浓一点，像纸边缘吸收了水分 */
  for (let i = 0; i < 18; i++) {
    const corner = [[0, 0], [W, 0], [0, H], [W, H]][i % 4];
    const bx = corner[0] + (rnd() - 0.5) * W * 0.32;
    const by = corner[1] + (rnd() - 0.5) * H * 0.32;
    softCircle(ctx, bx, by, 60 + rnd() * 130, WASHES[i % WASHES.length], 0.018 + rnd() * 0.03);
  }
  /* 两道长长的水痕，像纸没干时拖过 */
  for (let i = 0; i < 3; i++) {
    const y0 = rnd() * H;
    const x0 = rnd() * W;
    const len = 90 + rnd() * 220;
    for (let s = 0; s < 8; s++) {
      const sx = x0 + Math.cos(0.4) * len * (s / 8) + (rnd() - 0.5) * 18;
      const sy = y0 + Math.sin(0.15) * len * (s / 8) + (rnd() - 0.5) * 10;
      softCircle(ctx, sx, sy, 6 + rnd() * 14, WASHES[i % WASHES.length], 0.02 + rnd() * 0.03);
    }
  }

  /* 角落水印：墨与水彩 · 05 */
  ctx.font = `26px "Liu Jian Mao Cao", "Kaiti SC", cursive`;
  ctx.fillStyle = 'rgba(59,91,146,0.12)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('墨与水彩 · 05', 26, H - 24);

  drawSketch(ctx, W, H);
}

/* 底图：淡淡的速写轮廓（描摹的痕迹） */
function drawSketch(ctx, W, H) {
  const rnd = mulberry32(7);
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(59,91,146,0.10)`;
  ctx.lineWidth = 1.6;
  /* 远山两道轮廓 */
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    const baseY = H * (0.62 + pass * 0.13);
    let x = W * 0.06;
    ctx.moveTo(x, baseY + Math.sin(x * 0.01) * 6);
    while (x < W * 0.94) {
      x += 26 + rnd() * 30;
      const y = baseY - (28 + rnd() * 46) * (0.6 + 0.4 * Math.sin(x * 0.01 + pass * 2));
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  /* 太阳圆环 */
  const sunX = W * 0.76, sunY = H * 0.26, sunR = H * 0.09;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR * 1.5, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(59,91,146,0.05)`;
  ctx.stroke();
  /* 地平线 */
  ctx.beginPath();
  ctx.moveTo(W * 0.05, H * 0.66);
  ctx.lineTo(W * 0.95, H * 0.66);
  ctx.strokeStyle = `rgba(44,42,38,0.07)`;
  ctx.stroke();
}

/* ── 布局：把纸片摆进画布 ─────────────────── */
function layoutPieces() {
  const layer = $('#piecesLayer');
  const art = $('#artboard');
  const rect = art.getBoundingClientRect();
  const W = rect.width, H = rect.height;
  const base = Math.min(W, H);

  for (const p of state.pieces) {
    const w = (p.s * base) / SHAPE_SCALE;
    const h = w * 0.92;
    p.w = w; p.h = h;
    p.xPx = p.x * W;
    p.yPx = p.y * H;
    const el = p.el;
    if (!el) continue;
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.style.left = (p.xPx - w / 2) + 'px';
    el.style.top = (p.yPx - h / 2) + 'px';
    el.style.transform = `rotate(${p.rot}deg)`;
    el.style.color = p.color;
  }
  // 标记底图层（非纸片）不进入布局
}

/* ── 渲染 ─────────────────────────────────── */
function applySelectedClass() {
  for (const p of state.pieces) {
    if (!p.el) continue;
    p.el.classList.toggle('is-selected', p.id === state.selectedId);
  }
}

function renderAll() {
  layoutPieces();
  applySelectedClass();
  for (const p of state.pieces) paintPiece(p);
  renderLayers();
  updateSelectedUI();
  renderTextureActive();
}

function createPieceEl(p) {
  const layer = $('#piecesLayer');
  const el = document.createElement('div');
  el.className = 'piece';
  el.dataset.id = p.id;
  el.style.color = p.color;
  el.innerHTML = `<canvas class="pc"></canvas>
    <svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" /></svg>`;
  p.el = el;
  layer.appendChild(el);
  el.addEventListener('pointerdown', (e) => {
    if (state.tool === 'dropper') { sampleFrom(e, p); return; }
    selectPiece(p.id);
    e.stopPropagation();
  });
  return el;
}

function rebuildPieces() {
  const layer = $('#piecesLayer');
  layer.innerHTML = '';
  for (const p of state.pieces) createPieceEl(p);
}

/* ── 选中态 ───────────────────────────────── */
function selectPiece(id, silent = false) {
  state.selectedId = id;
  applySelectedClass();
  updateSelectedUI();
  renderLayers();
  if (!silent && state.pieces.find((p) => p.id === id)) {
    toast(`选了「${state.pieces.find((p) => p.id === id).name}」`);
  }
}

function updateSelectedUI() {
  const p = state.pieces.find((x) => x.id === state.selectedId);
  if (!p) return;
  $('#propOpacity').value = Math.round(p.opacity * 100);
  $('#propOpacityVal').textContent = Math.round(p.opacity * 100) + '%';
  $('#propBloom').value = Math.round(p.bloom * 100);
  $('#propBloomVal').textContent = Math.round(p.bloom * 100) + '%';
  $$('.seg-btn').forEach((b) => {
    const on = String(b.dataset.wet) === (p.wet ? '1' : '0');
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  $('#propNote').textContent = p.wet ? '湿边 · 墨还在往纸里渗' : '干边 · 水收住，边定格了';
}

/* ── 图层面板 ─────────────────────────────── */
function renderLayers() {
  const list = $('#layerList');
  list.innerHTML = '';
  const frag = document.createDocumentFragment();

  const baseLi = document.createElement('li');
  baseLi.className = 'layer-item is-base';
  baseLi.innerHTML = `
    <span class="layer-swatch" style="background:${state.base.color}"></span>
    <span class="layer-info"><span class="layer-name">${state.base.name}</span><span class="layer-kind">照片底图 · 已锁定</span></span>
    <span class="layer-base-tag">底图</span>`;
  frag.appendChild(baseLi);

  // 纸片按图层从底到顶排列（数组倒序）
  const ordered = [...state.pieces].slice().reverse();
  for (const p of ordered) {
    const li = document.createElement('li');
    li.className = 'layer-item' + (p.id === state.selectedId ? ' is-selected' : '');
    li.dataset.id = p.id;
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');
    li.setAttribute('aria-label', `选择${p.name}`);
    li.innerHTML = `
      <span class="layer-swatch" style="background:${p.color}"></span>
      <span class="layer-info"><span class="layer-name">${p.name}</span><span class="layer-kind">${p.wet ? '湿边' : '干边'} · ${Math.round(p.bloom * 100)}% 晕染</span></span>`;
    li.addEventListener('click', () => selectPiece(p.id));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPiece(p.id); } });
    frag.appendChild(li);
  }
  list.appendChild(frag);
}

/* ── 色板 ─────────────────────────────────── */
function renderSwatches(container) {
  container.innerHTML = '';
  for (const sw of PALETTE) {
    const btn = document.createElement('button');
    btn.className = 'swatch' + (sw.hex === state.activeColor ? ' is-active' : '');
    btn.dataset.hex = sw.hex;
    btn.setAttribute('aria-label', `色：${sw.name} ${sw.hex}`);
    btn.setAttribute('aria-pressed', String(sw.hex === state.activeColor));
    btn.innerHTML = `<span class="swatch-chip" style="background:${sw.hex}"></span><span class="swatch-label">${sw.name}</span>`;
    btn.addEventListener('click', () => applySwatch(sw));
    container.appendChild(btn);
  }
}

function applySwatch(sw) {
  state.activeColor = sw.hex;
  const p = state.pieces.find((x) => x.id === state.selectedId);
  if (p && p.color !== sw.hex) {
    snapshotHistory();
    const oldColor = p.color;
    p.color = sw.hex;
    p.el.style.color = sw.hex;
    animateDrip(p, oldColor, sw.hex);
  }
  // 色板「滴入」动画
  $$('.swatch').forEach((b) => b.classList.remove('is-dripping'));
  $$('.swatch').forEach((b) => {
    if (b.dataset.hex === sw.hex) { b.classList.add('is-dripping'); b.classList.add('is-active'); b.setAttribute('aria-pressed', 'true'); }
    else { b.classList.remove('is-active'); b.setAttribute('aria-pressed', 'false'); }
  });
  updateSwatchRead();
  renderTextureThumbs();
  if (!p || p.color === sw.hex) toast(`取色 · ${sw.name}`);
}

function updateSwatchRead() {
  const sw = PALETTE.find((x) => x.hex === state.activeColor);
  $('#readSwatch').style.background = state.activeColor;
  $('#readName').textContent = sw ? sw.name : '—';
  $('#readHex').textContent = state.activeColor.toUpperCase();
}

/* ── 滴入动画：换色 = 重新滴一滴颜料 ──────── */
function animateDrip(p, fromColor, toColor) {
  const t0 = performance.now();
  const dur = REDUCED_MOTION ? 1 : 1050;
  function frame(t) {
    const k = clamp((t - t0) / dur, 0, 1);
    const e = E.outQuint(k);
    paintPiece(p, {
      color: mix(fromColor, toColor, e),
      drip: k,
      frame: t / 16,
    });
    if (k < 1 && !REDUCED_MOTION) requestAnimationFrame(frame);
    else paintPiece(p, { color: toColor });
  }
  requestAnimationFrame(frame);
  // 纸片本身微微回弹
  if (!REDUCED_MOTION) {
    p.el.style.transition = 'transform 0.55s var(--ease-settle)';
    p.el.style.transform = `rotate(${p.rot}deg) scale(1.05)`;
    setTimeout(() => { p.el.style.transform = `rotate(${p.rot}deg)`; }, 180);
    setTimeout(() => { p.el.style.transition = ''; }, 800);
  }
}

/* ── 纹理 ─────────────────────────────────── */
function paintTextureThumb(canvas, tex) {
  const dpr = window.devicePixelRatio || 1;
  const w = 46, h = 34;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const rnd = mulberry32(tex.name.charCodeAt(0) * 7 + 3);
  const color = state.activeColor;
  // 一个居中的小水彩斑
  const pts = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.5 + (tex.wet ? 0.22 * Math.sin(a * 3 + rnd() * 5) : 0.05 * (rnd() - 0.5));
    pts.push([w / 2 + Math.cos(a) * r * 16, h / 2 + Math.sin(a) * r * 12]);
  }
  const smooth = smoothClosed(pts, 8);
  ctx.beginPath();
  tracePath(ctx, smooth);
  ctx.fillStyle = rgbCss(color, 0.85);
  ctx.fill();
  const M = smooth.length;
  for (let i = 0; i < 26; i++) {
    const idx = Math.floor(rnd() * M);
    const [px, py] = smooth[idx];
    const prev = smooth[(idx - 1 + M) % M], next = smooth[(idx + 1) % M];
    let nx = -(next[1] - prev[1]), ny = next[0] - prev[0];
    const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    const off = rnd() * (tex.wet ? 14 : 2);
    softCircle(ctx, px + nx * off, py + ny * off, 2 + rnd() * 5, color, 0.06 + rnd() * 0.08);
  }
  // 色边
  const dark = darken(color, 22);
  for (let i = 0; i < 20; i++) {
    const idx = Math.floor(rnd() * M);
    const [px, py] = smooth[idx];
    const prev = smooth[(idx - 1 + M) % M], next = smooth[(idx + 1) % M];
    let nx = -(next[1] - prev[1]), ny = next[0] - prev[0];
    const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    softCircle(ctx, px - nx * 2, py - ny * 2, 0.8 + rnd() * 2, dark, 0.06 + rnd() * 0.1);
  }
  if (tex.layered) {
    ctx.beginPath();
    tracePath(ctx, smoothClosed(pts.map(([x, y]) => [x + 3, y + 2]), 8));
    ctx.fillStyle = rgbCss(color, 0.25);
    ctx.fill();
  }
}

function renderTextures() {
  const list = $('#textureList');
  list.innerHTML = '';
  for (const tex of TEXTURES) {
    const btn = document.createElement('button');
    btn.className = 'texture-tile';
    btn.dataset.name = tex.name;
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', 'false');
    btn.innerHTML = `<canvas></canvas>
      <span class="texture-info"><span class="texture-name">${tex.name}</span><span class="texture-desc">${tex.desc}</span></span>`;
    const cv = btn.querySelector('canvas');
    paintTextureThumb(cv, tex);
    btn.addEventListener('click', () => applyTexture(tex));
    list.appendChild(btn);
  }
}

function renderTextureThumbs() {
  $$('.texture-tile').forEach((t) => {
    const tex = TEXTURES.find((x) => x.name === t.dataset.name);
    if (tex) paintTextureThumb(t.querySelector('canvas'), tex);
  });
}

function applyTexture(tex) {
  const p = state.pieces.find((x) => x.id === state.selectedId);
  if (!p) return;
  snapshotHistory();
  p.bloom = tex.spread;
  p.wet = tex.wet;
  p.layered = !!tex.layered;
  paintPiece(p, { color: p.color });
  updateSelectedUI();
  renderTextureActive();
  renderLayers();
  toast(`纹理 · ${tex.name}`);
}

function renderTextureActive() {
  const p = state.pieces.find((x) => x.id === state.selectedId);
  if (!p) return;
  $$('.texture-tile').forEach((t) => {
    const match = TEXTURES.find((x) => x.name === t.dataset.name);
    const active = match && Math.abs(match.spread - p.bloom) < 0.02 && match.wet === p.wet && !!match.layered === !!p.layered;
    t.classList.toggle('is-active', !!active);
    t.setAttribute('aria-selected', String(!!active));
  });
}

/* ── 取色（滴管）──────────────────────────── */
function setDropper(on) {
  state.tool = on ? 'dropper' : 'select';
  $('#artboard').classList.toggle('is-dropper', on);
  $('#btnDropper').setAttribute('aria-pressed', String(on));
  $$('.tool').forEach((t) => {
    t.setAttribute('aria-pressed', String(t.dataset.tool === state.tool));
    if (t.dataset.tool === 'select' && !on) t.setAttribute('aria-pressed', 'true');
  });
}

function sampleFrom(e, piece) {
  const color = piece ? piece.color : PAPER;
  state.activeColor = color;
  // 取样涟漪
  const art = $('#artboard');
  const rect = art.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  showSampleRing(x, y, color);
  // 同步色板 UI
  $$('.swatch').forEach((b) => {
    b.classList.remove('is-active');
    b.setAttribute('aria-pressed', 'false');
  });
  const matched = PALETTE.find((s) => s.hex.toLowerCase() === color.toLowerCase());
  const chip = $$('.swatch').find((b) => b.dataset.hex === color);
  if (chip) { chip.classList.add('is-active'); chip.setAttribute('aria-pressed', 'true'); }
  updateSwatchRead();
  renderTextureThumbs();
  toast(matched ? `取色 · ${matched.name}` : `取色 · ${color.toUpperCase()}`);
  // 片刻后退出滴管
  if (!REDUCED_MOTION) setTimeout(() => setDropper(false), 900);
  else setDropper(false);
}

function showSampleRing(x, y, color) {
  const ring = document.createElement('div');
  ring.className = 'sample-ring';
  ring.style.cssText = `left:${x}px;top:${y}px;background:${color}`;
  $('#artboard').appendChild(ring);
  setTimeout(() => ring.remove(), REDUCED_MOTION ? 60 : 900);
}

/* ── 添加纸片 ─────────────────────────────── */
function addPiece() {
  const n = state.pieces.length;
  const kind = ['blob', 'blob', 'sun'][n % 3];
  const p = {
    id: 'p-' + Date.now().toString(36),
    kind,
    name: '纸片·新叶',
    color: state.activeColor,
    x: 0.42 + Math.random() * 0.36,
    y: 0.3 + Math.random() * 0.4,
    s: 0.2 + Math.random() * 0.16,
    rot: (Math.random() - 0.5) * 40,
    seed: Math.floor(Math.random() * 999),
    bloom: 0.62,
    opacity: 0.9,
    wet: true,
  };
  state.pieces.push(p);
  createPieceEl(p);
  snapshotHistory();
  selectPiece(p.id);
  paintPiece(p, { drip: 0 });
  animateDrip(p, '#F8F5EC', p.color);
  toast(`叠了一层「${p.name}」`);
}

/* ── 撤销 / 重做 ──────────────────────────── */
function snapshotHistory() {
  history.undo.push(JSON.stringify(state.pieces.map((p) => ({ ...p, el: undefined, shape: undefined }))));
  if (history.undo.length > 24) history.undo.shift();
  history.redo = [];
}
function undo() {
  const snap = history.undo.pop();
  if (!snap) { toast('没有可撤销的了'); return; }
  history.redo.push(JSON.stringify(state.pieces.map((p) => ({ ...p, el: undefined, shape: undefined }))));
  const saved = JSON.parse(snap);
  // 重建 pieces：以 saved 为准
  state.pieces = saved.map((s) => {
    const old = state.pieces.find((p) => p.id === s.id);
    return { ...old, ...s };
  });
  state.selectedId = state.pieces[0] ? state.pieces[0].id : null;
  rebuildPieces();
  renderAll();
  toast('撤销 · 水迹退回一格');
}
function redo() {
  const snap = history.redo.pop();
  if (!snap) { toast('没有可重做的了'); return; }
  history.undo.push(JSON.stringify(state.pieces.map((p) => ({ ...p, el: undefined, shape: undefined }))));
  const saved = JSON.parse(snap);
  state.pieces = saved.map((s) => {
    const old = state.pieces.find((p) => p.id === s.id);
    return { ...old, ...s };
  });
  state.selectedId = state.pieces[0] ? state.pieces[0].id : null;
  rebuildPieces();
  renderAll();
  toast('重做 · 颜色又渗回来了');
}

/* ── 缩放 ─────────────────────────────────── */
function setZoom(delta) {
  state.zoom = clamp(state.zoom + delta, 50, 200);
  $('#zoomRead').textContent = state.zoom + '%';
  const layer = $('#piecesLayer');
  layer.style.transform = `scale(${state.zoom / 100})`;
  layer.style.transformOrigin = 'center center';
}

/* ── Toast ────────────────────────────────── */
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-show'), 1600);
}

/* ── 事件绑定 ─────────────────────────────── */
function bindEvents() {
  /* 工具 */
  $$('.tool').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      state.tool = tool;
      $$('.tool').forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.tool === tool)));
      $('#artboard').classList.toggle('is-dropper', tool === 'dropper');
      $('#btnDropper').setAttribute('aria-pressed', String(tool === 'dropper'));
      if (tool === 'dropper') toast('滴管在手 · 点纸片取色');
      if (tool === 'piece') toast('纸片工具 · 点画布叠一张新纸');
      if (tool === 'trace') toast('描摹 · 沿底图勾轮廓');
      if (tool === 'eraser') toast('橡皮 · 擦掉多余的色');
      if (tool === 'hand') toast('抓手 · 拖动整张湿纸');
      if (tool === 'select') toast('选择 · 点纸片或图层来选中');
    });
  });

  /* 滴管（右栏 + 工具） */
  $('#btnDropper').addEventListener('click', () => setDropper(state.tool !== 'dropper'));

  /* 画布：滴管取样 / 空白处选择 */
  const art = $('#artboard');
  art.addEventListener('pointerdown', (e) => {
    if (state.tool === 'dropper') {
      // 判断是否点在纸片上
      const rect = art.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      let hit = null;
      for (let i = state.pieces.length - 1; i >= 0; i--) {
        const p = state.pieces[i];
        const px = p.xPx - p.w / 2, py = p.yPx - p.h / 2;
        if (x >= px && x <= px + p.w && y >= py && y <= py + p.h) { hit = p; break; }
      }
      sampleFrom(e, hit);
    } else if (e.target === art || e.target.id === 'bgCanvas') {
      // 点空白：取消选中（保留提示）
      toast('留白 · 空着也很好');
    }
  });

  /* 双击画布：滴入一滴新色斑（彩蛋） */
  art.addEventListener('dblclick', (e) => {
    if (state.tool === 'dropper') return;
    if (e.target === art || e.target.id === 'bgCanvas' || e.target.classList.contains('piece')) {
      addPiece();
    }
  });

  /* 取色坐标 */
  art.addEventListener('pointermove', (e) => {
    const rect = art.getBoundingClientRect();
    $('#statusCoord').textContent = `x ${Math.round(e.clientX - rect.left)} · y ${Math.round(e.clientY - rect.top)}`;
  });

  /* 撤销 / 重做 / 缩放 / 导出 */
  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);
  $('#btnZoomIn').addEventListener('click', () => setZoom(10));
  $('#btnZoomOut').addEventListener('click', () => setZoom(-10));
  $('#btnExport').addEventListener('click', () => {
    const btn = $('#btnExport');
    btn.classList.add('is-exporting');
    toast('水迹已干 · 已导出 PNG');
    setTimeout(() => btn.classList.remove('is-exporting'), 800);
  });

  /* 添加纸片 */
  $('#btnAddPiece').addEventListener('click', addPiece);

  /* 属性 */
  $('#propOpacity').addEventListener('input', (e) => {
    const p = state.pieces.find((x) => x.id === state.selectedId);
    if (!p) return;
    p.opacity = Number(e.target.value) / 100;
    $('#propOpacityVal').textContent = e.target.value + '%';
    paintPiece(p, { color: p.color });
  });
  $('#propBloom').addEventListener('input', (e) => {
    const p = state.pieces.find((x) => x.id === state.selectedId);
    if (!p) return;
    p.bloom = Number(e.target.value) / 100;
    $('#propBloomVal').textContent = e.target.value + '%';
    paintPiece(p, { color: p.color });
    renderTextureActive();
  });
  $$('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = state.pieces.find((x) => x.id === state.selectedId);
      if (!p) return;
      p.wet = btn.dataset.wet === '1';
      updateSelectedUI();
      paintPiece(p, { color: p.color });
      renderTextureActive();
      renderLayers();
      toast(p.wet ? '湿边 · 墨开始往纸里渗' : '干边 · 水收住，边定格了');
    });
  });

  /* 键盘快捷键 */
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'y') { e.preventDefault(); redo(); }
    if (e.key === 'i') { e.preventDefault(); setDropper(state.tool !== 'dropper'); }
  });
}

/* ── 初始化 ───────────────────────────────── */
function init() {
  rebuildPieces();
  renderSwatches($('#swatchList'));
  renderSwatches($('#mobileSwatches'));
  renderTextures();
  bindEvents();
  paintBackground();
  renderAll();
  applySelectedClass();
  updateSwatchRead();
  setZoom(0);

  /* 预热书法字体，避免首屏标题用兜底字体 */
  if (document.fonts && document.fonts.load) {
    try {
      document.fonts.load('26px "Liu Jian Mao Cao"');
      document.fonts.load('16px "Ma Shan Zheng"');
      document.fonts.load('17px "Caveat"');
      document.fonts.load('13px "Nunito"');
    } catch (e) { /* 忽略字体预加载失败 */ }
  }

  // 首屏落定后，给选中的枫叶来一滴初渗（慢）
  setTimeout(() => {
    const leaf = state.pieces.find((p) => p.id === 'p-leaf');
    if (leaf && !REDUCED_MOTION) {
      animateDrip(leaf, '#C0392B', '#C0392B');
    }
  }, 600);

  let rT;
  window.addEventListener('resize', () => {
    clearTimeout(rT);
    rT = setTimeout(() => {
      paintBackground();
      renderAll();
    }, 180);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
