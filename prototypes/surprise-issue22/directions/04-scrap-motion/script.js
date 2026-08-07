/* ══════════════════════════════════════════════════════════
   pasteup · 04 碎纸拼贴 SCRAP MOTION — script.js
   纸片由碎纸粒子构成：拖动解构 → 纸屑跟随 → 松开重组。
   手写 canvas 粒子引擎 + gsap 时间线编排 + 自定义 easing。
   ══════════════════════════════════════════════════════════ */
'use strict';

gsap.registerPlugin(CustomEase);
CustomEase.create('scrapOut', 'M0,0 C0.16,1 0.3,1 1,1');
CustomEase.create('scrapIn', 'M0,0 C0.42,0 0.68,0 1,1');
CustomEase.create('wind', 'M0,0 C0.2,0.9 0.42,1.12 0.6,1 C0.75,0.9 0.86,1 1,1');
CustomEase.create('scrapBounce', 'M0,0 C0.16,0.92 0.24,1.16 0.38,1.05 C0.48,0.96 0.5,0.9 0.6,0.98 C0.7,1.06 0.76,1.1 0.86,1.02 C0.93,0.98 0.97,1 1,1');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function shade(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function colorSet(hex) { return [hex, shade(hex, 0.2), shade(hex, -0.18)]; }

/* ═══════════ 纹理 / 背景生成（canvas → dataURL） ═══════════ */
function texCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, x: c.getContext('2d') };
}

function makeWrinkle(seed) {
  const { c, x } = texCanvas(160, 160);
  x.clearRect(0, 0, 160, 160);
  const rnd = mulberry(seed);
  for (let i = 0; i < 260; i++) {
    const y = rnd() * 160, h = rand(6, 26) * (rnd() - 0.5);
    x.strokeStyle = `rgba(90,70,52,${rnd() * 0.07 + 0.02})`;
    x.lineWidth = rand(0.4, 1.4);
    x.beginPath();
    x.moveTo(rnd() * 160, y);
    x.quadraticCurveTo(rnd() * 160, y + h * 0.5, rnd() * 160, y + h);
    x.stroke();
  }
  for (let i = 0; i < 30; i++) {
    x.strokeStyle = `rgba(255,255,255,${rnd() * 0.06 + 0.02})`;
    x.lineWidth = rand(0.6, 1.8);
    x.beginPath();
    const y = rnd() * 160;
    x.moveTo(rnd() * 160, y);
    x.lineTo(rnd() * 160, y + rand(4, 18));
    x.stroke();
  }
  return c.toDataURL();
}
function makeWatercolor(seed) {
  const { c, x } = texCanvas(160, 160);
  x.clearRect(0, 0, 160, 160);
  const rnd = mulberry(seed);
  for (let i = 0; i < 90; i++) {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, rand(10, 34));
    g.addColorStop(0, `rgba(90,70,52,${rnd() * 0.1 + 0.04})`);
    g.addColorStop(1, 'rgba(90,70,52,0)');
    x.fillStyle = g;
    x.save(); x.translate(rnd() * 160, rnd() * 160); x.beginPath(); x.arc(0, 0, 34, 0, 7); x.fill(); x.restore();
  }
  for (let i = 0; i < 500; i++) {
    x.fillStyle = `rgba(90,70,52,${rnd() * 0.05})`;
    x.fillRect(rnd() * 160, rnd() * 160, 1, 1.4);
  }
  return c.toDataURL();
}
function makeCorrugate(seed) {
  const { c, x } = texCanvas(160, 160);
  x.clearRect(0, 0, 160, 160);
  const rnd = mulberry(seed);
  for (let yy = -6; yy < 172; yy += 5) {
    x.beginPath();
    for (let xx = 0; xx <= 160; xx += 4) {
      const y = yy + Math.sin(xx * 0.28) * 2.2;
      if (xx === 0) x.moveTo(xx, y); else x.lineTo(xx, y);
    }
    x.strokeStyle = `rgba(90,70,52,${rnd() * 0.06 + 0.03})`;
    x.lineWidth = rand(0.5, 1.3);
    x.stroke();
    x.beginPath();
    for (let xx = 0; xx <= 160; xx += 4) {
      const y = yy + 2 + Math.sin(xx * 0.28) * 2.2;
      if (xx === 0) x.moveTo(xx, y); else x.lineTo(xx, y);
    }
    x.strokeStyle = `rgba(255,255,255,${rnd() * 0.05})`;
    x.stroke();
  }
  return c.toDataURL();
}
function makeGlitter(seed) {
  const { c, x } = texCanvas(160, 160);
  x.clearRect(0, 0, 160, 160);
  const rnd = mulberry(seed);
  for (let i = 0; i < 240; i++) {
    x.fillStyle = `rgba(240,199,94,${rnd() * 0.55 + 0.15})`;
    x.save();
    x.translate(rnd() * 160, rnd() * 160);
    x.rotate(rand(0, 3.14));
    x.fillRect(-1.2, -0.2, 2.4, 0.5);
    x.restore();
  }
  for (let i = 0; i < 160; i++) {
    x.fillStyle = `rgba(255,255,255,${rnd() * 0.5})`;
    x.fillRect(rnd() * 160, rnd() * 160, 1, 1);
  }
  return c.toDataURL();
}
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeStageTexture() {
  const { c, x } = texCanvas(560, 560);
  x.fillStyle = '#F2EAD9';
  x.fillRect(0, 0, 560, 560);
  const rnd = mulberry(42);
  for (let i = 0; i < 900; i++) {
    x.strokeStyle = `rgba(90,70,52,${rnd() * 0.04})`;
    x.lineWidth = rand(0.4, 1);
    x.beginPath();
    const y = rnd() * 560;
    x.moveTo(rnd() * 560, y);
    x.lineTo(rnd() * 560, y + rand(3, 14));
    x.stroke();
  }
  for (let i = 0; i < 26; i++) {
    x.fillStyle = `rgba(255,255,255,${rnd() * 0.06})`;
    x.fillRect(rnd() * 560, rnd() * 560, rand(2, 8), rand(2, 8));
  }
  // 淡淡的描摹格点
  x.fillStyle = 'rgba(90,70,52,0.08)';
  for (let gx = 28; gx < 560; gx += 28) {
    for (let gy = 28; gy < 560; gy += 28) {
      x.beginPath(); x.arc(gx, gy, 1.1, 0, 7); x.fill();
    }
  }
  // 边缘柔光（让纸面像被桌面灯照到）
  const v = x.createRadialGradient(280, 230, 60, 280, 280, 470);
  v.addColorStop(0, 'rgba(255,252,240,0)');
  v.addColorStop(1, 'rgba(214,138,85,0.10)');
  x.fillStyle = v;
  x.fillRect(0, 0, 560, 560);
  return c.toDataURL();
}

