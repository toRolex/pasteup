/* ==========================================================================
   纸间桌面 PAPER DESK — 交互脚本
   三维纸桌：木桌 + 有厚度的纸片 + 真实光照投影 + 拖动拼贴
   Three.js r160 · gsap 3.12 · CustomEase
   ========================================================================== */
'use strict';

(() => {
  /* ---------- 1. 能力检测 ---------- */
  const sceneEl = document.getElementById('scene');
  const fallbackEl = document.querySelector('.webgl-fallback');
  let hasWebGL = false;
  try {
    const probe = document.createElement('canvas');
    hasWebGL = !!(window.WebGLRenderingContext && (probe.getContext('webgl2') || probe.getContext('webgl')));
  } catch (e) { hasWebGL = false; }

  if (!hasWebGL || typeof THREE === 'undefined' || typeof gsap === 'undefined') {
    if (fallbackEl) fallbackEl.hidden = false;
    if (sceneEl) sceneEl.style.display = 'none';
    console.warn('3D 纸桌不可用：无 WebGL 或依赖未加载。');
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 2. gsap 自定义缓动（禁裸 linear） ---------- */
  gsap.registerPlugin(CustomEase);
  // paperSettle：纸片落桌带轻微过冲，像真纸落地
  CustomEase.create('paperSettle', 'M0,0 C0.22,0.62 0.42,1.08 1,1');
  // paperLift：纸片被拿起，快而略有过冲
  CustomEase.create('paperLift', 'M0,0 C0.18,1.06 0.5,1.04 1,1');
  // woodGlide：相机缓动
  CustomEase.create('woodGlide', 'M0,0 C0.22,0.86 0.45,1 1,1');

  /* ---------- 3. 画布纹理生成（canvas 程序纹理，非 CSS 渐变） ---------- */

  // 细纤维噪点 —— 用在纸面与木纹上
  function fibers(ctx, w, h, opts = {}) {
    const density = opts.density ?? 0.09;
    const dark = opts.dark ?? '90,70,52';
    const light = opts.light ?? '255,255,255';
    const count = Math.floor(w * h * density);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const useLight = Math.random() < 0.42;
      ctx.strokeStyle = useLight
        ? `rgba(${light},${0.03 + Math.random() * 0.05})`
        : `rgba(${dark},${0.04 + Math.random() * 0.07})`;
      ctx.lineWidth = 0.5 + Math.random() * 0.8;
      const a = Math.random() * Math.PI;
      const len = 3 + Math.random() * 9;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
  }

  // 颗粒噪点
  function speckles(ctx, w, h, opts = {}) {
    const count = Math.floor(w * h * (opts.density ?? 0.5));
    const dark = opts.dark ?? '70,52,36';
    for (let i = 0; i < count; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 0.4 + Math.random() * 1.1;
      ctx.fillStyle = `rgba(${dark},${0.05 + Math.random() * 0.12})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 水彩晕染斑
  function washBlots(ctx, w, h) {
    const blots = 34;
    for (let i = 0; i < blots; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 8 + Math.random() * 34;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const edge = Math.random() < 0.5 ? '90,70,52' : '214,138,85';
      g.addColorStop(0, `rgba(${edge},${0.1 + Math.random() * 0.14})`);
      g.addColorStop(1, `rgba(${edge},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 亚麻交织纹
  function linenWeave(ctx, w, h) {
    ctx.lineWidth = 0.7;
    const gap = 6;
    for (let i = -h; i < w + h; i += gap) {
      ctx.strokeStyle = `rgba(90,70,52,${0.05 + Math.random() * 0.05})`;
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - h, h); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.06 + Math.random() * 0.06})`;
      ctx.beginPath(); ctx.moveTo(i + gap / 2, 0); ctx.lineTo(i + gap / 2 - h, h); ctx.stroke();
    }
    for (let i = 0; i < w + h; i += gap) {
      ctx.strokeStyle = `rgba(90,70,52,${0.04 + Math.random() * 0.05})`;
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - h, h); ctx.stroke();
    }
  }

  // 纹理变体 → 粗糙度图（基色白 + 图案）
  const TEXTURE_VARIANTS = {
    plain:  (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); fibers(c, w, h, { density: 0.05 }); },
    grain:  (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); fibers(c, w, h, { density: 0.04 }); speckles(c, w, h, { density: 0.9 }); },
    fiber:  (c, w, h) => {
      c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 150; i++) {
        const y = Math.random() * h;
        c.strokeStyle = Math.random() < 0.55 ? 'rgba(90,70,52,0.05)' : 'rgba(255,255,255,0.07)';
        c.lineWidth = 0.6;
        c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + (Math.random() - 0.5) * 8); c.stroke();
      }
    },
    wash:   (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); washBlots(c, w, h); fibers(c, w, h, { density: 0.03 }); },
    linen:  (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); linenWeave(c, w, h); },
  };

  const textureCache = {};
  function makeRoughnessTexture(variant) {
    if (textureCache[variant]) return textureCache[variant];
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    TEXTURE_VARIANTS[variant](g, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    t.anisotropy = 4;
    textureCache[variant] = t;
    return t;
  }

  // 纸面彩纹（map 用）
  function makePaperColorTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    fibers(g, 256, 256, { density: 0.06 });
    washBlots(g, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1.6, 1.6);
    t.anisotropy = 4;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // 木桌纹理
  function makeWoodTexture() {
    const w = 512, h = 512;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#8C5A2E';
    g.fillRect(0, 0, w, h);
    // 木纹条
    for (let i = 0; i < 90; i++) {
      const y = Math.random() * h;
      const len = 140 + Math.random() * 360;
      const amp = 2 + Math.random() * 6;
      const dark = Math.random() < 0.55;
      g.strokeStyle = dark
        ? `rgba(66,38,15,${0.12 + Math.random() * 0.18})`
        : `rgba(255,215,165,${0.07 + Math.random() * 0.11})`;
      g.lineWidth = 1.2 + Math.random() * 2.6;
      const x0 = Math.random() * w;
      g.beginPath();
      for (let x = 0; x <= len; x += 8) {
        const yy = y + Math.sin((x + x0) * 0.02) * amp + Math.sin((x + x0) * 0.065) * 1.6;
        if (x === 0) g.moveTo(x + x0, yy); else g.lineTo(x + x0, yy);
      }
      g.stroke();
    }
    // 节点
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      g.strokeStyle = 'rgba(66,38,15,0.14)';
      g.lineWidth = 1.2;
      for (let r = 3; r < 12; r += 3) {
        g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0.4, 0, Math.PI * 2); g.stroke();
      }
    }
    fibers(g, w, h, { density: 0.03, dark: '60,36,16', light: '255,230,190' });
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 4);
    t.anisotropy = 8;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // 底图「山影」—— 描摹感照片示意图
  function makeSketchTexture() {
    const w = 512, h = 384;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    // 白色相纸边
    g.fillStyle = '#F6EBD5';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(90,70,52,0.18)';
    g.lineWidth = 2;
    g.strokeRect(10, 10, w - 20, h - 20);
    // 太阳
    g.fillStyle = 'rgba(214,138,85,0.9)';
    g.beginPath(); g.arc(w * 0.76, h * 0.24, w * 0.055, 0, Math.PI * 2); g.fill();
    // 远山
    g.fillStyle = 'rgba(90,70,52,0.32)';
    g.beginPath();
    g.moveTo(0, h * 0.78);
    g.lineTo(w * 0.18, h * 0.5);
    g.lineTo(w * 0.34, h * 0.64);
    g.lineTo(w * 0.52, h * 0.42);
    g.lineTo(w * 0.72, h * 0.62);
    g.lineTo(w * 0.9, h * 0.48);
    g.lineTo(w, h * 0.7);
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.closePath(); g.fill();
    // 近山（墨更深）
    g.fillStyle = 'rgba(90,70,52,0.52)';
    g.beginPath();
    g.moveTo(0, h * 0.92);
    g.lineTo(w * 0.28, h * 0.62);
    g.lineTo(w * 0.5, h * 0.78);
    g.lineTo(w * 0.74, h * 0.56);
    g.lineTo(w * 0.94, h * 0.78);
    g.lineTo(w, h * 0.74);
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.closePath(); g.fill();
    // 描摹虚线轮廓（核心叙事：描摹 → 纸片）
    g.setLineDash([8, 7]);
    g.strokeStyle = 'rgba(107,70,34,0.68)';
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(w * 0.12, h * 0.84);
    g.lineTo(w * 0.34, h * 0.58);
    g.lineTo(w * 0.46, h * 0.7);
    g.stroke();
    // 飞鸟
    g.setLineDash([]);
    g.strokeStyle = 'rgba(90,70,52,0.75)';
    g.lineWidth = 2.2;
    for (const [bx, by] of [[w * 0.3, h * 0.3], [w * 0.42, h * 0.25]]) {
      g.beginPath();
      g.moveTo(bx - 7, by); g.quadraticCurveTo(bx - 3, by - 5, bx, by - 1);
      g.quadraticCurveTo(bx + 3, by - 5, bx + 7, by);
      g.stroke();
    }
    fibers(g, w, h, { density: 0.03 });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  /* ---------- 4. 场景 ---------- */
  const TABLE_TOP = 0.17;
  const container = sceneEl;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#D9C49C');

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
  camera.position.set(0, 5.1, 8.8);
  camera.lookAt(0, 0.18, -0.4);

  // 光：暖环境 + 斜向主光（投有方向的真实阴影）
  const hemi = new THREE.HemisphereLight('#FFF1DA', '#8C5A2E', 0.8);
  scene.add(hemi);
  const key = new THREE.DirectionalLight('#FFF0D2', 2.1);
  key.position.set(6, 7, 1.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -7; key.shadow.camera.right = 7;
  key.shadow.camera.top = 7; key.shadow.camera.bottom = -7;
  key.shadow.camera.near = 1; key.shadow.camera.far = 22;
  key.shadow.radius = 4.5;
  key.shadow.intensity = 0.5; // 控制投影浓度，避免黑窟窿
  scene.add(key);
  key.target.position.set(0, 0.2, 0);
  scene.add(key.target);
  // 正面补光：点亮朝向相机的纸片侧边，让厚度可见
  const fill = new THREE.DirectionalLight('#FFE9C8', 0.55);
  fill.position.set(0, 2.5, 9);
  scene.add(fill);

  /* ---------- 5. 木桌 + 背景墙 ---------- */
  const woodTex = makeWoodTexture();
  const table = new THREE.Mesh(
    new THREE.BoxGeometry(30, 0.34, 20),
    new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.62, metalness: 0.02 })
  );
  table.position.y = 0; // 盒高 0.34，顶面落在 y=0.17 = TABLE_TOP
  table.receiveShadow = true;
  scene.add(table);

  // 暖光池：让桌面有"台灯下的纸桌"光感
  const spot = new THREE.SpotLight('#FFF1D6', 32, 11, 0.44, 0.55, 1.6);
  spot.position.set(0.5, 7.5, 1.0);
  spot.target.position.set(0.2, 0.17, 0.3);
  scene.add(spot);
  scene.add(spot.target);

  /* ---------- 6. 纸片 ---------- */
  const paperTexColor = makePaperColorTexture();
  const paperTexRough = makeRoughnessTexture('plain');

  function shapeFromPts(pts, samples = 64) {
    const curve = new THREE.SplineCurve(pts);
    const g = curve.getPoints(samples);
    const s = new THREE.Shape();
    s.moveTo(g[0].x, g[0].y);
    for (let i = 1; i < g.length; i++) s.lineTo(g[i].x, g[i].y);
    s.closePath();
    return s;
  }

  function makePaper(pts, opts) {
    const shape = shapeFromPts(pts);
    const depth = opts.depth ?? 0.09;
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSize: 0.006,
      bevelThickness: 0.008,
      bevelSegments: 2,
      curveSegments: 28,
    });
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();

    const base = new THREE.Color(opts.color);
    const frontMat = new THREE.MeshStandardMaterial({
      color: base,
      map: paperTexColor,
      roughnessMap: paperTexRough,
      roughness: 0.86,
      metalness: 0,
      bumpMap: paperTexRough,
      bumpScale: 1.0,
    });
    const sideMat = new THREE.MeshStandardMaterial({
      color: base.clone().multiplyScalar(0.45),
      roughness: 0.6,
      metalness: 0,
    });
    // 按 group 的 materialIndex 稳健分配：0→纸面，其余→纸边
    const idxs = geo.groups.map((g) => g.materialIndex);
    const matArr = [];
    for (let i = 0; i <= Math.max(0, ...idxs); i++) matArr.push(i === 0 ? frontMat : sideMat);
    const materials = matArr.length === 1 ? matArr[0] : matArr;

    const mesh = new THREE.Mesh(geo, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      kind: 'paper',
      depth,
      baseY: TABLE_TOP + depth / 2,
      defDepth: opts.depth,
      rotZ: opts.rotZ ?? 0,
      defRotZ: opts.rotZ ?? 0,
      scale: opts.scale ?? 1,
      color: opts.color,
      name: opts.name,
      defX: opts.x, defZ: opts.z,
      opacity: opts.opacity ?? 1,
    };
    mesh.position.set(opts.x, mesh.userData.baseY, opts.z);
    mesh.rotation.z = opts.rotZ ?? 0;
    mesh.scale.setScalar(opts.scale ?? 1);
    mesh.visible = opts.visible !== false;
    return mesh;
  }

  // 秋叶（陶土）
  const leafPts = [
    new THREE.Vector2(0, -1.2),
    new THREE.Vector2(-0.5, -0.78),
    new THREE.Vector2(-0.84, -0.26),
    new THREE.Vector2(-0.8, 0.3),
    new THREE.Vector2(-0.46, 0.86),
    new THREE.Vector2(-0.14, 1.3),
    new THREE.Vector2(0, 1.48),
    new THREE.Vector2(0.2, 1.26),
    new THREE.Vector2(0.5, 0.8),
    new THREE.Vector2(0.74, 0.32),
    new THREE.Vector2(0.56, -0.32),
    new THREE.Vector2(0.26, -0.9),
    new THREE.Vector2(0, -1.2),
  ];
  const leaf = makePaper(leafPts, {
    color: '#D68A55', name: '纸片·秋叶', x: 1.3, z: 1.1,
    rotZ: 0.18, scale: 1.15, depth: 0.2,
  });

  // 苔痕（苔绿）
  const blobSeed = 3.7;
  const blobPts = (() => {
    const pts = [];
    const n = 15;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 0.92 + 0.17 * Math.sin(blobSeed * 3 + i * 2.4) + 0.15 * Math.sin(blobSeed * 7 + i * 1.3);
      pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r * 1.12));
    }
    pts.push(pts[0].clone());
    return pts;
  })();
  const moss = makePaper(blobPts, {
    color: '#7A8B5C', name: '纸片·苔痕', x: -1.5, z: 1.25,
    rotZ: -0.32, scale: 1.0, depth: 0.14,
  });

  // 底图（山影）：有白边的照片打印件
  const sketchTex = makeSketchTexture();
  const photoGeo = new THREE.BoxGeometry(2.7, 0.05, 1.95);
  const photoMatSide = new THREE.MeshStandardMaterial({ color: '#F3E7D0', roughness: 0.8 });
  const photoMatTop = new THREE.MeshStandardMaterial({ map: sketchTex, roughness: 0.78, metalness: 0 });
  const photo = new THREE.Mesh(photoGeo, [photoMatSide, photoMatSide, photoMatTop, photoMatSide, photoMatSide, photoMatSide]);
  photo.castShadow = true;
  photo.receiveShadow = true;
  const photoBaseY = TABLE_TOP + 0.05 / 2;
  photo.position.set(0.1, photoBaseY, -1.45);
  photo.rotation.z = 0.02;
  photo.scale.setScalar(1.25);
  photo.userData = {
    kind: 'photo', depth: 0.05, baseY: photoBaseY, rotZ: 0.02, scale: 1.25,
    color: null, name: '底图·山影', defX: 0.1, defZ: -1.45, opacity: 1,
  };
  scene.add(photo);

  // 选中环
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.24, 64),
    new THREE.MeshBasicMaterial({ color: '#5A4634', transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = TABLE_TOP + 0.008;
  ring.visible = false;
  scene.add(ring);

  const papers = [leaf, moss, photo];
  papers.forEach((p) => scene.add(p));

  /* ---------- 桌面文具道具 ---------- */
  // 和纸胶带（卷）
  const tape = new THREE.Group();
  const tapeRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.13, 14, 44),
    new THREE.MeshStandardMaterial({ color: '#7A8B5C', roughness: 0.85 })
  );
  tapeRing.rotation.x = Math.PI / 2;
  const tapeCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.27, 0.26, 26),
    new THREE.MeshStandardMaterial({ color: '#E8D5B0', roughness: 0.9 })
  );
  tape.add(tapeRing, tapeCore);
  tape.position.set(3.4, 0.17 + 0.13, 4.0);
  tape.rotation.z = 0.42;
  tape.rotation.x = 0.02;
  tape.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  scene.add(tape);

  // 木杆铅笔
  const pencil = new THREE.Group();
  const pBody = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.1, 0.1),
    new THREE.MeshStandardMaterial({ color: '#C98A4B', roughness: 0.5 })
  );
  const pTip = new THREE.Mesh(
    new THREE.ConeGeometry(0.075, 0.3, 12),
    new THREE.MeshStandardMaterial({ color: '#D9A15A', roughness: 0.55 })
  );
  pTip.rotation.z = -Math.PI / 2; // 尖端朝 +X
  pTip.position.x = 1.35;
  const pLead = new THREE.Mesh(
    new THREE.ConeGeometry(0.022, 0.06, 8),
    new THREE.MeshStandardMaterial({ color: '#3A2E24', roughness: 0.35 })
  );
  pLead.rotation.z = -Math.PI / 2;
  pLead.position.x = 1.56;
  pencil.add(pBody, pTip, pLead);
  pencil.position.set(-3.7, 0.17 + 0.05, 3.7);
  pencil.rotation.y = 0.55;
  pencil.rotation.z = -0.05;
  pencil.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  scene.add(pencil);

  // 高光纸屑（不可交互的装饰）
  const scrapSeed = 9.1;
  const scrapPts = (() => {
    const pts = [];
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 0.5 + 0.13 * Math.sin(scrapSeed * 3 + i * 2.1) + 0.11 * Math.sin(scrapSeed * 5 + i * 1.7);
      pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r * 1.05));
    }
    pts.push(pts[0].clone());
    return pts;
  })();
  const scrap = makePaper(scrapPts, {
    color: '#E8D5B0', name: '', x: 2.3, z: 2.7, rotZ: 0.55, scale: 0.52, depth: 0.06,
  });
  scene.add(scrap);

  /* ---------- 7. 交互 ---------- */
  let tool = 'arrange';
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const _v = new THREE.Vector3();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let hovered = null;
  let dragging = null;
  let selected = leaf;
  let lockedSet = new Set();
  const paperMeshes = papers; // raycast targets

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function depthOf(p) { return p.userData.depth; }
  function baseY(p) { return p.userData.baseY; }
  function targetY(p) { return baseY(p) + (p === selected ? 0.05 : 0); }

  function setHover(p) {
    if (hovered === p) return;
    if (hovered && hovered !== selected && !dragging) {
      gsap.to(hovered.position, { y: baseY(hovered), duration: 0.3, ease: 'paperSettle' });
    }
    hovered = p;
    if (p && p !== selected && !dragging && tool === 'arrange') {
      gsap.to(p.position, { y: baseY(p) + 0.08, duration: 0.25, ease: 'paperLift' });
    }
    container.style.cursor = p ? 'grab' : (tool === 'arrange' ? 'grab' : 'default');
  }

  function onPointerMove(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    pointerTarget.set(ndc.x, ndc.y);

    if (dragging) {
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.ray.intersectPlane(dragPlane, _v);
      if (hit) {
        dragging.userData.qx(clamp(hit.x, -9, 9));
        dragging.userData.qz(clamp(hit.z, -6, 6));
      }
      return;
    }
    if (tool !== 'arrange') { setHover(null); return; }
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(paperMeshes, false);
    setHover(hits.length ? hits[0].object : null);
  }

  function onPointerDown(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(paperMeshes, false);
    if (!hits.length) { selectPaper(null); return; }
    const p = hits[0].object;
    if (lockedSet.has(p)) return;
    selectPaper(p);
    if (tool === 'arrange') {
      dragging = p;
      ring.visible = false;
      const liftY = baseY(p) + depthOf(p) * 0.5 + 0.52;
      dragPlane.constant = -liftY;
      if (!p.userData.qx) p.userData.qx = gsap.quickTo(p.position, 'x', { duration: 0.16, ease: 'power2.out' });
      if (!p.userData.qz) p.userData.qz = gsap.quickTo(p.position, 'z', { duration: 0.16, ease: 'power2.out' });
      if (reducedMotion) {
        p.position.y = liftY;
      } else {
        gsap.to(p.position, { y: liftY, duration: 0.28, ease: 'paperLift' });
        gsap.to(p.rotation, { x: -0.16, z: p.userData.rotZ * 0.55 + 0.06, duration: 0.28, ease: 'paperLift' });
      }
      renderer.domElement.setPointerCapture(e.pointerId);
    }
  }

  function onPointerUp() {
    if (!dragging) return;
    const p = dragging;
    dragging = null;
    if (reducedMotion) {
      p.position.y = targetY(p);
      p.rotation.x = 0;
    } else {
      gsap.to(p.position, { y: targetY(p), duration: 0.42, ease: 'paperSettle' });
      gsap.to(p.rotation, { x: 0, z: p.userData.rotZ, duration: 0.42, ease: 'paperSettle' });
    }
    if (hovered !== p) setHover(null);
  }

  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);
  renderer.domElement.addEventListener('pointerleave', () => { setHover(null); });

  /* ---------- 8. 视差（鼠标） ---------- */
  const pointerTarget = new THREE.Vector2(0, 0);
  function parallax() {
    if (reducedMotion) return;
    camera.position.x += (pointerTarget.x * 0.55 - camera.position.x) * 0.035;
    camera.position.y += (5.1 - pointerTarget.y * 0.4 - camera.position.y) * 0.035;
    camera.lookAt(0, 0.18, -0.4);
  }

  /* ---------- 9. 渲染循环 ---------- */
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(() => resize());
  ro.observe(container);

  /* ---------- 3D 选中浮签 ---------- */
  const paperTag = document.getElementById('paper-tag');
  const ptName = document.getElementById('pt-name');
  function updateTag() {
    if (!paperTag || !selected || !ring.visible) { if (paperTag) paperTag.hidden = true; return; }
    const v = selected.position.clone();
    v.y += 0.32;
    const ndc = v.project(camera);
    if (ndc.z > 1 || Math.abs(ndc.x) > 1.25 || Math.abs(ndc.y) > 1.25) { paperTag.hidden = true; return; }
    const x = (ndc.x + 1) / 2 * container.clientWidth;
    const y = (1 - ndc.y) / 2 * container.clientHeight;
    paperTag.hidden = false;
    paperTag.style.left = x + 'px';
    paperTag.style.top = y + 'px';
    ptName.textContent = selected.userData.name || '纸片';
  }

  function tick() {
    requestAnimationFrame(tick);
    parallax();
    updateTag();
    renderer.render(scene, camera);
  }
  tick();

  /* ---------- 10. 入场动画 ---------- */
  function entrance() {
    if (reducedMotion) {
      camera.position.set(0, 5.1, 8.8);
      return;
    }
    // 界面元素入场
    gsap.from('.tool-item', { y: 8, opacity: 0, duration: 0.42, ease: 'woodGlide', stagger: 0.05, delay: 0.2 });
    gsap.from('.layer-item', { y: 10, opacity: 0, duration: 0.5, ease: 'woodGlide', stagger: 0.08, delay: 0.34 });
    gsap.from('.swatch', { y: 6, opacity: 0, duration: 0.4, ease: 'woodGlide', stagger: 0.03, delay: 0.5 });
    papers.forEach((p) => {
      const base = baseY(p);
      gsap.fromTo(p.position,
        { y: base + 1.6, x: p.position.x + 0.5, z: p.position.z - 0.3 },
        { y: base, x: p.userData.defX, z: p.userData.defZ, duration: 1.0, ease: 'paperSettle', delay: 0.15 });
      gsap.from(p.rotation, { z: p.userData.rotZ + 0.5, duration: 1.0, ease: 'paperSettle', delay: 0.15 });
    });
    gsap.from(camera.position, { z: 11.5, duration: 1.3, ease: 'woodGlide', delay: 0.05 });
  }

  /* ---------- 11. UI 联动 ---------- */
  const ui = {
    layerItems: [...document.querySelectorAll('.layer-item')],
    swatches: [...document.querySelectorAll('.swatch')],
    mbColors: [...document.querySelectorAll('.mb-color')],
    textureItems: [...document.querySelectorAll('.texture-item')],
    tabs: [...document.querySelectorAll('.tab')],
    panels: [...document.querySelectorAll('.tab-panel')],
    tools: [...document.querySelectorAll('[data-tool].tool-item, [data-tool].mb-tool')],
    selLabel: document.getElementById('sel-label'),
    activeSwatchInfo: document.querySelector('.active-swatch-info'),
    asiSwatch: document.querySelector('.asi-swatch'),
    customColor: document.getElementById('custom-color'),
    ccHex: document.querySelector('.cc-hex'),
    propX: document.getElementById('prop-x'),
    propY: document.getElementById('prop-y'),
    propRot: document.getElementById('prop-rot'),
    propScale: document.getElementById('prop-scale'),
    propOp: document.getElementById('prop-opacity'),
    propTh: document.getElementById('prop-thickness'),
    resetProps: document.getElementById('reset-props'),
  };

  const SWATCH_COLORS = {
    '#F3E7D0': '暖纸', '#D68A55': '陶土', '#7A8B5C': '苔绿',
    '#5A4634': '墨褐', '#E8D5B0': '高光', '#8C5A2E': '木色',
  };

  function syncSwatch(color) {
    ui.swatches.forEach((s) => {
      const on = s.dataset.color.toLowerCase() === color.toLowerCase();
      s.classList.toggle('is-active', on);
      s.setAttribute('aria-pressed', String(on));
    });
    ui.mbColors.forEach((c) => {
      const on = c.dataset.color.toLowerCase() === color.toLowerCase();
      c.classList.toggle('is-active', on);
      c.setAttribute('aria-pressed', String(on));
    });
    const name = SWATCH_COLORS[color.toUpperCase()] || '自定';
    if (ui.activeSwatchInfo) {
      ui.asiSwatch.style.setProperty('--c', color);
      ui.activeSwatchInfo.innerHTML = `当前纸片 <b>${name}</b>`;
    }
    if (ui.ccHex) ui.ccHex.textContent = color.toUpperCase();
    ui.customColor.value = color;
  }

  function setPaperColor(p, hex) {
    if (p.userData.kind !== 'paper') return;
    p.userData.color = hex;
    const mats = Array.isArray(p.material) ? p.material : [p.material];
    mats[0].color.set(hex);
    if (mats[1]) mats[1].color.set(new THREE.Color(hex).multiplyScalar(0.45));
    // 同步图层缩略图
    const li = ui.layerItems[papers.indexOf(p)];
    if (li) {
      const svgPath = li.querySelector('.layer-thumb path');
      if (svgPath) svgPath.setAttribute('fill', hex);
    }
  }

  function syncPropsFromPaper(p) {
    const z = p.position.z;
    ui.propX.value = p.position.x.toFixed(2);
    ui.propY.value = z.toFixed(2);
    ui.propRot.value = Math.round((p.rotation.z * 180) / Math.PI);
    ui.propScale.value = p.userData.scale.toFixed(2);
    ui.propOp.value = p.userData.opacity.toFixed(2);
    ui.propTh.value = p.userData.depth.toFixed(3);
    emitOutputs();
  }

  function emitOutputs() {
    document.querySelectorAll('.prop-row').forEach((row) => {
      const input = row.querySelector('input');
      const out = row.querySelector('output');
      if (!input || !out) return;
      const id = input.id;
      if (id === 'prop-rot') out.textContent = `${input.value}°`;
      else if (id === 'prop-opacity') out.textContent = `${Math.round(input.value * 100)}%`;
      else out.textContent = Number(input.value).toFixed(2);
    });
  }

  function selectPaper(p) {
    selected = p;
    // 环
    ring.visible = !!p;
    if (p) {
      const r = p.userData.kind === 'photo' ? 1.5 : p.userData.scale * 1.35;
      ring.scale.setScalar(r);
      ring.position.x = p.position.x;
      ring.position.z = p.position.z;
      if (!reducedMotion) gsap.fromTo(ring.scale, { x: r * 0.7, y: r * 0.7 }, { x: r, y: r, duration: 0.4, ease: 'paperSettle' });
    }
    // 图层高亮
    ui.layerItems.forEach((li, i) => {
      const on = papers[i] === p;
      li.classList.toggle('is-active', on);
      li.setAttribute('aria-selected', String(on));
    });
    // 标签
    if (ui.selLabel) ui.selLabel.textContent = p ? `选中：${p.userData.name}` : '选中：无';
    // 属性滑杆
    if (p) syncPropsFromPaper(p);
    // 色板
    if (p && p.userData.color) syncSwatch(p.userData.color);
    // 锁定态：禁用滑杆
    const locked = p && lockedSet.has(p);
    ['propX', 'propY', 'propRot', 'propScale', 'propOp', 'propTh'].forEach((k) => {
      ui[k].disabled = locked || !p;
    });
    // 未选中时把其他纸片归位
    papers.forEach((op) => {
      if (op !== p && op !== dragging) {
        const ty = baseY(op);
        if (Math.abs(op.position.y - ty) > 0.001 && !reducedMotion) gsap.to(op.position, { y: ty, duration: 0.3, ease: 'paperSettle' });
        else if (reducedMotion) op.position.y = ty;
      }
    });
  }

  // 工具切换
  function setTool(t) {
    tool = t;
    ui.tools.forEach((b) => {
      const on = b.dataset.tool === t;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    container.style.cursor = t === 'arrange' ? 'grab' : 'default';
    setHover(null);
  }
  ui.tools.forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));

  // 图层
  ui.layerItems.forEach((li) => li.addEventListener('click', () => {
    const p = papers[Number(li.dataset.layer)];
    if (p && !lockedSet.has(p)) selectPaper(p);
  }));

  // 眼睛（可见性）
  document.querySelectorAll('.layer-acts .icon-btn[aria-label^="隐藏"]').forEach((btn, i) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = papers[i];
      p.visible = !p.visible;
      btn.setAttribute('aria-pressed', String(p.visible));
      if (!p.visible && selected === p) selectPaper(null);
    });
  });
  // 锁
  document.querySelectorAll('.layer-acts .icon-btn[aria-label^="锁定"]').forEach((btn, i) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = papers[i];
      if (lockedSet.has(p)) lockedSet.delete(p); else lockedSet.add(p);
      btn.setAttribute('aria-pressed', String(lockedSet.has(p)));
      btn.style.opacity = lockedSet.has(p) ? '1' : '';
      if (selected === p) selectPaper(p);
    });
  });

  // 色板
  ui.swatches.forEach((s) => s.addEventListener('click', () => {
    if (selected && selected.userData.kind === 'paper') setPaperColor(selected, s.dataset.color);
    syncSwatch(s.dataset.color);
  }));
  ui.mbColors.forEach((c) => c.addEventListener('click', () => {
    if (selected && selected.userData.kind === 'paper') setPaperColor(selected, c.dataset.color);
    syncSwatch(c.dataset.color);
  }));
  ui.customColor.addEventListener('input', () => {
    if (selected && selected.userData.kind === 'paper') setPaperColor(selected, ui.customColor.value);
    syncSwatch(ui.customColor.value);
  });

  // 纹理
  ui.textureItems.forEach((it) => it.addEventListener('click', () => {
    ui.textureItems.forEach((o) => {
      const on = o === it;
      o.classList.toggle('is-active', on);
      o.setAttribute('aria-pressed', String(on));
    });
    const tex = makeRoughnessTexture(it.dataset.texture);
    papers.forEach((p) => {
      if (p.userData.kind !== 'paper') return;
      const mats = Array.isArray(p.material) ? p.material : [p.material];
      mats[0].roughnessMap = tex;
      mats[0].bumpMap = tex;
      mats[0].needsUpdate = true;
    });
  }));

  // 属性滑杆
  function bindProp(input, apply) {
    input.addEventListener('input', () => {
      if (!selected || lockedSet.has(selected)) return;
      apply(selected, parseFloat(input.value));
      emitOutputs();
    });
  }
  bindProp(ui.propX, (p, v) => {
    p.position.x = v;
    ring.position.x = v;
  });
  bindProp(ui.propY, (p, v) => {
    p.position.z = v;
    ring.position.z = v;
  });
  bindProp(ui.propRot, (p, v) => {
    const rad = (v * Math.PI) / 180;
    p.rotation.z = rad;
    p.userData.rotZ = rad;
  });
  bindProp(ui.propScale, (p, v) => {
    p.scale.setScalar(v);
    p.userData.scale = v;
    const li = ui.layerItems[papers.indexOf(p)];
    if (li) {
      const sub = li.querySelector('.layer-sub');
      if (sub) sub.textContent = `${p.userData.kind === 'photo' ? '照片底图' : (SWATCH_COLORS[p.userData.color] || '纸片')} · 缩放 ${v.toFixed(2)}`;
    }
    if (p === selected) {
      ring.scale.setScalar(p.userData.kind === 'photo' ? 1.5 : v * 1.35);
    }
  });
  bindProp(ui.propOp, (p, v) => {
    p.userData.opacity = v;
    const mats = Array.isArray(p.material) ? p.material : [p.material];
    mats.forEach((m) => { m.transparent = true; m.opacity = v; });
  });
  bindProp(ui.propTh, (p, v) => {
    if (p.userData.kind !== 'paper') return;
    const oldDepth = p.userData.depth;
    p.userData.depth = v;
    p.userData.baseY = TABLE_TOP + v / 2;
    rebuildPaper(p, v);
  });

  function rebuildPaper(p, depth) {
    const pts = p.userData.pts;
    if (!pts) return;
    const shape = shapeFromPts(pts);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.008,
      bevelSegments: 2, curveSegments: 28,
    });
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    const oldPos = p.position.clone();
    const oldRot = p.rotation.clone();
    p.geometry.dispose();
    p.geometry = geo;
    p.position.copy(oldPos);
    p.position.y = targetY(p);
    p.rotation.copy(oldRot);
  }
  leaf.userData.pts = leafPts;
  moss.userData.pts = blobPts;

  // 重置属性
  ui.resetProps.addEventListener('click', () => {
    if (!selected) return;
    const p = selected;
    const d = p.userData;
    gsap.to(p.position, { x: d.defX, z: d.defZ, duration: 0.5, ease: 'woodGlide' });
    gsap.to(p.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'woodGlide' });
    p.userData.scale = 1;
    if (p.userData.kind === 'paper') {
      gsap.to(p.rotation, { z: d.defRotZ ?? 0, duration: 0.5, ease: 'woodGlide' });
      p.userData.rotZ = d.defRotZ ?? 0;
      rebuildPaper(p, d.defDepth ?? 0.09);
    }
    p.userData.opacity = 1;
    const mats = Array.isArray(p.material) ? p.material : [p.material];
    mats.forEach((m) => { m.opacity = 1; m.transparent = false; });
    syncPropsFromPaper(p);
  });

  // 标签切换
  ui.tabs.forEach((tab) => tab.addEventListener('click', () => {
    ui.tabs.forEach((t) => {
      const on = t === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    ui.panels.forEach((panel) => {
      const on = panel.dataset.panel === tab.dataset.tab;
      panel.classList.toggle('is-active', on);
      panel.hidden = !on;
    });
  }));

  // 缩放
  let zoomLevel = 1;
  const zoomChip = document.querySelector('.canvas-status .chip:first-child');
  document.querySelectorAll('.zoom-btn').forEach((btn) => btn.addEventListener('click', () => {
    const dz = Number(btn.dataset.zoom);
    if (dz === 0) zoomLevel = 1;
    else zoomLevel = clamp(zoomLevel + dz * 0.12, 0.7, 1.5);
    const targetZ = 8.4 / zoomLevel;
    gsap.to(camera.position, { z: targetZ, duration: 0.55, ease: 'woodGlide' });
    if (zoomChip) zoomChip.textContent = `画布 ${Math.round(zoomLevel * 100)}%`;
  }));

  /* ---------- 12. 纹理预览（右栏小图） ---------- */
  document.querySelectorAll('.texture-canvas').forEach((cv) => {
    const g = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    // 先铺纸色
    g.fillStyle = '#F6EBD5';
    g.fillRect(0, 0, w, h);
    const v = cv.dataset.tex;
    if (v === 'plain') fibers(g, w, h, { density: 0.1, dark: '90,70,52', light: '255,255,255' });
    else if (v === 'grain') speckles(g, w, h, { density: 1.4 });
    else if (v === 'fiber') {
      for (let i = 0; i < 26; i++) {
        const y = Math.random() * h;
        g.strokeStyle = Math.random() < 0.5 ? 'rgba(90,70,52,0.12)' : 'rgba(255,255,255,0.14)';
        g.lineWidth = 0.7;
        g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (Math.random() - 0.5) * 8); g.stroke();
      }
    }
    else if (v === 'wash') washBlots(g, w, h);
    else if (v === 'linen') linenWeave(g, w, h);
  });

  /* ---------- 13. 启动 ---------- */
  selectPaper(leaf);
  syncSwatch('#D68A55');
  entrance();

  // 调试句柄（诊断用）
  window.__PD = { scene, camera, renderer, papers, table, ring };
})();
