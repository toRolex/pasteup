/* 彩纸质感对比 prototype — 一次性代码，不用于生产 */

/* ---------- seeded RNG ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- colors ---------- */
const PALETTE = ['#d97a5c', '#6b8f6e', '#d6b05c', '#7d9bb3', '#c9888f', '#8a9a5b'];
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  else { r = r + (255 - r) * amt; g = g + (255 - g) * amt; b = b + (255 - b) * amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/* ---------- path helpers ---------- */
function catmullRom2Bezier(pts) {
  const n = pts.length;
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + ' Z';
}

function blossomPath(cx, cy, R, rng) {
  const n = 48, pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const lobe = 0.62 + 0.34 * Math.pow(Math.abs(Math.cos(5 * t / 2)), 1.7);
    const r = R * lobe * (1 + (rng() - 0.5) * 0.1);
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return catmullRom2Bezier(pts);
}

function blobPath(cx, cy, R, rng) {
  const n = 30, pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = R * (1 + (rng() - 0.5) * 0.5);
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return catmullRom2Bezier(pts);
}

function tagPath(x, y, w, h, rng) {
  const m = 6, pts = [];
  for (let i = 0; i <= m; i++) pts.push([x + w * i / m, y + (rng() - 0.5) * 7]);
  for (let i = 1; i <= m; i++) pts.push([x + w, y + h * i / m + (rng() - 0.5) * 7]);
  for (let i = 1; i <= m; i++) pts.push([x + w - w * i / m + (rng() - 0.5) * 7, y + h]);
  for (let i = 1; i < m; i++) pts.push([x + (rng() - 0.5) * 7, y + h - h * i / m]);
  return catmullRom2Bezier(pts);
}

/* ---------- paper texture (canvas, used by B / C) ---------- */
const texCache = {};
function makePaperTexture(hex, seed) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = hex; ctx.fillRect(0, 0, S, S);

  // 染色不均：柔和明暗斑块
  ctx.save();
  ctx.filter = 'blur(16px)';
  for (let i = 0; i < 70; i++) {
    const g = mulberry32(seed + i * 101);
    const light = g() > 0.5;
    ctx.fillStyle = light ? `rgba(255,255,255,${0.02 + g() * 0.05})` : `rgba(0,0,0,${0.02 + g() * 0.05})`;
    ctx.beginPath();
    ctx.arc(g() * S, g() * S, 15 + g() * 55, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 纤维噪点
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = mulberry32(seed + i);
    const n = Math.floor((g() - 0.5) * 20);
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  // 斜向纤维短纹
  for (let i = 0; i < 46; i++) {
    const g = mulberry32(seed + 9000 + i * 13);
    ctx.strokeStyle = g() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.045)';
    ctx.lineWidth = 0.4 + g() * 0.7;
    ctx.beginPath();
    ctx.moveTo(g() * S, g() * S);
    ctx.lineTo(g() * S, g() * S);
    ctx.stroke();
  }

  // 细褶皱（低频明暗横纹）
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.filter = 'blur(1.5px)';
  for (let i = 0; i < 120; i++) {
    const g = mulberry32(seed + 20000 + i * 17);
    ctx.fillStyle = g() > 0.5 ? `rgba(255,255,255,${0.015 + g() * 0.03})` : `rgba(0,0,0,${0.015 + g() * 0.03})`;
    const x = g() * S, w = 2 + g() * 5, h = 40 + g() * 80;
    ctx.fillRect(x, g() * S, w, h);
  }
  ctx.restore();

  return c.toDataURL('image/png');
}
function getTexture(color, seed) {
  const key = color + seed;
  if (!texCache[key]) texCache[key] = makePaperTexture(color, seed);
  return texCache[key];
}

/* ---------- state ---------- */
let mode = 'procedural';
let texStyle = 'fold';

/* 六种全矢量的程序化纹理风格，均由 SVG 滤镜实现（无任何位图） */
const STYLES = {
  fold: { name: '褶皱', filter: (seed) => `
    <feTurbulence type="fractalNoise" baseFrequency="0.02 0.035" numOctaves="4" seed="${seed}" result="n"/>
    <feColorMatrix in="n" type="luminanceToAlpha" result="na"/>
    <feDiffuseLighting in="na" surfaceScale="3.2" diffuseConstant="1.4" lighting-color="#ffffff" result="light">
      <feDistantLight azimuth="135" elevation="45"/>
    </feDiffuseLighting>
    <feComposite in="SourceGraphic" in2="light" operator="arithmetic" k1="1.05" k2="0.12" k3="0.22"/>` },
  watercolor: { name: '水彩晕染', filter: (seed) => `
    <feTurbulence type="fractalNoise" baseFrequency="0.004 0.006" numOctaves="4" seed="${seed}" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 -0.2" result="mottle"/>
    <feComposite in="SourceGraphic" in2="mottle" operator="arithmetic" k1="1" k2="0" k3="0.35" k4="0" result="stain"/>
    <feGaussianBlur in="stain" stdDeviation="1.1"/>` },
  grain: { name: '颗粒', filter: (seed) => `
    <feTurbulence type="turbulence" baseFrequency="0.55" numOctaves="2" seed="${seed}" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.7 0.7 0.7 0 -0.3" result="ga"/>
    <feComposite in="SourceGraphic" in2="ga" operator="arithmetic" k1="1" k2="1" k3="-0.5" k4="0"/>` },
  weave: { name: '织物拉丝', filter: (seed) => `
    <feTurbulence type="fractalNoise" baseFrequency="0.5 0.015" numOctaves="3" seed="${seed}" result="n"/>
    <feColorMatrix in="n" type="luminanceToAlpha" result="na"/>
    <feDiffuseLighting in="na" surfaceScale="1.6" diffuseConstant="1.2" lighting-color="#ffffff" result="light">
      <feDistantLight azimuth="90" elevation="60"/>
    </feDiffuseLighting>
    <feComposite in="SourceGraphic" in2="light" operator="arithmetic" k1="1.05" k2="0.2" k3="0.18"/>` },
  marble: { name: '大理石纹', filter: (seed) => `
    <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="5" seed="${seed}" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 -0.25" result="alpha"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="16" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feComposite in="d" in2="alpha" operator="arithmetic" k1="1" k2="0" k3="0.42"/>` },
  fiber: { name: '纤维', filter: (seed) => `
    <feTurbulence type="fractalNoise" baseFrequency="0.04 0.04" numOctaves="5" seed="${seed}" result="n"/>
    <feColorMatrix in="n" type="luminanceToAlpha" result="na"/>
    <feDiffuseLighting in="na" surfaceScale="2.4" diffuseConstant="1.3" lighting-color="#ffffff" result="light">
      <feDistantLight azimuth="45" elevation="40"/>
    </feDiffuseLighting>
    <feComposite in="SourceGraphic" in2="light" operator="arithmetic" k1="1.05" k2="0.15" k3="0.2"/>` },
};
const MODES = {
  procedural: {
    name: 'A · 纯程序化',
    desc: '全部由 SVG 矢量滤镜生成：feTurbulence 褶皱光影 + 手绘感边缘 + 纸张厚度投影。导出为纯矢量 SVG，可无限缩放、体积小、可实时形变。',
  },
  texture: {
    name: 'B · 位图纹理',
    desc: '用 Canvas 生成一张"彩纸纹理"（染色不均 + 纤维 + 细褶皱）作为元素填充。真实感高，但纹理是静态位图：导出 SVG 时需嵌入 base64，体积大且无法实时改变颜色。',
  },
  mixed: {
    name: 'C · 混合',
    desc: '位图纹理打底 + SVG 褶皱滤镜叠加。质感最丰富，但导出仍含位图。',
  },
};

const papers = [
  { kind: 'blossom', color: PALETTE[0], x: 240, y: 210, rot: -8, scale: 1.0, seed: 11 },
  { kind: 'blob', color: PALETTE[1], x: 480, y: 300, rot: 12, scale: 1.05, seed: 27 },
  { kind: 'tag', color: PALETTE[2], x: 360, y: 470, rot: 5, scale: 1.0, seed: 43 },
];

function shapePath(p) {
  const rng = mulberry32(p.seed * 7919);
  if (p.kind === 'blossom') return blossomPath(0, 0, 92, rng);
  if (p.kind === 'blob') return blobPath(0, 0, 108, rng);
  return tagPath(-80, -46, 160, 92, rng);
}

/* ---------- render ---------- */
let svg, drag = null;

function buildDefs() {
  let defs = `
    <defs>
    <filter id="thick" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="3.5" dy="4.5" stdDeviation="2.5" flood-color="#3a342b" flood-opacity="0.38"/>
    </filter>
    <filter id="blur-under"><feGaussianBlur stdDeviation="0.7"/></filter>`;

  papers.forEach((p, i) => {
    defs += `
    <filter id="st-${i}" x="-20%" y="-20%" width="140%" height="140%">
      ${STYLES[texStyle].filter(p.seed)}
    </filter>`;

    if (mode !== 'procedural') {
      defs += `
    <pattern id="tex-${i}" width="256" height="256" patternUnits="userSpaceOnUse">
      <image href="${getTexture(p.color, p.seed)}" width="256" height="256" preserveAspectRatio="xMidYMid slice"/>
    </pattern>`;
    }
  });

  return defs + '</defs>';
}

function renderPaper(p, i) {
  const d = shapePath(p);
  const t = `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rot.toFixed(1)}) scale(${p.scale})`;

  let face;
  if (mode === 'procedural') {
    face = `<path d="${d}" fill="${p.color}" filter="url(#st-${i})"/>`;
  } else if (mode === 'texture') {
    face = `<path d="${d}" fill="url(#tex-${i})"/>`;
  } else {
    face = `<path d="${d}" fill="url(#tex-${i})" filter="url(#st-${i})"/>`;
  }

  const under = `<path d="${d}" transform="translate(2.6 3.6)" fill="${shade(p.color, -0.3)}" filter="url(#blur-under)"/>`;

  return `
  <g class="paper" data-id="${i}" transform="${t}" filter="url(#thick)">
    ${under}
    ${face}
  </g>`;
}

function renderAll() {
  svg.innerHTML = buildDefs() + papers.map(renderPaper).join('');
  updateModeUI();
}

/* ---------- mode switching ---------- */
function updateModeUI() {
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.getElementById('mode-name').textContent = MODES[mode].name;
  document.getElementById('mode-desc').textContent = MODES[mode].desc;
  // 位图纹理模式下矢量风格切换无意义，禁用
  const isVector = mode !== 'texture';
  document.getElementById('style-bar').classList.toggle('disabled', !isVector);
}

/* ---------- interactions ---------- */
function setupInteractions() {
  svg.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('.paper');
    if (!g) return;
    const id = +g.dataset.id;
    const p = papers[id];
    const rect = svg.getBoundingClientRect();
    drag = { id, startX: e.clientX - rect.left, startY: e.clientY - rect.top, ox: p.x, oy: p.y };
    g.setPointerCapture(e.pointerId);
  });

  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const rect = svg.getBoundingClientRect();
    const p = papers[drag.id];
    p.x = drag.ox + (e.clientX - rect.left) - drag.startX;
    p.y = drag.oy + (e.clientY - rect.top) - drag.startY;
    updateTransform(p);
  });

  svg.addEventListener('pointerup', () => { drag = null; });

  svg.addEventListener('wheel', (e) => {
    const g = e.target.closest('.paper');
    if (!g) return;
    e.preventDefault();
    const p = papers[+g.dataset.id];
    p.rot = (p.rot + e.deltaY * 0.08 + 360) % 360;
    updateTransform(p);
  }, { passive: false });

  svg.addEventListener('dblclick', (e) => {
    const g = e.target.closest('.paper');
    if (!g) return;
    const p = papers[+g.dataset.id];
    const idx = (PALETTE.indexOf(p.color) + 1) % PALETTE.length;
    p.color = PALETTE[idx];
    renderAll();
  });
}