/* ═══════════ 粒子引擎 ═══════════ */
const stage = $('#stage');
const canvas = $('#scrapCanvas');
const ctx = canvas.getContext('2d');
let stageW = 0, stageH = 0, dpr = 1, nowT = 0, lastT = 0;

const engine = {
  particles: [],
  leader: { x: 0, y: 0 },      // 跟随模式的锚点（拖动指针 / 演示时间线）
  cloudScale: 1,
  pending: {},                 // pieceId -> callback（重组完成）
};

function sizeStage() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = stage.getBoundingClientRect();
  stageW = r.width; stageH = r.height;
  canvas.width = Math.round(stageW * dpr);
  canvas.height = Math.round(stageH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function scrapShape(p) {
  p.j1 = p.j1 || rand(0.7, 1.3);
  p.j2 = p.j2 || rand(0.7, 1.3);
  p.j3 = p.j3 || rand(0.7, 1.3);
  p.j4 = p.j4 || rand(0.7, 1.3);
}

function spawnScrap(o) {
  scrapShape(o);
  engine.particles.push(o);
}

function spawnBurst(x, y, colors, count, power, opts = {}) {
  for (let i = 0; i < count; i++) {
    spawnScrap({
      x: x + rand(-14, 14), y: y + rand(-12, 12),
      vx: rand(-power, power), vy: rand(-power * 1.25, power * 0.35),
      rot: rand(0, 6.28), vrot: rand(-0.3, 0.3),
      size: opts.small ? rand(3, 6) : rand(4, 10),
      color: pick(colors), mode: 'free',
      gravity: 0.35, bounce: 0.52, life: rand(44, 92), maxLife: 92,
      alpha: rand(0.6, 1),
    });
  }
}

function spawnDust(x, y, colors, n = 8) {
  for (let i = 0; i < n; i++) {
    spawnScrap({
      x: x + rand(-10, 10), y: y + rand(-8, 8),
      vx: rand(-0.7, 0.7), vy: rand(-1.4, -0.2),
      rot: rand(0, 6.28), vrot: rand(-0.12, 0.12),
      size: rand(1.5, 3.6), color: pick(colors), mode: 'free',
      gravity: -0.03, bounce: 0.2, life: rand(20, 34), maxLife: 34,
      alpha: rand(0.3, 0.55),
    });
  }
}

function spawnSprinkle(centerX, count, colors) {
  for (let i = 0; i < count; i++) {
    spawnScrap({
      x: centerX + rand(-stageW * 0.55, stageW * 0.55), y: rand(-24, -6),
      vx: rand(-0.6, 0.6), vy: rand(0.6, 2.4),
      rot: rand(0, 6.28), vrot: rand(-0.25, 0.25),
      size: rand(3, 7), color: pick(colors), mode: 'free',
      gravity: 0.4, bounce: 0.5, life: rand(70, 130), maxLife: 130,
      alpha: rand(0.7, 1),
    });
  }
}

/* —— 纸片解构：把一张纸片散成「跟随纸屑云」 —— */
function deconstructToCloud(pieceId, cx, cy) {
  const p = pieces[pieceId];
  if (!p || p.removed) return;
  p.el.style.visibility = 'hidden';
  const colors = colorSet(p.color);
  spawnDust(cx, cy, colors, 6);
  spawnBurst(cx, cy, colors, 6, 2.2, { small: true });   // 拆开时的飞屑
  const n = reduceMotion ? 0 : 30;
  for (let i = 0; i < n; i++) {
    spawnScrap({
      x: cx + rand(-60, 60) * 0.8, y: cy + rand(-50, 50) * 0.8,
      vx: rand(-0.4, 0.4), vy: rand(-0.4, 0.4),
      rot: rand(0, 6.28), vrot: rand(-0.12, 0.12),
      size: rand(4, 10), color: pick(colors), mode: 'follow',
      offX: rand(-58, 58), offY: rand(-46, 46),
      pieceId, alpha: rand(0.8, 1),
    });
  }
}

/* —— 重组：纸屑向落点汇聚，收拢后纸片重新现形 —— */
function recomposeFromCloud(x, y, pieceId) {
  const p = pieces[pieceId];
  if (!p || p.removed) return;
  const w = p.el.offsetWidth, h = p.el.offsetHeight;
  const tx = clamp(x, w / 2 + 18, Math.max(w / 2 + 18, stageW - w / 2 - 18));
  const ty = clamp(y, h / 2 + 26, Math.max(h / 2 + 26, stageH - h / 2 - 26));
  let moving = 0;
  for (const q of engine.particles) {
    if (q.pieceId === pieceId && q.mode === 'follow') {
      q.mode = 'recompose';
      q.targetX = tx; q.targetY = ty;
      q.shrink = 1; q.gravity = 0;
      moving++;
    }
  }
  if (reduceMotion || moving === 0) { finishRecompose(pieceId, tx, ty); return; }
  engine.pending[pieceId] = () => finishRecompose(pieceId, tx, ty);
  spawnDust(tx, ty, colorSet(p.color), 5);
}

function finishRecompose(pieceId, x, y) {
  const p = pieces[pieceId];
  if (!p || p.removed) return;
  const w = p.el.offsetWidth, h = p.el.offsetHeight;
  p.pctX = x / stageW; p.pctY = y / stageH;
  p.el.style.left = (x - w / 2) + 'px';
  p.el.style.top = (y - h / 2) + 'px';
  p.el.style.visibility = '';
  const eff = p.scale * zoomF;
  gsap.fromTo(p.el,
    { scale: eff * 0.72, rotation: p.rotation + rand(-12, 12) },
    { scale: eff, rotation: p.rotation, duration: 0.6, ease: 'scrapBounce', overwrite: 'auto' });
  spawnDust(x, y, colorSet(p.color), 9);
  spawnBurst(x, y, colorSet(p.color), 4, 1.4, { small: true });
}

/* —— 每帧物理 —— */
function freeUpdate(q, dt) {
  q.vy += q.gravity * dt;
  q.vx *= 0.985; q.vy *= 0.992;
  q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vrot * dt;
  if (q.y > stageH - 14) { q.y = stageH - 14; q.vy *= -q.bounce; q.vx *= 0.88; q.vrot *= 0.7; }
  if (q.y < 2 && q.vy < 0) { q.y = 2; q.vy *= -q.bounce * 0.4; }
  if (q.x < 4) { q.x = 4; q.vx *= -q.bounce; }
  if (q.x > stageW - 4) { q.x = stageW - 4; q.vx *= -q.bounce; }
}
function followUpdate(q, dt) {
  const tx = engine.leader.x + q.offX * engine.cloudScale;
  const ty = engine.leader.y + q.offY * engine.cloudScale;
  q.vx += (tx - q.x) * 0.16 * dt; q.vy += (ty - q.y) * 0.16 * dt;
  q.vx *= 0.84; q.vy *= 0.84;
  q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vrot * dt;
}
function recomposeUpdate(q, dt) {
  q.shrink = Math.max(0, q.shrink - 0.03 * dt);
  const tx = q.targetX + q.offX * q.shrink;
  const ty = q.targetY + q.offY * q.shrink;
  q.vx += (tx - q.x) * 0.22 * dt; q.vy += (ty - q.y) * 0.22 * dt;
  q.vx *= 0.86; q.vy *= 0.86;
  q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vrot * dt;
  if (Math.hypot(tx - q.x, ty - q.y) < 4 && q.shrink <= 0.01) q.done = true;
}
function ambientUpdate(q, dt) {
  q.vy = Math.sin(nowT * 0.001 + q.phase) * 0.1;
  q.x += q.vx * dt * 0.5; q.y += q.vy * dt;
  if (q.x > stageW + 12) q.x = -12; if (q.x < -12) q.x = stageW + 12;
  if (q.y > stageH + 12) q.y = -12; if (q.y < -12) q.y = stageH + 12;
}

function tick(now) {
  const dt = clamp((now - (lastT || now)) / 16.667, 0.4, 3);
  lastT = now; nowT = now;

  if (!reduceMotion && Math.random() < dt / 320) {   // 偶尔一片纸屑从天而降
    spawnScrap({
      x: rand(20, stageW - 20), y: -12,
      vx: rand(-0.5, 0.5), vy: rand(1.2, 2.2),
      rot: rand(0, 6.28), vrot: rand(-0.2, 0.2),
      size: rand(3, 6), color: pick(['#D68A55', '#F0C75E', '#B9A4C6', '#7A8B5C']),
      mode: 'free', gravity: 0.4, bounce: 0.5, life: rand(80, 140), maxLife: 140, alpha: rand(0.5, 0.9),
    });
  }

  for (let i = engine.particles.length - 1; i >= 0; i--) {
    const q = engine.particles[i];
    if (q.mode === 'free') { freeUpdate(q, dt); q.life -= dt; if (q.life <= 0) { engine.particles.splice(i, 1); continue; } }
    else if (q.mode === 'follow') followUpdate(q, dt);
    else if (q.mode === 'recompose') { recomposeUpdate(q, dt); if (q.done) { engine.particles.splice(i, 1); continue; } }
    else if (q.mode === 'ambient') ambientUpdate(q, dt);
  }

  for (const id of Object.keys(engine.pending)) {
    const hasCloud = engine.particles.some(q => q.pieceId === id && (q.mode === 'follow' || q.mode === 'recompose'));
    if (!hasCloud) { const cb = engine.pending[id]; delete engine.pending[id]; cb(); }
  }

  ctx.clearRect(0, 0, stageW, stageH);
  for (const q of engine.particles) drawScrap(q);
  requestAnimationFrame(tick);
}

function drawScrap(q) {
  const alpha = q.alpha * (q.mode === 'free' ? Math.max(0, q.life / q.maxLife) : 1);
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.translate(q.x, q.y);
  ctx.rotate(q.rot);
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = q.color;
  const s = q.size;
  ctx.beginPath();
  ctx.moveTo(-s * 0.42, -s * 0.16 * q.j1);
  ctx.lineTo(s * 0.12, -s * 0.5 * q.j2);
  ctx.lineTo(s * 0.5, s * 0.1 * q.j3);
  ctx.lineTo(-s * 0.1, s * 0.46 * q.j4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function initAmbient() {
  if (reduceMotion) return;
  const colors = ['#D68A55', '#F0C75E', '#B9A4C6', '#7A8B5C'];
  for (let i = 0; i < 14; i++) {
    spawnScrap({
      x: rand(0, stageW), y: rand(0, stageH),
      vx: rand(0.08, 0.32) * (Math.random() < 0.5 ? -1 : 1), vy: 0,
      rot: rand(0, 6.28), vrot: 0,
      size: rand(3, 6), color: pick(colors), mode: 'ambient',
      alpha: rand(0.14, 0.34), phase: rand(0, 6.28),
    });
  }
}

/* ═══════════ 纸片管理 ═══════════ */
const TEXTURES = {};
const pieces = {
  maple: { id: 'maple', name: '枫叶', color: '#D68A55', rotation: -8, scale: 1, opacity: 1, tex: 'wrinkle', texScale: 100, stroke: false, pctX: 0.32, pctY: 0.2, removed: false },
  bird:  { id: 'bird',  name: '小鸟', color: '#F0C75E', rotation: 6, scale: 1, opacity: 1, tex: 'wrinkle', texScale: 100, stroke: false, pctX: 0.58, pctY: 0.42, removed: false },
  moon:  { id: 'moon',  name: '月亮', color: '#B9A4C6', rotation: -4, scale: 1, opacity: 1, tex: 'wrinkle', texScale: 100, stroke: false, pctX: 0.21, pctY: 0.62, removed: false },
};
let selId = 'maple';
let zoomF = 1;

function placePiece(id) {
  const p = pieces[id];
  if (!p || p.removed) return;
  const el = p.el;
  el.style.left = (p.pctX * stageW - el.offsetWidth / 2) + 'px';
  el.style.top = (p.pctY * stageH - el.offsetHeight / 2) + 'px';
}
function getCenter(id) { const p = pieces[id]; return { x: p.pctX * stageW, y: p.pctY * stageH }; }
function effScale(id) { return pieces[id].scale * zoomF; }

function applyPieceStyle(id, animate = false) {
  const p = pieces[id];
  if (!p || p.removed) return;
  const el = p.el;
  el.style.opacity = p.opacity;
  el.classList.toggle('is-stroked', p.stroke);
  const vars = { scale: effScale(id), rotation: p.rotation };
  if (animate) gsap.to(el, { ...vars, duration: 0.3, ease: 'scrapOut', overwrite: 'auto' });
  else gsap.set(el, { ...vars, transformOrigin: '50% 50%', overwrite: 'auto' });
}

function selectPiece(id) {
  if (selId && pieces[selId] && !pieces[selId].removed) pieces[selId].el.classList.remove('is-selected');
  selId = id;
  if (pieces[id] && !pieces[id].removed) pieces[id].el.classList.add('is-selected');
  $$('.layer', $('#layerList')).forEach(li => {
    const on = li.dataset.layer === id;
    li.classList.toggle('is-selected', on);
    if (on) li.setAttribute('aria-selected', 'true'); else li.removeAttribute('aria-selected');
  });
  syncProps();
}

function syncProps() {
  const p = pieces[selId];
  if (!p) return;
  $('#propPieceName').textContent = p.name;
  $('#propSize').value = Math.round(p.scale * 100);
  $('#propSizeVal').textContent = Math.round(p.scale * 100) + '%';
  $('#propRot').value = p.rotation;
  $('#propRotVal').textContent = (p.rotation > 0 ? '+' : '−') + Math.abs(Math.round(p.rotation)) + '°';
  $('#propOp').value = Math.round(p.opacity * 100);
  $('#propOpVal').textContent = Math.round(p.opacity * 100) + '%';
  $('#propTex').value = p.texScale;
  $('#propTexVal').textContent = p.texScale + '%';
  $('#propStroke').checked = p.stroke;
  $$('.swatch').forEach(s => s.classList.toggle('is-on', s.dataset.color === p.color));
  $$('.tex-card').forEach(t => t.classList.toggle('is-on', t.dataset.tex === p.tex));
}

function setColor(id, color) {
  const p = pieces[id];
  if (!p || p.removed) return;
  p.color = color;
  $$('use', p.el).forEach(u => {
    const f = u.getAttribute('fill');
    if (f && f[0] === '#') u.setAttribute('fill', color);
  });
  const dot = $('#layerList').querySelector('[data-layer="' + id + '"] .layer-dot');
  if (dot) dot.style.background = color;
  if (id === selId) { $$('.swatch').forEach(s => s.classList.toggle('is-on', s.dataset.color === color)); }
  spawnDust(getCenter(id).x, getCenter(id).y, colorSet(color), 4);
}

function setTexture(id, tex) {
  const p = pieces[id];
  if (!p || p.removed) return;
  p.tex = tex;
  const img = p.el.querySelector('pattern[id="tex-' + id + '"] image');
  if (img) img.setAttribute('href', TEXTURES[tex]);
  const ptn = p.el.querySelector('pattern[id="tex-' + id + '"]');
  if (ptn) ptn.setAttribute('patternTransform', 'scale(' + (p.texScale / 100) + ')');
}

/* ═══════════ 拖拽：解构 → 跟随 → 重组 ═══════════ */
let dragState = null;

function onPointerDown(e) {
  const pc = e.target.closest('.piece');
  if (!pc) return;
  const id = pc.dataset.piece;
  const p = pieces[id];
  if (!p || p.removed) return;
  e.preventDefault();
  hideHint();
  selectPiece(id);
  const r = stage.getBoundingClientRect();
  const cx = e.clientX - r.left, cy = e.clientY - r.top;
  dragState = { id, startX: cx, startY: cy, mode: 'none', trailAcc: 0 };
  stage.setPointerCapture(e.pointerId);
  gsap.to(pc, { scale: effScale(id) * 1.05, duration: 0.25, ease: 'scrapOut', overwrite: 'auto' });
  if (reduceMotion) return;   // 降级：纸片整体拖动
  setTimeout(() => {
    if (!dragState || dragState.id !== id) return;
    if (dragState.mode === 'none' && Math.hypot(dragState.startX - cx, dragState.startY - cy) < 6) {
      dragState.mode = 'cloud';
      engine.leader.x = cx; engine.leader.y = cy;
      engine.cloudScale = 1;
      deconstructToCloud(id, cx, cy);
    }
  }, 90);
}

const crumbAcc = { x: 0, y: 0 };
function maybeCrumb(e) {
  if (reduceMotion) return;
  const r = stage.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const d = Math.hypot(mx - crumbAcc.x, my - crumbAcc.y);
  crumbAcc.x = mx; crumbAcc.y = my;
  if (d < 26) return;
  spawnScrap({
    x: mx, y: my,
    vx: rand(-0.4, 0.4), vy: rand(-0.3, 0.5),
    rot: rand(0, 6.28), vrot: rand(-0.2, 0.2),
    size: rand(2, 4.5), color: pick(['#D68A55', '#F0C75E', '#B9A4C6', '#7A8B5C']),
    mode: 'free', gravity: 0.08, bounce: 0.3, life: rand(18, 30), maxLife: 30,
    alpha: rand(0.14, 0.28),
  });
}

function onPointerMove(e) {
  if (!dragState) { maybeCrumb(e); return; }
  const r = stage.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  dragState.startX = mx; dragState.startY = my;
  if (dragState.mode !== 'cloud') return;
  engine.leader.x = mx; engine.leader.y = my;
  engine.cloudScale += (0.82 - engine.cloudScale) * 0.15;
  dragState.trailAcc++;
  if (dragState.trailAcc % 3 === 0) {   // 拖动时甩出纸屑
    spawnScrap({
      x: mx + rand(-40, 40), y: my + rand(-30, 30),
      vx: rand(-1.4, -0.2), vy: rand(-1.2, 0.6),
      rot: rand(0, 6.28), vrot: rand(-0.3, 0.3),
      size: rand(2.5, 6), color: pick(colorSet(pieces[dragState.id].color)),
      mode: 'free', gravity: 0.16, bounce: 0.4, life: rand(26, 48), maxLife: 48, alpha: 0.85,
    });
  }
}

function onPointerUp(e) {
  if (!dragState) return;
  const r = stage.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const { id } = dragState;
  dragState = null;
  if (reduceMotion) { placePiece(id); applyPieceStyle(id, true); return; }
  if (engine.particles.some(q => q.pieceId === id && q.mode === 'follow')) {
    recomposeFromCloud(mx, my, id);
  } else {
    pulsePiece(id);   // 原地「拆开又拼回」的呼吸
  }
}

function pulsePiece(id) {
  if (reduceMotion || pieces[id].removed) return;
  const c = getCenter(id);
  deconstructToCloud(id, c.x, c.y);
  setTimeout(() => { if (!pieces[id].removed) recomposeFromCloud(c.x + rand(-8, 8), c.y + 6, id); }, 340);
}

/* ═══════════ 图层重排：风掀翻面 ═══════════ */
const layerList = $('#layerList');

function syncZOrder() {
  let z = 18;
  for (const li of $$('.layer', layerList)) {
    const id = li.dataset.layer;
    if (id === 'base') continue;
    if (pieces[id] && !pieces[id].removed) pieces[id].el.style.zIndex = z--;
  }
}

function flipPiece(id) {
  const p = pieces[id];
  if (!p || p.removed) return;
  const el = p.el;
  const c = getCenter(id);
  const eff = effScale(id);
  gsap.timeline({ defaults: { overwrite: 'auto' } })
    .to(el, { yPercent: -16, rotation: p.rotation + rand(-5, 5), scale: eff * 1.06, duration: 0.3, ease: 'scrapOut' }, 0)
    .to(el, { scaleX: 0.14, duration: 0.16, ease: 'scrapIn', onStart: () => spawnBurst(c.x, c.y, colorSet(p.color), 7, 2.4, { small: true }) }, '+=0.02')
    .to(el, { scaleX: eff, yPercent: 0, rotation: p.rotation, scale: eff, duration: 0.5, ease: 'scrapBounce' }, '+=0.04');
  spawnDust(c.x, c.y, colorSet(p.color), 5);
}

let layerDrag = null;
function reorderLayerItems(aId, bId) {
  if (dragState) return;
  const a = layerList.querySelector('[data-layer="' + aId + '"]');
  const b = layerList.querySelector('[data-layer="' + bId + '"]');
  if (!a || !b) return;
  const pa = a.parentNode;
  if (a.nextElementSibling === b) pa.insertBefore(b, a);
  else pa.insertBefore(b, a.nextElementSibling);
  syncZOrder();
  flipPiece(aId);
}

layerList.addEventListener('pointerdown', (e) => {
  const li = e.target.closest('.layer');
  if (!li || li.classList.contains('is-locked')) return;
  layerDrag = { li, started: false };
  layerList.setPointerCapture(e.pointerId);
  e.preventDefault();
});
layerList.addEventListener('pointermove', (e) => {
  if (!layerDrag) return;
  const items = $$('.layer', layerList);
  const from = items.indexOf(layerDrag.li);
  let to = from;
  for (let i = 0; i < items.length; i++) {
    if (items[i] === layerDrag.li || items[i].classList.contains('is-locked')) continue;
    const r = items[i].getBoundingClientRect();
    if (e.clientY > r.top + r.height / 2) to = i;
  }
  if (to !== from) {
    layerDrag.started = true;
    layerDrag.li.classList.add('dragging');
    if (to > from) layerDrag.li.parentNode.insertBefore(layerDrag.li, items[to].nextElementSibling);
    else layerDrag.li.parentNode.insertBefore(layerDrag.li, items[to]);
    syncZOrder();
    const over = items[to];
    if (over) { over.classList.add('drag-over'); setTimeout(() => over.classList.remove('drag-over'), 140); }
  }
});
function endLayerDrag() {
  if (!layerDrag) return;
  const li = layerDrag.li;
  const moved = layerDrag.started;
  li.classList.remove('dragging');
  layerDrag = null;
  const id = li.dataset.layer;
  if (moved) { selectPiece(id); flipPiece(id); }
  else { selectPiece(id); pulsePiece(id); }
}
layerList.addEventListener('pointerup', endLayerDrag);
layerList.addEventListener('pointercancel', endLayerDrag);

/* —— 图层悬停：画布对应纸片被轻轻掀起 —— */
layerList.addEventListener('pointerover', (e) => {
  if (layerDrag) return;
  const li = e.target.closest('.layer');
  if (!li || li.classList.contains('is-locked')) return;
  const p = pieces[li.dataset.layer];
  if (!p || p.removed) return;
  gsap.to(p.el, { yPercent: -5, duration: 0.32, ease: 'scrapOut', overwrite: 'auto' });
});
layerList.addEventListener('pointerout', (e) => {
  const li = e.target.closest('.layer');
  if (!li || li.classList.contains('is-locked')) return;
  const p = pieces[li.dataset.layer];
  if (!p || p.removed) return;
  gsap.to(p.el, { yPercent: 0, duration: 0.5, ease: 'scrapBounce', overwrite: 'auto' });
});

/* ═══════════ 演示时间线 ═══════════ */
let demoRunning = false;
function runDemo() {
  if (demoRunning || reduceMotion || dragState) return;
  if (pieces.maple.removed) return;
  demoRunning = true;
  hideHint();
  const btn = $('#btnDemo');
  btn.classList.add('is-busy');
  const c0 = getCenter('maple');
  const ld = { x: c0.x, y: c0.y };
  engine.leader = ld;
  const dx = stageW * 0.3, dy = stageH * 0.06;
  const tl = gsap.timeline({
    onComplete: () => { demoRunning = false; btn.classList.remove('is-busy'); },
  });
  tl.call(() => selectPiece('maple'))
    .call(() => deconstructToCloud('maple', c0.x, c0.y), null, 0.06)
    .to(ld, { x: c0.x + dx, y: c0.y + dy, duration: 1.2, ease: 'wind' }, 0.18)
    .call(() => recomposeFromCloud(c0.x + dx, c0.y + dy, 'maple'), null, 1.5)
    .call(() => reorderLayerItems('bird', 'moon'), null, 2.15)
    .call(() => spawnSprinkle(stageW / 2, 46, ['#F0C75E', '#D68A55', '#B9A4C6', '#7A8B5C']), null, 2.75)
    .to('#btnDemo', { opacity: 1, duration: 0.2 }, 3.3);
  gsap.to('#btnDemo', { opacity: 0.65, duration: 0.2 });
}

/* ═══════════ 属性面板 ═══════════ */
function bindProps() {
  const size = $('#propSize'), rot = $('#propRot'), op = $('#propOp'), tex = $('#propTex');
  size.addEventListener('input', () => {
    const p = pieces[selId]; if (!p) return;
    p.scale = size.value / 100;
    $('#propSizeVal').textContent = size.value + '%';
    gsap.to(p.el, { scale: effScale(selId), duration: 0.28, ease: 'scrapOut', overwrite: 'auto' });
  });
  rot.addEventListener('input', () => {
    const p = pieces[selId]; if (!p) return;
    p.rotation = +rot.value;
    $('#propRotVal').textContent = (rot.value > 0 ? '+' : '−') + Math.abs(rot.value) + '°';
    gsap.to(p.el, { rotation: p.rotation, duration: 0.28, ease: 'scrapOut', overwrite: 'auto' });
  });
  op.addEventListener('input', () => {
    const p = pieces[selId]; if (!p) return;
    p.opacity = op.value / 100;
    $('#propOpVal').textContent = op.value + '%';
    gsap.to(p.el, { opacity: p.opacity, duration: 0.2, ease: 'scrapOut' });
  });
  tex.addEventListener('input', () => {
    const p = pieces[selId]; if (!p) return;
    p.texScale = +tex.value;
    $('#propTexVal').textContent = tex.value + '%';
    const ptn = p.el.querySelector('pattern[id="tex-' + selId + '"]');
    if (ptn) ptn.setAttribute('patternTransform', 'scale(' + (tex.value / 100) + ')');
  });
  $('#propStroke').addEventListener('change', (e) => {
    const p = pieces[selId]; if (!p) return;
    p.stroke = e.target.checked;
    p.el.classList.toggle('is-stroked', p.stroke);
  });

  $$('.swatch').forEach(s => s.addEventListener('click', () => setColor(selId, s.dataset.color)));
  $$('.tex-card').forEach(t => t.addEventListener('click', () => {
    $$('.tex-card').forEach(c => c.classList.toggle('is-on', c === t));
    setTexture(selId, t.dataset.tex);
  }));
  $('#btnDelete').addEventListener('click', () => removePiece(selId));
}

function removePiece(id) {
  const p = pieces[id];
  if (!p || p.removed || id === 'base') return;
  p.removed = true;
  const c = getCenter(id);
  spawnBurst(c.x, c.y, colorSet(p.color), 30, 4.6);
  spawnDust(c.x, c.y, colorSet(p.color), 8);
  gsap.to(p.el, { opacity: 0, scale: 0.4, duration: 0.4, ease: 'scrapIn', onComplete: () => p.el.remove() });
  const li = layerList.querySelector('[data-layer="' + id + '"]');
  if (li) gsap.to(li, { opacity: 0, x: -14, duration: 0.35, ease: 'scrapIn', onComplete: () => li.remove() });
  const next = Object.keys(pieces).find(k => !pieces[k].removed);
  selectPiece(next || 'maple');
}

/* ═══════════ 顶栏 ═══════════ */
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  gsap.fromTo(t, { opacity: 0, y: 10, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'scrapOut' });
  setTimeout(() => gsap.to(t, { opacity: 0, y: -8, duration: 0.3, ease: 'scrapIn', onComplete: () => t.remove() }), 1500);
}

function bindTopbar() {
  const c = getCenter(selId);
  $('#btnDemo').addEventListener('click', runDemo);
  $('#btnUndo').addEventListener('click', () => {
    toast('撤销一步 · 纸屑回位');
    spawnDust(c.x, c.y, ['#5A4634', '#D68A55'], 6);
  });
  $('#btnRedo').addEventListener('click', () => { toast('重做一步'); spawnDust(c.x, c.y, ['#5A4634', '#B9A4C6'], 5); });
  const flash = (btn, label) => {
    const old = btn.innerHTML;
    btn.innerHTML = '✓ ' + label;
    setTimeout(() => { btn.innerHTML = old; }, 1400);
  };
  $('#btnExportPng').addEventListener('click', () => flash($('#btnExportPng'), '已导出'));
  $('#btnExportSvg').addEventListener('click', () => {
    flash($('#btnExportSvg'), '已导出');
    spawnSprinkle(stageW / 2, 30, ['#D68A55', '#F0C75E', '#7A8B5C']);
  });
  $('#btnNewScrap').addEventListener('click', () => {
    toast('新纸片入夹 · 拖到画布上');
    spawnDust(stageW / 2, stageH / 2, ['#F0C75E', '#B9A4C6', '#D68A55'], 10);
  });
  // 彩蛋：双击品牌名，撒一把金纸屑
  $('.brand-name').addEventListener('dblclick', () => {
    if (reduceMotion) return;
    spawnSprinkle(stageW / 2, 26, ['#F0C75E', '#D68A55', '#B9A4C6', '#7A8B5C']);
    toast('纸屑洒了满地 ✂');
  });
  const zoomVal = $('#zoomVal');
  const setZoom = (f) => {
    zoomF = clamp(f, 0.6, 1.6);
    zoomVal.textContent = Math.round(zoomF * 100) + '%';
    Object.keys(pieces).forEach(id => { if (!pieces[id].removed) applyPieceStyle(id, true); });
  };
  $('#zoomIn').addEventListener('click', () => setZoom(zoomF + 0.1));
  $('#zoomOut').addEventListener('click', () => setZoom(zoomF - 0.1));
  $('#zoomFit').addEventListener('click', () => setZoom(1));
}

function hideHint() {
  const h = $('#hintChip');
  if (h) h.classList.add('is-hide');
}

/* ═══════════ 键盘操作 ═══════════ */
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, button, select, textarea')) return;
  const p = pieces[selId];
  if (!p || p.removed) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { removePiece(selId); return; }
  const step = 12;
  const c = getCenter(selId);
  let dx = 0, dy = 0;
  if (e.key === 'ArrowLeft') dx = -step;
  else if (e.key === 'ArrowRight') dx = step;
  else if (e.key === 'ArrowUp') dy = -step;
  else if (e.key === 'ArrowDown') dy = step;
  else if (e.key === ' ') { e.preventDefault(); runDemo(); return; }
  if (dx || dy) {
    e.preventDefault();
    p.pctX = clamp((c.x + dx) / stageW, 0.05, 0.95);
    p.pctY = clamp((c.y + dy) / stageH, 0.08, 0.9);
    placePiece(selId);
    spawnDust(c.x + dx, c.y + dy, colorSet(p.color), 2);
  }
});

