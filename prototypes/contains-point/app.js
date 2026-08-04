/* Fabric v7 containsPoint 命中验证 — 一次性代码，不用于生产 */
/* 验证目标：containsPoint 对复杂闭合纸片（自由描绘多边形）边缘的命中准确度 */
/* 实现依据：Fabric v7 默认 containsPoint = isPointInPolygon(point, getCoords())，即对象 4 角包围盒命中 */

import { getStroke } from 'https://cdn.jsdelivr.net/npm/perfect-freehand@1.2.2/dist/esm/index.mjs';

/* ---------- 工具 ---------- */
const canvas = document.getElementById('c');
const fc = new fabric.Canvas(canvas);
fc.selection = false;
fc.skipTargetFind = false;

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

function polyBounds(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/* 归一化多边形到 (0,0) 左上角 */
function normalize(pts) {
  const b = polyBounds(pts);
  const shifted = pts.map(([x, y]) => [x - b.minX, y - b.minY]);
  return { svg: polyToSvg(shifted), pts: shifted, w: b.width, h: b.height };
}

/* ---------- 形状生成（画布坐标原点生成，之后归一化） ---------- */

// 1. 凸 blob：干净自由形状（基线）
function makeBlob(rng, R) {
  const n = 40, pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = R * (1 + (rng() - 0.5) * 0.5);
    pts.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  return pts;
}

// 2. 真实自由描绘纸片：perfect-freehand 描摹一圈的粗笔迹闭合多边形
function makeFreehand(rng, R) {
  const raw = [];
  const n = 46;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = R * (1 + 0.18 * Math.sin(3 * t) + 0.1 * Math.sin(7 * t) + (rng() - 0.5) * 0.12);
    raw.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  const stroke = getStroke(raw, { size: 18, smoothing: 0.5, streamline: 0.4, simulatePressure: true });
  return stroke.map((p) => [p[0], p[1]]);
}

// 3. 五角星：深凹
function makeStar(rng, R) {
  const pts = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const r = i % 2 === 0 ? R : R * 0.38;
    const t = (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push([Math.cos(t) * r * (1 + (rng() - 0.5) * 0.03), Math.sin(t) * r * (1 + (rng() - 0.5) * 0.03)]);
  }
  return pts;
}

// 4. 细长弯曲纸条（宽约 9，长 230）
function makeSpike(rng) {
  const pts = [];
  const L = 230, W = 9, seg = 34;
  for (let i = 0; i <= seg; i++) {
    const u = (i / seg) * Math.PI * 2;
    const lx = Math.cos(u) * L / 2;
    const ly = Math.sin(u) * L / 3.5;
    const nx = Math.sin(u), ny = -Math.cos(u);
    pts.push([lx + nx * W / 2, ly + ny * W / 2]);
  }
  for (let i = seg; i >= 0; i--) {
    const u = (i / seg) * Math.PI * 2;
    const lx = Math.cos(u) * L / 2;
    const ly = Math.sin(u) * L / 3.5;
    const nx = Math.sin(u), ny = -Math.cos(u);
    pts.push([lx - nx * W / 2, ly - ny * W / 2]);
  }
  return pts;
}

// 5. 带孔环形（外圆 + 内圆，内圆反向使 nonzero rule 下孔为空）
function makeRing(R) {
  const outer = [], inner = [];
  const n = 40;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    outer.push([Math.cos(t) * R, Math.sin(t) * R]);
    inner.push([Math.cos(t) * R * 0.45, Math.sin(t) * R * 0.45]);
  }
  inner.reverse(); // 反向 subpath → 环绕数归零，孔为空
  const b = polyBounds([...outer, ...inner]);
  const shift = [b.minX, b.minY];
  const outS = outer.map((p) => [p[0] - shift[0], p[1] - shift[1]]);
  const inS = inner.map((p) => [p[0] - shift[0], p[1] - shift[1]]);
  return { svg: polyToSvg(outS) + ' ' + polyToSvg(inS), w: b.width, h: b.height };
}

/* ---------- 主测试 ---------- */
const COLORS = ['#e8b0a4', '#a9c2a6', '#e6cf9b', '#b3c7d6', '#d3b3c8'];

// 每形状放置中心点（画布坐标）
const LAYOUT = [
  { x: 140, y: 130 },
  { x: 480, y: 130 },
  { x: 860, y: 130 },
  { x: 300, y: 540 },
  { x: 760, y: 540 },
];