function updateTransform(p) {
  const g = svg.querySelector(`.paper[data-id="${papers.indexOf(p)}"]`);
  if (g) g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rot.toFixed(1)}) scale(${p.scale})`);
}

/* ---------- export ---------- */
function exportSVG() {
  const clone = svg.cloneNode(true);
  const html = new XMLSerializer().serializeToString(clone);
  const bytes = new Blob([html]).size;

  let base64Chars = 0;
  const preview = html.replace(/data:image\/png;base64,([^"]+)/g, (m, b64) => {
    base64Chars += b64.length;
    return `data:image/png;base64,…(${b64.length} 字符)`;
  });

  const hasRaster = mode !== 'procedural';
  const info = document.getElementById('export-info');
  const pre = document.getElementById('export-preview');

  if (hasRaster) {
    info.innerHTML = `<strong>${bytes.toLocaleString()} 字节</strong> · 含位图纹理 base64（约 ${base64Chars.toLocaleString()} 字符）。<br>SVG 不再是纯矢量：放大失真、无法程序化换色、体积膨胀。`;
  } else {
    info.innerHTML = `<strong>${bytes.toLocaleString()} 字节</strong> · 纯矢量：滤镜为 SVG 原生滤镜，无任何位图。无限缩放、体积小、可实时换色。`;
  }
  pre.textContent = preview;
}

/* ---------- init ---------- */
function init() {
  svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', '0 0 800 600');
  svg.style.userSelect = 'none';
  svg.style.cursor = 'grab';
  svg.style.touchAction = 'none';
  document.getElementById('stage').appendChild(svg);

  document.querySelectorAll('.mode-btn').forEach(b =>
    b.addEventListener('click', () => { mode = b.dataset.mode; renderAll(); }));

  document.querySelectorAll('.style-btn').forEach(b =>
    b.addEventListener('click', () => {
      texStyle = b.dataset.style;
      document.querySelectorAll('.style-btn').forEach(x => x.classList.toggle('active', x === b));
      renderAll();
    }));

  document.getElementById('export-btn').addEventListener('click', exportSVG);
  setupInteractions();
  renderAll();
}

init();