/* ═══════════ 初始化 ═══════════ */
function init() {
  // 1. 纹理
  TEXTURES.wrinkle = makeWrinkle(7);
  TEXTURES.watercolor = makeWatercolor(31);
  TEXTURES.corrugate = makeCorrugate(13);
  TEXTURES.glitter = makeGlitter(59);
  $$('.tex-thumb').forEach(th => {
    th.style.setProperty('--thumb', 'url(' + TEXTURES[th.dataset.texThumb] + ')');
  });
  // 2. 画布尺寸 + 纸片定位
  sizeStage();
  Object.keys(pieces).forEach(id => {
    const el = $('#piece-' + id);
    pieces[id].el = el;
    setTexture(id, pieces[id].tex);
    placePiece(id);
    applyPieceStyle(id);
    el.addEventListener('pointerdown', onPointerDown);
  });
  syncZOrder();
  // 3. 画布纸纹背景
  stage.style.setProperty('--stage-bg', 'url(' + makeStageTexture() + ')');
  // 4. 事件
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);
  bindProps();
  bindTopbar();
  // 5. 粒子循环
  initAmbient();
  requestAnimationFrame(tick);
  // 6. 演示
  if (!reduceMotion) setTimeout(runDemo, 2000);
  // 7. 自适应
  window.addEventListener('resize', () => {
    sizeStage();
    Object.keys(pieces).forEach(id => { if (!pieces[id].removed) placePiece(id); });
  });
}

init();
