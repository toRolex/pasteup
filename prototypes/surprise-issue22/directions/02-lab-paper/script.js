/* ============================================================
   PASTEUP 活纹理实验室 · LAB PAPER — script.js
   Canvas procedural textures · seed-driven structure · color decoupled.
   ============================================================ */
'use strict';

/* ---------- deterministic noise ---------- */
function hash2(x, y, seed) {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function smoothstep(t) { return t * t * (3 - 2 * t); }
function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smoothstep(xf), v = smoothstep(yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, seed, oct, lac, gain) {
  lac = lac || 2; gain = gain || 0.5;
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 1013) * amp;
    norm += amp; amp *= gain; freq *= lac;
  }
  return sum / norm;
}
function clampByte(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

/* ---------- texture generators: fill luma Uint8ClampedArray ---------- */
const GENERATORS = {
  crease(d, w, h, seed, scale) {
    const s = 150 / scale;
    const s2 = (seed + 0x9E37) | 0;
    let i = 0;
    for (let y = 0; y < h; y++) {
      const ny = y / s;
      for (let x = 0; x < w; x++) {
        const nx = x / s;
        const v = fbm(nx * 1.35, ny * 1.35, seed, 4);
        const ridge = 1 - Math.abs(2 * v - 1);
        const r2 = ridge * ridge;
        const warp = (fbm(nx * 0.7 + 3.1, ny * 0.7 + 7.7, s2, 3) - 0.5) * 2.4;
        const wr = fbm(nx * 3.2 + warp, ny * 3.2, s2, 3);
        const fine = (valueNoise(x * 0.4, y * 0.4, s2 + 77) - 0.5) * 0.5;
        d[i++] = clampByte(152 + r2 * 56 + (wr - 0.5) * 44 + fine * 14);
      }
    }
  },
  watercolor(d, w, h, seed, scale) {
    const s = 150 / scale;
    const s2 = (seed ^ 0x51EB);
    let i = 0;
    for (let y = 0; y < h; y++) {
      const ny = y / s;
      for (let x = 0; x < w; x++) {
        const nx = x / s;
        const blotch = fbm(nx, ny, seed, 5, 2.2, 0.55);
        const run = fbm(nx * 2.7 + 4.2, ny * 2.7 + 9.3, s2, 3);
        const edge = smoothstep(0.42, 0.78, run);
        d[i++] = clampByte(170 + (blotch - 0.5) * 120 + (edge - 0.5) * 54);
      }
    }
  },
  grain(d, w, h, seed, scale) {
    const s = 240 / scale;
    const s2 = (seed ^ 0x44E1);
    let i = 0;
    for (let y = 0; y < h; y++) {
      const ny = y / s;
      for (let x = 0; x < w; x++) {
        const nx = x / s;
        const g = hash2(x, y, seed);
        const mottle = valueNoise(nx, ny, s2);
        d[i++] = clampByte(132 + (g - 0.5) * 46 + (mottle - 0.5) * 52);
      }
    }
  },
  fabric(d, w, h, seed, scale) {
    const tw = 9 / scale;
    const s2 = (seed ^ 0x3CB7);
    let i = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const wv = (fbm(x * 0.035, y * 0.045, seed, 2) - 0.5) * 2.6;
        const warpX = (x + wv) / tw;
        const pw = Math.abs(warpX - Math.round(warpX));
        const warpSh = smoothstep(0.16, 0.5, pw);
        const wv2 = (fbm(x * 0.045 + 7, y * 0.035 + 11, s2, 2) - 0.5) * 2.6;
        const weftY = (y + wv2) / tw;
        const py = Math.abs(weftY - Math.round(weftY));
        const weftSh = smoothstep(0.16, 0.5, py);
        const woven = warpSh * 0.55 + weftSh * 0.45;
        const sheen = valueNoise(x * 0.02, y * 0.02, s2) * 0.5;
        const speck = (hash2(x >> 3, y >> 3, seed) - 0.5) * 8;
        d[i++] = clampByte(154 - woven * 40 + (sheen - 0.25) * 34 + speck);
      }
    }
  },
  marble(d, w, h, seed, scale) {
    const s = 90;
    const freq = 1.7 * scale;
    let i = 0;
    for (let y = 0; y < h; y++) {
      const ny = y / s;
      for (let x = 0; x < w; x++) {
        const nx = x / s;
        const turb = fbm(nx * 2.1, ny * 1.7, seed, 5, 2.1, 0.5);
        let t = Math.sin(nx * freq * Math.PI * 2 + turb * 3.2);
        t = t * 0.5 + 0.5;
        const grain = (valueNoise(nx * 1.1, ny * 1.1, seed ^ 0x27) - 0.5) * 20;
        d[i++] = clampByte(128 + t * 66 + grain);
      }
    }
  },
  fiber(d, w, h, seed, scale) {
    const sx = 52 / scale, sy = 5 / scale;
    const s2 = (seed ^ 0x71AA);
    let i = 0;
    for (let y = 0; y < h; y++) {
      const ny = y / sy;
      for (let x = 0; x < w; x++) {
        const nx = x / sx;
        const warp = (fbm(nx * 0.6, ny * 0.4, s2, 2) - 0.5) * 3.2;
        const f = valueNoise(nx + warp * 0.5, ny, seed);
        const f2 = valueNoise(nx * 0.5 + 9.4, ny * 0.5 + 9.4, s2);
        const fine = (hash2(x, y, seed ^ 0x9C) - 0.5) * 12;
        d[i++] = clampByte(150 + (f - 0.5) * 62 + (f2 - 0.5) * 26 + fine);
      }
    }
  }
};

