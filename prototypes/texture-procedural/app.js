/* 程序化纹理生成器真实感验证 — wayfinder #16 · 一次性代码
 * seed 驱动 canvas 灰度纹理生成器（#10 Y 路线）+ #9 程序合成着色。
 * 目标：6 风格（褶皱/水彩晕染/颗粒/织物拉丝/大理石纹/纤维）真实感拍板。
 */
'use strict';

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

/* ---------- value-noise fBm（feTurbulence 的 canvas 等价物） ---------- */
function makeValueNoise(rng) {
  const vals = new Float32Array(256 * 256);
  for (let i = 0; i < vals.length; i++) vals[i] = rng();
  return function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = xi & 255, y0 = yi & 255;
    const x1 = (x0 + 1) & 255, y1 = (y0 + 1) & 255;
    const a = vals[y0 * 256 + x0], b = vals[y0 * 256 + x1];
    const c = vals[y1 * 256 + x0], d = vals[y1 * 256 + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function makeFbm(rng) {
  const n = makeValueNoise(rng);
  return function fbm(x, y, octaves) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * n(x * freq, y * freq);
      norm += amp;
      amp *= 0.5; freq *= 2;
    }
    return sum / norm; // 均值≈0.5
  };
}

/* ---------- 6 风格灰度场生成器（返回 Float32Array，均值≈0.5 的结构场） ---------- */
const STYLES = [
  {
    id: 'fold', name: '褶皱', std: 7.0,
    desc: '纸折棱的平滑明暗带，折痕方向随 seed 变化',
    gen(S, rng) {
      const fbm = makeFbm(rng);
      const angle = rng() * Math.PI;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const out = new Float32Array(S * S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = x - S / 2, dy = y - S / 2;
        const rx = dx * ca + dy * sa, ry = -dx * sa + dy * ca;      // 旋转到折痕坐标
        const warp = fbm(dx / 130, dy / 130, 3);                    // 域扭曲：折痕不规则
        const crease = fbm(rx / 220, ry / 22 + warp * 3.0, 4);      // ry 高频 → 平行折痕线
        const base = fbm(dx / 180, dy / 180, 3);                    // 平滑纸底
        out[y * S + x] = crease * 0.55 + base * 0.45;
      }
      return out;
    },
  },
  {
    id: 'watercolor', name: '水彩晕染', std: 6.5,
    desc: '超低频大斑块 + 少量沉淀细点，边缘晕开',
    gen(S, rng) {
      const fbm = makeFbm(rng);
      const out = new Float32Array(S * S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const b1 = fbm(x / 150, y / 150, 4);
        const b2 = fbm((x + 37) / 64, (y + 11) / 64, 3);
        const spec = fbm(x / 9, y / 9, 2) - 0.5;                    // 沉淀细点
        out[y * S + x] = b1 * 0.72 + b2 * 0.28 + spec * 0.06;
      }
      return out;
    },
  },
  {
    id: 'grain', name: '颗粒', std: 8.0,
    desc: '中频粗粒 + 高频细噪，纸浆颗粒感',
    gen(S, rng) {
      const fbm = makeFbm(rng);
      const out = new Float32Array(S * S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const coarse = fbm(x / 16, y / 16, 3);
        const fine = fbm(x / 3.2, y / 3.2, 3);
        out[y * S + x] = coarse * 0.55 + fine * 0.45;
      }
      return out;
    },
  },
  {
    id: 'weave', name: '织物拉丝', std: 7.0,
    desc: '定向细丝（方向随 seed）+ 平滑底，斜纹布质感',
    gen(S, rng) {
      const fbm = makeFbm(rng);
      const angle = rng() * Math.PI;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const out = new Float32Array(S * S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = x - S / 2, dy = y - S / 2;
        const rx = dx * ca + dy * sa, ry = -dx * sa + dy * ca;
        const strand = fbm(rx / 300, ry / 5, 4);                    // 沿 rx 方向的细丝
        const tone = fbm(dx / 140, dy / 140, 2);
        out[y * S + x] = strand * 0.6 + tone * 0.4;
      }
      return out;
    },
  },
  {
    id: 'marble', name: '大理石纹', std: 7.5,
    desc: 'sine 域扭曲的蜿蜒纹路，方向随 seed，流动感',
    gen(S, rng) {
      const fbm = makeFbm(rng);
      const angle = rng() * Math.PI;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const out = new Float32Array(S * S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = x - S / 2, dy = y - S / 2;
        const rx = dx * ca + dy * sa, ry = -dx * sa + dy * ca;
        const w1 = fbm(rx / 32, ry / 32, 4);
        const w2 = fbm(rx / 74, ry / 74, 3);
        out[y * S + x] = Math.sin(rx / 20 + w1 * 6.5 + w2 * 3.5) * 0.5 + 0.5;
      }
      return out;
    },
  },
  {
    id: 'fiber', name: '纤维', std: 7.0,
    desc: '两组交叉细纤维（毛毡）+ 平滑底',
    gen(S, rng) {
      const fbm = makeFbm(rng);
      const angle = rng() * Math.PI;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const a2 = angle + Math.PI / 2;
      const ca2 = Math.cos(a2), sa2 = Math.sin(a2);
      const out = new Float32Array(S * S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = x - S / 2, dy = y - S / 2;
        const rx = dx * ca + dy * sa, ry = -dx * sa + dy * ca;
        const rx2 = dx * ca2 + dy * sa2, ry2 = -dx * sa2 + dy * ca2;
        const f1 = fbm(rx / 320, ry / 3.5, 4);                     // 沿 angle 的纤维
        const f2 = fbm(rx2 / 240, ry2 / 4.5, 3);                   // 垂直交叉组
        const tone = fbm(dx / 120, dy / 120, 2);
        out[y * S + x] = f1 * 0.42 + f2 * 0.38 + tone * 0.2;
      }
      return out;
    },
  },
];

