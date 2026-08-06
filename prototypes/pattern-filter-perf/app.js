/* Fabric v7 pattern+filter 渲染开销验证 — 一次性代码，不用于生产 */
/* 验证目标：每片纸片一个 pattern fill（着色预合成）+ patternTransform 缩放，
   合成到单 canvas，几十片（50）场景下的渲染开销。
   对比：方案 A（每片 Path + pattern fill）vs 方案 B（预合成纸片外观 → Image 位图）。
   测量：冷启动首帧、拖动单片每帧重建缓存（真实交互上界）、
   拖动全片每帧重建缓存（极端压力，放大 pattern vs 位图差异）、视口平移（composite）。 */

const canvas = document.getElementById('c');
const fc = new fabric.Canvas(canvas, { selection: false });

const COUNT = 50;
const SCENE_W = 2400;
const SCENE_H = 1800;
const TEX = 256;          // 纹理瓦片尺寸
const RENDER_FRAMES = 300; // 每项测量的渲染帧数
const FRAME_BUDGET = 1000 / 60; // 16.7ms 掉帧线

/* ---------- 工具 ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function polyToSvg(pts) {
  return 'M ' + pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L ') + ' Z';
}

/* 手撕纸片：花瓣状扰动闭合多边形（局部坐标，中心 0,0） */
function makePaper(rng, R) {
  const n = 48, pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = R * (1 + 0.20 * Math.sin(5 * t) + 0.09 * Math.sin(13 * t) + (rng() - 0.5) * 0.16);
    pts.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  return polyToSvg(pts);
}

/* 纸纹纹理：基色 + 纤维噪点 */
function makeTexture(rng, hue) {
  const c = document.createElement('canvas');
  c.width = TEX; c.height = TEX;
  const ctx = c.getContext('2d');
  ctx.fillStyle = `hsl(${hue}, 38%, 62%)`;
  ctx.fillRect(0, 0, TEX, TEX);
  for (let i = 0; i < 4200; i++) {
    const x = rng() * TEX, y = rng() * TEX;
    const a = 0.03 + rng() * 0.14;
    ctx.fillStyle = rng() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
  }
  return c;
}

/* SVG 路径 bbox（格式固定：M x y L x y ... Z） */
function pathBounds(svg) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  svg.match(/[-\d.]+ [-\d.]+/g).forEach((m) => {
    const [x, y] = m.split(' ').map(Number);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  });
  return { minX, minY, w: maxX - minX, h: maxY - minY };
}

/* ---------- 布局（50 片：5×10 网格 + 扰动，避免全叠） ---------- */
function makeLayout(rng) {
  const layout = [];
  for (let i = 0; i < COUNT; i++) {
    const col = i % 10, row = Math.floor(i / 10);
    layout.push({
      x: (SCENE_W / 10) * (col + 0.5) + (rng() - 0.5) * 90,
      y: (SCENE_H / 5) * (row + 0.5) + (rng() - 0.5) * 90,
      R: 70 + rng() * 80,
      rot: rng() * 360,
      texScale: 0.8 + rng() * 1.4,
    });
  }
  return layout;
}

/* ---------- 方案 A：每片 Path + pattern fill ---------- */
function buildA(rng, tex, layout) {
  const objects = [];
  for (let i = 0; i < layout.length; i++) {
    const { x, y, R, rot, texScale } = layout[i];
    const pattern = new fabric.Pattern({ source: tex, repeat: 'repeat' });
    pattern.patternTransform = [texScale, 0, 0, texScale, 0, 0]; // 纹理缩放
    objects.push(new fabric.Path(makePaper(rng, R), {
      fill: pattern,
      left: x, top: y, angle: rot,
      objectCaching: true,
      selectable: false, evented: false,
    }));
  }
  return objects;
}

/* ---------- 方案 B：预合成纸片外观 → Image 位图 ---------- */
function bakePaper(svg, tex, texScale) {
  const b = pathBounds(svg);
  const off = document.createElement('canvas');
  off.width = Math.ceil(b.w);
  off.height = Math.ceil(b.h);
  const ctx = off.getContext('2d');
  ctx.save();
  ctx.translate(-b.minX, -b.minY);
  ctx.beginPath(new Path2D(svg));
  ctx.clip();
  const step = TEX * texScale; // 瓦片放大 texScale 倍，等价 fabric patternTransform
  for (let yy = Math.floor(b.minY / step) * step; yy < b.minY + b.h; yy += step)
    for (let xx = Math.floor(b.minX / step) * step; xx < b.minX + b.w; xx += step)
      ctx.drawImage(tex, xx, yy, step, step);
  ctx.restore();
  return off;
}

function buildB(rng, tex, layout) {
  const objects = [];
  for (let i = 0; i < layout.length; i++) {
    const { x, y, R, rot, texScale } = layout[i];
    const baked = bakePaper(makePaper(rng, R), tex, texScale);
    const img = new fabric.Image(baked, {
      left: x, top: y, angle: rot,
      objectCaching: true,
      selectable: false, evented: false,
    });
    img.setCoords();
    objects.push(img);
  }
  return objects;
}

/* ---------- 测量 ---------- */
function stats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const worst = sorted[sorted.length - 1];
  return {
    avg, p95, worst,
    dropRate: times.filter((v) => v > FRAME_BUDGET).length / times.length,
    fps: 1000 / avg,
  };
}

function fmt(ms) { return ms.toFixed(2); }
function cls(v) { return v <= 16.7 ? 'good' : v <= 33.3 ? 'warn' : 'bad'; }