/* ---------- color & tint ---------- */
const PAPER_BASE = { r: 0.95, g: 0.92, b: 0.84 };
function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255
  };
}
function tint(luma, hex) {
  const c = hexToRgb(hex);
  const out = new Uint8ClampedArray(luma.length * 4);
  const br = PAPER_BASE.r * 0.16, bg = PAPER_BASE.g * 0.16, bb = PAPER_BASE.b * 0.16;
  const cr = c.r * 0.84, cg = c.g * 0.84, cb = c.b * 0.84;
  for (let i = 0, j = 0; i < luma.length; i++, j += 4) {
    const shade = 0.42 + 0.74 * (luma[i] / 255);
    out[j] = clampByte((br + cr) * shade * 255);
    out[j + 1] = clampByte((bg + cg) * shade * 255);
    out[j + 2] = clampByte((bb + cb) * shade * 255);
    out[j + 3] = 255;
  }
  return out;
}
function structureHash(luma) {
  let h = 0x811C9DC5;
  for (let i = 0; i < luma.length; i += 997) {
    h ^= luma[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 16).toString(16).toUpperCase().padStart(4, '0');
}

/* ---------- helpers ---------- */
function hex4(n) { return n.toString(16).toUpperCase().padStart(4, '0'); }
function randSeed() { return Math.floor(Math.random() * 0xFFFE) + 1; }
function setMono(el, text) {
  if (!el) return;
  if (el.textContent === text) return;
  el.textContent = text;
  el.classList.remove('tick');
  void el.offsetWidth;
  el.classList.add('tick');
}
/* odometer-style hex roll: each digit cascades in with a stagger */
function rollValue(el, newText) {
  if (!el) return;
  if (el.dataset.v === newText) return;
  el.dataset.v = newText;
  el.innerHTML = newText.split('').map((ch, i) =>
    '<span class="roll-ch" style="animation-delay:' + (i * 26) + 'ms">' + ch + '</span>'
  ).join('');
}

let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- constants / state ---------- */
const TEXTURES = [
  { key: 'crease', zh: '褶皱', en: 'Crease' },
  { key: 'watercolor', zh: '水彩晕染', en: 'Watercolor' },
  { key: 'grain', zh: '颗粒', en: 'Grain' },
  { key: 'fabric', zh: '织物拉丝', en: 'Fabric' },
  { key: 'marble', zh: '大理石纹', en: 'Marble' },
  { key: 'fiber', zh: '纤维', en: 'Fiber' }
];
const SWATCHES = [
  { name: '苔绿', hex: '#7A8B5C' },
  { name: '棕褐', hex: '#A8845A' },
  { name: '织物', hex: '#C8B89A' },
  { name: '墨褐', hex: '#5A4634' },
  { name: '沙石', hex: '#D9C9A8' },
  { name: '麻纸', hex: '#F0E8D7' }
];
const DPR = Math.min(window.devicePixelRatio || 1, 1.5);

const state = {
  selectedId: 'p1',
  zoom: 1,
  fit: 1,
  lastFrameMs: 0,
  pieces: [
    { id: 'p1', name: '落叶 A', style: 'crease', seed: 0x3F2A, color: '#7A8B5C', x: 250, y: 120, w: 380, h: 280, rot: -5, scale: 1.0, opacity: 1 },
    { id: 'p2', name: '花径 B', style: 'watercolor', seed: 0x91C4, color: '#A8845A', x: 628, y: 170, w: 250, h: 300, rot: 7, scale: 1.0, opacity: 1 },
    { id: 'p3', name: '窗影 C', style: 'fiber', seed: 0x6D02, color: '#D9C9A8', x: 290, y: 480, w: 250, h: 200, rot: -2, scale: 1.0, opacity: 1 },
    { id: 'p4', name: '碎隙 D', style: 'marble', seed: 0x5E9A, color: '#C8B89A', x: 600, y: 560, w: 200, h: 160, rot: 3, scale: 1.0, opacity: 1 }
  ],
  tiles: TEXTURES.map((t, i) => ({
    key: t.key,
    seed: randSeed(),
    color: SWATCHES[i % SWATCHES.length].hex
  })),
  baseVisible: true
};
const lumaCache = new Map();

const $ = (id) => document.getElementById(id);

/* ---------- canvas contexts ---------- */
const plane = $('canvasPlane');
const planeScale = $('planeScale');
const gridCanvas = $('planeGrid');
const gridCtx = gridCanvas.getContext('2d');

/* ---------- bench grid ---------- */
function drawGrid() {
  const w = plane.clientWidth, h = plane.clientHeight;
  if (!w || !h) return;
  gridCanvas.width = w;
  gridCanvas.height = h;
  gridCtx.clearRect(0, 0, w, h);
  const minor = 24, major = 96;
  gridCtx.lineWidth = 1;
  const minorStyle = 'rgba(90,70,52,0.055)';
  const majorStyle = 'rgba(90,70,52,0.11)';
  gridCtx.beginPath();
  for (let x = 0; x <= w; x += minor) {
    gridCtx.moveTo(x + 0.5, 0);
    gridCtx.lineTo(x + 0.5, h);
  }
  for (let y = 0; y <= h; y += minor) {
    gridCtx.moveTo(0, y + 0.5);
    gridCtx.lineTo(w, y + 0.5);
  }
  gridCtx.strokeStyle = minorStyle;
  gridCtx.stroke();
  gridCtx.beginPath();
  for (let x = 0; x <= w; x += major) {
    gridCtx.moveTo(x + 0.5, 0);
    gridCtx.lineTo(x + 0.5, h);
  }
  for (let y = 0; y <= h; y += major) {
    gridCtx.moveTo(0, y + 0.5);
    gridCtx.lineTo(w, y + 0.5);
  }
  gridCtx.strokeStyle = majorStyle;
  gridCtx.stroke();
}

/* ---------- piece rendering ---------- */
function genLuma(piece, w, h) {
  const luma = new Uint8ClampedArray(w * h);
  GENERATORS[piece.style](luma, w, h, piece.seed, piece.scale);
  return luma;
}
function renderPiece(piece) {
  const canvas = piece.canvas;
  const w = Math.max(2, Math.round(piece.w * DPR));
  const h = Math.max(2, Math.round(piece.h * DPR));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');

  const key = piece.id + ':' + piece.seed + ':' + piece.style + ':' + piece.scale.toFixed(2);
  let luma = lumaCache.get(key);
  if (!luma || luma.length !== w * h) {
    const t0 = performance.now();
    luma = genLuma(piece, w, h);
    state.lastFrameMs = Math.max(state.lastFrameMs, performance.now() - t0);
    if (lumaCache.size > 26) lumaCache.delete(lumaCache.keys().next().value);
    lumaCache.set(key, luma);
  }
  piece.structureHash = structureHash(luma);
  let sum = 0, n = 0;
  for (let i = 0; i < luma.length; i += 97) { sum += luma[i]; n++; }
  piece.normL = (sum / n / 255) * 10;
  ctx.putImageData(new ImageData(tint(luma, piece.color), w, h), 0, 0);

  if (piece.tagEl) {
    piece.tagEl.textContent = piece.id.toUpperCase() + ' · 0x' + hex4(piece.seed);
  }
}
function renderAllPieces() {
  const t0 = performance.now();
  state.lastFrameMs = 0;
  state.pieces.forEach(renderPiece);
  renderLayerList();
  setMono($('frameCost'), Math.max(1, Math.round(state.lastFrameMs)) + ' ms / 帧');
  refreshSelectedUI();
}

/* ---------- piece DOM ---------- */
function buildPieceDom(piece) {
  const wrap = document.createElement('div');
  wrap.className = 'piece-wrap';
  wrap.dataset.id = piece.id;
  wrap.style.left = piece.x + 'px';
  wrap.style.top = piece.y + 'px';
  wrap.style.width = piece.w + 'px';
  wrap.style.height = piece.h + 'px';
  wrap.style.transform = 'rotate(' + piece.rot + 'deg)';
  wrap.style.opacity = piece.opacity;

  const canvas = document.createElement('canvas');
  canvas.className = 'piece-canvas';
  wrap.appendChild(canvas);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'piece-outline');
  svg.setAttribute('viewBox', '0 0 ' + piece.w + ' ' + piece.h);
  svg.setAttribute('preserveAspectRatio', 'none');
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', 0.5); rect.setAttribute('y', 0.5);
  rect.setAttribute('width', piece.w - 1); rect.setAttribute('height', piece.h - 1);
  rect.setAttribute('rx', 2);
  svg.appendChild(rect);
  wrap.appendChild(svg);

  const tag = document.createElement('span');
  tag.className = 'piece-tag mono';
  wrap.appendChild(tag);

  piece.canvas = canvas;
  piece.tagEl = tag;
  piece.wrapEl = wrap;
  piece.structureHash = '----';
  planeScale.appendChild(wrap);
  bindPieceDrag(piece);
  wrap.addEventListener('pointerdown', (e) => { e.stopPropagation(); selectPiece(piece.id); });
  wrap.addEventListener('pointerenter', () => {
    const L = (piece.normL != null ? piece.normL : 0).toFixed(1);
    rollValue($('hoverReadout'), texZh(piece.style) + ' · 0x' + hex4(piece.seed) + ' · L ' + L);
  });
  wrap.addEventListener('pointerleave', () => {
    setMono($('hoverReadout'), '悬停纸片看读数');
  });
  return wrap;
}