/* ---------- 灰度层生成：结构场 → 明度（均值归一化到 BASE，同色不露馅） ---------- */
const SEEDS = [11, 27, 43, 59];
let BASE = 178;          // 纸张亮度基值（#8 手工纸明度参考区间 75-208 的中高段）
const SIZE = 256;

const grayCache = new Map();   // `${style}:${seed}:${base}` -> canvas

function fieldToCanvas(field, S, stdTarget) {
  // 双归一化：均值归一到 BASE（同色不露馅）+ std 归一到风格目标
  // （#8 真实手工纸明度 std≈6-9，目标 std 全部落在该区间 → 对比度真实）
  let sum = 0;
  for (let i = 0; i < field.length; i++) sum += field[i];
  const mean = sum / field.length;
  let v2 = 0;
  for (let i = 0; i < field.length; i++) { const dv = field[i] - mean; v2 += dv * dv; }
  const std = Math.sqrt(v2 / field.length);
  const k = std > 1e-6 ? stdTarget / std : 0;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let i = 0; i < field.length; i++) {
    let v = BASE + (field[i] - mean) * k;
    if (v < 0) v = 0; else if (v > 255) v = 255;
    const j = i * 4;
    d[j] = d[j + 1] = d[j + 2] = v;
    d[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function makeGray(styleId, seed, base) {
  const key = `${styleId}:${seed}:${base}`;
  if (grayCache.has(key)) return grayCache.get(key);
  const st = STYLES.find(s => s.id === styleId);
  const field = st.gen(SIZE, mulberry32(seed));
  const c = fieldToCanvas(field, SIZE, st.std);
  grayCache.set(key, c);
  return c;
}

/* ---------- #9 程序合成着色（灰度 × 用户色 → 单图） ---------- */
const tintCache = new Map();   // `${style}:${seed}:${color}` -> canvas
function composeTint(grayCanvas, color) {
  const c = document.createElement('canvas');
  c.width = c.height = grayCanvas.width;
  const ctx = c.getContext('2d');
  ctx.drawImage(grayCanvas, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}
function makeTint(styleId, seed, color) {
  const key = `${styleId}:${seed}:${color}`;
  if (tintCache.has(key)) return tintCache.get(key);
  const t = composeTint(makeGray(styleId, seed, BASE), color);
  tintCache.set(key, t);
  return t;
}

/* ---------- 色板 ---------- */
const PALETTE = ['#d97a5c', '#6b8f6e', '#d6b05c', '#7d9bb3', '#c9888f', '#8a9a5b', '#a8845a'];
let currentColor = PALETTE[0];

/* ---------- 渲染 ---------- */
function canvasEl(c) {
  const el = document.createElement('canvas');
  el.width = c.width; el.height = c.height;
  el.className = 'tex-cell';
  el.getContext('2d').drawImage(c, 0, 0);
  return el;
}

function buildStyleCard(st) {
  const card = document.createElement('section');
  card.className = 'card';
  card.id = `card-${st.id}`;

  const head = document.createElement('div');
  head.className = 'card-head';
  const title = document.createElement('h2');
  title.textContent = `${st.name} <span class="span">std ${st.std}</span>`;
  title.className = 'card-title';
  const verdict = document.createElement('div');
  verdict.className = 'verdict';
  verdict.innerHTML = `
    <button data-v="pass">✓ 过</button>
    <button data-v="demote">⚠ 降级</button>
    <span class="v-note"></span>`;
  head.append(title, verdict);
  card.appendChild(head);

  const desc = document.createElement('p');
  desc.className = 'card-desc';
  desc.textContent = st.desc;
  card.appendChild(desc);

  // 灰度源行
  const rowGray = document.createElement('div');
  rowGray.className = 'row';
  rowGray.innerHTML = `<div class="row-label">灰度源（4 seed）</div>`;
  const boxGray = document.createElement('div');
  boxGray.className = 'cell-row';
  SEEDS.forEach(seed => boxGray.appendChild(canvasEl(makeGray(st.id, seed, BASE))));
  rowGray.appendChild(boxGray);
  card.appendChild(rowGray);

  // 合成着色行（同色多 seed 并排 → 露馅检测）
  const rowTint = document.createElement('div');
  rowTint.className = 'row';
  rowTint.innerHTML = `<div class="row-label">合成 ${currentColor}（同色并排 · 露馅检测）</div>`;
  const boxTint = document.createElement('div');
  boxTint.className = 'cell-row';
  SEEDS.forEach(seed => boxTint.appendChild(canvasEl(makeTint(st.id, seed, currentColor))));
  rowTint.appendChild(boxTint);
  card.appendChild(rowTint);

  return card;
}

function render() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  STYLES.forEach(st => grid.appendChild(buildStyleCard(st)));
  document.getElementById('base-val').textContent = `纸张亮度 ${BASE}`;
}

/* ---------- 交互 ---------- */
function setup() {
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
      render();
    });
    sw.appendChild(b);
  });
  document.getElementById('color-input').addEventListener('input', e => {
    currentColor = e.target.value;
    render();
  });
  // 亮度滑块
  document.getElementById('base-slider').addEventListener('input', e => {
    BASE = +e.target.value;
    render();
  });
  // 重掷全部 seed
  document.getElementById('reshuffle').addEventListener('click', () => {
    SEEDS.forEach((s, i) => { SEEDS[i] = (Math.random() * 0x7fffffff) | 0; });
    grayCache.clear(); tintCache.clear();
    render();
  });
  // 评估按钮（HITL 收口用）
  document.getElementById('grid').addEventListener('click', e => {
    const btn = e.target.closest('button[data-v]');
    if (!btn) return;
    const card = btn.closest('.card');
    const st = STYLES.find(s => s.id === card.id.slice(5));
    card.querySelectorAll('button[data-v]').forEach(b => b.classList.remove('chosen'));
    btn.classList.add('chosen');
    const note = card.querySelector('.v-note');
    note.textContent = btn.dataset.v === 'pass' ? '过' : '降级';
    updateSummary();
  });
}

function updateSummary() {
  const lines = [];
  STYLES.forEach(st => {
    const chosen = document.querySelector(`#card-${st.id} button[data-v].chosen`);
    lines.push(`${st.name}：${chosen ? (chosen.dataset.v === 'pass' ? '过' : '降级') : '待定'}`);
  });
  const extra = document.getElementById('extra-note').value.trim();
  if (extra) lines.push(`整体：${extra}`);
  document.getElementById('summary').textContent = lines.join('\n');
}

document.getElementById('extra-note').addEventListener('input', updateSummary);
document.getElementById('copy-summary').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('summary').textContent)
    .then(() => alert('已复制决议文本'));
});

/* ---------- init ---------- */
setup();
render();