/* 拖动单片：连续移动中间一片，setCoords + 强制重建缓存（真实交互上界：被拖动的 pattern 每帧重填） */
function measureDragOne() {
  const objs = fc.getObjects();
  const obj = objs[Math.floor(objs.length / 2)];
  const baseX = obj.left, baseY = obj.top;
  const times = [];
  for (let i = 0; i < RENDER_FRAMES; i++) {
    const t = (i / RENDER_FRAMES) * Math.PI * 2;
    obj.set({ left: baseX + Math.sin(t * 4) * 140, top: baseY + Math.cos(t * 3) * 90 });
    obj.setCoords();
    obj.dirty = true;
    const t0 = performance.now();
    fc.renderAll();
    times.push(performance.now() - t0);
  }
  return stats(times);
}

/* 拖动全片：全部 50 片每帧移动 + 强制重建缓存（极端压力，放大 pattern vs 位图差异） */
function measureDragAll() {
  const objs = fc.getObjects();
  const bases = objs.map((o) => ({ x: o.left, y: o.top }));
  const times = [];
  for (let i = 0; i < RENDER_FRAMES; i++) {
    const t = (i / RENDER_FRAMES) * Math.PI * 2;
    for (let k = 0; k < objs.length; k++) {
      objs[k].set({
        left: bases[k].x + Math.sin(t * 2 + k * 0.7) * 40,
        top: bases[k].y + Math.cos(t * 2 + k * 0.7) * 40,
      });
      objs[k].setCoords();
      objs[k].dirty = true;
    }
    const t0 = performance.now();
    fc.renderAll();
    times.push(performance.now() - t0);
  }
  return stats(times);
}

/* 视口平移：连续平移画布（复用缓存 composite，不重建） */
function measurePan() {
  const vp = fc.viewportTransform.slice();
  const times = [];
  for (let i = 0; i < RENDER_FRAMES; i++) {
    const t = (i / RENDER_FRAMES) * Math.PI * 2;
    const p = vp.slice();
    p[4] += Math.sin(t * 4) * 120;
    p[5] += Math.cos(t * 3) * 80;
    fc.viewportTransform = p;
    const t0 = performance.now();
    fc.renderAll();
    times.push(performance.now() - t0);
  }
  return stats(times);
}

function runScene(rng, tex, build, label) {
  fc.clear();
  const layout = makeLayout(rng);
  const t0 = performance.now();
  const objs = build(rng, tex, layout);
  objs.forEach((o) => fc.add(o));
  const tBuild = performance.now() - t0;

  fc.viewportTransform = [0.45, 0, 0, 0.45, 0, 0];
  const t1 = performance.now();
  fc.renderAll(); // 冷启动：全部 cache 生成
  const tFirst = performance.now() - t1;

  const dragOne = measureDragOne();
  const dragAll = measureDragAll();
  const pan = measurePan();
  return { label, tBuild, tFirst, dragOne, dragAll, pan };
}

/* ---------- 渲染 ---------- */
function renderTable(rows) {
  const tbody = document.querySelector('#tbl tbody');
  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td style="text-align:left">${r.label}</td>
      <td class="num">${fmt(r.tBuild)}</td>
      <td class="num ${cls(r.tFirst)}">${fmt(r.tFirst)}</td>
      <td class="num ${cls(r.dragOne.avg)}">${fmt(r.dragOne.avg)}</td>
      <td class="num ${cls(r.dragOne.p95)}">${fmt(r.dragOne.p95)}</td>
      <td class="num ${cls(r.dragAll.avg)}">${fmt(r.dragAll.avg)}</td>
      <td class="num ${cls(r.dragAll.p95)}">${fmt(r.dragAll.p95)}</td>
      <td class="num ${cls(r.pan.avg)}">${fmt(r.pan.avg)}</td>
      <td class="num">${r.dragAll.fps.toFixed(0)}</td>
    </tr>`).join('');
}

function renderVerdicts(rows) {
  const el = document.getElementById('verdicts');
  const [A, B] = rows;
  const v = (name, a, b) => {
    const diff = a / b;
    const tag = a <= 16.7 ? `<span class="good">OK ≤16.7ms</span>` : a <= 33.3 ? `<span class="warn">中 ≥30fps</span>` : `<span class="bad">重 <30fps</span>`;
    const better = a < b ? 'B（预合成）快' : 'A（pattern）快';
    return `<p><b>${name}</b> A=${fmt(a)}ms · B=${fmt(b)}ms · A/B=${diff.toFixed(2)}× · A: ${tag} · ${better}</p>`;
  };
  el.innerHTML =
    v('冷启动首帧（一次性）', A.tFirst, B.tFirst) +
    v('拖动单片·每帧重建缓存 avg', A.dragOne.avg, B.dragOne.avg) +
    v('拖动全片·每帧重建缓存 avg（极端压力）', A.dragAll.avg, B.dragAll.avg) +
    v('视口平移 avg（composite）', A.pan.avg, B.pan.avg) +
    `<p><b>结论</b> 50 片下方案 A 最重路径（拖动单片/全片强制重建）${A.dragAll.avg <= 16.7 ? '均 ≤16.7ms，维持 60fps，风险解除' : '超 16.7ms，需预合成缓解'}；方案 B ${B.dragAll.avg <= 16.7 ? '同样达标' : '未达标'}。预合成缓解（方案 B）作为备选路径成立。</p>`;
}

function main() {
  const rng = mulberry32(7);
  const tex = makeTexture(mulberry32(99), 22);
  const rows = [
    runScene(mulberry32(7), tex, buildA, 'A · Path + Pattern'),
    runScene(mulberry32(7), tex, buildB, 'B · 预合成 Image'),
  ];
  renderTable(rows);
  renderVerdicts(rows);
  document.getElementById('status').textContent =
    `完成 · 每方案 ${COUNT} 片 × ${RENDER_FRAMES} 帧 · 掉帧线 ${FRAME_BUDGET.toFixed(1)}ms`;
}

main();