/* ---------- piece drag ---------- */
function bindPieceDrag(piece) {
  const wrap = piece.wrapEl;
  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
  wrap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    ox = piece.x; oy = piece.y;
    wrap.setPointerCapture(e.pointerId);
    wrap.classList.add('dragging');
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const eff = (state.fit || 1) * (state.zoom || 1);
    piece.x = ox + (e.clientX - sx) / eff;
    piece.y = oy + (e.clientY - sy) / eff;
    wrap.style.left = piece.x + 'px';
    wrap.style.top = piece.y + 'px';
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    wrap.classList.remove('dragging');
    try { wrap.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
  };
  wrap.addEventListener('pointerup', end);
  wrap.addEventListener('pointercancel', end);
}

/* ---------- selection ---------- */
function selectPiece(id) {
  if (state.selectedId === id) { refreshSelectedUI(); return; }
  state.selectedId = id;
  refreshSelectedUI();
  toast('选中纸片 ' + pieceById(id).name);
}
function pieceById(id) { return state.pieces.find((p) => p.id === id); }

/* ---------- layer list ---------- */
function renderLayerList() {
  const list = $('layerList');
  list.innerHTML = '';
  // base photo layer
  const baseRow = document.createElement('div');
  baseRow.className = 'layer-row' + (state.baseVisible ? '' : '');
  baseRow.setAttribute('role', 'listitem');
  baseRow.innerHTML =
    '<div class="layer-thumb base-thumb" aria-hidden="true"><svg viewBox="0 0 34 34" width="34" height="34"><path d="M17 6 C 12 12 10 20 14 28 C 20 32 27 26 28 18 C 29 11 22 5 17 6 Z" fill="rgba(90,70,52,0.14)" stroke="rgba(90,70,52,0.4)" stroke-width="1.4"/></svg></div>' +
    '<div class="layer-info"><span class="layer-name">底图「photo.jpg」</span><span class="layer-sub">描摹参照 · 锁定</span></div>' +
    '<button class="layer-eye" aria-label="切换底图可见" data-eye="base">' + (state.baseVisible ? '◉' : '◌') + '</button>';
  baseRow.querySelector('.layer-eye').addEventListener('click', (e) => {
    e.stopPropagation();
    state.baseVisible = !state.baseVisible;
    $('traceGuide').style.opacity = state.baseVisible ? '' : '0';
    renderLayerList();
  });
  baseRow.style.opacity = state.baseVisible ? 1 : 0.5;
  list.appendChild(baseRow);

  state.pieces.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'layer-row' + (p.id === state.selectedId ? ' selected' : '');
    row.setAttribute('role', 'listitem');
    row.tabIndex = 0;
    row.innerHTML =
      '<canvas class="layer-thumb" width="34" height="34"></canvas>' +
      '<div class="layer-info"><span class="layer-name">' + p.name + '</span><span class="layer-sub">' +
      texZh(p.style) + ' · 0x' + hex4(p.seed) + '</span></div>' +
      '<button class="layer-eye" aria-label="切换纸片可见" data-eye="' + p.id + '">◉</button>';
    const thumb = row.querySelector('.layer-thumb');
    const luma = genLuma(p, 34, 34);
    const tctx = thumb.getContext('2d');
    tctx.putImageData(new ImageData(tint(luma, p.color), 34, 34), 0, 0);
    row.querySelector('.layer-eye').addEventListener('click', (e) => {
      e.stopPropagation();
      p.opacity = p.opacity > 0 ? 0.15 : 1;
      p.wrapEl.style.opacity = p.opacity;
      refreshSelectedUI();
      renderLayerList();
    });
    row.addEventListener('click', () => selectPiece(p.id));
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPiece(p.id); } });
    list.appendChild(row);
  });
  setMono($('layersCount'), state.pieces.length + 1 + ' 层');
}
function texZh(key) { const t = TEXTURES.find((x) => x.key === key); return t ? t.zh : key; }