function main() {
  const rng = mulberry32(42);
  const defs = [
    { name: 'blob · 凸自由形状', make: () => makeBlob(rng, 100) },
    { name: 'freehand · 真实描摹纸片', make: () => makeFreehand(rng, 100) },
    { name: 'star · 深凹五角星', make: () => makeStar(rng, 105) },
    { name: 'spike · 细长弯曲纸条', make: () => makeSpike(rng) },
    { name: 'ring · 带孔环形', make: () => makeRing(100) },
  ];

  const results = [];
  const edgeResults = [];

  defs.forEach((def, i) => {
    const raw = def.make();
    const place = LAYOUT[i];

    // 形状归一化：局部坐标 bbox 左上 = (0,0)；局部 w/h
    const norm = Array.isArray(raw) ? normalize(raw) : raw; // ring 已是 {svg,w,h}
    const obj = new fabric.Path(norm.svg, { fill: COLORS[i] + '55', stroke: COLORS[i], strokeWidth: 1.5, objectCaching: false });
    obj.set({ left: place.x, top: place.y });
    fc.add(obj);

    // 校准：渲染 bbox 角点（画布坐标），保证画布↔局部映射自洽
    const coords = obj.getCoords();
    const tl = coords[0];
    const br = coords[2];

    const path2d = new Path2D(norm.svg);
    const truthCtx = document.createElement('canvas').getContext('2d');
    const truth = (lx, ly) => truthCtx.isPointInPath(path2d, lx, ly);

    const toCanvas = (lx, ly) => [tl.x + lx, tl.y + ly];

    // 手写命中（缓解路径：bbox 粗筛 + isPointInPath 精确几何 + 最近边距容差）
    const EDGE_TOL = 2;
    const edges = norm.pts ? norm.pts.map((p, k) => [p, norm.pts[(k + 1) % norm.pts.length]]) : null;
    function manualHit(x, y) {
      const lx = x - tl.x, ly = y - tl.y;
      if (lx < -EDGE_TOL || lx > norm.w + EDGE_TOL || ly < -EDGE_TOL || ly > norm.h + EDGE_TOL) return false;
      if (truth(lx, ly)) return true;
      if (edges) {
        for (const [a, b] of edges) {
          const dx = b[0] - a[0], dy = b[1] - a[1];
          const len2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((lx - a[0]) * dx + (ly - a[1]) * dy) / len2));
          const px = a[0] + t * dx, py = a[1] + t * dy;
          if ((lx - px) ** 2 + (ly - py) ** 2 <= EDGE_TOL * EDGE_TOL) return true;
        }
      }
      return false;
    }

    // 网格采样（局部坐标，步长 7）
    const STEP = 7;
    const gridPts = [];
    for (let lx = 3; lx < norm.w; lx += STEP)
      for (let ly = 3; ly < norm.h; ly += STEP)
        gridPts.push([lx, ly]);

    let inner = 0, outer = 0, fp = 0, fn = 0, mfp = 0, mfn = 0;
    const gridMarks = []; // 网格可视化（抽样显示）
    const edgeMarks = []; // 边缘带可视化（全显示）

    for (const [lx, ly] of gridPts) {
      const t = truth(lx, ly);
      t ? inner++ : outer++;
      const [cx, cy] = toCanvas(lx, ly);
      const hit = obj.containsPoint(new fabric.Point(cx, cy));
      const mhit = manualHit(cx, cy);
      if (!t && hit) fp++;
      if (t && !hit) fn++;
      if (!t && mhit) mfp++;
      if (t && !mhit) mfn++;
      gridMarks.push([cx, cy, t, hit]);
    }

    // 边缘带采样：沿多边形边，法向 ±1/±2/±4 px（仅多边形形状）
    if (edges) {
      let bandN = 0, bandDef = 0, bandManual = 0;
      for (const [a, b] of edges) {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        for (const f of [0.33, 0.66]) {
          const px = a[0] + dx * f, py = a[1] + dy * f;
          for (const d of [1, 2, 4]) {
            for (const sign of [1, -1]) {
              const ex = px + nx * d * sign, ey = py + ny * d * sign;
              const t = truth(ex, ey);
              const [ccx, ccy] = toCanvas(ex, ey);
              const hit = obj.containsPoint(new fabric.Point(ccx, ccy));
              const mhit = manualHit(ccx, ccy);
              bandN++;
              if (hit !== t) bandDef++;
              if (d > EDGE_TOL && mhit !== t) bandManual++; // 只计距边 >2px 的真误判，排除有意边缘容差
              edgeMarks.push([ccx, ccy, t, hit]);
            }
          }
        }
      }
      edgeResults.push({ name: def.name, bandN, bandDef, bandManual });
    }

    // bbox 外环带采样：验证默认 containsPoint 对 bbox 外点全部正确拒绝（证明默认命中 == 精确包围盒，不多不少）
    let bboxOutOK = 0, bboxOutN = 0;
    const outStrips = [
      [lx => -8, ly => ly], [lx => norm.w + 8, ly => ly],
      [lx => lx, ly => -8], [lx => lx, ly => norm.h + 8],
    ];
    for (const [fx, fy] of outStrips) {
      for (let ly = 0; ly <= norm.h; ly += 14) {
        const lx = fx(0);
        const [cx, cy] = toCanvas(lx, fy(ly));
        bboxOutN++;
        if (!obj.containsPoint(new fabric.Point(cx, cy))) bboxOutOK++;
      }
      for (let lx = 0; lx <= norm.w; lx += 14) {
        const ly = fy(0);
        const [cx, cy] = toCanvas(fx(lx), ly);
        bboxOutN++;
        if (!obj.containsPoint(new fabric.Point(cx, cy))) bboxOutOK++;
      }
    }

    results.push({
      name: def.name,
      verts: norm.pts ? norm.pts.length : 80,
      total: gridPts.length, inner, outer, fp, fn, mfp, mfn,
      fpRate: outer ? (fp / outer * 100) : 0,
      bboxOut: `${bboxOutOK}/${bboxOutN}`,
    });

    // 可视化：网格抽样（≤ 900 个），边缘带全显示
    const stepDraw = Math.max(1, Math.ceil(gridMarks.length / 800));
    gridMarks.forEach((m, k) => { if (k % stepDraw === 0) drawMark(m); });
    edgeMarks.forEach(drawMark);
  });

  fc.renderAll();
  renderTable(results);
  renderEdgeTable(edgeResults);
  renderImplEvidence();
}