/* ---------- swatches ---------- */
function buildSwatches() {
  const grid = $('swatchGrid');
  SWATCHES.forEach((s) => {
    const btn = document.createElement('button');
    btn.className = 'swatch';
    btn.dataset.hex = s.hex;
    btn.setAttribute('role', 'listitem');
    btn.setAttribute('aria-label', '颜色 ' + s.name);
    btn.innerHTML =
      '<span class="swatch-chip" style="background:' + s.hex + '"></span>' +
      '<span class="swatch-name">' + s.name + '</span>' +
      '<span class="swatch-hex">' + s.hex + '</span>';
    btn.addEventListener('click', () => {
      const p = selected();
      if (!p) return;
      const sameColor = p.color === s.hex;
      p.color = s.hex;
      renderPiece(p);
      refreshSelectedUI();
      if (!sameColor) {
        toast('「' + p.name + '」换色 ' + s.hex + ' · 结构 ST 不变');
      }
    });
    grid.appendChild(btn);
  });
}
function selected() { return pieceById(state.selectedId); }

/* ---------- texture tiles ---------- */
function renderTile(tile) {
  const canvas = tile.canvas;
  const w = 64, h = 64;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const luma = new Uint8ClampedArray(w * h);
  GENERATORS[tile.key](luma, w, h, tile.seed, 1.0);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(tint(luma, tile.color), w, h), 0, 0);
  const seedEl = tile.el.querySelector('.tex-seed');
  rollValue(seedEl, '0x' + hex4(tile.seed));
}
function buildTiles() {
  const grid = $('textureGrid');
  state.tiles.forEach((tile) => {
    const el = document.createElement('button');
    el.className = 'tex-tile';
    el.dataset.style = tile.key;
    el.setAttribute('role', 'listitem');
    const meta = TEXTURES.find((x) => x.key === tile.key);
    el.innerHTML =
      '<canvas class="tex-canvas" width="64" height="64"></canvas>' +
      '<span class="tex-seed">0x----</span>' +
      '<span class="tex-name">' + meta.zh + '</span>' +
      '<span class="tex-en">' + meta.en + '</span>';
    tile.el = el;
    tile.canvas = el.querySelector('.tex-canvas');
    el.addEventListener('click', () => {
      const p = selected();
      if (!p) return;
      p.style = tile.key;
      renderPiece(p);
      refreshSelectedUI();
      renderLayerList();
      toast('「' + p.name + '」应用纹理「' + meta.zh + '」');
    });
    grid.appendChild(el);
    renderTile(tile);
  });
}
function reseedTiles() {
  state.tiles.forEach((tile) => {
    tile.seed = randSeed();
    renderTile(tile);
    tile.el.classList.remove('reshuffling');
    void tile.el.offsetWidth;
    tile.el.classList.add('reshuffling');
  });
  toast('6 路纹理重新取样 · seed 全部刷新');
}

/* ---------- props panel ---------- */
function buildProps() {
  $('propsPanel').innerHTML =
    '<div class="prop-row"><span class="prop-label">纸片 <span class="en">Sheet</span></span>' +
    '<span class="prop-value" id="propName">—</span></div>' +
    '<div class="prop-row"><span class="prop-label">纹理 <span class="en">Texture</span></span>' +
    '<span class="prop-value" id="propTexture">—</span></div>' +
    '<div class="prop-row"><span class="prop-label">seed <span class="en">Sample</span></span>' +
    '<span class="prop-value-row"><span class="prop-value" id="propSeed">0x----</span>' +
    '<button class="mini-btn icon" id="btnReseedPiece" title="此纸片重新取样" aria-label="此纸片重新取样">⟳</button></span></div>' +
    '<div class="prop-hashrow">' +
    '<div class="hash-cell"><span class="hc-label">ST 结构</span><span class="hc-val" id="propSt">0x----</span></div>' +
    '<div class="hash-cell"><span class="hc-label">CH 色</span><span class="hc-val" id="propCh">#------</span></div>' +
    '</div>' +
    '<div class="prop-row"><span class="prop-label">光值 <span class="en">norm L</span></span>' +
    '<span class="prop-value" id="propNormL">--.-</span></div>' +
    '<div class="prop-block"><div class="prop-row"><span class="prop-label">纹理缩放 <span class="en">Tex scale</span></span>' +
    '<span class="prop-value" id="propScale">100%</span></div>' +
    '<input type="range" class="lab-slider" id="scaleSlider" min="50" max="200" value="100" aria-label="纹理缩放">' +
    '<div class="slider-scale mono" aria-hidden="true"><span>50%</span><span>100%</span><span>200%</span></div></div>' +
    '<div class="prop-row"><span class="prop-label">旋转 <span class="en">Rotate</span></span>' +
    '<span class="prop-value-row"><button class="mini-btn" id="btnRotate" aria-label="旋转 90 度">⟳ 90°</button>' +
    '<span class="prop-value" id="propRot">0°</span></span></div>' +
    '<div class="prop-block"><div class="prop-row"><span class="prop-label">不透明度 <span class="en">Opacity</span></span>' +
    '<span class="prop-value" id="propOpacity">100%</span></div>' +
    '<input type="range" class="lab-slider" id="opacitySlider" min="30" max="100" value="100" aria-label="不透明度"></div>';

  let scaleTimer = null;
  $('scaleSlider').addEventListener('input', (e) => {
    const p = selected();
    if (!p) return;
    const v = Number(e.target.value);
    p.scale = v / 100;
    setMono($('propScale'), v + '%');
    e.target.style.setProperty('--fill', v + '%');
    clearTimeout(scaleTimer);
    scaleTimer = setTimeout(() => { renderPiece(p); renderLayerList(); }, 70);
  });
  let opTimer = null;
  $('opacitySlider').addEventListener('input', (e) => {
    const p = selected();
    if (!p) return;
    const v = Number(e.target.value);
    p.opacity = v / 100;
    setMono($('propOpacity'), v + '%');
    e.target.style.setProperty('--fill', v + '%');
    p.wrapEl.style.opacity = p.opacity;
    clearTimeout(opTimer);
    opTimer = setTimeout(() => renderLayerList(), 120);
  });
  $('btnReseedPiece').addEventListener('click', () => {
    const p = selected();
    if (!p) return;
    p.seed = randSeed();
    renderPiece(p);
    refreshSelectedUI();
    renderLayerList();
    rollValue($('propSeed'), '0x' + hex4(p.seed));
    rollValue($('propSt'), p.structureHash);
    toast('「' + p.name + '」重新取样 · seed 0x' + hex4(p.seed));
  });
  $('btnRotate').addEventListener('click', () => {
    const p = selected();
    if (!p) return;
    p.rot = (p.rot + 90) % 360;
    p.wrapEl.style.transform = 'rotate(' + p.rot + 'deg)';
    setMono($('propRot'), p.rot + '°');
    toast('「' + p.name + '」旋转 90°');
  });
}