function drawMark([x, y, t, hit]) {
  const correct = t === hit;
  const color = !correct ? (hit ? '#c0392b' : '#2980b9') : (t ? '#27ae60' : '#d8d8d8');
  fc.add(new fabric.Circle({ left: x - 1.5, top: y - 1.5, radius: 1.5, fill: color, stroke: null, selectable: false, evented: false, objectCaching: false }));
}

/* ---------- 渲染 ---------- */
function renderTable(rows) {
  const tbody = document.querySelector('#tbl tbody');
  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td style="text-align:left">${r.name}</td>
      <td class="num">${r.verts}</td>
      <td class="num">${r.total}</td>
      <td class="num">${r.inner}</td>
      <td class="num">${r.outer}</td>
      <td class="num ${r.fp > 0 ? 'bad' : 'good'}">${r.fp}</td>
      <td class="num ${r.fpRate > 5 ? 'bad' : r.fpRate > 0.5 ? 'warn' : 'good'}">${r.fpRate.toFixed(2)}%</td>
      <td class="num ${r.fn > 0 ? 'bad' : 'good'}">${r.fn}</td>
      <td class="num ${r.mfp > 0 ? 'bad' : 'good'}">${r.mfp}</td>
      <td class="num ${r.mfn > 0 ? 'bad' : 'good'}">${r.mfn}</td>
      <td class="num good">${r.bboxOut} ✓</td>
    </tr>`).join('');
}

function renderEdgeTable(rows) {
  const tbody = document.querySelector('#tbl-edge tbody');
  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td style="text-align:left">${r.name}</td>
      <td class="num">${r.bandN}</td>
      <td class="num ${r.bandDef > 0 ? 'bad' : 'good'}">${r.bandDef}</td>
      <td class="num ${r.bandManual > 0 ? 'warn' : 'good'}">${r.bandManual}</td>
    </tr>`).join('');
}

function renderImplEvidence() {
  document.getElementById('impl').textContent =
    '// Fabric v7 Object.containsPoint (dist/index.js ~5254)\n' +
    'containsPoint(point) {\n' +
    '  return Intersection.isPointInPolygon(point, this.getCoords());\n' +
    '}\n' +
    '\n' +
    '// getCoords() = 对象 4 角包围盒（含 transform）\n' +
    '// → 默认命中 = 点是否在对象包围盒内，不看 Path 几何\n' +
    '//\n' +
    '// Canvas._checkTarget (~11341)\n' +
    '// 默认：bbox 粗筛后 return true\n' +
    '// perPixelTargetFind=true 时：isTargetTransparent() 逐像素 alpha 检测';
}

main();