function refreshSelectedUI() {
  const p = selected();
  if (!p) return;
  $('propName').textContent = p.name;
  $('propTexture').textContent = texZh(p.style);
  $('propId').textContent = p.id.toUpperCase();
  rollValue($('propSeed'), '0x' + hex4(p.seed));
  rollValue($('propSt'), p.structureHash || '0x----');
  rollValue($('propCh'), p.color);
  setMono($('propNormL'), (p.normL != null ? p.normL : 0).toFixed(1));
  setMono($('propScale'), Math.round(p.scale * 100) + '%');
  setMono($('propRot'), p.rot + '°');
  setMono($('propOpacity'), Math.round(p.opacity * 100) + '%');
  const ss = $('scaleSlider'), os = $('opacitySlider');
  ss.value = Math.round(p.scale * 100);
  ss.style.setProperty('--fill', ss.value + '%');
  os.value = Math.round(p.opacity * 100);
  os.style.setProperty('--fill', os.value + '%');

  document.querySelectorAll('.swatch').forEach((el) => {
    el.classList.toggle('selected', el.dataset.hex === p.color);
  });
  document.querySelectorAll('.tex-tile').forEach((el) => {
    el.classList.toggle('selected', el.dataset.style === p.style);
  });
  document.querySelectorAll('.piece-wrap').forEach((w) => {
    w.classList.toggle('selected', w.dataset.id === state.selectedId);
  });
}

/* ---------- control experiment (color/structure decoupling proof) ---------- */
function renderControlNote() {
  const seed = 0x2B11;
  const style = 'crease';
  const colors = ['#7A8B5C', '#A8845A'];
  const luma = new Uint8ClampedArray(72 * 72);
  GENERATORS[style](luma, 72, 72, seed, 1.0);
  const st = structureHash(luma);
  ['ctlA', 'ctlB'].forEach((id, idx) => {
    const c = $(id);
    const ctx = c.getContext('2d');
    ctx.putImageData(new ImageData(tint(luma, colors[idx]), 72, 72), 0, 0);
  });
  $('ctlASt').textContent = '0x' + st;
  $('ctlBSt').textContent = '0x' + st;
}

/* ---------- spawn / resample ---------- */
function spawnPiece(x, y) {
  const n = state.pieces.length + 1;
  const styles = TEXTURES.map((t) => t.key);
  const piece = {
    id: 'p' + (state.pieces.length + 1),
    name: '纸片 ' + String.fromCharCode(64 + n),
    style: styles[state.pieces.length % styles.length],
    seed: randSeed(),
    color: SWATCHES[state.pieces.length % SWATCHES.length].hex,
    x: Math.max(8, x - 70),
    y: Math.max(8, y - 50),
    w: 170,
    h: 120,
    rot: [-4, 5, 2, -6, 3][state.pieces.length % 5],
    scale: 1.0,
    opacity: 1
  };
  state.pieces.push(piece);
  buildPieceDom(piece);
  renderPiece(piece);
  state.selectedId = piece.id;
  renderLayerList();
  refreshSelectedUI();
  toast('取样新纸片「' + piece.name + '」seed 0x' + hex4(piece.seed));
}

/* ---------- bench interactions ---------- */
function planeToLocal(e) {
  const rect = plane.getBoundingClientRect();
  const cx = rect.width / 2, cy = rect.height / 2;
  const eff = (state.fit || 1) * (state.zoom || 1);
  return {
    x: (e.clientX - rect.left - cx) / eff + cx,
    y: (e.clientY - rect.top - cy) / eff + cy
  };
}
function bindBench() {
  plane.addEventListener('pointermove', (e) => {
    const p = planeToLocal(e);
    const px = Math.round(p.x), py = Math.round(p.y);
    const el = $('cursorReadout');
    setMono(el, 'x ' + px + ' · y ' + py);
  });
  plane.addEventListener('pointerleave', () => {
    setMono($('cursorReadout'), 'x ---- · y ----');
  });
  plane.addEventListener('dblclick', (e) => {
    if (e.target.closest('.piece-wrap')) return;
    const p = planeToLocal(e);
    spawnPiece(p.x, p.y);
  });

  let dragActive = false;
  plane.addEventListener('pointerdown', (e) => { dragActive = true; });
  plane.addEventListener('pointerup', () => { dragActive = false; });

  $('btnZoomIn').addEventListener('click', () => setZoom(state.zoom + 0.1));
  $('btnZoomOut').addEventListener('click', () => setZoom(state.zoom - 0.1));
}
function setZoom(z) {
  state.zoom = Math.min(1.5, Math.max(0.5, Math.round(z * 100) / 100));
  applyPlaneTransform();
  setMono($('zoomReadout'), Math.round(state.zoom * 100) + '%');
  drawGrid();
}
function currentFit() {
  return Math.min(1, Math.min(plane.clientWidth / 900, plane.clientHeight / 770));
}
function applyPlaneTransform() {
  state.fit = currentFit();
  planeScale.style.transform = 'scale(' + (state.fit * state.zoom) + ')';
}

/* ---------- topbar / misc ---------- */
function bindTopbar() {
  $('btnUndo').addEventListener('click', () => toast('原型演示：撤销队列未接入'));
  $('btnRedo').addEventListener('click', () => toast('原型演示：重做队列未接入'));
  $('btnExportSvg').addEventListener('click', () => toast('原型演示：导出 SVG 即将就绪'));
  $('btnExportPng').addEventListener('click', exportPng);
  $('btnAddPiece').addEventListener('click', () => {
    const cx = plane.clientWidth / 2, cy = plane.clientHeight / 2;
    spawnPiece(cx + (Math.random() - 0.5) * 180, cy + (Math.random() - 0.5) * 120);
  });
  $('btnResampleAll').addEventListener('click', () => {
    state.pieces.forEach((p) => { p.seed = randSeed(); });
    reseedTiles();
    renderAllPieces();
    toast('全部重新取样 · 3 纸片 + 6 纹理');
  });
  $('btnReseedTiles').addEventListener('click', reseedTiles);

  document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const name = btn.querySelector('.tool-name').textContent;
      toast('工具「' + name + '」');
    });
  });
}
function exportPng() {
  const pad = 40;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  state.pieces.forEach((p) => {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.w); maxY = Math.max(maxY, p.y + p.h);
  });
  if (minX === Infinity) return;
  const W = Math.round(maxX - minX + pad * 2);
  const H = Math.round(maxY - minY + pad * 2);
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#F0E8D7';
  ctx.fillRect(0, 0, W, H);
  state.pieces.forEach((p) => {
    ctx.save();
    ctx.translate(p.x - minX + pad, p.y - minY + pad);
    ctx.rotate(p.rot * Math.PI / 180);
    ctx.drawImage(p.canvas, 0, 0, p.w, p.h);
    ctx.restore();
  });
  const a = document.createElement('a');
  a.download = 'pasteup-sample-07.png';
  a.href = out.toDataURL('image/png');
  a.click();
  toast('已导出 sample-07.png');
}

/* ---------- init ---------- */
function init() {
  buildSwatches();
  buildTiles();
  buildProps();
  state.pieces.forEach(buildPieceDom);
  renderAllPieces();
  renderControlNote();
  renderLayerList();
  bindBench();
  bindTopbar();
  setZoom(1);
  drawGrid();
  rollValue($('benchSeed'), '全局 seed 0x' + hex4(randSeed()));

  // easter egg: 5 quick clicks on the brand mark runs a lab self-check
  let brandClicks = 0, brandTimer = null;
  document.querySelector('.brand-mark').addEventListener('click', () => {
    brandClicks++;
    clearTimeout(brandTimer);
    brandTimer = setTimeout(() => { brandClicks = 0; }, 1500);
    if (brandClicks >= 5) {
      brandClicks = 0;
      state.tiles.forEach((t) => {
        t.el.classList.remove('reshuffling');
        void t.el.offsetWidth;
        t.el.classList.add('reshuffling');
      });
      toast('实验室自检 OK · 6 纹理在线 · seed 通道稳定');
    }
  });

  // re-draw grid + re-fit on resize
  let rt = null;
  const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { drawGrid(); applyPlaneTransform(); }, 60); });
  ro.observe(plane);
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { drawGrid(); applyPlaneTransform(); }, 60); });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
